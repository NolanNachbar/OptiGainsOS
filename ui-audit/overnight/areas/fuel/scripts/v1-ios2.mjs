// verify r1: reproduce the r1-06/r1-09 path exactly (openManualAdd then fill)
// and compare with waiting for the Manual entry expand animation to finish.
import { start, report } from '../../../drive.mjs';
import { openManualAdd, dismissKeyboard } from './_lib.mjs';
for (const settle of [0, 800]) {
  const s = await start('/fuel');
  const p = s.page;
  try {
    await openManualAdd(p);
    if (settle) await p.waitForTimeout(settle);
    const pre = await p.locator('#food_name').boundingBox();
    await p.locator('#food_name').fill('x');
    await p.waitForTimeout(700);
    const post = await p.locator('#food_name').boundingBox();
    const info = await p.evaluate(() => ({ kb: window.__iphoneSim?.keyboard?.top, inner: innerHeight, scrollY, bodyT: document.body.style.transform }));
    const w = await s.warnings().catch(() => []);
    console.log(`settle=${settle}`, JSON.stringify({ pre: pre && Math.round(pre.y), post: post && Math.round(post.y), info, w: w.map(x => x.code + ' ' + x.where.slice(0, 20)) }));
    // tap again after dismiss, like a user re-tapping
    await dismissKeyboard(p);
    await p.locator('#food_name').tap();
    await p.waitForTimeout(700);
    const post2 = await p.locator('#food_name').boundingBox();
    console.log(`  re-tap post=${post2 && Math.round(post2.y)} warnings=${(await s.warnings().catch(() => [])).length}`);
  } finally { await s.close(); }
}
