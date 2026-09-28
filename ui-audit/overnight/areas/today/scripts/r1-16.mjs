// today-r1-16: Brief History "This week" bucket uses browser-local now(), not
// profile.timezone — check the boundary is at least self-consistent, not
// "broken" (flip-flopping) across a local midnight.
//
// BriefHistory.jsx:245-249 only renders a group header at all when more than
// one distinct bucket ("This week" / "Earlier") is present among the shown
// briefs (`multiGroup`). A single tagged brief is therefore never enough to
// observe the bucket a brief is actually in — the header is silently
// suppressed. Seed THREE tagged briefs so multiGroup is true at both time
// instants: one always-"Earlier" anchor (a month back), one always-"This
// week" anchor (today), and the TARGET exactly 7 days back, which is the one
// that should flip from "This week" to "Earlier" across the boundary.
//
// Dates are in the PAST relative to real "today" (2026-09-28), not the
// future: a fake clock set to the future makes the real bypass-auth
// session's expires_at look already-expired, triggering an auth refresh
// loop/rate-limit that silently drops the session to anon mid-test
// (confirmed via debugging on r1-02). A past fake date avoids that.
import { report, snap } from '../../../drive.mjs';
import { startWithClock, log } from './_lib1.mjs';
import { testDbRetry as testDb, testUserIdRetry as testUserId } from './_lib1.mjs';

const CASE = 'today-r1-16';
const TEST_TODAY = '2025-11-17';
const TARGET_DATE = '2025-11-10';  // TEST_TODAY - 7 days: should flip This week -> Earlier
const OLD_DATE = '2025-10-10';     // well over 7 days back: always Earlier
const RECENT_DATE = TEST_TODAY;    // 0-1 days back across our midnight cross: always This week
const DATES = [
  { date: TARGET_DATE, tag: `OVN-${CASE}-target` },
  { date: OLD_DATE, tag: `OVN-${CASE}-old` },
  { date: RECENT_DATE, tag: `OVN-${CASE}-recent` },
];
let s;
const insertedDates = [];
try {
  const db = await testDb();
  const uid = await testUserId();

  for (const { date, tag } of DATES) {
    const { data: existing } = await db.from('daily_briefs').select('id').eq('created_by', uid).eq('date', date);
    if (existing && existing.length) throw new Error(`${date} already has a brief — pick another date`);
    const { error: insErr } = await db.from('daily_briefs').insert({
      created_by: uid,
      date,
      brief_json: { insight: `${tag} tagged test brief` },
    });
    if (insErr) throw insErr;
    insertedDates.push(date);
  }

  // Load at 23:59 local on TEST_TODAY (still "day 7" boundary from TARGET_DATE).
  // Denver is MST (-07:00) in November.
  s = await startWithClock('/brief-history', new Date(`${TEST_TODAY}T23:59:00-07:00`));
  await s.page.waitForTimeout(500);
  await snap(s.page, 'r1-16-2359');
  const bucketAt2359 = await bucketFor(s.page, 'target');
  const oldAt2359 = await bucketFor(s.page, 'old');
  const recentAt2359 = await bucketFor(s.page, 'recent');

  // Advance 3 minutes past local midnight (day 8 boundary) and reload.
  await s.page.clock.setFixedTime(new Date(`${TEST_TODAY}T23:59:00-07:00`).getTime() + 3 * 60000);
  await s.page.reload({ waitUntil: 'load' });
  await s.page.waitForTimeout(4000);
  await snap(s.page, 'r1-16-0002-nextday');
  const bucketAt0002 = await bucketFor(s.page, 'target');
  const oldAt0002 = await bucketFor(s.page, 'old');
  const recentAt0002 = await bucketFor(s.page, 'recent');

  const rpt = await report(s);
  const anchorsSane = oldAt2359 === 'Earlier' && oldAt0002 === 'Earlier' && recentAt2359 === 'This week' && recentAt0002 === 'This week';
  const sane = bucketAt2359 === 'This week' && bucketAt0002 === 'Earlier';
  const ok = sane && anchorsSane && rpt.problems.filter((p) => p.type === 'pageerror').length === 0;
  log(ok, CASE, `target: 2359=${bucketAt2359} 0002=${bucketAt0002} | anchors old(2359/0002)=${oldAt2359}/${oldAt0002} recent(2359/0002)=${recentAt2359}/${recentAt0002} problems=${rpt.problems.length}`);

  if (!anchorsSane) {
    console.log(`FINDING ${CASE} (inconclusive): the always-Earlier and always-This-week anchor briefs didn't read the expected buckets (old=${oldAt2359}/${oldAt0002}, recent=${recentAt2359}/${recentAt0002}) — either the tagged briefs weren't visible/rendered (session or pagination issue) or dateGroup() behaved unexpectedly outside the boundary under test. Re-run before drawing conclusions about the target's 7-day flip.`);
  } else if (!ok) {
    console.log(`FINDING ${CASE}: brief dated ${TARGET_DATE} (exactly 7 days back from ${TEST_TODAY}) showed bucket="${bucketAt2359}" at 23:59 local and "${bucketAt0002}" 3 minutes later after crossing local midnight — inconsistent with the expected clean This-week -> Earlier flip (anchors confirmed sane: old brief stayed "Earlier", recent brief stayed "This week" throughout). src/pages/BriefHistory.jsx:42 dateGroup() uses new Date() (browser local now), not profile.timezone, so an athlete whose device timezone differs from profile.timezone can see this cutoff disagree with the rest of the app's day-boundary logic (which uses getTodayString(profile.timezone) elsewhere). Cosmetic grouping only, not data loss.`);
  } else {
    console.log(`FINDING ${CASE} (as-expected, informational): with anchor briefs forcing multiGroup=true at both instants (BriefHistory.jsx:245-249 otherwise suppresses the group header entirely for a single-bucket list — a real risk for THIS test design, now worked around), the 7-day-back brief correctly flips "This week" -> "Earlier" across local midnight, one clean transition, no flicker. Confirmed risk remains theoretical: BriefHistory.jsx:42 dateGroup() still uses new Date() (browser-local), not profile.timezone, so a real device/profile timezone mismatch (e.g. travel) could disagree with the rest of the app's day-boundary logic, which is untestable from a single-timezone harness.`);
  }
} finally {
  for (const date of insertedDates) {
    const db = await testDb();
    const uid = await testUserId();
    const { data } = await db.from('daily_briefs').delete().eq('created_by', uid).eq('date', date).select('id');
    console.log(`CLEANUP ${CASE} daily_briefs deleted(${date})=${data?.length || 0}`);
  }
  if (s) await s.close();
}

async function bucketFor(page, which) {
  const tag = `OVN-${CASE}-${which}`;
  const body = await page.locator('body').innerText().catch(() => '');
  if (!body.includes(tag)) return null;
  const idx = body.indexOf(tag);
  const before = body.slice(0, idx).toUpperCase();
  // Rendered header text is CSS-uppercased ("THIS WEEK" / "EARLIER"), not
  // title-case — match case-insensitively (confirmed via debug body dump).
  const lastThisWeek = before.lastIndexOf('THIS WEEK');
  const lastEarlier = before.lastIndexOf('EARLIER');
  if (lastThisWeek === -1 && lastEarlier === -1) return null;
  return lastThisWeek > lastEarlier ? 'This week' : 'Earlier';
}
