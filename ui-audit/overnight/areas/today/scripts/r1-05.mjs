// today-r1-05: add a todo right after local midnight with the tab left open
// since before midnight — does it land on stale yesterday's date silently?
import { report, snap } from '../../../drive.mjs';
import { startWithClock, log, addTodoViaUI, openAddTodo, cleanupByTag, taggedRows, dismissKeyboard } from './_lib1.mjs';

const CASE = 'today-r1-05';
// PAST dates, not future/today: a fake clock at or after real "now" (or in
// the future) makes the real bypass-auth session's expires_at look already
// expired, triggering an auth refresh loop / rate-limit that silently drops
// the session to anon mid-test (confirmed via debug on r1-02: expires_at <
// fake-now caused repeated /auth/v1/token calls and empty/anon page state).
// A past fake date keeps expires_at comfortably ahead of the faked "now".
const DAY_D = '2025-09-29';   // Mon, MDT (-06:00)
const DAY_D1 = '2025-09-30';  // Tue, MDT (-06:00)
let s;
try {
  s = await startWithClock('/today', new Date(`${DAY_D}T23:56:00-06:00`));

  // Cross midnight with no reload / no navigation.
  await s.page.clock.setFixedTime(new Date(`${DAY_D1}T00:08:00-06:00`));
  await s.page.waitForTimeout(2500);

  await openAddTodo(s.page);
  await dismissKeyboard(s.page);
  await snap(s.page, 'r1-05-before-submit');
  await addTodoViaUI(s.page, `OVN-${CASE} midnight todo`);

  const rows = await taggedRows(CASE);
  const rpt = await report(s);
  const loggedDate = rows?.[0]?.date;
  const staleDate = loggedDate === DAY_D;

  const ok = rows?.length === 1 && !staleDate;
  const authProblem = rpt.problems.some((p) => p.type === 'http' && (p.status === 401 || p.status === 429));
  log(ok, CASE, `rows=${rows?.length} date=${loggedDate} expected=${DAY_D1} problems=${rpt.problems.length}`);
  if (!ok && rows?.length === 0 && authProblem) {
    console.log(`FINDING ${CASE} (inconclusive): no tagged row was saved at all (rows=0) and a 401/429 was seen (likely Supabase auth rate-limiting from concurrent overnight agents, not the midnight-staleness behavior under test). Re-run recommended before treating as clean or as a confirmed bug.`);
  } else if (!ok) {
    console.log(`FINDING ${CASE}: crossing local midnight (${DAY_D} 23:56 -> ${DAY_D1} 00:08) with /today left open (no reload/navigation) leaves the 'today' prop stuck on ${DAY_D}. The todo added at 00:08 the new day was saved with date=${loggedDate} (expected ${DAY_D1}), with zero on-screen indication it's still logging to yesterday. It will not appear when the athlete reopens the app expecting a clean list the next morning. src/pages/Today.jsx:55 const today = getTodayString(profile?.timezone) is computed once per render/mount, not re-derived from a live clock; TodayActions.jsx receives it as a static prop.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
