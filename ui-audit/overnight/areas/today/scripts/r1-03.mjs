// today-r1-03: two AI-seeded todos share identical text but different domains
// — the by-text de-dupe silently hides the second one.
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedTodo, cleanupByTag, taggedRows, todayStrLocal } from './_lib1.mjs';

const CASE = 'today-r1-03';
const TEXT = `OVN-${CASE} duplicate text`;
let s;
try {
  const t1 = new Date(Date.now() - 60000).toISOString();
  const t2 = new Date().toISOString();
  await insertTaggedTodo({ date: todayStrLocal(), text: TEXT, source: 'ai_generated', domain: 'training', completed: false, created_at: t1 });
  await insertTaggedTodo({ date: todayStrLocal(), text: TEXT, source: 'ai_generated', domain: 'nutrition', completed: false, created_at: t2 });

  const dbRows = await taggedRows(CASE);
  if (dbRows.length !== 2) throw new Error(`setup failed: expected 2 DB rows, got ${dbRows.length}`);

  s = await start('/today');
  await s.page.waitForTimeout(500);

  const visibleCount = await s.page.locator('div.group', { hasText: TEXT }).count();
  await snap(s.page, 'r1-03-list');

  // Toggle the visible one, then check which underlying row(s) got the update.
  const row = s.page.locator('div.group', { hasText: TEXT }).first();
  await row.getByRole('button', { name: /Mark (complete|incomplete)/ }).click();
  await s.page.waitForTimeout(1000);

  const dbRowsAfter = await taggedRows(CASE);
  const completedRows = dbRowsAfter.filter((r) => r.completed);
  const rpt = await report(s);

  // Bug per map: only 1 of 2 legitimate distinct rows is ever visible/actionable.
  const ok = visibleCount === 2;
  log(ok, CASE, `dbRows=2 visibleCount=${visibleCount} completedRows=${completedRows.map(r=>r.domain).join(',')} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: two distinct DB todos rows share text "${TEXT}" (different domain: training vs nutrition, both source=ai_generated) but only ${visibleCount} rendered in the UI (expected 2 — they are legitimately different rows, only their text collides). The visible one's toggle only updated ${completedRows.length} underlying row(s) (${completedRows.map(r=>r.domain).join(',')}) — the other stays untouched and hidden. src/components/dashboard/TodayActions.jsx:47-52 de-dupe keys purely on t.text, dropping a legitimate second todo with matching text.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
