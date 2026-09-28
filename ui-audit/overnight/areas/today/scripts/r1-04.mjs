// today-r1-04: delete the visible (earlier) duplicate — does the hidden later
// duplicate resurface on reload?
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedTodo, cleanupByTag, taggedRows, todayStrLocal } from './_lib1.mjs';

const CASE = 'today-r1-04';
const TEXT = `OVN-${CASE} duplicate text`;
let s;
try {
  const t1 = new Date(Date.now() - 120000).toISOString();
  const t2 = new Date().toISOString();
  await insertTaggedTodo({ date: todayStrLocal(), text: TEXT, source: 'ai_generated', domain: 'training', completed: false, created_at: t1 });
  await insertTaggedTodo({ date: todayStrLocal(), text: TEXT, source: 'ai_generated', domain: 'nutrition', completed: false, created_at: t2 });

  const dbRowsBefore = await taggedRows(CASE);
  if (dbRowsBefore.length !== 2) throw new Error(`setup failed: expected 2 DB rows, got ${dbRowsBefore.length}`);

  s = await start('/today');
  await s.page.waitForTimeout(500);

  // Delete the visible (earlier) one.
  const row = s.page.locator('div.group', { hasText: TEXT }).first();
  await row.getByRole('button', { name: 'Delete action' }).click();
  await s.page.waitForTimeout(1000);

  const visibleCountBeforeReload = await s.page.locator('div.group', { hasText: TEXT }).count();

  await s.page.reload();
  await s.page.waitForTimeout(2000);
  await snap(s.page, 'r1-04-after-reload');

  const visibleCountAfterReload = await s.page.locator('div.group', { hasText: TEXT }).count();
  const dbRowsAfter = await taggedRows(CASE);
  const rpt = await report(s);

  // Expected per map: earlier row deleted from DB, but since the second
  // (previously hidden) duplicate still exists and shares the same text, the
  // de-dupe (recomputed every render, TodayActions.jsx:47-52) shows it
  // immediately in the deleted row's place — no visible gap, no indication
  // the underlying row identity changed. Confirmed here: dbRowsAfter drops
  // to 1 but the row stays visible the whole time (visibleCountBeforeReload
  // never hits 0), i.e. the delete APPEARED to do nothing even though a real
  // row (the earlier training one) really was removed.
  const noVisibleGap = visibleCountBeforeReload >= 1 && dbRowsAfter.length === 1;
  const stillVisibleAfterReload = visibleCountAfterReload === 1;
  log(dbRowsAfter.length === 1, CASE, `dbRowsBefore=2 dbRowsAfter=${dbRowsAfter.length} visibleBeforeReload=${visibleCountBeforeReload} visibleAfterReload=${visibleCountAfterReload} problems=${rpt.problems.length}`);
  if (noVisibleGap && stillVisibleAfterReload) {
    console.log(`FINDING ${CASE}: deleting the visible (earlier, "training") of two same-text duplicate todos removed it from the DB (dbRowsAfter=1) but the row with text "${TEXT}" never visibly disappeared — the de-dupe (TodayActions.jsx:47-52, recomputed every render) instantly shows the remaining "nutrition" duplicate in its place, with the SAME text, before and after reload (visibleCount stayed 1 the whole time). The athlete sees zero feedback that a delete happened at all — tapping X on what looks like the one todo silently deletes a different underlying row than the one now shown, no confirm/undo to catch the mistake (compounds today-r1-01's no-confirm finding).`);
  } else if (dbRowsAfter.length !== 1) {
    console.log(`FINDING ${CASE} (unexpected): after deleting the visible row, dbRowsAfter=${dbRowsAfter.length} (expected 1). visibleBeforeReload=${visibleCountBeforeReload} visibleAfterReload=${visibleCountAfterReload}.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
