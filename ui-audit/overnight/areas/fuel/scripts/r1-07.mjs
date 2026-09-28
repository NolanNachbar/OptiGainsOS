// fuel-r1-07: double-tap "mark as eaten" on a planned item — no isPending
// guard (FoodTracker.jsx:2143 checkbox / togglePlannedMutation :1132-1141).
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedEntry, cleanupByTag, taggedRows } from './_lib.mjs';

const CASE = 'fuel-r1-07';
const today = new Date().toISOString().slice(0, 10);
let s;
try {
  await insertTaggedEntry({
    food_name: `OVN-${CASE} planned lunch`,
    calories: 400,
    protein_grams: 30,
    carbs_grams: 40,
    fats_grams: 10,
    meal_type: 'lunch',
    serving_size: 1,
    serving_unit: 'serving',
    date: today,
    planned: true,
  });

  s = await start('/fuel');
  await s.page.waitForTimeout(500);

  const rowsBefore = await taggedRows(CASE);
  if (rowsBefore.length !== 1 || rowsBefore[0].planned !== true) {
    throw new Error(`setup failed: expected 1 planned row, got ${JSON.stringify(rowsBefore)}`);
  }

  const rowLocator = s.page.locator(`text=OVN-${CASE} planned lunch`).locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await rowLocator.waitFor({ state: 'visible', timeout: 5000 });
  const markEatenBtn = rowLocator.getByRole('button', { name: 'Mark as eaten' });
  await markEatenBtn.waitFor({ state: 'visible', timeout: 5000 });

  const click1 = markEatenBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const click2 = markEatenBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const [r1, r2] = await Promise.all([click1, click2]);
  await s.page.waitForTimeout(1500);

  await snap(s.page, 'r1-07-after-double-toggle');
  const bodyText = await s.page.locator('body').innerText();
  const toastCount = (bodyText.match(/Logged/g) || []).length; // rough signal only; toasts auto-dismiss

  const rowsAfter = await taggedRows(CASE);
  const rpt = await report(s);
  const clickErrors = [r1, r2].filter((r) => r && r.err);

  const row = rowsAfter[0];
  const ok = rowsAfter.length === 1 && row.planned === false && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  log(ok, CASE, `rowsBefore.planned=${rowsBefore[0].planned} rowsAfter.planned=${row?.planned} clickErrors=${clickErrors.length} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: double-tap mark-as-eaten left row=${JSON.stringify(row)} (expected exactly 1 row with planned=false). clickErrors=${JSON.stringify(clickErrors)} pageProblems=${JSON.stringify(rpt.problems)}. src/pages/FoodTracker.jsx:2143 checkbox has no disabled={togglePlannedMutation.isPending} guard.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
