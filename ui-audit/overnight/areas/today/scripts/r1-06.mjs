// today-r1-06: paste ~5000 chars into the add-todo input — max length / layout check.
import { start, report, snap } from '../../../drive.mjs';
import { log, addTodoViaUI, openAddTodo, cleanupByTag, taggedRows, dismissKeyboard } from './_lib1.mjs';

const CASE = 'today-r1-06';
const HUGE_TEXT = `OVN-${CASE} ` + 'x'.repeat(4980);
let s;
try {
  s = await start('/today');
  await openAddTodo(s.page);
  await dismissKeyboard(s.page);
  await addTodoViaUI(s.page, HUGE_TEXT);

  const rows = await taggedRows(CASE);
  const rpt = await report(s);

  let overflow = false;
  let rowHeight = null;
  if (rows?.length) {
    const row = s.page.locator('div.group', { hasText: `OVN-${CASE} ` }).first();
    await row.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2).catch(() => false);
    rowHeight = await row.evaluate((e) => e.getBoundingClientRect().height).catch(() => null);
  }
  await snap(s.page, 'r1-06-huge-row');

  const savedLen = rows?.[0]?.text?.length;
  const noPageErrors = rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  const ok = rows?.length === 1 && !overflow && noPageErrors;
  log(ok, CASE, `rows=${rows?.length} savedLen=${savedLen} overflow=${overflow} rowHeight=${rowHeight} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: a ${HUGE_TEXT.length}-char todo was accepted with no max-length guard (TodayActions.jsx:100-116 addMutation, todos.text is unbounded TEXT). Result: rows=${rows?.length}, savedLen=${savedLen}, horizontal page overflow=${overflow}, rendered row height=${rowHeight}px (no truncation/line-clamp at the row render, :196-199). pageErrors=${JSON.stringify(rpt.problems.filter(p=>p.type==='pageerror'))}.`);
  } else if (rows?.length === 1) {
    console.log(`FINDING ${CASE} (accepted, no crash, informational): a ${HUGE_TEXT.length}-char todo was saved and rendered without breaking layout (no overflow, height=${rowHeight}px), but there's still no max-length guard client or DB side — worth a sanity cap given todos has no history/edit view to fix a mistake this large.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
