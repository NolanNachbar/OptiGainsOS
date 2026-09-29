// Phase B: the custom Ledger-styled bottom-sheet keypad for weight/reps/RIR
// on touch devices (the OS numeric keyboard covers roughly half an iOS
// screen with no reliable Next/Done key, so the app supplies its own).
// This drives a full set entirely through the keypad -- tap the weight
// field, digits, Next, reps, Next, an RIR pill -- and asserts the set
// commits through the exact same completion path a checkbox tap would use:
// the rest timer starts, and the saved log has the real weight/reps/rir.
// A second, separate assertion in the same touch context proves the real
// <input>s stay genuinely fill()-able (not readOnly) with the keypad wired
// up -- Playwright's own interaction with the two pre-existing logger specs
// already proves click()+type() still works; this covers the other input
// API a test could reasonably use.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

test.use({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });

const CASE = 'keypad-1';
const EXERCISE = `OVN-${CASE} Lift`;

async function cleanup(workoutId) {
  if (!workoutId) return;
  const db = await testDb();
  await db.from('workout_logs').delete().eq('workout_id', workoutId);
  await db.from('workout_sessions').delete().eq('workout_id', workoutId);
  await db.from('workout_schedules').delete().eq('workout_id', workoutId);
  await db.from('workouts').delete().eq('id', workoutId);
}

test('a full set logged entirely through the keypad sheet saves weight, reps and RIR', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  const workout = await db.from('workouts').insert({
    created_by: uid,
    title: `OVN-${CASE} Test Workout`,
    exercises: [{ name: EXERCISE, sets: [{ set_number: 1, weight: null, reps: null, completed: false }] }],
  }).select().single();
  expect(workout.error).toBeNull();
  const workoutId = workout.data.id;

  try {
    await signIn(page, `/workout-detail?id=${workoutId}`);
    await page.getByRole('button', { name: 'Start Logging Workout' }).first().click();

    const sheet = page.getByRole('group', { name: 'Set entry keypad' });

    // Tap the weight field -- this focuses the real <input> (inputMode=none
    // on a coarse pointer suppresses the OS keyboard) and opens the sheet.
    await page.getByLabel(/Set 1 weight in/).first().click();
    await expect(sheet).toBeVisible();

    for (const d of ['1', '8', '5']) {
      await sheet.getByRole('button', { name: d, exact: true }).click();
    }
    await expect(page.getByLabel(/Set 1 weight in/).first()).toHaveValue('185');

    await sheet.getByRole('button', { name: 'Next field' }).click();
    await expect(page.getByLabel(/Set 1 reps$/).first()).toBeFocused();

    await sheet.getByRole('button', { name: '8', exact: true }).click();
    await expect(page.getByLabel(/Set 1 reps$/).first()).toHaveValue('8');

    await sheet.getByRole('button', { name: 'Next field' }).click();
    await expect(sheet.getByRole('button', { name: 'RIR 2' })).toBeVisible();

    // A pill both sets the RIR value and finishes the set -- RIR is always
    // the last field, so this is the same one-tap completion the sheet's
    // "Done ✓" key would otherwise trigger explicitly.
    await sheet.getByRole('button', { name: 'RIR 2' }).click();

    // Sheet closes...
    await expect(sheet).not.toBeVisible();
    // ...and the set completed through the real path: the checkbox flips
    // and the rest timer -- which only handleSetCompleted starts -- shows a
    // countdown, not the idle label.
    await expect(page.getByRole('checkbox', { name: 'Mark set 1 incomplete' })).toBeVisible();
    await expect(page.getByLabel(/Rest, .* remaining/)).toBeVisible({ timeout: 3000 });

    // Prove native fill() is unaffected by the keypad wiring: add a second
    // set and fill it directly, bypassing the sheet entirely.
    await page.getByRole('button', { name: 'Add Set' }).first().click();
    const set2Weight = page.getByLabel(/Set 2 weight in/).first();
    await set2Weight.fill('135');
    await expect(set2Weight).toHaveValue('135');
    // Complete set 2 too (Add Set carries reps forward, so this is enough to
    // finish cleanly) -- otherwise Finish opens the "Incomplete Sets"
    // prompt instead of going straight to Log Workout.
    await page.getByRole('checkbox', { name: /Mark set 2/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Mark set 2 incomplete' })).toBeVisible();

    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('button', { name: 'Log Workout' }).click();
    await page.waitForTimeout(1200);

    const { data: logs, error } = await db.from('workout_logs').select('*').eq('workout_id', workoutId);
    expect(error).toBeNull();
    expect(logs?.length).toBe(1);
    const set1 = logs[0].exercises[0].sets[0];
    expect(set1.weight).toBe(185);
    expect(set1.reps).toBe(8);
    expect(set1.rir).toBe(2);
    expect(set1.completed).toBe(true);
    expect(logs[0].exercises[0].sets[1].weight).toBe(135);
  } finally {
    await cleanup(workoutId);
  }
});
