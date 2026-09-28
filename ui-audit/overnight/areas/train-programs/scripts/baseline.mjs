import { testDb, testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';
import { writeFileSync } from 'node:fs';

const db = await testDb();
const uid = await testUserId();

async function all(table, cols = '*') {
  const { data, error } = await db.from(table).select(cols).eq('created_by', uid);
  if (error) throw error;
  return data;
}

const enrollments = await all('program_enrollments');
const programs = await all('programs');
const programWorkouts = await all('program_workouts');
const lockedOrOverride = programWorkouts.filter((r) => r.locked || r.override_source);
const today = new Date().toISOString().slice(0, 10);
const twoWeeksOut = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const thisAndNextWeek = programWorkouts.filter((r) => r.scheduled_date && r.scheduled_date >= today && r.scheduled_date <= twoWeeksOut);
const libraryWorkouts = await all('workouts');
const workoutSessions = await all('workout_sessions');
const workoutLogs = await all('workout_logs');

const snapshot = {
  takenAt: new Date().toISOString(),
  uid,
  enrollmentIds: enrollments.map((e) => ({ id: e.id, program_id: e.program_id, status: e.status })),
  programIds: programs.map((p) => p.id),
  libraryWorkoutIds: libraryWorkouts.map((w) => w.id),
  workoutSessionIds: workoutSessions.map((s) => s.id),
  workoutLogIds: workoutLogs.map((l) => l.id),
  // full content of rows that matter for restore-after-diff
  lockedOrOverrideRows: lockedOrOverride,
  thisAndNextWeekRows: thisAndNextWeek,
  allEnrollmentsFull: enrollments,
};

writeFileSync(new URL('../baseline.json', import.meta.url), JSON.stringify(snapshot, null, 2));
console.log(`baseline: enrollments=${enrollments.length} programs=${programs.length} programWorkouts=${programWorkouts.length} lockedOrOverride=${lockedOrOverride.length} thisAndNextWeek=${thisAndNextWeek.length} libraryWorkouts=${libraryWorkouts.length} sessions=${workoutSessions.length} logs=${workoutLogs.length}`);
