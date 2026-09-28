// train-logger-r1-05: Reload mid-set loses nothing, restores silently into logging mode.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-05';
let workout, s;
try {
  workout = await makeWorkout(CASE, [{
    name: 'Bench Press',
    sets: [1, 2, 3].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
  }]);
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '135');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '10');
  await checkSet(s.page, 1);
  await setNumberField(s.page, s.page.getByLabel(/Set 2 weight in/).first(), '145');
  await setNumberField(s.page, s.page.getByLabel(/Set 2 reps$/).first(), '8');
  await checkSet(s.page, 2);
  // Set 3: typed but not marked complete.
  await setNumberField(s.page, s.page.getByLabel(/Set 3 weight in/).first(), '150');

  // Give the fire-and-forget auto-save a moment to actually land before reload.
  await s.page.waitForTimeout(2000);
  await snap(s.page, 'r1-05-before-reload');

  await s.page.reload();
  await s.page.waitForTimeout(2500);
  await snap(s.page, 'r1-05-after-reload');

  const resumeDialogVisible = await s.page.getByText('Resume Workout?').isVisible().catch(() => false);
  const finishVisible = await s.page.getByRole('button', { name: 'Finish', exact: true }).isVisible().catch(() => false);
  const set1Checked = await s.page.locator('[aria-label="Mark set 1 incomplete"]').count().catch(() => 0);
  const set2Checked = await s.page.locator('[aria-label="Mark set 2 incomplete"]').count().catch(() => 0);
  const set1Weight = await s.page.getByLabel(/Set 1 weight in/).first().inputValue().catch(() => null);
  const set2Weight = await s.page.getByLabel(/Set 2 weight in/).first().inputValue().catch(() => null);

  const db = await testDb();
  const { data: sessions, error } = await db.from('workout_sessions').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const sessionExercises = sessions?.[0]?.exercises?.[0]?.sets ?? [];

  const rpt = await report(s);
  const ok = !resumeDialogVisible && finishVisible && set1Checked === 1 && set2Checked === 1
    && Number(set1Weight) === 135 && Number(set2Weight) === 145;
  log(ok, CASE, `resumeDialogVisible=${resumeDialogVisible} finishVisible=${finishVisible} set1Checked=${set1Checked} set2Checked=${set2Checked} set1Weight=${set1Weight} set2Weight=${set2Weight} dbSets=${JSON.stringify(sessionExercises)} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: reload mid-set did not silently restore both completed sets into logging mode as CLAUDE.md requires. resumeDialogVisible=${resumeDialogVisible} finishVisible=${finishVisible} set1Weight=${set1Weight} set2Weight=${set2Weight}`);
  }
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
