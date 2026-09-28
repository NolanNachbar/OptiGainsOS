// Regression for train-logger-r1-01: a fat-fingered extra digit (1710 for
// 171) used to save verbatim with no clamp or warning, becoming the e1RM/PR/
// progression baseline. Fix: the weight field clamps to 2000 in onChange, and
// marking a set complete with weight > 2x the exercise's last weight prompts
// an inline confirm before it's accepted.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-01';
const EXERCISE = `OVN-${CASE} Lift`;

// Number inputs here don't support the selection API (selectionStart is
// null), so a plain click+type risks landing in whatever field last held
// focus if the new field's focus hasn't settled. selectText()+Backspace is
// the reliable pattern (matches the audit's own repro scripts, _lib.mjs).
async function setNumberField(page, locator, value) {
  await locator.click();
  await locator.selectText();
  await page.keyboard.press('Backspace');
  if (value !== '') await page.keyboard.type(String(value));
  await page.waitForTimeout(350);
}

async function cleanup(workoutId, priorLogId) {
  const db = await testDb();
  if (workoutId) {
    await db.from('workout_logs').delete().eq('workout_id', workoutId);
    await db.from('workout_sessions').delete().eq('workout_id', workoutId);
    await db.from('workout_schedules').delete().eq('workout_id', workoutId);
    await db.from('workouts').delete().eq('id', workoutId);
  }
  if (priorLogId) {
    await db.from('workout_logs').delete().eq('id', priorLogId);
  }
}

test.describe('weight typo guard', () => {
  test('marking a set complete with weight > 2x last weight prompts a confirm; cancel keeps the set unsaved', async ({ page }) => {
    const db = await testDb();
    const uid = await testUserId();

    // Seed a prior logged workout so getLastExercisePerformance resolves
    // lastWeight=80 for this uniquely-named exercise.
    const priorLog = await db.from('workout_logs').insert({
      created_by: uid,
      log_date: '2026-09-01',
      exercises: [{ name: EXERCISE, sets: [{ set_number: 1, weight: 80, reps: 8, completed: true }] }],
    }).select().single();
    expect(priorLog.error).toBeNull();

    const workout = await db.from('workouts').insert({
      created_by: uid,
      title: `OVN-${CASE} Test Workout`,
      exercises: [{ name: EXERCISE, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
    }).select().single();
    expect(workout.error).toBeNull();
    const workoutId = workout.data.id;
    const priorLogId = priorLog.data.id;

    try {
      await signIn(page, `/workout-detail?id=${workoutId}`);
      await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();

      await setNumberField(page, page.getByLabel(/Set 1 weight in/).first(), '1710');
      await setNumberField(page, page.getByLabel(/Set 1 reps$/).first(), '8');

      let dialogMessage = null;
      page.once('dialog', async (dialog) => {
        dialogMessage = dialog.message();
        await dialog.dismiss(); // cancel: "no, that's a typo"
      });
      await page.getByRole('checkbox', { name: /Mark set 1/ }).click();
      await page.waitForTimeout(300);

      expect(dialogMessage).toMatch(/1710/);
      expect(dialogMessage).toMatch(/80/);

      // Cancelled: the set must not be marked complete.
      await expect(page.getByRole('checkbox', { name: 'Mark set 1 complete' })).toBeVisible();

      const { data: logsAfterCancel } = await db.from('workout_logs').select('*').eq('workout_id', workoutId);
      expect(logsAfterCancel?.length ?? 0).toBe(0);

      // Now accept the confirm: a real 1710 (e.g. a leg press) should still save.
      page.once('dialog', async (dialog) => dialog.accept());
      await page.getByRole('checkbox', { name: /Mark set 1/ }).click();
      await page.waitForTimeout(300);
      await expect(page.getByRole('checkbox', { name: 'Mark set 1 incomplete' })).toBeVisible();

      // Once confirmed, a later set at the same weight must not nag again.
      await page.getByRole('button', { name: 'Add Set' }).first().click();
      await setNumberField(page, page.getByLabel(/Set 2 weight in/).first(), '1710');
      await setNumberField(page, page.getByLabel(/Set 2 reps$/).first(), '8');
      let secondDialog = null;
      const onDialog = async (dialog) => { secondDialog = dialog.message(); await dialog.dismiss(); };
      page.on('dialog', onDialog);
      await page.getByRole('checkbox', { name: /Mark set 2/ }).click();
      await page.waitForTimeout(300);
      page.off('dialog', onDialog);
      expect(secondDialog).toBeNull();
      await expect(page.getByRole('checkbox', { name: 'Mark set 2 incomplete' })).toBeVisible();

      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await page.getByRole('button', { name: 'Log Workout' }).click();
      await page.waitForTimeout(1200);

      const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workoutId);
      expect(error).toBeNull();
      expect(logs?.length).toBe(1);
      expect(logs[0].exercises[0].sets[0].weight).toBe(1710);
      expect(logs[0].exercises[0].sets[1].weight).toBe(1710);
    } finally {
      await cleanup(workoutId, priorLogId);
    }
  });

  test('typing an implausible weight (9999) clamps to 2000 in the field', async ({ page }) => {
    const db = await testDb();
    const uid = await testUserId();
    const workout = await db.from('workouts').insert({
      created_by: uid,
      title: `OVN-${CASE}-clamp Test Workout`,
      exercises: [{ name: `OVN-${CASE}-clamp Lift`, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
    }).select().single();
    expect(workout.error).toBeNull();
    const workoutId = workout.data.id;

    try {
      await signIn(page, `/workout-detail?id=${workoutId}`);
      await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();

      const weightField = page.getByLabel(/Set 1 weight in/).first();
      await setNumberField(page, weightField, '9999');
      await expect(weightField).toHaveValue('2000');
    } finally {
      await cleanup(workoutId);
    }
  });
});
