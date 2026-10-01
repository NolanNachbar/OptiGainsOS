// Part A: sessions past the 24h auto-finish cutoff (STALE_SESSION_MS,
// src/lib/workoutSessionFlag.js) are DELIBERATELY never touched by
// useGlobalAutoFinish or the page-level mount check -- auto-logging one that
// old would back-date a workout_log far enough to retroactively rewrite
// MRV/volume history. Without this review row such a session sits
// in_progress forever with no UI ever mentioning it (it's also too old for
// useActiveWorkoutSession's 12h banner). This proves the Today-page review
// surface (useStaleWorkoutSessions) lists it and that both actions work:
// Log (exactly the auto-finish log path -- writes a workout_log, marks
// completed) and Discard (exactly the "Start Fresh" cancel path -- marks
// cancelled, no log), gated behind an in-app confirm sheet, never a browser
// confirm().
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'stalereview-1';
const LOG_EXERCISE = `OVN-${CASE}-log Lift`;
const DISCARD_EXERCISE = `OVN-${CASE}-discard Lift`;
const LOG_WORKOUT_TITLE = `OVN-${CASE} Log Me Workout`;
const DISCARD_WORKOUT_TITLE = `OVN-${CASE} Discard Me Workout`;

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function hasMarkerExercise(row, marker) {
  return Array.isArray(row?.exercises) && row.exercises.some((ex) => ex?.name === marker);
}

async function cleanup(uid) {
  const db = await testDb();

  const { data: sessions } = await db.from('workout_sessions').select('id, exercises').eq('created_by', uid);
  const staleSessionIds = (sessions || [])
    .filter((s) => hasMarkerExercise(s, LOG_EXERCISE) || hasMarkerExercise(s, DISCARD_EXERCISE))
    .map((s) => s.id);
  if (staleSessionIds.length) await db.from('workout_sessions').delete().in('id', staleSessionIds);

  const { data: logs } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
  const staleLogIds = (logs || [])
    .filter((l) => hasMarkerExercise(l, LOG_EXERCISE) || hasMarkerExercise(l, DISCARD_EXERCISE))
    .map((l) => l.id);
  if (staleLogIds.length) await db.from('workout_logs').delete().in('id', staleLogIds);

  await db.from('workouts').delete().eq('created_by', uid).in('title', [LOG_WORKOUT_TITLE, DISCARD_WORKOUT_TITLE]);
}

test('unfinished-session review: a 30h-old session lists on Today and Log/Discard both resolve it', async ({ page }) => {
  const uid = await testUserId();
  const db = await testDb();
  await cleanup(uid);

  let logWorkoutId, discardWorkoutId, logSessionId, discardSessionId;
  try {
    const logWorkout = await db.from('workouts').insert({
      created_by: uid,
      title: LOG_WORKOUT_TITLE,
      exercises: [{ name: LOG_EXERCISE, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
    }).select().single();
    expect(logWorkout.error).toBeNull();
    logWorkoutId = logWorkout.data.id;

    const discardWorkout = await db.from('workouts').insert({
      created_by: uid,
      title: DISCARD_WORKOUT_TITLE,
      exercises: [{ name: DISCARD_EXERCISE, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
    }).select().single();
    expect(discardWorkout.error).toBeNull();
    discardWorkoutId = discardWorkout.data.id;

    // Both sessions: started 30h ago -- past STALE_SESSION_MS (24h), so
    // neither auto-finish sweep nor the page mount check will ever touch
    // them. The "log" one carries a completed set (sessionHasLoggedSets ->
    // true, so Log should write a workout_log); the "discard" one has none
    // (an empty session -- Discard should just cancel it, same either way).
    const logSession = await db.from('workout_sessions').insert({
      created_by: uid,
      workout_id: logWorkoutId,
      program_workout_id: null,
      status: 'in_progress',
      start_time: isoHoursAgo(30),
      updated_at: isoHoursAgo(29),
      exercises: [{ name: LOG_EXERCISE, sets: [{ weight: 100, reps: 5, completed: true }] }],
    }).select().single();
    expect(logSession.error).toBeNull();
    logSessionId = logSession.data.id;

    const discardSession = await db.from('workout_sessions').insert({
      created_by: uid,
      workout_id: discardWorkoutId,
      program_workout_id: null,
      status: 'in_progress',
      start_time: isoHoursAgo(30),
      updated_at: isoHoursAgo(29),
      exercises: [{ name: DISCARD_EXERCISE, sets: [{ weight: 100, reps: 5, completed: false }] }],
    }).select().single();
    expect(discardSession.error).toBeNull();
    discardSessionId = discardSession.data.id;

    await signIn(page, '/today');
    await page.waitForLoadState('networkidle');

    const reviewModule = page.getByText('Unfinished sessions').first();
    await expect(reviewModule).toBeVisible();
    await expect(page.getByText(LOG_WORKOUT_TITLE)).toBeVisible();
    await expect(page.getByText(DISCARD_WORKOUT_TITLE)).toBeVisible();

    const logRow = page.getByTestId(`stale-session-${logSessionId}`);
    await logRow.getByRole('button', { name: 'Log' }).click();

    await expect
      .poll(
        async () => {
          const { data } = await db.from('workout_sessions').select('status').eq('id', logSessionId).single();
          return data?.status;
        },
        { timeout: 15000, message: 'Log action should mark the session completed' }
      )
      .toBe('completed');

    const { data: logsAfter } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
    expect((logsAfter || []).filter((l) => hasMarkerExercise(l, LOG_EXERCISE)).length).toBe(1);

    // The row disappears once resolved.
    await expect(page.getByText(LOG_WORKOUT_TITLE)).toHaveCount(0);

    // Discard: must go through the in-app confirm sheet, never window.confirm().
    const discardRow = page.getByTestId(`stale-session-${discardSessionId}`);
    await discardRow.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByText('Discard this session?')).toBeVisible();
    await page.getByRole('button', { name: 'Discard' }).last().click();

    await expect
      .poll(
        async () => {
          const { data } = await db.from('workout_sessions').select('status').eq('id', discardSessionId).single();
          return data?.status;
        },
        { timeout: 15000, message: 'Discard action should mark the session cancelled' }
      )
      .toBe('cancelled');

    const { data: logsAfterDiscard } = await db.from('workout_logs').select('id, exercises').eq('created_by', uid);
    expect((logsAfterDiscard || []).filter((l) => hasMarkerExercise(l, DISCARD_EXERCISE)).length).toBe(0);

    await expect(page.getByText(DISCARD_WORKOUT_TITLE)).toHaveCount(0);
  } finally {
    await cleanup(uid);
  }
});
