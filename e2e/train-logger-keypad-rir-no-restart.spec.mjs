// Review r4f MAJOR 1: completing a set via the keypad (RIR pill or "Done ✓")
// always routed through the same pendingDoneIndex effect that calls
// handleSetCompleted(true) -- including when the set was ALREADY complete
// and the athlete just reopened a field via the keypad to fix a typo'd
// value. handleSetCompleted's completed branch unconditionally restarts the
// rest timer (fresh full-duration deadline) and can re-fire the weight-typo
// guard, so a value correction on a done set involuntarily reset an
// in-progress rest countdown back to full. Fixed by checking
// exercise.sets[pendingDoneIndex]?.completed before re-invoking
// handleSetCompleted; this proves the fix behaviorally: the rest timer's
// remaining time only ever decreases across an RIR correction on a
// completed set, never jumps back up toward the full duration.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId, ensureTodayWeighIn } from './helpers.mjs';

test.use({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });

const CASE = 'keypad-rir-2';
const EXERCISE = `OVN-${CASE} Lift`;

async function cleanup(workoutId) {
  if (!workoutId) return;
  const db = await testDb();
  await db.from('workout_logs').delete().eq('workout_id', workoutId);
  await db.from('workout_sessions').delete().eq('workout_id', workoutId);
  await db.from('workout_schedules').delete().eq('workout_id', workoutId);
  await db.from('workouts').delete().eq('id', workoutId);
}

// A run killed mid-test never reaches its finally, leaving an in_progress
// session that makes Today show "Workout in progress" and breaks every later
// Today-based spec. Sweep any such leftovers by title before seeding.
async function sweepLeftovers(db, uid) {
  const { data: old } = await db.from('workouts').select('id').eq('created_by', uid).eq('title', `OVN-${CASE} Test Workout`);
  for (const w of old || []) await cleanup(w.id);
}

// "1:29" -> 89
function parseRemaining(label) {
  const m = label.match(/Rest, (\d+):(\d{2}) remaining/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

test('reopening RIR on an already-completed set via the keypad does not restart the rest timer', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await sweepLeftovers(db, uid);

  const workout = await db.from('workouts').insert({
    created_by: uid,
    title: `OVN-${CASE} Test Workout`,
    exercises: [{ name: EXERCISE, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
  }).select().single();
  expect(workout.error).toBeNull();
  const workoutId = workout.data.id;
  const removeSeededWeighIn = await ensureTodayWeighIn(db, uid);

  try {
    await signIn(page, `/workout-detail?id=${workoutId}`);
    await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();

    const sheet = page.getByRole('group', { name: 'Set entry keypad' });

    // Complete set 1 through the keypad -- same path as the existing
    // full-keypad-set spec -- which starts the rest timer.
    await page.getByLabel(/Set 1 weight in/).first().click();
    await expect(sheet).toBeVisible();
    for (const d of ['1', '8', '5']) {
      await sheet.getByRole('button', { name: d, exact: true }).click();
    }
    await sheet.getByRole('button', { name: 'Next field' }).click();
    await sheet.getByRole('button', { name: '8', exact: true }).click();
    await sheet.getByRole('button', { name: 'Next field' }).click();
    await expect(sheet.getByRole('button', { name: 'RIR 2' })).toBeVisible();
    await sheet.getByRole('button', { name: 'RIR 2' }).click();
    await expect(sheet).not.toBeVisible();

    const restLabel = page.getByLabel(/Rest, .* remaining/);
    await expect(restLabel).toBeVisible({ timeout: 3000 });

    // Let the timer visibly tick down before the correction.
    await page.waitForTimeout(2200);
    const before = parseRemaining(await restLabel.getAttribute('aria-label'));
    expect(before).not.toBeNull();

    // Reopen the same set's RIR field -- it's a real input, still tappable
    // after completion -- and pick a different RIR value.
    await page.getByLabel(/Set 1 reps in reserve/).first().click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'RIR 4' })).toBeVisible();
    await sheet.getByRole('button', { name: 'RIR 4' }).click();
    await expect(sheet).not.toBeVisible();

    // The correction committed...
    await expect(page.getByLabel(/Set 1 reps in reserve/).first()).toHaveValue('4');
    // ...but did NOT re-run completion: the rest timer keeps counting down
    // from where it already was, instead of jumping back up toward the full
    // 90s duration (the MAJOR 1 bug this test guards against). The label only
    // re-renders on a 500ms tick and is ceil'd to whole seconds, so a fixed
    // sleep can read the same second as `before`; poll for the real signal
    // instead -- a timer that is genuinely running drops below `before`, a
    // restarted one sits near 90 and never does.
    const remaining = async () => parseRemaining(await restLabel.getAttribute('aria-label'));
    await expect.poll(remaining, { timeout: 5000 }).toBeLessThan(before);
  } finally {
    await cleanup(workoutId);
    await removeSeededWeighIn();
  }
});
