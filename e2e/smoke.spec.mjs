import { test, expect } from '@playwright/test';
import { signIn, testDb } from './helpers.mjs';

test('app loads Today signed in as the test athlete', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('navigation').first()).toBeVisible();
  const db = await testDb();
  const { error } = await db.from('workouts').select('id', { head: true, count: 'exact' });
  expect(error).toBeNull();
});
