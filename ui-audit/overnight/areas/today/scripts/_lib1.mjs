// Shared setup/cleanup for today-r1 attack scripts (todos + brief-history).
// Pattern follows areas/fuel/scripts/_lib.mjs.
import { launchIPhone } from '/home/nolan/projects/iphone-sim/index.mjs';
import { ORIGIN } from '../../../drive.mjs';
import * as helpers from '/home/nolan/projects/OptiGains/e2e/helpers.mjs';

export function log(pass, title, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${title} :: ${detail}`);
}

// The overnight run has several concurrent attackers/fixers all calling
// testDb() (each a fresh signInWithPassword) — observed hitting Supabase's
// auth rate limit intermittently, which can make testUserId() resolve to
// null with no thrown error (auth.getUser() silently returns no user).
// Retry with backoff rather than let that read as "no rows" / a false clean
// result.
let cachedUid;
async function testUserIdRetry(tries = 5) {
  if (cachedUid) return cachedUid;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const uid = await helpers.testUserId();
      if (uid) { cachedUid = uid; return uid; }
      lastErr = new Error('testUserId resolved to null (likely auth rate-limited)');
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw lastErr;
}
async function testDbRetry() { return helpers.testDb(); }
export { testDbRetry, testUserIdRetry };

// Like drive.mjs's start(), but fakes Date/"now" after a real login (same
// two lessons fuel's _lib.mjs learned: clock.install() breaks the bypass-auth
// loading spinner, and faking time before login makes the Supabase session
// look expired).
export async function startWithClock(path, time) {
  const s = await launchIPhone({ appOrigin: ORIGIN, mode: 'standalone' });
  const problems = [];
  s.problems = problems;
  s.page.on('pageerror', (e) => problems.push({ type: 'pageerror', msg: e.message.slice(0, 300) }));
  s.page.on('console', (m) => { if (m.type() === 'error') problems.push({ type: 'console', msg: m.text().slice(0, 300) }); });
  s.page.on('response', (r) => { if (r.status() >= 400) problems.push({ type: 'http', status: r.status(), url: r.url().slice(0, 200) }); });
  await s.page.goto(`${ORIGIN}/today?bypass_auth=true`);
  await s.page.waitForTimeout(2500);
  await s.page.clock.setFixedTime(time);
  // Always force a fresh navigation after fixing the clock, even when path is
  // '/today' — the component's `today` const is computed once per mount from
  // the real Date.now() captured during the initial (pre-fake) login load,
  // and nothing re-renders it just because Date.now() changed underneath.
  // Confirmed empirically: skipping this leaves rows saved under the REAL
  // date, not the faked one. A cold reload after bypass_auth needs ~4-5s to
  // fully resettle (re-auth + refetch), not the 2s used for a same-path nav.
  await s.page.goto(ORIGIN + path, { waitUntil: 'load' });
  await s.page.waitForTimeout(path === '/today' ? 4500 : 2500);
  return s;
}

export async function dismissKeyboard(page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
}

// Opens the inline "add action" row on /today's Today's Actions card. The
// overnight run is under heavy concurrent load (several attackers/fixers
// hitting the same dev server + Supabase project), so a plain .click() can
// hit the button mid-hydration and silently no-op; wait for it explicitly
// with a generous timeout (observed flaky at 5-9s waits, reliable by 15s).
export async function openAddTodo(page) {
  const btn = page.getByRole('button', { name: 'Add action' });
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(300);
}

export async function addTodoViaUI(page, text, { pressEnter = false } = {}) {
  const input = page.getByPlaceholder('Add a task...');
  await input.fill(text);
  await page.waitForTimeout(100);
  if (pressEnter) {
    await input.press('Enter');
  } else {
    await dismissKeyboard(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await page.waitForTimeout(1000);
}

// Deletes every tagged row for this case, across ALL dates (clock cases can
// write past/future-dated rows) — by text prefix, scoped to the test athlete.
export async function cleanupByTag(caseId) {
  const db = await testDbRetry();
  const uid = await testUserIdRetry();
  const { data, error } = await db.from('todos').delete()
    .eq('created_by', uid)
    .ilike('text', `OVN-${caseId}%`)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

export async function insertTaggedTodo(fields) {
  const db = await testDbRetry();
  const uid = await testUserIdRetry();
  const { data, error } = await db.from('todos').insert({ created_by: uid, ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function taggedRows(caseId) {
  const db = await testDbRetry();
  const uid = await testUserIdRetry();
  const { data, error } = await db.from('todos').select('*')
    .eq('created_by', uid)
    .ilike('text', `OVN-${caseId}%`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export function todayStrLocal(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Deletes any daily_briefs rows this script inserted (for the r1-16 case).
export async function cleanupBriefByDate(dateStr) {
  const db = await testDbRetry();
  const uid = await testUserIdRetry();
  const { data, error } = await db.from('daily_briefs').delete()
    .eq('created_by', uid)
    .eq('date', dateStr)
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}
