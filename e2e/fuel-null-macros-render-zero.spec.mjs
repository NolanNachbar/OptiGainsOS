// Regression for fuel-r1-03: a food_entries row with protein_grams/
// carbs_grams/fats_grams all null rendered as blank ("P · C · F" with no
// digits) instead of "0" in both the mobile inline strip and the desktop
// macro grid. Fix: render with a `?? 0` fallback.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';
import { getTodayString } from '../src/utils/dateUtils.js';

const CASE = 'r1-03';
const FOOD_NAME = `OVN-${CASE} null macro food`;

async function cleanup(uid, db) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

test('a food entry with null macros renders 0, not blank', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  // The app files entries under the LOCAL calendar day; a UTC date is
  // tomorrow after ~6pm Mountain, so the row landed on a day Fuel wasn't showing.
  const today = getTodayString();
  const { data: entry, error: insErr } = await db.from('food_entries').insert({
    created_by: uid,
    date: today,
    meal_type: 'snack',
    food_name: FOOD_NAME,
    calories: 320,
    protein_grams: null,
    carbs_grams: null,
    fats_grams: null,
    serving_size: 1,
    serving_unit: 'serving',
  }).select().single();
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/fuel');
    await page.waitForTimeout(500);

    // The Ledger meal-row grid (.tile-interactive) is the one element that
    // owns both the food name and the data-field numeric columns; a bare
    // `div` + hasText filter also matches its inner name/actions wrapper,
    // which does NOT contain the numeric columns.
    const row = page
      .locator('.tile-interactive')
      .filter({ hasText: FOOD_NAME })
      .last();
    await row.waitFor({ state: 'visible', timeout: 8000 });

    // Ledger meal-table row: numeric columns carry a data-field attribute
    // (kcal/protein/carbs/fats) instead of a letter-suffixed inline strip.
    await expect(row.locator('[data-field="protein"]')).toHaveText('0');
    await expect(row.locator('[data-field="carbs"]')).toHaveText('0');
    await expect(row.locator('[data-field="fats"]')).toHaveText('0');
    await expect(row.locator('[data-field="kcal"]')).toHaveText('320');
  } finally {
    await cleanup(uid, db);
  }
});
