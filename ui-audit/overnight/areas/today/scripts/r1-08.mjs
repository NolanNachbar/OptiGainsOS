// today-r1-08: add a todo, reload before the insert response lands. No
// duplicate on retry, no silently lost text.
import { start, report, snap } from '../../../drive.mjs';
import { log, openAddTodo, dismissKeyboard, cleanupByTag, taggedRows } from './_lib1.mjs';

const CASE = 'today-r1-08';
const TEXT = `OVN-${CASE} reload test`;
let s;
try {
  s = await start('/today');

  // Delay the POST so the reload reliably wins the race.
  await s.page.route('**/rest/v1/todos*', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((r) => setTimeout(r, 4000));
    }
    await route.continue();
  });

  await openAddTodo(s.page);
  await dismissKeyboard(s.page);
  const input = s.page.getByPlaceholder('Add a task...');
  await input.fill(TEXT);
  await s.page.waitForTimeout(100);
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-08-before-add');

  // Fire the add, then reload immediately without waiting for the (delayed)
  // response to land.
  await s.page.getByRole('button', { name: 'Add', exact: true }).click({ timeout: 5000 }).catch(() => {});
  await s.page.waitForTimeout(150); // let the request fire, well short of the 4s delay
  await s.page.reload();
  await s.page.waitForTimeout(2000);
  // Give the delayed POST (if in flight before the reload) a moment to land
  // or be truly cancelled by navigation.
  await s.page.waitForTimeout(3000);
  await snap(s.page, 'r1-08-after-reload');

  const inputAfterReload = await s.page.getByPlaceholder('Add a task...').inputValue().catch(() => null); // likely gone (adding panel closed on reload)
  const rows = await taggedRows(CASE);
  const rpt = await report(s);

  const ok = rows.length <= 1; // never a duplicate; 0 (request truly lost) or 1 (landed) both acceptable IF the user could tell which happened
  log(ok, CASE, `rows=${rows.length} inputAfterReload=${JSON.stringify(inputAfterReload)} problems=${rpt.problems.length}`);
  if (rows.length === 0) {
    console.log(`FINDING ${CASE}: the insert was still in flight when the page reloaded; the todo "${TEXT}" was lost entirely (rows=0) with no persisted draft and no error shown before the reload — the athlete has no way to know the add silently failed to save. src/components/dashboard/TodayActions.jsx:100-116 addMutation clears newText/closes the panel only in onSuccess; there's no local draft persistence, and a reload mid-flight has no warning UI.`);
  } else if (rows.length > 1) {
    console.log(`FINDING ${CASE}: reload-before-response produced ${rows.length} duplicate rows for the same tagged text (expected at most 1).`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
