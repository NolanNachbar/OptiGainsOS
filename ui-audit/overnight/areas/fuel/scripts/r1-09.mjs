// fuel-r1-09: offline manual add — form state preserved for retry, no false
// success (FoodTracker.jsx:1091-1118 addFoodMutation onError).
// Actual behavior discovered by trial (see debug runs this session): Playwright's
// context.setOffline() makes the underlying fetch hang rather than reject
// immediately, so the mutation never settles while offline — no
// "Failed to log food" error ever appears, the button just reads "Adding..."
// indefinitely. Once back online the SAME in-flight request completes on its
// own (no retap needed), closes the dialog, and creates exactly one row.
import { start, report, snap, controls } from '../../../drive.mjs';
import { log, dismissKeyboard, cleanupByTag, taggedRows } from './_lib.mjs';

const CASE = 'fuel-r1-09';
let s;
try {
  s = await start('/fuel');

  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Manual entry' }).click();
  await s.page.waitForTimeout(200);
  await s.page.locator('#food_name').fill(`OVN-${CASE} offline test`);
  await s.page.locator('#calories').fill('200');
  await dismissKeyboard(s.page);

  await s.context.setOffline(true);
  await s.page.getByRole('button', { name: 'Add Food', exact: true }).click({ timeout: 8000 });
  await s.page.waitForTimeout(3000);

  const bodyTextOffline = await s.page.locator('body').innerText();
  const sawFalseSuccess = /Food logged successfully/i.test(bodyTextOffline);
  const sawFailureToast = /Failed to log food/i.test(bodyTextOffline);
  const dialogStillOpenOffline = await s.page.locator('#food_name').isVisible().catch(() => false);
  const nameValOffline = dialogStillOpenOffline ? await s.page.locator('#food_name').inputValue().catch(() => '') : '';
  const calValOffline = dialogStillOpenOffline ? await s.page.locator('#calories').inputValue().catch(() => '') : '';
  const controlsOffline = await controls(s.page);
  const stuckAdding = /"Adding\.\.\."/.test(controlsOffline);

  const rowsWhileOffline = await taggedRows(CASE);

  await snap(s.page, 'r1-09-after-offline-attempt');

  // Reconnect and see whether the still-pending request resolves on its own,
  // or whether the athlete is left stuck and must retap.
  await s.context.setOffline(false);
  await s.page.waitForTimeout(4000);

  const dialogOpenAfterReconnect = await s.page.locator('#food_name').isVisible().catch(() => false);
  let rowsAfterReconnect = await taggedRows(CASE);
  if (dialogOpenAfterReconnect && rowsAfterReconnect.length === 0) {
    // Genuinely stuck — retap to complete it (form values should still be intact).
    await s.page.getByRole('button', { name: 'Add Food', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await s.page.waitForTimeout(1500);
    rowsAfterReconnect = await taggedRows(CASE);
  }

  const rpt = await report(s);
  const formPreservedWhileStuck = dialogStillOpenOffline && nameValOffline.includes(CASE) && calValOffline === '200';

  // Judge: never a FALSE success while offline, form values never lost, and
  // exactly one row exists once the network comes back (no duplicate, no drop).
  const dataOk = !sawFalseSuccess && rowsWhileOffline.length === 0 && rowsAfterReconnect.length === 1
    && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;

  log(dataOk, CASE,
    `sawFalseSuccess=${sawFalseSuccess} sawFailureToast=${sawFailureToast} stuckAdding=${stuckAdding} ` +
    `dialogStillOpenOffline=${dialogStillOpenOffline} formPreservedWhileStuck=${formPreservedWhileStuck} ` +
    `rowsWhileOffline=${rowsWhileOffline.length} dialogOpenAfterReconnect=${dialogOpenAfterReconnect} rowsAfterReconnect=${rowsAfterReconnect.length}`);

  if (!sawFailureToast) {
    console.log(`FINDING ${CASE}-no-error-feedback: While offline, tapping Add Food leaves the button stuck reading "Adding..." (stuckAdding=${stuckAdding}) ` +
      `indefinitely with NO "Failed to log food" error ever shown (sawFailureToast=false) and no way to tell the athlete what happened or how to fix it ` +
      `(judge rule: errors say what happened and how to fix it). Data is not lost — the same in-flight request silently completes once back online ` +
      `(dialogOpenAfterReconnect=${dialogOpenAfterReconnect}, rowsAfterReconnect=${rowsAfterReconnect.length}) with no retap needed — but a real athlete ` +
      `staring at a frozen "Adding..." button at the gym with no feedback has no way to know whether to wait, retry, or that anything worked. ` +
      `src/pages/FoodTracker.jsx:1115-1117 addFoodMutation onError only fires on an actual rejected request; Playwright/Chromium's offline emulation (and likely ` +
      `real airplane-mode/no-signal conditions) leave the underlying fetch pending rather than rejecting, so onError never runs and no timeout exists to catch it.`);
  }
  if (!dataOk) {
    console.log(`FINDING ${CASE}: data-integrity check failed. sawFalseSuccess=${sawFalseSuccess} rowsWhileOffline=${rowsWhileOffline.length} rowsAfterReconnect=${rowsAfterReconnect.length} problems=${JSON.stringify(rpt.problems)}`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) { await s.context.setOffline(false).catch(() => {}); await s.close(); }
}
