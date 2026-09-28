// train-logger-r1-03: Delete the wrong set immediately after logging it.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-03';
let workout, s;
try {
  workout = await makeWorkout(CASE, [{
    name: 'Bench Press',
    sets: [1, 2, 3].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
  }]);
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  // Set 1: 100x10, Set 2: 105x8 (both completed with distinct weights).
  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '100');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '10');
  await checkSet(s.page, 1);
  await setNumberField(s.page, s.page.getByLabel(/Set 2 weight in/).first(), '105');
  await setNumberField(s.page, s.page.getByLabel(/Set 2 reps$/).first(), '8');
  await checkSet(s.page, 2);
  await snap(s.page, 'r1-03-before-delete');

  // Delete set 2 (the completed one, by mistake).
  await s.page.locator('[aria-label="Remove set 2"]').click();
  await s.page.waitForTimeout(500);
  await snap(s.page, 'r1-03-after-delete');

  // Check the remaining set's aria-labels renumbered, and read its value.
  const remainingLabels = await s.page.evaluate(() =>
    [...document.querySelectorAll('[aria-label*="weight in"]')].map((e) => e.getAttribute('aria-label')));
  const set2WeightNow = await s.page.locator('[aria-label*="Set 2 weight in"]').inputValue().catch(() => null);

  // Any undo affordance anywhere (toast with an Undo action)?
  const undoVisible = await s.page.getByText(/undo/i).count();

  // Finish with remaining set(s) — the surviving old-set-3 is uncompleted, so
  // the Incomplete Sets dialog appears first; leave it as-is (don't auto-check).
  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  const incomplete = s.page.getByText('Incomplete Sets');
  if (await incomplete.isVisible({ timeout: 3000 }).catch(() => false)) {
    await s.page.getByRole('button', { name: 'Leave As-Is' }).click();
  }
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(1500);

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const savedSets = logs?.[0]?.exercises?.[0]?.sets ?? [];

  const rpt = await report(s);
  // The old set 3 (never touched) should now be the sole remaining set,
  // renumbered to set_number 2, with its own (empty) data, no bleed from the
  // deleted set 2's 105/8.
  const bled = savedSets.some((st) => st.weight === 105 || st.reps === 8);
  const ok = remainingLabels.length === 2 && !bled && logs?.length === 1;
  log(ok, CASE, `remainingLabels=${JSON.stringify(remainingLabels)} set2WeightNow=${set2WeightNow} savedSets=${JSON.stringify(savedSets)} undoAffordance=${undoVisible > 0} problems=${rpt.problems.length}`);
  if (bled) console.log(`FINDING ${CASE}: deleted set 2's data (105/8) bled into a remaining set. savedSets=${JSON.stringify(savedSets)}`);
  if (undoVisible === 0) console.log(`FINDING ${CASE}: removeSet has zero undo affordance anywhere in the flow (no toast/Undo seen) for an accidental delete of a completed, real-data set.`);
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
