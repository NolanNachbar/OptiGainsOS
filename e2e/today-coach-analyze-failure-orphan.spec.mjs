// Regression for today-r1-13: when analyze-form fails after the clip upload
// already succeeded, the catch block in Coach.jsx's analyze() only called
// setError() — it never removed the just-uploaded object from the 'physique'
// bucket, leaving an orphaned clip (and another one on every retry). Fix:
// hoist `path` and an `uploaded` flag above the try, and in the catch, if the
// upload succeeded, remove the orphaned object.
// Review correction: only when analyze-form definitely rejected the request
// (non-2xx / { error } body — both return before its form_reviews insert). A
// network failure is ambiguous (the function may already have saved a review
// pointing at the clip), so the clip is kept there.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-13';
const EXERCISE = `OVN-${CASE} test lift`;

async function listFormObjects(db, uid) {
  const { data, error } = await db.storage.from('physique').list(`${uid}/form`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) return [];
  return data || [];
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function runAnalyze(page) {
  await signIn(page, '/coach');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('OVN-' + CASE + ' fake clip bytes'),
  });
  await page.waitForTimeout(300);
  await page.getByPlaceholder('e.g. Back squat, conventional deadlift').fill(EXERCISE);
  await page.getByRole('button', { name: 'Get critique' }).click();
  // The upload + failed analyze round-trip finishes and the button goes back
  // to "Get critique" (no stuck spinner).
  await expect(page.getByRole('button', { name: 'Get critique' })).toBeEnabled({ timeout: 15000 });
}

async function newObjects(db, uid, beforeNames) {
  const after = await listFormObjects(db, uid);
  return after.filter((o) => !beforeNames.has(o.name));
}

test('analyze-form rejecting the request cleans up the orphaned clip upload', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const beforeNames = new Set((await listFormObjects(db, uid)).map((o) => o.name));

  // Let the real upload succeed, but answer analyze-form with a 500 (no paid
  // Gemini call). CORS headers so WebKit surfaces it as an HTTP error, not a
  // network failure.
  await page.route('**/functions/v1/analyze-form', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: CORS, body: 'ok' });
    return route.fulfill({ status: 500, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'OVN simulated failure' }) });
  });

  try {
    await runAnalyze(page);
    await expect.poll(async () => (await newObjects(db, uid, beforeNames)).length, { timeout: 10000 }).toBe(0);
  } finally {
    const left = await newObjects(db, uid, beforeNames);
    if (left.length) await db.storage.from('physique').remove(left.map((o) => `${uid}/form/${o.name}`));
  }
});

test('a network failure on analyze-form keeps the clip (a review may already point at it)', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  const beforeNames = new Set((await listFormObjects(db, uid)).map((o) => o.name));

  await page.route('**/functions/v1/analyze-form', (route) => route.abort('failed'));

  try {
    await runAnalyze(page);
    // Give any (wrong) cleanup call time to land before asserting it didn't.
    await page.waitForTimeout(2000);
    expect((await newObjects(db, uid, beforeNames)).length).toBe(1);
  } finally {
    const left = await newObjects(db, uid, beforeNames);
    if (left.length) await db.storage.from('physique').remove(left.map((o) => `${uid}/form/${o.name}`));
  }
});
