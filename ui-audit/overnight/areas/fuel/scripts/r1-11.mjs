// fuel-r1-11: re-approve the week plan after manually editing one planned
// item's amount — does the hand edit survive, or get silently discarded?
// (WeeklyPlanCard.jsx approve mutation deletes ALL planned rows for the
// week's dates unconditionally, then recreates from resolveDayPlan()).
import { format } from 'date-fns';
import { start, report, snap } from '../../../drive.mjs';
import { log, dismissKeyboard } from './_lib.mjs';
import { testDb, testUserId } from '../../../../../e2e/helpers.mjs';

const CASE = 'fuel-r1-11';

async function getTodayPlannedByName(name) {
  const db = await testDb();
  const uid = await testUserId();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data, error } = await db.from('food_entries').select('*')
    .eq('created_by', uid).eq('planned', true).eq('date', today).ilike('food_name', name);
  if (error) throw error;
  return data;
}

let s;
try {
  const before = await getTodayPlannedByName('Eggs');
  if (before.length !== 1) throw new Error(`setup precondition failed: expected exactly 1 planned "Eggs" row for today, got ${before.length}. Week plan may not be approved — run fuel-r1-10 first.`);
  const originalId = before[0].id;
  const originalAmount = before[0].serving_size;
  const originalCalories = before[0].calories;
  console.log(`${CASE} baseline: id=${originalId} serving_size=${originalAmount} calories=${originalCalories}`);

  s = await start('/fuel');
  const row = s.page.locator('text=Eggs').first().locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await row.waitFor({ state: 'visible', timeout: 8000 });
  await row.getByRole('button', { name: 'Edit entry' }).click();
  await s.page.waitForTimeout(600);

  const amountInput = s.page.locator('label:text-is("Amount")').first().locator('xpath=following-sibling::div[1]//input[@type="number"]');
  await amountInput.waitFor({ state: 'visible', timeout: 5000 });
  const doubled = String(Number(originalAmount) * 2);
  await amountInput.fill(doubled);
  await s.page.waitForTimeout(200);
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Save Changes' }).click({ timeout: 8000 });
  await s.page.waitForTimeout(1200);

  const afterEdit = await getTodayPlannedByName('Eggs');
  console.log(`${CASE} after manual edit: rows=${afterEdit.length} id=${afterEdit[0]?.id} serving_size=${afterEdit[0]?.serving_size} calories=${afterEdit[0]?.calories}`);
  let editApplied = afterEdit.length === 1 && String(afterEdit[0].serving_size) === doubled;
  if (!editApplied) {
    // verify r1: the UI edit locator is flaky (Amount field not always the one
    // filled). The case is about re-approve semantics, so apply the same hand
    // edit through the DB and continue.
    console.log(`${CASE} UI edit did not land (serving_size=${afterEdit[0]?.serving_size}); applying the edit via DB instead`);
    const db = await testDb();
    const { error } = await db.from('food_entries').update({ serving_size: Number(doubled) }).eq('id', originalId);
    if (error) throw error;
    editApplied = true;
    await s.page.reload(); await s.page.waitForTimeout(2500);
  }

  // Re-approve the week (single click — this test is about the re-approve
  // semantics, not about double-tap races, which is fuel-r1-10's concern).
  await s.page.getByRole('button', { name: /Week plan/ }).click();
  await s.page.waitForTimeout(800);
  const approveBtn = s.page.getByRole('button', { name: /Approve/ });
  await approveBtn.waitFor({ state: 'visible', timeout: 8000 });
  await approveBtn.click({ timeout: 5000 });
  await s.page.waitForTimeout(3000);

  await snap(s.page, 'r1-11-after-reapprove');
  const rpt = await report(s);

  const afterReapprove = await getTodayPlannedByName('Eggs');
  console.log(`${CASE} after re-approve: rows=${afterReapprove.length} ids=${JSON.stringify(afterReapprove.map((r) => r.id))} serving_sizes=${JSON.stringify(afterReapprove.map((r) => r.serving_size))}`);

  const survived = afterReapprove.length === 1 && afterReapprove[0].id === originalId && String(afterReapprove[0].serving_size) === doubled;
  const warnedBeforeApprove = /discard|overwrite|manual edit/i.test(await s.page.locator('body').innerText());

  // Judge: either the edit survives, or the user is warned before it's discarded.
  // A silent, unannounced loss of a manual correction is the bug per judge rule
  // ("entered data is never lost").
  const ok = survived || warnedBeforeApprove;
  log(ok, CASE,
    `originalId=${originalId} originalAmount=${originalAmount} doubledTo=${doubled} survived=${survived} warnedBeforeApprove=${warnedBeforeApprove} ` +
    `afterReapproveRows=${afterReapprove.length}`);

  if (!ok) {
    console.log(`FINDING ${CASE}: re-approving the week silently discarded a manual edit to a planned item's amount with NO warning. ` +
      `Edited "Eggs" from serving_size=${originalAmount} to ${doubled} (id=${originalId}), then tapped "Approve & load the week" again. ` +
      `Result: ${afterReapprove.length === 0 ? 'the row vanished entirely' : `a ${afterReapprove[0].id === originalId ? 'same-id' : 'NEW'} row exists with serving_size=${afterReapprove[0].serving_size} (back to the algorithm's computed value, the manual doubling was lost)`}. ` +
      `No confirm/warning dialog appeared before the discard (warnedBeforeApprove=false). ` +
      `src/components/nutrition/WeeklyPlanCard.jsx approve mutation: "await supabase.from(\\"food_entries\\").delete().eq(\\"created_by\\", user.id).eq(\\"planned\\", true).in(\\"date\\", dates)" runs unconditionally before recreating from resolveDayPlan(), with no diff/check against rows the user has since hand-edited.`);
  }
} finally {
  if (s) await s.close();
}
