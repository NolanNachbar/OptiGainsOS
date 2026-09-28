// train-logger-r1-12: Skip Start Session entirely — deep-link straight to a
// stale program day two weeks old. Regression check for the isTodaysProgramWorkout
// gate (WorkoutDetail.jsx:206-226-ish): the logger must seed from the OLD day's
// own program_workout.exercises, not from today's engine-computed prescription.
import { start, snap, report } from '../../../drive.mjs';
import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { log } from './_lib.mjs';

const CASE = 'train-logger-r1-12';
const today = new Date().toISOString().slice(0, 10);
const oldDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

let programId, oldWorkoutId, todayWorkoutId, enrollmentId, s;
try {
  const db = await testDb();
  const uid = await testUserId();

  const { data: program, error: pErr } = await db.from('programs').insert({
    created_by: uid,
    title: 'OVN-r1-12 Test Program',
    description: 'temp',
    focus: 'strength',
    duration_weeks: 4,
    days_per_week: 2,
    difficulty: 'intermediate',
    is_public: false,
    schema_version: 2,
    num_cycles: 4,
    tags: [],
  }).select().single();
  if (pErr) throw pErr;
  programId = program.id;

  const { data: oldW, error: oErr } = await db.from('program_workouts').insert({
    program_id: programId,
    created_by: uid,
    title: 'OVN-r1-12 Old Lower Day',
    focus: 'strength',
    week_number: 1,
    day_index: 1,
    scheduled_date: oldDate,
    exercises: [{ name: 'OVN-r1-12 Old Squat', sets: 3, rep_target: '5', rir_target: 3, rest_seconds: 120 }],
    duration_minutes: null,
    cardio_sessions: [],
    locked: false,
  }).select().single();
  if (oErr) throw oErr;
  oldWorkoutId = oldW.id;

  const { data: todayW, error: tErr } = await db.from('program_workouts').insert({
    program_id: programId,
    created_by: uid,
    title: 'OVN-r1-12 Today Upper Day',
    focus: 'strength',
    week_number: 3,
    day_index: 1,
    scheduled_date: today,
    exercises: [{ name: 'OVN-r1-12 Today Bench', sets: 3, rep_target: '5', rir_target: 3, rest_seconds: 120 }],
    duration_minutes: null,
    cardio_sessions: [],
    locked: false,
  }).select().single();
  if (tErr) throw tErr;
  todayWorkoutId = todayW.id;

  const { data: enr, error: eErr } = await db.from('program_enrollments').insert({
    created_by: uid,
    program_id: programId,
    started_at: oldDate,
    current_week: 3,
    current_day: 1,
    current_cycle: 3,
    current_day_index: 1,
    status: 'active',
    progression_state: {},
    completed_workouts: [],
  }).select().single();
  if (eErr) throw eErr;
  enrollmentId = enr.id;

  // Deep-link straight to the 2-week-old day (NOT today's).
  s = await start(`/workout-detail?source=program&enrollmentId=${enrollmentId}&programWorkoutId=${oldWorkoutId}`);
  await s.page.waitForTimeout(2000);
  await snap(s.page, 'r1-12-loaded');

  await s.page.getByRole('button', { name: 'Start Logging Workout' }).first().click();
  await s.page.waitForTimeout(1000);
  await snap(s.page, 'r1-12-after-start');

  const bodyText = await s.page.evaluate(() => document.body.innerText);
  const seededOld = bodyText.includes('OVN-r1-12 Old Squat');
  const seededToday = bodyText.includes('OVN-r1-12 Today Bench');

  const rpt = await report(s);
  const ok = seededOld && !seededToday && rpt.problems.length === 0;
  log(ok, CASE, `seededOldExercise=${seededOld} seededTodayExercise(shouldBeFalse)=${seededToday} problems=${rpt.problems.length}`);
  if (!ok) console.log(`FINDING ${CASE}: deep-linking to a 2-week-old program day seeded seededOld=${seededOld} seededToday=${seededToday} — expected only the old day's own exercises (isTodaysProgramWorkout gate regression), problems=${JSON.stringify(rpt.problems)}`);
} finally {
  if (programId) {
    const db = await testDb();
    await db.from('workout_sessions').delete().in('program_workout_id', [oldWorkoutId, todayWorkoutId].filter(Boolean));
    if (enrollmentId) await db.from('program_enrollments').delete().eq('id', enrollmentId);
    if (oldWorkoutId) await db.from('program_workouts').delete().eq('id', oldWorkoutId);
    if (todayWorkoutId) await db.from('program_workouts').delete().eq('id', todayWorkoutId);
    await db.from('programs').delete().eq('id', programId);
    console.log(`CLEANUP ${CASE} deleted program+2 program_workouts+enrollment`);
  }
  if (s) await s.close();
}
