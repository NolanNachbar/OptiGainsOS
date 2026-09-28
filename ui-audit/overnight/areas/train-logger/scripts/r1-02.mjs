// train-logger-r1-02: Double-tap Finish confirm in the post-workout dialog.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, benchExercise, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-02';
let workout, s;
try {
  workout = await makeWorkout(CASE, benchExercise(1));
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '135');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '5');
  await checkSet(s.page, 1);

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  await s.page.getByRole('button', { name: 'Log Workout' }).waitFor({ state: 'visible' });

  // Fire two near-simultaneous native clicks on the DOM node directly (bypasses
  // Playwright's per-action actionability re-check, which would otherwise see
  // the button disabled after the first click and refuse the second).
  const clicked = await s.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Log Workout' || b.textContent.trim() === 'Saving...');
    if (!btn) return 'not-found';
    btn.click();
    btn.click();
    return 'double-clicked';
  });
  await s.page.waitForTimeout(2500);
  await snap(s.page, 'r1-02-after-doubletap');

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;

  const rpt = await report(s);
  const ok = logs?.length === 1;
  log(ok, CASE, `clicked=${clicked} workout_logs rows=${logs?.length ?? 0} problems=${JSON.stringify(rpt.problems)}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: expected exactly 1 workout_logs row after double-tap, got ${logs?.length ?? 0}. ids=${logs?.map(l => l.id).join(',')}`);
  }
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
