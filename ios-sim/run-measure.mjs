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
const measurements = [];

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

// iOS offers to save the just-typed password in Keychain. It's a system sheet
// (not a web/Safari element), sits on top of everything, and blocks every
// subsequent native tap (e.g. the PWA install flow's Share button) until
// dismissed. "Not Now" leaves Keychain untouched.
async function dismissSavePasswordPrompt() {
  await native();
  const btn = await driver.$('-ios predicate string:type == "XCUIElementTypeButton" AND label == "Not Now"');
  if (await btn.isExisting().catch(() => false)) {
    await btn.click();
    await driver.pause(500);
  }
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
  const short = JSON.parse(readFileSync(join(HERE, '../public/manifest.json'), 'utf8')).short_name;
  await (await findNative(short, 10000)).click();
  standalone = true;
  await driver.pause(4000); shot('pwa-launched');
}


// --- measure: scroll to the end of the page, then report whether the lowest
// in-flow content edge clears the floating dock. Web context only.
// Two synchronous execute calls (Safari driver has no execute/async).
async function measure(name) {
  await web();
  const where = await driver.execute(() => location.pathname);
  if (/\/login/.test(where)) throw new Error('measure: on /login, not authenticated; refusing to record');
  const scrolled = await driver.execute(function () {
    const isScrollable = (el) => {
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    };
    const scrollers = [document.scrollingElement].concat(Array.from(document.querySelectorAll('*')).filter(isScrollable));
    scrollers.forEach(function (el) { el.scrollTop = el.scrollHeight; });
    return scrollers.length;
  });
  await driver.pause(700);
  const res = await driver.execute(function () {
    const dock = document.querySelector('[data-mobile-dock]');
    const vh = window.innerHeight;
    const dockRect = dock ? dock.getBoundingClientRect() : null;
    const fixedAncestor = (el) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === 'fixed' || pos === 'sticky') return true;
      }
      return false;
    };
    let lowest = null;
    const root = document.querySelector('main') || document.body;
    for (const el of root.querySelectorAll('*')) {
      if (dock && dock.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.top >= vh || r.bottom <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (fixedAncestor(el)) continue;
      const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      const interactive = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|IMG|SVG|CANVAS)$/i.test(el.tagName);
      if (!hasOwnText && !interactive) continue;
      if (!lowest || r.bottom > lowest.bottom) {
        lowest = { bottom: Math.round(r.bottom * 10) / 10, tag: el.tagName, text: (el.textContent || '').trim().slice(0, 50) };
      }
    }
    return {
      path: location.pathname + location.search,
      viewportH: vh,
      dockTop: dockRect ? Math.round(dockRect.top * 10) / 10 : null,
      lowestContent: lowest,
      clearancePx: dockRect && lowest ? Math.round((dockRect.top - lowest.bottom) * 10) / 10 : null,
      bodyTextLen: document.body.innerText.length,
    };
  });
  res.name = name;
  res.scrollersMoved = scrolled;
  measurements.push(res);
  log('measure', JSON.stringify(res));
  shot(`measure-${name}`);
}

async function login() {
  // JS-driven login: nativeWebTap cannot calibrate against Safari's WebView on
  // this OS, so element-level setValue/click fail. Layout measurement doesn't
  // need the on-screen keyboard; set values via the native setter so React's
  // controlled inputs see the change.
  await dismissTips();
  await web();
  const hasForm = await driver.execute(() => !!document.querySelector('input[type="password"]'));
  if (!hasForm) { log('login: already signed in, skipping'); return; }
  const out = await driver.execute(function (email, pw) {
    const q = (sel) => document.querySelector(sel);
    const e = q('input[type="email"]') || q('input[placeholder="your@email.com"]');
    const p = q('input[type="password"]');
    if (!e || !p) return { ok: false, why: 'inputs not found' };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const set = (el, v) => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set(e, email); set(p, pw);
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Sign in');
    if (!btn) return { ok: false, why: 'sign-in button not found' };
    btn.click();
    return { ok: true };
  }, process.env.SIM_EMAIL, process.env.SIM_PASSWORD);
  if (!out.ok) throw new Error('login: ' + out.why);
  await driver.pause(7000);
  await dismissSavePasswordPrompt();
  await web();
  const path = await driver.execute(() => location.pathname);
  log('post-login path', path);
  if (/\/login/.test(path)) throw new Error('login did not leave /login');
  shot('login-done');
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
      else if (kind === 'js') {
        await web();
        const r = await driver.execute(arg);
        measurements.push({ name: `js-${i}`, js: r });
        log('js', JSON.stringify(r));
      }
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
  writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(measurements, null, 2));
  if (results.some((r, j) => !r.ok && steps[r.i].optional !== true)) process.exitCode = 1;
  await driver.deleteSession().catch(() => {});
}
