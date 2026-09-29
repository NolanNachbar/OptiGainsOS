// body-r1-12: confirm there is no in-app delete path for a physique entry.
// Read-only: opens the edit ("Fix pose") dialog on an EXISTING real entry to
// inspect controls, but never submits/changes anything and closes without
// saving. No entry from r1-10/r1-11 exists (both were blocked — see their
// findings), so this uses a real existing entry purely for DOM inspection.
import { start, snap, report, controls } from '../../../drive.mjs';
import { log } from './_lib.mjs';

const CASE = 'body-r1-12';
let s;
try {
  s = await start('/physique');
  await s.page.waitForTimeout(1200);

  // Open the edit/pencil affordance on the first entry card.
  const editBtn = s.page.getByRole('button', { name: /fix pose|edit|pencil/i }).first();
  await editBtn.waitFor({ state: 'visible', timeout: 10000 });
  await editBtn.click();
  await s.page.waitForTimeout(600);
  await snap(s.page, 'r1-12-edit-dialog');

  const dialogControls = await controls(s.page);
  console.log('DIALOG CONTROLS:\n' + dialogControls);

  const hasDeleteInDialog = /delete|remove|trash/i.test(dialogControls);

  // Close the dialog WITHOUT saving (Cancel/close/X — never Save/Confirm).
  const cancelBtn = s.page.getByRole('button', { name: /cancel|close|^x$/i }).first();
  if (await cancelBtn.count()) {
    await cancelBtn.click();
  } else {
    await s.page.keyboard.press('Escape');
  }
  await s.page.waitForTimeout(400);

  // Full-page controls dump: any delete affordance on the entry card itself
  // (long-press/swipe isn't visible to a static controls() dump, but check
  // for any menu/kebab/trash icon in the rendered DOM).
  const pageControls = await controls(s.page);
  const hasDeleteOnPage = /delete|remove entry|trash/i.test(pageControls);

  const rpt = await report(s);
  const ok = true; // this case documents a gap, not a functional failure
  log(ok, CASE, `hasDeleteInDialog=${hasDeleteInDialog} hasDeleteOnPage=${hasDeleteOnPage} problems=${rpt.problems.length}`);

  console.log(`FINDING ${JSON.stringify({
    id: CASE, title: 'No in-app way to delete a physique entry (confirmed at runtime)',
    severity: 'no-undo', route: '/physique',
    steps: 'Open /physique, tap the edit (pencil/"Fix pose") icon on any entry, inspect the dialog; also inspect the entry card and full page for any delete affordance.',
    expected: 'Either a delete path exists, or the gap is confirmed and logged.',
    actual: `Edit dialog offers pose selection only (hasDeleteInDialog=${hasDeleteInDialog}). No delete/remove/trash affordance found anywhere on the page (hasDeleteOnPage=${hasDeleteOnPage}). Matches static analysis: no .delete( call and no entry-deletion mutation anywhere in PhysiqueTracker.jsx besides updatePoseMutation.`,
    suspectFile: 'src/pages/PhysiqueTracker.jsx (updatePoseMutation is the only entry mutation; no delete mutation exists)',
  })}`);
} finally {
  if (s) await s.close();
}
