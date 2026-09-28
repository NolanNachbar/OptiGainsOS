// train-logger-r1-14: 0 reps / 0 weight on a completed set (bodyweight movement,
// legitimately 0 load) must be preserved as a real 0, not coerced to null or
// dropped, and must not crash the app.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-14';
let workout, s;
try {
  workout = await makeWorkout(CASE, [{
    name: 'Pull-up',
    sets: [1, 2].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
  }]);
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  // Set 1: weight 0 (real bodyweight value), reps 8, completed.
  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '0');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '8');
  const set1WeightShown = await s.page.getByLabel(/Set 1 weight in/).first().inputValue();
  await checkSet(s.page, 1);

  // Set 2: reps 0 (a genuine failed/no-rep attempt), real weight, completed.
  await setNumberField(s.page, s.page.getByLabel(/Set 2 weight in/).first(), '10');
  await setNumberField(s.page, s.page.getByLabel(/Set 2 reps$/).first(), '0');
  const set2RepsShown = await s.page.getByLabel(/Set 2 reps$/).first().inputValue();
  await checkSet(s.page, 2);
  await snap(s.page, 'r1-14-both-sets');

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(1500);

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const sets = logs?.[0]?.exercises?.[0]?.sets ?? [];
  const set1 = sets.find((st) => st.set_number === 1);
  const set2 = sets.find((st) => st.set_number === 2);

  const rpt = await report(s);
  const ok = logs?.length === 1
    && set1?.weight === 0 && set1?.reps === 8 && set1?.completed === true
    && set2?.weight === 10 && set2?.reps === 0 && set2?.completed === true
    && set1WeightShown === '0' && set2RepsShown === '0'
    && rpt.problems.length === 0;
  log(ok, CASE, `set1=${JSON.stringify(set1)} set2=${JSON.stringify(set2)} set1WeightShownInUI=${set1WeightShown} set2RepsShownInUI=${set2RepsShown} problems=${rpt.problems.length}`);
  if (!ok) console.log(`FINDING ${CASE}: 0-value set data not preserved correctly. set1=${JSON.stringify(set1)} set2=${JSON.stringify(set2)} problems=${JSON.stringify(rpt.problems)}`);
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
