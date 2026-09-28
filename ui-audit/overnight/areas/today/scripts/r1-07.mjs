// today-r1-07: double-tap the toggle-complete checkbox on a todo — no isPending guard.
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedTodo, cleanupByTag, taggedRows, todayStrLocal } from './_lib1.mjs';

const CASE = 'today-r1-07';
let s;
try {
  await insertTaggedTodo({ date: todayStrLocal(), text: `OVN-${CASE} toggle test`, source: 'manual', completed: false });

  s = await start('/today');
  await s.page.waitForTimeout(500);

  const rowsBefore = await taggedRows(CASE);
  if (rowsBefore.length !== 1 || rowsBefore[0].completed !== false) throw new Error(`setup failed: ${JSON.stringify(rowsBefore)}`);

  const row = s.page.locator('div.group', { hasText: `OVN-${CASE} toggle test` }).first();
  await row.waitFor({ state: 'visible', timeout: 5000 });
  const toggleBtn = row.getByRole('button', { name: /Mark (complete|incomplete)/ });

  const click1 = toggleBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const click2 = toggleBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const [r1, r2] = await Promise.all([click1, click2]);
  await s.page.waitForTimeout(1200);

  await snap(s.page, 'r1-07-after-double-toggle');
  const rowsAfter = await taggedRows(CASE);
  const rpt = await report(s);
  const clickErrors = [r1, r2].filter((r) => r && r.err);

  const row1 = rowsAfter[0];
  const ok = rowsAfter.length === 1 && row1.completed === true && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  log(ok, CASE, `completedBefore=false completedAfter=${row1?.completed} clickErrors=${clickErrors.length} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: double-tap toggle left row=${JSON.stringify(row1)} (expected completed=true, 1 row). clickErrors=${JSON.stringify(clickErrors)} pageProblems=${JSON.stringify(rpt.problems)}. src/components/dashboard/TodayActions.jsx:172-181 toggle button has no disabled={toggleMutation.isPending} guard.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
