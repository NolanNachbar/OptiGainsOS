// today-r1-12: Coach — reopen a past review whose clip_path doesn't resolve
// to a real storage object. Risk: Coach.jsx:110-115 reopenReview has no
// try/catch around createSignedUrl and no handling for a signed URL that
// 404s when the <video> loads it.
import { start, report, snap } from '../../../drive.mjs';
import { log, insertTaggedReview, taggedReviews, cleanupReviews } from './_lib2.mjs';

const CASE = 'today-r1-12';
let s;
try {
  await insertTaggedReview({
    clip_path: `OVN-${CASE}/nonexistent.mp4`,
    exercise: `OVN-${CASE} bogus clip`,
    result: { exercise: `OVN-${CASE} bogus clip`, critique: 'stub critique for audit', score: 7 },
    rating: 7,
  });

  s = await start('/coach');
  await s.page.waitForTimeout(500);

  const entry = s.page.locator(`text=OVN-${CASE} bogus clip`).first();
  await entry.waitFor({ state: 'visible', timeout: 5000 });
  await entry.click();
  await s.page.waitForTimeout(3000);

  await snap(s.page, 'r1-12-reopen-bogus-clip');
  const dialogText = await s.page.locator('body').innerText().catch(() => '');
  const stuckLoading = /Loading clip/i.test(dialogText);
  const hasVideoEl = await s.page.locator('video').count();

  const rpt = await report(s);
  // Give it more time in case the signed-url fetch is slow, then re-check.
  await s.page.waitForTimeout(3000);
  const dialogText2 = await s.page.locator('body').innerText().catch(() => '');
  const stillStuckLoading = /Loading clip/i.test(dialogText2);

  const ok = !stillStuckLoading;
  log(ok, CASE, `stuckLoadingAt3s=${stuckLoading} stillStuckAt6s=${stillStuckLoading} hasVideoEl=${hasVideoEl} problems=${rpt.problems.length}`);
  if (!ok) {
    console.log(`FINDING ${CASE}: reopening a review whose clip_path has no matching storage object leaves the dialog stuck on "Loading clip…" indefinitely with no error/dismiss affordance. Coach.jsx:110-115 reopenReview has no try/catch around createSignedUrl and no onerror handling on the <video> element for a signed URL that resolves but 404s on fetch. dialogText="${dialogText2.slice(0,200)}"`);
  } else if (hasVideoEl > 0) {
    console.log(`NOTE ${CASE}: dialog did progress past "Loading clip…" (video element rendered with a signed URL even though the underlying object doesn't exist) — the failure mode is a native broken-video element with no app-level error message, not an infinite spinner. Still worth a UX flag: no text tells the athlete the clip is missing/corrupted, just a browser broken-media icon. problems=${rpt.problems.length}`);
  }
} finally {
  const c = await cleanupReviews(CASE);
  console.log(`CLEANUP ${CASE} deleted=${c}`);
  if (s) await s.close();
}
