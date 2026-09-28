// fuel-r1-10: double-tap "Approve & load the week" — verify no duplicate
// planned rows (WeeklyPlanCard.jsx approve mutation: delete-then-create of
// planned rows for the week, guarded client-side by approve.isPending only).
import { format, addDays, parseISO } from 'date-fns';
import { start, report, snap, controls } from '../../../drive.mjs';
import { log } from './_lib.mjs';
import { testDb, testUserId } from '../../../../../e2e/helpers.mjs';

const CASE = 'fuel-r1-10';

async function plannedRowsForWeek(dates) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').select('id,date,food_name')
    .eq('created_by', uid).eq('planned', true).in('date', dates);
  if (error) throw error;
  return data;
}

let s;
try {
  const today = format(new Date(), 'yyyy-MM-dd');
  const dates = Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(today), i), 'yyyy-MM-dd'));

  const before = await plannedRowsForWeek(dates);
  console.log(`${CASE} planned rows BEFORE: ${before.length}`);

  s = await start('/fuel');
  await s.page.getByRole('button', { name: /Week plan/ }).click();
  await s.page.waitForTimeout(800);

  const approveBtn = s.page.getByRole('button', { name: /Approve/ });
  await approveBtn.waitFor({ state: 'visible', timeout: 8000 });

  // Fire two near-simultaneous clicks, no await between them, to race the
  // mutation before React re-renders the disabled state.
  const click1 = approveBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const click2 = approveBtn.click({ timeout: 5000 }).catch((e) => ({ err: String(e) }));
  const [r1, r2] = await Promise.all([click1, click2]);
  await s.page.waitForTimeout(3000);

  const bodyText = await s.page.locator('body').innerText();
  const sawSuccessToast = /Loaded \d+ planned items/i.test(bodyText);
  const ctrls = await controls(s.page);
  const stillLoading = /"Loading week…"/.test(ctrls);

  await snap(s.page, 'r1-10-after-double-approve');
  const rpt = await report(s);

  const after = await plannedRowsForWeek(dates);
  console.log(`${CASE} planned rows AFTER: ${after.length}`);

  // Check for duplicates: same (date, food_name) appearing more than once.
  const key = (r) => `${r.date}|${r.food_name}`;
  const counts = {};
  for (const r of after) counts[key(r)] = (counts[key(r)] || 0) + 1;
  const dupes = Object.entries(counts).filter(([, n]) => n > 1);

  const clickErrors = [r1, r2].filter((r) => r && r.err);
  const ok = dupes.length === 0 && clickErrors.length === 0
    && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;

  log(ok, CASE,
    `before=${before.length} after=${after.length} dupes=${dupes.length} sawSuccessToast=${sawSuccessToast} ` +
    `stillLoadingAfter3s=${stillLoading} clickErrors=${clickErrors.length} problems=${rpt.problems.length}`);

  if (!ok) {
    console.log(`FINDING ${CASE}: double-tap Approve produced duplicates or errors. before=${before.length} after=${after.length} ` +
      `dupeKeys=${JSON.stringify(dupes)} clickErrors=${JSON.stringify(clickErrors)} problems=${JSON.stringify(rpt.problems)}. ` +
      `src/components/nutrition/WeeklyPlanCard.jsx approve mutation (delete-then-create for the week's dates) has no server-side lock.`);
  }
  console.log(`FINDING ${CASE}-success-signal (informational): after a successful approve, sawSuccessToast=${sawSuccessToast} ` +
    `(toast.success("Loaded N planned items across the week...") IS wired at WeeklyPlanCard.jsx onSuccess, and the button DOES show ` +
    `disabled + "Loading week…" while approve.isPending — contradicts map.md's claim of "no success/idempotency signal"; that claim ` +
    `does not hold against current source. This finding also serves as evidence for/against it under a real double-tap.)`);

  // Leave the week in a sane state: if this run left more than one plan's
  // worth of rows, re-approve once more (serialized, single click) to reset
  // to a clean single-load state.
  if (dupes.length > 0 || after.length > before.length * 1.5) {
    console.log(`${CASE}: cleanup re-approve to restore a sane single-plan state...`);
    await approveBtn.click({ timeout: 5000 }).catch(() => {});
    await s.page.waitForTimeout(3000);
    const final = await plannedRowsForWeek(dates);
    console.log(`${CASE} planned rows AFTER cleanup re-approve: ${final.length}`);
  }
} finally {
  if (s) await s.close();
}
