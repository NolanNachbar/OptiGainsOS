// Regression for fuel-r1-13: scaleRecipeToServings() read
// recipe.total_calories/total_protein/total_carbs/total_fats, but the
// recipes table's real columns are calories/protein_grams/carbs_grams/
// fats_grams. Logging any real recipe therefore scaled to NaN and saved a
// food_entries row with calories=null. Fix: scaleRecipeToServings() reads
// the real column names (falling back to total_* for the in-memory,
// not-yet-saved shape from calculateRecipeTotals), and RecipeBuilder's
// handleSave() now inserts/updates using the real column names too.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-13';
const RECIPE_NAME = `OVN-${CASE} Recipe`;

async function cleanup(recipeId, uid, db) {
  if (recipeId) await db.from('recipes').delete().eq('id', recipeId);
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${RECIPE_NAME}%`);
}

test('logging a recipe scales real macro columns correctly (no NaN/null corruption)', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  const { data: recipe, error: insErr } = await db.from('recipes').insert({
    created_by: uid,
    name: RECIPE_NAME,
    ingredients: [{ name: 'test ingredient', calories: 100, protein_grams: 5, carbs_grams: 10, fats_grams: 2 }],
    servings: 1,
    calories: 100,
    protein_grams: 5,
    carbs_grams: 10,
    fats_grams: 2,
  }).select().single();
  expect(insErr).toBeNull();
  const recipeId = recipe.id;

  try {
    await signIn(page, '/fuel');

    await page.getByRole('button', { name: /Templates, recipes/i }).click();
    await page.waitForTimeout(600);

    // Scope Log to this spec's own recipe card: other agents' recipes on the
    // shared account can sort first, so a page-wide .first() logs the wrong one.
    const recipeCard = page.locator('div')
      .filter({ hasText: RECIPE_NAME })
      .filter({ has: page.getByRole('button', { name: 'Log', exact: true }) })
      .last();
    await recipeCard.waitFor({ state: 'visible', timeout: 8000 });
    await recipeCard.getByRole('button', { name: 'Log', exact: true }).click();
    await page.waitForTimeout(600);

    const servingsInput = page.locator('label:text-is("Servings")').locator('xpath=following-sibling::div[1]//input[@type="number"]');
    await servingsInput.waitFor({ state: 'visible', timeout: 5000 });
    await servingsInput.fill('2');
    await page.waitForTimeout(200);

    const logBtn = page.getByRole('button', { name: /Log to Food Tracker/i });
    await logBtn.click({ timeout: 5000 });
    await page.waitForTimeout(1500);

    const { data: rows, error } = await db.from('food_entries').select('*')
      .eq('created_by', uid).ilike('food_name', `%${RECIPE_NAME}%`);
    expect(error).toBeNull();
    expect(rows.length).toBe(1);
    // 2 servings of a 1-serving, 100 kcal / 5P / 10C / 2F recipe.
    expect(rows[0].calories).toBe(200);
    expect(rows[0].protein_grams).toBe(10);
    expect(rows[0].carbs_grams).toBe(20);
    expect(rows[0].fats_grams).toBe(4);
  } finally {
    await cleanup(recipeId, uid, db);
  }
});
