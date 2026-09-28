// fuel-r1-05: 10000 g serving of almonds — do macros scale linearly with no
// sanity cap, and does the ring degrade gracefully rather than breaking?
import { start, report, snap } from '../../../drive.mjs';
import { log, dismissKeyboard, cleanupByTag, taggedRows } from './_lib.mjs';

const CASE = 'fuel-r1-05';
let s;
try {
  s = await start('/fuel');
  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await s.page.locator('#search').fill('almonds');
  await s.page.waitForTimeout(1500);
  const result = s.page.locator('button:has-text("Almond")').first();
  await result.waitFor({ state: 'visible', timeout: 10000 });
  const resultText = await result.innerText();
  // Search field autofocuses a keyboard overlay that swallows the first tap
  // on anything beneath it (same issue worked around in r1-01/02/04) — the
  // result button click itself needs the keyboard dismissed first here.
  await dismissKeyboard(s.page);
  await s.page.waitForTimeout(150);
  await result.click();
  await s.page.waitForTimeout(400);
  await s.page.locator('#food_name').waitFor({ state: 'visible', timeout: 10000 });
  await dismissKeyboard(s.page);
  await s.page.locator('#food_name').fill(`OVN-${CASE} ${resultText.split('\n')[0]}`);

  // A USDA per-100g result already defaults the unit to grams; verify before
  // relying on it instead of assuming.
  const unitNow = await s.page.locator('label:has-text("Amount")').locator('xpath=following-sibling::div[1]//button').first().innerText();
  if (!/^g(rams)?$/i.test(unitNow.trim())) {
    throw new Error(`expected unit to default to g, got "${unitNow}"`);
  }

  const amountInput = s.page.locator('label:has-text("Amount")').locator('xpath=following-sibling::div[1]//input');
  await amountInput.fill('10000');
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-05-before-submit');
  const caloriesShown = await s.page.locator('text=Total for').locator('xpath=following-sibling::div[1]').innerText().catch(() => '');

  await s.page.getByRole('button', { name: 'Add Food', exact: true }).click({ timeout: 5000 });
  await s.page.waitForTimeout(1200);

  const problemsBeforeReload = [...s.problems];
  await snap(s.page, 'r1-05-after-submit');
  const ringText = await s.page.locator('text=LEFT, text=OVER').first().innerText().catch(() => '');

  const rows = await taggedRows(CASE);
  const rpt = await report(s);
  const row = rows?.[0];
  const plausibleUpperBoundEnforced = !row || Number(row.serving_size) <= 2000; // ~2kg is already absurd; 10kg should never land
  const noPageErrors = rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  const ok = plausibleUpperBoundEnforced && noPageErrors;
  log(ok, CASE, `row=${row ? JSON.stringify({calories: row.calories, serving_size: row.serving_size}) : 'none'} caloriesShownInDialog="${caloriesShown.replace(/\s+/g,' ')}" ringText="${ringText}" problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: a 10000g serving of almonds was accepted with no upper bound, producing row calories=${row?.calories}. caloriesShownInDialog="${caloriesShown.replace(/\s+/g,' ')}". pageErrors=${JSON.stringify(rpt.problems.filter(p=>p.type==='pageerror'))}. src/pages/FoodTracker.jsx:2807 serving amount input has no max.`);
  } else if (row) {
    console.log(`FINDING ${CASE} (accepted, no crash, informational): 10000g almonds -> calories=${row.calories} was accepted with no upper-bound warning/confirmation before saving. Ring/day totals did not visibly break (no page error), but nothing stops an obviously implausible single entry from being logged. Worth a sanity-check confirmation dialog above some threshold (e.g. >5000 kcal in one entry).`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
