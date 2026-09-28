// verify r1: tap name, then move to calories/protein with the keyboard left up via the
// accessory bar (layer moveFocus -> el.focus()), the real way to reach a field under the keyboard.
import { start } from '../../../drive.mjs';
import { openManualAdd } from './_lib.mjs';
const s = await start('/fuel');
try {
  await openManualAdd(s.page);
  for (const sel of ['#food_name', '#calories', '#protein']) {
    const n0 = (await s.warnings().catch(() => [])).length;
    const st = () => s.page.evaluate((q) => { const e = document.querySelector(q); let sc = e.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement; return { y: Math.round(e.getBoundingClientRect().top), winY: scrollY, body: document.body.style.transform, inner: sc ? sc.scrollTop : null }; }, sel);
    console.log(' pre', sel, JSON.stringify(await st()));
    if (sel === '#food_name') await s.page.locator(sel).tap();
    else await s.page.evaluate((q) => document.querySelector(q).focus(), sel); // accessory-bar next: moveFocus() -> el.focus()
    await s.page.waitForTimeout(700);
    console.log(' post', sel, JSON.stringify(await st()));
    await s.page.waitForTimeout(700);
    const b = await s.page.locator(sel).boundingBox();
    const w = (await s.warnings().catch(() => [])).slice(n0);
    console.log(sel, 'y', Math.round(b.y), 'kbTop', await s.page.evaluate(() => window.__iphoneSim?.keyboard?.top), 'warnings', JSON.stringify(w.map((x) => x.code)));
  }
} finally { await s.close(); }
