// train-logger-r1-11: Abandon a session halfway (close tab, never return) — does
// it rot as an orphan in_progress row, and does reopening it >24h later show the
// Resume/Start Fresh dialog rather than silently dropping/discarding it?
//
// Avoids page.clock entirely (known WebKit blank-screen risk on any fresh
// navigation under a mocked Date, not just reload) by backdating the real
// workout_sessions.start_time column via testDb instead — a plain UPDATE, not
// fighting the set_updated_at trigger (which only touches updated_at). This
// reproduces the >24h-old condition checkForActiveSession actually reads
// (ageMs = Date.now() - start_time) using the real wall clock throughout.
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-11';
let workout, s1, s2;
try {
  workout = await makeWorkout(CASE, [{
    name: 'OVN-r1-11 Test Lift',
    sets: [1, 2, 3, 4, 5].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
  }]);

  s1 = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s1.page);
  await setNumberField(s1.page, s1.page.getByLabel(/Set 1 weight in/).first(), '95');
  await setNumberField(s1.page, s1.page.getByLabel(/Set 1 reps$/).first(), '12');
  await checkSet(s1.page, 1);
  await setNumberField(s1.page, s1.page.getByLabel(/Set 2 weight in/).first(), '100');
  await setNumberField(s1.page, s1.page.getByLabel(/Set 2 reps$/).first(), '10');
  await checkSet(s1.page, 2);
  await s1.page.waitForTimeout(500); // let auto-save land
  await s1.close(); // "close the tab" — no Cancel, no Finish

  const db = await testDb();
  const { data: sessAfterClose, error: e1 } = await db.from('workout_sessions')
    .select('*').eq('workout_id', workout.id).order('created_at', { ascending: false }).limit(1);
  if (e1) throw e1;
  const rowAfterClose = sessAfterClose?.[0];
  const step3Ok = rowAfterClose?.status === 'in_progress'
    && rowAfterClose.exercises?.[0]?.sets?.filter((st) => st.completed).length === 2;

  // Backdate start_time by 25h (real UPDATE, real clock throughout).
  const backdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { error: e2 } = await db.from('workout_sessions').update({ start_time: backdated }).eq('id', rowAfterClose.id);
  if (e2) throw e2;

  // Reopen — real time, no clock mock, no reload of a mocked-clock page.
  s2 = await start(`/workout-detail?id=${workout.id}`);
  await s2.page.waitForTimeout(1500);
  const dialogVisible = await s2.page.getByText('Resume Workout?').isVisible({ timeout: 3000 }).catch(() => false);
  await snap(s2.page, 'r1-11-resume-dialog');
  const step4DialogOk = dialogVisible;

  let step4CancelOk = false;
  if (dialogVisible) {
    await s2.page.getByRole('button', { name: 'Start Fresh' }).click();
    await s2.page.waitForTimeout(800);
    const { data: afterFresh } = await db.from('workout_sessions').select('*').eq('id', rowAfterClose.id).single();
    step4CancelOk = afterFresh?.status === 'cancelled'
      && afterFresh.exercises?.[0]?.sets?.filter((st) => st.completed).length === 2; // not hard-deleted, sets intact
  }

  const rpt = await report(s2);
  const ok = step3Ok && step4DialogOk && step4CancelOk;
  log(ok, CASE, `step3(in_progress,2completed)=${step3Ok} step4(dialogShown)=${step4DialogOk} step4(cancelledNotDeleted,setsIntact)=${step4CancelOk} problems=${rpt.problems.length}`);
  if (!step3Ok) console.log(`FINDING ${CASE}: abandoned session row after close was status=${rowAfterClose?.status} completedSets=${rowAfterClose?.exercises?.[0]?.sets?.filter((st) => st.completed).length} — expected in_progress with 2 completed sets.`);
  if (!step4DialogOk) console.log(`FINDING ${CASE}: reopening a >24h-old abandoned session did NOT show the Resume/Start Fresh dialog — session may have been silently dropped or silently restored.`);
  if (dialogVisible && !step4CancelOk) console.log(`FINDING ${CASE}: after 'Start Fresh' on a >24h abandoned session, the row was not left as status=cancelled with its 2 completed sets intact (forensic recovery gap or hard-delete).`);
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s2) await s2.close();
}
