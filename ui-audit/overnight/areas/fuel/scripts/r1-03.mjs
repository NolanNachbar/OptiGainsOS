// fuel-r1-03: food_entries row with calories present but protein/carbs/fats null
// (simulating a partial AI-estimate / manual entry) — does the ring/macro bars/
// intake-stats panel render sanely (0 contribution) with no NaN?
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedEntry, cleanupByTag } from './_lib.mjs';
import { testUserId } from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

const CASE = 'fuel-r1-03';
const today = new Date().toISOString().slice(0, 10);
let s;
try {
  const uid = await testUserId();
  await insertTaggedEntry({
    food_name: `OVN-${CASE} partial macros`,
    calories: 320,
    protein_grams: null,
    carbs_grams: null,
    fats_grams: null,
    meal_type: 'snack',
    serving_size: 1,
    serving_unit: 'serving',
    date: today,
    planned: false,
  });

  s = await start('/fuel');
  await s.page.waitForTimeout(500);

  const pageText = await s.page.locator('body').innerText();
  const hasNaN = /NaN/.test(pageText);
  const rowLocator = s.page.locator(`text=OVN-${CASE} partial macros`);
  await rowLocator.waitFor({ state: 'visible', timeout: 5000 });
  const row = rowLocator.locator('xpath=ancestor::div[contains(@class,"group")][1]');
  const rowText = await row.innerText();
  const rowHtml = await row.innerHTML();
  await snap(s.page, 'r1-03-row');
  // Desktop macro grid cells (hidden at this mobile viewport width, but still
  // in the DOM) for protein/carbs/fats. They should show "0", not be left
  // empty (an empty span reads as broken/missing data, not "sane number").
  const macroSpanRe = /<span class="text-xs font-bold text-(?:coral|carb|fat)">([^<]*)<\/span>/g;
  const macroCells = [...rowHtml.matchAll(macroSpanRe)].map((m) => m[1]);
  const blankMacroCells = macroCells.filter((t) => t.trim() === '').length;
  // Mobile strip: <span class="text-coral">P</span> etc. with no leading digit.
  const mobileBlank = /<span class="text-coral">P<\/span>/.test(rowHtml);

  // Expand intake stats panel and read text too.
  const statsBtn = s.page.getByRole('button', { name: /Intake stats/i });
  if (await statsBtn.count()) {
    await statsBtn.click();
    await s.page.waitForTimeout(400);
  }
  const statsText = await s.page.locator('body').innerText();
  const hasNaNAfterStats = /NaN/.test(statsText);

  const rpt = await report(s);
  const ok = !hasNaN && !hasNaNAfterStats && /320/.test(rowHtml) && blankMacroCells === 0 && !mobileBlank;
  log(ok, CASE, `hasNaN(before stats)=${hasNaN} hasNaN(after stats)=${hasNaNAfterStats} blankMacroCells=${blankMacroCells}/3 mobileBlank=${mobileBlank} rowText="${rowText.replace(/\s+/g,' ').slice(0,150)}" problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: a food_entries row with calories=320 but protein/carbs/fats=null renders correctly (320 kcal, no NaN) but the per-row protein/carbs/fats cells are left completely BLANK instead of "0" — both the desktop grid (${blankMacroCells}/3 cells empty) and the mobile strip ("P · C · F" with no digits before each letter). calculateMacros() (src/utils/nutritionUtils.js) null-guards the day's aggregate totals (confirmed sane: ring/goal bars show correct numbers), but the per-row JSX at FoodTracker.jsx ~2222 (entry.protein_grams etc.) reads the raw field with no || 0 fallback, so a null macro reads as an empty gap rather than a real number. rowHtml snippet: ${rowHtml.slice(0,300)}`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
