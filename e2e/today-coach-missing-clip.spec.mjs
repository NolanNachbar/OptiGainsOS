// Regression for today-r1-12: reopening a past review whose clip is missing
// from storage left the dialog stuck on "Loading clip…" forever. reopenReview
// (Coach.jsx) destructured only `data` from createSignedUrl and never checked
// `error`, so a failed sign (object not found, or a flaky connection) quietly
// resolved to url=null with nothing to say the spinner would never resolve.
// Fix: capture the error and render an explicit "Clip unavailable" message
// instead of the spinner.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-12';
const EXERCISE = `OVN-${CASE} test lift`;
const CLIP_PATH = `${CASE}/nonexistent-${Date.now()}.mp4`;

async function cleanup(uid, db) {
  await db.from('form_reviews').delete().eq('created_by', uid).ilike('exercise', `%${EXERCISE}%`);
}

test('reopening a review with a missing clip shows an error instead of spinning forever', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db);

  const { error: insErr } = await db.from('form_reviews').insert({
    created_by: uid, exercise: EXERCISE, clip_path: CLIP_PATH, result: null,
  });
  expect(insErr).toBeNull();

  try {
    await signIn(page, '/coach');
    await page.waitForTimeout(500);

    const row = page.getByRole('button', { name: new RegExp(EXERCISE) });
    await row.waitFor({ state: 'visible', timeout: 8000 });
    await row.click();

    await expect(page.getByText('Clip unavailable - check your connection or re-upload')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Loading clip…')).toHaveCount(0);
  } finally {
    await cleanup(uid, db);
  }
});
