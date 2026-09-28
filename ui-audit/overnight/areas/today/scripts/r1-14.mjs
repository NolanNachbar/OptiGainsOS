// today-r1-14: add a todo with only whitespace, then Enter — the Enter-key
// path bypasses the Add button's disabled={!newText.trim()} guard, relies
// solely on the mutationFn's internal `if (!newText.trim()) return;`.
import { start, report, snap } from '../../../drive.mjs';
import { log, openAddTodo, dismissKeyboard, cleanupByTag, taggedRows, testDbRetry, testUserIdRetry } from './_lib1.mjs';

const CASE = 'today-r1-14';
let s;
try {
  s = await start('/today');
  await openAddTodo(s.page);
  const input = s.page.getByPlaceholder('Add a task...');
  await input.fill('   ');
  await s.page.waitForTimeout(100);
  await snap(s.page, 'r1-14-whitespace-before-enter');
  await input.press('Enter');
  await s.page.waitForTimeout(1000);
  await snap(s.page, 'r1-14-after-enter');

  // A blank/whitespace todo would NOT be tagged (nothing to prefix), so
  // check instead: (a) no untagged blank/whitespace-only row was created for
  // today, (b) the panel didn't crash/flash oddly, (c) no console/http errors.
  const db = await testDbRetry();
  const uid = await testUserIdRetry();
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: todayRows, error } = await db.from('todos').select('id,text').eq('created_by', uid).eq('date', todayStr);
  if (error) throw error;
  const blankRows = (todayRows || []).filter((r) => r.text.trim() === '');

  const stillShowingAddPanel = await s.page.getByPlaceholder('Add a task...').isVisible().catch(() => false);
  const rpt = await report(s);

  const ok = blankRows.length === 0 && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  log(ok, CASE, `blankRowsFound=${blankRows.length} panelStillOpen=${stillShowingAddPanel} problems=${rpt.problems.length}`);
  if (blankRows.length) {
    // Clean up any blank rows we accidentally created (untagged, but we
    // created them in this run — safe to delete since text is pure whitespace).
    await db.from('todos').delete().in('id', blankRows.map((r) => r.id));
    console.log(`FINDING ${CASE}: pressing Enter on a whitespace-only add-todo input created ${blankRows.length} blank row(s) in the DB. The Enter keydown handler (TodayActions.jsx:107-108) calls addMutation.mutate() directly, not gated by the same !newText.trim() the Add button's disabled prop checks (:141) — and the mutationFn's internal guard (:102) did not hold end-to-end.`);
  } else {
    console.log(`FINDING ${CASE} (clean): whitespace-only Enter correctly produced no blank todo — mutationFn's internal !newText.trim() guard (TodayActions.jsx:102) held even though the Enter path bypasses the button's disabled check. panelStillOpen=${stillShowingAddPanel} (${stillShowingAddPanel ? 'no flash-close/reopen observed' : 'panel closed, worth confirming intended'}).`);
  }
} finally {
  console.log(`CLEANUP ${CASE} deleted=0 (nothing tagged to clean; any accidental blank row was removed above)`);
  if (s) await s.close();
}
