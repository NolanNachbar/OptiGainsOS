// Concurrent deterministic capture for the OptiGains mobile audit.
//
// Each journey runs in its OWN isolated Playwright context (no shared gstack
// daemon, so no tab-stomping) at 390x844. We capture screenshots + console/page
// errors, and auto-flag HARD failures (white-screen, pageerror, missing text).
// Hard failures are ground truth — they don't need an LLM to confirm. The judge
// (judge.workflow.js) only opines on the visual/taste stuff from the screenshots.
//
// Why this exists: an LLM agent "diagnosed" a workout-logging crash that wasn't
// real. Deterministic capture is the verifier; vision-judging is advisory.
//
// Run: bun ui-audit/harness/capture.mjs        (dev server must be on :5173)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:5173';
const ROOT = dirname(new URL(import.meta.url).pathname);       // ui-audit/harness
const REPO = join(ROOT, '../..');
const OUT = join(ROOT, process.env.OUTDIR || 'out'); // OUTDIR=out-verify to avoid clobbering a running judge
const MOBILE = { width: 390, height: 844 };
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

// Surfaces: derived from App.jsx's route table so the list never drifts.
const appJsx = readFileSync(join(REPO, 'src/App.jsx'), 'utf8');
const surfaces = [...appJsx.matchAll(/\{\s*path:\s*"(\/[^"]+)",\s*name:\s*"([^"]+)"/g)]
  .filter(m => !m[1].includes(':'))
  .map(m => ({
    id: `surface-${m[2]}`,
    label: `${m[2]} loads (${m[1]})`,
    steps: [{ goto: m[1] }, { settle: 2200 }, { shot: 'load' }, { notBlank: true }],
  }));

// Flows: scripted multi-step journeys. Selectors prefer data-tutorial hooks.
// A missing click is recorded (not fatal) so a moved selector shows up as a gap.
const flows = [
  { id: 'D2-log-workout', label: 'Open a saved workout and start logging', steps: [
    { goto: '/train?tab=library' }, { settle: 2200 }, { shot: 'library' },
    { click: 'a[href*="workout-detail"]' }, { settle: 1600 }, { shot: 'detail' },
    { clickText: 'Start Fresh' }, { settle: 900 }, // dismiss Resume sheet if an in-progress session exists
    { click: '[data-tutorial="start-logging-btn"]' }, { settle: 1600 }, { shot: 'logging' },
    { expectText: 'Logging' },
  ]},
  { id: 'B2-dead-end-guard', label: 'Unmatched route must not white-screen', steps: [
    { goto: '/workouts/detail?id=null' }, { settle: 1600 }, { shot: 'after' }, { notBlank: true },
  ]},
];

const journeys = [...surfaces, ...flows];

async function runJourney(browser, j) {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  const dir = join(OUT, j.id);
  mkdirSync(dir, { recursive: true });
  const shots = [];
  let hardFail = null;
  let first = true;
  try {
    for (const [i, step] of j.steps.entries()) {
      if (step.goto) {
        const url = `${BASE}${step.goto}${step.goto.includes('?') ? '&' : '?'}bypass_auth=true`;
        await page.goto(url, { waitUntil: 'load' }); // never networkidle: Vite HMR socket never settles
        if (first) { await page.waitForTimeout(1500); first = false; } // let bypass login resolve
      }
      if (step.settle) await page.waitForTimeout(step.settle);
      if (step.click) { try { await page.click(step.click, { timeout: 4000 }); } catch { errors.push('click-miss: ' + step.click); } }
      if (step.clickText) { try { await page.getByText(step.clickText, { exact: false }).first().click({ timeout: 4000 }); } catch { errors.push('clickText-miss: ' + step.clickText); } }
      if (step.shot) { const p = join(dir, `${i}-${step.shot}.png`); await page.screenshot({ path: p }); shots.push(`ui-audit/harness/out/${j.id}/${i}-${step.shot}.png`); }
      if (step.notBlank) { const t = (await page.locator('body').innerText().catch(() => '')).trim(); if (t.length < 30) hardFail = 'white-screen'; }
      if (step.expectText) { const t = await page.locator('body').innerText().catch(() => ''); if (!t.includes(step.expectText)) hardFail = `missing text: "${step.expectText}"`; }
    }
  } catch (e) { hardFail = 'exception: ' + e.message.split('\n')[0]; }
  const finalText = (await page.locator('body').innerText().catch(() => '')).slice(0, 400).replace(/\s+/g, ' ');
  const pageErr = errors.find((e) => e.startsWith('pageerror'));
  if (!hardFail && pageErr) hardFail = pageErr;
  await ctx.close();
  return { id: j.id, label: j.label, hardFail, errors, shots, finalText };
}

async function pool(items, n, fn) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const started = Date.now();
const browser = await chromium.launch();
const results = await pool(journeys, CONCURRENCY, (j) => runJourney(browser, j));
await browser.close();
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ base: BASE, root: REPO, elapsedSec: elapsed, results }, null, 2));
const fails = results.filter((r) => r.hardFail);
console.log(`captured ${results.length} journeys in ${elapsed}s @ concurrency ${CONCURRENCY}, ${fails.length} hard failure(s):`);
for (const f of fails) console.log(`  HARD FAIL  ${f.id}: ${f.hardFail}`);
const misses = results.filter((r) => r.errors.some((e) => e.includes('-miss:')));
for (const m of misses) console.log(`  selector-miss  ${m.id}: ${m.errors.filter((e) => e.includes('-miss:')).join(', ')}`);
