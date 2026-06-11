# OptiGains Launch-Readiness Audit — UI/UX + Adaptive Engine

_Audited 2026-06-10 · 16 auditors + per-finding adversarial verification (98 agents total) · baseline: clean `npm run build` + `py_compile` of all pipeline scripts._

**146 confirmed findings** (23 high / 59 medium / 64 low) · 47 rated 🟡 needs-review, 99 rated 🟢 safe · 8 candidate findings rejected by verifiers (appendix).

Every finding below was independently re-verified against the code (engine findings re-executed) before inclusion.

---

## Part A · Today / Train / Fuel  (8 findings)

### ui-core-daily.1 `today-fuel-card-bypasses-useDailyTargets` — 🔴 High · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/pages/Today.jsx:108-110 (rendered at 167-183)
- **Issue:** The 'Fuel today' card computes daily kcal/protein targets directly from athlete_state.nutrition instead of useDailyTargets, violating the locked single-source-of-truth rule. The values it shows can disagree with the targets the Fuel log and WeeklyPlanCard show for the same day.
- **Evidence:** Today.jsx: `const calTarget = nutrition?.calorie_target; const proteinTarget = nutrition?.protein_target;` fed into the MiniRings. scripts/compute_athlete_state.py:609+669 shows nutrition.calorie_target is just `profile.daily_calorie_goal` echoed back; the real engine recommendation lives in nutrition.recommended_intake.calorie_target, which useDailyTargets.js:54 prefers and then applies cut-rule clamps (lines 81-85). Additionally, Today reads state via useAthleteState which falls back to the most recent row <= today (useEngineQueries.js:105-108), while useDailyTargets queries the exact date — a second divergence vector. WeeklyPlanCard.jsx:72 and FoodTracker.jsx:217 both correctly use useDailyTargets.
- **Fix:** In Today.jsx, call `const { calories: calTarget, protein: proteinTarget } = useDailyTargets(today)` and delete lines 109-110 (keep avgCal from athlete_state for the ring fill fraction). This also gives the card profile-goal fallbacks instead of '—' when today's athlete_state row is missing.
- **Verifier:** Verified at every link in the chain. Today.jsx:109-110 reads nutrition.calorie_target/protein_target raw from useAthleteState (which falls back to the most recent row <= today, useEngineQueries.js:105-108), while compute_athlete_state.py:609/669 shows that top-level calorie_target is just profile.daily_calorie_goal echoed back; the real recovery-gated recommendation is nutrition.recommended_intake…

### ui-core-daily.2 `fuel-day-window-utc-vs-profile-timezone` — 🟠 Medium · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/pages/Fuel.jsx:38-39 and 52-53
- **Issue:** Today's water and supplement queries filter timestamptz columns with `today + "T00:00:00"`, where `today` is the profile-timezone date but the offsetless literal is interpreted as UTC by Postgres. For a US-timezone user, anything logged after ~5pm local lands in tomorrow's UTC window (so it vanishes from Recent Activity), and yesterday's evening logs leak into today.
- **Evidence:** `gte("logged_at", today + "T00:00:00").lte("logged_at", today + "T23:59:59")` with `today = getTodayString(profile?.timezone)` (Fuel.jsx:26, dateUtils.js:10-12 returns a local yyyy-MM-dd). migrations/add_personal_os_tables.sql:26,84 confirm logged_at/taken_at are `timestamptz DEFAULT now()` (UTC). Supplements.jsx:38-46 has the same pattern, so its WaterCard totals are off by the same boundary.
- **Fix:** Build the window from the profile timezone, e.g. `const dayStart = new TZDate(today + 'T00:00:00', profile?.timezone).toISOString()` (and +24h for the end, using gte/lt) and pass those UTC ISO strings to the queries. Apply the same fix in Supplements.jsx WaterCard/supplement-logs so the two views agree.
- **Verifier:** Fuel.jsx:38-39/52-53 and Supplements.jsx:44-45 filter timestamptz columns (migrations/add_personal_os_tables.sql:26,84) with offsetless literals built from the profile-timezone date string — real day-boundary bug; TZDate is already imported in dateUtils.js so the fix is idiomatic and isolated (query window only), green is right.

### ui-core-daily.3 `water-logs-query-key-not-user-scoped` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/pages/Fuel.jsx:32 (same key at Supplements.jsx:38)
- **Issue:** The water-logs query key is ["water-logs", today] with no user id, unlike the supplement-logs key one query below (["supplement-logs", today, user?.id]). After logout/login as a different user in the same session, cached water entries from the previous user can be served.
- **Evidence:** Fuel.jsx:31-44: `queryKey: ["water-logs", today]` vs Fuel.jsx:46: `queryKey: ["supplement-logs", today, user?.id]`.
- **Fix:** Change the key to ["water-logs", today, user?.id] in both Fuel.jsx and Supplements.jsx. The existing invalidations use the prefix ["water-logs", today], which still matches the longer key, so no other change is needed.
- **Verifier:** Fuel.jsx:32 and Supplements.jsx:38 use ["water-logs", today] while the adjacent supplement query (Fuel.jsx:46) is user-scoped; AuthContext.jsx signOut never clears the query cache, so cross-user cache bleed is possible; prefix invalidations at Supplements.jsx:64,73 still match the longer key — green fix is correct.

### ui-core-daily.4 `cardio-done-toggle-tap-target` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/components/dashboard/PrescribedSessionCard.jsx:63-77 (composed by Today.jsx:219)
- **Issue:** The manual 'mark conditioning done' toggle is a 20x20px button (w-5 h-5) with no extra hit area — well under the ~44px minimum tap target for a PWA, and it sits inline next to a row that is otherwise non-interactive, making it easy to miss-tap.
- **Evidence:** `<button ... className={"shrink-0 w-5 h-5 rounded-full ..."}>` rendering a w-3/w-4 icon; it is the only way to mark a run/swim done when Garmin did not capture it.
- **Fix:** Keep the 20px visual but expand the hit area, e.g. add `relative before:absolute before:-inset-3` or wrap in a p-3 -m-3 button so the touch target is ~44px.
- **Verifier:** CardioDoneToggle at PrescribedSessionCard.jsx:63-77 is a bare w-5 h-5 (20px) button with no padding or pseudo-element hit expansion, and it is the only manual completion path when Garmin misses a session (line 123); hit-area-only fix is purely visual/ergonomic, green.

### ui-core-daily.5 `coachtag-hardcoded-teal-rgba` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/components/dashboard/DailyBriefCard.jsx:27 (composed by Today.jsx:220)
- **Issue:** CoachTag uses an arbitrary hardcoded color `bg-[rgba(94,220,210,0.10)]` plus arbitrary radius `rounded-[7px]`, bypassing the teal token. In the light theme teal retunes to #14A89D (index.css:107) but this chip background stays the dark-theme hue, washing out on white cards.
- **Evidence:** `className="... text-teal bg-[rgba(94,220,210,0.10)] rounded-[7px] ..."` — the text already uses the `text-teal` token while the background hardcodes the dark-theme RGB.
- **Fix:** Replace with the tokenized `bg-teal/10` (teal maps to rgb(var(--hue-teal-rgb)/alpha) in tailwind.config.js:32) and `rounded-sm` (8px token).
- **Verifier:** DailyBriefCard.jsx:27 hardcodes bg-[rgba(94,220,210,0.10)] which is exactly the dark-theme teal (index.css:45 #5EDCD2) while html.light retunes teal to #14A89D (index.css:107); tailwind.config.js:32 maps teal to the CSS var and 'sm' radius is 8px (line 75), so bg-teal/10 + rounded-sm is a faithful tokenized swap, green.

### ui-core-daily.6 `rings-hardcoded-dark-theme-colors` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/components/ui/system/StatRing.jsx:31-36 and primitives.jsx:75 (composed by Today.jsx:130, 167-181)
- **Issue:** The readiness StatRing hardcodes gradient stops #7FE9DD/#3DB8AE and both StatRing and MiniRing hardcode the track stroke rgba(255,255,255,0.09). In the light theme the white track is invisible on white glass and the arc ignores the recalibrated teal (#14A89D), so the Today hero degrades in light mode.
- **Evidence:** StatRing.jsx: `<stop offset="0%" stopColor="#7FE9DD" /> ... stroke="rgba(255,255,255,0.09)"`; primitives.jsx MiniRing: `stroke="rgba(255,255,255,0.09)"` — none of these reference the CSS-var hue tokens that index.css retunes for html.light.
- **Fix:** Use tokens: track `stroke="var(--color-border-soft)"`, gradient stops from `var(--hue-teal)` / `var(--hue-teal-2)` (or a single `var(--hue-teal)` stroke), so both themes render correctly.
- **Verifier:** StatRing.jsx:31-36 hardcodes #7FE9DD/#3DB8AE gradient stops and rgba(255,255,255,0.09) track; primitives.jsx:75 MiniRing has the same white track; --color-border-soft exists in both themes (index.css:28,93) and --hue-teal/--hue-teal-2 are retuned for light mode, so the proposed token swap is correct and visual-only, green.

### ui-core-daily.7 `today-header-date-ignores-profile-timezone` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/pages/Today.jsx:118
- **Issue:** The desktop header date uses `format(new Date(), "EEEE, MMMM d")` (browser-local), while all data on the page is keyed to `getTodayString(profile?.timezone)`. Around midnight in a differing timezone the header names a different day than the prescription/state being shown.
- **Evidence:** Line 35: `const today = getTodayString(profile?.timezone);` vs line 118: `format(new Date(), "EEEE, MMMM d")`.
- **Fix:** Format from the same source: `format(nowInTz(profile?.timezone), "EEEE, MMMM d")` using the existing dateUtils helper.
- **Verifier:** Today.jsx:118 uses format(new Date(), ...) (browser-local) while line 35 keys all page data to getTodayString(profile?.timezone); nowInTz already exists in dateUtils.js, making the one-line fix safe — narrow but genuine consistency bug, green.

### ui-core-daily.8 `fuel-recent-activity-no-empty-state` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/pages/Fuel.jsx:120-144
- **Issue:** The 'Recent Activity' section header always renders, but when there are no supplement/water/weight entries today the list body is completely empty — a dangling header with nothing under it (the default state for new users and every morning).
- **Evidence:** The three list sources (todaySupps.slice(0,3), todayWater.slice(-3), todayWeight) can all be empty; there is no fallback row and no loading skeleton for the two queries feeding it.
- **Fix:** Add a fallback row when all three are empty, e.g. `{todaySupps.length === 0 && todayWater.length === 0 && !todayWeight && (<div className="px-4 py-3 surface text-xs text-ink-muted">Nothing logged yet today</div>)}`.
- **Verifier:** Fuel.jsx:120-144 always renders the 'Recent Activity' header but all three sources (todaySupps, todayWater, todayWeight) can be empty with no fallback row or skeleton — dangling header confirmed; additive empty-state row is isolated, green.


## Part A · Mind / Dashboard / Insights  (13 findings)

### ui-overview.1 `dash-intake-target-bypasses-usedailytargets` — 🔴 High · 🟢 Safe
- **Location:** src/pages/Dashboard.jsx:381-386
- **Issue:** The Intake tile computes the daily calorie target directly from profile.daily_calorie_goal instead of useDailyTargets, so the Dashboard target can disagree with the engine's recovery-gated target (and with Fuel/plan views) whenever athlete_state.nutrition sets calories. Also, if profile.daily_calorie_goal is null the tile renders '/ kcal' (blank with unit).
- **Evidence:** Dashboard.jsx does not import useDailyTargets. Line 381: <span ...>/ {profile?.daily_calorie_goal} kcal</span>; line 386 progress bar: (todayMacros.calories / (profile?.daily_calorie_goal || 1)) * 100. useDailyTargets.js header states it is 'the ONE source of truth' with engine priority over profile goals.
- **Fix:** Call const { calories } = useDailyTargets(today) in Dashboard and use it for both the '/ X kcal' label and the progress-bar denominator; fall back to '—' when null.
- **Verifier:** Verified: Dashboard.jsx:381/386 (live Intake tile) reads profile?.daily_calorie_goal directly and never imports useDailyTargets, while the engine really does write athlete_state.nutrition.recommended_intake.calorie_target (nutrition_modulator.py / compute_athlete_state.py) and Fuel (FoodTracker.jsx) + WeeklyPlanCard consume useDailyTargets — so cross-view target disagreement is real whenever the e…

### ui-overview.2 `dash-readiness-category-hardcoded-hex` — 🟠 Medium · 🟡 Needs review
- **Location:** src/utils/recoveryUtils.js:46-52 (rendered at src/pages/Dashboard.jsx:353-355)
- **Issue:** getReadinessCategory returns hardcoded arbitrary hex classes (text-[#4ade80], text-[#fbbf24], text-[#f87171], text-slate-500) bypassing the ok/warn/bad physiological-spectrum tokens, and colors 'Optimal' with text-brand — coral, which is the SAME hue as the 'bad' token, so an optimal readiness reads as a warning and none of these recolor in the light theme.
- **Evidence:** recoveryUtils.js:48-51: score>=85 → text-brand; >=70 → text-[#4ade80]; >=50 → text-[#fbbf24]; else text-[#f87171]. index.css defines --ok/--warn/--bad and tailwind.config.js exposes ok/warn/bad for 'biometrics only'.
- **Fix:** Map categories to tokens: Optimal → text-teal (or text-ok), Good → text-ok, Moderate → text-warn, Recovery Needed → text-bad, Unknown → text-ink-faint, with matching bg-*/10 values.
- **Blast radius:** getReadinessCategory is a shared util, so the recolor applies everywhere readiness categories render (Dashboard tile, recovery/insight views), not just Dashboard.
- **Verifier:** Verified at recoveryUtils.js:46-52: all four hardcoded arbitrary hex classes and text-brand/text-slate-500 are present exactly as cited and render live in Dashboard.jsx:353 and RecoveryDetail.jsx:81. The brand/bad collision is stronger than stated: index.css defines --color-brand: #EF7368 and --bad: #EF7368 (identical RGB), so 'Optimal' renders byte-identical to the bad token in dark theme. tailwi…

### ui-overview.3 `mind-edit-clobbers-reading-dates` — 🟠 Medium · 🟡 Needs review
- **Location:** src/pages/Mind.jsx:80-94, 106-116, 126-130, 226
- **Issue:** Editing a book rewrites started_at/finished_at to today: openEdit never loads the book's existing dates into the form, and save() defaults them to format(new Date()) whenever status is reading/finished. Likewise, tapping the status chip on an already-finished book (STATUS_NEXT finished→finished) overwrites its original finished_at with today.
- **Evidence:** Line 85: started_at: ... ? (form.started_at || format(new Date(), "yyyy-MM-dd")) : null — form.started_at is always undefined because openEdit (line 127) only copies title/author/category/status/rating/notes; line 110: if (status === "finished") updates.finished_at = today runs even when status is unchanged.
- **Fix:** In openEdit copy book.started_at/finished_at into form so edits preserve them, and in updateStatus only set started_at/finished_at when the status actually transitions (and the field is currently null).
- **Blast radius:** Changes what the reading_log mutations write to Supabase (date fields), affecting any history/stats that read started_at/finished_at.
- **Verifier:** All three mechanisms verified in src/pages/Mind.jsx: (1) openEdit (line 127) copies only title/author/category/status/rating/notes, so form.started_at/finished_at are always undefined; (2) save() (lines 85-86) then defaults both dates to today on every edit of a reading/finished book — and additionally nulls started_at when editing paused/want-to-read books, which the finding understates; (3) Book…

### ui-overview.4 `dash-weight-change-mislabeled-this-wk` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Dashboard.jsx:224-228 and 336-341
- **Issue:** The Trend Weight tile labels the delta 'this wk', but it is computed as latest weight minus the OLDEST entry in the last 365 days (useBodyWeightEntries fetches 365 days), so it shows total change since tracking began, not weekly change. The headline value is also the raw latest weigh-in, not a trend weight.
- **Evidence:** Dashboard.jsx:227 startBodyWeight = sortedWeightEntries[sortedWeightEntries.length - 1]?.weight; useUserQueries.js:63 const since = format(subDays(new Date(), 365), 'yyyy-MM-dd'). Tile renders {bodyWeightChange?.toFixed(1)} + 'this wk' at lines 338-340.
- **Fix:** Compute startBodyWeight from the most recent entry whose recorded_date is >= 7 days before today (or filter entries to the current week), and either rename the headline to 'Weight' or compute an actual smoothed trend.
- **Verifier:** Dashboard.jsx:227 takes the oldest entry of the 365-day window (useUserQueries.js:63) and lines 336-341 label the delta 'this wk' under a 'Trend Weight' headline showing the raw latest weigh-in; fix is isolated derived-value math, correctly green.

### ui-overview.5 `dash-rest-day-flash-and-silent-errors` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Dashboard.jsx:86-108, 206-220, 255-257, 408-455
- **Issue:** The DashboardSkeleton only gates on !user; todaySchedule/todayFood/workouts use initialData [] and workoutLogs defaults to [], so while queries are in flight the page shows a 'Rest Day' card and zeroed intake that then flips to the real workout. If any of these queries errors, the error is never surfaced — the dashboard permanently shows 'Rest Day'/0 kcal as if it were real data.
- **Evidence:** Line 255: if (!user) return <DashboardSkeleton /> is the only gate; lines 86-101 use initialData: []; the workout card branch (lines 410-455) picks the dashed 'Rest Day' card whenever todayLog and workoutTitle are falsy; no isLoading/isError from any of the ~10 queries is consumed.
- **Fix:** Gate the workout card and metabolic grid on the relevant queries' isLoading (render skeleton tiles / a neutral placeholder), and render a small error banner with a retry when schedule/logs/food queries error.
- **Verifier:** Line 255 gates only on !user; schedule/food/workouts use initialData [] (86-108), workoutLogs defaults [], no isLoading/isError consumed anywhere in the file, so the Rest Day card (450-455) and zeroed intake render during load and permanently on query error; UI-only fix, green is right.

### ui-overview.6 `mind-hideheader-padding-override-noop` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Mind.jsx:598 (manifests on src/pages/Insights.jsx:31)
- **Issue:** In hideHeader mode Mind tries to neutralize its page chrome with 'pt-0 px-0 md:px-0 min-h-0', but Tailwind resolves conflicts by stylesheet order, not className order: px-4/md:px-8 and min-h-screen win. Embedded in Insights (which already applies px-4 in its container), Mind content gets double horizontal padding (misaligned with DailyBriefCard above it) and is forced to min-h-screen inside the page.
- **Evidence:** Verified with the project's Tailwind 3.4 binary: generated CSS orders .px-0 before .px-4, .md:px-0 before .md:px-8, and .min-h-0 before .min-h-screen, so the later (non-zero) utilities win when both classes are present; only pt-0 (emitted after py-6) actually applies.
- **Fix:** Build the classes conditionally instead of stacking conflicts, e.g. className={hideHeader ? '' : 'px-4 py-6 md:px-8 bg-charcoal min-h-screen'}.
- **Verifier:** Reproduced with the project's Tailwind: generated CSS orders .px-0 before .px-4, .md:px-0 before .md:px-8, .min-h-0 before .min-h-screen (only pt-0 wins), and Insights.jsx:26 adds its own px-4, so the embedded Mind gets double horizontal padding and min-h-screen; conditional className fix is isolated, green.

### ui-overview.7 `mind-no-loading-or-error-states` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Mind.jsx:68-76, 167-172, 268-276, 353-358, 391-399, 504-509, 549-557
- **Issue:** All four tabs default query data to [] and never read isLoading/isError, so during initial load each tab flashes its 'No books/sessions/skills yet' empty state, and if a Supabase query errors (e.g. offline PWA) the error is swallowed and the tab permanently shows the empty state as if the data were gone.
- **Evidence:** Line 68: const { data: books = [] } = useQuery(...) with no isLoading/isError destructured anywhere in the file; line 167: books.length === 0 renders 'No books yet.' unconditionally; same pattern at 353 (study), 504 (skills), 583 (capture).
- **Fix:** Destructure isLoading/isError from each useQuery; render a skeleton while loading and an inline error state with a retry button on error, keeping the dashed empty state only for a successful empty result.
- **Verifier:** Mind.jsx has zero isLoading/isError usage; all four tabs default data to [] (68, 268, 391, 549) and render dashed empty states (167, 353, 504, 584) during load and after swallowed errors; additive skeleton/error rendering is correctly green.

### ui-overview.8 `mind-hover-only-controls-and-tiny-tap-targets` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Mind.jsx:235-240, 373-375, 472-483
- **Issue:** Primary item actions are hover-revealed (opacity-0 group-hover:opacity-100) — on touch devices there is no hover, so book edit/delete, study-log delete, and skill delete are invisible yet still tappable (invisible delete next to the title risks accidental destructive taps with no confirm). Skill level setters are 10px dots (w-2.5 h-2.5) and star ratings 16px, far below the ~44px tap-target minimum.
- **Evidence:** Line 235/238: buttons with 'opacity-0 group-hover:opacity-100' wrapping w-3.5 h-3.5 icons with p-1 (~22px hit area); line 481: level buttons className 'w-2.5 h-2.5 rounded-full ...'; deletes call del.mutate(id) directly with no ConfirmDialog despite the kit shipping one.
- **Fix:** Make the action buttons always visible on touch (e.g. opacity-60 with md:opacity-0 md:group-hover:opacity-100), pad hit areas to >=40px (p-2.5 or min-w/min-h), wrap the level dots in larger padded buttons, and route deletes through ConfirmDialog.
- **Verifier:** Verified opacity-0 group-hover edit/delete buttons at 235-240, 373-375, 472-474 with ~22px hit areas, w-2.5 h-2.5 level dots at 481, and direct del.mutate calls despite src/components/ui/ConfirmDialog.jsx existing; fix is scoped to these controls, green.

### ui-overview.9 `dash-view-log-dead-link` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Dashboard.jsx:422-424 (with 231-235)
- **Issue:** When a workout was logged ad-hoc (no schedule entry and no program workout), todayWorkoutLink is null and the 'View Log' button links to '#', a dead navigation.
- **Evidence:** Line 422: <Link to={todayWorkoutLink || "#"}>; todayWorkoutLink (lines 231-235) is null unless todayProgramWorkout or todayWorkoutDetails exists, while todayLog comes independently from workout_logs (lines 241-243).
- **Fix:** Link to the log itself when todayWorkoutLink is null (e.g. /workouts or a log-detail route keyed by todayLog.id), or hide the button when there is no destination.
- **Verifier:** Line 422 is <Link to={todayWorkoutLink || "#"}> and todayWorkoutLink (231-235) is null without a program/scheduled workout while todayLog comes independently from workout_logs, so ad-hoc logs get a dead '#' link; fix is isolated, green.

### ui-overview.10 `brief-coachtag-hardcoded-teal-rgba` — ⚪ Low · 🟢 Safe
- **Location:** src/components/dashboard/DailyBriefCard.jsx:27 (composed by Insights.jsx:27 and Dashboard.jsx:470)
- **Issue:** CoachTag hardcodes the dark-theme teal as bg-[rgba(94,220,210,0.10)] instead of the hue token, so it bypasses --hue-teal-rgb and keeps the dark-theme tint in the light theme (where teal is #14A89D).
- **Evidence:** Line 27: className="... text-teal bg-[rgba(94,220,210,0.10)] rounded-[7px] ..."; tailwind.config.js maps teal to rgb(var(--hue-teal-rgb) / <alpha-value>) precisely so /10 tints re-theme.
- **Fix:** Replace bg-[rgba(94,220,210,0.10)] with bg-teal/10.
- **Verifier:** DailyBriefCard.jsx:27 hardcodes bg-[rgba(94,220,210,0.10)] while tailwind.config.js:32 maps teal to rgb(var(--hue-teal-rgb)/<alpha>) and html.light retints teal to 20 168 157, so bg-teal/10 is the correct one-class swap; green.

### ui-overview.11 `mind-white-alpha-breaks-light-theme` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Mind.jsx:27, 33, 50, 168, 354, 481, 505, 530
- **Issue:** Unfilled rating stars (text-white/15), skill level dots (bg-white/[0.08]), 'want-to-read'/'other' chips (bg-white/[0.05] border-white/10) and dashed empty-state borders (border-white/10) hardcode white alpha instead of ink/charcoal-border tokens, so they become invisible white-on-white in the light theme (ThemeToggle is wired in Layout and html.light is fully tokenized).
- **Evidence:** Line 50: n <= value ? "text-gold" : "text-white/15"; line 481: bg-white/[0.08] for empty level dots; index.css html.light sets --color-border to rgba(18,24,34,0.10) precisely so border-charcoal-border re-themes.
- **Fix:** Swap to tokens: text-ink-faint for empty stars, bg-charcoal-surface2 or bg-ink/10 for empty dots, border-charcoal-border for chip and dashed borders.
- **Verifier:** All cited white-alpha hardcodes exist (lines 27, 33, 50, 168, 354, 481, 505, 530), ThemeToggle is rendered from src/components/Layout.jsx, and index.css html.light tokenizes borders/ink, so these become near-invisible on light; token swap is isolated, green.

### ui-overview.12 `mind-total-sessions-capped-at-50` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Mind.jsx:271 and 343
- **Issue:** The 'total sessions' stat displays logs.length, but the study_log query is .limit(50), so once the user passes 50 sessions the counter freezes at 50 (and 'hrs this week' would also undercount if >50 sessions land within a week).
- **Evidence:** Line 271: .order("logged_at", { ascending: false }).limit(50); line 343: <p ...>{logs.length}</p> labeled 'total sessions'.
- **Fix:** Fetch the count separately with supabase.from('study_log').select('*', { count: 'exact', head: true }) (and a week-bounded sum for hours), or relabel to 'recent sessions'.
- **Verifier:** Line 271 has .limit(50) and line 343 renders logs.length labeled 'total sessions', so the stat caps at 50 (and weekly hours would undercount past 50/week); count query or relabel fix is isolated, green.

### ui-overview.13 `mind-capture-querykey-missing-user` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Mind.jsx:550 (and src/components/QuickCapture.jsx:29)
- **Issue:** The capture-inbox query key is ["capture-inbox", "mind"] without user.id — the only user-scoped query in the file without it. Since signOut never clears the react-query cache, logging into a different account on the same device briefly shows the previous user's capture entries until the refetch lands.
- **Evidence:** Line 550: queryKey: ["capture-inbox", "mind"] vs line 69 queryKey: ["reading-log", user?.id]; AuthContext.jsx signOut (line 74) calls supabase.auth.signOut only, no queryClient.clear().
- **Fix:** Change the key to ["capture-inbox", "mind", user?.id] and update QuickCapture's invalidateQueries to match (prefix invalidation ["capture-inbox", domain] still works if user id is appended last).
- **Verifier:** Line 550 uses queryKey ["capture-inbox", "mind"] without user?.id (the only unscoped key in the file vs e.g. line 69), QuickCapture.jsx:29 invalidates the ["capture-inbox", domain] prefix (still matches with id appended), and AuthContext signOut (line 74-76) never clears the query cache; appending user?.id is isolated, green.


## Part A · AthleteState / WeeklySchedule / RecoveryDetail  (13 findings)

### ui-state-schedule.1 `weekly-schedule-localstorage-cardio-checkoff` — 🟠 Medium · 🟡 Needs review
- **Location:** src/pages/WeeklySchedule.jsx:118-132 (used at 377, 388)
- **Issue:** Cardio check-offs are stored in localStorage flags while the rest of the app uses the DB-backed cardio_completions table, so a check-off on this page never appears on the Dashboard (or other devices), is invisible to the engine, and skips the garmin-activities-sync trigger.
- **Evidence:** WeeklySchedule uses `localStorage.getItem(cardioKey(...))` / `setItem(key,'1')`; src/hooks/useCardioCompletions.js:1-3 says it "Replaces a localStorage-only flag (see cardio_completions migration)" and is what components/dashboard/PrescribedSessionCard.jsx:82 uses for the same prescribed cardio.
- **Fix:** Replace isCardioDone/toggleCardio with `const { isDone, toggle } = useCardioCompletions(format(selectedDay, 'yyyy-MM-dd'))` and drop the localStorage helpers and the setSelectedDay re-render hack.
- **Blast radius:** The fix starts writing/deleting rows in cardio_completions from this page and shares the react-query cache (and garmin-activities-sync side effect) with the Dashboard's PrescribedSessionCard.
- **Verifier:** Verified: WeeklySchedule.jsx:118-132 stores cardio check-offs in localStorage only (key cardio_done_*, found nowhere else in src), while PrescribedSessionCard.jsx:82 uses the DB-backed useCardioCompletions hook whose own comment says it replaces this exact localStorage flag. The page is live and canonical (App.jsx:45). The hook also fires garmin-activities-sync on completion, which feeds garmin_ac…

### ui-state-schedule.2 `weekly-schedule-duplicate-cardio-render` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/WeeklySchedule.jsx:293-361 vs 363-404
- **Issue:** On a day with no workout log, prescribed cardio renders twice: once inside the upcoming-program-workout card (runs section, lines 322-340) and again in the unconditional 'pending cardio' card. The comment says the second block is for 'when lift is already logged' but it has no condition on selectedLog.
- **Evidence:** Block B is gated by `{!selectedLog && selectedEntries.map(...)}` and itself renders `runs.map(...)` at line 328; Block C at line 364 is `{selectedEntries.map(...)}` with no selectedLog/log check, rendering the same `entry.cardio_sessions` with toggles.
- **Fix:** Remove the runs section (lines 322-340) from the upcoming-workout card so the check-off card at 363-404 is the single cardio renderer, or gate Block C with `selectedLog &&` per its comment.
- **Verifier:** Verified: Block B (line 293, gated !selectedLog) renders runs at 322-341 and Block C (line 364) maps selectedEntries with no selectedLog check, so prescribed cardio renders twice on unlogged days; removing the runs section from Block B is the safe, isolated fix (green is correct).

### ui-state-schedule.3 `athlete-state-targets-bypass-usedailytargets` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/AthleteState.jsx:433-505 (NutritionSection, '/ target' at 485 and 505)
- **Issue:** The Nutrition card displays calorie_target/protein_target read raw from athlete_state.nutrition instead of useDailyTargets, the mandated single source. useDailyTargets itself documents that the top-level nutrition.calorie_target is 'just the profile goal echoed back' and additionally applies cut-phase protein clamps (1.2-1.5 g/lb) and the fat floor — so the '/ 2,800' and '/ 180g' targets shown here can disagree with the targets the Fuel/Today rings show for the same day.
- **Evidence:** AthleteState renders `/ {calorie_target.toLocaleString()}` and `/ {protein_target}g` straight from `state?.nutrition`; src/hooks/useDailyTargets.js:99-102 ("the engine's top-level calorie_target is just the profile goal echoed back") and 81-85 (cut clamps) show the hook intentionally diverges from those raw fields.
- **Fix:** Pull calories/protein from useDailyTargets(today) for the '/ target' denominators (keeping the engine's calorie_adherence as-is or recomputing it against the hook values), or explicitly relabel the card 'engine 7-day adherence target' so it can't be mistaken for today's target.
- **Verifier:** Verified: NutritionSection (433-505) renders calorie_target/protein_target raw from state.nutrition at lines 485/505, while useDailyTargets (the mandated single source per project memory) prefers recommended_intake targets and applies cut protein clamps (lines 81-85) and fat floor, and its own comment (99-102) calls the top-level calorie_target 'just the profile goal echoed back' — so the two page…

### ui-state-schedule.4 `recovery-readiness-formula-divergence` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/RecoveryDetail.jsx:44-45 (with src/utils/recoveryUtils.js:12-41)
- **Issue:** RecoveryDetail computes 'Today's Readiness' locally (body_battery 40% + sleep 40% + energy 20%, no HRV) while the engine writes athlete_state.recovery.score with a different formula (HRV 35% + sleep 30% + battery 25% + energy 10%), which AthleteState's Recovery card displays. The same day can show two different readiness scores/categories across the two pages, and this page never passes a check-in so the energy term is always dropped.
- **Evidence:** RecoveryDetail: `calculateReadinessScore(latest, null)`; recoveryUtils weights bb*0.4 + ss*0.4 + se*0.2; scripts/compute_athlete_state.py:489-490: `score = round(hrv_norm * 35 + sleep_norm * 30 + battery_norm * 25 + energy_norm * 10)` — the value AthleteState renders as `data.score`.
- **Fix:** Fetch athlete_state.recovery.score for today (same query key pattern as AthleteState) and display it, falling back to the local calculation only when no athlete_state row exists yet.
- **Verifier:** Verified: RecoveryDetail.jsx:44 calls calculateReadinessScore(latest, null) (recoveryUtils weights bb 0.4 + sleep 0.4 + energy 0.2, energy always dropped here, no HRV), while compute_athlete_state.py writes score = hrv*35 + sleep*30 + battery*25 + energy*10 which AthleteState.jsx:320 displays as data.score — two divergent readiness numbers for the same day. Fetch-with-fallback fix is sensible and …

### ui-state-schedule.5 `recovery-charts-hardcoded-dark-ink` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/RecoveryDetail.jsx:115, 127, 177, 182, 219, 224, 228, 233, 258, 263, 268, 272, 275, 278
- **Issue:** All chart inks and the ACWR gauge are hardcoded to dark-theme literals: axis ticks and the sleep-goal label use rgba(242,244,247,0.4) (near-white), grids rgba(255,255,255,0.05), under-target bar fills rgba(123,201,111,0.25)/rgba(155,140,255,0.30), and the gauge gradient bakes in dark-theme hue rgba values. In the light theme (index.css defines a full light token block and the app ships ThemeToggle) the tick labels and grid become effectively invisible on white cards while the rest of the page re-tunes via vars.
- **Evidence:** e.g. line 182 `tick={{ fill: 'rgba(242,244,247,0.4)', ... }}`, line 275 ReferenceLine label fill 'rgba(242,244,247,0.4)', line 115 gradient 'rgba(91,168,245,0.45) ... rgba(239,115,104,0.55)'; index.css:96+ defines light-theme --text-* overrides these literals ignore.
- **Fix:** Replace the literals with CSS vars the way the tooltips already do: tick/label fill 'var(--text-muted)', grid stroke 'var(--color-border-soft)', bar dim-fills via `rgba(var(--hue-green-rgb)/0.25)`-style values, and build the gauge gradient from the hue vars.
- **Verifier:** Verified: tick fills rgba(242,244,247,0.4) (182, 224, 263, 268, 275 label), grids rgba(255,255,255,0.05) (177, 219, 258), dim bar fills rgba(123,201,111,0.25)/rgba(155,140,255,0.30) (233, 278), and the gauge gradient literals (115) all bypass vars while tooltips already use var(--color-elevated); html.light theme exists in index.css so these become near-invisible on light cards. Token swap is isol…

### ui-state-schedule.6 `recovery-category-hardcoded-hex` — ⚪ Low · 🟡 Needs review
- **Location:** src/utils/recoveryUtils.js:46-52 (rendered at src/pages/RecoveryDetail.jsx:81-83)
- **Issue:** getReadinessCategory returns hardcoded-hex badge classes — text-[#4ade80], text-[#fbbf24], text-[#f87171], text-slate-500/bg-slate-600/10 — instead of the physiological-spectrum tokens (ok/warn/bad) that tailwind.config.js reserves for exactly this biometric use, so the readiness badge ignores the locked palette and light-theme re-tuning.
- **Evidence:** `if (score >= 70) return { label: "Good", color: "text-[#4ade80]", bg: "bg-[#4ade80]/10" };` etc.; tailwind.config.js:44-48 defines ok/warn/bad as the 'Physiological spectrum (biometrics only)'.
- **Fix:** Map categories to tokens: Optimal text-ok/bg-ok/10 (or keep brand), Good text-ok, Moderate text-warn/bg-warn/10, Recovery Needed text-bad/bg-bad/10, Unknown text-ink-muted/bg-white-soft.
- **Blast radius:** recoveryUtils is shared — Dashboard.jsx also renders getReadinessCategory's classes, so its readiness badge colors change with the fix.
- **Verifier:** Verified exactly as described: recoveryUtils.js:46-52 returns hardcoded Tailwind-default hexes (text-[#4ade80]/[#fbbf24]/[#f87171], slate for Unknown) for a biometric badge, while tailwind.config.js reserves ok/warn/bad tokens for the 'Physiological spectrum (biometrics only)' and index.css retunes those tokens per theme (dark lines 55-57, light lines 116-118) — so the badge genuinely bypasses the…

### ui-state-schedule.7 `weekly-schedule-hardcoded-colors` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/WeeklySchedule.jsx:20, 206, 209, 270, 391
- **Issue:** Hardcoded color values bypass the locked Vapor x Macro tokens: `text-[#FFD9C9]` for the current-day pill (lines 206/209), `bg-[rgba(123,201,111,0.18)]` for the completed/done circles (270/391), and the REST pill's literal `rgba(242,244,247,0.55)` (line 20). The literal near-white inks will not re-tune in the light theme (index.css defines light-theme overrides for all of these vars).
- **Evidence:** Line 206: `${isCurrentDay ? "text-[#FFD9C9]" : "text-muted-2"}`; line 270: `bg-[rgba(123,201,111,0.18)]`; TYPE_PILLS.REST fg is `rgba(242,244,247,0.55)` while every other pill uses `var(--hue-*-rgb)`.
- **Fix:** Use tokens: `text-brand` (or a brand-tint var) for the current-day pill, `bg-leaf/15 text-leaf` for the done circles, and `var(--text-muted)` / `rgba(var(--hue-...))`-style vars for the REST pill.
- **Verifier:** Verified: text-[#FFD9C9] at lines 206/209, bg-[rgba(123,201,111,0.18)] at 270 and 391, and REST pill fg rgba(242,244,247,0.55) at line 20 bypass tokens; index.css ships an html.light theme (line 87+) and ThemeToggle is mounted in Layout.jsx, so the literals won't re-tune.

### ui-state-schedule.8 `weekly-schedule-no-loading-error-state` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/WeeklySchedule.jsx:101-114 (rendered at 187-238)
- **Issue:** The weekLogs query has no loading or error UI. While loading (or on a thrown Supabase error) weekLogs defaults to [], so every day renders as unlogged/REST with detail '—' and today shows 'UP NEXT' even when the session is already done; a query error is silently indistinguishable from an empty week.
- **Evidence:** `const { data: weekLogs = [] } = useQuery(...)` — isLoading/isError are never destructured, and the week rows render unconditionally from weekLogs.
- **Fix:** Destructure isLoading/isError; render skeleton day rows while loading and a small inline error notice (with retry) on error instead of the false REST/UP NEXT state.
- **Verifier:** Verified: line 101 destructures only { data: weekLogs = [] }; rows render unconditionally from weekLogs so loading/error days show as unlogged REST/'—' and today shows UP NEXT (line 233-234) even when logged. Fix is isolated UI; green correct.

### ui-state-schedule.9 `weekly-schedule-small-tap-targets` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/WeeklySchedule.jsx:170, 179, 387-396
- **Issue:** Week-nav chevrons are 30x30px and the cardio check-off toggle is 24x24px (w-6 h-6) — both below the ~44px mobile tap-target minimum on the page most likely to be used mid-workout on a phone.
- **Evidence:** `className="w-[30px] h-[30px] rounded-full ..."` on both nav buttons; toggle button `className={`shrink-0 mt-0.5 w-6 h-6 rounded-full ...`}`.
- **Fix:** Keep the visual size but expand the hit area: wrap in a min-w-11 min-h-11 flex-centered button, or add padding (e.g. p-2.5 with negative margin) so the touch target reaches 44px.
- **Verifier:** Verified: nav buttons at 170/179 are w-[30px] h-[30px] and the cardio toggle at 389 is w-6 h-6 (24px), both under the 44px mobile minimum; hit-area expansion fix is purely visual/isolated.

### ui-state-schedule.10 `athlete-state-empty-card-padding-trap` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/AthleteState.jsx:582-591
- **Issue:** The header-less empty-state card uses `<CardContent className="py-8 ...">`, but the kit's CardContent default is `px-4 pb-4 pt-0` and Tailwind emits pt-*/pb-* after py-* in the stylesheet, so pt-0 and pb-4 win over py-8 — the 'analysis is being computed' content sits flush against the card's top edge.
- **Evidence:** src/components/ui/card.jsx:40 — `px-4 pb-4 pt-0 ${className}`; Tailwind padding plugin order is p → px/py → pt/pr/pb/pl, so .pt-0 follows .py-8 in the generated CSS regardless of class string order.
- **Fix:** Use explicit sides on that CardContent: `className="pt-8 pb-8 text-center"`.
- **Verifier:** Verified: line 583 uses CardContent className="py-8 text-center" on a header-less Card; card.jsx:40 base is px-4 pb-4 pt-0 and Tailwind 3.4 emits pt-*/pb-* after py-*, so pt-0/pb-4 win — this is the documented 'CardContent pt-0 trap'. Explicit pt-8 pb-8 fix is correct and isolated.

### ui-state-schedule.11 `athlete-state-error-shown-as-computing` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/AthleteState.jsx:544-558 and 581-592
- **Issue:** The athlete_state query's error state is never handled: on a Supabase error, isLoading is false and state is undefined, so the page shows the 'Today's analysis is being computed — check back shortly' empty state, telling the user to wait for data that will never arrive.
- **Evidence:** `const { data: state, isLoading } = useQuery(...)` — isError is not destructured; the only non-loading branch is `!isLoading && !state` rendering the being-computed card.
- **Fix:** Destructure isError/refetch and render a distinct 'Couldn't load athlete state' card with a retry button before falling through to the empty state.
- **Verifier:** Verified: line 544 destructures only { data: state, isLoading }; the only non-loading branch is !isLoading && !state (line 581) rendering the 'being computed' card, so a query error is presented as 'check back shortly'. Adding an isError branch is isolated.

### ui-state-schedule.12 `recovery-empty-card-padding-trap` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/RecoveryDetail.jsx:149-159
- **Issue:** The header-less 'No biometric trends yet' card uses `<CardContent className="py-6 ...">`, but the kit default `pt-0 pb-4` wins over py-6 in the generated stylesheet (pt-*/pb-* are emitted after py-*), so the info row sits flush against the card's top edge. The `py-5` empty branches at lines 169/211/250 lose their top padding the same way (benign there since a CardHeader precedes, but the class is dead).
- **Evidence:** src/components/ui/card.jsx:40 — CardContent base is `px-4 pb-4 pt-0`; line 150 `<CardContent className="py-6 flex items-center gap-3">` on a Card with no CardHeader.
- **Fix:** Use explicit sides: `pt-6 pb-6` at line 149 (and `pt-5 pb-5` for the empty-chart branches if the spacing is wanted).
- **Verifier:** Verified: line 150 CardContent className="py-6 ..." on a header-less Card loses to the kit's pt-0/pb-4 (card.jsx:40, Tailwind 3.4 plugin order), flushing the info row to the card top; the py-5 empty branches at 169/211/250 are likewise overridden (benign, headers precede). Explicit-sides fix is correct.

### ui-state-schedule.13 `recovery-error-state-ignored` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/RecoveryDetail.jsx:21 (hook at src/hooks/useUserQueries.js:80-99)
- **Issue:** useRecoveryMetrics returns an error, but RecoveryDetail destructures only { recoveryMetrics, isLoading }; on a Supabase error the metrics default to [] and the page confidently renders 'No biometric trends yet — connect your wearable' plus a '—' readiness, masking the failure.
- **Evidence:** `const { recoveryMetrics, isLoading } = useRecoveryMetrics(60);` while the hook exposes `return { recoveryMetrics, isLoading, error }` with `data: recoveryMetrics = []` on failure.
- **Fix:** Destructure error and render a 'Couldn't load recovery data' state (with retry) before the empty-trends branch.
- **Verifier:** Verified: RecoveryDetail.jsx:21 destructures only { recoveryMetrics, isLoading } while useUserQueries.js:99 returns { recoveryMetrics, isLoading, error } with [] default, so a Supabase failure renders 'No biometric trends yet — connect your wearable' and a '—' readiness. Adding an error branch is isolated.


## Part A · WorkoutDetail / QuickWorkout / CreateWorkout  (11 findings)

### ui-workout-flows.1 `create-workout-folder-never-saved` — 🔴 High · 🟡 Needs review
- **Location:** src/pages/CreateWorkout.jsx:194-200 (vs 75-82, 264-276)
- **Issue:** The Folder combobox is rendered, populated from existing folders, and loaded in edit mode, but handleSubmit's workoutData omits `folder` entirely — so the folder a user types/picks is silently never persisted on create or update. The Workouts page actively filters and renames by folder, so this is a visibly broken feature.
- **Evidence:** Line 194-200: `const workoutData = { title, description, focus, duration_minutes, exercises }` — no folder key — while state holds workout.folder (line 81/117) and Workouts.jsx filters on w.folder (lines 295-306).
- **Fix:** Add `folder: workout.folder?.trim() || null` to workoutData in handleSubmit.
- **Blast radius:** Adds a field to the workouts insert/update payload consumed by the Workouts library page's folder filtering and rename mutation.
- **Verifier:** Confirmed. handleSubmit (CreateWorkout.jsx:194-200) omits `folder` while state (line 81), edit-load (line 117), and the Folder Combobox (264-276) all handle it, so user input is silently discarded. CreateWorkout is the ONLY entry point for folders — the rename mutation in Workouts.jsx (line 177) is the sole other write path and its UI is gated behind folders.length > 0, making the entire folder fe…

### ui-workout-flows.2 `workout-detail-spinner-forever` — 🔴 High · 🟢 Safe
- **Location:** src/pages/WorkoutDetail.jsx:223-231, 661-663
- **Issue:** If the workout id is missing/deleted (Workout.filter returns []) or, in program mode, the enrollment/programWorkout query errors or returns null, `workout`/`enrollment` stay null and the page renders <LoadingScreen /> forever. There is no not-found or error state for any of the three fetches.
- **Evidence:** loadWorkout only calls setWorkout when workouts.length > 0 (line 228) and has no else branch; render guard `if (!workout || !user || (isProgramSource && (!enrollment || !programWorkout))) return <LoadingScreen />` (line 661). The enrollment/programWorkout useQuery calls (lines 80-91) have no error handling and the guard cannot distinguish loading from error/empty.
- **Fix:** Track a notFound/error state: set it when filter returns empty or queries error (use isError from useQuery), and render a 'Workout not found' card with a Back button instead of LoadingScreen.
- **Verifier:** Verified in src/pages/WorkoutDetail.jsx: loadWorkout (lines 223-231) only sets workout when filter returns rows, with no else branch and no catch; the enrollment/programWorkout useQuery calls (lines 80-91) have no error handling and supabaseClient's entity get() uses .single(), which throws on zero rows, leaving data undefined permanently; the render guard at lines 661-663 then shows LoadingScreen…

### ui-workout-flows.3 `run-keyword-substring-misclassifies-crunch` — 🔴 High · 🟢 Safe
- **Location:** src/pages/WorkoutDetail.jsx:204-205, 873-874
- **Issue:** Cardio detection uses substring matching with the keyword "run", so any exercise containing 'run' as a substring — e.g. 'Cable Crunch', 'Crunches', 'Trunk Rotation' — is classified as cardio in program mode: it is removed from the lift list and rendered as a Conditioning row showing a blank duration.
- **Evidence:** Ran `["zone 2 run",...,"run","cardio"].some(k => name.toLowerCase().includes(k))` against sample names: 'Cable Crunch' → true, 'Crunches' → true, 'Trunk Rotation' → true ('crunch'.includes('run') === true). isRunEx is defined identically at lines 205 and 874.
- **Fix:** Match on word boundaries instead of substrings, e.g. `const isRunEx = (ex) => /\b(run|sprint|cardio|zone ?2)\b/i.test(ex.name || '')`, and extract the duplicated predicate into one helper used by both call sites.
- **Verifier:** Verified in WorkoutDetail.jsx:204-206 and 873-881: cardio detection is substring matching with keyword "run", and 'crunch'/'trunk' both contain 'run'. Misclassified exercises are removed from the loggable lift list (line 206) and rendered as Conditioning rows where duration_minutes is null, showing a blank " min" (line 895). Reachable with real data: program workouts are user-authored via ProgramB…

### ui-workout-flows.4 `program-mode-cardio-logged-as-sets` — 🟠 Medium · 🟡 Needs review
- **Location:** src/pages/WorkoutDetail.jsx:206-219 vs 265-289, 853
- **Issue:** In program mode the synthetic workout filters run/cardio exercises out of workout.exercises (line 206), but the logging initializer builds exerciseLogs from the UNFILTERED programWorkout.exercises (line 267). Run exercises therefore appear twice while logging (as an editable strength ExerciseCard with weight/reps sets AND as a Conditioning row), get written into the workout log as fake strength sets, and the index lookup `workout.exercises[exerciseIndex]` for originalExercise misaligns whenever a run exercise is not last.
- **Evidence:** Line 206: `const liftExercises = (programWorkout.exercises || []).filter(ex => !isRunEx(ex))` feeds workout.exercises; line 267: `initialLogs = programWorkout.exercises.map(...)` uses the raw array; line 853 passes `originalExercise={workout.exercises[exerciseIndex]}` while iterating exerciseLogs.
- **Fix:** Initialize program-mode exerciseLogs from the same filtered lift list (e.g. store liftExercises or filter with the shared isRunEx helper before mapping), so logs, originalExercise indices, and the Conditioning section stay consistent.
- **Blast radius:** Changes which exercises are written into workout_logs.exercises, which the engine's log ingest and program progression read.
- **Verifier:** Verified: line 206 filters run exercises out of the displayed workout.exercises but line 267 builds exerciseLogs from unfiltered programWorkout.exercises, and line 467 saves exerciseLogs raw into WorkoutLog plus feeds logProgramWorkout (line 490). Concrete trigger exists: BUDS_12_Week_Plan.json 'Lower Body PT' has 'Sprint' (6 sets, rep_target '400m') inside exercises, preserved by programIO.js imp…

### ui-workout-flows.5 `quick-workout-cancel-leaves-session-in-progress` — 🟠 Medium · 🟡 Needs review
- **Location:** src/pages/QuickWorkout.jsx:274, 168-185
- **Issue:** A workout_sessions row is created on every page visit (mount effect), but Cancel just navigates away: `onCancel={() => navigate("/dashboard")}` never calls cancelSession(). The confirm dialog says 'Your progress will be lost', yet the row stays in_progress, so the next QuickWorkout visit (within 8h) shows a bogus 'Resume Workout?' prompt for the session the user explicitly cancelled — including empty sessions from accidental visits.
- **Evidence:** Line 274 vs WorkoutDetail.jsx:616-628 where handleCancelLogging correctly calls cancelSession(). useWorkoutSession.createSession inserts status 'in_progress' (useWorkoutSession.js:54-78) and only completeSession/cancelSession change it.
- **Fix:** onCancel should call cancelSession() before navigate('/dashboard') (mirroring WorkoutDetail's handleCancelLogging).
- **Blast radius:** Fix writes status='cancelled' to workout_sessions, which drives the resume-prompt logic on both QuickWorkout and WorkoutDetail.
- **Verifier:** Verified: QuickWorkout.jsx:274 passes onCancel={() => navigate("/dashboard")} with no cancelSession() call and no unmount/beforeunload cleanup; the mount effect (168-185) creates an in_progress workout_sessions row on every fresh visit; checkForActiveSession matches quick sessions (workout_id/program_workout_id NULL, status in_progress) so the cancelled session triggers a bogus Resume Workout? pro…

### ui-workout-flows.6 `workout-detail-autofill-race` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/WorkoutDetail.jsx:139, 261-313
- **Issue:** The workout-logs query is gated on `enabled: !!user && isLogging`, but the exercise-log initializer runs synchronously when isLogging flips true, before the query resolves. With a cold cache (direct navigation / PWA cold start), allWorkoutLogs is [] at init time and the `exerciseLogs.length === 0` guard prevents re-initialization when data arrives — so 'autofill with last used weights' silently seeds every set at 0.
- **Evidence:** Line 139 `enabled: !!user && isLogging`; line 262 `if (workout && isLogging && exerciseLogs.length === 0)` initializes with `lastPerf?.lastWeight || 0` (lines 293-301); allWorkoutLogs is in the effect deps but the length guard blocks the second pass.
- **Fix:** Fetch logs on page load (`enabled: !!user`, matching QuickWorkout.jsx:101) or defer initialization until the query is no longer loading (check isFetched before building initialLogs).
- **Verifier:** Verified: query gated on isLogging (line 139), init effect at 262 seeds weights from empty allWorkoutLogs on cold cache, and the exerciseLogs.length===0 guard blocks re-init when data arrives; QuickWorkout.jsx:101 confirms the proposed enabled:!!user fix pattern. Green fix is correct.

### ui-workout-flows.7 `quick-workout-add-exercise-no-return` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/QuickWorkout.jsx:145-150
- **Issue:** The addExercise wrapper does not return the boolean from addExerciseRaw, but AddExerciseForm only clears the input and closes the form `if (onAdd(exerciseName))`. So on QuickWorkout every successful add leaves the exercise name in the combobox and the form open; tapping Add again silently adds a duplicate exercise.
- **Evidence:** QuickWorkout.jsx:149 `addExerciseRaw(exerciseName, defaultWeight);` (no return) vs AddExerciseForm.jsx:24-29 `if (onAdd(exerciseName)) { setExerciseName(""); setShowForm(false); }`. useWorkoutExercises.addExercise returns true/false (useWorkoutExercises.js:84-103), so WorkoutDetail's direct pass-through works while QuickWorkout's wrapper breaks the contract.
- **Fix:** `return addExerciseRaw(exerciseName, defaultWeight);` in the wrapper.
- **Verifier:** Verified: QuickWorkout.jsx:149 drops the boolean from addExerciseRaw (returns true/false in useWorkoutExercises.js), so AddExerciseForm's if (onAdd(...)) never clears/closes; WorkoutDetail.jsx:911 passes the hook directly and works. One-line return fix, correctly green.

### ui-workout-flows.8 `program-workout-blank-duration-min` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/WorkoutDetail.jsx:212, 739, 877, 894
- **Issue:** Program workouts set duration_minutes to null (line 212), so the Duration stat renders an empty value followed by the unit ('  min'). The Conditioning rows do the same: duration_minutes is `ex.duration_minutes || null` (line 877) and rendered unconditionally as `{c.duration_minutes} min` (line 894).
- **Evidence:** Line 739: `{workout.duration_minutes} <span ...>min</span>` with no null guard; line 212 explicitly sets `duration_minutes: null` for program workouts; line 894: `{c.duration_minutes} min`.
- **Fix:** Guard both renders: hide the Duration stat (or show an em dash) when duration_minutes == null, and in Conditioning render the duration segment only when c.duration_minutes is set.
- **Verifier:** Verified: duration_minutes:null at line 212, unguarded render at line 739 ({workout.duration_minutes} min), and conditioning rows at 877/894 render possibly-null duration unguarded. Render-only null guard is isolated and correctly green.

### ui-workout-flows.9 `quick-workout-hardcoded-brand-rgba` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/QuickWorkout.jsx:317
- **Issue:** Engine-prescription banner icon uses a hardcoded arbitrary value `bg-[rgba(239,115,104,0.15)]` instead of the brand token, so it stays the dark-theme coral (#EF7368) when the light theme re-tunes brand to #E05348.
- **Evidence:** Line 317: `className="w-[26px] h-[26px] rounded-[9px] bg-[rgba(239,115,104,0.15)] text-coral ..."` — compare WorkoutDetail.jsx:822 which correctly uses the token form `bg-warn/[0.15]`.
- **Fix:** Replace with `bg-brand/15` (or `bg-coral/15`) so the CSS-var-driven brand color applies in both themes.
- **Verifier:** Verified: line 317 hardcodes rgba(239,115,104,0.15) while index.css retunes brand/coral to #E05348 (rgb 224 83 72) in the light theme, and tailwind.config.js exposes CSS-var-driven brand/coral tokens supporting /15. Token swap is isolated, correctly green.

### ui-workout-flows.10 `create-workout-nan-from-cleared-number-inputs` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/CreateWorkout.jsx:422, 441, 575 (and 298)
- **Issue:** Sets, Rest (sec), and cardio Duration inputs store `parseInt/parseFloat(e.target.value)` directly; clearing the field yields NaN, which renders as a blank controlled input and — since these fields have no `required` attribute — JSON-serializes to null on save. A saved workout can end up with sets/rest_seconds/duration_value of null, which then renders as missing values and falls back to defaults during logging.
- **Evidence:** Line 422: `onChange={(e) => onChange("sets", parseInt(e.target.value))}` (same pattern at 441 and 575); duration_minutes at line 298 is protected only by the form-level `required` attribute. RepeatBlockCard already guards correctly at line 473 with `Math.max(1, parseInt(e.target.value) || 1)`.
- **Fix:** Apply the same guard pattern used at line 473: e.g. `onChange("sets", Math.max(1, parseInt(e.target.value) || 1))` and `onChange("rest_seconds", parseInt(e.target.value) || 0)` / `parseFloat(...) || 0`, or keep the raw string in state and coerce at submit.
- **Verifier:** Verified: lines 422/441/575 store raw parseInt/parseFloat (NaN on clear) with no required attribute, handleSubmit serializes exercises unsanitized (NaN -> null), line 298 is form-required-protected as stated, and the guard pattern exists at RepeatBlockCard line 473. Fix is correctly green.

### ui-workout-flows.11 `logging-header-small-tap-targets` — ⚪ Low · 🟢 Safe
- **Location:** src/components/workouts/WorkoutLoggingHeader.jsx:96-128 (composed by WorkoutDetail.jsx and QuickWorkout.jsx)
- **Issue:** On mobile, the rest-timer +30s/Skip pills and the Cancel/Finish buttons are h-7 (28px) with px-2 — well under the ~44px minimum touch target — in the header used mid-workout, where Cancel sits directly next to Finish. Mis-taps here either discard or prematurely finish a session.
- **Evidence:** Lines 96/102: `h-7 md:h-8 px-2.5` on the +30s and Skip buttons; lines 118/128: `h-7 md:h-8 text-xs md:text-sm px-2 md:px-3` on Cancel and Finish (icon-only on mobile, gap-1.5 between them).
- **Fix:** Raise mobile sizes to at least h-10 (or keep visual height and add a larger hit area via padding/pseudo-element), and increase the gap between Cancel and Finish on mobile.
- **Verifier:** Verified: h-7 (28px) px-2/px-2.5 buttons at lines 96/102/118/128 with gap-1.5, icon-only on mobile; Finish calls onFinish (save) directly with no confirm. Minor caveat: Cancel is confirm-dialog-gated (line 116), so a mis-tap cannot directly discard, but the sub-44px target issue and premature-finish risk are real; sizing-only fix is green.


## Part A · ProgramBuilder / ProgramDetail / Workouts  (14 findings)

### ui-programs.1 `program-save-writes-nonexistent-columns` — 🔴 High · 🟡 Needs review
- **Location:** src/pages/ProgramBuilder.jsx:386-442 (handleSubmit), src/hooks/useProgramQueries.js:109-161
- **Issue:** Saving a program writes columns that do not exist in the live database: programs.name, programs.goal, programs.cycle_length, and program_workouts.notes, day_number, source_workout_id. PostgREST rejects inserts with unknown columns, so 'Create Program' and 'Update Program' always fail with the generic 'Failed to create program' toast.
- **Evidence:** Live schema (information_schema via Supabase project fizdftijlbcnjmemrvao): programs = id, created_by, title, description, focus, duration_weeks, days_per_week, difficulty, is_public, created_at, updated_at, schema_version, num_cycles, tags — no name/goal/cycle_length. program_workouts = id, program_id, created_by, title, focus, day_of_week, week_number, day_index, exercises, duration_minutes, created_at, scheduled_date, cardio_sessions — no notes/day_number/source_workout_id. handleSubmit builds programData with name/cycle_length/goal (ProgramBuilder.jsx:406-416) and per-workout notes/day_number/source_workout_id (390-404); db.entities.Program.create does a raw insert with no field mapping (supabaseClient.js:531-543). The 2 existing programs rows use title/focus and were written by scripts/generate_weekly_program.py.
- **Fix:** In handleSubmit (or a mapping layer in useCreateProgram/useUpdateProgram), rename name→title and goal→focus, store cycle_length in days_per_week (or add a cycle_length column via migration), and drop notes/day_number/source_workout_id from the payload or add those columns. Add the same mapping on update.
- **Blast radius:** Touches the program write path shared with edit mode and the engine scripts (generate_weekly_program.py) that read programs/program_workouts, so column choices must match what the engine writes.
- **Verifier:** Code confirmed verbatim: ProgramBuilder.jsx:386-442 writes name/goal/cycle_length on programs and notes/day_number/source_workout_id on program_workouts; useProgramQueries.js:109-161 and supabaseClient.js create/update are raw passthrough inserts with no mapping, and PostgREST rejects unknown columns, so create/update fails with the generic toast. The page is live (routed at /program-builder in Ap…

### ui-programs.2 `enroll-start-date-column-missing` — 🔴 High · 🟡 Needs review
- **Location:** src/hooks/useProgramQueries.js:204-225 (used by ProgramDetail.jsx:119-134), src/components/workouts/ScheduleAfterCreateModal.jsx:66-67
- **Issue:** Enrolling in a program writes a start_date field, but program_enrollments has no start_date column (it is started_at), so the insert/update is rejected and 'Start Program' always fails with 'Failed to enroll'. ScheduleAfterCreateModal writes both started_at and start_date and fails the same way.
- **Evidence:** Live schema: program_enrollments = id, created_by, program_id, started_at, current_week, current_day, status, progression_state, created_at, updated_at, completed_workouts, current_day_index, current_cycle. useEnrollInProgram builds enrollmentData with start_date (useProgramQueries.js:209); ScheduleAfterCreateModal.jsx:66-67 sends both started_at and start_date. Existing enrollment rows (2) have started_at set and were script-created.
- **Fix:** Write started_at instead of start_date in useEnrollInProgram and remove the duplicate start_date key in ScheduleAfterCreateModal. Update CycleDayGrid.jsx:46 to read enrollment.started_at (it currently reads enrollment.start_date, so calendar dates never render).
- **Blast radius:** Changes the enrollment write path consumed by ProgramDetail, Workouts active-programs tab, scheduling, and engine scripts that read program_enrollments.
- **Verifier:** Confirmed. useProgramQueries.js:209 writes start_date in both create and update enrollment paths; createEntity (supabaseClient.js:531-555) passes payloads unfiltered to PostgREST, which rejects unknown columns (PGRST204), so ProgramDetail's Start Program (lines 119-134, 595-597) always hits the 'Failed to enroll' toast. ScheduleAfterCreateModal.jsx:66-67 writes both started_at and start_date and f…

### ui-programs.3 `program-title-goal-read-mismatch` — 🔴 High · 🟢 Safe
- **Location:** src/pages/ProgramDetail.jsx:91,225-227,244-246; src/pages/ProgramBuilder.jsx:140-146; src/components/programs/ProgramCard.jsx:15,41,48-49; src/pages/Workouts.jsx:664,678
- **Issue:** The UI reads program.name, program.goal, and program.cycle_length, but real rows store title and focus and have no cycle_length. For the actual programs in the database the ProgramDetail h1 renders empty, the goal badge never shows, ProgramCard titles on the Workouts Programs tab are blank, and the builder's edit mode pre-fills an empty name. cycle_length silently falls back to days_per_week (hardcoded placeholder 7 by the builder), which is wrong for non-7-day cycles.
- **Evidence:** Live row: programs.title = 'Strength + BUD/S Conditioning', no name/goal/cycle_length columns. ProgramDetail.jsx:244 renders {program.name}; ProgramCard.jsx:48-49 renders {program.name}; useEnrollments already selects 'title' (useProgramQueries.js:56) confirming the real column name.
- **Fix:** Read program.title ?? program.name and program.focus ?? program.goal at these call sites (or normalize once in useProgram/useEnrollments), and derive cycle length consistently with whatever column the write-path fix lands on.
- **Verifier:** All cited read sites verified live and unguarded: ProgramDetail.jsx:91/224-227/244 reads program.name/goal/cycle_length from a raw select('*') with no normalization (createEntity in supabaseClient.js:492 is passthrough); ProgramCard.jsx:15/41/48-49 same; ProgramBuilder.jsx:140-146 prefills name||'' and hardcodes days_per_week:7. Decisive code-only proof: useEnrollments (useProgramQueries.js:56) se…

### ui-programs.4 `avg-rir-field-name-mismatch` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/ProgramDetail.jsx:441-442
- **Issue:** Progression Tracking reads state.last_session_rpe_avg, but the engine writes last_session_rir_avg, so 'Avg RIR' never displays after any logged session (the only writer of last_session_rpe_avg is the enrollment stub which sets it to null).
- **Evidence:** programProgression.js:204 writes last_session_rir_avg: avgRir in updateProgressionState; useProgramQueries.js:185 initializes last_session_rpe_avg: null at enroll time. grep shows no other writer of last_session_rpe_avg.
- **Fix:** Read state.last_session_rir_avg ?? state.last_session_rpe_avg in ProgramDetail.jsx:441-442.
- **Verifier:** ProgramDetail.jsx:441-442 reads last_session_rpe_avg; only writer of that key is the enroll stub (useProgramQueries.js:185, null) while the engine writes last_session_rir_avg (programProgression.js:204), so Avg RIR never renders; fix is a one-line read change, green.

### ui-programs.5 `activity-log-utc-date-shift` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Workouts.jsx:979,992 (also sort at 69 and dayLabel at 839-848)
- **Issue:** Activity Log parses date-only DB strings with new Date('YYYY-MM-DD'), which is UTC midnight; in any US timezone every strength log and Garmin activity is grouped one day early — a workout logged today shows under 'YESTERDAY'.
- **Evidence:** workout_logs.log_date and garmin_activities.activity_date are Postgres `date` columns (verified via information_schema), and log_date is written as a local date string (supabaseClient.js getTodayLocalDateStr). Ran: TZ=America/Denver node -e "new Date('2026-06-10')" → 'Tue Jun 09 2026 00:00:00 GMT-0600'.
- **Fix:** Parse with date-fns parseISO (already imported elsewhere in the app; it treats date-only strings as local midnight) instead of new Date() at Workouts.jsx:979 and 992, e.g. date: parseISO(log.log_date) with a created_at fallback.
- **Verifier:** Workouts.jsx:979/992 use new Date() on date-only strings (log_date written as local yyyy-MM-dd by QuickWorkout.jsx:224 and WorkoutDetail.jsx:466), which parses as UTC midnight and shifts grouping a day early in US timezones via dayLabel; parseISO fix is correct and isolated.

### ui-programs.6 `strength-duration-wrong-field` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Workouts.jsx:984 (rendered at 893)
- **Issue:** Strength entries read log.duration_minutes, but workout_logs stores duration_seconds; entry.duration is always undefined so the Duration stat never renders, and if the field ever existed it would be labeled 'min' while holding seconds.
- **Evidence:** Live schema: workout_logs has duration_seconds (integer), no duration_minutes column. StrengthEntryCard renders `${entry.duration} min` only when truthy — currently dead.
- **Fix:** Map duration: log.duration_seconds ? Math.round(log.duration_seconds / 60) : null at Workouts.jsx:984.
- **Verifier:** Workouts.jsx:984 maps log.duration_minutes but both WorkoutLog writers store duration_seconds only (rest of app reads duration_seconds too), so the Duration StatBlock at line 893 is permanently dead; mapping fix is isolated.

### ui-programs.7 `dead-generate-workouts-ctas` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Workouts.jsx:256-274,338-354,536-544,552-610
- **Issue:** Workout generation was removed (generateWorkouts immediately toasts an error), yet the page keeps a prominent 'Generate Workouts' header button, a 'Generate Your First Workouts' primary CTA in the library empty state, and a permanent 'Your Generated Weekly Plan' card telling users to click Generate. Every one of these paths only produces an error toast.
- **Evidence:** generateWorkouts (lines 264-267) unconditionally runs toast.error('Workout generation removed — use Program Builder...') and returns. The workoutPlan query-cache key ['workoutPlan'] is never set anywhere (grep: only the key definition in queryKeys.js:98), so the plan card always renders its 'No plan found yet. Click Generate Workouts' placeholder (601-610). saveGeneratedWorkoutMutation (80-113) is also dead code and writes a nonexistent workouts.type column.
- **Fix:** Remove the Generate buttons, the saveGeneratedWorkoutMutation/workoutPlan state, and the Generated Weekly Plan card; point the library empty state at Create Custom / Program Builder instead.
- **Verifier:** generateWorkouts (264-267) unconditionally toasts an error and returns; the header button (338-354), library empty-state CTA (536-544), and permanent Generated Weekly Plan card (552-610) all lead nowhere since ['workoutPlan'] is never populated (only key definition in queryKeys.js:98); removal of dead UI is behavior-safe.

### ui-programs.8 `activity-log-no-loading-error-state` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Workouts.jsx:43-72,711-718,1064-1075
- **Issue:** The workouts, garmin_activities, and workout_logs queries ignore isLoading and error. The default tab (activity-log) renders the 'No activity yet' empty state while data is still fetching (empty-state flash on every cold load) and shows it permanently if a query errors, with no retry or error message.
- **Evidence:** All three useQuery calls destructure only data with [] defaults; ActivityLogTab receives the arrays directly and branches only on allEntries.length === 0 (line 1064). The cardioSessions queryFn throws on error (line 59) but nothing consumes the error state.
- **Fix:** Destructure isLoading/error from the three queries, render a skeleton/spinner while any is loading, and an error state with retry when one fails before showing the empty state.
- **Verifier:** All three queries (Workouts.jsx:43-72) destructure only data with [] defaults and ActivityLogTab branches solely on allEntries.length===0 (line 1064), so the default activity-log tab flashes 'No activity yet' during fetch and on error; adding loading/error states is isolated.

### ui-programs.9 `folder-feature-no-db-column` — ⚪ Low · 🟡 Needs review
- **Location:** src/pages/Workouts.jsx:173-188,295-310,447-508
- **Issue:** The folder filter and rename-folder mutation operate on workouts.folder, but the workouts table has no folder column. renameFolderMutation's update would be rejected by PostgREST, and since no workout can ever have a folder, the entire folder filter/rename UI is unreachable dead code (CreateWorkout's folder save fails for the same reason).
- **Evidence:** Live schema query for workouts.folder returned no row (workouts = id, created_by, title, description, focus, duration_minutes, exercises, is_public, created_at, updated_at). Workouts.jsx:177 calls db.entities.Workout.update(w.id, { folder: ... }).
- **Fix:** Either add a nullable folder text column via migration to make the feature work, or strip the folder filter/rename UI and the folder badge in WorkoutCard.
- **Blast radius:** The migration option alters the shared workouts table also read by CreateWorkout, WorkoutCard, and the engine's workout queries.
- **Verifier:** Confirmed. No migration in the repo (migrations/, supabase/migrations/, scripts/migrations/) ever adds a folder column to workouts, and supabaseClient.js update() passes raw payloads to PostgREST, so renameFolderMutation would error if reachable. Since nothing can persist folder, the folder filter/rename UI in Workouts.jsx (gated on folders.length > 0) is unreachable, as is the WorkoutCard badge a…

### ui-programs.10 `cardcontent-pt0-defeats-py-override` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/ProgramBuilder.jsx:1181; src/pages/ProgramDetail.jsx:393
- **Issue:** Headerless CardContent usages pass py-6 / py-3 expecting symmetric padding, but the kit's CardContent default pt-0 is emitted after py-* in the compiled CSS, so padding-top stays 0 and the content sits flush against the card's top edge (StepProgression empty state and the recovery-warnings card).
- **Evidence:** card.jsx:40 CardContent default is `px-4 pb-4 pt-0 ${className}`. Verified with a tailwindcss build of class string 'px-4 pb-4 pt-0 py-6': the generated stylesheet emits py-6 (padding-top:1.5rem) before pt-0 (padding-top:0px), so pt-0 wins.
- **Fix:** Use explicit pt-* (which does override pt-0 since pt-0 sorts first within the pt scale): ProgramBuilder.jsx:1181 → className="pt-6 pb-6 text-center"; ProgramDetail.jsx:393 → className="pt-3 pb-3" (or add a CardHeader).
- **Verifier:** card.jsx:40 default is px-4 pb-4 pt-0; reproduced with tailwindcss 3.4.19 build: .py-3/.py-6 are emitted before .pt-0 (pt-0 wins padding-top) and .pt-6 after .pt-0, so both headerless usages (ProgramBuilder.jsx:1181 py-6, ProgramDetail.jsx:393 py-3) lose top padding and the pt-* fix works.

### ui-programs.11 `hardcoded-brand-tint-hex` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/ProgramBuilder.jsx:877; src/components/programs/CycleDayGrid.jsx:75
- **Issue:** Day/Cycle pills hardcode text-[#FFD9C9], which is the dark-theme value of the --brand-tint token. In the light theme (--brand-tint: #7A2118) the pale peach text on bg-brand/15 over a white card is unreadable.
- **Evidence:** index.css:42 defines --brand-tint: #FFD9C9 (dark) and index.css:105 --brand-tint: #7A2118 (html.light); the app ships a ThemeToggle and darkMode:'class' is configured, so light mode is reachable.
- **Fix:** Replace text-[#FFD9C9] with text-[var(--brand-tint)] in both spots (or add brand-tint to tailwind.config colors and use text-brand-tint).
- **Verifier:** text-[#FFD9C9] confirmed at ProgramBuilder.jsx:877 and CycleDayGrid.jsx:75; index.css defines --brand-tint #FFD9C9 (dark) vs #7A2118 (html.light), darkMode:'class' and ThemeToggle exist so light mode is reachable; var() swap is isolated.

### ui-programs.12 `workoutcard-off-system-purple` — ⚪ Low · 🟢 Safe
- **Location:** src/components/workouts/WorkoutCard.jsx:10,53,146
- **Issue:** WorkoutCard (every card in the Workouts Library grid) hardcodes a purple identity: borderLeftColor '#7c3aed' and a View Details button overridden to bg-purple-600 hover:bg-purple-700. Purple is not a Vapor x Macro hue (violet token is reserved for sleep/fatigue data) and coral is the locked action color; this also ignores both themes.
- **Evidence:** const borderColor = '#7c3aed' (line 10) applied via inline style (line 53); Button className="... bg-purple-600 hover:bg-purple-700 ..." (line 146) overrides the design-system primary variant. No purple-* or #7c3aed appears in tailwind.config.js or index.css tokens.
- **Fix:** Drop the inline borderLeftColor in favor of border-l-brand (matching ProgramCard.jsx:35 which uses var(--color-brand)) and remove the bg-purple-* overrides so variant="primary" renders the coral CTA.
- **Verifier:** WorkoutCard.jsx:10 hardcodes '#7c3aed' applied via inline style at :53, and :146 overrides the primary Button with bg-purple-600/700; no purple token exists in index.css or tailwind.config; swapping to brand/primary matches ProgramCard and is visual-only.

### ui-programs.13 `dead-share-button-hover-only` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Workouts.jsx:885-887
- **Issue:** StrengthEntryCard renders a Share2 button with no onClick handler, and it is opacity-0 group-hover:opacity-100, so it is invisible and unreachable on touch devices and does nothing on desktop.
- **Evidence:** <button className="text-ink-muted ... opacity-0 group-hover:opacity-100 ..."><Share2 .../></button> — no onClick anywhere in the component.
- **Fix:** Remove the button until share-from-log is implemented, or wire it to the existing shared_workouts flow and make it always visible (PWA has no hover).
- **Verifier:** Workouts.jsx:885-887 renders a Share2 button with no onClick and opacity-0 group-hover:opacity-100 — non-functional on desktop and unreachable on touch; removing or wiring it is isolated.

### ui-programs.14 `rir-zero-hidden-by-falsy-check` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/ProgramDetail.jsx:501
- **Issue:** The workout-detail dialog renders RIR with `{ex.rir_target && ...}`, so a programmed RIR of 0 (to-failure sets, which the builder allows via min="0") is silently dropped from the display.
- **Evidence:** ProgramDetail.jsx:501: {ex.rir_target && ` @ RIR ${ex.rir_target}`}; ProgramBuilder's RIR input accepts 0 (ProgramBuilder.jsx:1108-1119, min="0").
- **Fix:** Use {ex.rir_target != null && ` @ RIR ${ex.rir_target}`}.
- **Verifier:** ProgramDetail.jsx:501 uses {ex.rir_target && ...} which drops RIR 0, and the builder input (ProgramBuilder.jsx:1108-1119, min="0") allows programming 0; != null fix is a one-line isolated change.


## Part A · FoodTracker / Supplements  (10 findings)

### ui-nutrition.1 `supp-log-success-toast-crash` — 🔴 High · 🟢 Safe
- **Location:** src/pages/Supplements.jsx:255-259
- **Issue:** logSupp's onSuccess reads `_.supplement_name`, but the mutationFn returns undefined (it destructures `{ error }` from the insert and returns nothing). Every supplement log throws `TypeError: Cannot read properties of undefined` — the success toast never shows and an uncaught exception fires on the page's primary action 100% of the time.
- **Evidence:** mutationFn: `const { error } = await supabase.from("supplement_logs").insert({...}); if (error) throw error;` (no return) then `onSuccess: (_, { type }) => { ... toast.success(`${_.supplement_name || "Supplement"} logged`); }`. First onSuccess arg is the mutationFn return value = undefined, so `_.supplement_name` throws (the `|| "Supplement"` fallback never helps because the property access itself crashes).
- **Fix:** Use the variables already in scope: `toast.success(`${type.name} logged`)` (the second onSuccess arg destructures `{ type }`).
- **Verifier:** Bug is real and verified at src/pages/Supplements.jsx:255-258: mutationFn returns undefined (destructures only { error }, no return), so `_.supplement_name` throws TypeError in onSuccess on every supplement log. One detail of the auditor's claim is wrong: it is not an uncaught page exception. TanStack Query v5 (verified in node_modules/@tanstack/query-core mutation.js — options.onSuccess is awaite…

### ui-nutrition.2 `food-usda-custom-food-wrong-serving-basis` — 🟠 Medium · 🟡 Needs review
- **Location:** src/pages/FoodTracker.jsx:1664-1675 (and 475-485)
- **Issue:** When a USDA/barcode food is logged (or added to a meal) with a non-g/ml unit ('serving', 'oz', 'cup', ...), the auto-save to My Foods writes baseMacros — which for USDA foods are per-100g (selectFood, lines 655-661) — but labels them `serving_size: 1` of that unit. The saved custom food is then wrong by gramsPerUnit/100 (e.g. ~3.5x too high for 1 oz; for a 55g-serving food, per-100g calories get labeled as 1 serving, ~1.8x too high), and selectCustomFood later trusts that basis, silently corrupting future logs.
- **Evidence:** Footer save: `serving_size: ['g','ml'].includes(newFood.serving_unit) ? 100 : 1, serving_unit: newFood.serving_unit, calories: Math.round(baseMacros.calories)` runs for USDA foods too (only gated on `baseMacros.calories > 0`), while the scaling effect (lines 194-199) proves USDA baseMacros are per-100g for every unit via UNIT_TO_GRAMS (oz=28.35, cup=240, serving=foodServingSizeGrams).
- **Fix:** In both save paths, when `isUsdaFood`, convert before saving: gramsPerUnit = servingLike ? (foodServingSizeGrams ?? 100) : (UNIT_TO_GRAMS[unit] ?? 1); save `calories: Math.round(baseMacros.calories * gramsPerUnit / 100)` (same for P/C/F) with serving_size 1 — or always normalize USDA foods to serving_size 100 unit 'g'.
- **Blast radius:** Changes what gets written to the custom_foods table on every food log, which feeds My Foods search/re-log and meal-template building; existing already-corrupted rows are not retroactively fixed.
- **Verifier:** Verified at src/pages/FoodTracker.jsx. selectFood (654-692) stores USDA baseMacros per-100g and defaults the unit to 'serving' whenever the food has a real serving size, so the bug fires on the default logging path. Both custom-food save paths (475-485 and 1665-1675) are gated only on baseMacros.calories > 0 — no isUsdaFood check despite the 'manually-entered foods' comment — and write raw per-100…

### ui-nutrition.3 `supp-water-utc-day-boundary` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Supplements.jsx:44-45,200-201 (WaterCard and todayLogs queries)
- **Issue:** Both daily queries filter timestamptz columns (`logged_at`, `taken_at`) with a naive local-date string (`today + "T00:00:00"`). `getTodayString()` is local-timezone (src/utils/dateUtils.js:10-12) but Postgres interprets the offset-less literal as UTC, so for a US user any log after ~5pm local (past UTC midnight) disappears from "Taken Today"/water totals and shows up on the next day instead — evening supplements look untaken and daily water resets early.
- **Evidence:** .gte("logged_at", today + "T00:00:00").lte("logged_at", today + "T23:59:59") where `today` comes from getTodayString() (local tz via TZDate); inserts rely on the DB's UTC now() default, so a 6pm PDT log is stamped 01:00 UTC next day and falls outside the filter window.
- **Fix:** Compute the local day boundaries as real instants and send ISO strings with offset, e.g. `.gte("taken_at", new Date(`${today}T00:00:00`).toISOString()).lt("taken_at", new Date(`${nextDay}T00:00:00`).toISOString())` (same for water_logs), or add a local `date` column on insert and filter on it like food_entries does.
- **Verifier:** Confirmed: Supplements.jsx:44-45 and 200-201 filter timestamptz columns with offset-less local-date strings from getTodayString() (local tz via TZDate, dateUtils.js:10-12), while inserts (lines 58-61, 246-252) omit logged_at/taken_at and rely on the DB UTC default — evening logs fall outside the window; fix is isolated to two query filters, green is right.

### ui-nutrition.4 `supp-empty-state-invisible-text-and-nontoken-colors` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Supplements.jsx:88,397,399
- **Issue:** The first-run empty state uses `text-slate-800` (Pill icon) and `text-slate-700` (hint text) — near-invisible on the dark charcoal background, so new users see a blank dashed box with one faint line. Also the water progress bar uses raw `bg-blue-400` instead of the locked hue token (`info` / `--hue-blue`) that the card's own Droplets icon already uses (`text-info`, line 80).
- **Evidence:** Line 397 `<Pill className="w-8 h-8 text-slate-800 ..." />`, line 399 `<p className="text-xs text-slate-700 ...">Add your stack...`, on `bg-charcoal` (dark theme default); line 88 `className="h-full bg-blue-400 ..."` while tailwind.config.js defines `info`/`carb` tokens for blue data.
- **Fix:** Replace `text-slate-800` → `text-ink-faint`, `text-slate-700` → `text-ink-muted`, and `bg-blue-400` → `bg-info` (matching the icon's `text-info`).
- **Verifier:** Confirmed: line 397 text-slate-800 icon and line 399 text-slate-700 hint on the dark theme (the global `p` color override in index.css loses to the utility class), and line 88 bg-blue-400 bypasses the info token the card's Droplets icon already uses (line 80); tokens ink-faint/ink-muted/info all exist — pure class swaps, green.

### ui-nutrition.5 `supp-touch-invisible-deletes-and-no-confirm` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Supplements.jsx:111-116,331-336,382-387
- **Issue:** All delete affordances are touch-hostile in a PWA: water-entry and supplement-log X buttons are `opacity-0 group-hover:opacity-100` (invisible on touch devices — no hover exists), and the supplement-type Trash2 button is a ~20px tap target (p-1 + w-3 icon) that permanently deletes the type with no confirmation, sitting 4px from the edit button.
- **Evidence:** Line 113 and 384: `className="opacity-0 group-hover:opacity-100 ... "` on the only delete controls for those rows; line 331-336: `<button onClick={() => deleteType.mutate(type.id)} className="p-1 ..."><Trash2 className="w-3 h-3" /></button>` — no ConfirmDialog despite the kit shipping one (src/components/ui/ConfirmDialog.jsx).
- **Fix:** Make the X buttons always visible on touch (`opacity-60 sm:opacity-0 sm:group-hover:opacity-100`), bump destructive/edit buttons to ≥40px hit areas (p-2.5 + larger icon), and wrap deleteType in the kit's ConfirmDialog.
- **Verifier:** Confirmed: opacity-0 group-hover:opacity-100 on the only delete controls at lines 111-116 and 382-387, and the p-1/w-3 Trash2 deleteType button at 331-336 fires deleteType.mutate directly with no confirmation while src/components/ui/ConfirmDialog.jsx exists; fix is additive UI, green.

### ui-nutrition.6 `food-hardcoded-palette-low-contrast` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/FoodTracker.jsx:1636,1641,2136,2140,1994
- **Issue:** The manual-entry macro mismatch warning uses `text-amber-800` on `bg-warn/10` over the dark theme — dark-brown text on a dark surface is barely readable, undermining a key data-quality guard. Related token bypasses: `border-amber-200` (1636, 2136), `bg-amber-600 hover:bg-amber-700` Sync Goals button (2140), and `hover:bg-red-50` on the dark meal-item delete button (1994) which flashes a light-red square in dark mode. The design system provides `warn`/`bad` tokens for all of these.
- **Evidence:** Line 1636: `className="bg-warn/10 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800"`; line 2140: `className="shrink-0 bg-amber-600 hover:bg-amber-700 text-ink text-xs h-7"`; line 1994: `className="text-bad hover:text-bad hover:bg-red-50"`. tailwind.config.js maps warn → `--warn-rgb` precisely for status use.
- **Fix:** Replace with tokens: warning box `border-warn/30 text-warn`, Sync Goals button `bg-warn/90 hover:bg-warn text-charcoal` (or Button variant), delete hover `hover:bg-bad/10`; star fills `fill-amber-500` (1297/1371/1406) → `fill-warn`.
- **Verifier:** Confirmed: line 1636 bg-warn/10 + border-amber-200 + text-amber-800 (dark brown on dark dialog), line 2136 border-amber-200, line 2140 bg-amber-600 hover:bg-amber-700 text-ink, line 1994 hover:bg-red-50 light flash on the dark meal-item delete, plus fill-amber-500 stars at 1297/1371; warn/bad tokens exist in tailwind.config.js — token swaps only, green.

### ui-nutrition.7 `food-touch-invisible-row-actions` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/FoodTracker.jsx:993-1000,951-957
- **Issue:** Edit/delete buttons on every logged food row are `opacity-0 group-hover:opacity-100` — invisible on touch devices, so in the installed PWA there is no discoverable way to edit or delete an entry (taps on the invisible 22px targets work only by luck). The planned-item check-off circle — the core interaction of the meal-plan flow — is a 24px (w-6 h-6) tap target, below the ~44px mobile minimum.
- **Evidence:** Line 993: `<div className="col-span-1 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">` wrapping the only Pencil/Trash2 controls (p-1 + w-3.5 icons); line 956: check-off button `className="shrink-0 w-6 h-6 rounded-full ..."`.
- **Fix:** Show actions on touch (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`) or swap to a row tap → action sheet; enlarge the check-off hit area to ≥40px (keep the 24px visual circle inside a p-2 button).
- **Verifier:** Confirmed: line 993 wraps the only Pencil/Trash2 row controls in opacity-0 group-hover:opacity-100 (p-1 + w-3.5 icons), and line 956 planned check-off is a bare w-6 h-6 (24px) button; both real touch/PWA problems, fix is isolated styling, green.

### ui-nutrition.8 `supp-loading-state-shows-empty-flash` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Supplements.jsx:179-191,395-404
- **Issue:** The suppTypes query has no loading or error handling: `data: suppTypes = []` means the "No supplements configured" empty state renders during the initial fetch (flash of wrong content) and also renders permanently if the query errors, with no error message anywhere. Same pattern for todayLogs and water-logs (sections just vanish on error).
- **Evidence:** `const { data: suppTypes = [] } = useQuery({...})` — isLoading/isError never read; line 395 `{suppTypes.length === 0 && (<div ...>No supplements configured.</div>)}` is true while loading and on error.
- **Fix:** Destructure `isLoading`/`isError`; render the kit Skeleton while loading and an error row with a retry on error, gating the empty state on `!isLoading && !isError && suppTypes.length === 0`.
- **Verifier:** Confirmed: lines 179-191 destructure only `data: suppTypes = []` (isLoading/isError unused anywhere in the file) and line 395 gates the empty state on length alone, so it renders during fetch and permanently on error with no message; low severity and green fix are appropriate.

### ui-nutrition.9 `food-dialog-close-resets-selected-date` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/FoodTracker.jsx:1234-1240
- **Issue:** Dismissing the Add/Edit Food dialog (Esc, backdrop, X) unconditionally calls `setSelectedDate(format(new Date(), "yyyy-MM-dd"))`. A user reviewing or editing a past day who opens the dialog and cancels is snapped back to today, losing their place; combined with startEditEntry (line 629) setting the page date to the entry's date, cancelling an edit of a past entry strands the user on today instead of the day they were auditing.
- **Evidence:** `onOpenChange={(open) => { setShowAddDialog(open); if (!open) { resetForm(); setSelectedDate(format(new Date(), "yyyy-MM-dd")); } }}` — no other dialog on the page resets the date; the successful-save path (mutation onSuccess) does not reset it, making cancel behave differently from save.
- **Fix:** Remove the `setSelectedDate(...)` from the close handler (resetForm already clears the form), or capture the pre-dialog date and restore that instead of today.
- **Verifier:** Confirmed: lines 1234-1240 unconditionally setSelectedDate(today) on any dismiss, while startEditEntry (line 629) sets the page to the entry's date and the save path closes via setShowAddDialog(false) (lines 543/591) bypassing onOpenChange — so cancel resets but save doesn't, matching the described inconsistency; removal is safe, green.

### ui-nutrition.10 `food-entries-query-no-error-state` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/FoodTracker.jsx:267-274
- **Issue:** The day's food entries query has no loading or error handling: `data: foodEntries = []` means a failed fetch renders the day as cleanly empty (all four meals show "Add Item", ring shows 0 eaten) with no indication anything went wrong — inviting duplicate re-logging — and the initial load briefly shows the same false-empty day.
- **Evidence:** `const { data: foodEntries = [] } = useQuery({ queryKey: queryKeys.foodEntries(selectedDate, user?.id), queryFn: ..., enabled: !!user })` — isLoading/isError unused; no retry/error UI anywhere in the meal sections (lines 907-1029).
- **Fix:** Read `isLoading`/`isError` from the query; render skeleton rows while loading and an inline error banner with a Retry (refetch) button instead of the empty meal sections when the query fails.
- **Verifier:** Confirmed: lines 267-274 destructure only `data: foodEntries = []` with no isLoading/isError anywhere in FoodTracker.jsx, so a failed or in-flight fetch renders a false-empty day with Add Item prompts and a 0-eaten ring; low/green rating fits.


## Part A · PhysiqueTracker / Progress / BriefHistory  (13 findings)

### ui-tracking.1 `weight-chart-conditional-hook-crash` — 🔴 High · 🟢 Safe
- **Location:** src/components/progress/WeightProgressChart.jsx:7-19 (rendered by src/pages/Progress.jsx:89)
- **Issue:** The component early-returns the empty state at line 7 BEFORE the useMemo at line 19, so the hook count changes between renders. When a user with zero entries logs their first weight (mutation invalidates, data goes 0 -> 1 while the chart is mounted), React throws 'Rendered more hooks than during the previous render' and the page crashes.
- **Evidence:** Line 7: `if (!data || data.length === 0) { return (...) }` precedes line 19: `const trendedData = useMemo(() => calculateEWMA(sortedData, 0.1), [sortedData]);`. WeightTab's add mutation calls invalidateBodyWeight(qc) (Progress.jsx:43), which re-renders the mounted chart with non-empty data, executing one more hook than the previous render.
- **Fix:** Move the useMemo above the early return (and make calculateEWMA the unconditional first computation): `const trendedData = useMemo(...); if (!data || data.length === 0) return <empty/>;`. calculateEWMA already handles empty arrays.
- **Verifier:** Verified: WeightProgressChart.jsx returns the empty state at line 7 before the useMemo at line 19, and Progress.jsx:89 renders it unconditionally with weightEntries that default to [] (useUserQueries.js:60). The add mutation's invalidateBodyWeight (Progress.jsx:43) transitions data 0->1 on the mounted fiber, raising hook count 0->1 and throwing React error #310 in dev and prod. Impact is broader t…

### ui-tracking.2 `photos-signed-urls-lost-on-remount` — 🔴 High · 🟢 Safe
- **Location:** src/pages/Progress.jsx:292-310 (PhotosTab)
- **Issue:** Signed photo URLs are stored in component state (`signedUrls`) that is populated only as a side effect inside the queryFn. The custom Tabs kit unmounts inactive TabsContent (tabs.jsx:59 `if (value !== selectedValue) return null`), so switching tabs and returning within the 30-min staleTime serves cached query data WITHOUT re-running queryFn — signedUrls resets to {} and every photo renders the camera-icon placeholder instead of the image. URLs also expire at 3600s while cached data can outlive them.
- **Evidence:** Line 292: `const [signedUrls, setSignedUrls] = useState({})`; lines 301-305 set it inside queryFn; line 309 `staleTime: 30 * 60 * 1000`. Render at 438 gates on `signedUrls[photo.id]` and falls through to the placeholder div, with no path to regenerate URLs.
- **Fix:** Return the URLs as part of the query data (e.g. map each photo to `{...p, signedUrl}` inside queryFn and read `photo.signedUrl` in render), or move URL signing to a second useQuery keyed on the photo ids with staleTime under the 1h URL TTL. Remove the setState side effect from queryFn.
- **Verifier:** Verified at source: signedUrls is component state populated only as a setState side effect inside queryFn (Progress.jsx:292, 300-305) with staleTime 30min (line 309). The custom tabs kit unmounts inactive content (tabs.jsx:59 returns null), and PhotosTab lives in TabsContent (Progress.jsx:546) with a different default tab, so remount-with-fresh-cache is the normal path: cached photos render but si…

### ui-tracking.3 `hover-only-delete-controls-touch` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Progress.jsx:112-114, 266-269, 448-453
- **Issue:** Delete buttons in WeightTab history, MeasurementsTab table, and PhotosTab grid use `opacity-0 group-hover:opacity-100`. On touch devices (this is a PWA) hover never fires, so the controls are invisible — yet still tappable, enabling accidental, confirmation-free deletes of weight/measurement rows. Icons are 12-14px (w-3/w-3.5) with no padding on two of them, far below the ~44px tap-target minimum.
- **Evidence:** Line 112: `<button onClick={() => del.mutate(entry.id)} className="ml-auto opacity-0 group-hover:opacity-100 ..."><X className="w-3.5 h-3.5" />`; same pattern at 267 (Trash2 w-3 h-3) and 449-452. del mutations fire immediately with no ConfirmDialog despite the kit shipping one (src/components/ui/ConfirmDialog.jsx).
- **Fix:** Make controls visible on touch (`opacity-60 md:opacity-0 md:group-hover:opacity-100`), add `p-2` hit area, and wrap destructive mutations in the existing ConfirmDialog.
- **Verifier:** Verified at Progress.jsx:112-114 (X w-3.5, opacity-0 group-hover, no padding), 267-269 (Trash2 w-3, same pattern), 448-453 (p-1 only); all three del mutations fire immediately with no confirmation while src/components/ui/ConfirmDialog.jsx exists unused here. Fix is isolated; green is right.

### ui-tracking.4 `weight-log-form-overflow-mobile` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Progress.jsx:66-82
- **Issue:** The Log Weight form is a single non-wrapping flex row with fixed widths: date input w-36 (144px) + weight input w-28 (112px) + flex-1 notes + button, plus three gap-3 gaps inside a px-5 card. At a 375px viewport (~295px of card content width) the fixed inputs alone exceed the row, squeezing the notes input to zero/overflowing horizontally. The equivalent row in PhotosTab (line 359) correctly uses flex-wrap.
- **Evidence:** Line 66: `<div className="flex gap-3 items-end">` with `w-36`, `w-28`, `flex-1`, and a shrink-0 button — no `flex-wrap`, and date inputs have a large intrinsic min-width so they cannot shrink below content.
- **Fix:** Add `flex-wrap` to the row (matching PhotosTab:359) so the notes field and button wrap on narrow screens.
- **Verifier:** Progress.jsx:66 is `flex gap-3 items-end` with w-36 date + w-28 weight + flex-1 notes + shrink-0 button and no flex-wrap; fixed widths plus gaps exceed ~300px of card content at 375px. PhotosTab:359 confirms the flex-wrap precedent. One-class fix, green.

### ui-tracking.5 `progress-tabs-error-renders-empty-copy` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Progress.jsx:155-163, 294-310, 423-427
- **Issue:** MeasurementsTab and PhotosTab queries throw on error but the UI destructures `data = []` and never reads isLoading/isError. On a failed photos query the user sees the 'No progress photos yet' empty state; a failed measurements query silently hides all history. There is also no loading skeleton, so slow loads are indistinguishable from 'no data'.
- **Evidence:** Line 294: `const { data: photos = [] } = useQuery(...)` then line 423: `Object.keys(grouped).length === 0 ? <"No progress photos yet."/>`. Line 155: `const { data: history = [] } = useQuery(...)` with no isError/isLoading branch. Contrast BriefHistory.jsx:120 which at least handles isLoading.
- **Fix:** Destructure isLoading/isError from each useQuery; render a skeleton while loading and an error message with retry instead of the empty-state copy when isError.
- **Verifier:** MeasurementsTab (line 155) and PhotosTab (line 294) both throw in queryFn but destructure only `data = []`, never isLoading/isError; PhotosTab:423 shows 'No progress photos yet' on error and MeasurementsTab silently hides history. BriefHistory.jsx:120 confirms the contrast. Additive UI-state fix, green.

### ui-tracking.6 `briefhistory-error-shows-empty-state` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/BriefHistory.jsx:89-131
- **Issue:** The briefs query throws on error, but the render only branches on isLoading and `briefs.length === 0`. On a query error the user sees 'No briefs generated yet. Run your Desktop Agent to generate the first one.' — actively misleading copy that tells them to re-run the agent when the fetch simply failed.
- **Evidence:** Line 89: `const { data: briefs = [], isLoading } = useQuery(...)` (isError unused); line 126: `briefs.length === 0 ? <empty state with 'Run your Desktop Agent'>`.
- **Fix:** Destructure isError/error and render an error state with a retry button before the empty-state branch.
- **Verifier:** BriefHistory.jsx:89 destructures only data/isLoading from a throwing queryFn; line 126-131 renders the 'Run your Desktop Agent' empty state whenever briefs.length === 0, including on error. Misleading copy on failure confirmed; additive branch, green.

### ui-tracking.7 `metabolism-trend-zero-and-dangling-unit` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Progress.jsx:499
- **Issue:** Weight Trend renders `{state?.nutrition?.weight_trend_lbs_per_week || "—"} lbs/wk`. A legitimate trend of exactly 0 is falsy and renders the em dash, and when the value is null the unit still renders, producing '— lbs/wk' (blank-with-unit).
- **Evidence:** Line 499: `<p ...>{state?.nutrition?.weight_trend_lbs_per_week || "—"} lbs/wk</p>`. The engine writes this field as a number that can be 0 (scripts/compute_athlete_state.py:672). The Net Energy card directly below (lines 504-509) already does the null-safe version correctly.
- **Fix:** `const t = state?.nutrition?.weight_trend_lbs_per_week; render t != null ? \`${t > 0 ? "+" : ""}${t} lbs/wk\` : "—"`.
- **Verifier:** Progress.jsx:499 is exactly `{state?.nutrition?.weight_trend_lbs_per_week || "—"} lbs/wk`; compute_athlete_state.py returns weight_trend as a number that can legitimately be 0 (maintenance), and null yields '— lbs/wk'. The Net Energy block (lines 501-518) already does the null-safe version. Confirmed, green.

### ui-tracking.8 `metabolism-swallowed-error-hardcoded-active-badge` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Progress.jsx:467-485
- **Issue:** MetabolismTab's queryFn discards the Supabase error (`const { data } = ...` with no throw), so failures are indistinguishable from 'no row' and React Query caches undefined as success under the same ["athlete-state", date, user] key that AthleteState.jsx:545 uses with throwing semantics. Meanwhile the 'Active' badge is hardcoded, so a user with no athlete_state row (engine never ran) sees 'Expenditure Engine — Active' next to an em-dash burn value.
- **Evidence:** Line 470: `const { data } = await supabase.from("athlete_state")...maybeSingle(); return data;` — no error check. Line 485: `<Badge className="bg-teal/10 text-teal border-none">Active</Badge>` unconditional.
- **Fix:** Throw on error like AthleteState.jsx does (keeps the shared cache key consistent), and derive the badge from data presence: `state?.nutrition ? "Active" : "No data"`.
- **Verifier:** Progress.jsx:470 returns data without checking the Supabase error, while AthleteState.jsx:545-555 uses the identical queryKey with `if (error) throw error` — inconsistent semantics on a shared cache key. Badge at line 485 is unconditionally 'Active'. Both claims accurate; fix matches existing pattern, green.

### ui-tracking.9 `briefhistory-coachtag-hardcoded-teal` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/BriefHistory.jsx:23
- **Issue:** CoachTag hardcodes the dark-theme teal as `bg-[rgba(94,220,210,0.10)]` instead of the token. The light theme retunes --hue-teal-rgb to 20 168 157 (index.css:107), so this chip background will not track the theme — a design-system bypass on a hue-coded data element.
- **Evidence:** Line 23: `className="... text-teal bg-[rgba(94,220,210,0.10)] rounded-[7px] px-[7px] py-[3px] ..."` — note text-teal correctly uses the token while the background freezes the dark-theme RGB. Identical copy exists in src/components/dashboard/DailyBriefCard.jsx:27 (same fix applies).
- **Fix:** Replace with `bg-teal/10`, which resolves to `rgb(var(--hue-teal-rgb) / 0.1)` per tailwind.config.js:32 and follows both themes.
- **Verifier:** BriefHistory.jsx:23 hardcodes bg-[rgba(94,220,210,0.10)] (the dark-theme RGB from index.css:45) next to token-correct text-teal; light theme retunes --hue-teal-rgb to 20 168 157 at index.css:107 and tailwind.config.js defines `teal: rgb(var(--hue-teal-rgb) / <alpha-value>)`, so bg-teal/10 is the correct fix. Duplicate confirmed at DailyBriefCard.jsx:27. Green.

### ui-tracking.10 `briefhistory-cache-cost-surcharge` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/BriefHistory.jsx:32-36
- **Issue:** The approximate cost adds cache_read_tokens as an extra charge on top of the full-price total. Groq reports cached tokens as a subset of prompt_tokens (generate-daily-brief/index.ts:394-396), so cached tokens are billed twice here and a cache hit makes the displayed cost go UP — the opposite of reality.
- **Evidence:** Line 34-35: `(totalTokens * 0.00000025) + (cachedTokens * 0.000000025)` where totalTokens = input_tokens + output_tokens and input_tokens already includes cached_tokens (edge function maps usage.prompt_tokens -> input_tokens, prompt_tokens_details.cached_tokens -> cache_read_tokens).
- **Fix:** `((totalTokens - cachedTokens) * 0.00000025) + (cachedTokens * 0.000000025)`.
- **Verifier:** BriefHistory.jsx:32-35 computes (input+output)*rate + cached*rate/10, and generate-daily-brief/index.ts:394-396 maps usage.prompt_tokens -> input_tokens with prompt_tokens_details.cached_tokens (a subset of prompt_tokens) -> cache_read_tokens, so cached tokens are double-billed and cache hits raise the displayed cost. Proposed formula is correct; display-only, green.

### ui-tracking.11 `physique-delta-icon-and-pose-mismatch` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/PhysiqueTracker.jsx:83-85,150-153
- **Issue:** The bodyfat delta always renders a TrendingDown icon even when delta is positive (showing e.g. 'TrendingDown +1.2%'), and the delta compares the two most recent analyzed entries regardless of pose — contradicting the page's own guidance to compare same pose vs same pose.
- **Evidence:** Line 152: `<TrendingDown className="w-4 h-4" /> {delta > 0 ? "+" : ""}{delta.toFixed(1)}%` with no icon switch; lines 83-84 take latest/prev from the unfiltered entries list.
- **Fix:** Render TrendingUp when delta > 0, and compute prev from entries matching latest.pose.
- **Verifier:** PhysiqueTracker.jsx:152 renders TrendingDown unconditionally (color switches but icon does not), and lines 83-85 take latest/prev from the unfiltered entries list so the delta can compare different poses, contradicting the page's own same-pose guidance (lines 7-8, 172). Both accurate; isolated display fix, green.

### ui-tracking.12 `physique-no-loading-empty-state-and-url-ttl` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/PhysiqueTracker.jsx:31-48,173,42
- **Issue:** The entries fetch (plus per-entry signed-URL generation for up to 30 thumbnails) has no loading indicator and no empty state — first-time users and slow loads both show only the upload control with the History section silently absent. Additionally, thumbnail signed URLs expire after 600s with no refresh path, so a session left open >10 minutes shows broken images.
- **Evidence:** Lines 31-48: manual useState/useEffect fetch with no loading flag; line 173: `{entries.length > 0 && (...)}` hides everything otherwise; line 42: `createSignedUrl(e.photo_path, 600)` and loadEntries only re-runs after an upload.
- **Fix:** Add a loading skeleton and a 'No shots yet' empty state; raise the signed-URL TTL to 3600 and/or move the fetch into useQuery with a staleTime below the TTL so revisits regenerate URLs.
- **Verifier:** Lines 31-48 are a manual fetch with no loading flag, line 173 gates the entire History section on entries.length > 0 with no empty state, and line 42 signs URLs for 600s with loadEntries only re-run on mount/upload — thumbnails break after 10 minutes on an open session. All confirmed; fix is additive, green.

### ui-tracking.13 `physique-filter-chip-tap-targets` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/PhysiqueTracker.jsx:178-194
- **Issue:** The history pose-filter chips are `px-2 py-0.5 text-[11px]` — roughly 20px tall, far below the ~44px touch minimum on the primary mobile surface of this PWA. The pose-picker chips above (line 106, py-1) are only marginally better at ~26px.
- **Evidence:** Line 181/189: `className={\`px-2 py-0.5 rounded-full text-[11px] ...\`}` on seven adjacent buttons in a wrapping row.
- **Fix:** Increase to `px-3 py-1.5 min-h-[32px]` (or add invisible hit-area padding) so adjacent chips are reliably tappable.
- **Verifier:** Lines 181 and 189 confirm `px-2 py-0.5 rounded-full text-[11px]` on seven adjacent wrapping filter buttons (~20px tall) in a touch-first PWA; real mis-tap risk, not a zero-impact nitpick. Padding-only fix, green.


## Part A · Career / Profile  (12 findings)

### ui-misc.1 `career-hover-only-actions-touch` — 🔴 High · 🟢 Safe
- **Location:** src/pages/Career.jsx:183-209, 226-231, 386-393
- **Issue:** All edit/delete controls on pipeline cards, rejected rows, and networking contacts are hidden behind opacity-0 group-hover:opacity-100. Touch devices have no hover, so on the mobile PWA these actions are invisible and effectively unreachable (they only appear after a tap focuses the element, inconsistently). The icons are also 12px (w-3 h-3) with no padding, far below the ~44px tap-target minimum.
- **Evidence:** Career.jsx:183 `<div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 ...">` wrapping `<Pencil className="w-3 h-3" />` and `<Trash2 className="w-3 h-3" />` buttons; same pattern at 229 (`opacity-0 group-hover:opacity-100`) and 386. The 'Move' and reject '✕' buttons (197-209) are text-[10px] with 12px icons.
- **Fix:** Make actions always visible on touch: add `opacity-100 md:opacity-0 md:group-hover:opacity-100` (or use a kebab menu/long-press sheet), and give each button at least p-2 with a min 40x40px hit area.
- **Verifier:** Verified at Career.jsx:183-190, 229-231, 386-393: edit/delete controls are opacity-0 group-hover:opacity-100 with 12-14px icons (no padding on pipeline-card buttons). No group-focus-within fallback, no md:/hover-media-query handling anywhere in CSS or tailwind.config.js (no hoverOnlyWhenSupported), and the cards have no onClick alternative path — hidden buttons are the only way to edit/delete. App…

### ui-misc.2 `profile-isdirty-stuck-after-save` — 🔴 High · 🟢 Safe
- **Location:** src/pages/Profile.jsx:150-153, 172-173, 205-216
- **Issue:** After a successful save, the sticky 'You have unsaved changes' bar never hides for most users. handleSubmit deletes blank optional keys (tdee_override, height_cm, age, sex, activity_level, current_weight) from `cleaned`, and onSuccess stores that stripped object in savedFormDataRef, while formData still holds the keys as ''. The JSON.stringify comparison in isDirty then differs forever. tdee_override is '' for nearly every user, so this triggers on essentially every save. A follow-up Cancel also resets formData to the stripped object, turning controlled inputs (value={formData.age} etc.) into value=undefined.
- **Evidence:** Profile.jsx:208 `if (cleaned.tdee_override === '' || ...) delete cleaned.tdee_override;` (plus 5 more deletes), Profile.jsx:173 `savedFormDataRef.current = { ...profileData };` (profileData === cleaned), Profile.jsx:152 `return JSON.stringify(formData) !== JSON.stringify(savedFormDataRef.current);` — formData retains `"tdee_override":""` so the strings never match after save.
- **Fix:** Snapshot the un-stripped form for dirty tracking: pass formData through the mutation variables and set `savedFormDataRef.current = { ...formData }` in onSuccess (keep `cleaned` solely for the DB write), and have handleCancel restore from that full snapshot.
- **Verifier:** Verified in src/pages/Profile.jsx. handleSubmit (lines 207-213) deletes 6 blank optional keys from `cleaned`; tdee_override is initialized to '' (line 135) with no input on this page, so it is stripped on virtually every save. onSuccess (line 173) stores that stripped `cleaned` in savedFormDataRef, while formData keeps the keys as '', so the JSON.stringify comparison in isDirty (line 152) mismatch…

### ui-misc.3 `profile-update-missing-invalidation` — 🟠 Medium · 🟡 Needs review
- **Location:** src/pages/Profile.jsx:155-180
- **Issue:** updateProfileMutation only calls invalidateProfile(queryClient) in the create branch (new user). The far more common update branch never invalidates ['userProfile'], so useProfile consumers — including useDailyTargets, which derives calorie/macro targets from profile.daily_*_goal — keep serving the stale profile from cache until an unrelated remount/window-focus refetch happens.
- **Evidence:** Profile.jsx:157-162 `if (profile) { await db.entities.UserProfile.update(profile.id, profileData); } else { await db.entities.UserProfile.create(...); invalidateProfile(queryClient); }` — onSuccess (172-176) only updates savedFormDataRef and toasts. src/lib/queryKeys.js:125 defines invalidateProfile; src/hooks/useDailyTargets.js:57-60 reads profile.daily_calorie_goal etc. from this cache.
- **Fix:** Move `invalidateProfile(queryClient)` into onSuccess so it runs for both create and update.
- **Blast radius:** Triggers refetches of every profile-dependent query (daily targets, layout avatar, onboarding gate) immediately after each profile save.
- **Verifier:** Bug is real: Profile.jsx:157-162 only calls invalidateProfile in the create branch; the update branch and onSuccess (172-176) never invalidate ['userProfile'], and there is no compensating mechanism (db layer update at supabaseClient.js:545-555 is a plain write, no realtime subscriptions, no setQueryData). The fix matches the codebase convention (WeighInModal, StatsSetupModal, DietPhaseCard, FoodT…

### ui-misc.4 `career-missing-loading-error-states` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Career.jsx:99-107, 311-319, 433-441
- **Issue:** None of the three Supabase queries (job_applications, networking_log, capture_inbox) handle isLoading or isError. Because each defaults to [], the page renders the 'No applications yet.' / 'No networking contacts yet.' empty states while loading, and permanently shows them if the query errors — the user cannot distinguish 'empty' from 'failed' or 'loading'.
- **Evidence:** Career.jsx:99 `const { data: apps = [] } = useQuery({...})` with no isLoading/isError destructured anywhere in the file; Career.jsx:238 `{apps.length === 0 && (<div ...>No applications yet.</div>)}` renders during the initial fetch and after errors.
- **Fix:** Destructure isLoading/isError from each useQuery; render a skeleton (kit has src/components/ui/skeleton.jsx) while loading and an error row with a retry button on error, gating the empty state on `!isLoading && !isError`.
- **Verifier:** Confirmed: all three queries (Career.jsx:99, 311, 433) destructure only `data` with `= []` defaults; empty states at lines 238, 366-371, and 467-471 render unconditionally on `length === 0`, so loading and error are indistinguishable from empty. src/components/ui/skeleton.jsx exists; fix is page-local and green.

### ui-misc.5 `profile-streak-utc-date` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Profile.jsx:70-84
- **Issue:** The workout streak uses `new Date().toISOString().split('T')[0]` (UTC) as 'today' and requires a log on that exact day to count anything. For US timezones after ~5-8pm local, UTC has rolled to tomorrow, so a real streak displays as 0; independent of timezone, any streak also shows 0 every morning before that day's workout. The profile even stores a timezone field ('Used to determine today's date for your schedule', line 712) that this ignores.
- **Evidence:** Profile.jsx:72 `const today = new Date().toISOString().split('T')[0];` then 74-82 `for (const d of uniqueDays) { if (d === expected) { streak++; ... } else break; }` with expected initialized to UTC-today — first mismatch breaks immediately.
- **Fix:** Use the local date (`format(new Date(), 'yyyy-MM-dd')`, date-fns is already imported) and seed `expected` to today but allow the first match to be yesterday (e.g. if uniqueDays[0] === yesterday, start expected there) so an intact streak isn't zeroed before today's session.
- **Verifier:** Confirmed: Profile.jsx:72 seeds `expected` with UTC toISOString date and the loop (74-83) breaks on first mismatch, so streaks show 0 after UTC rollover and every morning pre-workout; the page stores a timezone preference (line 701-712) that this ignores. date-fns format is already imported (line 22); fix is an isolated computation change, green.

### ui-misc.6 `profile-savebar-overlaps-dock` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Profile.jsx:847-851
- **Issue:** The sticky save bar is `fixed bottom-[56px] md:bottom-0` with no safe-area handling. The mobile dock in Layout is fixed at `bottom: calc(12px + env(safe-area-inset-bottom))` and is ~58px tall, so the dock band spans ~12-70px (Android) or ~46-104px (iOS with 34px inset). The z-[10000] save bar therefore overlaps and covers part of the floating dock whenever the form is dirty, especially on iOS standalone PWA.
- **Evidence:** Profile.jsx:848 `fixed bottom-[56px] md:bottom-0 left-0 right-0 z-[10000]` vs src/components/Layout.jsx:259 dock `bottom: "calc(12px + env(safe-area-inset-bottom))"` with py-2 + 20px icon + label (~58px tall) at z-[9999].
- **Fix:** Position the bar above the dock including the inset: `style={{ bottom: 'calc(70px + env(safe-area-inset-bottom))' }}` on mobile (or a shared --dock-clearance CSS var), keeping md:bottom-0.
- **Verifier:** Confirmed: Profile.jsx:847-850 `fixed bottom-[56px] md:bottom-0 ... z-[10000]` vs Layout.jsx:253-261 dock at z-[9999], `bottom: calc(12px + env(safe-area-inset-bottom))`, ~58px tall and lg:hidden — so the higher-z save bar overlaps the dock on mobile (and sits at bottom-0 under the still-visible dock at md-lg widths). CSS-only repositioning fix, green.

### ui-misc.7 `profile-duplicate-weight-log-type-mismatch` — ⚪ Low · 🟡 Needs review
- **Location:** src/pages/Profile.jsx:197-203
- **Issue:** weightToLog is decided with strict inequality between the form value (string, e.g. '175' once the input has been touched) and the saved value (number 175 loaded from the DB). Re-typing the same weight, or any save right after the input is edited back to its original value, creates a duplicate BodyWeightEntry for today.
- **Evidence:** Profile.jsx:199 `const weightToLog = cleaned.current_weight && cleaned.current_weight !== previousWeight ? cleaned.current_weight : null;` — `'175' !== 175` is true; current_weight is set from `e.target.value` (string) at line 574 but initialized from the numeric profile column at line 136.
- **Fix:** Compare numerically: `parseFloat(cleaned.current_weight) !== parseFloat(previousWeight)` (guarding NaN).
- **Blast radius:** The condition gates a body_weight_entries insert, which feeds the adaptive TDEE/weight-trend pipeline.
- **Verifier:** Verified at Profile.jsx:197-203. formData.current_weight is initialized from the numeric profile column (line 136; column proven numeric by parseFloat writes in WeighInModal.jsx:34/StatsSetupModal.jsx:88 and arithmetic in useDailyTargets.js:79) but set to a string by the input onChange (line 574). Strict !== at line 199 therefore treats an unchanged, re-typed weight as new on the first save after …

### ui-misc.8 `career-capture-querykey-missing-user` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Career.jsx:434
- **Issue:** The capture_inbox query key is ["capture-inbox", "career"] without user.id, unlike every other query on the page. After sign-out/sign-in as a different account (without a full cache reset), the previous user's captured notes can be served from cache.
- **Evidence:** Career.jsx:434 `queryKey: ["capture-inbox", "career"]` while Career.jsx:100 uses `queryKey: ["job-applications", user?.id]`. QuickCapture.jsx:29 invalidates `["capture-inbox", domain]`, so adding user.id keeps invalidation working only if QuickCapture's key is updated too.
- **Fix:** Change the key to ["capture-inbox", "career", user?.id] and update QuickCapture.jsx:29 to invalidate ["capture-inbox", domain] via prefix match (invalidateQueries matches prefixes, so QuickCapture can stay as-is).
- **Verifier:** Confirmed: Career.jsx:434 uses ["capture-inbox", "career"] without user.id while sibling queries (lines 100, 312) include it, and AuthContext.signOut does not clear the query cache, so stale cross-user data is possible. The prefix-match note about QuickCapture.jsx:29 invalidation is accurate; fix is green.

### ui-misc.9 `career-delete-no-confirm-silent-error` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Career.jsx:137-143, 340-346
- **Issue:** Both `del` mutations permanently delete a job application / networking contact on a single tap with no confirmation, and neither has an onError handler — a failed delete gives zero feedback (the row just stays, looking like a no-op).
- **Evidence:** Career.jsx:137-143 `const del = useMutation({ mutationFn: ... delete() ..., onSuccess: () => qc.invalidateQueries(...) })` — no onError, no confirm; the kit already ships src/components/ui/ConfirmDialog.jsx.
- **Fix:** Wrap delete in the existing ConfirmDialog (or a toast-with-undo) and add `onError: () => toast.error("Failed to delete")` to both mutations.
- **Verifier:** Confirmed: both `del` mutations (Career.jsx:137-143 and 340-346) have onSuccess only — no onError and no confirmation — unlike the save/advance mutations on the same page which do have onError toasts. src/components/ui/ConfirmDialog.jsx exists; fix is isolated and green.

### ui-misc.10 `quickcapture-empty-submit-false-success` — ⚪ Low · 🟢 Safe
- **Location:** src/components/QuickCapture.jsx:17-37 (composed by Career.jsx CaptureTab)
- **Issue:** Cmd/Ctrl+Enter calls captureMutation.mutate() without checking content. mutationFn returns early when content is blank, but onSuccess still fires, showing the 'Captured to Second Brain inbox' toast and invalidating the query even though nothing was saved.
- **Evidence:** QuickCapture.jsx:18 `if (!content.trim()) return;` inside mutationFn; QuickCapture.jsx:35-39 `handleKeyDown` calls `captureMutation.mutate()` with no content guard (the Capture button is guarded at line 59, the keyboard path is not).
- **Fix:** Guard the keyboard handler: `if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && content.trim()) captureMutation.mutate();` (or throw from mutationFn when blank).
- **Verifier:** Confirmed: QuickCapture.jsx:18 returns early from mutationFn on blank content, which still resolves and fires onSuccess (toast + invalidate + onCapture); handleKeyDown (lines 35-39) calls mutate() with no content guard while the button (line 59) is guarded via disabled. Fix is a one-line guard, green.

### ui-misc.11 `profile-hardcoded-orange-tdee-card` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Profile.jsx:583
- **Issue:** The Estimated TDEE card uses raw rgba orange values (`bg-[rgba(249,115,22,0.08)] border-[rgba(249,115,22,0.2)]` — Tailwind orange-500, not a token). This bypasses the locked Vapor x Macro palette (brand coral / warn gold CSS vars) and will not retune in the light theme like every token-driven surface does.
- **Evidence:** Profile.jsx:583 `<div className="bg-[rgba(249,115,22,0.08)] border border-[rgba(249,115,22,0.2)] rounded-xl p-4">` — the only raw color literal on the page; everything else uses ink/charcoal/brand/bad tokens.
- **Fix:** Replace with token classes, e.g. `bg-brand/10 border border-brand/20` (or warn/gold if the intent is a caution tint).
- **Verifier:** Confirmed: Profile.jsx:583 uses raw `bg-[rgba(249,115,22,0.08)] border-[rgba(249,115,22,0.2)]` — grep shows it is the only rgba literal on the page; surrounding code uses ink/charcoal/brand/leaf/info tokens. Token swap is isolated, green.

### ui-misc.12 `profile-volume-label-assumes-lbs` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Profile.jsx:61-69, 273, 331
- **Issue:** profileStats sums raw set.weight * reps from workout_logs and labels it 'Vol (lbs)'. The Weight Unit preference on this same page ('Used when logging workout weights', line 675) allows kg, so for kg users the stat is mislabeled by ~2.2x.
- **Evidence:** Profile.jsx:66 `totalVolumeLbs += (Number(set.weight) || 0) * (Number(set.reps) || 0);` with no unit conversion; Profile.jsx:273/331 render `Vol (lbs)`; Profile.jsx:657-675 lets the user select kg as the logging unit.
- **Fix:** Label the stat with formData.weight_unit (`Vol (${formData.weight_unit})`) or convert kg logs to lbs before summing if logs are stored in the chosen unit.
- **Verifier:** Confirmed: Profile.jsx:66 sums raw set.weight*reps with no conversion and lines 273/331 hardcode 'Vol (lbs)'; WEIGHT_UNITS in src/lib/constants.js includes kg, and workout pages (QuickWorkout.jsx:88, WorkoutDetail.jsx:75) log in profile.weight_unit without converting, so kg users' totals are mislabeled. Dynamic label fix is isolated, green.


## Part A · Login / ForgotPassword / ResetPassword  (5 findings)

### ui-auth.1 `reset-password-stale-volt-hover` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/ResetPassword.jsx:133
- **Issue:** The 'Sign in' link uses hover:text-[#d9ff1a] — a lime hex left over from the retired 'volt' design system. On hover the link flashes lime, which is not in the Vapor x Macro palette and contradicts coral as THE action color.
- **Evidence:** Line 133: <Link to="/login" className="text-brand hover:text-[#d9ff1a] font-medium">. The same link in ForgotPassword.jsx:115 correctly uses text-brand hover:opacity-80. #d9ff1a appears nowhere in tailwind.config.js or src/index.css tokens.
- **Fix:** Replace hover:text-[#d9ff1a] with hover:opacity-80 (and add transition-opacity) to match the identical link in ForgotPassword.jsx:115.
- **Verifier:** Verified: ResetPassword.jsx:133 has hover:text-[#d9ff1a]; #d9ff1a exists nowhere else in src or tailwind.config.js; ForgotPassword.jsx:115 uses the proposed hover:opacity-80 transition-opacity pattern. Fix is a one-class swap, correctly green.

### ui-auth.2 `reset-password-no-recovery-session-guard` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/ResetPassword.jsx:14-53
- **Issue:** The page renders the new-password form unconditionally, never checking that a recovery session exists. A user arriving via an expired/invalid email link (or navigating to /reset-password directly) fills out both fields and only then gets a raw Supabase error toast ('Auth session missing!') with no way to recover.
- **Evidence:** Component has no useEffect/session check; handleSubmit (lines 40-44) calls supabase.auth.updateUser({ password }) directly. The route is public (src/App.jsx:80) so anyone can land here unauthenticated. supabaseClient has detectSessionInUrl: true, so a valid link works, but the failure path renders the normal form.
- **Fix:** On mount, call supabase.auth.getSession(); if no session, render an 'This reset link is invalid or expired' state with a Link to /forgot-password instead of the form. Also map the 'Auth session missing' error to a human message in the catch block.
- **Verifier:** Verified: ResetPassword.jsx has no session check; handleSubmit (lines 40-44) calls supabase.auth.updateUser directly; /reset-password is a public route (App.jsx) and supabaseClient sets detectSessionInUrl: true. Fix is sound — supabase-js v2 getSession() awaits client init so it won't race valid recovery links — and is contained to this page.

### ui-auth.3 `reset-password-navigates-to-login-while-authenticated` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/ResetPassword.jsx:46-47
- **Issue:** After a successful updateUser the recovery session is still active (the user IS signed in), but the page navigates to /login. Login does not redirect authenticated users (src/App.jsx:78 is unguarded), so the user is shown a sign-in form and re-enters credentials they just changed, despite already holding a valid session.
- **Evidence:** Lines 46-47: toast.success('Password updated successfully!'); navigate('/login'). Supabase password recovery establishes a session before updateUser; nothing calls signOut. RootRoute (App.jsx:60-65) only guards '/', not '/login'.
- **Fix:** Navigate to '/today' with { replace: true } after a successful password update (user is already authenticated), or explicitly await supabase.auth.signOut() before navigating to /login if forcing re-login is intended.
- **Verifier:** Verified: lines 46-47 navigate('/login') after updateUser with no signOut; Login.jsx has no authenticated-user redirect and the /login route in App.jsx is unguarded (only RootRoute '/' redirects). Fix (navigate to /today with replace, or explicit signOut) is sensible and isolated.

### ui-auth.4 `login-forgot-password-tap-target` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Login.jsx:88-94
- **Issue:** The 'Forgot password' link — the only path to account recovery — is an 11.5px text link with no padding, giving a tap target roughly 16px tall, far below the 44px mobile minimum.
- **Evidence:** Lines 89-94: <Link to="/forgot-password" className="text-[11.5px] font-bold ..."> inside a plain flex row (line 88) with no py/min-h on the link.
- **Fix:** Add py-3 px-2 -my-3 -mx-2 (negative margins preserve layout) or inline-flex items-center min-h-[44px] to the Link so the hit area meets 44px without changing the visual.
- **Verifier:** Verified: Login.jsx:89-94 'Forgot password' Link is text-[11.5px] font-bold with no padding/min-height in a plain flex row (~16px tall hit area). Fix is purely additive hit-area (negative margins preserve layout), correctly green.

### ui-auth.5 `login-footer-no-safe-area-inset` — ⚪ Low · 🟢 Safe
- **Location:** src/pages/Login.jsx:103-105
- **Issue:** index.html sets viewport-fit=cover, but the Login footer caption uses a fixed pb-7 (28px) with no env(safe-area-inset-bottom); in standalone PWA mode on iPhone the home-indicator inset is ~34px, so the caption sits partially under the home indicator.
- **Evidence:** index.html:35 has viewport-fit=cover; Login.jsx:103 className="... pb-7 ..." with no safe-area handling; grep of src/index.css found zero env(safe-area-inset usages anywhere.
- **Fix:** Add style={{ paddingBottom: 'calc(1.75rem + env(safe-area-inset-bottom))' }} to the footer div (or a shared pb-safe utility), replacing the bare pb-7.
- **Verifier:** Verified: index.html:35 sets viewport-fit=cover; Login.jsx:103 footer uses bare pb-7 with no env(safe-area-inset-bottom); the rest of the app (Layout.jsx, dialog.jsx, FAB) does handle safe-area, making Login the outlier. Inline calc() fix is isolated, correctly green.


## Part A · Cross-cutting (tokens, targets, PWA shell)  (8 findings)

### ui-cross-cutting.1 `manifest-stale-lime-theme` — 🔴 High · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/public/manifest.json:8-9; /home/nolan/projects/OptiGains/src/pages/ResetPassword.jsx:133
- **Issue:** PWA manifest still carries the pre-Vapor-x-Macro lime identity: theme_color '#ccff00' and background_color '#121212', contradicting index.html's theme-color '#0A0D12' and the locked field token. Installed-app splash screen and Android OS chrome will flash lime. A matching lime remnant survives in ResetPassword's link hover (hover:text-[#d9ff1a]).
- **Evidence:** manifest.json: "background_color": "#121212", "theme_color": "#ccff00" vs index.html <meta name="theme-color" content="#0A0D12"> and --color-bg: #0A0D12 in src/index.css:23. ResetPassword.jsx:133: className="text-brand hover:text-[#d9ff1a]" — #d9ff1a appears nowhere in the token set.
- **Fix:** Set manifest theme_color and background_color to #0A0D12; change ResetPassword's hover class to a token (e.g. hover:text-ink or the brand-bright var).
- **Verifier:** Verified: public/manifest.json:8-9 still ships background_color #121212 / theme_color #ccff00 while index.html:36 sets theme-color #0A0D12 and src/index.css:23 sets --color-bg #0A0D12; brand is now coral (#EF7368), so lime is stale pre-redesign identity and the manifest is actively linked (index.html:33), so installed-PWA splash/OS chrome will show it. ResetPassword.jsx:133 hover:text-[#d9ff1a] co…

### ui-cross-cutting.2 `today-dashboard-bypass-usedailytargets` — 🔴 High · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/pages/Today.jsx:109-110; /home/nolan/projects/OptiGains/src/pages/Dashboard.jsx:381,386
- **Issue:** Two routed home surfaces compute daily nutrition targets outside useDailyTargets. Today.jsx reads state.nutrition.calorie_target/protein_target raw — skipping the hook's recommended_intake priority and the cut-rule protein clamp / fat floor — and Dashboard.jsx divides today's intake by profile.daily_calorie_goal directly. On engine-set or cut days these rings disagree with FoodTracker's rings, the exact divergence the hook exists to prevent. Dashboard also renders '/ kcal' (blank-with-unit) when daily_calorie_goal is null.
- **Evidence:** Today.jsx:109-110: const calTarget = nutrition?.calorie_target; const proteinTarget = nutrition?.protein_target; — vs useDailyTargets.js:54 which prioritizes recommended?.calorie_target and then clamps protein to 1.2-1.5 g/lb on cuts (lines 81-85). Dashboard.jsx:381: '/ {profile?.daily_calorie_goal} kcal' and :386 width math '(todayMacros.calories / (profile?.daily_calorie_goal || 1)) * 100'.
- **Fix:** Replace both raw reads with const { calories, protein } = useDailyTargets(today) (it shares the same react-query cache key, so no extra fetch), and fall back to an em dash when calories is unavailable in Dashboard's label.
- **Verifier:** Verified end-to-end. Today.jsx:109-110 reads athlete_state.nutrition.calorie_target/protein_target raw, and scripts/compute_athlete_state.py:609,669 proves that top-level field is just profile.daily_calorie_goal echoed back — the real recovery-gated target lives in nutrition.recommended_intake (line 1179), which useDailyTargets.js:54 prioritizes and then cut-clamps protein (lines 81-85). FoodTrack…

### ui-cross-cutting.3 `apple-touch-icon-svg-only` — 🟠 Medium · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/index.html:36; /home/nolan/projects/OptiGains/public/manifest.json:12-24
- **Issue:** apple-touch-icon points to an SVG, which iOS does not support — Add to Home Screen on iPhone will fall back to a page screenshot instead of the app icon. The manifest also ships only SVG icons with sizes 'any'; Chrome's installability heuristics expect at least 192x192 and 512x512 raster icons, so install prompts/maskable rendering may degrade on Android.
- **Evidence:** index.html: <link rel="apple-touch-icon" href="%BASE_URL%optigains-icon.svg" />; manifest.json icons array contains only optigains-icon.svg entries with "sizes": "any".
- **Fix:** Export 180x180 (apple-touch-icon), 192x192 and 512x512 PNGs from the SVG, reference the PNG in the apple-touch-icon link, and add the PNG entries (any + maskable) to manifest.json alongside the SVG.
- **Verifier:** index.html:34 (not 36) has <link rel="apple-touch-icon" href="%BASE_URL%optigains-icon.svg"> and manifest.json:11-24 ships only SVG icons with sizes 'any'; no PNG anywhere — iOS A2HS icon will indeed fall back. Fix (raster 180/192/512 exports) is isolated and green.

### ui-cross-cutting.4 `brand-tint-hardcoded-breaks-light-theme` — 🟠 Medium · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/components/programs/CycleDayGrid.jsx:75; /home/nolan/projects/OptiGains/src/pages/WeeklySchedule.jsx:206,209; /home/nolan/projects/OptiGains/src/pages/ProgramBuilder.jsx:877
- **Issue:** Three files hardcode text-[#FFD9C9], the dark-theme value of --brand-tint, on bg-brand/15 active pills. In the light theme the token flips to #7A2118 (dark ink), but these stay pale #FFD9C9 over a pale coral tint — unreadable active-day labels in light mode.
- **Evidence:** index.css:42 --brand-tint: #FFD9C9 (dark) vs index.css:105 --brand-tint: #7A2118 (html.light). CycleDayGrid.jsx:75 'bg-brand/15 text-[#FFD9C9]', WeeklySchedule.jsx:206/209 isCurrentDay ? 'text-[#FFD9C9]', ProgramBuilder.jsx:877 same pattern.
- **Fix:** Add brandTint: 'var(--brand-tint)' to tailwind.config.js colors and replace text-[#FFD9C9] with the token class (or text-[var(--brand-tint)]) in all four call sites.
- **Verifier:** All four call sites verified (CycleDayGrid.jsx:75, WeeklySchedule.jsx:206+209, ProgramBuilder.jsx:877 use text-[#FFD9C9]); index.css:42 vs 105 confirms --brand-tint flips to #7A2118 in html.light, and a real light theme exists (ThemeContext/ThemeToggle). tailwind.config.js has no brandTint token yet, so the proposed fix is correct and green.

### ui-cross-cutting.5 `off-palette-status-hexes` — 🟠 Medium · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/utils/recoveryUtils.js:49-51; /home/nolan/projects/OptiGains/src/components/nutrition/DietPhaseCard.jsx:185-186; /home/nolan/projects/OptiGains/src/components/workouts/WorkoutCard.jsx:10
- **Issue:** Pre-redesign palette hexes survive in status/accent colors across three files and bypass the locked ok/warn/bad spectrum and hue tokens, so they neither match the identity nor re-tune in the light theme. recoveryUtils feeds two routed pages (Dashboard.jsx and RecoveryDetail.jsx).
- **Evidence:** recoveryUtils.js:49-51 returns text-[#4ade80]/text-[#fbbf24]/text-[#f87171] (stock Tailwind green/amber/red, not --ok #7BC96F / --warn #E2A23C / --bad #EF7368); DietPhaseCard.jsx:185-186 text-[#2dd4bf] and bg-[rgba(20,184,166,0.1)]; WorkoutCard.jsx:10 const borderColor = '#7c3aed' (purple absent from the palette).
- **Fix:** Map recoveryUtils bands to text-ok/text-warn/text-bad (and bg-ok/10 etc.), DietPhaseCard to the teal hue token, and WorkoutCard's left border to var(--hue-violet) or the focus-hue map used by DraggableWorkoutCard.
- **Verifier:** recoveryUtils.js:49-51 returns stock Tailwind hexes (#4ade80/#fbbf24/#f87171) while ok/warn/bad tokens exist (index.css:55-57, re-tuned at 116-118) with Tailwind classes wired (tailwind.config.js:45-47); getReadinessCategory feeds Dashboard.jsx and RecoveryDetail.jsx. DietPhaseCard.jsx:184-187 hardcodes teal rgba/#2dd4bf; WorkoutCard.jsx:10 borderColor='#7c3aed' is actually rendered at line 53. To…

### ui-cross-cutting.6 `sw-cache-never-versioned` — 🟠 Medium · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/public/sw.js:1-23
- **Issue:** CACHE_NAME is a fixed 'optigains-v1' and sw.js bytes never change between deploys, so the service worker never reinstalls: the precached offline index.html stays the first-ever version (eventually referencing pruned bundle hashes, breaking offline launches after a few deploys), and cache-first hashed assets accumulate forever with no pruning.
- **Evidence:** sw.js:1 const CACHE_NAME = "optigains-v1"; install handler caches APP_SHELL once; activate only deletes caches whose name differs from the constant 'optigains-v1', which it never does; fetch handler is cache-first for all same-origin GET assets.
- **Fix:** Inject a build hash into CACHE_NAME at build time (or adopt vite-plugin-pwa with generateSW) so each deploy reinstalls the worker, refreshes the precached shell, and the activate step actually evicts old caches.
- **Verifier:** sw.js:1 fixed CACHE_NAME 'optigains-v1', activate (16-23) only evicts differently-named caches (never happens), fetch (44-55) is cache-first for all same-origin assets with no pruning — stale precached shell and unbounded cache growth are real. The 'breaking offline launches' wording is slightly overstated (old bundles also persist in the never-evicted cache, so offline usually serves a stale-but-…

### ui-cross-cutting.7 `auth-pages-hardcoded-hexes` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/pages/Login.jsx:41,46-47,91,95; /home/nolan/projects/OptiGains/src/pages/ForgotPassword.jsx:35,47-48; /home/nolan/projects/OptiGains/src/pages/ResetPassword.jsx:56,68-69
- **Issue:** All three auth pages hardcode inline hexes — background '#080B10' (not even the field token #0A0D12), wordmark colors '#F2F4F7' and '#5EDCD2', and text-[rgba(242,244,247,0.5)] — instead of the CSS-var tokens. If auth is meant to be dark-only that is fine visually, but the off-by-one background and raw ink values drift from the locked identity and will not track future token changes.
- **Evidence:** Login.jsx:41 style={{ background: '#080B10' }}; Login.jsx:47 <span style={{ color: '#5EDCD2' }}>; Login.jsx:91 text-[rgba(242,244,247,0.5)]; identical blocks in ForgotPassword.jsx and ResetPassword.jsx.
- **Fix:** Replace with var(--color-bg), var(--text-primary), var(--hue-teal), and text-muted-2; if auth must stay dark regardless of theme, scope a dark class on the page root rather than freezing hexes.
- **Verifier:** Verified: Login.jsx:41/46-47/91/95, ForgotPassword.jsx:35/47-48, ResetPassword.jsx:56/68-69 all freeze #080B10 (vs token #0A0D12), #F2F4F7, #5EDCD2, rgba(242,244,247,0.5). Not zero-impact: the shared Input/glass components on these pages do follow theme tokens, so light mode mixes light-token controls over a frozen dark background. Fix correctly offers the scoped-dark-class alternative; green.

### ui-cross-cutting.8 `statring-gradient-hardcoded` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/src/components/ui/system/StatRing.jsx:31-32
- **Issue:** The shared readiness ring (used on Today hero and Dashboard) hardcodes SVG gradient stops #7FE9DD/#3DB8AE that match neither --hue-teal (#5EDCD2) nor --hue-teal-2 (#4ECDC4), and do not re-tune in the light theme where the teals darken for contrast (#14A89D) — the ring stays pastel on the paper field.
- **Evidence:** StatRing.jsx:31-32: <stop offset="0%" stopColor="#7FE9DD" /> <stop offset="100%" stopColor="#3DB8AE" />.
- **Fix:** Use stopColor="var(--hue-teal)" / stopColor="var(--hue-teal-2)" (SVG stop-color accepts CSS variables) so the gradient tracks the theme.
- **Verifier:** StatRing.jsx:31-32 hardcodes #7FE9DD/#3DB8AE; tokens are #5EDCD2/#4ECDC4 dark and #14A89D/#109488 light (index.css:45-46,107-108), so the ring neither matches nor re-tunes. Minor evidence slip: StatRing is imported by Today.jsx only, not Dashboard. Fix is a two-line stop-color swap (works as presentation attr or via style), green.


## Part B · Engine — notes_parser.py  (7 findings)

### eng-notes-parser.1 `too-hard-parsed-never-consumed` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:193 (producer); no consumer anywhere
- **Issue:** The too_hard signal is extracted (docstring says '-> hold / back off') but grep across scripts/ and src/ shows zero readers: generate_weekly_program.py reads sentiment/too_easy/caution/weakness/flags, mpc_prescriber.py reads caution/weakness, and learners.exercise_reward has no too_hard parameter. Notes like 'ground out the last rep, brutal' change nothing in next week's program.
- **Evidence:** Executed: exercise note 'ground out the last rep, brutal' on Bench Press -> {'too_hard': {'Bench Press': 1}}, all other signals empty. grep -rn too_hard over scripts/ and src/ returns only notes_parser.py lines 18, 193, 216.
- **Fix:** Either pass notes_signals['too_hard'].get(name, 0) into exercise_reward as a negative term (mirror of EASY_GAIN) and/or use it to hold load in the strength progression for that lift; or delete the signal and its docstring promise.
- **Blast radius:** Wiring it in changes exercise_reward math and the athlete_params exercise_values posterior written by generate_weekly_program.py, shifting next week's exercise selection.
- **Verifier:** Verified end-to-end. Producer at scripts/engine/notes_parser.py:193 with docstring promise 'hold / back off' (line 18); grep over scripts/ and src/ finds too_hard only in notes_parser.py (lines 18, 193, 216). Runtime repro in /tmp/optigains_verify reproduced the auditor's output exactly: 'ground out the last rep, brutal' on Bench Press -> {'too_hard': {'Bench Press': 1}} with all other signals AND…

### eng-notes-parser.2 `too-easy-never-bumps-load` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:6-17 vs scripts/generate_weekly_program.py:740
- **Issue:** Module docstring promises "'too easy' bumps load", but too_easy's only consumer is exercise_reward (EASY_GAIN term) feeding the exercise-value posterior, which only biases exercise SELECTION (EXVAL_SELECT_WEIGHT in session_generator.py:704). No load/progression code reads too_easy, so 'felt easy' never increases prescribed weight.
- **Evidence:** grep: too_easy appears only at generate_weekly_program.py:730,740 (reward input) and in notes_parser.py. Executed 'felt easy' on Lat Pulldown -> {'too_easy': {'Lat Pulldown': 1}}; traced exercise_reward -> update_exercise_value -> exercise_values -> selection score only; strength_progression.py has no too_easy reference.
- **Fix:** Feed too_easy mentions into the per-lift load progression (e.g. add a small percentage bump or reduce assumed RIR for that exercise next week), or correct the docstring to say it only raises the exercise's learned value.
- **Blast radius:** A load bump touches strength-progression math and prescribed weights in generated sessions; doc-only fix is harmless.
- **Verifier:** Reproduced exactly: 'felt easy' on Lat Pulldown yields {'too_easy': {'Lat Pulldown': 1}}, and repo-wide grep confirms too_easy's only consumer is exercise_reward (learners.py:151, EASY_GAIN=0.3) feeding the exercise-value posterior, which is read solely as a selection-score term at session_generator.py:704. Prescribed loads (session_generator.py:1104-1135) and load commands (strength_progression.p…

### eng-notes-parser.3 `multi-signal-pain-cross-attribution` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:168-188 (_scan_one pain targets) and :106-123 (_muscle_from_text)
- **Issue:** Pain in a multi-signal note is attributed to EVERY muscle mentioned anywhere in the note, because _muscle_from_text scans the whole string. The exercise that 'felt easy' gets cautioned alongside the one that actually hurt; the exercise-name muscles also leak in (e.g. 'press' maps to shoulders+chest).
- **Evidence:** Executed session note 'bench felt easy but my knee ached on squats' -> caution on {quads, glutes, triceps, chest} — chest/triceps come from 'bench', which was the EASY lift. Also 'knees felt tweaky on leg press' on Leg Press -> caution includes shoulders and chest via the 'press' keyword, for a knee complaint.
- **Fix:** Scope pain attribution to the clause containing the pain word (split note on 'but'/','/';' and run _muscle_from_text per clause), and drop or guard the bare 'press' entry in region_map so exercise-name words don't masquerade as body parts.
- **Blast radius:** Changes the caution dict consumed by session_generator selection (CAUTION_PENALTY) and the pain flag in exercise_reward, altering which accessories get demoted next week.
- **Verifier:** Reproduced both claimed behaviors exactly. (1) Session note 'bench felt easy but my knee ached on squats' yields caution on {chest, glutes, quads, triceps} — chest/triceps from 'bench', the lift that felt EASY — because _scan_one (notes_parser.py:168-176) runs _muscle_from_text over the whole note. (2) 'knees felt tweaky on leg press' on Leg Press yields caution on {Leg Press, quads, glutes, shoul…

### eng-notes-parser.4 `back-substring-overmatch` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:116 (region_map 'back' entry)
- **Issue:** The generic 'back' keyword substring-matches inside 'lower back' and 'back squat', so a lower-back pain note also cautions upper_back and lats, and a knee complaint mentioning 'back squat' cautions upper_back/lats too.
- **Evidence:** Executed 'lower back hurt' -> caution on {lower_back, upper_back, lats}; 'hurt my knee on back squat' -> caution on {quads, glutes, upper_back, lats}.
- **Fix:** Match region keywords longest-first and consume the matched span (or use word-boundary regex with exclusions), so 'lower back'/'low back' suppresses the generic 'back' mapping and 'back squat' maps to squat muscles only.
- **Blast radius:** Narrows the caution dict, so lat/upper-back accessories stop being demoted by lower-back pain notes in both daily (mpc_prescriber) and weekly generation.
- **Verifier:** Reproduced exactly: 'lower back hurt' cautions {lats, lower_back, upper_back} and 'hurt my knee on back squat' cautions {glutes, lats, quads, upper_back}, because notes_parser.py region_map applies plain substring matching with no precedence ('back' fires inside 'lower back' and 'back squat'); pollution comes solely from region_map, not hypertrophy_muscles. Live impact confirmed: caution dict feed…

### eng-notes-parser.5 `tight-sore-not-in-pain-lexicon` — ⚪ Low · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:31-33 (_PAIN_WORDS)
- **Issue:** Common complaint words 'tight' and 'sore' are not in _PAIN_WORDS ('stiff' is), so notes like 'lower back tight' or 'shoulder tight' silently extract nothing — no caution, no flag, no program response.
- **Evidence:** Executed 'lower back tight' and 'shoulder tight' -> all six output dicts empty; 'lower back hurt' with identical structure produces caution, proving the only miss is the lexicon.
- **Fix:** Add 'tight', 'tightness', 'sore' (possibly at severity 1 only) to _PAIN_WORDS; the module comment already invites lexicon extension ('[ENG], extend freely').
- **Blast radius:** More notes will produce caution entries, which demote matching exercises in session selection and add pain penalties to the exercise_values posterior written to athlete_params.
- **Verifier:** Reproduced exactly. _PAIN_WORDS (notes_parser.py:31-33) lacks 'tight' and 'sore' with no substring overlap from existing words; test in /tmp/optigains_verify confirms 'lower back tight', 'shoulder tight' (session- and exercise-level), and 'quads really sore' all yield fully empty signal dicts while 'lower back hurt' yields caution+flag. Code is live: caution demotes/avoids exercises in session_gen…

### eng-notes-parser.6 `negated-first-mention-masks-real-pain` — ⚪ Low · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:87-98 (_has uses text.find, first occurrence only)
- **Issue:** _has checks only the FIRST occurrence of each keyword for negation. If a word appears negated first and genuinely later, the real mention is dropped entirely.
- **Evidence:** Executed 'no pain in shoulder, but elbow pain was bad' -> all signals empty: find('pain') lands on the negated first 'pain' and the word is skipped, so the elbow pain is lost.
- **Fix:** Iterate all occurrences (re.finditer or repeated str.find from idx+1) and accept the word if any non-negated occurrence exists.
- **Blast radius:** More pain mentions will register as caution, feeding selection demotion and the exercise-value pain penalty.
- **Verifier:** Reproduced exactly: _has (notes_parser.py:87-98) checks only the first text.find occurrence per keyword, so 'no pain in shoulder, but elbow pain was bad' yields all-empty signals while 'elbow pain was bad' alone correctly produces caution for biceps/triceps. Live code path: parse_workout_notes is called from generate_weekly_program.py:703 and mpc_prescriber.py:619, so a genuine pain mention preced…

### eng-notes-parser.7 `session-note-exercise-mention-not-attributed` — ⚪ Low · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:190-205 (_scan_one exercise-gated branch)
- **Issue:** When an exercise is named only in a session-level note's TEXT (no exercise param), too_easy/too_hard/sentiment are never recorded for it (only a display-only 'session noted as easy/hard' flag), and the pain caution gets muscle keys but no exercise key — so the weekly pain penalty at generate_weekly_program.py:731,741 (which needs an exercise-name key) never fires from session notes.
- **Evidence:** Executed session note 'shoulder hurt on bench' -> caution keys {triceps, shoulders, chest} only, no 'Bench Press' key; 'bench felt easy but...' -> too_easy={} with only flag 'session noted as easy'. Same content as exercise-level notes (run 5b) produces too_easy={'Bench Press':1} and an exercise-key caution.
- **Fix:** In _scan_one, when exercise is None, attempt to resolve an exercise from the note text via log_ingest canon/ALIASES (or at least the _LIFT_KW big-three) and attribute easy/hard/sentiment/pain to it.
- **Blast radius:** Session-level notes would start moving the exercise_values posterior and exercise-key cautions, changing weekly reward math and the athlete_params write.
- **Verifier:** Reproduced exactly: session note 'shoulder hurt on bench' yields caution keys {shoulders, triceps, chest} with no 'Bench Press' key; 'bench felt easy but...' yields too_easy={} and only a display flag; identical content as an exercise-level note yields too_easy={'Bench Press':1} and an exercise-key caution. Code path confirmed: notes_parser.py:190-205 only attributes easy/hard/sentiment when an ex…


## Part B · Engine — deviation_tracker.py / canon()  (4 findings)

### eng-deviation-swaps.1 `canon-misses-common-abbreviations` — 🔴 High · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/engine/log_ingest.py:33-83 (canon/ALIASES), consumed by /home/nolan/projects/OptiGains/scripts/engine/deviation_tracker.py:96-110
- **Issue:** canon() is a bare lookup against 15 hardcoded aliases, so common abbreviation variants of the SAME exercise canonicalize to different names. Logging a variant of the prescribed exercise is misread as a swap: the prescription gets a drop vote (-0.5) and the variant is created as a brand-new lift with a chosen vote (+0.5), fragmenting the exercise-value posterior (and, since log_ingest.canon is shared, the e1RM history too).
- **Evidence:** Ran track_deviations with prescribed [{name:'Dumbbell Bench Press',sets:3}] and logged [{name:'DB Bench', 3 completed sets}] on the same date -> output: chosen={'DB Bench':1}, dropped={'Dumbbell Bench Press':1}, events=['2026-06-08: swapped Dumbbell Bench Press → DB Bench']. Same for prescribed 'Overhead Press' / logged 'OHP' -> chosen={'OHP':1}, dropped={'Overhead Press':1}. canon('DB Bench')='DB Bench' vs canon('Dumbbell Bench Press')='Dumbbell Bench Press' (no collision). Fed through learners.exercise_reward these produce -0.5 for the prescribed lift and +0.5 for a duplicate posterior key (verified: reward[Incline Bench Press]=-0.5, reward[Dip]=+0.5 in the true-swap control, which behaves correctly).
- **Fix:** In canon(), token-normalize before alias lookup: lowercase, collapse whitespace/punctuation, expand abbreviation tokens (db->dumbbell, bb->barbell, ohp->overhead press, kb->kettlebell), strip trailing 'press'-optional plurals; additionally, in track_deviations treat a logged/prescribed pair whose normalized token sets are near-identical (e.g. Jaccard >= 0.8) as the same exercise (set-delta path) rather than a swap.
- **Blast radius:** canon() is the shared name funnel for e1RM histories, the strength registry, goal aggregates, and exercise-value posterior keys, so changing it re-keys learned state across the whole engine.
- **Verifier:** Reproduced exactly as claimed: canon() (log_ingest.py:81-83) is a bare 15-alias lookup, so prescribed 'Dumbbell Bench Press' + logged 'DB Bench' (and 'Overhead Press'/'OHP') produce chosen/dropped pairs and a false 'swapped' event in track_deviations; exercise_reward then yields -0.5 for the prescribed lift and +0.5 for a duplicate posterior key, while the true-swap control behaves correctly. The …

### eng-deviation-swaps.2 `canon-case-sensitive-for-non-alias-names` — 🔴 High · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/engine/log_ingest.py:81-83
- **Issue:** canon() lowercases only for the alias lookup; on a miss it returns the original-cased string. So case/spelling-case variants of any exercise NOT in the 15-entry ALIASES dict (including all the Competition lifts, Dips, Lateral Raise, etc.) are treated as different exercises, producing a false drop-of-prescription + unknown-new-lift pair.
- **Evidence:** Ran track_deviations with prescribed 'Competition Squat (Top Set)' and logged 'competition squat (top set)' -> chosen={'competition squat (top set)':1}, dropped={'Competition Squat (Top Set)':1}, events=['2026-06-08: swapped Competition Squat (Top Set) → competition squat (top set)']. Control: alias-covered names work — prescribed 'Bench Press', logged 'BENCH PRESS' -> chosen={}, dropped={}, events=[] (correctly unified).
- **Fix:** Make canon() return a canonical casing for non-alias names too (e.g. ' '.join(key.split()).title() of the lowered key, or keep a learned-names dict keyed by lowered name) so case/whitespace variants of any name collide to one key.
- **Blast radius:** Re-casing canonical names changes the keys of existing exercise_values meta in athlete_params and e1RM/registry histories; needs a one-time key-merge or it orphans learned posteriors.
- **Verifier:** Reproduced exactly: canon() (log_ingest.py:81-83) lowercases only for the ALIASES lookup and returns original casing on a miss, so case variants of non-alias names (all Competition lifts, Dips, etc.) split into distinct keys. Re-ran the auditor's test: prescribed 'Competition Squat (Top Set)' vs logged 'competition squat (top set)' yields the false swap event and chosen/dropped pair; alias-covered…

### eng-deviation-swaps.3 `dropped-votes-deduped-across-dates` — 🟠 Medium · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/engine/deviation_tracker.py:114-118
- **Issue:** The skip branch checks `name not in out["dropped"]` against the accumulator shared across ALL dates in the lookback window, so an exercise skipped (or swap-dropped) on multiple dates only ever receives 1 drop vote total. This contradicts the module's stated design that repeated deviations compound into the posterior, and asymmetrically caps drops while chosen votes accumulate per date.
- **Evidence:** Prescribed 'Lateral Raise' on 2026-06-02 and 2026-06-04, logged neither day (only Dip logged both days) -> dropped={'Lateral Raise': 1} with a single event, expected 2. Also: swap-dropped 'Incline Bench Press' on 06-02 then outright skipped on 06-04 -> dropped={'Incline Bench Press': 1}, the second skip vote silently lost.
- **Fix:** Inside the per-log loop, collect this date's swap-source names in a local set (`swap_sources_today`) when handling chosen exercises, and gate the skip branch on `name not in swap_sources_today` instead of the cross-date `out["dropped"]` accumulator.
- **Blast radius:** Increases drop-vote counts feeding update_exercise_value, so repeatedly-skipped exercises' posteriors fall faster and fade from programming sooner.
- **Verifier:** Reproduced exactly as claimed: skip branch at deviation_tracker.py:115 dedupes against the cross-date out["dropped"] accumulator, so Lateral Raise skipped on 2026-06-02 and 2026-06-04 yields dropped=1 (expected 2), and a swap-drop on 06-02 followed by an outright skip on 06-04 loses the second vote. The asymmetry is proven internally: chosen votes and even swap-path drop votes (line 109, no dedup)…

### eng-deviation-swaps.4 `all-incomplete-exercise-counts-as-chosen` — ⚪ Low · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/engine/deviation_tracker.py:28-38,99-112
- **Issue:** _logged_names keeps an exercise with 0 completed working sets (all sets completed=False) in the logged dict with count 0, so an exercise the athlete bailed on entirely still earns a +0.5 chosen vote / 'added' event; if it were the prescribed lift it would also be scored as 'ran it' with a negative set delta instead of a skip.
- **Evidence:** Logged exercise 'Lateral Raise' with 3 sets all completed=False alongside the prescribed Dip -> chosen={'Lateral Raise': 1}, events=['2026-06-08: added Lateral Raise'].
- **Fix:** In _logged_names, only emit names with at least 1 completed set (skip when the filtered set list is empty), or filter `logged = {k:v for k,v in logged.items() if v > 0}` before diffing in track_deviations.
- **Blast radius:** Removes spurious chosen votes from the exercise-value posterior and can flip an all-bailed prescribed lift from set-delta scoring to a drop vote.
- **Verifier:** Reproduced exactly. _logged_names (deviation_tracker.py:37) emits count-0 entries for exercises whose sets all have completed=False; minimal test in /tmp/optigains_verify confirms chosen={'Lateral Raise': 1} + 'added' event for a fully bailed exercise, and an all-bailed prescribed lift scores set_delta=-3.0 instead of a drop vote. Scenario is reachable in production data: the frontend saves exerci…


## Part B · Engine — session_generator.py sequencing  (5 findings)

### eng-sequencing.1 `duplicate-exercise-same-session` — 🔴 High · 🟡 Needs review
- **Location:** scripts/engine/session_generator.py:686-736 (per-muscle knapsack loop)
- **Issue:** The knapsack loop has no exercise-name dedup: an exercise with a repeatable pattern that tops the ranking for two muscles is prescribed twice in the same session. The pattern-diversity set is the only guard, and repeatable patterns skip it.
- **Evidence:** Executed _build_session('upper_volume', 1.0, 0.20, rng, weekly_set_targets={}, exercise_values={'Push-ups': 4.5}, caution={'shoulders': {'severity': 1}}) -> ['Weighted Pull-up', 'Overhead Press (BB)', 'Chest-Supported Row', 'Pull-up Pyramid', 'Push-ups', 'Push-ups', ...]. 'Push-ups' appears twice (won both the chest and triceps slots). Reproduced identically across 7 RNG seeds (selection is deterministic; RNG unused in selection). Inputs are realistic: one severity-1 'shoulder ache' note (-8.0 caution demotes bench from 16 to 8) plus a learned Push-ups value of 4.5 (reachable in one week via learners.exercise_reward: slope 2.5 + 2 chosen-votes + sentiment).
- **Fix:** In the per-muscle loop, track a chosen_names set alongside used_patterns and skip any candidate whose name is already selected (for ex in pool: if ex['name'] in chosen_names: continue).
- **Blast radius:** Changes exercise selection in every generated session, so second-choice exercises will fill slots that previously duplicated, shifting per-muscle set totals slightly.
- **Verifier:** Reproduced exactly: the auditor's call to _build_session yields 'Push-ups' twice (chest + triceps slots) across all 7 seeds; code at session_generator.py:686-736 has no name dedup and repeatable patterns (calisthenics, isolations, hip_thrust) bypass the used_patterns guard. No dedup exists downstream (caller at line 936, generate_weekly_program.py). The proposed chosen_names fix is sound and narro…

### eng-sequencing.2 `full-body-consecutive-heavy-axial-overlap` — 🔴 High · 🟡 Needs review
- **Location:** scripts/engine/session_generator.py:375-377 (FULL_BODY_A/B) + 404-411 (_priority_score goal +10); scheduling loop scripts/generate_weekly_program.py:947-1038
- **Issue:** In the full_body framework, goal lifts win slots through their SECONDARY muscles (+10 goal bonus): FULL_BODY_B's triceps slot selects Bench Press (Daily Single) and its glutes slot selects Back Squat (Top Set), the exact heavy lifts FULL_BODY_A prescribes via chest/quads. The A/B muscle partition was the only recovery separation, and it is defeated — heavy squat top set + back-off and heavy bench run EVERY consecutive day. No consecutive-day primary-mover constraint exists anywhere in the pipeline (only split-name alternation). Worse, determine_optimal_split_framework auto-selects full_body precisely when avg_soreness > 7.0 or compliance < 0.70 — the most fatigued state gets daily maximal squatting.
- **Evidence:** Simulated the weekly loop (get_split -> generate -> append split) for 6 consecutive STRENGTH days, framework=full_body, ampk=0.20: Day1 full_body_a heavy-axial = [Back Squat (Top Set), Back Squat (Back-off), Bench Press (Daily Single), Bench Press (Back-off Vol), Weighted Pull-up]; Day2 full_body_b heavy-axial = [Deadlift (Top Set), Back Squat (Top Set), Back Squat (Back-off), Overhead Press (BB), Bench Press (Daily Single), Bench Press (Back-off Vol)]. Consecutive-day primary-mover overlap every day: {chest, core, front_delt, glutes, quads, triceps}; Back Squat (Top Set) appears on all 6 consecutive days.
- **Fix:** In _build_session, only allow a goal lift to be selected when the slot's muscle is its FIRST listed (primary) muscle (e.g. require muscle == ex['muscles'][0] when ex.get('is_goal')), so FULL_BODY_B's glutes slot falls through to Hip Thrust/RDL and triceps falls through to OHP/pushdown, restoring the A/B recovery partition. (Bench daily-single, if intentionally daily, can be whitelisted explicitly.)
- **Blast radius:** Changes goal-lift placement in full-body and any split where a goal lift currently leaks in via a secondary muscle, reducing heavy axial frequency and total weekly tonnage in full_body mode.
- **Verifier:** Reproduced exactly. _build_session's pool filter (session_generator.py:690-693) uses membership anywhere in ex['muscles'] (comment says 'as primary'), and is_goal +10 (line 407) lets Bench Press (Daily Single) win full_body_b's triceps slot and Back Squat (Top Set) win its glutes slot. Simulation of 6 consecutive STRENGTH full_body days (ampk=0.20, intensity=1.0) shows Back Squat (Top Set)+Back-of…

### eng-sequencing.3 `repeatable-pattern-bypasses-push-pull-redundancy` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/session_generator.py:681 (_REPEATABLE_PATTERNS) and 710-719
- **Issue:** The compound-pattern uniqueness constraint exempts the 'calisthenics' pattern entirely, so a calisthenics movement that is biomechanically the same pattern as an already-chosen compound (pull-up vs weighted pull-up, push-up vs bench) passes freely. The redundancy constraint is a soft preference that calisthenics and learned exercise_values outvote — this happens even with all-default inputs.
- **Evidence:** DEFAULT inputs, _build_session('upper_volume', 1.0, 0.20, rng, weekly_set_targets={}): output contains both 'Weighted Pull-up' (4x5, pattern vertical_pull, lats slot) and 'Pull-up Pyramid' (25 reps, pattern calisthenics, biceps slot) — two redundant vertical-pull movements in one session. Adversarial exercise_values={'Push-ups':10,'Dips':10,'Diamond Push-ups':10,...} yields 'Push-ups' twice plus other flat-press calisthenics stacking; flat-press list extracted from output: ['Push-ups', 'Push-ups'].
- **Fix:** Tag each calisthenics exercise with its true movement family (e.g. Push-ups -> horizontal_push, Bodyweight Pull-ups/Pull-up Pyramid -> vertical_pull, with a separate is_bodyweight flag for AMPK prioritisation) and check the family against used_patterns; keep only isolation_* truly repeatable.
- **Blast radius:** Alters which accessory fills the biceps/triceps/chest slots on most upper and full-body days, changing weekly volume distribution for those muscles.
- **Verifier:** Fully reproduced. (1) Code at session_generator.py:681 exempts 'calisthenics' from the compound-pattern uniqueness check (lines 710-719), and main knapsack slots have no name-level dedup. (2) Default-input repro confirmed deterministically: _build_session('upper_volume', 1.0, 0.20, rng, weekly_set_targets={}) yields both Weighted Pull-up (4x5, vertical_pull) and Pull-up Pyramid (calisthenics) in o…

### eng-sequencing.4 `lower-split-variants-identical-both-top-sets` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/session_generator.py:665-676 (split_map maps both lower variants to (LOWER_MUSCLES, LOWER_FREQ)); _decide_split alternation at 600-606
- **Issue:** _decide_split deliberately alternates lower_squat_primary / lower_hinge_primary, but _build_session ignores the suffix — both variants produce the IDENTICAL session containing BOTH Back Squat (Top Set)+Back-off AND Deadlift (Top Set)+Deficit Deadlift (two fatigue-cost-5.0 axial maximal lifts back-to-back in one session, every lower day). The intended squat/hinge emphasis rotation is dead code; only the bench back-off choice on upper days reads the suffix.
- **Evidence:** Executed _build_session for both splits with defaults: lower_squat_primary -> ['Back Squat (Top Set)', 'Back Squat (Back-off)', 'Deadlift (Top Set)', 'Deficit Deadlift', 'Hip Thrust', 'Calf Raise', 'Hanging Leg Raise']; lower_hinge_primary -> exact same list. Quads slot always picks Back Squat (Top Set) (score 17) and hamstrings slot always picks Deadlift (Top Set) (score 17); the hinge/squat pattern-diversity check never collides because they are different patterns.
- **Fix:** In _build_session, read the split suffix: for lower_squat_primary exclude/demote 'Deadlift (Top Set)' (let Romanian Deadlift win hamstrings), and for lower_hinge_primary exclude/demote 'Back Squat (Top Set)' (let Front/Box Squat win quads), restoring the alternating-emphasis design.
- **Blast radius:** Every lower-body session changes composition (one heavy top set instead of two), halving weekly heavy squat and deadlift top-set exposures.
- **Verifier:** Reproduced exactly: _build_session yields byte-identical exercise lists for lower_squat_primary and lower_hinge_primary (verified at intensity 0.95 and 0.85), each containing both Back Squat (Top Set) and Deadlift (Top Set) — two fatigue_cost-5.0 axial lifts per lower day. split_map (lines 665-676) maps both variants to the same (LOWER_MUSCLES, LOWER_FREQ); the only suffix read in _build_session (…

### eng-sequencing.5 `unclamped-exercise-value-outvotes-priority-tiers` — ⚪ Low · 🟡 Needs review
- **Location:** scripts/engine/learners.py:127-139,157-159 (posterior mean tracks raw reward, unbounded) and scripts/engine/session_generator.py:37,701-708 (EXVAL_SELECT_WEIGHT=1.5 applied unclamped)
- **Issue:** exercise_reward includes the raw strength slope (lbs/session) with no bound, and _sel_key adds 1.5 * mean with no clamp. A sustained slope of ~+5 lbs/session pushes a value past 6.7, letting any accessory outrank every non-goal primary (+2 tier) and, past ~10.7, outrank goal lifts (+10 tier) — the comment at session_generator.py:34-36 claims caution stays below the goal bonus, but learned value has no such ceiling.
- **Evidence:** Executed _build_session with exercise_values={'Push-ups': 10.0}: Bench Press (Daily Single) (score 16.0) is silently dropped from the chest slot in favor of Push-ups (2.0 + 1.5*10 = 17.0); the whole bench back-off + assistance chain (triggered only by the Daily Single's presence, lines 756-776) vanishes from the session.
- **Fix:** Clamp the selection contribution: score += EXVAL_SELECT_WEIGHT * max(-3.0, min(3.0, value)), keeping the learned signal strictly inside the is_primary/is_goal tier gaps.
- **Blast radius:** Caps how far learned exercise preferences can reorder selection, which may demote currently-favored accessories for athletes with large learned values.
- **Verifier:** Reproduced exactly. compute_trend_slope (strength_progression.py:25-41) is unbounded raw OLS; exercise_reward (learners.py:142-154) adds it unclamped; the Kalman posterior mean (learners.py:127-139) converges to the running average of rewards so it inherits the unbounded slope; generate_weekly_program.py:754 and mpc_prescriber.py:623-660 pass raw means to _sel_key (session_generator.py:701-708) wh…


## Part B · Engine — learners.py / learning loop  (7 findings)

### eng-learning.1 `unguarded-bandit-and-legacy-landmark-learning` — 🔴 High · 🟡 Needs review
- **Location:** scripts/generate_weekly_program.py:659-673 (guard computed at 714-722, state persisted at 1050 via save_engine_state lines 237-240)
- **Issue:** The already_ran idempotency guard does NOT cover all learning updates. Sections 4a (exploration bandit exploration_manager.record_outcome) and 4b (legacy landmark volume_engine.learn_from_response) execute unconditionally BEFORE already_ran is computed at line 714, and their mutated state is persisted at end of main via save_engine_state. A same-week re-run double-counts bandit pulls and double-decrements legacy MRV landmarks. The guard only covers exercise-values (5b), athlete_landmarks/freq bandit (6a), volume-test step (6a-test), and PST scheduler.
- **Evidence:** Executed /tmp/optigains_audit_learning/test_idempotency.py: bandit state counts=[2,1] values=[0.1,0.05]; after run 1 with reward +0.30 on chest -> counts=[3,1] values=[0.1667,...]; identical same-week run 2 -> counts=[4,1] values=[0.2,...] (double pull). Legacy landmarks quads MRV=20 with slope=-0.5, soreness 8+: run 1 -> MRV 19, same-week run 2 -> MRV 18 (double decrement). Both objects round-trip through guardrail_dict['exploration_state']/'mrv_state'. Also, after run 1, last_explored is overwritten with THIS week's probe, so a re-run scores this week's probe with stale slopes.
- **Fix:** Hoist the prev_plans fetch + already_ran computation (lines 714-722) above section 4a (~line 655); it has no dependency on anything in between. Then gate the 4a loop and the 4b learn_from_response call with `if not already_ran:`.
- **Blast radius:** Moves the weekly_plans read earlier and gates two persisted learner updates, changing what state is written on re-runs (the intended behavior) and on first runs nothing.
- **Verifier:** Verified by code reading and reproduction. Sections 4a (generate_weekly_program.py:659-668, exploration_manager.record_outcome) and 4b (line 673, volume_engine.learn_from_response) execute before the already_ran guard is computed (lines 716-722), and their mutated state is unconditionally persisted at line 1050 via save_engine_state (exploration_state line 240, mrv_state line 238). Reproduced exac…

### eng-learning.2 `mrv-posterior-drops-on-positive-response` — 🔴 High · 🟡 Needs review
- **Location:** scripts/engine/learners.py:41-57 (update_mrv), consumed at scripts/generate_weekly_program.py:806 and allocator at 884-906
- **Issue:** update_mrv encodes 'responding and recoverable' as obs = weekly_sets + 1, a censored 'MRV is at least this' statement, but applies it as a POINT observation in the Kalman update. Whenever planned sets are below the posterior mean (the normal case: allocator targets near MAV ~12 vs prior MRV 18), positive evidence pulls the MRV estimate DOWN, eventually matures it, and the acted-on MRV collapses toward (typical allocation + 1) — a self-fulfilling volume ceiling. Reward sign is inverted for this input regime.
- **Evidence:** Executed 6 consecutive 'responding & recoverable at 12 sets' weeks against row {mrv_mean:18, mrv_var:9}: mrv_mean 18.0 -> 16.3 -> 15.18 -> 14.52 (mature=True, acted-on MRV drops 18 -> 15) -> 14.17 -> 13.95 -> 13.8, final acted-on MRV=14. A muscle that grew every week lost 4 sets of volume ceiling. By contrast the over-MRV case (slope<0, soreness>=4.0, obs=sets-1) correctly moves down, and responding at 20 sets correctly moves up (18.0 -> 19.02).
- **Fix:** Treat the responding case as censored: only apply obs = weekly_sets + 1 when it is ABOVE the current mean (e.g. `if responding and recoverable and weekly_sets + 1 > mean: obs = weekly_sets + 1`), or use a one-sided/truncated update; keep the over-MRV branch as-is.
- **Blast radius:** Changes the MRV posterior trajectory written to athlete_landmarks, which the weekly allocator uses for set targets once mature.
- **Verifier:** Confirmed by code read and exact numeric reproduction. learners.py:44-45 applies the censored 'responding and recoverable' signal (obs = weekly_sets + 1, commented 'MRV is at least this') as a symmetric Kalman point observation, so in the normal operating regime (allocator targets near MAV ~12 via recovery_budget = sum-MAV-scaled budget and 0.20-discounted marginal value above MAV, vs prior mrv_me…

### eng-learning.3 `running-adjustment-compounds-on-persisted-state` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/hypertrophy_volume.py:170-182, called from scripts/generate_weekly_program.py:679
- **Issue:** adjust_for_running subtracts an absolute amount (0.05 * weekly_km sets) from the CURRENT stored MRV, but volume_engine is loaded from persisted mrv_state (line 411) and saved back every run (line 238). At constant running volume the decrement compounds every invocation (weekly AND on same-week re-runs, since it is also outside the already_ran guard) until lower-body MRV ratchets to MEV+1. adjust_for_caloric_deficit avoids this by rescaling from _default_landmarks baseline.
- **Evidence:** Executed load->adjust_for_running(30.0)->save round-trips: quads MRV 20 -> 18 -> 16 -> 14 -> 12 -> 10 -> 9 (=MEV+1) in 6 runs at a constant 30 km/wk. This state feeds the exploration-delta MRV cap at generate_weekly_program.py:691; the main allocator reads athlete_landmarks instead, limiting impact.
- **Fix:** Mirror adjust_for_caloric_deficit: compute lm['MRV'] = max(mev+1, round(_default_landmarks(m)['MRV'] - reduction)) from the baseline (or from the learned athlete_landmarks value) instead of decrementing the previously-saved value.
- **Blast radius:** Changes persisted mrv_state values and the exploration-delta ceiling math for lower-body muscles.
- **Verifier:** Reproduced exactly: load->adjust_for_running(30.0)->save cycles ratchet quads MRV 20->18->16->14->12->10->9 (=MEV+1) in 6 runs at constant 30 km/wk; hamstrings/glutes floor at 7 by run 5. Code confirms the mechanism: hypertrophy_volume.py:176-182 decrements the stored MRV in place while adjust_for_caloric_deficit rescales from _default_landmarks baseline; generate_weekly_program.py loads persisted…

### eng-learning.4 `raw-e1rm-slope-drowns-pain-penalty` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/learners.py:142-154 (exercise_reward) with slope from scripts/generate_weekly_program.py:734 (compute_trend_slope of raw e1RM lbs)
- **Issue:** Adversarial magnitude test result: a single 'felt easy' note alone CANNOT outweigh a same-week pain note on the same exercise (+0.3 vs -1.5; even chosen+liked+easy = +1.4 < 1.5). BUT the slope term is raw e1RM lbs/session, unnormalized against the ~0.5-1.5 scale of the vote/penalty constants, so any normally progressing lift drowns the pain penalty and the exercise's value RISES the same week pain was reported.
- **Evidence:** Executed: exercise_reward(slope=None, easy=1, pain=True) = -1.2 (pain wins, posterior -0.60); exercise_reward(None, chosen=1, sentiment=+1, easy=1, pain=True) = -0.1 (pain still wins). But e1RM history [225,228,232,235] gives slope=+3.40 lbs/session, and exercise_reward(3.40, 0,0,0,0, pain=True) = +1.9 -> posterior mean +0.95 despite the pain note. Any slope > 1.5 lbs/session (very common on a progressing lift) flips a pain week positive.
- **Fix:** Normalize or cap the slope contribution in exercise_reward (e.g. r += max(-1.0, min(1.0, slope / SLOPE_SCALE)) with SLOPE_SCALE ~2.5 lbs/session), or make pain a hard veto (if pain: return min(r, PAIN_PENALTY)) so strength progress cannot mask a flagged injury signal.
- **Blast radius:** Rescales the exercise-value rewards for every exercise with a strength history, shifting all learned exercise-value posteriors going forward.
- **Verifier:** All claimed numbers reproduce exactly (re-ran in /tmp/optigains_verify): slope([225,228,232,235])=3.4 lbs/session, exercise_reward(3.4, pain=True)=+1.9, posterior mean +0.95; pain flips positive at any slope >1.5 lbs/session, which a 2.5 lb/session modest progression easily exceeds. History is raw e1RM lbs (strength_progression.py:91-99), the reward is computed in the live weekly path (generate_we…

### eng-learning.5 `session-level-pain-misses-exercise-reward` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/notes_parser.py:168-188 and scripts/generate_weekly_program.py:741 (pain=(name in notes_signals['caution']))
- **Issue:** Pain written in the SESSION note (not on the exercise row) is keyed only by muscle ('shoulders', 'chest'), so pain=False in the exercise reward; a simultaneous 'felt easy' on the offending exercise nets +0.3 and its learned value goes UP the same week pain was reported. The caution dict still steers the session generator that week, but the positive posterior bump persists after the caution expires.
- **Evidence:** Executed parse_workout_notes on log {notes: "POST: sharp pain in left shoulder during pressing", exercises: [{name: 'Overhead Press', notes: 'felt easy, flew up'}]}: caution keys = ['shoulders','chest'], 'Overhead Press' not in caution, blended reward = +0.3, posterior +0.15. With the pain note attached to the exercise row instead, reward = -1.2 (correct).
- **Fix:** In the weekly reward loop (or notes_parser), when a session-level pain note yields muscle-level caution, set pain=True for exercises logged that day whose primary muscles (engine.muscle_map.get_muscles) intersect the cautioned muscles.
- **Blast radius:** Adds pain penalties to more exercises' value posteriors, shifting future exercise selection scores.
- **Verifier:** Reproduced exactly. Session-level pain notes are scanned with exercise=None (notes_parser.py:231), so caution is keyed only by landmark muscles ('shoulders','chest'); the reward loop's pain check at generate_weekly_program.py:741 matches by canonical exercise name only, so 'Overhead Press' gets pain=False. With a simultaneous 'felt easy, flew up' exercise note, reward = +0.3 and posterior mean = +…

### eng-learning.6 `canon-case-sensitive-phantom-swap-votes` — ⚪ Low · 🟡 Needs review
- **Location:** scripts/engine/log_ingest.py:81-83 (canon) with scripts/engine/deviation_tracker.py:99-112
- **Issue:** canon lowercases only for the ALIASES lookup and otherwise returns the name with its original casing, so 'overhead press' and 'Overhead Press' are distinct identities. If the logged casing differs from the prescribed casing, the deviation tracker emits a phantom swap: +1 chosen for one key and +1 dropped for the other — opposite-sign votes (+/-0.25 posterior) splitting one exercise across two posteriors.
- **Evidence:** Executed track_deviations(prescribed=[{exercises:[{name:'Overhead Press',sets:4}]}], logged=[{exercises:[{name:'overhead press', 4 completed sets}]}]) -> chosen={'overhead press': 1}, dropped={'Overhead Press': 1}, event "swapped Overhead Press -> overhead press". Verified canon('Overhead Press')='Overhead Press' vs canon('overhead press')='overhead press'.
- **Fix:** Make canon return a case-normalized form for non-alias names (e.g. key = name.strip().lower(); return ALIASES.get(key, key)), with a one-time migration of existing keys in exercise_values meta and e1rm_registry history.
- **Blast radius:** Changes the key space shared by the e1RM registry, exercise-value store, and deviation tracker, so existing stored keys must be migrated or they orphan.
- **Verifier:** Reproduced verbatim: canon (log_ingest.py:81-83) lowercases only for the ALIASES lookup, so 'Overhead Press' and 'overhead press' are distinct keys; track_deviations with case-divergent prescribed/logged names emits chosen={'overhead press':1}, dropped={'Overhead Press':1} and a phantom swap event (the _same_slot check matches because get_muscles lowercases internally). Impact path confirmed: vote…

### eng-learning.7 `ev-learn-before-idempotency-marker-write` — ⚪ Low · 🟡 Needs review
- **Location:** scripts/generate_weekly_program.py:745-750 (EV upsert) vs 914-923 (weekly_plans upsert that arms already_ran)
- **Issue:** The already_ran guard keys off the weekly_plans row, which is written ~170 lines AFTER the exercise-value/landmark learner writes. If the script crashes between the learner upserts and the weekly_plans upsert (e.g. allocator exception), a re-run sees already_ran=False and applies all learner updates a second time.
- **Evidence:** Code ordering: sb_upsert('athlete_params', exercise_values) at line 745 and sb_upsert('athlete_landmarks') at 808 both precede sb_upsert('weekly_plans') at line 914; nothing else marks the week as learned. Simulated in test_idempotency.py: applying update_exercise_value twice with reward +0.5 moves mean 0.25 -> 0.375 and n 1 -> 2 instead of staying at 0.25/1.
- **Fix:** Upsert a minimal weekly_plans stub (created_by, week_start) or a dedicated 'learned_week' athlete_params marker immediately before the first learner write, so a crashed run still trips already_ran on retry.
- **Blast radius:** Adds an extra early DB write whose presence changes re-run behavior after partial failures.
- **Verifier:** Confirmed. The already_ran guard (generate_weekly_program.py:716-720) reads only weekly_plans.week_start, which is written at 914-923, after all learner upserts (exercise_values 745-750, athlete_landmarks 808-812, freq.* 817-822, test landmark 849-853); grep confirms no other learned-week marker. The crash window is real: sb_* helpers swallow exceptions, but update_mrv/step_volume_test/plan_week (…


## Part B · Engine — pipeline robustness  (8 findings)

### eng-robustness.1 `weekly-gen-persists-simulated-kalman-state` — 🔴 High · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/generate_weekly_program.py:1043-1046 and 256-265 (save_engine_state)
- **Issue:** The per-day generation loop advances the REAL Kalman filter with projected future loads (kalman.step(projected_tss, None) per generated day, plus guardrail.record_state of simulated fatigue states), and save_engine_state then persists that mutated state to engine_params. The next daily compute_athlete_state loads this polluted row and steps it again with actual loads, so up to 7 days of phantom load are double-counted into fitness/fatigue every week.
- **Evidence:** Executed the exact loop in /tmp/optigains_audit_pipek/test_kalman_pollution.py: starting state fitness=0.0/fatigue=0.0, after the 7-day generation loop the persisted state is fitness=0.535/fatigue=1.583/TSB=-1.048 — all from loads that never happened. compute_athlete_state.py:1025-1032 loads engine_params order date.desc limit 1, i.e. this row.
- **Fix:** Snapshot kalman.to_dict() and guardrail.to_dict() before the per-day loop and pass the snapshots to save_engine_state (or run the loop on a deep copy / use kalman.simulate_forward, which already exists and does not mutate self).
- **Blast radius:** Changes which Banister fitness/fatigue/TSB state is persisted, which feeds the daily MPC action scores, the recovery budget in the allocator, and the deficit-recommendation TSB gate.
- **Verifier:** Reproduced and code-confirmed. generate_weekly_program.py:1044 advances the REAL persisted BanisterKalman (step() mutates self.x/P per banister_kalman.py:143-160) with projected ACTION_TSS for each generated future day, and line 1046 pushes simulated fatigue states into the guardrail hysteresis history; save_engine_state (line 259/237) then persists both mutated objects to engine_params. compute_a…

### eng-robustness.2 `soreness-scale-mismatch-into-mrv-learner` — 🟠 Medium · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/generate_weekly_program.py:606-609, 804-806, 839-841 vs /home/nolan/projects/OptiGains/scripts/engine/learners.py:16-17 and engine/controlled_tests.py:107-112
- **Issue:** generate_weekly_program converts the 0-3 soreness snapshot to a 1-10 scale (1.0 + v*3.0) and passes that avg into update_mrv and step_volume_test, but learners.py documents soreness_avg as 0-5 with SOR_OK=2.5 / SOR_HI=4.0 (and step_volume_test thresholds on 4.0). On the 1-10 scale, raw soreness 1/3 ('a bit sore') = 4.0, so it counts as the over-MRV stall signal, and 'recoverable' (<=2.5) is only true at essentially zero soreness — the MRV posterior is biased downward and positive-response observations are suppressed.
- **Evidence:** Executed in /tmp/optigains_audit_pipek/test_empty_inputs.py: raw 1/3 -> converted 4.0; update_mrv(slope=+0.5, sets=14, soreness=4.0) produced NO observation (posterior unchanged, n_obs stays 0) where the intended-scale call (soreness 1.7) moved mrv_mean 20->18.3 with n_obs 1; update_mrv(slope=-0.1, soreness=4.0) wrongly recorded an over-MRV observation (mrv_mean 20->17.62). step_volume_test with soreness 4.0 marks the ramp week non-recoverable (best_tolerated never set).
- **Fix:** Pick one scale: either pass the raw 0-3-derived average (or a 0-5 mapping) into update_mrv/step_volume_test, or recalibrate SOR_OK/SOR_HI (and step_volume_test's 4.0 thresholds) to the 1-10 scale used by the bandit reward (which thresholds at 7).
- **Blast radius:** Changes the MRV-posterior update math, so learned athlete_landmarks (and therefore weekly set targets) will shift for any muscle with logged soreness.
- **Verifier:** Fully reproduced. Raw soreness is 0-3 (MorningCheckin.jsx labels None/Mild/Moderate/Severe, % 4 cycle); generate_weekly_program.py:606-609 converts to 1-10 (1+v*3) and passes that average into update_mrv (lines 804-806) and step_volume_test (839-841), but learners.py documents soreness_avg as 0-5 with SOR_OK=2.5/SOR_HI=4.0 and controlled_tests.py thresholds at 4.0. Repro in /tmp/optigains_verify/r…

### eng-robustness.3 `null-or-zero-weight-poisons-weight-trend` — 🟠 Medium · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/compute_athlete_state.py:633-640 (compute_nutrition)
- **Issue:** Weight-trend regression maps a null/zero weight entry to y=0 via float(r.get("weight") or 0) instead of excluding it, so one bad row swings the lbs/week slope to an absurd value. weight_trend feeds on_track, recommend_phase (weight_trend > 0.3 -> 'you're gaining'), and estimate_tdee's energy-balance branch.
- **Evidence:** Executed in /tmp/optigains_audit_pipek/test_pipeline_funcs.py: compute_nutrition([], [{recorded_date:2026-06-01, weight:None},{...,190},{...,189}], {}) returned weight_trend_lbs_per_week = +330.75. (estimate_tdee itself is protected by its 25%-band guard; the phase recommender and on_track are not.)
- **Fix:** Filter the entries before regressing: sorted_w = [r for r in weight_entries if (r.get("weight") or 0) > 0 and r.get("recorded_date")], then take the last 14 and require >=3 remaining.
- **Blast radius:** Changes the nutrition weight-trend value written to athlete_state, which feeds the diet-phase recommendation and adaptive TDEE inputs.
- **Verifier:** Reproduced. Line 638 of scripts/compute_athlete_state.py maps null/zero weight to y=0 in the trend regression. Auditor's exact input gives +174.45 lb/wk (not their claimed +330.75 — minor evidence discrepancy, same phenomenon). Realistic impact confirmed: a 14-day cut series at true -0.49 lb/wk with one null entry reports -3.4 lb/wk and flips on_track False->True; recommend_phase emits 'you're gai…

### eng-robustness.4 `enrollment-start-date-empty-isoformat-crash` — 🟠 Medium · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/scripts/generate_weekly_program.py:627-628
- **Issue:** raw_start = enrollment.get("started_at") or enrollment.get("start_date") or "" followed by datetime.date.fromisoformat(raw_start[:10]) raises ValueError and kills the entire weekly generation if the active enrollment row has neither field set (both are nullable as far as the repo schema shows; enrollment_start is only used for a print).
- **Evidence:** Executed repro in /tmp/optigains_audit_pipek/test_pipeline_funcs.py: datetime.date.fromisoformat(""[:10]) -> ValueError("Invalid isoformat string: ''").
- **Fix:** Guard the parse: enrollment_start = datetime.date.fromisoformat(raw_start[:10]) if raw_start else TODAY (it is display-only).
- **Verifier:** Crash is real and reproduced: with started_at and start_date both null, raw_start is "" and datetime.date.fromisoformat("") raises ValueError; main() has no surrounding handler so the entire weekly generation aborts. enrollment_start is used only in the line-630 print, so the proposed guard (fall back to TODAY, which exists at line 68) is behavior-safe and risk green is accurate. However, both app…

### eng-robustness.5 `learner-writes-precede-idempotency-marker` — ⚪ Low · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/generate_weekly_program.py:716-924 (already_ran guard vs weekly_plans upsert)
- **Issue:** The once-per-week idempotency flag (already_ran) is defined by the weekly_plans row, but that row is only upserted at line 914 — AFTER the exercise-value upsert (745), all athlete_landmarks update_mrv upserts (808), frequency-bandit upserts (817), and the controlled-test step/schedule (843-866). A crash anywhere between the learner writes and line 914 means a CI retry re-runs all learners and double-counts the week's observation into the MRV/frequency/exercise-value posteriors (n_obs incremented twice, mean moved twice).
- **Evidence:** Code order read directly: sb_upsert(athlete_params, exercise_values) at 745-750, sb_upsert(athlete_landmarks) inside the loop at 808-812, freq upserts at 817-822, test step/insert 843-866 — all guarded only by not already_ran; weekly_plans upsert that flips already_ran is at 914-923.
- **Fix:** Write a lightweight learned-marker immediately after computing already_ran-guarded inputs and before the learner loop (e.g. upsert an athlete_params row param_key='learned_week' with mean=0 and meta={week_start}, and include it in the already_ran check), or move the weekly_plans upsert (with provisional targets) before the learner block and re-upsert with final targets after.
- **Blast radius:** Changes when the weekly idempotency marker is committed, affecting how same-week re-runs and CI retries interact with all Bayesian-learner table writes.
- **Verifier:** Verified by direct read and engine repro. Code order matches the claim: all learner writes (exercise_values upsert at 745, athlete_landmarks upserts at 808/849, freq.* bandit upserts at 817, controlled_tests step/insert at 843-866) execute before the weekly_plans upsert at 914 that defines already_ran (716-720). Reproduced double-counting in /tmp/optigains_verify/repro.py with the real functions f…

### eng-robustness.6 `update-mrv-can-emit-mav-above-mrv` — ⚪ Low · 🟡 Needs review
- **Location:** /home/nolan/projects/OptiGains/scripts/engine/learners.py:55-59 (update_mrv) and 73-77 (apply_mrv_observation)
- **Issue:** mav = max(mev + 1, min(round(mean) - 2, mrv - 1)) lets the mev+1 floor exceed mrv when the matured posterior mean lands near MEV, producing an inverted MAV > MRV landmark row that is upserted to athlete_landmarks and consumed by the allocator's marginal_value (which assumes mev < mav < mrv).
- **Evidence:** Executed: update_mrv({mev:8, mav:14, mrv:18, mrv_mean:8.0, mrv_var:0.5, n_obs:10}, 9, -0.2, 4.5, 18) -> {'mrv': 8, 'mav': 9.0, 'mature': True} i.e. mav > mrv (test_empty_inputs.py).
- **Fix:** Clamp the triple after computing: mrv = max(mrv, mev + 2); mav = max(mev + 1, min(mav, mrv - 1)) in both update_mrv and apply_mrv_observation.
- **Blast radius:** Touches the landmark math written to athlete_landmarks and read by the weekly allocator, so set targets for a matured-low muscle can change.
- **Verifier:** Reproduced exactly as claimed: update_mrv({mev:8, mav:14, mrv:18, mrv_mean:8.0, mrv_var:0.5, n_obs:10}, 9, -0.2, 4.5, 18) returns mrv=8, mav=9.0 (mature=True), and apply_mrv_observation inverts identically — the mev+1 floor at learners.py:57/75 beats the mrv-1 cap when the matured posterior mean lands near MEV. The inverted triple is upserted verbatim to athlete_landmarks (generate_weekly_program.…

### eng-robustness.7 `soreness-snapshot-nonnumeric-crashes-daily-compute` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/scripts/compute_athlete_state.py:742-746 (compute_soreness_composite)
- **Issue:** valid = [float(v) for v in snapshot.values() if v is not None] raises ValueError on any non-numeric value in the daily_readiness.soreness_snapshot jsonb (untyped, app-written), crashing the whole daily compute. muscle_map.soreness_by_muscle already handles this case with try/except; this copy does not.
- **Evidence:** Executed: compute_soreness_composite({'soreness_snapshot': {'Chest': 'x'}}) -> ValueError: could not convert string to float: 'x' (test_pipeline_funcs.py).
- **Fix:** Coerce defensively like muscle_map.soreness_by_muscle: wrap float(v) in try/except (TypeError, ValueError) and skip bad values.
- **Verifier:** Reproduced exactly: compute_soreness_composite({'soreness_snapshot': {'Chest': 'x'}}) raises ValueError (test in /tmp/optigains_verify). The list comprehension at compute_athlete_state.py:742 has no exception handling, while muscle_map.soreness_by_muscle (engine/muscle_map.py:174-177) defensively coerces the identical jsonb with try/except — confirming the codebase treats this input as untrusted e…

### eng-robustness.8 `synthesis-state-explicit-null-attributeerror` — ⚪ Low · 🟢 Safe
- **Location:** /home/nolan/projects/OptiGains/scripts/generate_weekly_program.py:927 and /home/nolan/projects/OptiGains/scripts/mpc_prescriber.py:550
- **Issue:** (guardrail_state).get("synthesis_state", {}).get(...) crashes with AttributeError if the jsonb key is present but null (the default-arg .get pattern does not protect against explicit None). All sibling reads in these files use the (x or {}) pattern; these two do not.
- **Evidence:** Executed: ({'synthesis_state': None}).get('synthesis_state', {}).get('compliance_rate', 0.8) -> AttributeError: 'NoneType' object has no attribute 'get' (test_pipeline_funcs.py). Current writers only set the key when truthy, so this fires only if a null was ever persisted — defensive fix.
- **Fix:** Use ((engine.get("guardrail_state") or {}).get("synthesis_state") or {}) in both places.
- **Verifier:** Verified as described. Both cited lines use .get("synthesis_state", {}).get(...) (generate_weekly_program.py:927, mpc_prescriber.py:550); re-ran the repro in /tmp/optigains_verify and both expressions raise AttributeError on {"synthesis_state": None}. Neither line is dead code (927 runs unconditionally each weekly run; 550 is the live fallback when weekly_plans lacks the current week). Sibling rea…


## Part B · Engine — frontend↔engine contract  (8 findings)

### eng-contract.1 `program-schedule-drops-engine-days` — 🔴 High · 🟡 Needs review
- **Location:** src/utils/programSchedule.js:87-145 (reader) vs scripts/generate_weekly_program.py:1015-1032 (writer)
- **Issue:** getProgramSchedule builds the calendar only from base-template rows (scheduled_date null) tiled over num_cycles*days_per_week; engine-written program_workouts rows (which always have scheduled_date) only surface when a base-template date happens to collide. Engine-only programs render nothing, and any engine week past the enrollment cycle window is invisible while ghost base-template days appear on engine rest days. The comment at line 139 ('synthesize day slots from override dates') is dead code: effectiveTrainingDays = trainingDays.length > 0 ? trainingDays : [].
- **Evidence:** Executed /tmp/optigains_audit_contract/test_schedule.mjs and test_schedule3.mjs against the real module: (A) program with only engine rows (scheduled_date 2026-06-08..13) -> getProgramSchedule returned 0 entries; (C) enrollment start 2026-01-05, 6 d/w, 4 cycles, engine rows for June 2026 -> 'June engine days rendered: 0', last rendered date 2026-01-28; (B) mixed case also rendered base 'ghost' days 2026-06-07/06-14 the engine never scheduled. Engine upserts pw_row with scheduled_date for every generated day (generate_weekly_program.py:1015-1032).
- **Fix:** In getProgramSchedule, emit every dateOverrideMap row as a first-class entry (date, title, exercises, cardio_sessions) regardless of the cycle window, and suppress base-template entries for dates within the engine-generated date range; this also implements the dead 'synthesize from override dates' branch.
- **Blast radius:** getProgramSchedule feeds WeeklySchedule, getTodayProgramWorkout, and the Dashboard/WorkoutDetail program-start flow, so all program scheduling/completion displays change together.
- **Verifier:** Fully reproduced against the real module: engine-only rows yield 0 schedule entries; engine rows dated past the num_cycles*days_per_week window from start_date are invisible (June 2026 rows render 0 entries, schedule ends 2026-01-28); ghost base-template days render on engine rest days; line 140 (effectiveTrainingDays = trainingDays.length > 0 ? trainingDays : []) makes the 'synthesize from overri…

### eng-contract.2 `run-block-pace-contains-zone-not-pace` — 🟠 Medium · 🟡 Needs review
- **Location:** scripts/engine/session_generator.py:1178 (writer) vs src/components/dashboard/PrescribedSessionCard.jsx:219-221 (reader)
- **Issue:** training_prescription.prescription.run_block.pace is built from notes.split('.')[0], which is the 'Garmin <zone>' prefix, not the pace. The UI renders '{run.zone} run · {miles} mi · {run.pace}', so the zone shows twice and the actual VDOT pace (e.g. 7:04/mi) is never shown even though the cardio dict carries a real 'pace' key the builder ignores.
- **Evidence:** Executed SessionGenerator.generate (mpc_action=CARDIO, run_slot=threshold, vdot=48) in /tmp/optigains_audit_contract/test_runblock.py: run_block = {'zone': 'Z3-Z4', 'session_miles': 4.8, 'pace': 'Garmin Z3-Z4', 'duration_minutes': 40, 'notes': 'Garmin Z3-Z4. Threshold. ... Target 7:04/mi.'} — pace field is 'Garmin Z3-Z4'.
- **Fix:** In session_generator.py run_block construction, use "pace": c.get("pace") (the cardio dict already sets it at line 556) instead of c.get("notes", "").split(".")[0].
- **Blast radius:** Changes the persisted training_prescription.prescription payload that PrescribedSessionCard and the daily brief consume.
- **Verifier:** Reproduced exactly: SessionGenerator.generate (CARDIO, run_slot=threshold, vdot=48) yields run_block.pace='Garmin Z3-Z4' (notes.split('.')[0]) while the cardio dict carries the real pace '7:04' at session_generator.py:557 which the run_block builder at line 1179 ignores. Both consumers are affected and neither shows the real pace: PrescribedSessionCard.jsx:219-220 renders 'Z3-Z4 run · 4.8 mi · Gar…

### eng-contract.3 `cardio-completions-never-read-by-engine` — 🟠 Medium · 🟡 Needs review
- **Location:** src/hooks/useCardioCompletions.js:43-48 (writer) vs scripts/* (no reader)
- **Issue:** The UI persists manual 'prescribed cardio done' check-offs to cardio_completions (created_by, cardio_date, name), but no pipeline script ever queries the table — grep of scripts/ has zero hits. Cardio load/TSS/VDOT comes solely from garmin_activities, so a manually checked-off session that Garmin missed counts as not-done to the engine while the UI shows it complete.
- **Evidence:** useCardioCompletions.js:46 upserts {created_by, cardio_date, name}; `grep -rn cardio_completions scripts/` returns nothing; mpc_prescriber.py:570 and compute_athlete_state.py:987 source cardio exclusively from garmin_activities. The hook's own header admits it is only 'queryable by the engine later'.
- **Fix:** In compute_athlete_state/mpc_prescriber, read cardio_completions for the day and credit the prescribed duration_minutes as run TSS when no matching garmin_activities row exists.
- **Blast radius:** Adds a new input to daily load/ACWR/TSS math, shifting fatigue and prescription outputs on days with manual check-offs.
- **Verifier:** Verified: useCardioCompletions.js:43-48 writes cardio_completions, and a recursive scan of scripts/ (incl. engine/) plus supabase/functions/ finds zero readers; mpc_prescriber.py:570 and compute_athlete_state.py:987 source cardio exclusively from garmin_activities (confirmed via sb_get table inventory of both scripts). The auditor omitted a partial mitigation — the hook fires garmin-activities-syn…

### eng-contract.4 `today-fuel-ignores-engine-recommended-intake` — 🟠 Medium · 🟢 Safe
- **Location:** src/pages/Today.jsx:108-110,169-176 vs scripts/compute_athlete_state.py:1180-1199 and src/hooks/useDailyTargets.js:54,99-102
- **Issue:** The engine writes its recovery-gated, carb-cycled target to athlete_state.nutrition.recommended_intake.calorie_target, and useDailyTargets (the declared single source of truth, used by FoodTracker/WeeklyPlanCard) prefers it. Today.jsx's Fuel card instead reads nutrition.calorie_target, which useDailyTargets' own comment calls 'just the profile goal echoed back' — so the Today ring and the Fuel page can show different kcal targets and the engine's actual recommendation is hidden on the home screen.
- **Evidence:** Today.jsx:109 `const calTarget = nutrition?.calorie_target;` rendered at :169; useDailyTargets.js:54 `recommended?.calorie_target ?? nutrition?.calorie_target` with comment at :99-102 ('the engine's top-level calorie_target is just the profile goal echoed back'); compute_athlete_state.py:669 writes calorie_target straight from profile.daily_calorie_goal while :1180 writes nutrition['recommended_intake'].
- **Fix:** Have Today.jsx consume useDailyTargets(today) for the Fuel card's calorie/protein values instead of reading state.nutrition.calorie_target directly.
- **Verifier:** Reproduced: Today.jsx:109 reads nutrition.calorie_target (static profile echo, compute_athlete_state.py:669) while FoodTracker/WeeklyPlanCard via useDailyTargets read recommended_intake.calorie_target (engine-gated, :1179). Minimal repro in /tmp/optigains_verify shows 2200 vs 1649 kcal (551 kcal divergence) on a clear-recovery cut, and the engine value moves with gates (manual_ease → 2192) while t…

### eng-contract.5 `weekly-plans-and-controlled-tests-never-surfaced` — 🟠 Medium · 🟢 Safe
- **Location:** scripts/generate_weekly_program.py:914-923,862-877 (writers) vs src/ and supabase/functions/generate-daily-brief/index.ts:445-452 (no readers)
- **Issue:** The engine writes user-facing content the UI never reads: (1) weekly_plans (set_targets, frequency_targets, run_plan, human-readable rationale) is read back only by mpc_prescriber; no src/ file queries it. (2) controlled_tests PST-diagnostic rows are written with the explicit promise 'the brief surfaces it' (controlled_tests.py:48), but generate-daily-brief reads only athlete_state, training_prescription, daily_tasks and daily_briefs, and no src/ file queries controlled_tests — so the athlete is never told to run the benchmark the engine is waiting on (completion is detected via new pst_tests rows that the prompt was supposed to elicit).
- **Evidence:** grep weekly_plans across repo: only mpc_prescriber.py:540 and generate_weekly_program.py:716/914; grep controlled_tests in src/ and supabase/functions/: zero hits; generate-daily-brief/index.ts .from() list = daily_briefs, athlete_state, training_prescription, daily_tasks (lines 420-509); controlled_tests.py:47-51 docstring 'the brief surfaces it; completed when a new pst_tests row appears'.
- **Fix:** Surface weekly_plans.rationale/set_targets on Train or AthleteState, and add an active-controlled_tests query to generate-daily-brief (and/or a Today card) prompting the scheduled PST diagnostic / volume-tolerance test.
- **Verifier:** Fully confirmed, and slightly worse than stated. (1) weekly_plans (set_targets/frequency_targets/run_plan/rationale, generate_weekly_program.py:914-923) is read only by mpc_prescriber.py:540; zero hits in src/ or supabase/functions/. The engine_params.synthesis_state.weekly_targets mirror is also never read by the UI (grep weekly_targets in src/: zero hits), so there is no indirect surfacing; the …

### eng-contract.6 `weekly-schedule-cardio-toggle-localstorage-only` — ⚪ Low · 🟡 Needs review
- **Location:** src/pages/WeeklySchedule.jsx:118-132
- **Issue:** WeeklySchedule's cardio check-off writes a localStorage key (cardio_done_<uid>_<date>_<name>) instead of the cardio_completions table that PrescribedSessionCard uses, so the same prescribed run can show done on Today and not-done on the Schedule tab (and vice versa), and the check-off can never reach the engine or other devices.
- **Evidence:** WeeklySchedule.jsx:121-123 isCardioDone reads localStorage; PrescribedSessionCard.jsx:82 uses useCardioCompletions(today) which reads/writes the cardio_completions table (useCardioCompletions.js:19,46).
- **Fix:** Replace the localStorage helpers in WeeklySchedule with useCardioCompletions(format(selectedDay, 'yyyy-MM-dd')) so both surfaces share the DB-backed state.
- **Blast radius:** Converts a device-local flag into cardio_completions table writes shared with PrescribedSessionCard and any future engine reader.
- **Verifier:** Confirmed. WeeklySchedule.jsx:118-132 stores cardio check-offs in localStorage only (key cardio_done_<uid>_<date>_<name>, used at lines 377/388), while PrescribedSessionCard.jsx:82 uses useCardioCompletions which reads/writes the cardio_completions table (useCardioCompletions.js:19,36,44); the hook's own comment says it 'Replaces a localStorage-only flag', confirming WeeklySchedule was simply miss…

### eng-contract.7 `two-a-day-pill-unreachable-for-engine-days` — ⚪ Low · 🟡 Needs review
- **Location:** src/pages/WeeklySchedule.jsx:30 vs scripts/engine/session_generator.py:553-560 and scripts/generate_weekly_program.py:1005-1010
- **Issue:** dayType classifies TWO_A_DAY only when a cardio session has time_of_day === 'am'|'pm', but the engine never writes time_of_day on cardio_sessions (its dict is activity_type/run_type/zone/duration_minutes/pace/notes), and the weekly generator computes evaluate_two_a_day_split but discards the result ('no structural change needed'). Engine two-a-day days therefore always render as MIXED.
- **Evidence:** grep -rn time_of_day scripts/ --include=*.py returns zero hits; session_generator.py:553-559 builds the cardio dict without time_of_day; generate_weekly_program.py computes _split_2a/_split_reason and only prints them; WeeklySchedule.jsx:30 `runs.some(r => r.time_of_day === "am" || r.time_of_day === "pm")`.
- **Fix:** When evaluate_two_a_day_split returns true in generate_weekly_program.py, stamp cardio sessions with time_of_day: 'pm' (exercises are AM per the existing comment) before writing pw_row.
- **Blast radius:** Adds a field to the persisted program_workouts.cardio_sessions payload read by WeeklySchedule, WorkoutDetail and mpc_prescriber's run-slot lookup.
- **Verifier:** Reproduced end-to-end. _build_cardio (session_generator.py:552-559) returns dicts with keys [activity_type, run_type, zone, duration_minutes, pace, notes] and no time_of_day (verified by import-and-run in /tmp/optigains_verify); grep confirms no Python code ever writes time_of_day. generate_weekly_program.py:1010 computes evaluate_two_a_day_split (which returns (True,'high_volume_two_a_day') for 1…

### eng-contract.8 `deviation-tracker-double-counts-swap-source` — ⚪ Low · 🟡 Needs review
- **Location:** scripts/engine/deviation_tracker.py:106-112
- **Issue:** When two logged exercises both share a muscle with one un-logged prescribed exercise, the same prescribed movement is counted as the swap source for each of them, double-penalizing its exercise value from a single session (a 'swap is a one-off vote' by design).
- **Evidence:** Executed track_deviations with prescribed [Paused Bench Press, Overhead Press] vs logged [Bench Press, Incline Dumbbell Press] (exact UI log shape): dropped = {'Paused Bench Press': 2, 'Overhead Press': 1}; events show 'swapped Paused Bench Press → Bench Press' AND 'swapped Paused Bench Press → Incline Dumbbell Press' for the same date.
- **Fix:** Track consumed prescribed slots per log (remove a prescribed exercise from candidacy once matched as a swap source) in the loop at deviation_tracker.py:106-110.
- **Blast radius:** Alters the dropped-vote counts feeding the exercise-value learner, shifting next week's exercise selection weights.
- **Verifier:** Reproduced exactly: with prescribed [Paused Bench Press, Overhead Press] vs logged [Bench Press, Incline Dumbbell Press], track_deviations returns dropped={'Paused Bench Press': 2, 'Overhead Press': 1} and emits two 'swapped Paused Bench Press → ...' events for one date. The next() search at deviation_tracker.py:106-107 filters by 'p not in logged' but never consumes matched prescribed slots, so o…


---

## Verified clean

- src/pages/Train.jsx
- src/pages/Insights.jsx (no in-file findings; it is affected by mind-hideheader-padding-override via the embedded Mind component and by brief-coachtag-hardcoded-teal-rgba via DailyBriefCard)
- src/hooks/useDailyTargets.js (none of the three assigned pages bypass it; no independent daily-target computation found)
- src/components/ui/card.jsx (kit itself consistent; issues are at call sites)
- tailwind.config.js / src/index.css (tokens consistent; reviewed as context)
- src/components/nutrition/MacroGoalsEditor.jsx (composed by Profile — percent math and token usage clean)
- src/components/ui/card.jsx (CardContent default is pt-0; both pages use the correct pt-* pattern, no double/missing padding found)
- src/hooks/useDailyTargets.js (neither assigned page bypasses it — Profile edits the goal write-path, it does not render daily targets)
- CardContent padding pattern — scripted classification of all ~70 usages across src/: every bare <CardContent> is preceded by a CardHeader or sits in an empty-state Card with its own py-12; the kit default is pt-0 (src/components/ui/card.jsx:40) and no double-padding or flush-top violations exist
- Safe-area handling — src/components/Layout.jsx:221,245,259, src/components/ui/dialog.jsx, src/components/ui/FloatingActionButton.jsx, and FoodTracker sheets all use env(safe-area-inset-*) correctly; index.html viewport has viewport-fit=cover
- Inline hue styles — DraggableWorkoutCard FOCUS_HUES, AthleteState RECOVERY_HUES, Today/MetricTile/primitives all drive style colors from var(--hue-*) tokens (verified constant definitions); src/components/ui/system/helpers.js bandFor is fully token-driven
- Wide tables / horizontal overflow — ProgressContent.jsx and Progress.jsx tables are wrapped in overflow-x-auto; WorkoutDetail's table is w-full inside min-w-0 flex; the only large fixed width (FoodTracker.jsx:1092 w-[500px]) is gated behind hidden lg:flex
- Daily-target consumption in FoodTracker.jsx:217 and WeeklyPlanCard today-row (line 72) — both correctly consume useDailyTargets
- notes_parser robustness: empty string, None notes, None exercise notes, and logs=None all return the empty signal dict without exceptions (verified by execution)
- Misspelling case 'sholder pain on ohp': pain still cautions shoulders+triceps because 'ohp' resolves via muscle mapping; exercise-level variant also adds the Overhead Press exercise key (verified by execution)
- caution consumption path: notes -> CAUTION_PENALTY selection demotion (session_generator.py:705) and severity-2 accessory set-trim (session_generator.py:855), wired in BOTH generate_weekly_program.py:1001 and mpc_prescriber.py:661
- weakness consumption path: 'failed at lockout' on Bench Press -> {'bench': {'region':'lockout'}} (verified by execution) -> _pick_assistance targeting (session_generator.py:349, 774, 782, 824) in both weekly and daily runs
- sentiment/too_easy -> exercise_reward -> update_exercise_value Kalman posterior -> exercise_values selection bias (generate_weekly_program.py:726-754, session_generator.py:703-704); idempotency guard (already_ran) prevents same-week double-counting
- negation handling for the simple case: 'no pain today, felt strong' correctly yields no caution and too_easy=1 (verified by execution)
- flags are display-only by design: printed and embedded in the weekly notes string (generate_weekly_program.py:922), no program math reads them
- deviation_tracker.track_deviations true-swap path: prescribed A / logged B with shared muscle correctly yields chosen(B)=1, dropped(A)=1 and event 'swapped A -> B' (verified: Incline Bench Press -> Dip)
- learners.exercise_reward / update_exercise_value sign behavior: chosen vote -> +0.5 reward, drop vote -> -0.5 reward, Kalman update applies them to the named posterior with correct sign (verified by execution)
- canon() for alias-covered names: case/whitespace variants of the 15 ALIASES entries unify correctly ('BENCH PRESS', '  bench press ' -> 'Bench Press'; no false swap)
- generate_weekly_program.py:728-746 wiring: chosen/dropped counts from track_deviations are passed to exercise_reward under the matching canon key and guarded by the already_ran idempotency check (code read; DB calls not executed per rules)
- scripts/engine/muscle_map.py — get_muscles longest-keyword suppression behaves correctly for sequencing inputs; no sequencing role
- scripts/engine/program_synthesis.py — allocation-only (no day-adjacency constraints by design) and retired per generate_weekly_program.py:1052; allocator owns targets
- scripts/engine/session_generator.py:_decide_split upper_lower path — verified by 6-day simulation that consecutive identical upper/lower splits cannot occur (strict alternation upper_volume -> lower_squat -> upper_intensity -> lower_hinge), including under the ampk>0.55 and mtorc1<0.25 overrides
- scripts/engine/learners.py reward-sign directions: verified by execution — chosen vote +0.5 -> posterior +0.25, dropped -0.5 -> -0.25, liked +0.6 -> +0.30, disliked -0.6 -> -0.30, too-easy +0.3 -> +0.15, pain -1.5 -> -0.75; update_frequency rewards move the pulled arm in the reward's direction; update_mrv over-MRV branch (stall+sore -> down) and above-mean responding branch (-> up) are correct, and slope=None weeks leave the posterior untouched (n_obs unchanged)
- scripts/mpc_prescriber.py: read-only consumer of exercise_values (lines 623-660), performs no learner updates — no idempotency exposure
- scripts/compute_athlete_state.py: contains no exercise-value, MRV, or frequency posterior updates (grep clean)
- scripts/engine/deviation_tracker.py vote semantics: logged-but-not-prescribed -> chosen(+), prescribed-but-skipped/swapped-out -> dropped(-), verified by execution (apart from the case-sensitivity finding)
- already_ran guard coverage within generate_weekly_program.py sections 5b (exercise values), 6a (athlete_landmarks MRV + frequency bandit via empty MUSCLE_GROUPS loop), 6a-test (volume-tolerance step/schedule), 6a-pst (PST scheduler): all correctly gated; commit b96df7a4's reordering also fixed the prev_plans/prev_targets reads at lines 787-788
- scripts/engine/banister_kalman.py (from_dict({}) cold start, predict-only step, simulate_forward all verified by execution)
- scripts/engine/guardrail.py (empty hrv/rhr histories return UNKNOWN with None z-scores, verified)
- scripts/engine/rls_learner.py (empty buffer weekly_update, windup guard, from_dict({}) all safe)
- scripts/engine/vdot_engine.py (zero-duration/zero-HR runs skipped, empty runs return None, vdot=0 pace zones don't divide by zero — verified)
- scripts/engine/log_ingest.py (normalize_workout_logs([]) and goal_histories([]) safe; rep-range parsing defensive)
- scripts/engine/notes_parser.py and engine/deviation_tracker.py (empty/None inputs verified safe)
- scripts/engine/muscle_map.py (None/non-dict/non-numeric snapshots handled, verified)
- scripts/engine/allocator.py (plan_week with priors runs; marginal_value guards mav==mev and mrv==mav denominators)
- scripts/engine/resource_allocator.py
- scripts/engine/strength_progression.py (empty history -> HOLD, slope guards n<2 and den==0)
- scripts/engine/nutrition_modulator.py (modulate with kcal<=0, recommend_deficit with all-None signals safe)
- scripts/engine/phase_recommender.py
- scripts/engine/cellular_model.py (clipped Euler step, accumulator division guarded)
- scripts/engine/athlete_profile.py
- scripts/engine/session_generator.py (generate/SessionGenerator.generate executed with fully-empty state, empty weekly targets, None run_slot, empty-string session types — no crashes)
- py_compile: all 3 pipeline scripts + all engine modules compile clean; pyflakes (3.4.0 from wheel): only unused imports/variables, no undefined-name or use-before-assign findings
- Upsert idempotency verified clean for: athlete_state, engine_params, training_prescription (UNIQUE created_by,date), weekly_plans (created_by,week_start), athlete_landmarks (created_by,muscle), athlete_params (created_by,param_key), nutrition_overrides (created_by,date); controlled_tests plain inserts are read-guarded against retry duplication
- training_prescription core columns (mpc_prescriber.py:667-685 row) vs useTodayPrescription/PrescribedSessionCard reads — mpc_action, mpc_intensity, w_pst, w_str, rationale, interference_warning, interference{interference_level,anabolic_window}, overreach{overreaching}, prescription{session_type,split,strength_block[name,sets,reps,rir,load_lbs],calisthenics_block,swim_block} all match (run_block.pace excepted, see finding)
- athlete_state nested shape (compute_athlete_state.py:425-433,525-561,666-672,1290-1305) vs Today.jsx/AthleteState.jsx/useDailyTargets — recovery.{score,hrv,resting_hr,sleep_score,body_battery,hrv_trend}, fatigue.{tsb,acwr,interpretation}, nutrition.{phase,avg_calories_7d,avg_protein_7d,protein_target,weight_trend_lbs_per_week}, endurance.days_to_aug31, vdot_zones.{current_vdot,vdot_gap} all written and read consistently
- engine_params nested keys (kalman_state.tau_fit, rls_params.update_count, vdot_state.{vdot,vdot_history}, guardrail_state.{exploration_state,mrv_state.landmarks}) vs AthleteState.jsx:27-42,637 — verified against to_dict() of banister_kalman.py:204, rls_learner.py:149, vdot_engine.py:268, hypertrophy_volume.py:192 and save_engine_state
- notes contract: WorkoutDetail.jsx:455-470 combined PRE:/POST: session notes + ExerciseCard per-exercise notes (updateExerciseNotes, also wired in QuickWorkout) -> workout_logs.{notes,exercises[].notes}; mpc/weekly select log_date,exercises,notes; verified by executing parse_workout_notes on the exact UI shape (caution/too_easy/flags produced correctly, PRE:/POST: markers stripped)
- exercise swaps: handleReplaceExercise only renames the logged exercise; track_deviations correctly diffs program_workouts.exercises[{name,sets:int}] vs workout_logs.exercises[{name,sets:[{weight,reps,completed}]}] by local date string (verified by execution, modulo double-count finding)
- meal-plan check-offs: WeeklyPlanCard.jsx:185-193 writes food_entries planned:true; FoodTracker.jsx:566 check-off flips planned:false; compute_athlete_state.py:947-954 filters planned=not.is.true and reads calories/protein_grams/date — column names and semantics match
- soreness: SorenessCheckin.jsx (lowercase muscle vocab) and MorningCheckin.jsx (REGION_TO_MUSCLES expansion) write soreness_logs{date,muscle_group,level} and daily_readiness{date,checkin_date,soreness_snapshot} — match mpc_prescriber.py:379/515-528 and generate_weekly_program.py:596-600 readers, including the 0-3 -> 0-10 scale conversion at generate_weekly_program.py:602-609
- pst_tests (PSTTracker.jsx test_date upsert), body_weight_entries (WeighInModal weight/recorded_date), user_profiles.diet_phase (PhaseRecommendationCard), diet_phases (end_date is.null/start_date), nutrition_overrides.action='ease' column names — all match engine readers (date-value timezone issue excepted)
- mpc run-slot plumbing: program_workouts.cardio_sessions[0].run_type written by session_generator.py:554 and read back by mpc_prescriber.py:634-640 — matches

---

## Coverage gaps (not audited — flagged by completeness critic)

Spot-checks of "clean" items: Train.jsx (33 lines) and Insights.jsx (36 lines) are trivial wrappers — clean verdicts justified (Workouts.jsx:317 handles hideHeader correctly, unlike Mind). No false-clean found there. Genuine gaps:

1. Edge functions never audited: 11 functions in supabase/functions/ (garmin-activities-sync, garmin-sync, health-webhook, analyze-physique, usda-proxy, 5 push/reminder senders). generate-daily-brief was only touched as a contract reader; push-reminder timezone/scheduling and Garmin sync correctness are uncovered, despite multiple findings depending on garmin sync behavior.
2. Engine-side timezone never examined: all 3 pipeline scripts use datetime.date.today()/utcnow() (CI-runner timezone, likely UTC) while the UI keys days to getTodayString(profile.timezone) — athlete_state.date, training_prescription.date, and the weekly trigger (weekday()==6, generate_weekly_program.py:841/913) can be a day off from the user's day. UI got 4 timezone findings; the engine half of the same boundary got zero.
3. src/api/supabaseClient.js ships a large DEV auth-bypass/mock-data interception layer (line 14+, localStorage 'bypass_auth') — unaudited; worth one look that it cannot activate in prod builds.
4. Root cause not filed: three separate low findings cite "signOut never clears the react-query cache," but no finding targets AuthContext.jsx itself; grep confirms zero queryClient.clear()/removeQueries/resetQueries in src/ — the fix point is unrecorded.
5. Hooks audited only incidentally: useWorkoutSession.js (session resume/cancel semantics behind the QuickWorkout finding), usePlannedDayRebalance.js + src/config/dietPlans.js (the meal-plan generator itself), useTodayGarminCardio.js, usePushNotifications.js had no dedicated pass.
6. Route/auth guarding swept only by accident: ui-auth notes /login is unguarded for authenticated users (App.jsx:78) but no auditor verified protected-route coverage for all 25 pages or deep-link behavior when logged out.
7. Imbalance: FoodTracker.jsx is 2209 lines (largest page, primary daily surface) with 5 findings, vs 9+ for the 627-line Mind page — barcode/OpenFoodFacts flow (src/api/openFoodFacts.js), meal CRUD, and the planned-day rebalance interaction look under-covered.
8. scripts/ outside the engine: backfill_workout_logs.py, sync_vault_plan.py, garmin_sync_template.py, seed_garmin_token.py, scripts/migrations were outside all 6 engine auditors' scope.
9. No RLS/data-scoping dimension: nobody checked RLS policies or that created_by filters exist on every client query (the cache-key findings hint at multi-user leakage but DB-side isolation was never verified).

---

## Appendix — candidate findings rejected during verification

- **ui-workout-flows--prescribed-load-lbs-vs-profile-kg** (src/pages/QuickWorkout.jsx:62-66 (+ src/components/dashboard/PrescribedSessionCard.jsx:264)): Prescribed session weights come from the engine as `load_lbs` (always lbs) and are seeded directly into set.weight, but ExerciseCard labels the weight column with the profile's weight_unit. A kg-unit profile sees and logs the lbs number under a 'kg' label with no conversion — wrong display and a corrupted logged weight fed back to the engine.
  - _Rejected:_ Premise is wrong: engine load_lbs is not 'always lbs'. It is derived from current_e1rm (scripts/engine/session_generator.py:1122-1134), which compute_athlete_state.py:235 computes from the user's own logged workout_logs set weights with no unit conversion anywhere in scripts/engine/. The prescribe→seed→log→learn loop is therefore unit-agnostic: a kg-profile user logging kg produces kg e1RMs, kg prescriptions, and a kg number under the kg header — display and round-trip are consistent, no corruption. The proposed fix (divide seeded weight by 2.205 for kg profiles) would actively corrupt the loop, seeding ~45% of prescribed load and deflating future e1RMs, making it riskier than rated. Only residual issue is a cosmetic hardcoded 'lb' suffix at PrescribedSessionCard.jsx:54 and lbs-assuming GOAL_TARGETS, which is a different, low-severity finding.
- **ui-auth--auth-pages-hardcoded-token-values** (src/pages/Login.jsx:41-54,91-95; src/pages/ForgotPassword.jsx:35,47-50; src/pages/ResetPassword.jsx:56,68-71): All three auth pages hardcode hex/rgba values that duplicate (and in one case diverge from) the locked design tokens: inline background '#080B10' (token --color-bg is #0A0D12), text-[#F2F4F7] (= --text-primary, should be text-ink), inline color '#5EDCD2' (= --hue-teal, should be text-teal), text-[rgba(242,244,247,0.5)]/[0.38] (= text-ink-muted / text-ink-faint), plus arbitrary spacing pt-[18px], mb-[9px] in Login. These pin the pages permanently dark and will silently drift if tokens are retuned (light theme already retunes teal to #14A89D).
  - _Rejected:_ Issue is real (all cited hardcoded values verified, light theme retunes teal at index.css:107), but the fix is mis-rated green: a reachable light-theme toggle exists (ThemeContext.jsx/ThemeToggle.jsx), so swapping the pinned-dark bg/text to theme-following tokens visibly changes auth pages in light mode, and the suggested always-dark fallback would put light-mode text-ink (#171B22) on a hardcoded dark #080B10 field — a behavior/contrast change, not green.
- **ui-cross-cutting--weeklyplan-future-days-raw-engine-targets** (/home/nolan/projects/OptiGains/src/components/nutrition/WeeklyPlanCard.jsx:100-104): WeeklyPlanCard uses useDailyTargets for today but builds days 2-7 budgets from raw athlete_state.nutrition.recommended_intake — without the cut-rule protein clamp (1.2-1.5 g/lb) and fat floor that useDailyTargets applies. A plan approved for Thursday can be fitted to a different protein/calorie budget than the targets the user sees when Thursday arrives.
  - _Rejected:_ Finding's mechanism is inverted and largely non-operative. (1) The engine writes exactly one athlete_state row per run, dated TODAY (compute_athlete_state.py:1290-1307), so the per-date query in WeeklyPlanCard returns nothing for days 2-7; dayContext.targets[d] is undefined for future dates and lines 131-132 fall back to calTarget/proteinTarget — the CLAMPED values from useDailyTargets(today). Days 2-7 already run the clamped math; only TODAY can read the raw row. (2) The fat-floor claim is false: line 143 passes fatTarget from useDailyTargets (which includes the max(50, lb/3) floor) for all seven days; no raw fat is ever read. (3) Calories cannot diverge because useDailyTargets applies no calorie clamp — engineCal is used as-is in both paths. (4) The 'Thursday arrives' blast-radius scenario is explicitly mitigated by usePlannedDayRebalance, which rescales remaining planned rows to useDailyTargets(date).calories on the actual day. The only true residue is that TODAY's loop entry prefers raw nutrition.protein_target (just profile.daily_protein_goal echoed back by the engine, compute_athlete_state.py:610,670) over the cut-clamped protein — a one-day protein-fit nuance with no calorie impact, well below the rated medium/yellow. The proposed shared-helper fix would be harmless (green) but fixes a mechanism that doesn't exist for days 2-7.
- **eng-deviation-swaps--log-date-timestamp-mismatch** (/home/nolan/projects/OptiGains/scripts/engine/deviation_tracker.py:89-94 vs 82-84): pw_by_date keys are truncated to 10 chars (`str(...)[:10]`) but the log's date is used raw in `pw_by_date.get(d)`, so a timestamped log_date (e.g. '2026-06-08T18:30:00') silently matches nothing and the whole session is excluded from deviation learning. Latent today: workout_logs.log_date is a DATE column (migrations/add_workout_logs.sql:13) so PostgREST returns 'YYYY-MM-DD', but any future timestamp source breaks silently.
  - _Rejected:_ Technically accurate and fully reproduced (timestamped log_date yields empty deviations while plain date yields the swap vote; pw_by_date keys truncated at deviation_tracker.py:82 but log_date used raw at line 89). However, zero current impact: the sole caller (generate_weekly_program.py:708) feeds rows straight from PostgREST on workout_logs.log_date, a DATE column (add_workout_logs.sql:13), which always serializes as 'YYYY-MM-DD' regardless of what writers insert — Postgres coerces on write. No existing data path can produce a timestamped log_date, so the mismatch is purely latent hardening, not a live bug. The one-line fix is safe (no-op for all current inputs, cutoff comparison and event strings unaffected) and fine to apply opportunistically, but the finding does not hold up as an actual engine defect today.
- **eng-robustness--program-workouts-upsert-partial-unique-index** (/home/nolan/projects/OptiGains/scripts/generate_weekly_program.py:97-98,1032 and /home/nolan/projects/OptiGains/supabase/migrations/20260604000000_program_workouts_scheduled_date.sql:7-9): sb_upsert(program_workouts) uses on_conflict=program_id,scheduled_date, but the only matching index in the repo is a PARTIAL unique index (WHERE scheduled_date IS NOT NULL). Postgres cannot infer a partial unique index as an ON CONFLICT arbiter unless the statement includes the index predicate, which PostgREST never emits — so either every upsert fails with 42P10 (sb_upsert swallows it, prints ✗, and main() still exits 0 so CI looks green), or, if the index were dropped, a retry of the same week would duplicate rows. All other upsert targets I checked DO have full unique constraints: athlete_state/engine_params/training_prescription (created_by,date), weekly_plans (created_by,week_start), athlete_landmarks (created_by,muscle), athlete_params (created_by,param_key); controlled_tests uses plain inserts but is read-guarded by the active-test/should_schedule_pst queries, so retries don't duplicate.
  - _Rejected:_ No live impact — the claimed failure mode does not occur in production. The Postgres mechanics are correctly described (partial unique index in supabase/migrations/20260604000000 cannot be inferred as an ON CONFLICT arbiter by PostgREST's column-only on_conflict, verified sb_upsert swallows the 400/42P10 and main() exits 0 via mock repro in /tmp/optigains_verify/), but GitHub Actions logs of the real weekly runs (scheduled 2026-06-08, dispatch 2026-06-11) show every program_workouts upsert succeeding with ✓ — meaning the live DB has a full unique arbiter on (program_id, scheduled_date) applied out-of-band, exactly the MCP-patched-schema pattern the auditor's own evidence note anticipated. Neither branch of the finding's disjunction (42P10 on every upsert, or duplicate rows on retry) happens. The residual issue is repo/live schema drift, which is pre-existing and repo-wide: program_workouts has no CREATE TABLE anywhere in the repo, so migrations were never a rebuildable schema record regardless of this index. Recording the live constraint in a migration and exiting non-zero on failed upserts are worthwhile hygiene improvements, but as filed (medium/yellow, silent CI-green write failures) the finding is refuted by production evidence.
- **eng-robustness--exploration-manager-empty-parameters-argmax-crash** (/home/nolan/projects/OptiGains/scripts/engine/exploration_manager.py:74-78 (select_exploration_parameter) via generate_weekly_program.py:413-415 / mpc_prescriber.py:563-565): If the persisted exploration_state exists but lacks (or has an empty) 'parameters' list, from_dict builds a manager with zero arms; with probability epsilon (0.05-0.30) get_exploration_delta calls np.argmax on an empty array and raises ValueError, crashing the run nondeterministically. Both callers only fall back to MUSCLE_GROUPS when exploration_state is entirely falsy.
  - _Rejected:_ No impact: the argmax-on-empty crash is real in isolation but unreachable in production, doubly gated. (1) The epsilon branch never executes: each run rebuilds the manager via from_dict with a hard-coded seed (np.random.default_rng(seed=42) in __init__), and both callers (generate_weekly_program.py:689, mpc_prescriber.py:589 — only call sites repo-wide, neither in a loop) call get_exploration_delta exactly once per process; the first seeded draw is 0.7740 > max epsilon 0.30, so select_exploration_parameter always returns None before reaching argmax. Reproduced the production pattern (fresh manager from corrupted {'parameters': []} state, single call, steps 0-100): zero crashes. The auditor's evidence (50 sequential draws on one instance, crash at draw 4 where the seeded stream yields 0.0942) does not match any caller's usage. (2) The empty-parameters precondition cannot arise from the system's own persistence: initial state always uses {'parameters': MUSCLE_GROUPS}, to_dict round-trips non-empty parameters, and compute_athlete_state.py:1267 only copies the dict; it would require externally corrupted DB state. Side note for the auditor: the same seed-42/single-call mechanics mean the exploration bandit never fires at all in production (verified 0/200 simulated runs) — a distinct dead-feature bug worth filing separately. The proposed one-line guard is harmless but fixes a non-occurring crash.
- **eng-contract--engine-reads-missing-created-by-filter** (scripts/mpc_prescriber.py:358-393 and scripts/compute_athlete_state.py:933-996): mpc_prescriber reads engine_params, athlete_state, pst_tests, soreness_logs, user_profiles ('limit 1'), and workout_logs with no created_by filter; compute_athlete_state likewise reads workout_logs, recovery_metrics, food_entries, body_weight_entries, pst_tests, garmin_activities unfiltered. The UI writes all these tables per-user (created_by) and the app has multi-user features (friendships table, leaderboard in supabaseClient.js:366-380), so with the service key the engine can ingest another user's rows and compute state from them.
  - _Rejected:_ Misread: both mpc_prescriber.py (sb_get, lines 150-151) and compute_athlete_state.py (sb_get, lines 113-115) inject created_by=eq.{USER_ID} into every query centrally inside the sb_get helper ('always filtering by created_by=USER_ID' per its docstring), so the cited call sites are filtered even though they don't pass the param. Reproduced with a mocked urlopen: every cited query (engine_params, user_profiles limit 1, workout_logs, garmin_activities, etc.) emits a URL containing created_by=eq.<USER_ID>. The 'contrast' with generate_weekly_program.py is explained by that script's sb_get NOT injecting the filter, which is why its call sites pass created_by explicitly. USER_ID is guaranteed non-empty (env var or resolved at import with sys.exit(1) on failure). The proposed fix is a no-op.
- **eng-contract--ease-today-utc-date-mismatch** (src/components/dashboard/EaseTodayButton.jsx:15,33-35 vs scripts/compute_athlete_state.py:1174-1178): EaseTodayButton derives 'today' from new Date().toISOString().slice(0,10) (UTC) while the rest of the app uses getTodayString(profile.timezone) (local). A US-evening tap (e.g. 20:00 CDT) writes nutrition_overrides.date = tomorrow's UTC date, so the engine row for the user's intended day (already computed for the runner's date.today()) never sees ease_today=true, and the day it does apply to is one the user didn't choose.
  - _Rejected:_ Refuted. The auditor assumed the engine's datetime.date.today() (compute_athlete_state.py:1176) reflects the user's local day, but the engine runs on GitHub Actions ubuntu-latest — a UTC clock (verified: daily-engine.yml, gh run list shows daily scheduled runs ~12-14 UTC) — and on a secondary local cron at 10:00 MDT where local date == UTC date. So the button's UTC date (EaseTodayButton.jsx:15) is exactly the convention the engine matches; there is no mismatch. Reproduced in /tmp/optigains_verify/test_dates.py: an evening tap (20:00 MDT) writes tomorrow's UTC date and the next engine run (UTC runner) matches that same date — ease_today=true IS applied on the next run, which is the documented contract (component comment and UI copy both say 'recalcs on the next engine run'; the rough day's targets were computed that morning and have no later scheduled run under any date convention). The proposed fix (getTodayString(profile.timezone)) is a regression: simulation shows an evening tap would then write a date no future engine run ever matches, silently disabling the recovery valve in its primary use window, while changing nothing for daytime taps. The only real wart (taps between ~10:00 and 18:00 local are read by no run) exists identically under both conventions and is not the bug described.
