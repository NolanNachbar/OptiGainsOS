// Deterministic per-screen UI probe for the OptiGains polish loop.
//
// For each screen in screens.json: drive.mjs's start() signs in and loads the
// path (+ optional setup steps to reach a sheet/dialog/active-workout state),
// then this file runs 8 deterministic checks and writes <id>.json + a
// screenshot (full-size + a downscaled -s.png for the opus critic/judge to
// read cheaply). A summary.json aggregates counts per check per screen.
//
// Read-only: no DB writes except session-creating screens (tagged
// sessionCreating:true, run serially after the concurrency pool, and cleaned
// up in a finally via testDb()). Deterministic checks never write rows
// themselves.
//
// Usage:
//   node ui-audit/polish/probe.mjs [--only id1,id2] [--out dir] [--concurrency N]
//   ORIGIN=http://localhost:5174 node ui-audit/polish/probe.mjs ...
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, controls, report } from '../overnight/drive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../..');

const argv = process.argv.slice(2);
const arg = (flag, def) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : def; };
const ONLY = arg('--only', null)?.split(',').map((s) => s.trim());
const OUT_ARG = arg('--out', 'baseline');
const OUTDIR = isAbsolute(OUT_ARG) ? OUT_ARG : join(HERE, OUT_ARG);
const CONCURRENCY = Number(arg('--concurrency', 2));

mkdirSync(OUTDIR, { recursive: true });

const SCREENS_ARG = arg('--screens', 'screens.json');
const SCREENS_PATH = isAbsolute(SCREENS_ARG) ? SCREENS_ARG : join(HERE, SCREENS_ARG);
const screens = JSON.parse(readFileSync(SCREENS_PATH, 'utf8'))
  .filter((s) => !ONLY || ONLY.includes(s.id));

// ---- DRIFT tokens per AUDIT_RUBRIC.md (legacy .glass* names now paint
// solid, so they are NOT drift; only these raw-value / leftover-material
// patterns are).
const DRIFT_PATTERNS = [
  { re: /backdrop-blur/g, label: 'backdrop-blur' },
  { re: /bg-white\//g, label: 'bg-white/[opacity]' },
  { re: /shadow-\[inset/g, label: 'inset specular shadow-[inset...]' },
  { re: /rounded-\[/g, label: 'arbitrary radius rounded-[...]' },
  { re: /text-white\b/g, label: 'text-white' },
  { re: /\b(slate|gray)-\d{2,3}\b/g, label: 'slate-*/gray-* raw text color' },
  { re: /#[0-9a-fA-F]{3,8}\b/g, label: 'raw hex color' },
];

// Strip comments before linting so a raw hex/color literal mentioned inside a
// //... line comment or /* ... */ block comment (including a JSX {/* ... */}
// comment, which is just a block comment inside braces) doesn't get flagged
// as drift - it's not shipped CSS. Best-effort only (a "//" inside a string
// literal, e.g. a URL, can still be stripped) since this only feeds a lint
// report, never a code rewrite.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function tokenLint(files) {
  const findings = [];
  for (const f of files || []) {
    const p = join(REPO, f);
    if (!existsSync(p)) { findings.push({ file: f, issue: 'file not found for lint' }); continue; }
    const src = stripComments(readFileSync(p, 'utf8'));
    for (const { re, label } of DRIFT_PATTERNS) {
      const matches = [...src.matchAll(re)];
      if (matches.length) {
        // sample up to 3 line numbers
        const lines = matches.slice(0, 3).map((m) => src.slice(0, m.index).split('\n').length);
        findings.push({ file: f, drift: label, count: matches.length, sampleLines: lines });
      }
    }
  }
  return findings;
}

// getByText().first() picks the first DOM match regardless of visibility.
// This codebase renders a lot of UI twice - once for the mobile layout, once
// for a desktop/hover variant hidden via CSS - and the hidden copy can sit
// first in DOM order (e.g. FloatingActionButton's desktop hover-fan tooltip
// labels precede the mobile sheet's own labels). Walk matches and take the
// first one that's actually visible instead of trusting DOM order.
async function firstVisibleText(page, text) {
  const loc = page.getByText(text, { exact: false });
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (await el.isVisible({ timeout: 800 }).catch(() => false)) return el;
  }
  return null;
}
async function clickFirstVisibleText(page, text) {
  const el = await firstVisibleText(page, text);
  if (!el) throw new Error(`clickText "${text}": no visible match among matches`);
  await el.click({ timeout: 4000 });
}

// ---- Step runner (mirrors capture.mjs's flow step vocabulary, plus a
// clickTextIfPresent for optional dismiss steps like "Start Fresh").
async function runSteps(page, steps = []) {
  for (const step of steps) {
    try {
      if (step.click) await page.locator(step.click + (step.click.includes(':visible') ? '' : ':visible')).first().click({ timeout: 4000 });
      else if (step.clickIfPresent) {
        // Retry a few times: some targets (e.g. the mark-set-complete
        // checkbox right after a session starts) sit mid-render/transition
        // and an isVisible+click pair can land right as React re-renders,
        // silently losing the click. Re-check the same selector after each
        // attempt - if it still matches, the underlying state didn't
        // change, so try again rather than trusting one click blindly.
        for (let attempt = 0; attempt < 3; attempt++) {
          const loc = page.locator(step.clickIfPresent).first();
          const visible = await loc.isVisible({ timeout: 1200 }).catch(() => false);
          if (!visible) break; // genuinely not present - done
          await loc.click({ timeout: 4000 });
          // A click here can pop a native confirm() (e.g. the heavy-weight
          // guard); give the dialog handler (registered in probeScreen) time
          // to actually resolve it before re-checking, or this races and
          // double-clicks mid-dialog.
          await page.waitForTimeout(800);
          const stillThere = await page.locator(step.clickIfPresent).first().isVisible({ timeout: 800 }).catch(() => false);
          if (!stillThere) break; // click took effect
        }
      }
      else if (step.clickText) await clickFirstVisibleText(page, step.clickText);
      else if (step.clickTextIfPresent) {
        const loc = await firstVisibleText(page, step.clickTextIfPresent);
        if (loc) await loc.click({ timeout: 2000 }).catch(() => {});
      } else if (step.fill) await page.fill(step.fill.selector, step.fill.value, { timeout: 4000 });
      else if (step.settle) await page.waitForTimeout(step.settle);
      else if (step.blur) {
        // iphone-sim's simulated software keyboard (.kb, pointer-events:auto,
        // spans from its top guide line to the bottom of the screen) stays up
        // as long as an input has focus - e.g. the Add Food dialog's
        // autofocused search input. It sits above the rest of the dialog in
        // the sim's overlay layer, silently swallowing clicks on anything
        // below it (a real click still "succeeds" with no error - it just
        // lands on the keyboard overlay, not the app). Blurring the focused
        // element dismisses it, the same as tapping the sim's own "Done" key.
        await page.evaluate(() => document.activeElement?.blur());
        await page.waitForTimeout(300);
      }
    } catch (e) {
      // A missing step target is recorded, not fatal - a moved selector should
      // show up as a probe gap, not silently pass.
      return { stepError: `${JSON.stringify(step)}: ${e.message.slice(0, 200)}` };
    }
  }
  return null;
}

// ---- In-page deterministic checks. Runs entirely inside page.evaluate for
// speed and to keep DOM geometry queries consistent with what the sim sees.
const CHECK_SCRIPT = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
      && !(e.getAttribute('aria-hidden') === 'true') && cs.opacity !== '0'
      && !(r.width <= 1 && r.height <= 1); // sr-only / radix hidden native inputs
  };
  const desc = (e) => {
    const t = (e.getAttribute('aria-label') || e.placeholder || e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const sel = e.id ? `#${e.id}` : (e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : e.tagName.toLowerCase());
    return { tag: e.tagName.toLowerCase(), selector: sel, text: t };
  };

  // (a) tap targets < 44x44
  const interactive = [...document.querySelectorAll('button,a[href],input,textarea,select,[role=button],[role=combobox],[role=option],[role=tab],[role=switch],[role=checkbox],[role=menuitem]')]
    .filter(vis);
  const smallTargets = interactive.filter((e) => {
    const r = e.getBoundingClientRect();
    return (r.width < 44 || r.height < 44) && r.top < vh && r.bottom > 0;
  }).map((e) => ({ ...desc(e), size: (() => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })() }));

  // (b) small text: body text < 12px, any text < 11px. The rubric
  // deliberately uses a 10.5px `.section-label` eyebrow token (uppercase,
  // tracked-out) - that pattern (and any other uppercase/tracked label at
  // >=10.5px) is intentional, not drift, so it's excluded from both severity
  // buckets rather than counted as a violation.
  const textNodesEls = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e)) return false;
    const hasDirectText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    return hasDirectText;
  });
  const letterSpacingRatio = (cs, px) => {
    const ls = cs.letterSpacing;
    if (!ls || ls === 'normal') return 0;
    const lsPx = parseFloat(ls);
    if (Number.isNaN(lsPx) || !px) return 0;
    return lsPx / px;
  };
  const smallText = [];
  for (const e of textNodesEls) {
    const cs = getComputedStyle(e);
    const px = parseFloat(cs.fontSize);
    const isEyebrow = e.classList.contains('section-label')
      || (cs.textTransform === 'uppercase' && letterSpacingRatio(cs, px) >= 0.06);
    if (isEyebrow && px >= 10.5) continue;
    if (px < 11) smallText.push({ ...desc(e), fontSize: px, severity: 'sub-11px' });
    else if (px < 12) smallText.push({ ...desc(e), fontSize: px, severity: 'sub-12px-body' });
  }

  // (c) horizontal overflow
  const docOverflow = document.documentElement.scrollWidth > innerWidth + 1;
  const overflowingEls = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e)) return false;
    const r = e.getBoundingClientRect();
    return r.right > vw + 2 || r.left < -2;
  }).slice(0, 15).map((e) => ({ ...desc(e), rect: (() => { const r = e.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; })() }));

  // (d) occlusion, current scroll position only. Sample center + 4 inset
  // corners of each visible control's own rect (not just center) so a
  // partially-covered CTA (e.g. its bottom edge under a dock) is caught even
  // if its center is clear. Only FIXED/STICKY controls are trustworthy here:
  // a control in normal scroll flow that hasn't been scrolled to yet will
  // read as "under the dock" purely because it's below the fold, which is
  // not a bug. That in-flow case is covered by a second pass after scrolling
  // to the bottom of the page (see occlusionStaticPass below).
  // A control counts as "effectively fixed/sticky" if IT OR ANY ANCESTOR is,
  // not just its own computed position. A static button inside a fixed
  // bottom bar (e.g. ProgramDetail's sticky CTA) is fixed in effect - it
  // never needs scrolling to reach - so it belongs in this pass with the
  // same 5-point check, not in the static/in-flow pass below which only
  // samples one center point.
  const effectivePos = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return p;
    }
    return 'static';
  };
  const occluded = [];
  for (const e of interactive) {
    const pos = effectivePos(e);
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const r = e.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue; // fully off-screen
    // Inset the 4 corner sample points by the control's own border-radius
    // (scaled) rather than a flat 4px: a flat 4px inset on a rounded-full
    // circular button (e.g. a 48px FAB, radius 24px) lands the corner point
    // in the corner cutout outside the circle, sampling whatever sits behind
    // it there instead of the button itself - a false "0.8 covered" even
    // when the whole visible disc is clear and clickable. `rounded-full`
    // computes to a 9999px border-radius regardless of box size, so the
    // radius must be clamped to the box's own half-width/half-height first -
    // an unclamped 9999px would inset every corner point thousands of px
    // outside the viewport, silently dropping them and leaving only the
    // center point sampled.
    const brRaw = parseFloat(getComputedStyle(e).borderRadius) || 0;
    const rad = Math.min(brRaw, r.width / 2, r.height / 2);
    const inset = Math.max(4, rad * 0.35);
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2, 'center'],
      [r.left + inset, r.top + inset, 'top-left'],
      [r.right - inset, r.top + inset, 'top-right'],
      [r.left + inset, r.bottom - inset, 'bottom-left'],
      [r.right - inset, r.bottom - inset, 'bottom-right'],
    ];
    let coveredCount = 0;
    let sampledCount = 0;
    let coveredBy = null;
    for (const [x, y, corner] of pts) {
      if (x < 0 || x > vw || y < 0 || y > vh) continue;
      sampledCount++;
      const stack = document.elementsFromPoint(x, y).filter((n) => n.tagName !== 'IPHONE-SIM');
      const hit = stack[0];
      if (!hit) continue;
      const isSelfOrDescendant = hit === e || e.contains(hit) || hit.contains(e);
      // A modal scrim, or a shared Dialog panel (`glass-sheet`, from
      // dialog.jsx's DialogContent), intentionally makes everything behind it
      // inert - that's the modal working as designed, not a rubric occlusion
      // bug. Detect by the known literal class strings rather than rect-edge
      // math (post-scroll, inside iphone-sim's own frame, a true full-
      // viewport scrim's measured rect can land a few px off the exact 0/vw/vh
      // edges that math expects). Walk up with closest() (a real hit is often
      // a child of the panel, e.g. its own button), and only when the covered
      // control ISN'T itself inside that same panel - an in-dialog control
      // covered by another in-dialog element is still a real, checkable bug.
      // This deliberately does NOT exclude the FAB quick-add sheet's own
      // `glass-elevated` panel: that's the one legitimate case (R1-02) where
      // the modal's own panel covers the very control (the FAB's X) an
      // athlete needs to close it, which the fixed pass must keep catching.
      const hitSheet = hit.closest('.glass-sheet');
      const hitClass = String(hit.className || '');
      const isModalChrome = (hitClass.includes('bg-black/85') && hitClass.includes('inset-0'))
        || (hitSheet && !e.closest('.glass-sheet'));
      if (!isSelfOrDescendant && !isModalChrome) {
        coveredCount++;
        if (!coveredBy) coveredBy = desc(hit).selector + (hit.className ? ` (${String(hit.className).slice(0, 40)})` : '');
      }
    }
    if (coveredCount > 0) {
      const safeAreaBand = r.bottom > vh - 40 || r.top < 40;
      occluded.push({ ...desc(e), coveredFraction: +(coveredCount / (sampledCount || 1)).toFixed(2), coveredBy, inSafeAreaBand: safeAreaBand, position: pos });
    }
  }

  // (g) contrast: walk up for first opaque background, compute WCAG ratio.
  function luminance([r, g, b]) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function parseColor(str) {
    const m = str.match(/[\d.]+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 };
  }
  function effectiveBg(el) {
    for (let n = el; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
      if (n.tagName === 'IMG' || getComputedStyle(n).backgroundImage !== 'none') return null; // indeterminate over image
    }
    return { r: 15, g: 18, b: 22 }; // field #0F1216 fallback
  }
  const contrastFails = [];
  for (const e of textNodesEls) {
    const cs = getComputedStyle(e);
    if (cs.opacity !== '' && +cs.opacity < 0.4) continue; // likely disabled
    if (e.disabled) continue;
    const fg = parseColor(cs.color);
    const bg = effectiveBg(e);
    if (!fg || !bg) continue;
    const L1 = luminance([fg.r, fg.g, fg.b]) + 0.05;
    const L2 = luminance([bg.r, bg.g, bg.b]) + 0.05;
    const ratio = L1 > L2 ? L1 / L2 : L2 / L1;
    const px = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const threshold = (px >= 18 || (bold && px >= 14)) ? 3 : 4.5;
    if (ratio < threshold) contrastFails.push({ ...desc(e), ratio: +ratio.toFixed(2), threshold, fontSize: px });
  }

  return { smallTargets, smallText, docOverflow, overflowingEls, occluded, contrastFails };
};

// Second occlusion pass: scroll the page to its bottom (real end state a
// user reaches, not an arbitrary mid-scroll snapshot) and re-check only
// STATIC/RELATIVE controls that are still covered by a fixed/sticky layer.
// This is what actually catches "last row clipped under the dock forever"
// as opposed to "hasn't been scrolled to yet".
const OCCLUSION_STATIC_PASS = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
      && !(e.getAttribute('aria-hidden') === 'true') && cs.opacity !== '0' && !(r.width <= 1 && r.height <= 1);
  };
  const desc = (e) => {
    const t = (e.getAttribute('aria-label') || e.placeholder || e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const sel = e.id ? `#${e.id}` : (e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : e.tagName.toLowerCase());
    return { tag: e.tagName.toLowerCase(), selector: sel, text: t };
  };
  // An open modal/sheet (Dialog, or the FAB quick-add menu - both render the
  // identical literal "fixed inset-0 bg-black/85 ..." scrim div) legitimately
  // makes the ENTIRE page behind it inert. That scrim is meant to cover the
  // full viewport, but this sim runs the app inside iphone-sim's own frame,
  // and after scrollTo() below the scrim's measured rect can land a few px
  // off the exact 0/vw/vh edges this pass's own corner math expects - which
  // let ~50 "clipped at page bottom" false positives through (every
  // background control behind an open dialog, on workout-finish-dialog and
  // today-fab-menu alike). Detect the scrim directly by its known class
  // string instead of trusting rect-edge math post-scroll, and when it's
  // open, skip this whole pass - nothing behind a real, working modal is a
  // rubric occlusion bug.
  const hasOpenModal = [...document.querySelectorAll('div')].some((e) => {
    if (!vis(e)) return false;
    const cls = String(e.className || '');
    return cls.includes('bg-black/85') && cls.includes('inset-0');
  });
  if (hasOpenModal) return [];

  window.scrollTo(0, document.body.scrollHeight);
  const effectivePos = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return p;
    }
    return 'static';
  };
  const interactive = [...document.querySelectorAll('button,a[href],input,textarea,select,[role=button],[role=combobox],[role=option],[role=tab],[role=switch],[role=checkbox],[role=menuitem]')]
    .filter(vis).filter((e) => { const p = effectivePos(e); return p !== 'fixed' && p !== 'sticky'; });
  const clipped = [];
  for (const e of interactive) {
    const r = e.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cx > vw || cy < 0 || cy > vh) continue;
    const hit = document.elementsFromPoint(cx, cy).filter((n) => n.tagName !== 'IPHONE-SIM')[0];
    if (!hit) continue;
    if (hit !== e && !e.contains(hit) && !hit.contains(e)) {
      const hitPos = getComputedStyle(hit).position;
      // Only FIXED coverers count here (a dock/bottom-bar clipping the last
      // row forever). A STICKY header scrolling over content it has already
      // passed is normal sticky-header behavior, not a rubric defect - it
      // would flag literally the first item of every page.
      const hitRect = hit.getBoundingClientRect();
      const isFullViewportScrim = hitRect.width >= vw - 4 && hitRect.height >= vh - 4 && hitRect.top <= 4 && hitRect.left <= 4;
      if (hitPos === 'fixed' && !isFullViewportScrim) {
        clipped.push({ ...desc(e), coveredBy: desc(hit).selector + (hit.className ? ` (${String(hit.className).slice(0, 40)})` : ''), atPageBottom: true });
      }
    }
  }
  return clipped;
};

async function probeScreen(screenDef) {
  const { id, path, setup = [] } = screenDef;
  const shotPath = join(OUTDIR, `${id}.png`);
  const shotSmallPath = join(OUTDIR, `${id}-s.png`);
  let s;
  const result = { id, path, checks: {}, problems: [], warnings: [], note: screenDef.note || null };
  try {
    s = await start(path);
    // A native confirm()/alert() (e.g. ExerciseCard's sweaty-thumb heavy-
    // weight guard) has no handler by default, so Playwright auto-dismisses
    // it - which reads as "cancel" to the app and silently no-ops whatever
    // action triggered it. Auto-accept so scripted setup steps behave like a
    // real athlete tapping through, not like every dialog being declined.
    s.page.on('dialog', (d) => d.accept().catch(() => {}));
    // start() always loads /today first; reset problems/warnings so a
    // downstream screen doesn't inherit /today's own noise.
    s.problems.length = 0;
    await s.page.evaluate(() => { if (window.__iphoneSim) window.__iphoneSim.warnings = []; });
    await s.page.waitForTimeout(600);

    const stepErr = await runSteps(s.page, setup);
    if (stepErr) result.setupError = stepErr;
    await s.page.waitForTimeout(400);

    // Blur/dismiss keyboard before running checks unless this screen IS a
    // deliberate keyboard state (setup ends by filling a field).
    const lastSetup = setup[setup.length - 1];
    const isKeyboardState = lastSetup && lastSetup.fill;
    if (!isKeyboardState) {
      await s.page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await s.page.waitForTimeout(200);
    }

    // kill animations/transitions for a stable screenshot + occlusion read
    await s.page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });
    await s.page.waitForTimeout(150);

    const checks = await s.page.evaluate(CHECK_SCRIPT);
    const clippedAtBottom = await s.page.evaluate(OCCLUSION_STATIC_PASS).catch(() => []);
    checks.occluded = [...checks.occluded, ...clippedAtBottom];
    await s.page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    result.checks = checks;
    result.controlsSnapshot = await controls(s.page);

    await s.page.screenshot({ path: shotPath, fullPage: false });
    const rep = await report(s);
    result.problems = rep.problems;
    result.warnings = rep.warnings;
  } catch (e) {
    result.fatalError = e.message.slice(0, 400);
  } finally {
    if (s) await s.close().catch(() => {});
  }
  // downscale (best-effort; requires ImageMagick `convert`)
  try { execSync(`convert "${shotPath}" -resize x520 "${shotSmallPath}"`, { stdio: 'ignore' }); } catch {}
  writeFileSync(join(OUTDIR, `${id}.json`), JSON.stringify(result, null, 1));
  return result;
}

// workout_sessions rows aren't reachable through localStorage (the app keeps
// session state in React/query cache, not storage), so we can't read a
// session id out of the page. Instead: any workout_sessions row created by
// the test account inside the time window this probe run's session-creating
// screens executed in is presumed to be ours and is deleted (status
// 'in_progress' only - never touch a 'completed' row, which is real logged
// history the overnight audit or Nolan created).
async function cleanupSessions(windowStart) {
  try {
    const { testDb, testUserId } = await import('../../e2e/helpers.mjs');
    const db = await testDb();
    const uid = await testUserId();
    const { data, error } = await db.from('workout_sessions')
      .select('id,status,created_at')
      .eq('created_by', uid).eq('status', 'in_progress')
      .gte('created_at', windowStart);
    if (error) throw error;
    for (const row of data || []) {
      await db.from('workout_sessions').delete().eq('id', row.id).eq('created_by', uid);
    }
    return (data || []).length;
  } catch (e) {
    console.error('session cleanup failed (manual check needed):', e.message);
    return null;
  }
}

async function main() {
  const t0 = Date.now();
  const serialScreens = screens.filter((s) => s.serial);
  const poolScreens = screens.filter((s) => !s.serial);
  const results = [];

  // concurrency-limited pool for non-session-creating screens
  let idx = 0;
  async function worker() {
    while (idx < poolScreens.length) {
      const my = poolScreens[idx++];
      console.error(`[probe] ${my.id}`);
      results.push(await probeScreen(my));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, poolScreens.length || 1) }, worker));

  // session-creating screens run serially (one active session per account).
  // Clean up after EACH one, not just once at the end: these screens each
  // assume a fresh (no active session) starting state, and a session left
  // behind by one screen changes what the next screen's setup steps see
  // (e.g. "Start Fresh" not appearing, a set already marked complete).
  let totalCleaned = 0;
  for (const s of serialScreens) {
    console.error(`[probe] ${s.id} (serial, session-creating)`);
    const windowStart = new Date().toISOString();
    results.push(await probeScreen(s));
    const cleaned = await cleanupSessions(windowStart);
    totalCleaned += cleaned ?? 0;
  }
  if (serialScreens.length) {
    console.error(`[probe] session cleanup: removed ${totalCleaned} in_progress workout_sessions row(s) total`);
  }

  // static token-lint runs per unique file set outside the browser
  for (const r of results) {
    const def = screens.find((s) => s.id === r.id);
    r.tokenLint = tokenLint(def.files);
  }
  for (const r of results) writeFileSync(join(OUTDIR, `${r.id}.json`), JSON.stringify(r, null, 1));

  const summary = { generatedAt: new Date().toISOString(), durationMs: Date.now() - t0, screenCount: results.length, perScreen: {}, totals: {} };
  const bump = (k, n) => { summary.totals[k] = (summary.totals[k] || 0) + n; };
  for (const r of results) {
    const c = r.checks || {};
    const counts = {
      smallTargets: c.smallTargets?.length || 0,
      // Gate only on the real sub-11px violations; sub-12px-body items stay
      // in the per-screen JSON as an informational list (rubric intentionally
      // uses 11-11.5px chips/captions/unit suffixes, which aren't drift).
      smallText: (c.smallText || []).filter((t) => t.severity === 'sub-11px').length,
      overflow: c.docOverflow ? 1 : 0,
      overflowingEls: c.overflowingEls?.length || 0,
      occluded: c.occluded?.length || 0,
      contrastFails: c.contrastFails?.length || 0,
      problems: r.problems?.length || 0,
      warnings: r.warnings?.length || 0,
      driftFindings: r.tokenLint?.length || 0,
      fatalError: r.fatalError ? 1 : 0,
      setupError: r.setupError ? 1 : 0,
    };
    summary.perScreen[r.id] = counts;
    for (const [k, v] of Object.entries(counts)) bump(k, v);
  }
  writeFileSync(join(OUTDIR, 'summary.json'), JSON.stringify(summary, null, 1));
  console.error(`[probe] done: ${results.length} screens in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUTDIR}`);
  console.log(JSON.stringify(summary.totals, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
