# OptiGains UI Audit Rubric — CLEAN (mobile-first 390px)

Canonical reference: `ui-audit/design-system.html` (the "Clean" direction). The
system is implemented in `src/index.css` + `tailwind.config.js`. Enforce it; do
not reinvent. Read those two files for exact values. Summary below.

## The direction (what changed)
The app was just migrated from the old "VAPOR × MACRO" frosted-glass system to
**CLEAN**: flat, dark, data-forward. **Numbers first; everything else gets quiet.**
Anything still wearing the old glass look is now DRIFT:
- **Flat, not frosted.** Solid charcoal cards lifted by soft shadow. NO
  translucency, NO backdrop blur, NO inset specular highlight, NO ambient
  background gradient/glow. Depth = surface tone + shadow only.
- **Teal, not coral.** A calm teal `#19C8A6` (`--color-brand` / `bg-brand` /
  `.cta-coral`) carries EVERY primary action. Coral `#F2766B` stepped back into
  data (protein, RHR) — it is a data hue now, never an action or decoration.
- **Charts lead.** The macro budget and expenditure trend are hero surfaces;
  other content matches their density.

## The standard
- **Field** `#0F1216`. Solid charcoal surfaces, one tone lighter per elevation
  step (card `#181C22`, raised `#1F242B`, float `#23282F`), `1px` solid hairline
  border `#272D35`, soft shadow for lift.
- **Manrope** everywhere. **Tabular numerals** for ALL numbers (`font-technical`
  / `.hero-metric` / `tabular-nums`).
- **Teal `#19C8A6` is THE single action color** — never decoration. CSS var
  `--color-brand`. Exactly one teal action per screen; a second competing
  action color is DRIFT.
- Each datum owns ONE hue: teal=readiness/intensity/HRV, coral=protein/RHR,
  violet=sleep/fatigue, green=body-battery/done, blue=carbs/cardio,
  gold=kcal/deadline, yellow=fat.
- **Physiological spectrum** (ok/warn/bad/info) is for BIOMETRICS ONLY.
- One easing `cubic-bezier(.2,.7,.3,1)`, 180–320ms; entrances rise 8px (`.rise-in`).

## Tokens & primitives to use (not raw values)
- Text: `text-ink` / `text-secondary` / `text-muted-2` / `text-faint` (NOT text-white, slate-*, gray-*).
- Surfaces: `.surface`/`.tile`/`.glass` (solid card), `.glass-inset` (recessed cell), chrome `.glass-elevated` (dock/sheet), `.glass-brand` (teal-tinted). These names are legacy; they now paint SOLID, no blur.
- Actions: `.cta-coral` (the 48px primary — now solid teal), `.cta-ghost` (44px secondary), `.pill-value`, `.chip-gold`.
- Radii: tailwind scale only (sm8/DEFAULT10/md12/lg13/xl16/2xl20/3xl24/full). No arbitrary radii.
- Type: `.type-display`, `.section-label`, `.hero-metric`, `.font-technical`.
- ui primitives: src/components/ui/{button,card,input,select,dialog,tabs,badge,checkbox,...}.jsx

## DRIFT = defect (not opinion)
Translucent/blurred/frosted surfaces · inset specular highlights · ambient
background glow/gradient · **coral (or any non-teal hue) used as an action/CTA
color** · a second action color · raw `text-white` / `slate-*` / `gray-*` /
hardcoded hex / arbitrary radii (`rounded-[7px]`) · decorative color ·
non-Manrope · non-tabular numbers.

## Severity
- **BLOCKER**: broken/unusable on mobile — horizontal scroll, content clipped under dock/notch, touch target unusable, dead control, crash/empty-with-no-guidance, overlapping unreadable content.
- **major**: clear drift visible to user (glass material left over, coral CTA, wrong overlay pattern), primary action unclear in <2s, excessive scroll wall, inconsistent with sibling pages, AI-slop/placeholder/lorem.
- **minor**: spacing/alignment nits, micro-inconsistency, polish.

## Rubric dimensions (score each finding to one)
1. DESIGN-SYSTEM DRIFT (incl. leftover glass/blur/gradient, coral-as-action)
2. MOBILE FITNESS — touch ≥44px, primary action in thumb zone (lower third), bottom-sheet overlays, safe areas, ZERO horizontal scroll, no clipping under dock(~92px bottom)/notch
3. VISUAL CONSISTENCY — spacing/radii/type ramp/card material/icon weight/button hierarchy; cross-page inconsistency is a defect
4. HIERARCHY & CLARITY — numbers lead; primary action obvious <2s; nothing confusing/mislabeled/ambiguous/competing
5. VERTICAL DENSITY — flag pages scrolling excessively at 390px; propose collapse/tab/summarize
6. BELONGING & PLACEMENT — does each element belong on THIS page or better elsewhere/in a sheet/removed
7. AI-SLOP / UNFINISHED — placeholders, dead controls, lorem, debug UI, misalignment, orphaned empty states
8. MOTION & FEEDBACK — interactions confirm state per motion law

## Mobile laws (hard)
- Touch targets ≥44px. Primary actions in thumb zone (lower third).
- Overlays = bottom sheets on mobile unless there's a reason.
- No horizontal scroll, ever. No clipping under dock/notch/safe-area.
- Core content of a primary page should land within ~2 phone viewports before fold-heavy stuff.
- Text legible without zoom; tap feedback on every interactive element.

## Migration note for fixers
The material flip lives in `src/index.css` (CSS vars + `.surface`/`.glass*`/
`.cta-coral` classes) and `tailwind.config.js` (the `brand` token). Those were
already migrated to Clean. Page-level residue to hunt: hardcoded coral/`bg-brand`
used as decoration, inline `backdrop-blur` / `bg-white/[...]` translucent fills,
hardcoded gradients, inset white highlights (`shadow-[inset...]`), and any CTA
not routed through `.cta-coral` / the Button primitive. Per-page fixes go in the
page file; anything touching a shared file goes to the shared pass.

## Finding output (JSON) — one object per finding
{ "surface": "Today", "severity": "BLOCKER|major|minor", "dimension": 1-8,
  "file": "src/pages/Today.jsx:123", "what": "concrete description of what's wrong",
  "fix": "concrete, specific fix referencing tokens/primitives" }
