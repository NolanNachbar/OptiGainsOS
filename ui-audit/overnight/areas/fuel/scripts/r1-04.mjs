// fuel-r1-04: serving amount of 0.00001 passes validation (only rejects <= 0)
// and logs a near-zero-calorie ghost entry.
import { start, report, snap } from '../../../drive.mjs';
import { log, dismissKeyboard, cleanupByTag, taggedRows } from './_lib.mjs';

const CASE = 'fuel-r1-04';
let s;
try {
  s = await start('/fuel');
  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await s.page.locator('#search').fill('chicken breast');
  await s.page.waitForTimeout(1500); // debounce + USDA fetch
  const result = s.page.locator('button:has-text("Chicken")').first();
  await result.waitFor({ state: 'visible', timeout: 10000 });
  const resultText = await result.innerText();
  await result.click();
  await s.page.waitForTimeout(400);
  await dismissKeyboard(s.page);

  // We now need the manual-entry "Amount" input, which the food selection
  // auto-expands. Rename the food_name so it's tagged/findable in the DB.
  // verify r1: the selection doesn't always auto-expand the manual section.
  if (!(await s.page.locator('#food_name').isVisible().catch(() => false))) {
    await s.page.getByRole('button', { name: 'Manual entry' }).click().catch(() => {});
    await s.page.waitForTimeout(300);
  }
  await s.page.locator('#food_name').fill(`OVN-${CASE} ${resultText.split('\n')[0]}`);
  const amountInput = s.page.locator('label:has-text("Amount")').locator('xpath=following-sibling::div[1]//input');
  await amountInput.fill('0.00001');
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-04-before-submit');

  const submitBtn = s.page.getByRole('button', { name: 'Add Food', exact: true });
  const disabled = await submitBtn.isDisabled();
  await submitBtn.click({ timeout: 5000, force: disabled }).catch(() => {});
  await s.page.waitForTimeout(1200);

  const rows = await taggedRows(CASE);
  const rpt = await report(s);
  const row = rows?.[0];
  // Expected: either rejected/clamped (no row), or accepted with the amount
  // itself clamped to something plausible. A row saved at serving_size
  // 0.00001 is a phantom entry regardless of its rounded calories — it still
  // inflates the day's item count with zero nutritional signal, which the
  // case explicitly rules out as an acceptable outcome.
  const ok = !row || Number(row.serving_size) > 0.01;
  log(ok, CASE, `submitDisabled=${disabled} rows=${rows?.length} row=${row ? JSON.stringify({calories: row.calories, serving_size: row.serving_size}) : 'none'} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: serving amount 0.00001 (USDA "${resultText.split('\n')[0]}") was ${row ? 'ACCEPTED' : 'REJECTED'}. submitDisabled=${disabled}. ${row ? `Row created: calories=${row.calories}, serving_size=${row.serving_size}, serving_unit=${row.serving_unit} — a near-zero ghost entry with no floor/rounding guard, inflating the day's item count for no nutritional signal.` : ''} src/pages/FoodTracker.jsx:3145 disabled check is (parseFloat(newFood.serving_amount)||0) <= 0, which lets 0.00001 through since it's > 0.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
