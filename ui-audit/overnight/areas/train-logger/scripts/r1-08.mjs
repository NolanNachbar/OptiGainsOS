// train-logger-r1-08: Start a workout at 11:50pm local, finish by hand at 12:10am —
// which day does it log to? (America/Denver, MDT = UTC-6 in late September.)
import { start, snap, report } from '../../../drive.mjs';
import { testDb } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { makeWorkout, cleanup, log, setNumberField, checkSet, startLogging } from './_lib.mjs';

const CASE = 'train-logger-r1-08';
const DAY_D = '2026-09-20';
const DAY_D1 = '2026-09-21';
let workout, s;
try {
  workout = await makeWorkout(CASE, [{
    name: 'Bench Press',
    sets: [1, 2].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
  }]);
  s = await start(`/workout-detail?id=${workout.id}`);
  await s.page.clock.install({ time: new Date(`${DAY_D}T23:50:00-06:00`) });
  await startLogging(s.page);

  await setNumberField(s.page, s.page.getByLabel(/Set 1 weight in/).first(), '135');
  await setNumberField(s.page, s.page.getByLabel(/Set 1 reps$/).first(), '10');
  await checkSet(s.page, 1);
  await setNumberField(s.page, s.page.getByLabel(/Set 2 weight in/).first(), '135');
  await setNumberField(s.page, s.page.getByLabel(/Set 2 reps$/).first(), '10');
  await checkSet(s.page, 2);

  await s.page.clock.setSystemTime(new Date(`${DAY_D1}T00:10:00-06:00`));
  await s.page.waitForTimeout(200);

  await s.page.getByRole('button', { name: 'Finish', exact: true }).click();
  await s.page.getByRole('button', { name: 'Log Workout' }).click();
  await s.page.waitForTimeout(1500);
  await snap(s.page, 'r1-08-after-finish');

  const db = await testDb();
  const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workout.id);
  if (error) throw error;
  const logDate = logs?.[0]?.log_date;

  const rpt = await report(s);
  // Not a bug per se (documented ambiguity) — record actual behavior. "ok" here
  // means the flow completed cleanly and produced a well-formed log_date; the
  // D vs D+1 question is a design call for Nolan, not a pass/fail on its own.
  const ok = logs?.length === 1 && (logDate === DAY_D || logDate === DAY_D1);
  log(ok, CASE, `logDate=${logDate} (manual-finish path) vs auto-finish path uses session-start day (${DAY_D}) per buildWorkoutLogFromSession.js localDateOf — problems=${rpt.problems.length}`);
  console.log(`FINDING ${CASE}: manual Finish at 00:10 local (crossing midnight from a session started 23:50 the prior day) logs log_date=${logDate}. The auto-finish path for the identical scenario (session goes silent and is picked up later) stamps log_date=${DAY_D} (session-start day) via localDateOf, not the Finish-time day. Confirmed design inconsistency between the two close paths for the same physical workout — flagging for Nolan's call, not auto-fixing.`);
} finally {
  if (workout) {
    const c = await cleanup(CASE, workout.id);
    console.log(`CLEANUP ${CASE} ${JSON.stringify(c)}`);
  }
  if (s) await s.close();
}
