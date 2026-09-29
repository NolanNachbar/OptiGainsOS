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

    const row = page
      .locator('div')
      .filter({ hasText: FOOD_NAME })
      .filter({ has: page.getByRole('button', { name: 'Delete entry' }) })
      .last();
    await row.waitFor({ state: 'visible', timeout: 8000 });

    const rowText = await row.innerText();
    // Mobile inline strip: "0P · 0C · 0F", not "P · C · F".
    expect(rowText).toMatch(/0P/);
    expect(rowText).toMatch(/0C/);
    expect(rowText).toMatch(/0F/);
    expect(rowText).not.toMatch(/[^0-9]P\b/);
  } finally {
    await cleanup(uid, db);
  }
});
