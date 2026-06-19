# OptiGains UI Audit Rubric — VAPOR × MACRO (mobile-first 390px)

The design system ALREADY EXISTS in `src/index.css` + `tailwind.config.js`. Enforce it; do not reinvent.
Read those two files if you need exact values. Summary below.

## The standard
- **Field** `#0A0D12`. Tiered translucent glass surfaces, 0.5px hairline edges, inset top highlight.
- **Manrope** everywhere. **Tabular numerals** for ALL numbers (`font-technical` / `.hero-metric` / `tabular-nums`).
- **Coral `#EF7368` is THE single action color** — never decoration. CSS var `--color-brand`.
- Each datum owns ONE hue per the token map: teal=readiness/intensity/HRV, violet=sleep/fatigue, green=body-battery/done, blue=carbs/cardio, gold=kcal/deadline, yellow=fat, coral=action/RHR/protein.
- **Physiological spectrum** (ok/warn/bad/info) is for BIOMETRICS ONLY.
- One easing `cubic-bezier(.2,.7,.3,1)`, 180–320ms; entrances rise 8px (`.rise-in`).

## Tokens & primitives to use (not raw values)
- Text: `text-ink` / `text-secondary` / `text-muted-2` / `text-faint` (NOT text-white, slate-*, gray-*).
- Surfaces: `.surface`/`.tile`/`.glass`, `.glass-inset`, chrome `.glass-elevated`, `.glass-brand`.
- Actions: `.cta-coral` (48px primary), `.cta-ghost` (44px secondary), `.pill-value`, `.chip-gold`.
- Radii: tailwind scale only (sm8/DEFAULT10/md12/lg13/xl16/2xl20/3xl24/full). No arbitrary radii.
- Type: `.type-display`, `.section-label`, `.hero-metric`, `.font-technical`.
- ui primitives: src/components/ui/{button,card,input,select,dialog,tabs,badge,checkbox,...}.jsx

## DRIFT = defect (not opinion)
Raw `text-white` / `slate-*` / `gray-*` / hardcoded hex / arbitrary radii (`rounded-[7px]`) /
a second action color / decorative color / non-Manrope / non-tabular numbers.

## Severity
- **blocker**: broken/unusable on mobile — horizontal scroll, content clipped under dock/notch, touch target unusable, dead control, crash/empty-with-no-guidance, overlapping unreadable content.
- **major**: clear DS drift visible to user, wrong overlay pattern, primary action unclear in <2s, excessive scroll wall, inconsistent with sibling pages, AI-slop/placeholder/lorem.
- **minor**: spacing/alignment nits, micro-inconsistency, polish.

## Rubric dimensions (score each finding to one)
1. DESIGN-SYSTEM DRIFT
2. MOBILE FITNESS — touch ≥44px, primary action in thumb zone (lower third), bottom-sheet overlays, safe areas, ZERO horizontal scroll, no clipping under dock(~92px bottom)/notch
3. VISUAL CONSISTENCY — spacing/radii/type ramp/card material/icon weight/button hierarchy; cross-page inconsistency is a defect
4. HIERARCHY & CLARITY — primary action obvious <2s; nothing confusing/mislabeled/ambiguous/competing
5. VERTICAL DENSITY — flag pages scrolling excessively at 390px; propose collapse/tab/summarize
6. BELONGING & PLACEMENT — does each element belong on THIS page or better elsewhere/in a sheet/removed
7. AI-SLOP / UNFINISHED — placeholders, dead controls, lorem, debug UI, misalignment, orphaned empty states
8. MOTION & FEEDBACK — interactions confirm state per motion law

## Mobile laws (hard)
- Touch targets ≥44px. Primary actions in thumb zone (lower third).
- Overlays = bottom sheets on mobile unless there's a reason. (Current dialog.jsx = centered → systemic flag.)
- No horizontal scroll, ever. No clipping under dock/notch/safe-area.
- Core content of a primary page should land within ~2 phone viewports before fold-heavy stuff.
- Text legible without zoom; tap feedback on every interactive element.

## Finding output (JSON) — one object per finding
{ "surface": "P1 Today", "severity": "blocker|major|minor", "dimension": 1-8,
  "file": "src/pages/Today.jsx:123", "what": "concrete description of what's wrong",
  "fix": "concrete, specific fix referencing tokens/primitives" }
