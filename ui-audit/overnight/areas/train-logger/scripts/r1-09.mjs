// train-logger-r1-09: Same-day duplicate REAL workout (byte-identical exercises)
// is silently discarded as a "dupe" — workout_logs_no_exact_dupes UNIQUE is on
// md5(exercises::text) (raw JSON text, key-order sensitive), and
// WorkoutDetail.jsx:912-926 treats any 23505 on it as unconditional success.
//
// To get a genuinely byte-identical exercises payload (not just numerically
// equal), run the REAL app flow twice back-to-back against the same workout
// template with the same typed weight/reps, rather than hand-seeding a row —
// a hand-seeded JS object's key order doesn't match what the app itself
// serializes, so it never collides with the real md5 index (verified: an
// earlier version of this script using a hand-seeded row did NOT collide).
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-09';

async function logOneSession(workoutId) {
  const s = await start(`/workout-detail?id=${workoutId}`);
  await startLogging(s.page);
  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '100');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '10');
  await checkSet(s.page, 1);
  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(1500);
  const toastText = await s.page.locator('[role="status"], [data-sonner-toast]').allInnerTexts().catch(() => []);
  const rpt = await report(s);
  await s.close();
  return { toastText, problems: rpt.problems };
}

let workout;
try {
  workout = await makeWorkout(CASE, [{
    name: 'OVN-r1-09 Test Lift',
    sets: [{ set_number: 1, weight: null, reps: null, completed: false }],
  }]);

  const run1 = await logOneSession(workout.id);
  await new Promise((r) => setTimeout(r, 500));
  // Real second session same day (e.g. AM/PM same accessory work) — same
  // weight/reps, but the earlier session is now IN_PROGRESS-cancelled state
  // from the prior finish, so this creates a brand new session via the same
  // "no id, no open session" path Start Session normally takes.
  const run2 = await logOneSession(workout.id);

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const rowCount = logs?.length ?? 0;
  const sawSuccessToastRun2 = run2.toastText.some((t) => /already logged|logged successfully|workout logged/i.test(t));
  const ok = rowCount === 2;
  log(ok, CASE, `workout_logs rows=${rowCount} run1Toast=${JSON.stringify(run1.toastText)} run2Toast=${JSON.stringify(run2.toastText)}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: two real, separately-run identical sessions for the same workout/day produced only ${rowCount} workout_logs row(s). Run 2's toast was ${JSON.stringify(run2.toastText)} (sawSuccessToast=${sawSuccessToastRun2}), implying success while the second real session's data was silently discarded by workout_logs_no_exact_dupes (23505 treated unconditionally as success in WorkoutDetail.jsx:912-926).`);
  }
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
}
