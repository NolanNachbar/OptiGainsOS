// Regression for fuel-r1-01: leaving the Fuel tab open across local midnight
// (no reload/navigation, e.g. a backgrounded iOS home-screen app) left
// selectedDate stuck on the prior day. The Add Food dialog kept reading
// "Logging to ... <yesterday>" and a new entry saved under yesterday's date
// with zero on-screen indication. Fix: FoodTracker re-derives selectedDate
// to today (only when the athlete was already viewing today) on
// visibilitychange/focus/a 60s interval, and also right when Add Food opens.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-01';
// Cross *yesterday's real* midnight rather than a future date: faking the
// clock forward of real "now" makes the Supabase session look expired and
// the test account's real access-token refresh breaks down (the same
// harness artifact documented against fuel-r1-12 — confirmed empirically
// here too: a forward fake, even by <24h, silently signs the session out).
// Faking the clock into the recent past is safe (the client never thinks
// the token needs an early refresh), and yesterday-23:55 -> today-00:10
// still exercises the exact same date-string rollover logic.
function localYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const NOW = new Date();
const DAY_D = localYmd(new Date(NOW.getTime() - 24 * 60 * 60 * 1000));
const DAY_D1 = localYmd(NOW);
const FOOD_NAME = `OVN-${CASE} midnight snack`;

async function cleanup(uid, db) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

test('selectedDate rolls forward to today when Add Food opens after crossing local midnight', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  try {
    // Sign in on the real clock first (a faked "now" before login makes the
    // Supabase session look expired), then fake the time and navigate so the
    // page mounts under the faked date.
    await signIn(page, '/today');
    await page.clock.setFixedTime(new Date(`${DAY_D}T23:55:00-06:00`));
    await page.goto('/fuel');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    // Cross midnight with no reload / navigation.
    await page.clock.setFixedTime(new Date(`${DAY_D1}T00:10:00-06:00`));
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Add food' }).click();
    await page.waitForTimeout(400);

    const dialogHeader = await page.locator('text=Logging to').innerText();
    const staleLabel = new Date(`${DAY_D}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const freshLabel = new Date(`${DAY_D1}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(dialogHeader).not.toContain(staleLabel);
    expect(dialogHeader).toContain(freshLabel);

    await page.getByRole('button', { name: 'Manual entry' }).click();
    await page.waitForTimeout(200);
    await page.locator('#food_name').fill(FOOD_NAME);
    await page.locator('#calories').fill('100');
    await page.locator('#calories').blur();
    await page.waitForTimeout(300);
    const submitBtn = page.getByRole('button', { name: 'Add Food', exact: true });
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click({ timeout: 5000, force: true });
    await page.waitForTimeout(1000);

    const { data: rows, error } = await db.from('food_entries').select('*')
      .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
    expect(error).toBeNull();
    expect(rows.length).toBe(1);
    expect(rows[0].date).toBe(DAY_D1);
  } finally {
    await cleanup(uid, db);
  }
});
