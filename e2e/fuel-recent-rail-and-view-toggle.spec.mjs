// Part B (Fuel MacroFactor redesign, LAUNCH_PLAN.md step 3): covers the two
// new interactive pieces added to the "Intake vs pace" module and the page
// — the Consumed/Remaining bar-fill toggle (mf-app-screens.md "Nutrition &
// Targets widget") and the Recent/go-to foods rail's one-tap re-log
// (mf-app-screens.md Fuel pattern #2, "Hourly Go-Tos"). The rail's re-log
// reuses the exact same quickRelogFood path the Add Food dialog's "+" button
// uses (already covered end-to-end by fuel-quick-relog-recent-food.spec.mjs
// for the dialog's own list) — this spec only needs to confirm the page-level
// rail triggers it and that the two affordances don't collide.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';
import { getTodayString } from '../src/utils/dateUtils.js';

const CASE = '3fuel-recent-toggle';
const FOOD_NAME = `OVN-${CASE} turkey wrap`;

async function cleanup(uid, db) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

test('Fuel: the Recent rail re-logs with one tap, and Consumed/Remaining toggles the bar captions', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  const today = getTodayString();

  const { error: insErr } = await db.from('food_entries').insert({
    created_by: uid,
    date: today,
    meal_type: 'lunch',
    food_name: FOOD_NAME,
    calories: 480,
    protein_grams: 38,
    carbs_grams: 42,
    fats_grams: 14,
    fiber_grams: 5,
    serving_size: 1,
    serving_unit: 'wrap',
    serving_grams: 300,
  });
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/fuel');

    // Recent rail: the seeded food surfaces as a one-tap chip, above the
    // page's Search entry point in page order (not inside the Add Food
    // dialog's own Recent list, which uses a different aria-label suffix —
    // "...with the same portion" — so the two never collide in a role query).
    const railChip = page.getByRole('button', { name: `Log ${FOOD_NAME} again` });
    await expect(railChip).toBeVisible({ timeout: 10000 });
    await railChip.scrollIntoViewIfNeeded();
    await railChip.click();

    await expect(page.getByText('Food logged successfully!')).toBeVisible({ timeout: 5000 });

    await expect.poll(async () => {
      const { data } = await db.from('food_entries').select('id')
        .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
      return data?.length ?? 0;
    }, { timeout: 8000 }).toBe(2);

    const { data: rows } = await db.from('food_entries')
      .select('calories, protein_grams, carbs_grams, fats_grams, meal_type, date')
      .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
    for (const row of rows) {
      expect(row.calories).toBe(480);
      expect(row.protein_grams).toBe(38);
      expect(row.meal_type).toBe('lunch');
      expect(row.date).toBe(today);
    }

    // Consumed/Remaining toggle on the Intake vs pace module: "Remaining" is
    // the default and reads "N left"/"N over"; switching to "Consumed" reads
    // "consumed/goal" instead. The toggle only renders for today's date.
    const kcalCaption = page.locator('[data-tutorial="nutrition-rings"]').getByText(/left|over/).first();
    await expect(kcalCaption).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Consumed' }).click();
    const consumedHeader = page.locator('[data-tutorial="nutrition-rings"]').getByText(/^\d[\d,]*g?\/\d[\d,]*g?$/).first();
    await expect(consumedHeader).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-tutorial="nutrition-rings"]').getByText(/left|over/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Remaining' }).click();
    await expect(page.locator('[data-tutorial="nutrition-rings"]').getByText(/left|over/).first()).toBeVisible({ timeout: 5000 });
  } finally {
    await cleanup(uid, db);
  }
});
