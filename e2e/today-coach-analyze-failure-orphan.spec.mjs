// Regression for today-r1-13: when analyze-form fails after the clip upload
// already succeeded, the catch block in Coach.jsx's analyze() only called
// setError() — it never removed the just-uploaded object from the 'physique'
// bucket, leaving an orphaned clip (and another one on every retry). Fix:
// hoist `path` and an `uploaded` flag above the try, and in the catch, if the
// upload succeeded, remove the orphaned object.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-13';
const EXERCISE = `OVN-${CASE} test lift`;

async function listFormObjects(db, uid) {
  const { data, error } = await db.storage.from('physique').list(`${uid}/form`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) return [];
  return data || [];
}

test('a failed analyze-form call cleans up the orphaned clip upload', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();

  const before = await listFormObjects(db, uid);
  const beforeNames = new Set(before.map((o) => o.name));

  // Let the real upload succeed, but abort only the analyze-form invoke so
  // the analysis step fails without making a paid Gemini call.
  await page.route('**/functions/v1/analyze-form', (route) => route.abort('failed'));

  await signIn(page, '/coach');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('OVN-' + CASE + ' fake clip bytes'),
  });
  await page.waitForTimeout(300);

  await page.getByPlaceholder('e.g. Back squat, conventional deadlift').fill(EXERCISE);
  await page.getByRole('button', { name: 'Get critique' }).click();

  // The upload + failed analyze round-trip finishes and the button goes back
  // to "Get critique" (no stuck spinner) with an error shown.
  await expect(page.getByRole('button', { name: 'Get critique' })).toBeEnabled({ timeout: 15000 });

  await expect.poll(async () => {
    const after = await listFormObjects(db, uid);
    return after.filter((o) => !beforeNames.has(o.name)).length;
  }, { timeout: 10000 }).toBe(0);
});
