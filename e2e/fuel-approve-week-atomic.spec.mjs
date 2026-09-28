// Regression for fuel-r1-12: WeeklyPlanCard's approve mutation deleted the
// week's planned rows then re-created them with one food_entries POST per
// row (await Promise.all(rows.map(...FoodEntry.create))). A transient
// per-row failure partway through (a flaky gym network, a token refresh
// hiccup) left the week silently partially loaded, with no per-day
// reporting. Fix: a single `supabase.from("food_entries").insert(rows)`
// call — one atomic PostgREST insert instead of ~40 parallel requests.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

test('approving the week plan sends a single atomic insert, not one request per row', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  await signIn(page, '/fuel');

  const weekPlanBtn = page.getByRole('button', { name: /Week plan/ });
  await weekPlanBtn.waitFor({ state: 'visible', timeout: 8000 });
  await weekPlanBtn.click();
  await page.waitForTimeout(800);

  const approveBtn = page.getByRole('button', { name: /Approve/ });
  const visible = await approveBtn.isVisible().catch(() => false);
  test.skip(!visible, 'WeeklyPlanCard has no calorie target for today on this account right now; nothing to approve');

  let insertRequestCount = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/rest\/v1\/food_entries(\?|$)/.test(req.url())) {
      insertRequestCount += 1;
    }
  });

  await approveBtn.click();
  await expect(page.getByText(/Loaded \d+ planned items/)).toBeVisible({ timeout: 8000 });

  // Atomic: exactly one insert request, regardless of how many planned rows
  // the week produced (previously one request per row, ~7-40+).
  expect(insertRequestCount).toBe(1);

  const { data: planned } = await db.from('food_entries').select('id').eq('created_by', uid).eq('planned', true);
  expect((planned?.length ?? 0)).toBeGreaterThan(0);
});
