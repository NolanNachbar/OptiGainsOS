// train-logger-r1-13: 40 sets on one exercise — no crash, no truncation, no
// silent cap.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-13';
let workout, s;
try {
  workout = await makeWorkout(CASE, [{
    name: 'OVN-r1-13 Test Lift',
    sets: [{ set_number: 1, weight: null, reps: null, completed: false }],
  }]);
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  for (let i = 0; i < 39; i++) {
    await s.page.getByRole('button', { name: 'Add Set' }).first().click();
    await s.page.waitForTimeout(60);
  }
  await s.page.waitForTimeout(500);
  await snap(s.page, 'r1-13-40-sets-added');

  const labelCount = await s.page.locator('[aria-label*="weight in"]').count();

  // Mark all 40 complete with varying weight/reps (fast, scripted).
  for (let n = 1; n <= 40; n++) {
    await s.page.locator(`[aria-label^="Set ${n} weight in"]`).fill(String(100 + n));
    await s.page.locator(`[aria-label="Set ${n} reps"]`).fill(String(5 + (n % 5)));
    await s.page.waitForTimeout(80);
    await s.page.locator(`[aria-label="Mark set ${n} complete"]`).click();
    await s.page.waitForTimeout(80);
  }
  await s.page.waitForTimeout(1000);
  await snap(s.page, 'r1-13-40-sets-completed');

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  const incomplete = s.page.getByText('Incomplete Sets');
  if (await incomplete.isVisible({ timeout: 2000 }).catch(() => false)) {
    await s.page.getByRole('button', { name: 'Leave As-Is' }).click();
  }
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(2000);

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const sets = logs?.[0]?.exercises?.[0]?.sets ?? [];
  const setNumbers = sets.map((st) => st.set_number);
  const sequential = setNumbers.every((n, i) => n === i + 1);
  const allCompleted = sets.every((st) => st.completed);

  const rpt = await report(s);
  const ok = labelCount === 40 && logs?.length === 1 && sets.length === 40 && sequential && allCompleted;
  log(ok, CASE, `uiLabelCount=${labelCount} workout_logs rows=${logs?.length} sets.length=${sets.length} sequential=${sequential} allCompleted=${allCompleted} problems=${rpt.problems.length}`);
  if (!allCompleted) console.log('INCOMPLETE_SETS ' + JSON.stringify(sets.filter((st) => !st.completed)));
  if (!ok) console.log(`FINDING ${CASE}: expected 40 sets end-to-end, got uiLabelCount=${labelCount} savedSets=${sets.length} sequential=${sequential} allCompleted=${allCompleted}`);
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
