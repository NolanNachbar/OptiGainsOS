// train-programs-r1-02: double-tap Create Program fires two overlapping
// create-mutations (handleSubmit has no isPending-disable check before the
// second click). Uses stripNotesRoute since create is otherwise fully
// blocked by the notes migration -- documented in evidence.
import { start, log, cleanupCase, appendFinding, stripNotesRoute, tag, dismissKeyboard } from './_lib.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'train-programs-r1-02';
const NN = '02';
const TITLE = `OVN-train-programs-r1-${NN}`;

let s;
try {
  s = await start('/program-builder');
  await stripNotesRoute(s.page);
  await s.page.waitForTimeout(1500);

  await s.page.getByLabel(/Program Name|Name/i).first().fill(TITLE).catch(async () => {
    await s.page.locator('input[type=text]').first().fill(TITLE);
  });
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Next' }).click();
  await s.page.waitForTimeout(600);

  // Cycle Days step: fill day 1 & 2 with an exercise so validation passes.
  const day1 = s.page.getByText('Day 1', { exact: true }).first();
  await day1.click().catch(() => {});
  await s.page.waitForTimeout(400);
  const addExerciseBtn = s.page.getByRole('button', { name: /Add Exercise/i }).first();
  if (await addExerciseBtn.isVisible().catch(() => false)) {
    await addExerciseBtn.click();
    await s.page.waitForTimeout(300);
    const nameInput = s.page.locator('input[placeholder*=Exercise], input[placeholder*=exercise]').first();
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill(`${TITLE} Bench`);
  }
  await dismissKeyboard(s.page);

  await s.page.getByRole('button', { name: 'Next' }).click().catch(() => {});
  await s.page.waitForTimeout(500);
  await s.page.getByRole('button', { name: 'Next' }).click().catch(() => {});
  await s.page.waitForTimeout(500);

  const bodyBeforeSave = await s.page.locator('body').innerText();
  const onConfirm = /Confirm/.test(bodyBeforeSave);

  const createBtn = s.page.getByRole('button', { name: /Create Program|Saving/ });
  // Fire two near-simultaneous native clicks, no await between, before the
  // first request's response returns.
  const c1 = createBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const c2 = createBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  await Promise.all([c1, c2]);
  await s.page.waitForTimeout(3000);

  const problems = s.problems.filter((p) => p.type === 'pageerror');
  const db = await testDb();
  const uid = await testUserId();
  const { data: progs } = await db.from('programs').select('id, title').eq('created_by', uid).ilike('title', `${TITLE}%`);
  const progCount = progs?.length || 0;
  let pwCounts = [];
  if (progCount > 0) {
    for (const p of progs) {
      const { data: pw } = await db.from('program_workouts').select('id').eq('program_id', p.id);
      pwCounts.push(pw?.length || 0);
    }
  }

  const duplicated = progCount > 1;
  const pass = !duplicated && problems.length === 0;
  log(pass, CASE, `onConfirm=${onConfirm} progCount=${progCount} pwCounts=${JSON.stringify(pwCounts)} problems=${problems.length}`);

  await appendFinding({
    id: CASE,
    severity: duplicated ? 'no-undo' : 'none',
    route: '/program-builder',
    title: "Double-tapping 'Create Program' with no isPending guard",
    steps: 'Build a minimal 2-day program in the wizard (with the notes-migration workaround applied via page.route so create actually succeeds), reach Confirm, fire two near-simultaneous native clicks on Create Program before the first response returns.',
    expected: 'Exactly one Program row results, with one complete set of program_workouts days -- no duplicate program from a second overlapping mutation.',
    actual: duplicated
      ? `CONFIRMED: ${progCount} tagged Program rows created from one double-tap (program_workouts counts per program: ${JSON.stringify(pwCounts)}). handleSubmit (ProgramBuilder.jsx:449-471) has no disabled-guard before the button's own disabled={createMutation.isPending} takes effect client-side -- the two native clicks landed close enough together that both fired createMutation.mutate before the first isPending re-render committed, same shape as fuel's WeeklyPlanCard double-approve (fuel-r1-10) and train-programs-r1-07 (Pause/Resume).`
      : `${progCount} tagged Program row(s) after the double-tap -- the button's disabled={createMutation.isPending} (ProgramBuilder.jsx ~683) was fast enough in this run to swallow the second click before a duplicate request landed. No pageerror.`,
    repro: 'ui-audit/overnight/areas/train-programs/scripts/r1-02.mjs',
    evidence: `progs: ${JSON.stringify(progs)}, pwCounts: ${JSON.stringify(pwCounts)}. Tested with stripNotesRoute applied to bypass the unrelated PGRST204 notes bug (migration 20260928000000 not applied on hosted) so the create path could actually be exercised.`,
    suspectFile: 'src/pages/ProgramBuilder.jsx:425-475 (handleSubmit), :665-693 (Create Program button, disabled={createMutation.isPending})',
  });
} finally {
  const db = await testDb();
  const uid = await testUserId();
  const { data: progs } = await db.from('programs').select('id').eq('created_by', uid).ilike('title', `${TITLE}%`);
  if (progs?.length) {
    const ids = progs.map((p) => p.id);
    await db.from('program_workouts').delete().in('program_id', ids);
    await db.from('program_enrollments').delete().in('program_id', ids);
    await db.from('programs').delete().in('id', ids);
  }
  console.log(`CLEANUP ${CASE} deletedPrograms=${progs?.length || 0}`);
  if (s) await s.close();
}
