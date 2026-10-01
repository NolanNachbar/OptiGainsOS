// Data-loss fix: the daily weigh-in prompt used to fire ONLY from Today's
// own session card (PrescribedSessionCard's checkinGate). Starting a workout
// any other way -- the Train tab, a program's own detail page, a workout's
// detail page, Quick Workout -- skipped the ask entirely, so days he trained
// off the Today card never got a weight logged and the trend lost the point.
//
// The fix adds a second choke point (useWeighInGate, src/hooks/useWeighInGate.jsx)
// at "Start Logging Workout" on /workout-detail (and at QuickWorkout's session
// creation, not covered by this file since it needs no DB-backed workout
// fixture). This spec drives the /workout-detail path directly -- the one a
// program-day link or the Train tab actually lands on -- and proves:
//   1. no weigh-in recorded today -> the shared "Weigh in first" sheet opens
//      before logging starts
//   2. Skip -> logging proceeds anyway (never blocks)
//   3. a weigh-in already on record today -> no prompt, straight to logging
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'weighin-gate-any-start';
const EXERCISE = `OVN-${CASE} Lift`;

// Local calendar date, matching how the other specs here already compute
// "today" (and the comment in body-r1-02 that the shared test account may
// carry a real weigh-in for the actual current day).
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = dateOffset(0);

async function makeWorkout(db, uid, suffix) {
  const workout = await db.from('workouts').insert({
    created_by: uid,
    title: `OVN-${CASE}-${suffix} Test Workout`,
    exercises: [{ name: EXERCISE, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
  }).select().single();
  expect(workout.error).toBeNull();
  return workout.data.id;
}

async function cleanupWorkout(db, workoutId) {
  if (!workoutId) return;
  await db.from('workout_logs').delete().eq('workout_id', workoutId);
  await db.from('workout_sessions').delete().eq('workout_id', workoutId);
  await db.from('workout_schedules').delete().eq('workout_id', workoutId);
  await db.from('workouts').delete().eq('id', workoutId);
}

// The gate reads "is there a body_weight_entries row for today", so each test
// owns today's row set: snapshot whatever is already there, clear it to get a
// known starting state, then put the original rows back in `finally` so this
// run never destroys real data sitting on the shared test account.
async function snapshotTodayWeighIns(db, uid) {
  const { data, error } = await db.from('body_weight_entries')
    .select('*').eq('created_by', uid).eq('recorded_date', TODAY);
  expect(error).toBeNull();
  return data || [];
}
async function clearTodayWeighIns(db, uid) {
  await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', TODAY);
}
async function restoreWeighIns(db, uid, rows) {
  // Whatever this test run inserted for today gets cleared first, then the
  // original rows (if any) are put back exactly as found.
  await clearTodayWeighIns(db, uid);
  if (!rows.length) return;
  const payload = rows.map(({ id, created_at, updated_at, ...rest }) => rest);
  await db.from('body_weight_entries').insert(payload);
}

test('no weigh-in today: starting a workout from /workout-detail shows the weigh-in prompt, and Skip lets logging continue', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const priorWeighIns = await snapshotTodayWeighIns(db, uid);
  await clearTodayWeighIns(db, uid);
  let workoutId;

  try {
    workoutId = await makeWorkout(db, uid, 'noprompt');
    await signIn(page, `/workout-detail?id=${workoutId}`);
    await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();

    // The shared choke-point dialog -- same "Weigh in first" sheet
    // PrescribedSessionCard already used, reused here rather than a second UI.
    await expect(page.getByRole('heading', { name: 'Weigh in first' })).toBeVisible();
    await expect(page.getByText('Step on the scale')).toBeVisible();

    // Skip never blocks logging.
    await page.getByRole('button', { name: 'Skip, straight to the session' }).click();
    await expect(page.getByRole('heading', { name: 'Weigh in first' })).not.toBeVisible();
    await expect(page.getByLabel(/Set 1 weight in/).first()).toBeVisible();

    // Skipping must not have silently logged a weight.
    await expect.poll(async () => {
      const { data, error } = await db.from('body_weight_entries')
        .select('*').eq('created_by', uid).eq('recorded_date', TODAY);
      expect(error).toBeNull();
      return (data || []).length;
    }).toBe(0);
  } finally {
    await cleanupWorkout(db, workoutId);
    await restoreWeighIns(db, uid, priorWeighIns);
  }
});

test('weigh-in already recorded today: starting a workout from /workout-detail logs straight in with no prompt', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const priorWeighIns = await snapshotTodayWeighIns(db, uid);
  await clearTodayWeighIns(db, uid);
  let workoutId;

  try {
    const seeded = await db.from('body_weight_entries').insert({
      created_by: uid,
      recorded_date: TODAY,
      weight: 181,
      notes: `OVN-${CASE}`,
    }).select().single();
    expect(seeded.error).toBeNull();

    workoutId = await makeWorkout(db, uid, 'skipprompt');
    await signIn(page, `/workout-detail?id=${workoutId}`);
    await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();

    // Straight into the logger -- no gate, since today's weight is on record.
    await expect(page.getByLabel(/Set 1 weight in/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Weigh in first' })).not.toBeVisible();

    // The existing weigh-in is untouched (still exactly one row, same value).
    const { data: after, error } = await db.from('body_weight_entries')
      .select('*').eq('created_by', uid).eq('recorded_date', TODAY);
    expect(error).toBeNull();
    expect(after?.length).toBe(1);
    expect(after[0].weight).toBe(181);
  } finally {
    await cleanupWorkout(db, workoutId);
    await restoreWeighIns(db, uid, priorWeighIns);
  }
});
