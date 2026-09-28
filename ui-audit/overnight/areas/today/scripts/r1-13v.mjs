// verify variant: incidental CSP observation from today-r1-13. Upload a tiny
// tagged object to the test athlete's physique/<uid>/form/ path, point a tagged
// form_reviews row at it, reopen it on /coach, and check whether the <video>
// with the signed https://*.supabase.co URL is blocked by the CSP (index.html
// has no media-src, so default-src 'self' applies to media).
import { start, report } from '../../../drive.mjs';
import { log, insertTaggedReview, cleanupReviews } from './_lib2.mjs';
import { testDbRetry, testUserIdRetry } from './_lib1.mjs';
const CASE = 'today-r1-13v';
let s, path;
const db = await testDbRetry();
try {
  const uid = await testUserIdRetry();
  path = `${uid}/form/OVN-${CASE}.mp4`;
  const { error: upErr } = await db.storage.from('physique').upload(path, new Blob([new Uint8Array(64)], { type: 'video/mp4' }), { contentType: 'video/mp4', upsert: true });
  if (upErr) throw upErr;
  await insertTaggedReview({ clip_path: path, exercise: `OVN-${CASE} real clip`, result: { exercise: `OVN-${CASE} real clip`, critique: 'stub', score: 7 }, rating: 7 });
  s = await start('/coach');
  const csp = [];
  s.page.on('console', (m) => { if (/Content Security Policy|media-src|Refused to load/i.test(m.text())) csp.push(m.text().slice(0, 200)); });
  const entry = s.page.locator(`text=OVN-${CASE} real clip`).first();
  await entry.waitFor({ state: 'visible', timeout: 8000 });
  await entry.click();
  await s.page.waitForTimeout(4000);
  const videoSrc = await s.page.locator('video').first().getAttribute('src').catch(() => null);
  const rpt = await report(s);
  log(csp.length === 0, CASE, `videoSrcHost=${videoSrc ? new URL(videoSrc).host : null} cspBlocks=${JSON.stringify(csp)}`);
} finally {
  if (path) { const { error } = await db.storage.from('physique').remove([path]); console.log(`CLEANUP storage ${path} error=${error?.message || 'none'}`); }
  console.log(`CLEANUP ${CASE} reviews=${await cleanupReviews(CASE)}`);
  if (s) await s.close();
}
