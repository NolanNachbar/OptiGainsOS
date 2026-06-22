// Re-drive ONE (or a few) authored flows live with a per-step trace, so a verify
// agent can tell a REAL app bug from a bad authored assertion. For each step it
// prints what happened; after the run it dumps visible text + a screenshot path.
//
// Usage:
//   node ui-audit/harness/inspect.mjs <flowId> [flowId2 ...]
//   node ui-audit/harness/inspect.mjs --area food        (all flows whose id starts "food-")
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:5173';
const ROOT = dirname(new URL(import.meta.url).pathname);
const MOBILE = { width: 390, height: 844 };
const flows = JSON.parse(readFileSync(join(ROOT, 'flows.json'), 'utf8'));

let ids = process.argv.slice(2);
if (ids[0] === '--area') ids = flows.filter((f) => f.id.startsWith(ids[1] + '-') || f.id.startsWith(ids[1])).map((f) => f.id);
const picked = flows.filter((f) => ids.includes(f.id));
if (!picked.length) { console.error('no matching flows for', ids); process.exit(1); }

const OUT = join(ROOT, 'inspect-out');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

for (const f of picked) {
  const ctx = await browser.newContext({ viewport: MOBILE, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.split('\n')[0]));
  console.log(`\n===== FLOW ${f.id} :: ${f.label} =====`);
  let first = true;
  for (const [i, s] of f.steps.entries()) {
    const key = Object.keys(s)[0];
    try {
      if (s.goto) { await page.goto(`${BASE}${s.goto}${s.goto.includes('?') ? '&' : '?'}bypass_auth=true`, { waitUntil: 'load' }); if (first) { await page.waitForTimeout(1600); first = false; } console.log(`  ${i} goto ${s.goto} -> ok`); }
      if (s.settle) await page.waitForTimeout(s.settle);
      if (s.click) { const n = await page.locator(s.click).count(); if (n) { await page.click(s.click, { timeout: 3500 }); console.log(`  ${i} click "${s.click}" -> clicked (${n} match)`); } else console.log(`  ${i} click "${s.click}" -> NO MATCH`); }
      if (s.clickText) { const loc = page.getByText(s.clickText, { exact: false }).first(); const n = await loc.count(); if (n) { await loc.click({ timeout: 3500 }); console.log(`  ${i} clickText "${s.clickText}" -> clicked`); } else console.log(`  ${i} clickText "${s.clickText}" -> NO MATCH`); }
      if (s.fill) { const n = await page.locator(s.fill.selector).count(); if (n) { await page.fill(s.fill.selector, s.fill.value, { timeout: 3500 }); console.log(`  ${i} fill "${s.fill.selector}" -> ok`); } else console.log(`  ${i} fill "${s.fill.selector}" -> NO MATCH`); }
      if (s.press) { await page.keyboard.press(s.press); console.log(`  ${i} press ${s.press}`); }
      if (s.expectText) { const t = await page.locator('body').innerText().catch(() => ''); console.log(`  ${i} expectText "${s.expectText}" -> ${t.includes(s.expectText) ? 'PRESENT' : 'ABSENT (assertion would FAIL)'}`); }
      if (s.notText) { const t = await page.locator('body').innerText().catch(() => ''); console.log(`  ${i} notText "${s.notText}" -> ${t.includes(s.notText) ? 'PRESENT (assertion would FAIL)' : 'absent (ok)'}`); }
      if (s.exists) { const n = await page.locator(s.exists).count().catch(() => 0); console.log(`  ${i} exists "${s.exists}" -> ${n} match${n ? '' : ' (assertion would FAIL)'}`); }
      if (s.expectGone) { const n = await page.locator(s.expectGone).count().catch(() => 0); console.log(`  ${i} expectGone "${s.expectGone}" -> ${n} match${n ? ' (assertion would FAIL)' : ' (gone, ok)'}`); }
      if (s.topInside) { const inside = await page.evaluate((sel) => { const r = document.querySelector(sel); if (!r) return null; return r.contains(document.elementFromPoint(Math.floor(innerWidth/2), Math.floor(innerHeight/2))); }, s.topInside); console.log(`  ${i} topInside "${s.topInside}" -> ${inside === null ? 'ROOT MISSING' : inside ? 'inside (ok)' : 'OBSCURED (fail)'}`); }
    } catch (e) { console.log(`  ${i} ${key} -> EXCEPTION ${e.message.split('\n')[0]}`); }
  }
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
  const shot = join(OUT, `${f.id}.png`);
  await page.screenshot({ path: shot });
  console.log(`  VISIBLE TEXT: ${text}`);
  if (errors.length) console.log(`  ERRORS: ${errors.slice(0, 4).join(' | ')}`);
  console.log(`  SHOT: ${shot}`);
  await ctx.close();
}
await browser.close();
