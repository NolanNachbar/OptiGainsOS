// today-r1-01: double-tap Delete on a todo — no confirm, no undo, no isPending guard.
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedTodo, cleanupByTag, taggedRows, todayStrLocal } from './_lib1.mjs';

const CASE = 'today-r1-01';
let s;
try {
  await insertTaggedTodo({
    date: todayStrLocal(),
    text: `OVN-${CASE} delete test`,
    source: 'manual',
    completed: false,
  });

  s = await start('/today');
  await s.page.waitForTimeout(500);

  const rowsBefore = await taggedRows(CASE);
  if (rowsBefore.length !== 1) throw new Error(`setup failed: expected 1 row, got ${rowsBefore.length}`);

  const row = s.page.locator('div.group', { hasText: `OVN-${CASE} delete test` }).first();
  await row.waitFor({ state: 'visible', timeout: 5000 });
  const delBtn = row.getByRole('button', { name: 'Delete action' });
  await delBtn.waitFor({ state: 'visible', timeout: 5000 });

  const click1 = delBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const click2 = delBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const [r1, r2] = await Promise.all([click1, click2]);
  await s.page.waitForTimeout(1200);

  await snap(s.page, 'r1-01-after-double-delete');
  const rowsAfter = await taggedRows(CASE);
  const rpt = await report(s);
  const clickErrors = [r1, r2].filter((r) => r && r.err);

  const ok = rowsAfter.length === 0 && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  log(ok, CASE, `rowsBefore=${rowsBefore.length} rowsAfter=${rowsAfter.length} clickErrors=${clickErrors.length} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: double-tap delete left rowsAfter=${rowsAfter.length} (expected 0). clickErrors=${JSON.stringify(clickErrors)} pageProblems=${JSON.stringify(rpt.problems)}. src/components/dashboard/TodayActions.jsx:92-98,187-193 deleteMutation.`);
  }
  // Even on the "ok" no-crash path this is worth a low-severity UX finding
  // per the runbook's own map: zero confirm, zero undo, on the app's 2nd
  // most-used table's only destructive action.
  console.log(`NOTE ${CASE}: deleteMutation (TodayActions.jsx:92-98) has no confirm dialog and no undo/toast-with-undo, unlike every delete path in Mind (Reading/Study/Skills all use ConfirmDialog).`);
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
