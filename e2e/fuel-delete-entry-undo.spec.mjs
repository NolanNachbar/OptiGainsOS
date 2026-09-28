// Regression for fuel-r1-06: deleting a logged food entry had zero recovery
// path — no confirm and no Undo — even though the edit and trash icons sit
// side by side in the thumb zone. Fix: the "Entry deleted" toast now offers
// an Undo action that re-creates the row (matches the train-logger set-delete
// Undo pattern, commit 61a59c5f).
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-06';
const FOOD_NAME = `OVN-${CASE} undo snack`;

async function cleanup(uid, db) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

test('deleting a food entry offers an Undo toast that restores it', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  // Local date (the app keys the day log on local time; toISOString is UTC and
  // would seed tomorrow's log on a Mountain-time evening).
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const EATEN_AT = `${today}T15:30:00.000Z`;
  const { data: entry, error: insErr } = await db.from('food_entries').insert({
    created_by: uid,
    date: today,
    meal_type: 'snack',
    food_name: FOOD_NAME,
    calories: 150,
    protein_grams: 10,
    carbs_grams: 5,
    fats_grams: 3,
    serving_size: 1,
    serving_unit: 'serving',
    eaten_at: EATEN_AT,
  }).select().single();
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/fuel');
    await page.waitForTimeout(500);

    // The name and the action buttons live in sibling divs, not one inside
    // the other, so scope to the row container that has both (the deepest
    // div containing the food name is name-only and has no Delete button as
    // a descendant).
    const row = page
      .locator('div')
      .filter({ hasText: FOOD_NAME })
      .filter({ has: page.getByRole('button', { name: 'Delete entry' }) })
      .last();
    await row.waitFor({ state: 'visible', timeout: 8000 });

    await row.getByRole('button', { name: 'Delete entry' }).click();

    const undoButton = page.getByRole('button', { name: 'Undo' });
    await expect(undoButton).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Entry deleted')).toBeVisible();

    // The row is gone right after delete.
    await page.waitForTimeout(500);
    const { data: afterDelete } = await db.from('food_entries').select('id')
      .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
    expect(afterDelete.length).toBe(0);

    await undoButton.click();
    await page.waitForTimeout(800);

    const { data: afterUndo, error } = await db.from('food_entries').select('*')
      .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
    expect(error).toBeNull();
    expect(afterUndo.length).toBe(1);
    expect(afterUndo[0].calories).toBe(150);
    expect(afterUndo[0].protein_grams).toBe(10);
    expect(afterUndo[0].carbs_grams).toBe(5);
    expect(afterUndo[0].fats_grams).toBe(3);
    expect(afterUndo[0].meal_type).toBe('snack');
    expect(afterUndo[0].date).toBe(today);
    expect(new Date(afterUndo[0].eaten_at).toISOString()).toBe(EATEN_AT);
  } finally {
    await cleanup(uid, db);
  }
});
