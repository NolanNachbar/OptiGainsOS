// Regression for body-r1-02: the Progress > Weight tab's "Log Weight" form had
// no bounds check, unlike WeighInPrompt's BOUNDS=[50,700] lbs guard on the same
// write path (useLogWeight). An implausible transposed-digit value (1810 for
// 181) saved silently with a success toast. Fix: Progress.jsx now validates
// against the same BOUNDS before writing, and shows an inline error instead of
// saving.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'body-r1-02';
const NOTE = `OVN-${CASE}`;

// A backdated day well clear of any other case's date, and of "today" (which
// the shared test account may have a real-looking weigh-in for).
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DATE = dateOffset(-11);

async function cleanup(uid, db) {
  await db.from('body_weight_entries').delete().eq('created_by', uid).eq('recorded_date', DATE);
}

test('Progress Weight tab rejects an out-of-bounds weight instead of saving it silently', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  try {
    await signIn(page, '/fuel?tab=body');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Weight', exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator('summary:has-text("Log Weight")').click();
    await page.waitForTimeout(300);

    await page.locator('input[type="date"]').first().fill(DATE);
    await page.locator('input[type="number"]').first().fill('1810');
    await page.getByPlaceholder('Morning, fasted...').fill(NOTE);
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await page.waitForTimeout(1000);

    // No row saved for the implausible value.
    const { data: afterBad } = await db.from('body_weight_entries')
      .select('*').eq('created_by', uid).eq('recorded_date', DATE);
    expect(afterBad?.length || 0).toBe(0);

    // An inline error is shown, not a silent success.
    await expect(page.locator('body')).toContainText(/expected 50-700|reads as/i);

    // A plausible value on the same form still saves normally.
    await page.locator('input[type="number"]').first().fill('183');
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await page.waitForTimeout(1000);

    const { data: afterGood } = await db.from('body_weight_entries')
      .select('*').eq('created_by', uid).eq('recorded_date', DATE);
    expect(afterGood?.length).toBe(1);
    expect(afterGood[0].weight).toBe(183);
  } finally {
    await cleanup(uid, db);
  }
});
