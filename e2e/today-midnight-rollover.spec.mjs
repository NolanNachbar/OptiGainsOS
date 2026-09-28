// Regression for today-r1-05: leaving /today open (or an iOS home-screen app
// backgrounded) across local midnight left `today` stuck on the prior day
// with no on-screen indication — Today.jsx computed it once via
// getTodayString(tz) and nothing re-rendered the page after midnight, so a
// new todo silently saved under yesterday's date and vanished from the next
// day's list. Fix: Today.jsx uses the shared useNowDay(tz) hook (mirrors
// FoodTracker's midnight fix, commit 5331532b), which re-derives on
// visibilitychange/focus/a 60s interval.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-05';
const TASK_TEXT = `OVN-${CASE} midnight todo`;

function localYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const NOW = new Date();
const DAY_D = localYmd(new Date(NOW.getTime() - 24 * 60 * 60 * 1000));
const DAY_D1 = localYmd(NOW);

async function cleanup(uid, db) {
  await db.from('todos').delete().eq('created_by', uid).ilike('text', `%${TASK_TEXT}%`);
}

test('a todo added right after local midnight saves under the new day and is visible', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  // Prevent the brief-seed effect from inserting untagged ai_generated rows
  // for either date this spec crosses (a fresh context has empty
  // localStorage, so it would otherwise reseed and pollute the shared test
  // account).
  await page.addInitScript(([userId, d0, d1]) => {
    localStorage.setItem(`todos_seeded_${userId}_${d0}`, '1');
    localStorage.setItem(`todos_seeded_${userId}_${d1}`, '1');
  }, [uid, DAY_D, DAY_D1]);

  try {
    // Sign in on the real clock (a faked "now" before login makes the
    // Supabase session look prematurely expired), then fake the time and
    // navigate so the page mounts under the faked date.
    await signIn(page, '/today');
    await page.clock.setFixedTime(new Date(`${DAY_D}T23:55:00-06:00`));
    await page.goto('/today');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    // Cross midnight with no reload/navigation, then fire the resume events
    // an iOS home-screen app emits when it comes back to the foreground.
    await page.clock.setFixedTime(new Date(`${DAY_D1}T00:10:00-06:00`));
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Add action' }).click();
    await page.getByPlaceholder('Add a task...').fill(TASK_TEXT);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(800);

    // Visible in the list under the new day (catches a query-key mismatch
    // where the row saves to the new day but the view still reads the old
    // queryKey).
    await expect(page.getByText(TASK_TEXT)).toBeVisible({ timeout: 5000 });

    const { data: rows, error } = await db.from('todos').select('*')
      .eq('created_by', uid).ilike('text', `%${TASK_TEXT}%`);
    expect(error).toBeNull();
    expect(rows.length).toBe(1);
    expect(rows[0].date).toBe(DAY_D1);
  } finally {
    await cleanup(uid, db);
  }
});
