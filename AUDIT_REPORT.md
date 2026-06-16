# OptiGains Launch-Readiness Audit Report

**Date:** 2026-06-12  
**Scope:** 25 UI pages + Python engine pipeline  
**Method:** Chrome DevTools MCP (390×844 mobile), static analysis, live execution  
**Format:** severity / fix / 🟢 safe or 🟡 needs review (+ blast radius for 🟡)

---

## PART A — UI/UX

---

### 🔴 CRITICAL

---

**[C-01] `workout_logs.completed_at` column missing from DB → data loss on every workout save**  
`WorkoutDetail.jsx:448,457` · `QuickWorkout.jsx:211-218`

`WorkoutDetail` writes `completed_at` to `workout_schedules` (both `.create` and `.update`). If that column doesn't exist, the mutation throws a 400 **before** `WorkoutLog.create()` runs — the entire workout session is silently lost (toast fires but log is gone). `QuickWorkout` is worse: it first creates an orphan `Workout` entity (step 1), then throws on `WorkoutSchedule.create` (step 2), and `WorkoutLog.create` is never reached (step 3). Error is shown to user but data is gone.

**Fix:** (a) Add `completed_at timestamptz` to `workout_schedules` in Supabase if intentional, OR (b) remove the field from both `.create` and `.update` calls in `WorkoutDetail:448,457` and `QuickWorkout:211-218`. In `QuickWorkout`, reorder to write `WorkoutLog.create` before `WorkoutSchedule.create` so the most critical record is persisted first.

🟡 **Blast radius:** Every workout save in both `WorkoutDetail` and `QuickWorkout` fails with data loss until resolved.

---

**[C-02] Profile save doesn't invalidate `athlete-state-nutrition` → stale macro targets after goal change**  
`Profile.jsx:174-178`

`updateProfileMutation.onSuccess` calls `invalidateProfile(queryClient)` which invalidates `['userProfile', ...]` but never `['athlete-state-nutrition']`. After a user changes their calorie/protein goal and saves, `useDailyTargets` continues serving the previous engine-derived targets from the stale cache. The Food rings, Today page, and meal plan all show wrong numbers until page refresh or cache expiry.

**Fix:** Add `queryClient.invalidateQueries({ queryKey: ['athlete-state-nutrition'] })` inside `updateProfileMutation.onSuccess`.

🟡 **Blast radius:** All pages consuming `useDailyTargets` show stale macro targets for every user after saving a profile goal change.

---

### 🟡 MAJOR

---

**[M-01] ResetPassword shows "link expired" for valid tokens — `getSession()` races URL hash exchange**  
`ResetPassword.jsx:21-25`

`useEffect` calls `supabase.auth.getSession()` before Supabase has exchanged the `#access_token=...&type=recovery` hash fragment. `getSession()` returns null → `hasSession` set to false → user sees "invalid or expired link" on a valid reset link.

**Fix:** Replace `getSession()` with `supabase.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true); else if (event !== 'INITIAL_SESSION') setHasSession(false); })`. Return the unsubscribe in cleanup.

🟡 **Blast radius:** Every password reset attempt fails at the final step; users cannot recover their account without support intervention.

---

**[M-02] Login inputs have no `<label>` elements — accessibility failure**  
`Login.jsx:56-75`

Email and password inputs have `id` attributes but no `<Label htmlFor=...>` elements. `ForgotPassword` and `ResetPassword` correctly use `<Label>`; Login is inconsistent. Screen readers can't announce field purpose; autofill heuristics may misfire.

**Fix:** Add `<Label htmlFor="email">Email</Label>` and `<Label htmlFor="password">Password</Label>` above each Input, matching `ForgotPassword`'s pattern.

🟡 **Blast radius:** Accessibility failure on the highest-traffic page in the app.

---

**[M-03] `Progress.jsx` has no route in `App.jsx` — standalone render path is dead code**  
`App.jsx` (entire file) · `Progress.jsx:1-∞`

`Progress.jsx` is not imported or registered in `App.jsx`. The file contains a full `if (embedded) return inner; return (<div>...{inner}</div>)` branch with its own page chrome. This standalone path can never execute — it is consumed only via `<Progress embedded />` inside `Fuel.jsx`.

**Fix:** Either (a) register a `/progress` route in `App.jsx`, or (b) delete the outer wrapper and `embedded` prop, keeping only the embedded render.

🟢

---

**[M-04] `CreateWorkout` missing `invalidateWorkouts()` on create path → stale workouts list**  
`CreateWorkout.jsx:214-216`

Edit path (line 212) correctly calls `invalidateWorkouts(queryClient)`. Create path omits it. After saving a new workout the user is navigated to `/workouts` which shows the stale cached list until cache expiry.

**Fix:** Add `invalidateWorkouts(queryClient)` immediately after `Workout.create()` on the create branch, before `navigate()`.

🟢

---

**[M-05] `ProgramBuilder` edit mode: no error state guard → could silently overwrite program with empty data**  
`ProgramBuilder.jsx:192`

`useProgram(editId)` error is never destructured. If the fetch fails (network, bad UUID), the page renders a blank form. A user who proceeds and saves will overwrite their program with empty data.

**Fix:** Destructure `error` from `useProgram(editId)` and add: `if (editId && errorExisting) return <ErrorUI message="Failed to load program" />;` after the loading guard.

🟡 **Blast radius:** A user editing a program during a transient network failure could silently wipe it.

---

**[M-06] `ProgramBuilder` never writes `cycle_length` to the DB**  
`ProgramBuilder.jsx:386-434`

`programData` in `handleSubmit` includes `days_per_week` (legacy) but omits `cycle_length` (the v2 canonical field). `useEffect` at line 143 reads `existingProgram.cycle_length` on load and falls back to `days_per_week` — so the field is loaded correctly but never written back, meaning `cycle_length` stays `null` in the programs table permanently.

**Fix:** Add `cycle_length: program.cycle_length` to `programData` in `handleSubmit`.

🟡 **Blast radius:** Affects `ProgramDetail` display and any engine code reading `programs.cycle_length`.

---

**[M-07] `FoodTracker` New Meal dialog: USDA unit conversion missing → wrong macro scaling**  
`FoodTracker.jsx:1920`

The Build New Meal dialog's unit `Select` calls `setNewFood({ ...newFood, serving_unit: value })` without the USDA gram-per-unit recalculation logic present in the Add Food dialog (lines 1511–1526). If a USDA food is selected and the user changes units, displayed macros are wrong.

**Fix:** Apply the same USDA unit-conversion logic from the Add Food dialog's `onValueChange` to the New Meal dialog's unit Select.

🟡 **Blast radius:** Incorrect macro values logged when USDA food unit is changed in the Meal builder.

---

**[M-08] `AthleteState` sub-panels have no loading skeleton → large layout shift on data arrival**  
`AthleteState.jsx:24,27,121,156`

`AdaptiveEnginePanel` returns `null` when `!engineParams && !prescription` (both undefined during load). `WeeklyPlanPanel` returns `null` when `!plan && tests.length === 0`. Both panels insert themselves above the 2×2 grid when data arrives, causing a large layout shift. Neither has a skeleton.

**Fix:** Destructure `isLoading` from both hooks and render a skeleton (3–4 `animate-pulse` glass rows) while loading. Only return `null` after loading completes with truly empty data.

🟢

---

**[M-09] `AthleteState` WeeklyPlanPanel swallows query errors → blank section with no feedback**  
`AthleteState.jsx:124,141`

Both queries inside `WeeklyPlanPanel` discard `isError`. On failure, `plan` is undefined, `tests` is `[]`, and the panel's `if (!plan && tests.length === 0) return null` fires silently. User can't distinguish "no plan" from "load failed."

**Fix:** Destructure `isError` from both queries. Render a compact error banner with a Retry button when either `isError` is true.

🟢

---

**[M-10] `Today.jsx` missing loading/error UI on prescription + athleteState queries**  
`Today.jsx:38-39`

Only `{ prescription }` and `{ state }` are destructured; `isLoading` and `error` are discarded. The readiness hero, directive, morning metrics, fuel rings, and all `MetricTiles` render immediately with `—` placeholders. On error, the page shows a data-empty hero with no feedback.

**Fix:** Destructure `isLoading` and `error` from both hooks. Render hero skeleton during load; `AlertTriangle` banner (matching Dashboard pattern) on error.

🟢

---

**[M-11] `Today.jsx` heatmap query missing `isError` + likely broken by `completed_at` schema mismatch**  
`Today.jsx:42-57`

`recentLogs` query doesn't destructure `isError`. On failure `fatigueData` stays `[]` and the heatmap section disappears with no feedback. Additionally, this query currently selects `completed_at` which doesn't exist in the schema → the query is likely returning HTTP 400 in production right now. This query also fires 4 times (duplicate query keys).

**Fix:** (a) Remove `completed_at` from the `recentLogs` select string; (b) destructure `isError` and show "Could not load muscle data" when true; (c) investigate and deduplicate the 4 concurrent query instances.

🟡 **Blast radius:** Muscle fatigue heatmap on Today page likely broken in production due to the `completed_at` schema mismatch.

---

**[M-12] `Dashboard` secondary queries missing `isError` → Training Load and Muscle Heatmap silently fail**  
`Dashboard.jsx:113-141`

`allCardioSessions` and `weeklyLogsWithExercises` don't destructure `isLoading` or `isError`. The existing `dashError` banner only covers schedule/food/workouts/workoutLogs. Failures in these two queries produce flat/zero charts with no visible signal.

**Fix:** Add `isError` to both destructures; fold into the existing `dashError` aggregate flag.

🟢

---

**[M-13] `Fuel.jsx` water/supp queries missing `isError` → empty state shown on failure (duplicate log risk)**  
`Fuel.jsx:32-58`

Both queries discard `isLoading` and `isError`. A failed query shows "Nothing logged yet today" — user may re-log entries that already exist, creating duplicates when the query recovers.

**Fix:** Destructure `isError`. Show "Could not load today's activity—try again" and suppress the positive empty-state message on error.

🟢

---

### 🟢 MINOR

---

#### Design System

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| DS-01 | `card.jsx:39-41` | `CardContent` uses string concat, not `cn()`/twMerge — `pt-N` override behavior depends on Tailwind CSS output order (fragile across all 4+ call sites) | `import { twMerge }` and change to `className={twMerge('px-4 pb-4 pt-0', className)}` |
| DS-02 | `RecoveryDetail.jsx:179,200` | `pt-6` on error/empty-state CardContent — double-padding trap | Remove `pt-6`; use inner `<div className="pt-6">` or `CardHeader` |
| DS-03 | `ProgramBuilder.jsx:1170-1175` | `pt-6 pb-6` on empty-exercises CardContent — double-padding trap | Remove `pt-6`; wrap content in a div |
| DS-04 | `Profile.jsx:399,427,729,763` | `pt-6` on CardContent in 4 places — fragile without twMerge (DS-01 fix resolves this) | Resolved by DS-01; or use inner div |
| DS-05 | `Mind.jsx:364` | `pt-4 px-5 pb-5` on CardContent in StudyTab — double-padding trap | Remove `pt-4` from the CardContent className |
| DS-06 | `AthleteState.jsx:696,709` | `pt-8` on two error/empty-state CardContents — double-padding trap | Move padding to inner wrapper div |
| DS-07 | `CreateWorkout.jsx:25-26` | `border-l-white/20`, `border-l-white/25` on rest/cooldown step types — bare color, not token | Replace with `border-l-charcoal-border` and `border-l-charcoal-borderSoft` |
| DS-08 | `ProgramBuilder.jsx:498-501` | Step indicator inactive segments use `bg-white/[0.08]` — off-token | Replace with `bg-charcoal-elevated` |
| DS-09 | `ProgramBuilder.jsx:709` | Raw `💡` emoji in JSX tip box | Replace with `<Info />` from lucide-react |
| DS-10 | `FoodTracker.jsx:1133,1222` | Duplicate `bg-charcoal-surface bg-charcoal-surface/20` — second wins, first is dead | Remove the non-opacity version; keep only `/20` |
| DS-11 | `FoodTracker.jsx:1282` | `border-b` without color token in Add Food dialog header | Change to `border-b border-charcoal-border` |
| DS-12 | `FoodTracker.jsx:1710,1992,2055,2227` | Submit buttons use raw `bg-brand` class — bypasses hover/disabled states | Replace with `variant="volt" className="w-full"` |
| DS-13 | `FoodTracker.jsx:1331-1344` | `bg-warn/10 text-warn` on "My Foods" section header — `warn` is biometric-status-only | Replace with `bg-gold/10 text-gold` or a neutral surface token |
| DS-14 | `FoodTracker.jsx:813` | `var(--hue-blue)` for carbs — should be `var(--color-carb)` | Use `var(--color-carb)`, `var(--color-coral)`, `var(--color-fat)` |
| DS-15 | `FoodTracker.jsx:2094` | `text-ink text-ink-muted` conflict; `border` without color token in CSV guide | Remove `text-ink`; change `border` → `border border-charcoal-border` |
| DS-16 | `FoodTracker.jsx:2036` | Duplicate `text-brand text-brand` on meal totals div | Remove one |
| DS-17 | `Career.jsx:267,408,520` | `border-dashed border-white/10` on empty-state borders — off-token | Replace with `border-charcoal-border` |
| DS-18 | `ProgramDetail.jsx:207` | Root div missing `bg-charcoal` | Add `bg-charcoal` to root div |
| DS-19 | `ProgramDetail.jsx:76-86` | Not-found wrapper missing `bg-charcoal min-h-screen` — renders black page | Add `min-h-screen bg-charcoal` to not-found div |
| DS-20 | `ProgramDetail.jsx:570-572` | Redundant explicit token classes on enrollment dialog Inputs | Remove redundant `className` overrides; rely on Input defaults |

---

#### State Integrity / Loading / Error States

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| SI-01 | `RecoveryDetail.jsx:~40` | `isLoading` state shows plain text div; no skeleton | Replace with skeleton cards matching page layout |
| SI-02 | `RecoveryDetail.jsx:54` | `athleteState` query discards `isLoading` and `isError` — engine fetch failures fall back to local formula silently | Destructure `isError`; surface inline warning on failure |
| SI-03 | `Supplements.jsx:402-427` | Loading/error/empty states rendered below content instead of replacing it | Hoist loading guard: `{typesLoading ? <skeleton> : typesError ? <error> : suppTypes.length===0 ? <empty> : <grid>}` |
| SI-04 | `Supplements.jsx:41-55` (WaterCard) | `water-logs` query discards `isLoading` and `isError` — silent 0ml display on failure | Destructure; show skeleton on load, inline error on failure |
| SI-05 | `Workouts.jsx:37-41` | Library tab shows empty-state flash before `workoutsLoading` resolves | Add loading guard before rendering Library grid |
| SI-06 | `Workouts.jsx:259` | `if (!user) return <LoadingScreen />` → infinite spinner for logged-out users | Replace with `navigate('/login'); return null` |
| SI-07 | `FoodTracker.jsx:728-734` | `if (!user)` renders bespoke spinner — inconsistent with `LoadingScreen` | Use `<LoadingScreen />` or redirect to `/login` |
| SI-08 | `WeeklySchedule.jsx:97,117` | `useEnrollments()` discards `isLoading` and `error` — schedule silently shows all-REST on failure | Destructure; show skeleton rows on load, error banner on failure |
| SI-09 | `Dashboard.jsx:161-175` | `todayBrief` query discards `isError` — `TodayActions` shows empty list on failure (indistinguishable from zero-action day) | Destructure `isError`; pass `briefError` boolean to `TodayActions` |
| SI-10 | `Mind.jsx:141-147,353-359,501-507` | Delete mutations in ReadingTab, StudyTab, SkillsTab have no `onError` handler | Add `onError: () => toast.error('Failed to delete')` to each |
| SI-11 | `Mind.jsx:530-575` (SkillsTab) | `TabQueryState` skeleton positioned below content → flash of header before skeleton | Move `<TabQueryState>` above the `skills.map()` grid |
| SI-12 | `Mind.jsx:314,324` | `totalSessions` and `weekMinutes` queries discard `isError` → silently wrong stat tiles on failure | Destructure `isError`; show `—` when errored |
| SI-13 | `CreateWorkout.jsx:104-131` | No `isMounted` guard on edit fetch → unmounted-component state update warning in dev | Add `isMounted` ref to skip setState after unmount |
| SI-14 | `CreateWorkout.jsx:202-208` | Duplicate-name check re-fetches all workouts on submit instead of using cached `allWorkouts`; inner `const allWorkouts` shadows outer | Remove extra fetch; use cached result; rename inner variable |

---

#### Null Safety

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| NS-01 | `ProgramDetail.jsx:441` | `(state.last_session_rir_avg ?? state.last_session_rpe_avg).toFixed(1)` — crashes if both are null | Extract to variable with null check before `.toFixed()` |
| NS-02 | `ProgramDetail.jsx:447-449` | `state.working_weight` renders as empty string when null | Change to `state.working_weight ?? '—'` |
| NS-03 | `AthleteState.jsx:455-459` | `FatigueSection`: null `tsb` resolves to false in `> 5` comparison → `text-bad` + down-arrow shown with `—` value | Add `if (data.tsb == null) { tsbColor = 'text-muted-2'; tsbIcon = ... }` |
| NS-04 | `RecoveryDetail.jsx:44-48,134-136` | ACWR > 1.6 pin clamps to 100% right-edge with no overtraining warning | Add conditional warning banner when `acwr > 1.6`; optionally extend gauge range dynamically |
| NS-05 | `RecoveryDetail.jsx:39,71-73` | `calculateReadinessScore(undefined, null)` and `getReadinessCategory(undefined)` — confirm utils handle undefined gracefully | Verify both utils guard against null/undefined; add null guards if not |
| NS-06 | `Dashboard.jsx:370-372` | `bodyWeightChange > 0` coerces null to false → shows `0.0` with green styling for no-data state | Use `bodyWeightChange != null ? ... : '—'`; apply `text-muted-2` when null |
| NS-07 | `Fuel.jsx:141` | `format(parseISO(recorded_date))` on date-only string → UTC midnight → previous day shown in UTC− timezones | Replace with `format(new Date(recorded_date + 'T00:00:00'), 'MMM d')` |
| NS-08 | `Insights.jsx:13-22` | `getTodayString(profile?.timezone)` called on first render with undefined profile → stale `today` never recomputed | Wrap in `useMemo([profile?.timezone])` or compute inside `DailyBriefCard` |

---

#### Mobile / Touch Targets

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| MOB-01 | `SubTabs.jsx:25` | Tab buttons use `h-8` (32px) — affects Train and Fuel tabs | Change to `h-11` or add `py-1.5` to fill the 48px row |
| MOB-02 | `WorkoutDetail.jsx:1113-1118` | Final "Log Workout" submit button is `h-9` (36px) — most critical tap in logging flow | Add `size="lg"` or `className="flex-1 h-12"` |
| MOB-03 | `QuickWorkout.jsx:283` | Hardcoded `pt-[140px]` offset may clip first exercise card on notched iOS devices | Use CSS calc incorporating `env(safe-area-inset-top, 0px)` |
| MOB-04 | `AthleteState.jsx:697-710` | Error state Retry buttons use `size="sm"` (30px) — recovery path on a broken page | Change to default size or `className="mt-4 h-11"` |
| MOB-05 | `BriefHistory.jsx:110-111` | Back nav `<Link>` wraps only a 20×20px icon — 20px tap target | Add `className="p-3 -ml-3"` to the Link |
| MOB-06 | `PhysiqueTracker.jsx:195-209` | History pose filter buttons use `min-h-[32px]` (32px) | Change to `min-h-[44px]` |
| MOB-07 | `PhysiqueTracker.jsx:103-116` | Pose picker buttons use `py-1` (~28px) | Add `min-h-[44px]` or `py-2.5` |
| MOB-08 | `Progress.jsx:116-123` | Weight history delete button `p-2 -my-2 -mr-2` → ~32px | Change to `p-3 -my-3 -mr-3` |
| MOB-09 | `CreateWorkout.jsx:358-365` | "Add Repeat" button uses `h-9` (36px) | Change to `h-11` |
| MOB-10 | `ProgramBuilder.jsx:479-486` | Cancel button in header has ~24px effective tap area | Add `py-3 px-2` |
| MOB-11 | `FoodTracker.jsx:996-997` | Planned-entry check-off button `p-2 -m-1.5` → ~32px | Change to `p-3 -m-2` or `min-w-[44px] min-h-[44px]` |
| MOB-12 | `FoodTracker.jsx:1033-1039` | Food row edit/delete buttons `p-1` → ~26px; always visible on mobile | Change to `p-2 sm:p-1` |
| MOB-13 | `Career.jsx:211-215` | Kanban card edit/delete icons `p-2.5 -m-1` → ~28px | Change to `p-3.5 -m-2.5` |
| MOB-14 | `Workouts.jsx:442` | Library grid inside `max-h-[600px] overflow-y-auto` → nested scroll anti-pattern on mobile | Remove fixed max-h/overflow wrapper; let content flow into page scroll |

---

#### Display / UX

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| UX-01 | `PhysiqueTracker.jsx:149,220` | `taken_at` rendered as raw ISO string (`2026-06-07`) in thumbnail captions and analysis block | Wrap with `format(parseISO(e.taken_at), 'MMM d, yyyy')` (import from date-fns) |
| UX-02 | `PhysiqueTracker.jsx:1-232` | Uses manual `useState + useCallback` fetch pattern instead of React Query — no stale/retry/background-refetch; potential cache divergence | Migrate to `useQuery` + `useMutation`; invalidate `['physique-entries', user.id]` on upload |
| UX-03 | `Login.jsx:33-35` | Auth errors surfaced only via toast — auto-dismisses before user reads it | Add inline `errorMsg` state; render `<p className="text-bad text-sm">` below password field |
| UX-04 | `Login.jsx:77-87` | Sign In button is raw `<button class="cta-coral">` — tap target and states not guaranteed | Replace with `<Button type="submit" variant="volt" className="w-full">` |
| UX-05 | `ResetPassword.jsx:130-135` | Confirm Password input missing `minLength={8}` | Add `minLength={8}` to confirmPassword Input |
| UX-06 | `Profile.jsx:817-830` | Delete Account confirm button uses `bg-bad/10 text-ink` — visually identical to Cancel | Change to `variant="destructive"` or `className="bg-bad text-white hover:bg-bad/80"` |
| UX-07 | `Profile.jsx:851-870` | Sticky save bar bottom offset may overlap bottom nav on some device sizes | Verify/increase offset; use CSS variable matching actual nav height |
| UX-08 | `ForgotPassword.jsx:68-74` | "Try another email" button has same `hover:bg-charcoal-elevated` as default — no hover affordance | Change to `hover:bg-charcoal-surface` or `hover:opacity-80` |
| UX-09 | `WeeklySchedule.jsx:154-165` | Week nav chevrons: visual circle is 30px, tap zone is 44px via negative margin — visual/tap mismatch | Consider `w-10 h-10` circle with no negative margin |

---

## PART B — Engine

---

### 🔴 CRITICAL (Engine)

---

**[EC-01] MPC prescriber runs on stale/default state when `compute_athlete_state` hasn't run**  
`mpc_prescriber.py:362-370`

If `athlete_rows` is empty (daily compute failed or hasn't run), `today_state={}` and `nutrition={}` → `avg_kcal` falls back to 3200-kcal maintenance baseline. The `NutritionModulator` generates a prescription with no actual recovery or caloric context. The prescription is still written to the DB and displayed in the UI. No crash, silent wrong output.

**Fix:** Add `if not athlete_rows: print('WARN: No athlete_state row — MPC running on stale/default state')`. Optionally `sys.exit(1)` if state is older than 2 days.

🟡 **Blast radius:** Training and nutrition prescription shown to user is computed from default 3200-kcal context when daily compute hasn't run — prescriptions will be generically wrong, not personalized.

---

### 🟡 MAJOR (Engine)

---

**[EM-01] `set_delta` signal computed but never consumed — persistent under-set behavior undetected**  
`deviation_tracker.py` (return value) · `generate_weekly_program.py:807`

`set_delta` (mean signed set-count delta vs prescription) is returned by `track_deviations()` but never passed to `exercise_reward()`. An athlete who consistently does 2 fewer sets than prescribed every session leaves a systematic signal that is silently discarded — the EV posterior never sees it.

**Fix:** Either (a) map persistent negative `set_delta` into `exercise_reward()` as a soft negative signal (`HARD_LOSS * max(0, -set_delta_mean)`), or (b) explicitly document it as informational and remove it from the output dict.

🟡 **Blast radius:** Exercise value posteriors underweight "I always cut sets on this movement" — low-desire exercises accumulate less negative learning than they should; selection quality degrades silently over time.

---

**[EM-02] `from_dict({})` new-user safety not verified — potential KeyError crash on first daily run**  
`compute_athlete_state.py:1086-1094`

On a new user's first run, `prev_params=[]` → `prev={}`. All engine modules (`BanisterKalman`, `RLSParameterLearner`, `CellularInterferenceModel`, `VDOTEngine`, `SystemGuardrail`) receive `from_dict({})`. If any uses dict indexing (`d['key']`) without `.get()` defaults, it will raise `KeyError` and crash the entire first compute run.

**Fix:** Add an integration test: `each_class.from_dict({}).step(...)` with synthetic inputs. Verify no KeyError or AttributeError for any module.

🟡 **Blast radius:** First daily compute for any new user crashes if any engine module's `from_dict()` doesn't guard against missing keys.

---

### 🟢 MINOR (Engine)

---

| # | Module | Location | Issue | Fix | Risk |
|---|--------|----------|-------|-----|------|
| EN-01 | `notes_parser.py` | `_scan_one:274-277` | Session-level "easy" flag fires on full note text — mixed note ("bench felt easy but knee ached") emits both clause-isolated `too_easy` for bench AND a session-level easy flag, overstating session characterization | Emit session-level flag only when no clause-level exercise attribution was found | 🟢 |
| EN-02 | `notes_parser.py` | `_scan_one` pain block | "Shoulder hurt on bench" attributes caution to all bench muscles (chest + triceps + shoulders) — may over-restrict chest/tricep exercises when only shoulder is hurt | When an explicit joint word is present in the clause, limit caution to that joint's muscles; only fall back to full exercise muscle-map when no specific joint is named | 🟡 Could over-restrict chest/tricep exercises on isolated shoulder complaints |
| EN-03 | `deviation_tracker.py` | `_same_slot():55` | Exercises not in `EXERCISE_MUSCLE_MAP` (e.g. "Flat DB Press") return empty muscle set → legitimate swaps misclassified as additions, adding spurious +1 chosen vote without −1 dropped vote | Add missing exercise names to `EXERCISE_MUSCLE_MAP`, or add pattern-based fallback (both names contain "press" → same-slot) | 🟢 |
| EN-04 | `session_generator.py` | `_build_session():647`, `generate():943` | Date-seeded `rng` parameter created and passed to `_build_session()` but no `rng.*` method is ever called — dead code | Remove `rng` from `_build_session()` signature and delete the `random.Random` call, or implement intended tiebreak via `rng.shuffle()` | 🟢 |
| EN-05 | `session_generator.py` | `_build_session():795,803,810` | Bench back-off and assistance slots appended after goal lifts are not checked against `chosen_names` dedup set (currently no live impact since `is_assistance=True` excludes them from the knapsack pool) | After appending assistance slots, add names to `chosen_names` | 🟢 |
| EN-06 | `session_generator.py` | `generate_weekly_program.py:562-572` | Continuity classifier only recognizes 'upper'/'lower' substrings — silently ignores `full_body` and PPL splits; could generate two consecutive same-split days at a week boundary | Extend classifier to also match 'full body', 'push', 'pull', 'legs' | 🟢 |
| EN-07 | `learners.py` | `update_exercise_value():131` | Key not canonicalized inside the function — the main code path is guarded by the key-hygiene merge in `generate_weekly_program.py:742-757`, but any out-of-band caller would silently fragment the posterior | Add `from engine.log_ingest import canon` to learners.py; apply `exercise = canon(exercise)` at top of `update_exercise_value()` and `exercise_value()` | 🟢 |
| EN-08 | `compute_athlete_state.py` | `main:1011` | Empty `profile_rows` path proceeds silently with defaults (`calorie_target=1800`, `protein_g=None`) — new users get no indication this happened | Add `if not profile_rows: print('WARN: No user_profiles row — using defaults')` | 🟢 |
| EN-09 | `generate_weekly_program.py` | `main:979-985` | `perf_slopes = []` at line 979 shadows the `perf_slopes` dict set at line 653 (already fully consumed) — no functional impact, code clarity hazard | Rename local list to `goal_perf_slopes` at line 979; update references at 980–985 | 🟢 |
| EN-10 | `compute_athlete_state.py` | `main:1222` | Duplicate `created_by` param in `diet_phases` query — `sb_get` injects it automatically; explicit copy creates redundant `created_by=eq.{uid}&created_by=eq.{uid}` in query string (harmless, PostgREST takes the last value) | Remove `'created_by': f'eq.{USER_ID}'` from the `sb_get` params dict at line 1222 | 🟢 |

---

## Summary

| Tier | Count |
|------|-------|
| 🔴 Critical | 3 (C-01, C-02, EC-01) |
| 🟡 Major — needs_review | 5 (M-01, M-02, M-05, M-06, M-07, EM-01, EM-02) |
| 🟡 Major — safe | 8 (M-03, M-04, M-08 through M-13) |
| 🟢 Minor | ~45 across design system, state integrity, mobile, null safety, engine |

**Passes:**
- Zero forbidden design-system classes (`text-white`, `bg-zinc-*`, `bg-gray-*`, `bg-slate-*`) found in any page.
- Zero `useDailyTargets` bypass violations — all macro targets route through the hook correctly.
- All four engine→UI contract checks passed (C1–C4). The `protein_target` fallback chain (C2) is functional though undocumented.
- All 6 `notes_parser.py` live tests passed (T1–T6).
- All engine upserts are fully idempotent (`athlete_state`, `engine_params`, `training_prescription`, `program_workouts`).
