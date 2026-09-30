// Part 3 (app-wide 3h auto-finish backstop). The existing autoFinishSession
// only ever ran from WorkoutDetail/QuickWorkout's own mount effect, scoped to
// the one workout being reopened -- if he forgets Finish and just opens Today
// or Fuel instead, a 3h+-silent session sat in_progress forever. This proves
// useGlobalAutoFinish (wired into Layout, so it runs on every route) closes
// that gap: a stale in_progress session gets logged and closed from a plain
// /today visit, with no workout page ever opened. A second, only-1h-silent
// session in parallel proves the sweep does not over-fire on a session that
// is still plausibly mid-workout.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'globalfinish-1';
const STALE_EXERCISE = `OVN-${CASE}-stale Lift`;
const CONTROL_EXERCISE = `OVN-${CASE}-control Lift`;

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// Client-side filter, not a jsonb-path PostgREST filter -- no other spec in
// this suite queries into `exercises` that way, and this test account's
// row count is small enough that fetching-then-filtering in JS is simpler
// and safer than trusting an untested filter string.
function hasMarkerExercise(row, marker) {
  return Array.isArray(row?.exercises) && row.exercises.some((ex) => ex?.name === marker);
}

async function cleanup(uid) {
  const db = await testDb();

  const { data: sessions } = await db
    .from('workout_sessions')
    .select('id, exercises')
    .eq('created_by', uid);
  const staleSessionIds = (sessions || [])
    .filter((s) => hasMarkerExercise(s, STALE_EXERCISE) || hasMarkerExercise(s, CONTROL_EXERCISE))
    .map((s) => s.id);
  if (staleSessionIds.length) {
    await db.from('workout_sessions').delete().in('id', staleSessionIds);
  }

  const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
  const staleLogIds = (logs || [])
    .filter((l) => hasMarkerExercise(l, STALE_EXERCISE) || hasMarkerExercise(l, CONTROL_EXERCISE))
    .map((l) => l.id);
  if (staleLogIds.length) {
    await db.from('workout_logs').delete().in('id', staleLogIds);
  }

  // Belt-and-suspenders: any other stray in-progress quick-workout session
  // (workout_id/program_workout_id null) left on the test account would
  // otherwise surface as a silent Resume prompt, or get swept by the very
  // feature under test and confuse this run's assertions.
  await db
    .from('workout_sessions')
    .delete()
    .eq('created_by', uid)
    .eq('status', 'in_progress')
    .is('workout_id', null)
    .is('program_workout_id', null)
    .lt('start_time', isoHoursAgo(0.01));
}

test('a session silent 3h+ (and <24h old) auto-finishes from a plain /today visit; a 1h-silent session is left untouched', async ({ page }) => {
  const uid = await testUserId();
  const db = await testDb();
  await cleanup(uid);

  let staleId;
  let controlId;
  try {
    // Stale: started 5h ago, last touched 4h ago -- silenceMs (4h) >=
    // AUTO_FINISH_STALE_MS (3h) and ageMs (5h) < STALE_SESSION_MS (24h).
    // Must qualify. updated_at has a BEFORE UPDATE trigger that stamps now()
    // unconditionally (set_updated_at()) -- it does NOT fire on INSERT, so the
    // backdated value has to be supplied in the insert payload itself; a
    // follow-up UPDATE to backdate it would immediately be overwritten.
    const { data: stale, error: staleErr } = await db
      .from('workout_sessions')
      .insert({
        created_by: uid,
        workout_id: null,
        program_workout_id: null,
        status: 'in_progress',
        start_time: isoHoursAgo(5),
        updated_at: isoHoursAgo(4),
        exercises: [{ name: STALE_EXERCISE, sets: [{ weight: 100, reps: 5, completed: true }] }],
      })
      .select()
      .single();
    expect(staleErr).toBeNull();
    staleId = stale.id;

    // Control: started 1.5h ago, last touched 1h ago -- silenceMs (1h) is
    // under the 3h threshold. Must be left running.
    const { data: control, error: controlErr } = await db
      .from('workout_sessions')
      .insert({
        created_by: uid,
        workout_id: null,
        program_workout_id: null,
        status: 'in_progress',
        start_time: isoHoursAgo(1.5),
        updated_at: isoHoursAgo(1),
        exercises: [{ name: CONTROL_EXERCISE, sets: [{ weight: 100, reps: 5, completed: true }] }],
      })
      .select()
      .single();
    expect(controlErr).toBeNull();
    controlId = control.id;

    // Open /today directly -- never the workout page. useGlobalAutoFinish
    // lives in Layout, so it should sweep on this mount regardless.
    await signIn(page, '/today');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(
        async () => {
          const { data } = await db.from('workout_sessions').select('status').eq('id', staleId).single();
          return data?.status;
        },
        { timeout: 15000, message: 'stale session should auto-finish to completed' }
      )
      .toBe('completed');

    const { data: staleLogs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
    const matchingStaleLogs = (staleLogs || []).filter((l) => hasMarkerExercise(l, STALE_EXERCISE));
    expect(matchingStaleLogs.length).toBe(1);

    // Control untouched: still in_progress, and no log written for it.
    const { data: controlAfter } = await db
      .from('workout_sessions')
      .select('status')
      .eq('id', controlId)
      .single();
    expect(controlAfter.status).toBe('in_progress');

    const matchingControlLogs = (staleLogs || []).filter((l) => hasMarkerExercise(l, CONTROL_EXERCISE));
    expect(matchingControlLogs.length).toBe(0);
  } finally {
    await cleanup(uid);
  }
});
