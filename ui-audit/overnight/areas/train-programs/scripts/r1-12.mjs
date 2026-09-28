// train-programs-r1-12: Enroll with starting weight 0 and negative for the
// same program — confirm both are silently skipped in progression_state, and
// a negative value can't slip through as a raw negative working_weight.
import { start, log, cleanupCase, appendFinding, seedProgram } from './_lib.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-12';
const NN = '12';

let s;
try {
  const { program } = await seedProgram(NN, {
    days: [{ day_index: 1, title: 'Day 1', exercises: [
      { name: `OVN-tp-${NN} Bench`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 },
      { name: `OVN-tp-${NN} Row`, sets: 3, rep_target: '5', rir_target: 2, rest_seconds: 90 },
    ] }],
  });

  s = await start(`/program/${program.id}`);
  // Two "Start Program" buttons render: the fixed mobile bottom-CTA (DOM-first,
  // but sits under the bottom nav dock and doesn't reliably register a click)
  // and the header CTA. Use the header one.
  await s.page.getByRole('button', { name: 'Start Program' }).nth(1).click();
  await s.page.waitForTimeout(600);

  const benchInput = s.page.locator('input[type=number]').first();
  const rowInput = s.page.locator('input[type=number]').nth(1);
  await benchInput.fill('0');
  const negAccepted = await rowInput.fill('-50').then(() => true).catch(() => false);
  const rowVal = await rowInput.inputValue();

  await s.page.getByRole('button', { name: /Start Program|Starting/ }).last().click();
  await s.page.waitForTimeout(1200);

  const db = await testDb();
  const { data: enr } = await db.from('program_enrollments').select('*').eq('program_id', program.id).single();
  const state = enr?.progression_state || {};
  const benchEntry = state[`OVN-tp-${NN} Bench`];
  const rowEntry = state[`OVN-tp-${NN} Row`];
  const bothSkipped = !benchEntry && !rowEntry;
  const negativeLeaked = rowEntry && rowEntry.working_weight < 0;

  const pass = bothSkipped && !negativeLeaked;
  log(pass, CASE, `rowInputAccepted=${rowVal} bothSkipped=${bothSkipped} negativeLeaked=${negativeLeaked} state=${JSON.stringify(state)}`);

  await appendFinding({
    id: CASE, severity: pass ? 'none' : 'engine', route: `/program/${program.id}`,
    title: 'Enroll with starting weight 0 and negative — progression_state handling',
    steps: 'Open Enroll dialog, enter 0 for one exercise and -50 for another, confirm enroll, read back progression_state.',
    expected: 'Per useProgramQueries.js:191 (if weight > 0), both 0 and negative should be silently skipped (no progression_state entry).',
    actual: pass
      ? `Both skipped as expected. progression_state=${JSON.stringify(state)}. The number input DOES accept a "-" (rowInput.inputValue()=${rowVal}), reaching the weight>0 guard client-side, which correctly filters it — so the guard is load-bearing, not redundant.`
      : `bothSkipped=${bothSkipped} negativeLeaked=${negativeLeaked} state=${JSON.stringify(state)}`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-12.mjs',
    evidence: `enrollment.progression_state after enroll: ${JSON.stringify(state)}`,
    suspectFile: 'src/hooks/useProgramQueries.js:190-201',
  });
} finally {
  const del = await cleanupCase(NN);
  console.log(`CLEANUP ${CASE} ${JSON.stringify(del)}`);
  if (s) await s.close();
}
