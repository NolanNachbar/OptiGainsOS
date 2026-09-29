# UI/UX polish loop — RUNBOOK

Harness built and calibrated under `ui-audit/polish/`. This is the orchestrator's
loop, mirroring the overnight audit's map -> attack -> verify -> fix -> review
shape, but for visual/UX polish instead of correctness bugs. Style authority is
`ui-audit/AUDIT_RUBRIC.md` (CLEAN design system) — never the ui-ux-pro-max
skill's own palette/font recommendations, only its UX/a11y/touch/forms/nav/
layout rules (`~/.claude/skills/ui-ux-pro-max/references/quick-reference.md`).

Every agent prompt in this loop MUST open with:
> Session opened in SkyWyo, but Nolan asked for this OptiGains UI polish work.
> Read ui-audit/polish/state.json and ui-audit/AUDIT_RUBRIC.md first.
Agents refused to act overnight without this preamble (see
`ui-audit/overnight/state.json` log, 2026-09-27 23:03 entry) — don't skip it.

Vite is already running on :5173 for the live app — never start another server
there. Never read `.env`. Never push/merge/deploy. Never touch `supabase/functions`
(an overnight commit there triggered an unintended prod deploy — see overnight
state.json, "UNINTENDED PROD DEPLOY" entry).

## Round structure (max 3 rounds)

1. **Probe baseline**
   `node ui-audit/polish/probe.mjs --out rounds/r<N>/probe` (run from repo root;
   `--out` resolves relative to `ui-audit/polish/`, not the repo root, so do
   NOT repeat the `ui-audit/polish/` prefix here or it doubles into
   `ui-audit/polish/ui-audit/polish/...`).
   Read-only except session-creating screens (serial, cleaned up automatically).

2. **Critic (opus)** — reads `AUDIT_RUBRIC.md`, the ui-ux-pro-max quick-reference
   (UX/a11y/touch/forms/nav/layout rules only), the round's `summary.json` +
   per-screen JSON, and the `-s.png` downscaled screenshots in batches (5-8
   screens per batch to stay within context). Writes ranked findings to
   `ui-audit/polish/rounds/r<N>/findings.json`, systemic issues first (a pattern
   repeated across screens outranks a single-screen nit). Each finding cites the
   rubric dimension (1-8) and/or the ui-ux-pro-max rule id it violates, plus a
   concrete file:line and fix.

3. **ONE serial fixer (sonnet)** on the main tree (not a worktree — this is a
   long-lived branch). One commit per fix, plain commit messages. Never touches
   `supabase/functions`. Runs down the ranked findings list until time/budget
   runs out; each fix should be small and reversible. After each commit, note it
   in `state.json.log`.

4. **Re-probe ALL screens**
   `node ui-audit/polish/probe.mjs --out rounds/r<N>/probe-after`
   **Regression gate**: no screen may get worse on any deterministic check
   (smallTargets, smallText, overflow, occluded, contrastFails, problems,
   warnings, driftFindings counts must not increase for any screen — compare
   `probe/summary.json` vs `probe-after/summary.json` per-screen). Also run
   `npm run build` and `npm run test:e2e`; both must pass.
   If the gate fails, `git revert` the offending commit(s) before continuing —
   identify which commit by bisecting through the fixer's commit log for that
   round, don't guess.

5. **Opus judge** compares before/after downscaled screenshot pairs (saved to
   `ui-audit/polish/pairs/<screen-id>-r<N>-before.png` /
   `...-after.png` — copy the `-s.png` from probe/probe-after into pairs/ with
   this naming) plus the probe diff, and either approves or reverts each fix.
   Log the verdict per commit in `state.json.log`.

Repeat for up to 3 rounds, or stop early once probe.mjs's summary is clean of
BLOCKER/major-equivalent findings (per AUDIT_RUBRIC.md severity ladder — treat
occluded/overflow/smallTargets/problems as BLOCKER-tier, driftFindings/
contrastFails/smallText as major-tier, everything else minor).

## Regression-gate command

```
node ui-audit/polish/probe.mjs --out rounds/r<N>/probe-after
node ui-audit/polish/compare.mjs ui-audit/polish/rounds/r<N>/probe/summary.json ui-audit/polish/rounds/r<N>/probe-after/summary.json
```
`compare.mjs` exits non-zero and prints every screen/check that regressed if
any per-screen count increased; exit 0 means clean.

## Cadence

`/context-save` before a long break. `state.json` tracks `{round, step, log}` —
update `log` after every meaningful step so a resumed orchestrator (or a fresh
one) can pick up where the last one left off, the same pattern the overnight
audit used.

## Known harness caveats (read before trusting a finding)

- **Occlusion (check d)** only trusts FIXED/STICKY controls at the current
  scroll position, plus a second pass after scrolling the page to its bottom
  for STATIC/RELATIVE controls still covered by a fixed/sticky layer at that
  end state. A control that's merely below the fold and hasn't been scrolled
  to is never flagged — that's not a bug. See calibration.md for why this
  matters (initial naive center-point-only occlusion flagged 9 false
  positives on ProgramDetail alone).
- **Keyboard warnings** (`warnings` from drive.mjs's `report()`) are iPhone-sim
  warnings, not automatically app bugs — see calibration.md's two verdicts.
  Before trusting a NEW keyboard warning in a later round, apply the same
  discriminating test described there (needed vs. available scroll room in the
  field's overflow ancestors) rather than taking the warning at face value.
- **Token lint (check h)** only scans the files listed per screen in
  screens.json, so it's only as complete as that file list. `.glass*` class
  names are NOT drift (rubric: they're legacy names that now paint solid).
- Session-creating screens (`sessionCreating: true` in screens.json) run
  serially, cleaned up via `testDb()` after EACH one (not once at the end —
  cleaning up only once let one screen's leftover `in_progress` session bleed
  into the next screen's setup, e.g. breaking "Start Fresh" or marking sets
  already-complete). Never add more session-creating screens without also
  making them `serial: true`, or they'll race the one-active-session-per-account
  constraint the overnight audit hit.
- **Duplicate mobile/desktop DOM renders defeat `.first()`.** Several
  components in this app render BOTH a mobile and a desktop/hover variant of
  the same control, hidden via CSS (`hidden lg:flex` / `md:hidden`), and the
  hidden copy sometimes comes FIRST in DOM order (e.g. `WorkoutLoggingHeader`'s
  Finish button, `FloatingActionButton`'s hover-fan tooltip labels). Playwright
  locators pick DOM order regardless of visibility, so a bare `.first()` can
  permanently select the invisible desktop copy on our iPhone viewport and
  time out. Fixed generally in `probe.mjs`: every `click` step selector gets an
  auto-appended `:visible`, and `clickText`/`clickTextIfPresent` walk all
  matches via `firstVisibleText`/`clickFirstVisibleText` instead of
  `getByText(...).first()`. If a NEW screen's setup step times out on a
  selector/text that clearly exists, check for a hidden duplicate before
  assuming the app broke.
- **Native `confirm()`/`alert()` dialogs are auto-dismissed by Playwright**
  unless handled — `probeScreen` registers `page.on('dialog', d =>
  d.accept().catch(() => {}))` up front so a real guard (e.g. ExerciseCard's
  sweaty-thumb heavy-weight confirm) doesn't silently no-op the action that
  triggered it.
- **A full-viewport modal scrim (`fixed inset-0 bg-black/85 ...`) legitimately
  covers everything behind it while open** — the occlusion check (both the
  main pass and the scrolled-to-bottom static pass) excludes any coverage
  attributed to an element whose rect is ~the whole viewport, so an open
  dialog doesn't spuriously flag its entire background as "occluded."
- **iphone-sim's simulated keyboard can swallow clicks below it with no
  error.** It's a `pointer-events:auto` overlay (`.kb` in `layer.js`) spanning
  from a guide line to the bottom of the screen while any input has focus. A
  screen whose setup autofocuses a text field (e.g. the Add Food dialog's
  search input) needs an explicit `{ "blur": true }` step (dismisses focus,
  same as tapping the sim's own Done key) before clicking anything further
  down the page, or the click will report success while doing nothing.
