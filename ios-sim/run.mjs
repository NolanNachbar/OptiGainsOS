// Drives OptiGains in Apple's iOS Simulator (iPhone 13 Pro Max, iOS 26) on a
// GitHub macOS runner, so screenshots show the real iOS keyboard, QuickType bar,
// native <select>/date pickers and Safari/home-screen chrome.
//
// Screenshots come from `simctl io screenshot` (the whole device screen), never
// from WebDriver, which only captures the web viewport and would drop the
// keyboard and pickers.
//
// Run by .github/workflows/ios-sim.yml. Env: UDID, BASE_URL, FLOW, OUT,
// SIM_EMAIL, SIM_PASSWORD. Flows live in ios-sim/flows/<name>.json.
//
// Steps:
//   { "goto": "/today" }            Safari only: load BASE_URL + path
//   { "tap": "css selector" }       Safari only: real touch on a DOM element (nativeWebTap)
//   { "tapText": "Label" }          native tap by accessibility label/value/placeholder (Safari or PWA)
//   { "type": "text" }              type through the on-screen keyboard; "$SIM_EMAIL"/"$SIM_PASSWORD" expand
//   { "shot": "name" }              full-screen device screenshot
//   { "dump": "name" }              native accessibility tree XML (for finding labels)
//   { "wait": 1500 }
//   { "login": true }               macro: sign in through the UI, with keyboard shots
//   { "installPwa": true }          Add to Home Screen from Safari, then launch the icon (standalone mode)
//   { "hideKeyboard": true }
//   { "measure": "name" }            calibration: keyboard/picker frames + page metrics + shot
//   { "pwaName": "Calibrate" }        home-screen icon name for installPwa (default: app manifest)
import { remote } from 'webdriverio';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const { UDID, BASE_URL, FLOW = 'probe', OUT = 'out' } = process.env;
const HERE = dirname(new URL(import.meta.url).pathname);
const steps = JSON.parse(readFileSync(join(HERE, 'flows', `${FLOW}.json`), 'utf8'));
mkdirSync(OUT, { recursive: true });

let n = 0;
let standalone = false;
const log = (...a) => console.log(`[sim]`, ...a);
const results = [];

const shot = (name) => {
  const file = join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`);
  execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', file]);
  log('shot', file);
};

const driver = await remote({
  hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'warn',
  connectionRetryTimeout: 600_000,
  capabilities: {
    platformName: 'iOS',
    browserName: 'Safari',
    'appium:automationName': 'XCUITest',
    'appium:udid': UDID,
    'appium:nativeWebTap': true,
    'appium:connectHardwareKeyboard': false,
    'appium:wdaLaunchTimeout': 480_000,
    'appium:newCommandTimeout': 900,
  },
});

const native = () => driver.switchContext('NATIVE_APP');
const web = async () => {
  const ctxs = await driver.getContexts();
  const w = ctxs.map(c => (typeof c === 'string' ? c : c.id)).filter(c => c !== 'NATIVE_APP').pop();
  if (w) await driver.switchContext(w);
};

const q = (s) => s.replace(/"/g, '\\"');
async function findNative(text, timeout = 8000) {
  const exact = `label == "${q(text)}" OR name == "${q(text)}" OR value == "${q(text)}" OR placeholderValue == "${q(text)}"`;
  const loose = `label BEGINSWITH "${q(text)}" OR name BEGINSWITH "${q(text)}"`;
  const field = `type IN {"XCUIElementTypeTextField","XCUIElementTypeSecureTextField","XCUIElementTypeTextView"} AND (${exact})`;
  for (const pred of [field, exact, loose]) {
    const el = await driver.$(`-ios predicate string:(${pred}) AND visible == 1`);
    if (await el.waitForExist({ timeout, timeoutMsg: '' }).catch(() => false)) return el;
    timeout = 2000;
  }
  throw new Error(`native element not found: ${text}`);
}

let lastTapped = null; // web fields don't report hasKeyboardFocus, so type into what we tapped

async function tapText(text) {
  await native();
  lastTapped = await findNative(text);
  await lastTapped.click();
}

// Safari shows first-run tips (e.g. "View Bookmarks, Share Menu…") over the page.
async function dismissTips() {
  await native();
  for (let i = 0; i < 3; i++) {
    const x = await driver.$('-ios predicate string:name == "xmark.circle.fill" AND visible == 1');
    if (!(await x.isExisting())) return;
    await x.click();
    await driver.pause(500);
  }
}

async function type(text) {
  const val = text.replace(/\$(SIM_EMAIL|SIM_PASSWORD)/g, (_, k) => process.env[k] ?? '');
  await native();
  let el = lastTapped;
  if (!el) {
    el = await driver.$('-ios predicate string:hasKeyboardFocus == 1');
    await el.waitForExist({ timeout: 5000 });
  }
  await el.addValue(val); // XCUITest typeText: goes through the on-screen keyboard
}

async function dump(name) {
  await native();
  writeFileSync(join(OUT, `${String(++n).padStart(2, '0')}-${name}.xml`), await driver.getPageSource());
}

// Keyboard/picker frame from the native tree + what the page sees (via the METRICS: label
// the calibration page publishes) + a full-screen shot. Written to OUT/measure-<name>.json.
async function measure(name) {
  await native();
  await driver.pause(1200);
  shot(`measure-${name}`);
  const out = { name, shot: `${String(n).padStart(2, '0')}-measure-${name}.png` };
  for (const [key, type] of [['keyboard', 'XCUIElementTypeKeyboard'], ['picker', 'XCUIElementTypePicker'], ['datePicker', 'XCUIElementTypeDatePicker'], ['toolbar', 'XCUIElementTypeToolbar']]) {
    const el = await driver.$(`-ios predicate string:type == "${type}" AND visible == 1`);
    if (await el.isExisting()) out[key] = await driver.getElementRect(await el.elementId);
  }
  for (const b of ['Done', 'Previous', 'Next']) {
    const el = await driver.$(`-ios predicate string:type == "XCUIElementTypeButton" AND name == "${b}" AND visible == 1`);
    if (await el.isExisting()) out[`btn${b}`] = await driver.getElementRect(await el.elementId);
  }
  const m = await driver.$('-ios predicate string:label BEGINSWITH "METRICS:"');
  if (await m.isExisting()) out.page = JSON.parse((await m.getAttribute('label')).slice(8));
  writeFileSync(join(OUT, `measure-${name}.json`), JSON.stringify(out, null, 2));
  log('measured', name, JSON.stringify(out).slice(0, 300));
}

async function installPwa() {
  await native();
  await driver.hideKeyboard().catch(() => {});
  await driver.pause(800);
  await dump('pwa-safari-chrome');
  // Safari 26 moved Share behind the "…" button in the compact tab bar; older
  // layouts expose Share directly. Try the known names in order.
  let opened = false;
  for (const name of ['ShareButton', 'Share']) {
    try { await (await findNative(name, 2000)).click(); opened = true; break; } catch {}
  }
  if (!opened) {
    let found = false;
    for (const more of ['MoreButton', 'More', 'Page Menu', 'More Options']) {
      try { await (await findNative(more, 2000)).click(); found = true; break; } catch {}
    }
    if (!found) {
      const el = await driver.$('-ios predicate string:type == "XCUIElementTypeButton" AND (label CONTAINS[c] "more" OR name CONTAINS[c] "more" OR name CONTAINS "ellipsis")');
      await el.click();
    }
    await driver.pause(800); shot('pwa-menu');
    await (await findNative('Share')).click();
  }
  await driver.pause(1200); shot('pwa-share-sheet');
  try {
    await driver.execute('mobile: scroll', { direction: 'down', predicateString: 'label == "Add to Home Screen"' });
  } catch {}
  await (await findNative('Add to Home Screen')).click();
  await driver.pause(1200); shot('pwa-add-dialog');
  await (await findNative('Add')).click();
  await driver.pause(1500);
  await driver.execute('mobile: pressButton', { name: 'home' });
  await driver.pause(1500); shot('pwa-home-screen');
  const short = process.env.PWA_NAME || JSON.parse(readFileSync(join(HERE, '../public/manifest.json'), 'utf8')).short_name;
  await (await findNative(short, 10000)).click();
  standalone = true;
  await driver.pause(4000); shot('pwa-launched');
}

async function login() {
  // Standalone web apps get their own storage on iOS, so this runs again after installPwa.
  await dismissTips();
  await tapText('Email');
  await driver.pause(900); shot('login-email-keyboard');
  await type('$SIM_EMAIL');
  await driver.pause(600); shot('login-email-typed');
  // Like a person would: the keyboard's accessory bar covers the Password field,
  // so move with its Next (⌄) button, then submit with Return.
  await (await findNative('Next')).click();
  lastTapped = await driver.$('-ios predicate string:type == "XCUIElementTypeSecureTextField"');
  await dismissTips();
  await driver.pause(900); shot('login-password-keyboard');
  await type('$SIM_PASSWORD');
  await lastTapped.addValue('\n');
  lastTapped = null;
  await driver.pause(5000); shot('login-done');
}

try {
  for (const [i, step] of steps.entries()) {
    const [kind, arg] = Object.entries(step)[0];
    log(`step ${i}: ${kind}`);
    try {
      if (kind === 'goto') {
        if (standalone) throw new Error('goto is Safari-only; navigate in standalone with tapText');
        await web(); await driver.url(new URL(arg.replace(/^\//, ''), BASE_URL).href);
        await driver.pause(1500); await dismissTips();
      } else if (kind === 'tap') {
        if (standalone) throw new Error('tap is Safari-only; use tapText in standalone');
        await web(); await (await driver.$(arg)).click();
      } else if (kind === 'tapText') await tapText(arg);
      else if (kind === 'type') await type(arg);
      else if (kind === 'shot') shot(arg);
      else if (kind === 'dump') await dump(arg);
      else if (kind === 'measure') await measure(arg);
      else if (kind === 'pwaName') process.env.PWA_NAME = arg;
      else if (kind === 'wait') await driver.pause(arg);
      else if (kind === 'login') await login();
      else if (kind === 'installPwa') await installPwa();
      else if (kind === 'hideKeyboard') { await native(); await driver.hideKeyboard().catch(() => {}); }
      else throw new Error(`unknown step ${kind}`);
      results.push({ i, kind, ok: true });
    } catch (e) {
      log(`step ${i} FAILED: ${e.message.split('\n')[0]}`);
      results.push({ i, kind, ok: false, error: e.message.split('\n')[0] });
      try { shot(`fail-step${i}`); await dump(`fail-step${i}`); } catch {}
      if (step.optional !== true) break;
    }
  }
} finally {
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  if (results.some((r, j) => !r.ok && steps[r.i].optional !== true)) process.exitCode = 1;
  await driver.deleteSession().catch(() => {});
}
