// verify variant of today-r1-05: after crossing local midnight, simulate the
// realistic iOS resume (visibilitychange + focus, plus react-query refetch
// time) before adding. Does anything re-derive `today`?
import { report } from '../../../drive.mjs';
import { startWithClock, log, addTodoViaUI, openAddTodo, cleanupByTag, taggedRows, dismissKeyboard } from './_lib1.mjs';
const CASE = 'today-r1-05v';
const DAY_D = '2025-09-29', DAY_D1 = '2025-09-30';
let s;
try {
  s = await startWithClock('/today', new Date(`${DAY_D}T23:56:00-06:00`));
  await s.page.clock.setFixedTime(new Date(`${DAY_D1}T00:08:00-06:00`));
  await s.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await s.page.waitForTimeout(5000);
  await openAddTodo(s.page);
  await dismissKeyboard(s.page);
  await addTodoViaUI(s.page, `OVN-${CASE} midnight todo`);
  const rows = await taggedRows(CASE);
  const rpt = await report(s);
  log(rows?.[0]?.date === DAY_D1, CASE, `afterResume rows=${rows?.length} date=${rows?.[0]?.date} expected=${DAY_D1} problems=${rpt.problems.length}`);
} finally {
  console.log(`CLEANUP ${CASE} deleted=${await cleanupByTag(CASE)}`);
  if (s) await s.close();
}
