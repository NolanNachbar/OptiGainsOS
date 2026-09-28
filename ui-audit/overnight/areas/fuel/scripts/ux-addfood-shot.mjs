import { start, controls, snap } from '../../../drive.mjs';
const label = process.argv[2] || 'before';
const s = await start('/fuel?bypass_auth=true');
await s.page.waitForTimeout(1500);
let clicked = false;
try {
  await s.page.getByLabel('Add food', { exact: true }).first().click({ timeout: 5000 });
  clicked = true;
} catch (e) { console.log('click err', e.message.slice(0,200)); }
console.log('clicked add item:', clicked);
await s.page.waitForTimeout(1000);
// Expand "Manual entry" so both it and AI estimate are visible in one shot.
const btns2 = await s.page.$$('button');
let expanded = false;
for (const b of btns2) {
  const t = (await b.innerText()).trim();
  if (/manual entry/i.test(t)) { await b.scrollIntoViewIfNeeded(); await b.click(); expanded = true; break; }
}
console.log('expanded manual entry:', expanded);
await s.page.waitForTimeout(500);
// Scroll the dialog's scroll container to the Estimate/Manual-entry zone.
await s.page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const target = btns.find(b => /manual entry/i.test(b.innerText || ''));
  target?.scrollIntoView({ block: 'start' });
});
await s.page.waitForTimeout(300);
console.log(await controls(s.page));
await snap(s.page, `fuel-ux-addfood-${label}`);
await s.close();
