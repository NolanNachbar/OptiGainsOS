// Phase 3b item 5: a one-tap "+" on each Recent-food row in the Add Food
// dialog re-logs that food with its last-used portion straight to today,
// without opening the edit form. Seeds one past entry so it surfaces in
// Recent, taps its "+", and asserts a second row lands with matching macros
// and the current date/meal_type — then deletes both rows it touched.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId, openAddFoodDialog } from './helpers.mjs';
import { getTodayString } from '../src/utils/dateUtils.js';

const CASE = '3b-relog';
const FOOD_NAME = `OVN-${CASE} chicken bowl`;

async function cleanup(uid, db) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

test('tapping + on a Recent food re-logs it with its last portion', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  const today = getTodayString();

  const { error: insErr } = await db.from('food_entries').insert({
    created_by: uid,
    date: today,
    meal_type: 'lunch',
    food_name: FOOD_NAME,
    calories: 540,
    protein_grams: 45,
    carbs_grams: 50,
    fats_grams: 12,
    fiber_grams: 4,
    serving_size: 1,
    serving_unit: 'bowl',
    serving_grams: 350,
  });
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/fuel');

    await openAddFoodDialog(page);
    await page.waitForTimeout(300);

    const relogBtn = page.getByRole('button', { name: `Log ${FOOD_NAME} again with the same portion` });
    await relogBtn.scrollIntoViewIfNeeded();
    await relogBtn.click();

    await expect(page.getByText('Food logged successfully!')).toBeVisible({ timeout: 5000 });

    // Two rows now: the seed and the one the "+" created, both intact.
    await expect.poll(async () => {
      const { data } = await db.from('food_entries').select('id, calories, protein_grams, meal_type, date')
        .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
      return data?.length ?? 0;
    }, { timeout: 8000 }).toBe(2);

    const { data: rows } = await db.from('food_entries')
      .select('id, calories, protein_grams, carbs_grams, fats_grams, meal_type, date, serving_grams')
      .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);

    for (const row of rows) {
      expect(row.calories).toBe(540);
      expect(row.protein_grams).toBe(45);
      expect(row.carbs_grams).toBe(50);
      expect(row.fats_grams).toBe(12);
      expect(row.meal_type).toBe('lunch');
      expect(row.date).toBe(today);
      expect(row.serving_grams).toBe(350);
    }
  } finally {
    await cleanup(uid, db);
  }
});
