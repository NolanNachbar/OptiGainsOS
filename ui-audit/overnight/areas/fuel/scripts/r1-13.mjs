// fuel-r1-13: log a recipe at 9999 servings — is there an upper bound?
// Recipe is seeded directly via DB insert (tagged OVN-fuel-r1-13) using the
// ACTUAL recipes-table column names (calories/protein_grams/carbs_grams/
// fats_grams), NOT the total_calories/total_protein/total_carbs/total_fats
// names RecipeBuilder.jsx's RecipeFormDialog.handleSave() actually sends —
// that mismatch is a separate, more severe finding (recipe creation via the
// UI is completely broken, confirmed live: PGRST204 "Could not find the
// 'total_calories' column of 'recipes' in the schema cache" on every save).
// Since no recipe can ever be created through the UI wizard, driving the full
// create flow to get a recipe to test 9999-servings logging against is not
// possible; seeding directly is the only way to exercise LogRecipeDialog at
// all right now.
import { start, report, snap, controls } from '../../../drive.mjs';
import { log, dismissKeyboard } from './_lib.mjs';
import { testDb, testUserId } from '../../../../../e2e/helpers.mjs';

const CASE = 'fuel-r1-13';
const RECIPE_NAME = `OVN-${CASE} test recipe`;

async function findTaggedFoodEntries() {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').select('*')
    .eq('created_by', uid).ilike('food_name', `%${CASE}%`);
  if (error) throw error;
  return data;
}

let s;
let recipeId;
try {
  const db = await testDb();
  const uid = await testUserId();

  const { data: recipe, error: insErr } = await db.from('recipes').insert([{
    created_by: uid,
    name: RECIPE_NAME,
    ingredients: [{ name: 'test ingredient', calories: 100, protein_grams: 5, carbs_grams: 10, fats_grams: 2 }],
    servings: 1,
    calories: 100,
    protein_grams: 5,
    carbs_grams: 10,
    fats_grams: 2,
  }]).select().single();
  if (insErr) throw insErr;
  recipeId = recipe.id;
  console.log(`${CASE} seeded recipe id=${recipeId} calories=100 (per-serving, servings=1)`);

  s = await start('/fuel');

  await s.page.getByRole('button', { name: /Templates, recipes/i }).click();
  await s.page.waitForTimeout(600);

  const recipeCard = s.page.locator('div').filter({ hasText: RECIPE_NAME }).first();
  await recipeCard.waitFor({ state: 'visible', timeout: 8000 });
  await s.page.getByRole('button', { name: 'Log' }).first().click();
  await s.page.waitForTimeout(600);

  const servingsInput = s.page.locator('label:text-is("Servings")').locator('xpath=following-sibling::div[1]//input[@type="number"]');
  await servingsInput.waitFor({ state: 'visible', timeout: 5000 });
  await servingsInput.fill('9999');
  await s.page.waitForTimeout(200);
  await dismissKeyboard(s.page);

  const scaledCaloriesText = await s.page.locator('text=Calories').first().locator('xpath=preceding-sibling::div[1]').innerText().catch(() => '');
  console.log(`${CASE} on-screen scaled calorie preview at 9999 servings: "${scaledCaloriesText}"`);

  const logBtn = s.page.getByRole('button', { name: /Log to Food Tracker/i });
  const disabledAt9999 = await logBtn.isDisabled().catch(() => false);
  console.log(`${CASE} Log button disabled at servingCount=9999: ${disabledAt9999}`);

  if (!disabledAt9999) {
    await logBtn.click({ timeout: 5000 });
    await s.page.waitForTimeout(2000);
  }

  const rpt = await report(s);
  const rows = await findTaggedFoodEntries();
  console.log(`${CASE} food_entries rows created: ${rows.length} ${JSON.stringify(rows.map((r) => ({ id: r.id, calories: r.calories, serving_size: r.serving_size })))}`);

  // Judge: an implausible 9999-serving log should be blocked/confirmed, not
  // silently accepted. But the empirical result is worse than that question:
  // scaleRecipeToServings() (src/utils/nutritionUtils.js) reads
  // recipe.total_calories/total_protein/total_carbs/total_fats, while the
  // `recipes` table's real columns are calories/protein_grams/carbs_grams/
  // fats_grams (confirmed against supabase/migrations/00000000000000_remote_schema.sql
  // and live insert probing). Any recipe fetched from the DB (correct schema
  // names) therefore scales to NaN, which gets logged as a food_entries row
  // with calories=null — a silently corrupted entry, at ANY serving count,
  // not just 9999. The servings-upper-bound question is moot: the feature is
  // broken before serving count is even relevant.
  const noPageErrors = rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  const corruptedRow = rows.length === 1 && rows[0].calories === null;
  const reactNanWarning = rpt.problems.some((p) => p.type === 'console' && /NaN/.test(p.msg || ''));
  const ok = !corruptedRow;
  log(ok, CASE,
    `disabledAt9999=${disabledAt9999} rowsCreated=${rows.length} corruptedRow=${corruptedRow} calories=${rows[0]?.calories} reactNanWarning=${reactNanWarning} noPageErrors=${noPageErrors}`);

  if (!ok) {
    console.log(`FINDING ${CASE}: scaleRecipeToServings() in src/utils/nutritionUtils.js reads recipe.total_calories/total_protein/` +
      `total_carbs/total_fats, but the \`recipes\` table's actual columns (per supabase/migrations/00000000000000_remote_schema.sql) are ` +
      `calories/protein_grams/carbs_grams/fats_grams — confirmed live: a direct DB insert using the real column names, then logged via the ` +
      `UI's "Log to Food Tracker" flow, produced calories=${rows[0]?.calories} (NaN, serialized as null) and a React console warning ` +
      `("Received NaN for the \`%s\` attribute"). This is NOT specific to 9999 servings — it would happen at servings=1 too, since ` +
      `recipe.total_calories is simply undefined on any real recipe row. Separately (and consistent with the same total_* vs calories ` +
      `naming bug), RecipeBuilder.jsx's RecipeFormDialog.handleSave() INSERTs total_calories/total_protein/total_carbs/total_fats into ` +
      `\`recipes\`, which has no such columns — confirmed live via direct probe: Supabase returns PGRST204 "Could not find the ` +
      `'total_calories' column of 'recipes' in the schema cache" on every attempted recipe creation. Net effect: recipe creation via the ` +
      `UI is completely broken (fails every time), and even a recipe present in the table (e.g. seeded directly, or from before a schema ` +
      `change) logs with corrupted null/NaN macros when used. The servings-field upper-bound question (min="0.5" step="0.5", no max on ` +
      `RecipeBuilder.jsx:1432 and its +/- buttons) is real but secondary to this. ` +
      `src/utils/nutritionUtils.js:79-98 (calculateRecipeTotals / scaleRecipeToServings), src/components/nutrition/RecipeBuilder.jsx:993-1017 (handleSave).`);
  }
} finally {
  const rows = await findTaggedFoodEntries();
  if (rows.length) {
    const db = await testDb();
    await db.from('food_entries').delete().in('id', rows.map((r) => r.id));
    console.log(`CLEANUP ${CASE} deleted ${rows.length} tagged food_entries rows`);
  }
  if (recipeId) {
    const db = await testDb();
    await db.from('recipes').delete().eq('id', recipeId);
    console.log(`CLEANUP ${CASE} deleted seeded recipe id=${recipeId}`);
  }
  if (s) await s.close();
}
