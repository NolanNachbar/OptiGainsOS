// verify r1: re-check fuel-r1-00-ios-keyboard against the current iphone-sim layer.
// Opens Add Food -> Manual entry and taps each field like a thumb would, logging
// the field's rect vs the keyboard line and any layer warnings per field.
import { start, report, snap } from '../../../drive.mjs';
import { dismissKeyboard } from './_lib.mjs';
const s = await start('/fuel');
const p = s.page;
try {
  await p.getByRole('button', { name: 'Add food' }).click();
  await p.waitForTimeout(700);
  const afterOpen = await s.warnings().catch(() => []);
  console.log('after open (autofocus search) warnings:', JSON.stringify(afterOpen));
  console.log('active:', await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
  await dismissKeyboard(p);
  await p.getByRole('button', { name: 'Manual entry' }).click();
  await p.waitForTimeout(300);
  for (const sel of ['#food_name', '#calories', '#protein']) {
    await dismissKeyboard(p);
    const before = (await s.warnings().catch(() => [])).length;
    const loc = p.locator(sel).first();
    const pre = await loc.boundingBox();
    await loc.tap().catch(async () => loc.click());
    await p.waitForTimeout(700);
    const post = await loc.boundingBox();
    const kb = await p.evaluate(() => window.__iphoneSim?.keyboard || null).catch(() => null);
    const w = (await s.warnings().catch(() => [])).slice(before);
    const dlg = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const r = d.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, pos: getComputedStyle(d).position, overflowY: getComputedStyle(d).overflowY, scrollH: d.scrollHeight, clientH: d.clientHeight }; });
    console.log(sel, JSON.stringify({ pre: pre && [Math.round(pre.y), Math.round(pre.height)], post: post && [Math.round(post.y), Math.round(post.height)], kb, dlg, newWarnings: w }));
    await snap(p, `v1-ios-${sel.slice(1)}`);
  }
  await report(s);
} finally { await s.close(); }
