# Concurrent headless persona QA harness (OptiGains)

How to run many QA subagents at once, each driving its OWN isolated headless
browser against the local app, to test and fix the platform persona by persona.
Pairs with `journeys.md` and the persona files in this folder.

OptiGains is a single-user, mobile-first personal training OS (React 19 + Vite +
Supabase). So the "personas" are usage STATES of the one user, not roles:
`new-user`, `daily-athlete`, `power-user`. Primary viewport is 390x844.

## The big safety win: dev auth bypass (use this, never the real account)

`src/contexts/AuthContext.jsx:18-28` has a DEV-only bypass: when `import.meta.env.DEV`
is true and `localStorage.bypass_auth === 'true'` (or the URL has `?bypass_auth=true`),
the app does a REAL `signInWithPassword` against the LOCAL Supabase stack as the seeded
test athlete `athlete@local.test` / `localpassword123` (id `11111111-1111-1111-1111-
111111111111`). RLS, `auth.uid()`, and real persistence behave exactly like prod, against
local data only. (The old empty in-memory mock was deleted June 2026.) So:
- Agents never touch the hosted project or any real account. Local Supabase only.
- The seeded user has REAL data (workouts, food, profile), so populated journeys work.
- Each agent just sets the bypass flag before navigating. That is the whole auth story.

## Prerequisites
1. `npm run dev` (Vite) serving at `http://localhost:5173` (Vite default; `server.host`
   is true). Base is `/` in dev. Routes are `/today`, `/train`, `/fuel`, etc.
2. Node >= 20. Reuse Playwright's Chromium (same as the AeroSync driver pattern).
3. DATA MODE (decide once, see below).

## Data mode (the one real decision)
Local Supabase IS set up and seeded (June 2026), so bypass auth lands in POPULATED data.
- **POPULATED mode (default now).** Bypass auth -> real login as the seeded athlete with
  real workouts/food/profile. Use for the daily-loop journeys (D1-D8) AND the breadth
  pass: every page loads, overlays open/close, mobile layout at 390px, modal quality,
  empty/loading/error states, dead-ends, FAB, a11y. Local data only; never the hosted
  project. Re-seed with `npx supabase db reset` (reapplies schema + `supabase/seed.sql`).
- A surface that renders EMPTY where the seed should have data is a real [DATA] finding
  (e.g. program_workouts is currently empty -> Today may show no PRESCRIBED workout).

## What each subagent does
1. Launch its OWN isolated headless Chromium context (own storage), viewport 390x844.
2. Inject the bypass before any app code runs (Playwright `addInitScript` setting
   `localStorage.bypass_auth='true'`), or append `?bypass_auth=true` to the first URL.
3. Drive its journey's routes/overlays with the Playwright `page` API; screenshot each
   meaningful state with a clear name.
4. READ the captured PNGs (Read tool) and JUDGE the UI/UX visually, mobile-first, not
   just console signals. Then run a desktop pass (e.g. 1280x900) for the sidebar layout.
5. Return structured findings: title, severity tag, surface (Pxx/Oxx), evidence
   (screenshot path), repro, and the criterion it failed.

## Orchestration (one agent per journey, then verify)
Fan out one subagent per journey in `journeys.md`. Adversarially verify every finding
with a second independent subagent before it counts; drop anything the verifier cannot
reproduce. Aggregate confirmed findings to `personas/findings/<YYYY-MM-DD-HHMM>.md`:
per-journey PASS/FAIL, severity-ranked findings, [TASTE] grouped for human review, and a
prioritized fix queue. Then fix the top confirmed issues and re-run.

Severity tags: [BLOCKER] dead end / data loss / crash, [MOBILE] 390px layout / overflow /
centered-not-bottom-sheet, [A11Y] target < 44px / contrast / focus, [PERF] slow / jank,
[TASTE] needs human eye, [DATA] integrity.

## Gotchas (each costs a debugging cycle once)
- KNOWN SYSTEMIC ISSUE: `src/components/ui/dialog.jsx` renders a CENTERED modal on
  mobile, not a bottom sheet (see SURFACE_INVENTORY.md). It affects ~20 overlays. Track
  it ONCE at the primitive level; do not file it 20 times per overlay.
- The seeded athlete HAS real data (workouts/food/profile). Judge empty-state DESIGN where
  a surface is legitimately empty, but flag a populated journey that renders empty where
  the seed should have data as [DATA] (e.g. program_workouts empty -> no prescribed workout).
- FAB is intentionally hidden on `/profile`, `/create-workout`, `/quick-workout`,
  `/program-builder`. Not a bug.
- CAMERA surfaces cannot get a camera in headless: BarcodeScanner (O6) and Physique
  camera (P17). Capture the permission/idle state and audit the chrome only; mark partial.
- LEAFLET / external map tiles may be blank or blocked headless. Do not report a missing
  basemap as a bug; pins/UI still render.
- DESTRUCTIVE actions exist (delete via ui/ConfirmDialog O19, `deleteAccount` RPC in
  AuthContext). Verify the confirm gating; do NOT actually run account deletion.
- Bounded: max 2-3 retries per blocked step, then log and move on. One journey per agent.
  Watch context.
