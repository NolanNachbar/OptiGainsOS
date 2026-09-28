// Regression for today-r1-17: index.html's CSP had no media-src, so
// default-src 'self' applied to every <video> element. Both the pre-upload
// clip preview (blob: URL) and reopening a past review's clip (signed
// https://*.supabase.co URL) were silently blocked on Coach. Fix: added
// `media-src 'self' blob: https://*.supabase.co;` to the CSP meta
// (index.html:40) — as tight as the existing CSP, nothing else loosened.
//
// This can't assert the video actually plays (no real camera/codec in the
// test harness), so it asserts what we can: no `media-src` CSP violation is
// reported for either the blob: preview or the signed-URL past-review clip.
import { test, expect } from '@playwright/test';
import { signIn, testDb, testUserId } from './helpers.mjs';

const CASE = 'r1-17';
const EXERCISE = `OVN-${CASE} csp clip`;

async function cleanup(uid, db, path) {
  await db.from('form_reviews').delete().eq('created_by', uid).ilike('exercise', `%${CASE}%`);
  if (path) await db.storage.from('physique').remove([path]);
}

test('Coach video elements load under CSP with no media-src violation', async ({ page }) => {
  const db = await testDb();
  const uid = await testUserId();
  await cleanup(uid, db, null);

  const cspViolations = [];
  page.on('console', (m) => {
    if (/media-src|Refused to load/i.test(m.text())) cspViolations.push(m.text().slice(0, 300));
  });

  let path;
  try {
    await signIn(page, '/coach');

    // Blob: preview path — choose a clip, no upload needed.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'ovn-r1-17.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from(new Uint8Array(64)),
    });
    await page.waitForTimeout(500);
    await expect(page.locator('video').first()).toBeVisible();

    // Signed-URL past-review path — seed a tagged clip + form_reviews row,
    // reopen it, and let the dialog's <video src=signedUrl> attempt to load.
    path = `${uid}/form/OVN-${CASE}.mp4`;
    const { error: upErr } = await db.storage.from('physique').upload(
      path,
      new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
      { contentType: 'video/mp4', upsert: true }
    );
    expect(upErr).toBeNull();

    const { error: insErr } = await db.from('form_reviews').insert({
      created_by: uid,
      clip_path: path,
      exercise: EXERCISE,
      result: { exercise: EXERCISE, critique: 'stub', rating: 7 },
    });
    expect(insErr).toBeNull();

    await page.reload();
    await page.waitForLoadState('networkidle');
    const entry = page.locator(`text=${EXERCISE}`).first();
    await entry.waitFor({ state: 'visible', timeout: 8000 });
    await entry.click();
    await page.waitForTimeout(1500);

    expect(cspViolations, `CSP violations: ${JSON.stringify(cspViolations)}`).toEqual([]);
  } finally {
    await cleanup(uid, db, path);
  }
});
