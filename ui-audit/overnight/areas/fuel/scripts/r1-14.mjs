// fuel-r1-14: ring total vs intake-stats total agreement after inserting a
// tagged, implausible-calorie-density row (500 cal / 10 g = 50 cal/g) dated
// today. Source reading (src/pages/FoodTracker.jsx:1406-1407 calculateMacros(
// eatenEntries) for the ring; :1510-1561 intakeStats useMemo) shows NEITHER
// path filters by calorie density — only MealPlanIdeas.jsx's isSuspicious()
// (meal-idea generation, a different feature) does that. Prediction: no
// divergence. This case is marked serialize:true in cases-r1.json (it adds a
// row to today's shared totals) — insert/verify/cleanup happen back-to-back
// with no other case interleaved.
import { format, subDays, parseISO } from 'date-fns';
import { start, report, snap } from '../../../drive.mjs';
import { log } from './_lib.mjs';
import { testDb, testUserId } from '../../../../../e2e/helpers.mjs';

const CASE = 'fuel-r1-14';
const TAG_NAME = `OVN-${CASE} suspicious density`;
const today = format(new Date(), 'yyyy-MM-dd');

async function todaysEatenCalorieTotal() {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').select('calories')
    .eq('created_by', uid).eq('date', today).eq('planned', false);
  if (error) throw error;
  return data.reduce((s, r) => s + (r.calories || 0), 0);
}

function parseRing(bodyText) {
  // The ring's center readout for "today" shows |remaining| with a
  // "left"/"over" label (see FoodTracker.jsx:1770-1783). Capture both so the
  // signed consumed-relative-to-goal value can be derived without needing the
  // goal figure itself (which is constant across before/after here).
  const m = bodyText.match(/(\d+)\s*(LEFT|OVER)/i);
  if (!m) return null;
  const value = Number(m[1]);
  const label = m[2].toUpperCase();
  return { value, label, signed: label === 'OVER' ? value : -value };
}

let s;
let insertedId;
try {
  const dbTotalBefore = await todaysEatenCalorieTotal();
  console.log(`${CASE} today's eaten calorie total BEFORE (DB, sum over !planned): ${dbTotalBefore}`);

  s = await start('/fuel');
  const ringTextBefore = await s.page.locator('[data-tutorial="nutrition-rings"]').innerText();
  const ringBefore = parseRing(ringTextBefore);
  console.log(`${CASE} ring BEFORE: ${JSON.stringify(ringBefore)}`);

  await s.page.getByRole('button', { name: /Intake stats/i }).click();
  await s.page.waitForTimeout(400);
  await s.page.getByRole('button', { name: '7d' }).click();
  await s.page.waitForTimeout(400);
  const statsTextBefore = await s.page.locator('text=/Average of \\d+ logged/').innerText().catch(() => '');
  const daysLoggedBeforeMatch = statsTextBefore.match(/Average of (\d+) logged/);
  const daysLoggedBefore = daysLoggedBeforeMatch ? Number(daysLoggedBeforeMatch[1]) : null;
  const avgCaloriesBeforeText = await s.page.locator('div.text-xs.text-ink-muted', { hasText: /^Calories$/ }).first().locator('xpath=following-sibling::div[1]').innerText().catch(() => '');
  console.log(`${CASE} intake-stats BEFORE: daysLogged=${daysLoggedBefore} statsText="${statsTextBefore}" avgCaloriesText="${avgCaloriesBeforeText}"`);

  // Insert the tagged suspicious-density row directly (DB-level, per case setup).
  const db = await testDb();
  const uid = await testUserId();
  const { data: inserted, error: insErr } = await db.from('food_entries').insert([{
    created_by: uid,
    date: today,
    food_name: TAG_NAME,
    meal_type: 'snack',
    planned: false,
    calories: 500,
    serving_size: 10,
    serving_unit: 'g',
    protein_grams: 0,
    carbs_grams: 0,
    fats_grams: 0,
    eaten_at: new Date().toISOString(),
  }]).select().single();
  if (insErr) throw insErr;
  insertedId = inserted.id;
  console.log(`${CASE} inserted id=${insertedId} calories=500 serving_size=10 (50 cal/g)`);

  const dbTotalAfter = await todaysEatenCalorieTotal();
  console.log(`${CASE} today's eaten calorie total AFTER (DB): ${dbTotalAfter} (delta=${dbTotalAfter - dbTotalBefore})`);

  await s.page.reload();
  await s.page.waitForTimeout(1500);

  const ringTextAfter = await s.page.locator('[data-tutorial="nutrition-rings"]').innerText();
  const ringAfter = parseRing(ringTextAfter);
  console.log(`${CASE} ring AFTER: ${JSON.stringify(ringAfter)}`);
  const ringDelta = ringBefore && ringAfter ? ringAfter.signed - ringBefore.signed : null;
  const ringIncludesRow = ringDelta === 500;

  await s.page.getByRole('button', { name: /Intake stats/i }).click();
  await s.page.waitForTimeout(400);
  await s.page.getByRole('button', { name: '7d' }).click();
  await s.page.waitForTimeout(400);
  const statsTextAfter = await s.page.locator('text=/Average of \\d+ logged/').innerText().catch(() => '');
  const daysLoggedAfterMatch = statsTextAfter.match(/Average of (\d+) logged/);
  const daysLoggedAfter = daysLoggedAfterMatch ? Number(daysLoggedAfterMatch[1]) : null;
  const avgCaloriesAfterText = await s.page.locator('div.text-xs.text-ink-muted', { hasText: /^Calories$/ }).first().locator('xpath=following-sibling::div[1]').innerText().catch(() => '');
  console.log(`${CASE} intake-stats AFTER: daysLogged=${daysLoggedAfter} statsText="${statsTextAfter}" avgCaloriesText="${avgCaloriesAfterText}"`);

  const avgBefore = Number((avgCaloriesBeforeText || '').replace(/[^\d.-]/g, '')) || null;
  const avgAfter = Number((avgCaloriesAfterText || '').replace(/[^\d.-]/g, '')) || null;
  let statsIncludesRow = null;
  if (avgBefore != null && avgAfter != null && daysLoggedBefore != null && daysLoggedAfter != null) {
    const expectedAvgAfter = daysLoggedAfter === daysLoggedBefore
      ? avgBefore + 500 / daysLoggedAfter
      : (avgBefore * daysLoggedBefore + 500) / daysLoggedAfter;
    statsIncludesRow = Math.abs(avgAfter - expectedAvgAfter) <= 1;
    console.log(`${CASE} expectedAvgAfter=${expectedAvgAfter.toFixed(1)} actualAvgAfter=${avgAfter} statsIncludesRow=${statsIncludesRow}`);
  }

  await snap(s.page, 'r1-14-after-insert-reload');
  const rpt = await report(s);
  const noPageErrors = rpt.problems.filter((p) => p.type === 'pageerror').length === 0;

  // Judge: ring and intake-stats should agree on whether this entry counts.
  // Both including it (the predicted, no-filter-anywhere outcome) is "ok".
  // A divergence (one counts, the other silently doesn't) is the bug.
  const agree = ringIncludesRow === statsIncludesRow;
  const ok = agree && noPageErrors;
  log(ok, CASE,
    `dbDelta=${dbTotalAfter - dbTotalBefore} ringDelta=${ringDelta} ringIncludesRow=${ringIncludesRow} statsIncludesRow=${statsIncludesRow} agree=${agree} noPageErrors=${noPageErrors}`);

  if (!ok) {
    console.log(`FINDING ${CASE}: ring total and intake-stats average DIVERGE on whether the suspicious-density row (500 cal / 10 g) counts. ` +
      `ringIncludesRow=${ringIncludesRow} (ringDelta=${ringDelta}, expected 500) vs statsIncludesRow=${statsIncludesRow}. ` +
      `src/pages/FoodTracker.jsx:1406-1407 (calculateMacros(eatenEntries)) vs :1510-1561 (intakeStats useMemo) — one of these two paths is ` +
      `applying a filter the other doesn't, contrary to source inspection which found no suspicious-density filter in either (only ` +
      `src/components/nutrition/MealPlanIdeas.jsx's isSuspicious() filters >10 cal/g, and only for meal-idea generation).`);
  }
} finally {
  if (insertedId) {
    const db = await testDb();
    await db.from('food_entries').delete().eq('id', insertedId);
    console.log(`CLEANUP ${CASE} deleted id=${insertedId}`);
  }
  if (s) await s.close();
}
