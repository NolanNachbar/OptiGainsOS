# OptiGains — Mobile-First UI Audit (consolidated)

Goal: make the app look and feel like MacroFactor / Whoop shipped it, **mobile-first (390px)**,
enforcing the existing **VAPOR × MACRO** system (`src/index.css`, `tailwind.config.js`) — not
reinventing it. Ran as a 6-round ultracode convergence loop driven by `/loop` (one round per
firing) + the Workflow orchestrator (`ui-audit/round-runner.workflow.js`).

See **LAUNCH_READINESS.md** for the burn-down, residual-risk list, and next steps.
See **SURFACE_INVENTORY.md** for the full surface map and coverage gaps.

## How it ran
- **Per round:** serial `/browse` capture at 390px+1280px (single shared Chromium daemon →
  capture must be serial) → ~50 parallel opus agnostic audits (blind per surface, 8-point
  rubric) → synthesize/dedupe into systemic vs per-surface → apply fixes serially on the main
  working tree (build-gated) → commit → re-capture next round to confirm fixes and catch
  regressions.
- **Each round agnostic** to prior rounds (per the brief), so findings re-litigate; the loop
  converges on app quality, exiting at the 6-round backstop rather than a zero-finding score.

## 8-point audit rubric (applied every surface)
1. Design-system drift  2. Mobile fitness (≥44px targets, thumb zone, bottom sheets, safe areas,
no h-scroll, no dock/notch clip)  3. Visual consistency  4. Hierarchy & clarity  5. Vertical
density at 390px  6. Belonging & placement  7. AI-slop / unfinished  8. Motion & feedback.

## What changed (themes, by area)
- **Tokens & primitives (systemic):** bad-vs-brand hue split + carb token in `index.css` /
  `ui/system/primitives`; aligned button, input, textarea, combobox, tabs, badge to the system;
  dialog/sheet scrim + ConfirmDialog danger-coral; toaster restyle; card radius normalization.
- **Information architecture:** removed the orphaned floating action button (it rendered on no
  real landing route and a free-floating coral action violated the single-action-color rule);
  its Weigh-In / Stream-Note utilities moved to the mobile sub-tab strip / thumb zone.
- **Per-surface:** density, hierarchy, coral-discipline, and touch-target fixes across Today,
  Fuel/FoodTracker, Train hub + Workouts, Programs, AthleteState/PST, Recovery, Physique,
  Insights/BriefHistory, Mind, Career, auth pages, CreateWorkout/ProgramBuilder, live workout
  logging, and the modal set (WeighIn, Calculators, MealTemplates, WeeklyPlan, MacroGoals, …).

## Notable bugs found (detail in LAUNCH_READINESS.md)
- **Program create → HTTP 400** (`programs.cycle_length` missing) — DB migration needed (backend).
- **Invalid `/program/:id` → infinite spinner** (no not-found state) — recurring.
- **`/physique` crash** (`reading 'pose' of undefined`) — introduced R5, **fixed R6**, verified.
- **Mobile toast occluded behind dialog scrim at 390px** — z-index/portal fix needed.
- Dead/unimplemented: `DietPhaseCard`, `CustomSplitSelector`, `workout-share-modal`.

## Fix commits (branch `ui-audit-mobile-first`, not pushed)
`0cb3a9f1` R1 systemic · `90471a6a` R2 per-surface · `4282e086` R3 · `f4b8c5e2` R4 ·
`08dec3e7` R5 · `ce59cb4b` R6 (+ STATE/prep commits `83c27f87`, `b6ce8aeb`, `569af481`,
`44f5c708`). ~180 fixes total; 68 files changed (+6410 / −4052). Build green every round;
project lint debt is pre-existing (not introduced).

## Artifacts
- `ui-audit/STATE.json` — round-by-round history (counts, fixes, coverage gaps, notes).
- `ui-audit/round-N/<surface>/*.png` — captured screenshots per round (gitignored, local).
- `ui-audit/round-runner.workflow.js` — the per-round orchestration script.
