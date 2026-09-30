// Regression for fuel-r1-05: the Amount field has no upper bound, so a
// typo'd serving (10000g instead of 1000g) saved a wildly implausible entry
// (57,900 kcal) with zero warning, silently wrecking the day's ring. Fix:
// a one-time confirm() before submit when the computed calories exceed
// ~2500, mirroring the train-logger heavy-weight guard.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId, openAddFoodDialog } from './helpers.mjs';

const CASE = 'r1-05';
const FOOD_NAME = `OVN-${CASE} huge snack`;

async function cleanup(uid, db) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

async function openManualEntryWithCalories(page, calories) {
  await openAddFoodDialog(page);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Manual entry' }).click();
  await page.waitForTimeout(200);
  await page.locator('#food_name').fill(FOOD_NAME);
  await page.locator('#calories').fill(String(calories));
  await page.locator('#calories').blur();
  await page.waitForTimeout(300);
}

test('a huge-calorie manual entry asks for confirmation before saving', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  try {
    await signIn(page, '/fuel');

    // Cancel path: dismissing the confirm must not save anything.
    await openManualEntryWithCalories(page, 57900);
    let dialogMessage = null;
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });
    const submitBtn = page.getByRole('button', { name: 'Add Food', exact: true });
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click({ timeout: 5000, force: true });
    await page.waitForTimeout(500);

    expect(dialogMessage).toContain('57,900');

    const { data: afterCancel } = await db.from('food_entries').select('id')
      .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
    expect(afterCancel.length).toBe(0);

    // Accept path: confirming still saves the row (no hard block).
    page.once('dialog', (dialog) => dialog.accept());
    await submitBtn.click({ timeout: 5000, force: true });
    await page.waitForTimeout(800);

    const { data: afterAccept } = await db.from('food_entries').select('id,calories')
      .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
    expect(afterAccept.length).toBe(1);
    expect(afterAccept[0].calories).toBe(57900);
  } finally {
    await cleanup(uid, db);
  }
});
