# OptiGains — Mobile-First UI Audit (consolidated)

Goal: make the app look and feel like MacroFactor/Whoop shipped it, **mobile-first (390px)**.
Method: an `ultracode` convergence loop — multi-agent capture → blind design-eye audit →
worktree/per-file fixes → re-capture → re-audit, until two clean sweeps. Driven through the
gstack headless browser at 390px against the real account.

Branch: `ui-audit-mobile-first`. Standard enforced: the **VAPOR × MACRO** system already in
`src/index.css` + `tailwind.config.js` (not reinvented). See `ui-audit/AUDIT_RUBRIC.md` and
`SURFACE_INVENTORY.md`.

## Coverage
- **25 pages** + **23 overlays** inventoried (`SURFACE_INVENTORY.md`); ~30 surfaces screenshotted
  per round at 390px under `ui-audit/round-N/`.
- Coverage gaps (logged, deliberate): camera-dependent surfaces (BarcodeScanner, Physique
  capture) can't be granted a camera in headless — audited as chrome/idle state from code only.

## Burn-down (findings per sweep)
| Sweep | Total | Blocker | Major | Minor | Notes |
|------:|------:|--------:|------:|------:|-------|
| R1 | 236 | 13 | 111 | 112 | baseline |
| R2 | 65 | 2 | 31 | 32 | after systemic + per-page round 1 |
| R3 | 43 | 1 | 22 | 20 | |
| R4 | 6 | 0 | 4 | 2 | |
| R5 | **0** | 0 | 0 | 0 | first clean sweep |
| R6 | 2 | 0 | 2 | 0 | 1 real (Dashboard) + 1 false-positive (capture artifact) |
| R7 | 3 | 0 | 3 | 0 | touch-target stragglers on tertiary controls |
| R8 | _see LAUNCH_READINESS.md_ | | | | confirming sweep |

13 blockers and 111 majors at R1 → 0 blockers from R5 onward. The long tail (R6–R8) was
progressively finer touch-target polish surfaced only after the larger issues cleared.

## Systemic fixes (one change → many surfaces)
These were done on the main thread first because they touch shared primitives.

1. **Bottom-sheet dialogs** (`ui/dialog.jsx` + new `.glass-sheet` material in `index.css`).
   Every modal was a centered desktop dialog on mobile; now it's a bottom sheet (drag handle,
   slide-up, opaque material so busy pages don't bleed through). Fixed ~34 findings across ~15
   overlay surfaces in one change.
2. **Dock / FAB clearance** (`Layout.jsx`, `ui/FloatingActionButton.jsx`). Raised content
   clearance to 7rem so the last card never clips under the floating dock; FAB suppressed on
   dense log/list + read-only pages where it overlapped data, aligned to the dock inset.
3. **Touch targets** (`ui/input.jsx` 44px, `ui/button.jsx` lg 44px, `ui/combobox.jsx` 44px,
   `ui/dialog.jsx` close-X 44px) + per-call height overrides removed across forms.
4. **SubTabs** (`ui/system/SubTabs.jsx`): never truncate nav labels — natural-width scroll with
   the active tab auto-centered, icons hidden on phones so short labels fit.
5. **Coral discipline**: coral demoted to the single action color per viewport everywhere
   (per-card "View Details", "History" chips, duplicate CTAs → neutral glass).
6. **Duplicate mobile headers**: pages rendering their own title header (duplicating the global
   Layout header) made desktop-only.

## Representative per-surface fixes
- **Today**: session title wraps (no truncation); lb/wk ring shows a real fraction + correct hue;
  STATE/Muscle-load collapsed behind disclosures.
- **Dashboard**: removed duplicate header; one coral primary; soreness grid 3-col (no truncation);
  `loggedToday` wired so the prescribed card shows the done-state instead of nagging.
- **ProgramDetail**: 5984px → ~2100px (action buttons grouped, repeated stall copy de-duplicated).
- **Fuel/FoodTracker**: row action buttons no longer overlap macro values; quick-action tiles
  on system glass; single coral "Add Food".
- **ProgramBuilder**: dropped `min-h-screen`; Back/Next is a sticky footer above the dock.
- **WeeklySchedule**: removed `font-technical` from prose (word-spacing collapse).
- **PreSessionInsightCard**: fixed a `0`-literal render + dead action when suggestedWeight=0.
- **Profile**: defensive dirty-state baseline so a fresh load is never falsely "unsaved".

## Quality gates
- `npm run build`: clean every round.
- `npm run lint`: the audit introduced **zero net-new errors**; the small pre-existing repo lint
  baseline (unused vars / exhaustive-deps in untouched code) is unchanged (and reduced by a few
  via dead-code removal in Profile/PhysiqueTracker).

## Capture-method note
`browse screenshot` defaults to full-page, which can render an off-screen `position:fixed` sticky
bar at the image's bottom edge even when it's not in the 844px viewport. This caused two
false-positive "save bar showing" flags (Profile); verified hidden via live DOM probe and a
viewport-only re-capture. Audit prompts were updated to ignore this artifact.
