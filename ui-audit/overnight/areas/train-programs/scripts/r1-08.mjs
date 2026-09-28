// train-programs-r1-08: reload mid-Enroll submit — no partially-written
// enrollment row.
import { start, log, cleanupCase, appendFinding, seedProgram } from './_lib.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-08';
const NN = '08';

let s;
try {
  const { program } = await seedProgram(NN, {
    days: [{ day_index: 1, title: 'Day 1', exercises: [{ name: `OVN-tp-${NN} Bench`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 }] }],
  });

  s = await start(`/program/${program.id}`);
  // Delay the enrollment insert/update so we can reload before it lands.
  await s.page.route('**/rest/v1/program_enrollments*', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });

  await s.page.getByRole('button', { name: 'Start Program' }).nth(1).click();
  await s.page.waitForTimeout(500);
  await s.page.locator('input[type=number]').first().fill('135');
  await s.page.getByRole('button', { name: /Start Program|Starting/ }).last().click();
  await s.page.waitForTimeout(600); // request in flight, delayed by the route
  await s.page.reload();
  await s.page.waitForTimeout(2500);

  const db = await testDb();
  const { data: enrs } = await db.from('program_enrollments').select('*').eq('program_id', program.id);
  const n = enrs?.length || 0;
  const partial = enrs?.some((e) => !e.progression_state || !e.status || e.current_day_index == null);
  const clean = n === 0 || (n === 1 && !partial);

  log(clean, CASE, `enrollments=${n} partial=${partial} rows=${JSON.stringify(enrs)}`);

  await appendFinding({
    id: CASE, severity: clean ? 'none' : 'data-loss', route: `/program/${program.id}`,
    title: 'Reload mid-Enroll submit does not leave a partially-written enrollment row',
    steps: 'Open Enroll dialog, fill a weight, delay the program_enrollments network call ~3s, tap Start Program, reload after 600ms (request still in flight).',
    expected: "Either no enrollment exists after reload (clean, retry works) or it exists complete with all progression_state fields populated -- never a partial row.",
    actual: clean
      ? `Clean: ${n} enrollment row(s) after reload, none partial. useEnrollInProgram (useProgramQueries.js:183-240) is a single atomic insert/update at the DB layer -- a reload before the response returns just orphans the in-flight browser request; Supabase still completes or fails the write server-side without a torn row.`
      : `${n} enrollment(s), partial=${partial}: ${JSON.stringify(enrs)}`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-08.mjs',
    evidence: `program_enrollments rows after reload: ${JSON.stringify(enrs)}`,
    suspectFile: 'src/hooks/useProgramQueries.js:183-240',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
