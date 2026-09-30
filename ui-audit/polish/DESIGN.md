# OptiGains — Ledger design system

Supersedes `ui-audit/AUDIT_RUBRIC.md` (CLEAN). Nolan's verdict on CLEAN: "looks
like AI slop." This is Direction B · Ledger from the mockups
(`ui-audit/polish/directions/index.html`, section `id="B"`, and `specs.md`),
picked over three alternatives, with Direction A · Native as the fallback
wherever B is silent. Target: "if Apple and MacroFactor collaborated on a
lifting app." Dark mode is the primary, default surface; light mode stays
compiling but is not the design priority.

## Identity

MacroFactor-style data ledger: charts lead, numbers sit in tabular columns,
one calm neutral (off-white) carries every action, and color is spent only
where a macro is literally named or a delta is positive. No brand hue. No
gradients, no blur, no card nesting. Depth comes from a 1px rule and 8px of
background gap between modules, not shadow or radius.

## Tokens (dark, default)

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#0B0C0E` | field |
| `--color-surface` (module) | `#141619` | full-bleed module background |
| `--color-surface-2` (raised) | `#1C1F23` | raised chrome: dock, sheets, selected row |
| `--color-elevated` | `#20242A` | float, one step above raised (menus/popovers) |
| `--color-border` (rule) | `#25282D` | the 1px rule between/around modules |
| `--color-border-soft` | `#1E2125` | quieter in-module hairline (table rows) |
| `--text-primary` | `#ECEEF1` | numbers, headings |
| `--text-secondary` | `#C6CAD1` | secondary labels/body |
| `--text-muted` | `#959CA6` | module eyebrows, captions, inactive tabs |
| `--text-faint` | `#7B828C` | quietest UI text (never as dim as the rule color) |
| `--key-surface` | `#2A2E35` | Phase B keypad sheet: digit key background |
| `--key-surface-active` | `#363B44` | Phase B keypad sheet: digit key pressed state |
| `--key-text` | `#F5F3EE` | Phase B keypad sheet: digit key label + current-value readout |
| `--key-ink-on-brand` | `#12161C` | Phase B keypad sheet: ink on a brand-filled button inside the sheet |
| protein | `#EE7B61` | only where protein is named |
| carbs | `#6EA6DA` | only where carbs is named |
| fat | `#E2B84E` | only where fat is named |
| gain (positive delta / done) | `#7CC389` | green only on a positive delta or completed state |
| destructive | muted system red (existing `--bad`, unchanged) | delete/danger only |

`--hue-teal`/`--hue-teal-2` (readiness, HRV, intensity) are untouched — they
are a biometric data hue, a different family from the old brand teal, and
Ledger has no objection to data owning a hue. What changes is `--color-brand`
and its derivatives, which drove every ACTION (buttons, FAB, focus ring, tab
underline, sidebar active state) — those move to off-white:

- `--color-brand`: off-white `#ECEEF1` (was teal `#19C8A6`)
- `--brand-bright`: `#FFFFFF` (hover)
- `--brand-deep`: `#D8DBE0` (pressed/border)
- `--color-action-dark`: `#0B0C0E` (ink on the off-white action button)
- `--brand-tint`: `var(--text-primary)` (active nav ink; was a teal-tinted ink)

`--hue-gold` (kcal) previously collided with the CLEAN fat hue at similar
luminance; Ledger doesn't give calories their own hue at all (calories are
just the hero number), so `--hue-gold`/`.chip-gold` are retargeted to neutral
ink — a deadline chip is now a plain glass pill with the same information,
not a gold one. `--color-positive` (was teal) now points at gain-green.
`--viz-1` (protagonist chart series) becomes ink/off-white; `--viz-5`
(context series) becomes a gray matched to the rule color.

Every `-rgb` triplet was updated alongside its hex (Tailwind's
`rgb(var(--x-rgb) / <alpha-value>)` pattern reads the triplet, not the hex).

## Type

SF Pro via the system stack: `-apple-system, BlinkMacSystemFont, "SF Pro
Text", system-ui, sans-serif`. The Google Fonts Manrope `@import` is dropped.
Tabular numerals stay mandatory on every number (`font-variant-numeric:
tabular-nums`, already threaded through `.font-technical`/`.hero-metric`/
`font-technical` utility — untouched).

Manrope was designed with heavier optical weights than SF Pro at the same
numeric weight, so straight reuse of CLEAN's weights reads bold/blocky in the
new face. Weights were lowered:
- `.type-display`: 800 → 700
- `.hero-metric`: 800 → 600, tracking -0.02em → -0.025em
- `.cta-action`/`.cta-coral`, Button's `action` variant: `font-extrabold` →
  `font-semibold`

Four real hardcoded `fontFamily: 'Manrope'` sites outside index.css/tailwind
(chart tick labels, not the token system) were moved to `var(--font-ui)`:
`src/pages/RecoveryDetail.jsx`, `src/components/progress/ExerciseProgressChart.jsx`,
`src/components/progress/ProgressCharts.jsx`, `src/components/progress/WeightProgressChart.jsx`.

## Surfaces

Full-bleed modules: 1px top+bottom rule (`--color-border`), 8px of
`--color-bg` gap between modules (a real background gap, not a border-radius
illusion), **no radius, no shadow, no nesting** on a module. Controls (button,
input, badge, chip, tab pill) keep a small radius — compressed from CLEAN's
8–24px ramp to roughly 8–10px (`sm:8px, DEFAULT:9px, md:10px`), NOT collapsed
to 0, because Button/Input/Badge/Select all call `rounded-xl`/`rounded-lg`
and a 0px override there would flatten every control, not just modules.

The module override lives in a plain (non-`@layer`) rule appended after
`@tailwind utilities` in `src/index.css`, so it wins over `rounded-2xl`/
`rounded-xl` classes at call sites (`Card.jsx`, `AppCard.jsx`) without needing
`!important` scattered everywhere. `--shadow-1`/`--shadow-2` are set to
`none` for modules; the pinned rest bar and sheet/dock chrome are the only
raised (`--color-surface-2`) layer and keep a visible (not glowing) lift via
the rule, not a shadow.

## Accent

No brand hue anywhere. Primary buttons (`.cta-action`/`.cta-coral`, Button
`variant="volt"/"energy"/"coral"/"primary"`) are solid off-white
(`--color-brand`) fill with dark ink (`--color-action-dark`), unchanged
structurally — just re-tokened. Macro hues (protein/carbs/fat) appear ONLY
next to the macro's own label/bar/chip. Green (`gain`) appears ONLY on a
positive delta or a completed/done state (set-complete ring, checkbox check).
Destructive stays the existing muted system red (`--bad`), untouched.

## Charts

Gray history (`--viz-5` / `--text-faint`), off-white "now" dot and trend
line (`--color-brand`/`--text-primary`), dashed target/pace lines, small
tabular axis labels. `ExerciseProgressChart`, `WeightProgressChart`,
`ProgressCharts` still hardcode `fill: 'rgba(242,244,247,0.4)'`/
`'var(--text-faint)'` for axis ticks — those already resolve through the
faint-ink token or a value close enough it reads correctly under the new
palette; left as phase-2 to re-derive exactly from `--text-faint` (see below).

## Where B is silent, borrow A

Translucent tab bar (blur + saturate, not opaque) — already how
`.glass-elevated`/the mobile dock render (`Layout.jsx`), just re-tokened, not
rebuilt. Sheets/dialogs keep the existing bottom-sheet-on-mobile / centered
dialog pattern (`dialog.jsx`) — that's already A-flavored. Grouped settings
lists and large titles are a phase-2 per-screen change (Profile, Settings),
not part of this foundation pass.

## What changed (phase 1, this pass)

- `src/index.css`: full token repoint (surfaces, ink, brand→off-white, macro
  hues, gold retarget, viz series, shadows→none for modules, module
  radius/rule override, font stack, weight reductions, Manrope import
  removed).
- `tailwind.config.js`: `fontFamily.sans`/`fontFamily.mono` → system stack;
  `borderRadius` scale compressed (see above); colors already ride CSS
  variables so no separate hex changes were needed there.
- `src/components/Layout.jsx`: sidebar active-section state, mobile dock
  active state, and the Wordmark's "GAINS" span moved off
  `brand-tint`/`hue-teal` decoration onto neutral ink (`text-ink`), since
  Ledger has no brand hue to mark "active" with; active state is now weight +
  ink contrast, matching how the mockup's mobile sub-tab strip already worked.
- `Card.jsx`/`AppCard.jsx`: dropped `rounded-2xl`/`rounded-xl` (module
  radius now lives in the CSS override above).
- Four hardcoded `fontFamily: 'Manrope'` call sites (listed above) →
  `var(--font-ui)`.

## Phase 2 (not done in this pass — listed, not started)

- Charts-first Today/Fuel/Workout screen layouts (full-bleed modules
  replacing the current card grid on each page) — this pass only ships the
  primitives/tokens, not a per-screen rebuild.
- Per-page container changes needed for true full-bleed modules (removing
  the page's own card padding/max-width wrapper so a module can run edge to
  edge) — token/primitive layer only touches shared components in this pass.
- Grouped settings lists + large titles (Profile/Settings) borrowed from
  Direction A.
- Re-derive `ExerciseProgressChart`/`WeightProgressChart`/`ProgressCharts`
  axis-tick fill color explicitly from `--text-faint` instead of the
  hardcoded `rgba(242,244,247,0.4)` (visually close today, but not
  token-sourced).
- Remaining raw hex / hardcoded color literals outside the primitives listed
  above (page-level residue) — grep `#[0-9a-fA-F]{3,8}` under `src/pages` and
  `src/components` for the long tail; none block the foundation, but they'll
  drift from the new palette over time if left as literals.
- Chart series recoloring inside individual chart components beyond the two
  above (any chart still importing `--viz-2..4` for a non-macro series should
  be reviewed against "no brand hue" once phase 2 touches that screen).
