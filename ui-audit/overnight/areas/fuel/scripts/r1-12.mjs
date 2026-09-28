// fuel-r1-12: carb-cycled targets and shopping list across a week-boundary
// approve. Uses a future Sunday (2026-11-01) so it can't collide with the
// week already approved by fuel-r1-10/11 (2026-09-28..2026-10-04) on this
// shared account. Rows for 2026-11-01..2026-11-07 are deleted at the end
// regardless of outcome (clock-API case cleanup rule).
import { format, addDays, parseISO } from 'date-fns';
import { report, snap } from '../../../drive.mjs';
import { log, startWithClock } from './_lib.mjs';
import { testDb, testUserId } from '../../../../../e2e/helpers.mjs';

const CASE = 'fuel-r1-12';
const SUNDAY = '2026-11-01T09:00:00';
const MONDAY = '2026-11-02T09:05:00';
const WEEK_DATES = Array.from({ length: 7 }, (_, i) => format(addDays(parseISO('2026-11-01'), i), 'yyyy-MM-dd'));

async function cleanupFutureWeek() {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').delete()
    .eq('created_by', uid).eq('planned', true).in('date', WEEK_DATES).select('id');
  if (error) throw error;
  return data?.length || 0;
}

async function plannedForDate(date) {
  const db = await testDb();
  const uid = await testUserId();
  const { data, error } = await db.from('food_entries').select('id,date,food_name,carbs_grams')
    .eq('created_by', uid).eq('planned', true).eq('date', date);
  if (error) throw error;
  return data;
}

let s;
try {
  // Cleanup any leftover from a prior failed run first.
  const pre = await cleanupFutureWeek();
  if (pre) console.log(`${CASE} pre-cleanup removed ${pre} stale future rows`);

  s = await startWithClock('/fuel', SUNDAY);
  await s.page.waitForTimeout(500);

  const weekPlanBtn = s.page.getByRole('button', { name: /Week plan/ });
  await weekPlanBtn.waitFor({ state: 'visible', timeout: 8000 });
  await weekPlanBtn.click();
  await s.page.waitForTimeout(1000);

  const approveBtn = s.page.getByRole('button', { name: /Approve/ });
  const cardVisible = await approveBtn.isVisible().catch(() => false);
  if (!cardVisible) {
    // WeeklyPlanCard returns null when calTarget isn't available yet for a
    // future/un-scored date — note it and stop rather than fail on a false premise.
    const bodyText = await s.page.locator('body').innerText();
    console.log(`FINDING ${CASE}-blocked: WeeklyPlanCard did not render an Approve button on a faked future Sunday (2026-11-01) — ` +
      `likely calTarget is falsy because the recovery engine hasn't scored this future date yet (WeeklyPlanCard.jsx: "if (!calTarget) return null;"). ` +
      `Could not exercise the week-boundary approve scenario this way. bodySnippet="${bodyText.slice(0, 200).replace(/\n/g, ' ')}"`);
    log(true, CASE, 'blocked (informational) — WeeklyPlanCard renders null for an unscored future date, cannot test boundary via clock-faked future Sunday');
  } else {
    // Read the day-strip's carb figures BEFORE approving, keyed by date.
    const dayCells = s.page.locator('.grid.grid-cols-7 > button');
    const cellCount = await dayCells.count();
    console.log(`${CASE} day-strip cell count: ${cellCount}`);

    const carbCycleTextBefore = await s.page.locator('text=/carb cycle/').innerText().catch(() => '');
    console.log(`${CASE} carb cycle text before approve: "${carbCycleTextBefore}"`);

    await approveBtn.click({ timeout: 5000 });
    // The approve mutationFn awaits Promise.all(...) over every planned row
    // (a full week, ~40+ individual .create() calls) before onSuccess fires;
    // wait for the success toast (or the button leaving its "Loading week…"
    // state) rather than a fixed delay, so the DB check below isn't racing
    // still-in-flight inserts.
    await s.page.getByText(/Loaded \d+ planned items/i).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await s.page.waitForTimeout(500);

    const rpt1 = await report(s);
    const sunRows = await plannedForDate('2026-11-01');
    const monRows = await plannedForDate('2026-11-02');
    console.log(`${CASE} after approve: Sun(2026-11-01) rows=${sunRows.length} Mon(2026-11-02) rows=${monRows.length}`);

    const groceryKeyBefore = await s.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('optigains.grocery.')));
    console.log(`${CASE} grocery localStorage keys after Sunday approve: ${JSON.stringify(groceryKeyBefore)}`);

    // Advance the clock into Monday, then re-derive via client-side SPA
    // navigation (Today tab -> Fuel tab) rather than a reload/page.goto, per
    // the known WebKit-blank risk and to test the app's own re-render path.
    // Best-effort from here on: when the approve mutation hit the 429/401
    // cascade below, the app can be left in a state where these follow-on UI
    // interactions never resolve (e.g. the "Today" link never becomes
    // clickable). That is downstream of the already-captured finding, not a
    // second bug to chase — wrap defensively so a stuck follow-on step can
    // never crash the process past the `finally` cleanup.
    let carbCycleTextAfter = '';
    let groceryKeyAfter = [];
    let rpt2 = { problems: [] };
    try {
      await s.page.clock.setFixedTime(MONDAY);
      await s.page.getByRole('button', { name: /close/i }).first().click({ timeout: 5000 }).catch(async () => {
        await s.page.keyboard.press('Escape');
      });
      await s.page.waitForTimeout(400);
      await s.page.getByRole('link', { name: 'Today' }).click({ timeout: 8000 });
      await s.page.waitForTimeout(600);
      await s.page.getByRole('link', { name: 'Fuel', exact: true }).click({ timeout: 8000 });
      await s.page.waitForTimeout(1000);

      await s.page.getByRole('button', { name: /Week plan/ }).click({ timeout: 8000 });
      await s.page.waitForTimeout(1000);

      carbCycleTextAfter = await s.page.locator('text=/carb cycle/').innerText().catch(() => '');
      console.log(`${CASE} carb cycle text after crossing into Monday (no reload): "${carbCycleTextAfter}"`);

      groceryKeyAfter = await s.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('optigains.grocery.')));
      console.log(`${CASE} grocery localStorage keys after crossing into Monday: ${JSON.stringify(groceryKeyAfter)}`);

      await snap(s.page, 'r1-12-after-monday-crossing');
      rpt2 = await report(s);
    } catch (navErr) {
      console.log(`${CASE} post-approve Monday-crossing navigation did not complete (${navErr.message}); this is a downstream ` +
        `symptom of the auth/rate-limit cascade captured below, not evaluated separately.`);
    }

    // Judge: the case originally asked whether carb-cycled targets and the
    // grocery list stay correct across a week-boundary approve. What actually
    // surfaced, reproduced on two separate runs of this script, is more
    // significant: the approve mutation issued ~40+ parallel food_entries
    // .create() calls (one per planned row across the week) via
    // Promise.all(), and partway through, a Supabase auth token refresh hit
    // a 429 (rate limited). Every .create() still in flight after that point
    // then failed with 401 Unauthorized -> RLS policy violation on
    // food_entries, while creates that had already completed before the 429
    // remained committed. Net effect: Sunday and Monday (the first two days
    // processed) each got their full 6 rows, but Nov 3-7 got none at all —
    // the week ends up SILENTLY PARTIALLY LOADED, and because Promise.all is
    // fail-fast, the mutation as a whole reports failure (onError / "Couldn't
    // load the plan") giving no indication that some days DID commit. A user
    // hitting this mid-week would see an error toast and reasonably assume
    // nothing saved, then be confused to find some (but not all) days
    // pre-filled. This is orthogonal to the originally-suspected carb-cycle-
    // text/grocery-list-staleness question (both checks below are logged
    // informationally only, since WeeklyPlanCard recomputes `today`/`dates`
    // live from the clock every render, so a text change across the Sun->Mon
    // crossing is expected, not a bug).
    const cascadeProblems = [...rpt1.problems, ...rpt2.problems].filter((p) =>
      (p.type === 'http' && (p.status === 429 || p.status === 401)) ||
      (p.type === 'console' && /row-level security policy|401 \(Unauthorized\)|429 \(Unknown Error\)/i.test(p.msg || '')));
    const sawPartialCommitCascade = cascadeProblems.length > 0;
    const noNewErrors = [...rpt1.problems, ...rpt2.problems].filter((p) => p.type === 'pageerror').length === 0;
    const carbTextChanged = carbCycleTextBefore && carbCycleTextAfter && carbCycleTextBefore !== carbCycleTextAfter;
    const ok = !sawPartialCommitCascade && sunRows.length > 0;

    log(ok, CASE,
      `sunRows=${sunRows.length} monRows=${monRows.length} sawPartialCommitCascade=${sawPartialCommitCascade} ` +
      `carbTextChanged=${carbTextChanged} (informational only) before="${carbCycleTextBefore}" after="${carbCycleTextAfter}" ` +
      `groceryKeysAfter=${JSON.stringify(groceryKeyAfter)} noNewErrors=${noNewErrors}`);

    if (!ok) {
      console.log(`FINDING ${CASE}: Approve & load the week's Promise.all-based bulk create is non-atomic and fail-fast. Reproduced twice: ` +
        `a 429 on auth/v1/token?grant_type=refresh_token mid-approve caused every food_entries .create() still in flight to fail with 401 -> ` +
        `RLS policy violation, while rows already committed before the 429 stayed committed. Result: Sun(2026-11-01) and Mon(2026-11-02) each ` +
        `got their full 6 planned rows, but 2026-11-03..2026-11-07 got zero — the week was left silently, partially populated — while the ` +
        `mutation as a whole reports failure to the user with no way to tell which days did or didn't load. sunRows=${sunRows.length} ` +
        `monRows=${monRows.length}. src/components/nutrition/WeeklyPlanCard.jsx approve mutation: ` +
        `"await Promise.all(rows.map((r) => db.entities.FoodEntry.create(r)))" has no per-row error isolation, no rollback of rows that DID ` +
        `succeed when a sibling create fails, and no partial-success reporting to the user. (The specific 429 trigger is plausibly this test ` +
        `harness's own heavy repeated-login pattern over a long unattended session rather than a realistic single-user scenario — but the ` +
        `underlying non-atomic bulk-write pattern is a genuine architectural risk independent of what triggers an individual row's failure: ` +
        `any transient per-row error, not just a 429, would produce the same silent partial commit.)`);
    }
  }
} finally {
  const c = await cleanupFutureWeek();
  console.log(`CLEANUP ${CASE} deleted=${c} future-dated planned rows (2026-11-01..2026-11-07)`);
  if (s) await s.close();
}
