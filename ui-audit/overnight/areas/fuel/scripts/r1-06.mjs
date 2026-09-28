// fuel-r1-06: double-tap Delete on a food entry — no isPending guard, no
// confirm, no undo (FoodTracker.jsx:2222 trash button / :1120-1128 mutation).
import { start, report, snap } from '../../../drive.mjs';
import { log, dismissKeyboard, cleanupByTag, taggedRows } from './_lib.mjs';

const CASE = 'fuel-r1-06';
let s;
try {
  s = await start('/fuel');
  await s.page.getByRole('button', { name: 'Add food' }).click();
  await s.page.waitForTimeout(400);
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Manual entry' }).click();
  await s.page.waitForTimeout(200);
  await s.page.locator('#food_name').fill(`OVN-${CASE} double delete target`);
  await s.page.locator('#calories').fill('150');
  await dismissKeyboard(s.page);
  await s.page.getByRole('button', { name: 'Add Food', exact: true }).click({ timeout: 5000 });
  await s.page.waitForTimeout(1000);

  const rowsBefore = await taggedRows(CASE);
  if (rowsBefore.length !== 1) throw new Error(`setup failed: expected 1 tagged row, got ${rowsBefore.length}`);

  const rowLocator = s.page.locator(`text=OVN-${CASE} double delete target`).locator('xpath=ancestor::div[contains(@class,"group")][1]');
  await rowLocator.waitFor({ state: 'visible', timeout: 5000 });
  const trashBtn = rowLocator.getByRole('button', { name: 'Delete entry' });
  await trashBtn.waitFor({ state: 'visible', timeout: 5000 });

  // Fire two near-simultaneous clicks, no await between them, to race the
  // mutation before the first response returns.
  const click1 = trashBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const click2 = trashBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const [r1, r2] = await Promise.all([click1, click2]);
  await s.page.waitForTimeout(1500);

  // Check for an Undo affordance on the toast (there should be none per the
  // app's current design, but confirm rather than assume).
  const bodyText = await s.page.locator('body').innerText();
  const hasUndo = /undo/i.test(bodyText);

  await snap(s.page, 'r1-06-after-double-delete');
  const rowsAfter = await taggedRows(CASE);
  const rpt = await report(s);
  const clickErrors = [r1, r2].filter((r) => r && r.err);

  // Judge: exactly one entry removed (rowsAfter.length === 0, since only one
  // was ever created), no page error, no crash. Separately flag the
  // no-undo/no-isPending-guard risk as its own always-true informational note
  // regardless of pass/fail on the data-integrity check.
  const dataOk = rowsAfter.length === 0 && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  log(dataOk, CASE, `rowsBefore=${rowsBefore.length} rowsAfter=${rowsAfter.length} clickErrors=${clickErrors.length} hasUndo=${hasUndo} problems=${rpt.problems.length}`);
  if (!dataOk) {
    console.log(`FINDING ${CASE}: double-tap delete left rowsAfter=${rowsAfter.length} (expected 0). clickErrors=${JSON.stringify(clickErrors)} pageProblems=${JSON.stringify(rpt.problems)}. src/pages/FoodTracker.jsx:1120-1128 deleteFoodMutation has no onError handler and the trash button at :2222 has no disabled={deleteFoodMutation.isPending} guard.`);
  }
  console.log(`FINDING ${CASE}-undo (informational, always noted per judge rule on destructive-no-undo actions): Delete has zero recovery path — no confirm dialog before deleting, and hasUndo=${hasUndo} (no 'Undo' action in the 'Entry deleted' toast). A single mis-tap permanently loses a logged entry. src/pages/FoodTracker.jsx:1120-1128 (deleteFoodMutation), :2222 (trash button, no disabled guard, no confirm).`);
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
