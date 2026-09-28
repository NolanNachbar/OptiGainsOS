// train-logger-r1-07: Lock phone for 3+ hours mid-workout (silent auto-finish), then reopen.
//
// Uses direct DB backdating of workout_sessions.updated_at/start_time instead
// of page.clock: the auto-finish check is entirely server-driven
// (sessionSilenceMs = Date.now() - session.updated_at, buildWorkoutLogFromSession.js:62-67),
// so backdating the row and reloading under the REAL system clock reproduces
// the exact same condition a real 3.5h-later reopen would hit. (page.clock +
// a full page reload was tried first and reliably breaks the app's initial
// auth/session fetch under WebKit — a harness artifact, not a product bug;
// confirmed via /tmp/debug07*.mjs: without a reload the mocked clock is fine,
// but any fresh navigation under the mock leaves the content area blank.)
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-07';
let workout, s;
try {
  workout = await makeWorkout(CASE, [
    { name: 'Bench Press', sets: [1, 2].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })) },
    { name: 'Squat', sets: [1].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })) },
  ]);
  s = await start(`/workout-detail?id=${workout.id}`);
  await startLogging(s.page);

  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '135');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '10');
  await checkSet(s.page, 1);
  await setNumberField(s.page, s.page.getByLabel(/Set 2 weight in/).first(), '145');
  await setNumberField(s.page, s.page.getByLabel(/Set 2 reps$/).first(), '8');
  await checkSet(s.page, 2);
  await setNumberField(s.page, s.page.locator('[aria-label*="Set 1"][aria-label*="weight in"]').nth(1), '225');
  await setNumberField(s.page, s.page.locator('[aria-label*="Set 1 reps"]').nth(1), '5');
  await s.page.locator('[aria-label="Mark set 1 complete"]').click();
  await s.page.waitForTimeout(1500); // let auto-save land the real write

  const db = await testDb();
  const threeAndHalfHoursAgo = new Date(Date.now() - (3 * 60 + 30) * 60 * 1000).toISOString();
  const { data: preRow, error: preErr } = await db.from('workout_sessions')
    .update({ updated_at: threeAndHalfHoursAgo, start_time: threeAndHalfHoursAgo })
    .eq('workout_id', workout.id).select().single();
  if (preErr) throw preErr;

  await s.page.reload();
  await s.page.waitForTimeout(3000);
  await snap(s.page, 'r1-07-after-reopen');

  const resumeDialogVisible = await s.page.getByText('Resume Workout?').isVisible().catch(() => false);
  const isLoggingNow = await s.page.getByRole('button', { name: 'Finish', exact: true }).isVisible().catch(() => false);

  const { data: sessions } = await db.from('workout_sessions').select('*').eq('workout_id', workout.id);
  const { data: logsFirst } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);

  // Second reload of the same (now completed) session — must not double-write.
  await s.page.reload();
  await s.page.waitForTimeout(2500);
  const { data: logsSecond } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);

  const rpt = await report(s);
  const ok = sessions?.[0]?.status === 'completed' && logsFirst?.length === 1 && logsSecond?.length === 1
    && !resumeDialogVisible && !isLoggingNow;
  const savedSets = logsFirst?.[0]?.exercises?.flatMap((ex) => ex.sets) ?? [];
  log(ok, CASE, `sessionStatus=${sessions?.[0]?.status} logsFirst=${logsFirst?.length} logsSecond=${logsSecond?.length} resumeDialogVisible=${resumeDialogVisible} isLoggingNow=${isLoggingNow} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: auto-finish after 3h30m silence did not behave as expected. sessionStatus=${sessions?.[0]?.status} logsFirst=${logsFirst?.length} logsSecond=${logsSecond?.length} savedSets=${JSON.stringify(savedSets)} resumeDialogVisible=${resumeDialogVisible} isLoggingNow=${isLoggingNow}`);
  }
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
