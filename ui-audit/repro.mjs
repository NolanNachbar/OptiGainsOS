// Deterministic crash repro: drive one surface, dump console + page errors.
// Usage: bun ui-audit/repro.mjs "<path>" "<clickText?>"
// ponytail: throwaway-ish probe; grows into the per-journey capture worker.
import { chromium } from 'playwright';

const path = process.argv[2] || '/today';
const clickText = process.argv[3] || null;
const base = 'http://localhost:5173';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));

const url = `${base}${path}${path.includes('?') ? '&' : '?'}bypass_auth=true`;
await page.goto(url, { waitUntil: 'load' }); // never networkidle (Vite HMR socket never settles)
await page.waitForTimeout(2500);

if (clickText) {
  try {
    const sel = clickText.startsWith('@') ? page.locator(clickText.slice(1)) : page.getByText(clickText, { exact: false }).first();
    await sel.click({ timeout: 5000 });
    await page.waitForTimeout(2500);
  } catch (e) {
    errors.push('click-failed: ' + e.message.split('\n')[0]);
  }
}

console.log('URL:', url);
console.log('TITLE:', await page.title());
console.log('VISIBLE TEXT (first 400):', (await page.locator('body').innerText().catch(() => '')).slice(0, 400).replace(/\n+/g, ' | '));
console.log('ERRORS (' + errors.length + '):');
for (const e of errors) console.log('  -', e.slice(0, 600));
await browser.close();
