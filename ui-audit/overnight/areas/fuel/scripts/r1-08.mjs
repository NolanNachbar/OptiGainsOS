// fuel-r1-08: edit an entry's amount, reload before the update request lands.
// Verify no partial/corrupt row (e.g. new serving_size but stale calories).
import { start, report, snap } from '../../../drive.mjs';
import { log, dismissKeyboard, cleanupByTag, taggedRows } from './_lib.mjs';

const CASE = 'fuel-r1-08';
let s;
try {
  s = await start('/fuel');
  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Manual entry' }).click();
  await s.page.waitForTimeout(200);
  await s.page.locator('#food_name').fill(`OVN-${CASE} edit race target`);
  await s.page.locator('#calories').fill('200');
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Add Food', exact: true }).click({ timeout: 5000 });
  await s.page.waitForTimeout(1000);

  const rowsBefore = await taggedRows(CASE);
  if (rowsBefore.length !== 1) throw new Error(`setup failed: expected 1 tagged row, got ${rowsBefore.length}`);
  const original = rowsBefore[0];

  // Delay the PATCH so the reload reliably wins the race.
  await s.page.route('**/rest/v1/food_entries*', async (route) => {
    if (route.request().method() === 'PATCH') {
      await new Promise((r) => setTimeout(r, 4000));
    }
    await route.continue();
  });

  const rowLocator = s.page.locator(`text=OVN-${CASE} edit race target`).locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await rowLocator.waitFor({ state: 'visible', timeout: 5000 });
  await rowLocator.getByRole('button', { name: 'Edit entry' }).click();
  await s.page.waitForTimeout(500);
  await dismissKeyboard(s.page);

  const amountInput = s.page.locator('label:has-text("Amount")').locator('xpath=following-sibling::div[1]//input');
  await amountInput.fill('3'); // scales serving_size to 3x -> calories/macros should scale together
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-08-before-save');

  // Fire the save, then reload immediately without waiting for the (delayed)
  // response to land.
  await s.page.getByRole('button', { name: 'Save Changes', exact: true }).click({ timeout: 5000 }).catch(() => {});
  await s.page.waitForTimeout(150); // let the request fire, well short of the 4s delay
  await s.page.reload();
  await s.page.waitForTimeout(2000);
  // Give the delayed PATCH (if in flight from before the reload aborted it)
  // a moment to either land or be truly cancelled by navigation.
  await s.page.waitForTimeout(3000);

  const rowsAfter = await taggedRows(CASE);
  const rpt = await report(s);
  const row = rowsAfter[0];

  // Consistent = either fully old (serving_size/calories both unchanged) or
  // fully new (both changed together) — never a mix, and never missing/duped.
  const isOld = row && Number(row.serving_size) === Number(original.serving_size) && Number(row.calories) === Number(original.calories);
  const isNewConsistent = row && Number(row.serving_size) === 3 && Math.abs(Number(row.calories) - 200 * 3) <= 1;
  const ok = rowsAfter.length === 1 && (isOld || isNewConsistent);
  log(ok, CASE, `original=${JSON.stringify({serving_size: original.serving_size, calories: original.calories})} after=${row ? JSON.stringify({serving_size: row.serving_size, calories: row.calories}) : 'MISSING'} rowsAfter=${rowsAfter.length} isOld=${isOld} isNewConsistent=${isNewConsistent} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: editing serving amount 1->3 (expecting calories 200->600) then reloading before the delayed PATCH resolved left row=${JSON.stringify(row)} (rowsAfter=${rowsAfter.length}) — neither cleanly the old value nor a consistent new value. src/pages/FoodTracker.jsx:1143-1168 updateFoodMutation / :1170-1219 startEditEntry.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
