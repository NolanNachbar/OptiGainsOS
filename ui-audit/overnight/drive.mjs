// Drive the app as Nolan's iPhone 13 Pro Max home-screen app (iphone-sim layer:
// real keyboard/picker geometry, safe areas, svh quirk) signed in as the test
// athlete. Collects every console error, page error and failed request so a
// script can't miss one.
//
//   import { start, controls, snap, report } from './drive.mjs';
//   const s = await start('/train');           // s.page, s.context, s.problems
//   ... drive s.page ...
//   await report(s); await s.close();
import { launchIPhone } from '/home/nolan/projects/iphone-sim/index.mjs';
import { mkdirSync } from 'node:fs';

export const ORIGIN = 'http://localhost:5173';
export const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

export async function start(path = '/today', { mode = 'standalone' } = {}) {
  const s = await launchIPhone({ appOrigin: ORIGIN, mode });
  const problems = [];
  s.problems = problems;
  s.page.on('pageerror', (e) => problems.push({ type: 'pageerror', msg: e.message.slice(0, 300) }));
  s.page.on('console', (m) => { if (m.type() === 'error') problems.push({ type: 'console', msg: m.text().slice(0, 300) }); });
  s.page.on('response', (r) => { if (r.status() >= 400) problems.push({ type: 'http', status: r.status(), url: r.url().slice(0, 200) }); });
  await s.page.goto(`${ORIGIN}/today?bypass_auth=true`);
  await s.page.waitForTimeout(2500);
  if (path !== '/today') { await s.page.goto(ORIGIN + path); await s.page.waitForTimeout(2000); }
  return s;
}

// Visible controls, one line each, so a script can target them by role/label.
export async function controls(page) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'; };
    return [...document.querySelectorAll('button,a[href],input,textarea,select,[role=combobox],[role=option],[role=tab],[role=switch],[role=checkbox],[role=menuitem]')].filter(vis).map((e) => {
      const r = e.getBoundingClientRect();
      const t = (e.getAttribute('aria-label') || e.placeholder || e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      return `${e.tagName.toLowerCase()}${e.type && e.tagName === 'INPUT' ? ':' + e.type : ''}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''} "${t}" @${Math.round(r.top)}`;
    }).join('\n');
  });
}

// Screenshot downscaled later by whoever reads it; keep names unique per area/case.
export async function snap(page, name) { const p = `${SHOTS}${name}.png`; await page.screenshot({ path: p }); return p; }

// Problems + iPhone-layer warnings (field hidden by keyboard, wrong keypad, ...).
export async function report(s) {
  const warnings = await s.warnings().catch(() => []);
  const out = { problems: s.problems, warnings };
  console.log('REPORT ' + JSON.stringify(out));
  return out;
}
