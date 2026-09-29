// body-r1-02: Progress Weight tab has no bounds check, unlike WeighInPrompt's
// BOUNDS=[50,700] lbs. Use a distinct backfill date (today-3) to avoid
// colliding with r1-01/07/08/09 which also touch today's date.
import { start, snap, report } from '../../../drive.mjs';
import { log, dismissKeyboard, deleteWeightByDate, weightRowsByDate, dateOffset } from './_lib.mjs';

const CASE = 'body-r1-02';
const date = dateOffset(-3);
let s;
try {
  await deleteWeightByDate(date);
  s = await start('/fuel?tab=body');

  await s.page.locator('summary:has-text("Log Weight")').click();
  await s.page.waitForTimeout(300);
  await s.page.locator('input[type="date"]').first().fill(date);
  await s.page.locator('input[type="number"]').first().fill('1810');
  await s.page.getByPlaceholder('Morning, fasted...').fill(`OVN-${CASE}`);
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-02-before-submit');

  await s.page.getByRole('button', { name: 'Log', exact: true }).click();
  await s.page.waitForTimeout(1500);

  const bodyText = await s.page.locator('body').innerText();
  const sawConfirmOrWarning = /double.?check|out of range|seems (high|wrong)|too (high|large)|are you sure/i.test(bodyText);
  const sawSuccessToast = /Weight logged/i.test(bodyText);

  const rows = await weightRowsByDate(date);
  const rpt = await report(s);
  const saved = rows.length === 1 && rows[0].weight === 1810;

  const ok = !saved || sawConfirmOrWarning;
  log(ok, CASE, `saved=${saved} sawSuccessToast=${sawSuccessToast} sawConfirmOrWarning=${sawConfirmOrWarning} rows=${JSON.stringify(rows)}`);

  if (!ok) {
    console.log(`FINDING ${JSON.stringify({
      id: CASE, title: "Progress Weight tab's weight input has no bounds check, unlike WeighInPrompt's BOUNDS guard on the same write path",
      severity: 'engine', route: '/fuel?tab=body',
      steps: 'Open Fuel > Body > Weight tab. Expand Log Weight. Enter 1810 (a transposed-digit typo for 181). Tap Log.',
      expected: "Rejected or confirmed like WeighInPrompt.jsx's BOUNDS=[50,700] lbs check, or at least a sanity warning.",
      actual: `Saved silently: ${JSON.stringify(rows)}. No warning/confirm text found in the page body.`,
      suspectFile: 'src/pages/Progress.jsx:97 (no min/max), contrast src/components/dashboard/WeighInPrompt.jsx:14,96-100',
    })}`);
  }
} finally {
  const c = await deleteWeightByDate(date);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
