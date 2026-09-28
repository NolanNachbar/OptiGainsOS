// train-logger-r1-01: Weight typo 1710 instead of 171 is saved with no clamp or warning.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, benchExercise, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-01';
let workout, s;
try {
  workout = await makeWorkout(CASE, benchExercise(1));
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '1710');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '8');
  await checkSet(s.page, 1);
  await snap(s.page, 'r1-01-before-finish');

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(1500);

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;

  const rpt = await report(s);
  const savedWeight = logs?.[0]?.exercises?.[0]?.sets?.[0]?.weight;
  const ok = logs?.length === 1 && (savedWeight !== 1710); // expected: rejected/clamped/flagged, not silently 1710
  log(ok, CASE, `workout_logs rows=${logs?.length ?? 0} savedWeight=${savedWeight} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: 1710 lb saved verbatim with no clamp, warning, or visible flag before/after Finish. Row id=${logs?.[0]?.id}`);
  }
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
