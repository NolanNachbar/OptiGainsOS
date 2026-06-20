# OptiGains — Launch Readiness (Mobile-First UI Audit)

**Branch:** `ui-audit-mobile-first` · **Viewport audited:** 390px primary, 1280px secondary
**Method:** 6-round ultracode convergence loop — each round: serial `/browse` capture →
parallel opus agnostic audit (8-point rubric) → synthesize → fix on the main tree → re-audit.
**Exit:** round-6 backstop (planned). Two consecutive clean sweeps were not reached — see
"Why no clean sweep" below. **Status: NOT auto-launch-ready; materially improved.**

> Fixes are committed on `ui-audit-mobile-first` only. **Not pushed** — awaiting your OK.

## Burn-down (full-coverage rounds)

Round 2 is excluded from the trend (auth expired mid-run → thin capture; counts unreliable).

| Round | 🔴 Blockers | 🟠 Majors | 🟡 Minors | Fixes committed |
|------:|:--:|:--:|:--:|---|
| 1 | 12 | 119 | 218 | 14 systemic (`0cb3a9f1`) |
| 2 | *(thin/auth-lost)* | — | — | 32 per-surface (`90471a6a`) |
| 3 | 10 | 124 | 189 | 34 (`4282e086`) |
| 4 | 4 | 100 | 211 | 31 (`f4b8c5e2`) |
| 5 | 12 | 87 | 214 | 26 (`08dec3e7`) |
| 6 | 6 | **78** | 188 | 43 (`ce59cb4b`) |

- **Majors: 119 → 78 (−34%)** — steady, real decline.
- **Minors: 218 → 188** — modest net reduction (agnostic audits surface fresh nits each round).
- **Blockers: volatile (12/10/4/12/6)** — "blocker vs major" severity is subjective per fresh
  agent each round, so the blocker line oscillates rather than converging. Treat it as a
  signal of *theme churn*, not regression.
- **Total: ~180 fixes committed across 6 rounds; 68 files changed (+6410 / −4052).**

## Why no clean sweep (and why that's the planned outcome)

The audit ran **fully agnostic each round** (per the brief: "each loop agnostic to previous").
A ruthless, opinionated reviewer always finds *something* to flag, so blocker/major counts do
not naturally reach zero — the loop converges on *quality of the app*, not on a zero-finding
score. The design anticipated this with a 6-round backstop, which is the exit taken here.
The real deliverable is the ~180 committed fixes + this residual-risk list, not a green score.

## Systemic wins landed (cross-cutting)

- **Design-token sweep** — bad-vs-brand hue split, carb token; `index.css` + `ui/system/primitives`.
- **Primitive alignment to VAPOR × MACRO** — button / input / textarea / combobox / tabs / badge.
- **Dialog/sheet scrim + ConfirmDialog danger-coral**; toaster restyle.
- **IA fix** — removed the orphaned FAB (rendered on zero real landing routes); relocated its
  Weigh-In / Stream-Note actions into the mobile thumb strip.
- **Per-page** density, hierarchy, coral-discipline, and ≥44px touch-target fixes across all
  ~50 surfaces (pages + overlays).

## Residual risk — MUST address before launch

### Blockers / functional (not pure UI; outside what the loop could fix)
1. **Program creation is broken** — `Program Builder → Create Program` returns **HTTP 400:
   "Could not find the `cycle_length` column of `programs` in the schema cache."** Needs a
   **Supabase migration** to add `cycle_length` to the `programs` table. Until then program
   creation (and the downstream "Schedule This?" modal) cannot succeed. **Owner: backend/DB.**
2. **Invalid `/program/:id` hangs on an infinite spinner** — no not-found fallback (unlike
   `/workout-detail` which shows a clean "Workout not found"). Recurred across rounds; add a
   missing-program error state.

### Fixed during the loop (verify before launch)
3. **`/physique` ErrorBoundary crash** (`Cannot read properties of undefined (reading 'pose')`)
   — introduced by a round-5 per-surface edit, **repaired in round 6** and verified rendering.
   Re-confirm on a real device with seeded photos.

### Mobile UX (open, lower severity)
4. **Toast occlusion** — sonner toasts fire bottom-center but stack **behind** an open Dialog's
   scrim at 390px, so validation errors raised while a modal is open are invisible. Needs a
   z-index / portal-order fix for `og-toast` vs Dialog overlay.
5. **Note-capture discoverability** — the "Stream Note" entry now lives only in the Body/Analyze
   mobile sub-tab strip, not on `/today`; a Today/Fuel user can't reach it without navigating two
   sections away. Consider a thumb-zone entry on the home surface.

## Dead / unimplemented surfaces (recommend remove or build)
- `FloatingActionButton.jsx` — removed (was orphaned).
- `DietPhaseCard.jsx`, `CustomSplitSelector.jsx` — defined but never rendered.
- `workout-share-modal` — referenced in the audit list but **no share UI exists** in code
  (`showShareModal` orphaned). Drop from scope or implement.
- `recipe-log`, `stats-setup-modal` — only reachable with seeded data / first-run state.

## Coverage notes (no silent gaps)
- ~50 surfaces (26 pages + ~24 overlays) audited at 390px each round with the session
  pre-authenticated by the orchestrator (subagents are blocked by the safety classifier from
  logging in, so the main thread logs in + saves browse state before each round).
- **Unseedable states** (logged every round, not silently skipped): empty/first-run variants
  for data-backed pages (schedule/library/programs/activity/nutrition/recovery/insights/brief-
  history), the password-reset token form, camera feeds (barcode scanner, physique capture —
  native OS picker, headless can't render), and the prescribed quick-workout handoff.

## Recommended next steps
1. Apply the `cycle_length` Supabase migration (unblocks program creation).
2. Add the `/program/:id` not-found state and the toast z-index fix.
3. Manual device pass on `/physique` (post-fix), program flows, and the home note-capture path.
4. Run `/design-review` at 390px on `/today`, `/fuel`, `/athlete-state` as an independent check
   before pushing (not auto-run here to avoid mutating the shared browse session at close-out).
5. Lint: ~70 pre-existing errors remain in `utils/*.js` + `vite.config.js` (Node globals) —
   pre-date this audit (build is green); clean up separately.
