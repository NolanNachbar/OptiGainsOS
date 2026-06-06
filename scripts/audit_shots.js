import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import fs from 'fs';

const chromePath = (() => { try { return execSync('which google-chrome').toString().trim(); } catch { return '/usr/bin/google-chrome'; } })();
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:5174';
const OUT = '/tmp/audit-shots';
fs.mkdirSync(OUT, { recursive: true });

const routes = [
  'dashboard','fuel','train','insights','workouts','weekly-schedule',
  'program-builder','food-tracker','create-workout','profile',
  'quick-workout','recovery','mind','career','brief-history',
  'progress','athlete-state'
];

const viewports = [
  { name: 'mobile', width: 390, height: 844, dsf: 2 },
  { name: 'desktop', width: 1440, height: 900, dsf: 1 },
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  // prime bypass
  await page.goto(`${BASE}/?bypass_auth=true`, { waitUntil: 'networkidle2' }).catch(()=>{});
  await page.evaluate(() => localStorage.setItem('bypass_auth','true'));

  const report = [];
  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf });
    for (const r of routes) {
      try {
        await page.goto(`${BASE}/${r}?bypass_auth=true`, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(1800);
        const metrics = await page.evaluate(() => ({
          scrollH: document.documentElement.scrollHeight,
          viewH: window.innerHeight,
          cards: document.querySelectorAll('[class*="rounded-2xl"],[class*="rounded-xl"]').length,
        }));
        const screens = (metrics.scrollH / metrics.viewH).toFixed(2);
        report.push({ vp: vp.name, route: r, scrollH: metrics.scrollH, screens, cards: metrics.cards });
        await page.screenshot({ path: `${OUT}/${vp.name}-${r}.png`, fullPage: vp.name === 'mobile' });
      } catch (e) {
        report.push({ vp: vp.name, route: r, error: e.message.slice(0,60) });
      }
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
