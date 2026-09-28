// train-logger-r1-04: 'Done early' — Finish tapped with most sets still unchecked.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-04';
const EXS = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press'];
let workout, s;
try {
  workout = await makeWorkout(CASE, EXS.map((name) => ({
    name,
    sets: [1, 2, 3].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
  })));
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  // Complete only 1 set total (exercise 1, set 1) out of ~12 seeded.
  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '95');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '10');
  await checkSet(s.page, 1);
  await snap(s.page, 'r1-04-before-finish');

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  const incompleteDialog = s.page.getByText('Incomplete Sets');
  await incompleteDialog.waitFor({ state: 'visible', timeout: 5000 });
  await s.page.getByRole('button', { name: 'Leave As-Is' }).click();
  await s.page.getByRole('button', { name: 'Log Workout' }).waitFor({ state: 'visible' });
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(1500);

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const exercises = logs?.[0]?.exercises ?? [];
  const totalSets = exercises.reduce((n, ex) => n + (ex.sets?.length ?? 0), 0);
  const completedSets = exercises.reduce((n, ex) => n + (ex.sets?.filter((st) => st.completed).length ?? 0), 0);

  const rpt = await report(s);
  const ok = logs?.length === 1 && completedSets === 1 && totalSets === 12;
  log(ok, CASE, `rows=${logs?.length ?? 0} totalSets=${totalSets} completedSets=${completedSets} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: expected 1 completed / 12 total sets saved as-left. Got completed=${completedSets} total=${totalSets} rows=${logs?.length}. exercises=${JSON.stringify(exercises).slice(0, 800)}`);
  }
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
