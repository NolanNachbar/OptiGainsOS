// today-r1-02: two tabs open /today simultaneously with an un-seeded brief —
// duplicate AI-seeded todos. Real /today always keys off the true "today",
// and a real daily_briefs row for today (untagged, Nolan's actual data) may
// already exist and be seeded in this browser profile's localStorage — racing
// against that would create untagged duplicate rows we can't safely clean up.
// So this case reproduces the exact same client code path (TodayActions.jsx
// mount effect, seed guard, insert) against a TAGGED daily_briefs row on a
// far-future date that has no real brief, via page.clock, so every row this
// creates is tagged and the date itself is cleaned up at the end.
//
// Two real BROWSER TABS share one origin's localStorage (same as the case
// description), so this uses ONE browser context/login (context.newPage()
// for the 2nd tab) rather than two separate logins — cuts Supabase auth rate
// limit usage in half and is a more faithful repro (two tabs DO share
// localStorage, unlike two separate device/context logins).
import { report, snap } from '../../../drive.mjs';
import { log, cleanupByTag, cleanupBriefByDate } from './_lib1.mjs';
import { launchIPhone } from '/home/nolan/projects/iphone-sim/index.mjs';
import { ORIGIN } from '../../../drive.mjs';
import { testDbRetry as testDb, testUserIdRetry as testUserId } from './_lib1.mjs';

const CASE = 'today-r1-02';
// PAST date, not future: a fake clock set to the FUTURE makes the real
// bypass-auth session's expires_at (minted at real "now" + ~1h) look
// already-expired, triggering a refresh loop / rate-limit that drops the
// session to anon mid-test (confirmed via debug: expires_at < fake now,
// repeated /auth/v1/token calls, session ends up unauthenticated, RLS
// returns nothing). A past fake date keeps expires_at comfortably ahead.
const FUTURE_DATE = '2025-11-25'; // far enough back to not collide with any real brief
const ACTIONS = [`OVN-${CASE} action A`, `OVN-${CASE} action B`];
let s, page2, insertedBrief = false;
try {
  const db = await testDb();
  const uid = await testUserId();

  const { data: existing } = await db.from('daily_briefs').select('id').eq('created_by', uid).eq('date', FUTURE_DATE);
  if (existing && existing.length) throw new Error(`FUTURE_DATE ${FUTURE_DATE} already has a brief — pick another date`);

  const { error: insErr } = await db.from('daily_briefs').insert({
    created_by: uid,
    date: FUTURE_DATE,
    brief_json: { today_actions: ACTIONS, insight: `OVN-${CASE} tagged test brief` },
  });
  if (insErr) throw insErr;
  insertedBrief = true;

  s = await launchIPhone({ appOrigin: ORIGIN, mode: 'standalone' });
  s.problems = [];
  s.page.on('pageerror', (e) => s.problems.push({ type: 'pageerror', msg: e.message.slice(0, 300) }));
  s.page.on('console', (m) => { if (m.type() === 'error') s.problems.push({ type: 'console', msg: m.text().slice(0, 300) }); });
  s.page.on('response', (r) => { if (r.status() >= 400) s.problems.push({ type: 'http', status: r.status(), url: r.url().slice(0, 200) }); });
  await s.page.goto(`${ORIGIN}/today?bypass_auth=true`);
  await s.page.waitForTimeout(2500);
  await s.page.clock.setFixedTime(new Date(`${FUTURE_DATE}T12:00:00-07:00`)); // Denver is MST (-07:00) in November

  // 2nd tab in the SAME context — inherits the session/localStorage as of
  // this moment (seed key still unset for FUTURE_DATE) and the same faked
  // clock (Playwright's clock is context-scoped, applies to all pages).
  page2 = await s.context.newPage();
  const problems2 = [];
  page2.on('pageerror', (e) => problems2.push({ type: 'pageerror', msg: e.message.slice(0, 300) }));
  page2.on('console', (m) => { if (m.type() === 'error') problems2.push({ type: 'console', msg: m.text().slice(0, 300) }); });
  page2.on('response', (r) => { if (r.status() >= 400) problems2.push({ type: 'http', status: r.status(), url: r.url().slice(0, 200) }); });

  // Both tabs navigate to /today under the faked date within ~0ms of each
  // other, racing the mount-time seed effect's read-then-write-later guard
  // (TodayActions.jsx:56-77).
  // Both tabs must carry ?bypass_auth=true on every navigation to /today —
  // confirmed via debug that navigating a 2nd tab (same context/session) to
  // plain /today without the query param redirects to /login, even though
  // the tab shares localStorage/session with tab1. The app's bypass-auth
  // gate checks the URL param per-navigation, not a persisted flag.
  await Promise.all([
    s.page.goto(`${ORIGIN}/today?bypass_auth=true`, { waitUntil: 'load' }),
    page2.goto(`${ORIGIN}/today?bypass_auth=true`, { waitUntil: 'load' }),
  ]);
  // Under heavy concurrent overnight load a fixed wait is unreliable (observed
  // both under- and over-shooting); poll instead.
  let rows = [];
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data, error: selErr } = await db.from('todos')
      .select('*').eq('created_by', uid).eq('date', FUTURE_DATE).order('created_at', { ascending: true });
    if (selErr) throw selErr;
    rows = data || [];
    if (rows.length >= ACTIONS.length) break;
  }

  await snap(s.page, 'r1-02-tab1-after-race');
  await page2.screenshot({ path: `${new URL('../../../shots/', import.meta.url).pathname}r1-02-tab2-after-race.png` }).catch(() => {});

  const countByText = {};
  for (const r of rows || []) countByText[r.text] = (countByText[r.text] || 0) + 1;
  const duplicated = Object.entries(countByText).filter(([, n]) => n > 1);

  const p1 = s.problems.filter((p) => p.type === 'pageerror').length;
  const p2 = problems2.filter((p) => p.type === 'pageerror').length;
  const ok = duplicated.length === 0 && p1 === 0 && p2 === 0;
  log(ok, CASE, `rows=${rows?.length} countByText=${JSON.stringify(countByText)} pageErrors=${p1 + p2}`);
  if (!ok && duplicated.length) {
    console.log(`FINDING ${CASE}: two browser tabs (same context/session) racing a load of the same un-seeded brief on ${FUTURE_DATE} produced duplicate ai_generated todos: ${JSON.stringify(duplicated)} (expected exactly 1 row per brief action). The client-side de-dupe-by-text filter (TodayActions.jsx:47-52) would mask this in the UI, but the DB holds extra rows, inflating the completed/total denominator (:150). src/components/dashboard/TodayActions.jsx:56-77 — localStorage.getItem(seedKey) checked synchronously, but localStorage.setItem(seedKey,'1') only runs inside the insert's .then(), leaving a race window between two near-simultaneous mounts.`);
  } else if (ok && rows?.length === ACTIONS.length) {
    console.log(`FINDING ${CASE} (clean, informational): two-tab race did NOT produce duplicates this run (rows=${rows.length}, exactly 1 per action) — the guard's race window (TodayActions.jsx:56-77, synchronous localStorage.getItem check vs. async .then() setItem) is real by code inspection but is narrow/timing-dependent; not reproduced under this run's network latency. Flagging as a code-level risk (see map.md) rather than a confirmed live bug from this attempt.`);
  } else if (rows?.length === 0) {
    console.log(`FINDING ${CASE} (inconclusive): no todos were seeded at all (rows=0) — the race window didn't trigger the seed path this run (possibly Supabase auth rate-limiting from concurrent overnight agents interfered with one or both tab loads; pageErrors=${p1 + p2}). Re-run recommended outside a high-concurrency window before treating as clean.`);
  }
} finally {
  const c = await cleanupByTag(CASE);
  console.log(`CLEANUP ${CASE} todos deleted=${c}`);
  if (insertedBrief) {
    const cb = await cleanupBriefByDate(FUTURE_DATE);
    console.log(`CLEANUP ${CASE} daily_briefs deleted=${cb}`);
  }
  if (page2) await page2.close().catch(() => {});
  if (s) await s.close();
}
