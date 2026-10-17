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

const shot = (name) => {
  const file = join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`);
  execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', file]);
  log('shot', file);
};

const driver = await remote({
  hostname: '127.0.0.1', port: Number(process.env.APPIUM_PORT || 4724), path: '/', logLevel: 'warn',
  connectionRetryTimeout: 600_000,
  capabilities: {
    platformName: 'iOS',
    browserName: 'Safari',
    'appium:automationName': 'XCUITest',
    'appium:udid': UDID,
    'appium:nativeWebTap': true,
    'appium:wdaLocalPort': Number(process.env.WDA_PORT || 8101),
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


async function tapBtn(label) {
  await native();
  const mIdx = label.match(/^(.*)#(\d+)$/);
  if (mIdx) {
    const els = await driver.$$(`-ios predicate string:type == "XCUIElementTypeButton" AND (label == "${q(mIdx[1])}" OR name == "${q(mIdx[1])}") AND visible == 1`);
    await els[Number(mIdx[2]) - 1].click();
    return;
  }
  const el = await driver.$(`-ios predicate string:type == "XCUIElementTypeButton" AND (label == "${q(label)}" OR name == "${q(label)}") AND visible == 1`);
  await el.waitForExist({ timeout: 8000, timeoutMsg: 'button not found: ' + label });
  await el.click();
}
async function keys(str) {
  for (const ch of str) await tapBtn(ch === '.' ? 'Decimal point' : ch);
}

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

// iOS 27 soft keyboard facts (verified from accessibility dumps):
//  - letter/digit/punct keys are XCUIElementTypeKey; shift (label "shift" on letters, "symbols" on the
//    numbers page) and Return (label "return") are XCUIElementTypeButton, so match Key OR Button.
//  - the layout-switch key is name="more" with label = the page it goes TO ("numbers" / "letters").
//  - "&" has name "ampersand" but label "&"; match on label.
//  - when shifted/auto-capitalised, letter keys' labels become uppercase.
async function kbKey(label, timeout = 3000) {
  const lab = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const chain = await driver.$(`-ios class chain:**/XCUIElementTypeKeyboard/**/*[\`label == "${lab}" AND visible == 1\`]`);
  if (await chain.waitForExist({ timeout, timeoutMsg: '' }).catch(() => false)) return chain;
  // shift / return are Buttons that live beside (not inside) the XCUIElementTypeKeyboard node.
  if (label === 'shift' || label === 'return' || label === 'symbols' || label === 'Emoji') {
    const btn = await driver.$(`-ios predicate string:type == "XCUIElementTypeButton" AND label == "${lab}" AND visible == 1`);
    if (await btn.waitForExist({ timeout: 600, timeoutMsg: '' }).catch(() => false)) return btn;
  }
  return null;
}
// iOS flips pages by itself (e.g. back to letters after punctuation/space), so never trust a
// stale reading: poll until the wanted page is showing, tapping the switch key only when needed.
async function ensurePage(want) {          // want: 'letters' | 'numbers' (the digits page)
  for (let i = 0; i < 5; i++) {
    if (want === 'letters' && ((await kbKey('q', 150)) || (await kbKey('Q', 150)))) return;
    if (want === 'numbers' && (await kbKey('1', 200))) return;
    // "numbers" is the switch key on both the letters page and the symbols page; "letters" on numbers+symbols.
    const k = await kbKey(want === 'letters' ? 'letters' : 'numbers', 500);
    if (k) await k.click().catch(() => {});
    await driver.pause(120);
  }
  throw new Error('could not reach keyboard page: ' + want);
}
async function tapKey(label, timeout) {
  const el = await kbKey(label, timeout);
  if (!el) throw new Error('keyboard key not found: ' + label);
  await el.click();
}
const isLetter = (c) => /[a-zA-Z]/.test(c);
// Real taps on the on-screen keyboard, one key at a time, switching pages as a person would.
// Autocorrect / QuickType stay ON: autocorrect fires on space/return/punctuation exactly as for a user.
async function typeSoft(str) {
  await native();
  for (const ch of str) {
    if (ch === '\n') { await tapKey('return'); continue; }
    if (ch === ' ') { await tapKey('space'); continue; }
    if (isLetter(ch)) {
      await ensurePage('letters');
      const same = await kbKey(ch, 250);                     // already in the wanted case (auto-cap/shift)
      if (same) { await same.click(); continue; }
      await tapKey('shift', 800);                            // toggle shift once
      await tapKey(ch, 1500);
      continue;
    }
    // Not a letter. Digits only live on the numbers page; punctuation may already be on screen.
    const onLettersPage = !!((await kbKey('q', 80)) || (await kbKey('Q', 80)));
    let el = /\d/.test(ch) || onLettersPage ? null : await kbKey(ch, 250);
    if (!el) { await ensurePage('numbers'); el = await kbKey(ch, 250); }
    if (!el) { await tapKey('symbols', 800); el = await kbKey(ch, 1200); }   // "#+=" page
    if (!el) throw new Error('keyboard key not found for char: ' + JSON.stringify(ch));
    await el.click();
  }
}

// mode: 'soft' (real key taps), 'add' (XCUIElement typeText via addValue), 'keys' (W3C key actions)
async function type(text, mode = process.env.TYPE_MODE || 'soft') {
  const val = text.replace(/\$(SIM_EMAIL|SIM_PASSWORD)/g, (_, k) => process.env[k] ?? '');
  await native();
  if (mode === 'soft') return typeSoft(val);
  let el = lastTapped;
  if (!el) {
    el = await driver.$('-ios predicate string:hasKeyboardFocus == 1');
    await el.waitForExist({ timeout: 5000 });
  }
  if (mode === 'add') await el.addValue(val);
  else await driver.keys(val.split(''));
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

async function login() {
  // Standalone web apps get their own storage on iOS, so this runs again after installPwa.
  await dismissTips();
  if (!(await findNative('Email', 3000).then(() => true).catch(() => false))) { log('already signed in'); return; }
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
  await type('\n');
  lastTapped = null;
  await driver.pause(5000);
  await dismissSavePasswordPrompt();
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
      else if (kind === 'btn') await tapBtn(arg);
      else if (kind === 'eval') { await web(); const r = await driver.execute(arg); log('EVAL', JSON.stringify(r).slice(0, 3000)); writeFileSync(join(OUT, `${String(++n).padStart(2, '0')}-eval.json`), JSON.stringify(r, null, 1)); }
      else if (kind === 'keys') await keys(arg);
      else if (kind === 'back') { await native(); await driver.back(); }
      else if (kind === 'reload') { await web(); await driver.refresh(); await driver.pause(2500); }
      else if (kind === 'bg') { await driver.execute('mobile: pressButton', { name: 'home' }); await driver.pause(arg); await driver.execute('mobile: activateApp', { bundleId: 'com.apple.mobilesafari' }); await driver.pause(1500); }
      else if (kind === 'type') await type(arg);
      else if (kind === 'typeAdd') await type(arg, 'add');
      else if (kind === 'typeKeys') await type(arg, 'keys');
      else if (kind === 'typeSoft') await type(arg, 'soft');
      else if (kind === 'probeKeys') {
        await native();
        const tries = { predName: '-ios predicate string:name == "shift"', predLabelVis: '-ios predicate string:label == "shift" AND visible == 1',
          predBtn: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "shift"', chainBtn: '-ios class chain:**/XCUIElementTypeButton[`name == "shift"`]',
          chainKbd: '-ios class chain:**/XCUIElementTypeKeyboard/**/*[`label == "shift"`]', accId: '~shift', anyShiftLike: '-ios predicate string:label CONTAINS[c] "shift"' };
        for (const [k, v] of Object.entries(tries)) {
          const els = await driver.$$(v); const info = [];
          for (const e of els.slice(0, 3)) info.push({ vis: await e.getAttribute('visible'), t: await e.getAttribute('type'), l: await e.getAttribute('label') });
          log('PROBE', k, els.length, JSON.stringify(info));
        }
      }
      else if (kind === 'scroll') {   // finger drag: "up" = content moves up (scroll down the page)
        await native();
        const [fromY, toY] = arg === 'down' ? [300, 640] : [640, 300];
        await driver.execute('mobile: dragFromToForDuration', { duration: 0.35, fromX: 214, fromY, toX: 214, toY });
        await driver.pause(500);
      }
      else if (kind === 'focus') {   // scroll the sheet until the field is clear of the sticky bar + keyboard zone, then tap it
        await native();
        for (let i = 0; i < 6; i++) {
          const el = await findNative(arg, 3000);
          const r = await el.getLocation();
          if (r.y < 540 && r.y > 110) { lastTapped = el; await el.click(); await driver.pause(400); break; }
          const dir = r.y >= 540 ? [640, 300] : [300, 640];
          await driver.execute('mobile: dragFromToForDuration', { duration: 0.35, fromX: 214, fromY: dir[0], toX: 214, toY: dir[1] });
          await driver.pause(450);
        }
        if (!lastTapped) throw new Error('focus: could not bring into view ' + arg);
      }
      else if (kind === 'drag') { await native(); await driver.execute('mobile: dragFromToForDuration', { duration: 0.35, fromX: arg[0], fromY: arg[1], toX: arg[2], toY: arg[3] }); await driver.pause(500); }
      else if (kind === 'alert') { await native(); const t = await driver.getAlertText().catch(() => null); log('EVAL ALERT', JSON.stringify(t)); await driver.acceptAlert().catch(() => {}); await driver.pause(500); }
      else if (kind === 'tapXY') { await native(); await driver.execute('mobile: tap', { x: arg[0], y: arg[1] }); await driver.pause(500); }
      else if (kind === 'del') { await native(); for (let i = 0; i < arg; i++) { const k = (await kbKey('delete', 600)) || (await kbKey('Delete', 600)); if (!k) throw new Error('no delete key'); await k.click(); } }
      else if (kind === 'done') {   // the keyboard accessory-bar check mark (label "Done"); hideKeyboard() does nothing in Safari
        await native();
        const d = await driver.$('-ios class chain:**/XCUIElementTypeToolbar/**/XCUIElementTypeButton[`label == "Done"`]');
        await d.click();
        await driver.pause(500);
      }
      else if (kind === 'key') { await native(); await tapKey(arg); }
      else if (kind === 'webtap') { await web(); await (await driver.$(arg)).click(); }
      else if (kind === 'clear') { await native(); const el = lastTapped || await driver.$('-ios predicate string:hasKeyboardFocus == 1'); await el.clearValue(); }
      else if (kind === 'shot') shot(arg);
      else if (kind === 'dump') await dump(arg);
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
