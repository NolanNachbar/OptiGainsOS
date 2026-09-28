// verify variant of today-r1-03: reachable-in-app path. Add the same text
// twice through the UI (manual source, no domain) and see whether the second
// add is visible.
import { start, report } from '../../../drive.mjs';
import { log, openAddTodo, addTodoViaUI, cleanupByTag, taggedRows } from './_lib1.mjs';
const CASE = 'today-r1-03v';
const TEXT = `OVN-${CASE} stretch`;
let s;
try {
  s = await start('/today');
  await openAddTodo(s.page); await addTodoViaUI(s.page, TEXT);
  await s.page.waitForTimeout(1500);
  const counter1 = await s.page.getByText(/^\d+\/\d+$/).first().innerText().catch(() => null);
  await openAddTodo(s.page); await addTodoViaUI(s.page, TEXT);
  await s.page.waitForTimeout(2000);
  const counter2 = await s.page.getByText(/^\d+\/\d+$/).first().innerText().catch(() => null);
  const rows = await taggedRows(CASE);
  const visible = await s.page.getByText(TEXT, { exact: true }).count();
  const rpt = await report(s);
  log(visible === rows.length, CASE, `dbRows=${rows.length} visible=${visible} counter ${counter1} -> ${counter2} problems=${rpt.problems.length}`);
} finally {
  console.log(`CLEANUP ${CASE} deleted=${await cleanupByTag(CASE)}`);
  if (s) await s.close();
}
