// Regression for train-logger-r1-03: deleting a completed set (the X sits
// right next to the completion check, exactly where a sweaty thumb lands) had
// zero recovery path. Fix: removing a set now shows a toast with an Undo
// action that reinserts the set at its original position.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-03';
const EXERCISE = `OVN-${CASE} Lift`;

// Number inputs here don't support the selection API (selectionStart is
// null), so triple-click does not select-all; locator.selectText() does.
// Matches the pattern used by the audit's own repro scripts (_lib.mjs).
async function setNumberField(page, locator, value) {
  await locator.click();
  await locator.selectText();
  await page.keyboard.press('Backspace');
  if (value !== '') await page.keyboard.type(String(value));
  await page.waitForTimeout(350);
}

async function cleanup(workoutId) {
  const db = await testDb();
  if (workoutId) {
    await db.from('workout_logs').delete().eq('workout_id', workoutId);
    await db.from('workout_sessions').delete().eq('workout_id', workoutId);
    await db.from('workout_schedules').delete().eq('workout_id', workoutId);
    await db.from('workouts').delete().eq('id', workoutId);
  }
}

test('deleting a completed set offers an Undo toast that restores it', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const workout = await db.from('workouts').insert({
    created_by: uid,
    title: `OVN-${CASE} Test Workout`,
    exercises: [{
      name: EXERCISE,
      sets: [1, 2, 3].map((n) => ({ set_number: n, weight: null, reps: null, completed: false })),
    }],
  }).select().single();
  expect(workout.error).toBeNull();
  const workoutId = workout.data.id;

  try {
    await signIn(page, `/workout-detail?id=${workoutId}`);
    await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();

    // Set 1: 100x10, Set 2: 105x8, both completed.
    await setNumberField(page, page.getByLabel(/Set 1 weight in/).first(), '100');
    await setNumberField(page, page.getByLabel(/Set 1 reps$/).first(), '10');
    await page.getByRole('checkbox', { name: /Mark set 1/ }).click();
    await page.waitForTimeout(300);

    await setNumberField(page, page.getByLabel(/Set 2 weight in/).first(), '105');
    await setNumberField(page, page.getByLabel(/Set 2 reps$/).first(), '8');
    await page.getByRole('checkbox', { name: /Mark set 2/ }).click();
    await page.waitForTimeout(300);

    // Delete set 2 by mistake.
    await page.getByRole('button', { name: 'Remove set 2' }).click();

    // An Undo toast must appear.
    const undoButton = page.getByRole('button', { name: 'Undo' });
    await expect(undoButton).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Set 2 removed')).toBeVisible();

    await undoButton.click();
    await page.waitForTimeout(300);

    // Set 2 is restored with its original data.
    await expect(page.getByLabel(/Set 2 weight in/).first()).toHaveValue('105');
    await expect(page.getByLabel(/Set 2 reps$/).first()).toHaveValue('8');
    await expect(page.getByRole('checkbox', { name: 'Mark set 2 incomplete' })).toBeVisible();
    // The old set 3 should still be present too (3 sets total again).
    const weightLabels = await page.locator('[aria-label*="weight in"]').count();
    expect(weightLabels).toBe(3);

    // Finish and confirm the restored set's data actually saved.
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    const incomplete = page.getByText('Incomplete Sets');
    if (await incomplete.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.getByRole('button', { name: 'Leave As-Is' }).click();
    }
    await page.getByRole('button', { name: 'Log Workout' }).click();
    // Poll rather than sleep: the save can take longer than a fixed wait.
    let logs = [];
    await expect.poll(async () => {
      const { data, error } = await db.from('workout_logs').select('*').eq('workout_id', workoutId);
      expect(error).toBeNull();
      logs = data || [];
      return logs.length;
    }, { timeout: 10000 }).toBe(1);
    const savedSets = logs[0].exercises[0].sets;
    // Restored at its original position, same values, renumbered contiguously.
    expect(savedSets[0]).toMatchObject({ set_number: 1, weight: 100, reps: 10 });
    expect(savedSets[1]).toMatchObject({ set_number: 2, weight: 105, reps: 8, completed: true });
  } finally {
    await cleanup(workoutId);
  }
});
