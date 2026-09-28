// verify r1: back-to-back fills (#food_name then #calories within one frame)
// vs the same fills with a human-scale gap between focuses.
import { start } from '../../../drive.mjs';
import { openManualAdd } from './_lib.mjs';
for (const gap of [600]) {
  const s = await start('/fuel');
  try {
    await openManualAdd(s.page);
    await s.page.locator('#food_name').fill('x');
    await s.page.waitForTimeout(700);
    const r0 = await s.page.locator('#food_name').boundingBox();
    console.log(`gap=${gap} after name: y=${Math.round(r0.y)} w=${(await s.warnings().catch(() => [])).length}`);
    if (gap) await s.page.waitForTimeout(gap);
    await s.page.locator('#calories').fill('150');
    await s.page.waitForTimeout(700);
    const rn = await s.page.locator('#food_name').boundingBox(), rc = await s.page.locator('#calories').boundingBox();
    console.log(`  after cal: name y=${Math.round(rn.y)} cal y=${Math.round(rc.y)} kb=${JSON.stringify(await s.page.evaluate(() => window.__iphoneSim?.keyboard))}`);
    const w = await s.warnings().catch(() => []);
    console.log(`gap=${gap} warnings=${JSON.stringify(w.map(x => x.code + ' ' + x.where.slice(0, 18)))}`);
  } finally { await s.close(); }
}
