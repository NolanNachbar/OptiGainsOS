// Regression for fuel-r1-09: while offline, React Query's default
// networkMode pauses (not fails) addFoodMutation — it resumes on its own on
// reconnect, so there's no error to catch. The Add Food button was stuck
// reading "Adding..." indefinitely with zero feedback that anything was
// different from a normal slow save. Fix: while the mutation is paused, the
// button reads "Offline - saves when you're back online" instead.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId, openAddFoodDialog } from './helpers.mjs';

const CASE = 'r1-09';
const FOOD_NAME = `OVN-${CASE} offline snack`;

async function cleanup(uid, db) {
  await db.from('food_entries').delete().eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
}

test('offline Add Food shows an honest offline message instead of stuck "Adding..."', async ({ page, context }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  try {
    await signIn(page, '/fuel');

    await openAddFoodDialog(page);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Manual entry' }).click();
    await page.waitForTimeout(200);
    await page.locator('#food_name').fill(FOOD_NAME);
    await page.locator('#calories').fill('100');
    await page.locator('#calories').blur();
    await page.waitForTimeout(300);

    await context.setOffline(true);
    try {
      const submitBtn = page.getByRole('button', { name: 'Add Food', exact: true });
      await submitBtn.scrollIntoViewIfNeeded();
      await submitBtn.click({ timeout: 5000, force: true });

      await expect(page.getByText("Offline - saves when you're back online")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Adding...')).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }

    // Reconnect: the paused mutation resumes on its own and the row lands.
    await expect.poll(async () => {
      const { data } = await db.from('food_entries').select('id')
        .eq('created_by', uid).ilike('food_name', `%${FOOD_NAME}%`);
      return data?.length ?? 0;
    }, { timeout: 10000 }).toBe(1);
  } finally {
    await context.setOffline(false).catch(() => {});
    await cleanup(uid, db);
  }
});
