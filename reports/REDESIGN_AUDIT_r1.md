# OptiGains redesign audit r1

Auditor: fresh-eyes, 2026-11-18. Device: Playwright WebKit, iPhone 13 Pro Max (428x926 @3x), dark. Base: main @ 8cbd0fd.
Screenshots: reports/redesign-r1/*.png (scripts: reports/shoot*.mjs). Full-page captures render the fixed dock mid-page; that is a capture artifact, not a finding.
Graded from the screenshots; code is cited only to locate fixes. Known pre-redesign e2e failures (baseline-failures.md) are excluded.

## Review criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Named token scale only | PASS | 0 arbitrary `text-[Npx]` in JSX; the only hex in JSX are in comments (ConfirmDialog.jsx:50, DailyBriefCard.jsx:65, TodayActions.jsx:11, StrengthSection.jsx:46). index.css:686 mentions text-[11px] only in a comment. |
| 2 | Gauge mark in header/favicon/PWA/apple-touch; "OptiGains" everywhere | FAIL | Favicon/PWA/apple-touch present (index.html:32-34, public/manifest.json name "OptiGains"). Mobile header has no Gauge on any page (reports/redesign-r1/today.png, reports/redesign-r1/fuel.png); Logo only renders in the lg: sidebar (Layout.jsx:391). Login types the name as "OPTIGAINS" eyebrow (reports/redesign-r1/login.png), against BRAND_GUIDE "Not OPTIGAINS in body copy". |
| 3 | No "!", "successfully", cheerleading | PASS | No user-facing hits; "successfully" only in comments (QuickWorkout.jsx:498, WorkoutDetail.jsx:852). "nice work" string no longer present. |
| 4 | Engine numbers carry basis in one line (Today, Train, Fuel) | FAIL | Today readiness 68 carries inputs but says "No verdict yet" (reports/redesign-r1/today.png); Today weight card shows "-1.4 lbs/wk · on goal" directly above "No trend yet. It needs 2 weigh-ins" (Today.jsx:623 vs 933). Fuel kcal basis is truncated "1,800 kcal: saved goal. No check-i..." (reports/redesign-r1/fuel.png). Program detail shows "0 lb Stalled" for bodyweight lifts (reports/redesign-r1/program-detail.png). |
| 5 | One primary action, one-thumb, no h-scroll, dock never overlaps | FAIL | Today has no primary (Log a workout, Log food, Detail x2, View Past Briefs all secondary) (reports/redesign-r1/today.png). Fuel food tab has 6 equal-weight secondary buttons (reports/redesign-r1/fuel.png). Recovery has two sync buttons (reports/redesign-r1/recovery.png). Logger header styles Finish as primary at 0/1 sets (reports/redesign-r1/logger.png). No horizontal scroll observed; Physique pose chips clip at the edge (reports/redesign-r1/physique.png). |
| 6 | Consistent header/card/list/empty/loading/error | FAIL | Page title rendered twice on Schedule, Lifts, Physique, Mind, Career, Coach, Analyze, Profile (reports/redesign-r1/weekly-schedule.png etc.). Four tab styles: uppercase pills (Train/Fuel/Mind), sentence pills (State), underline tabs (Career), segmented (Fuel body). Dock changes per route (5 tabs, 6 with Analyze or Mind) (reports/redesign-r1/brief-history.png, reports/redesign-r1/mind.png). Header variants: date subtitle on Train/State, none on Fuel/Career/Today, centered back-title on Profile/Program/Brief History. Empty states: three different treatments (dashed card reports/redesign-r1/career.png, icon-in-circle card reports/redesign-r1/insights.png, bare left-aligned reports/redesign-r1/brief-history.png). |
| 7 | No src/ file over 1,200 lines | PASS (with note) | Only src/ml/exerciseDB.js (3,060) and src/data/equipmentProfiles.json (1,807) exceed, both data, not components. All named giants are split. |
| 8 | Restore invariant intact; e2e green | NOT VERIFIED HERE | Audit did not run the gate (serial e2e owned by integration). Logger start/add flow worked in WebKit (reports/redesign-r1/logger.png, reports/redesign-r1/sheet-keypad.png). |
| 9 | Screenshots of every route reviewed | PASS | 33 PNGs in reports/redesign-r1, all opened. |

## Screens

### Today: C (reports/redesign-r1/today.png)
- High: contradictory weight card: "-1.4 lbs/wk · on goal" above "No trend yet". Hide rate caption when trend is null. Today.jsx (~600-640, 917-933).
- High: readiness 68 shown big while text says "No verdict yet"; Recovery page shows "-- Unknown" for the same day (reports/redesign-r1/recovery.png). One source, one state. Today.jsx readiness block + RecoveryDetail.jsx.
- High: no primary action. Make the session button the one primary (bg-brand) and drop "Quick actions / Log food" (duplicates dock +). Today.jsx, components/dashboard/TodayActions.jsx.
- Med: Vitals grid repeats the readiness Inputs line verbatim. Remove one. Today.jsx.
- Med: date eyebrow "WED 18 NOV" sits in its own band while other tab pages put the date under the title. Use the shared header. Today.jsx, Layout.jsx.

### Train (schedule/library/programs/activity): B- (reports/redesign-r1/train*.png)
- Med: "Today's session · Check in, then start." primary on a rest day where the page also offers "Log recovery" as a second primary. One primary per state. Train.jsx, components schedule rest card.
- Med: Activity cards repeat the volume number twice (hero and grid). Drop VOLUME cell. Train activity card component.
- Med: Programs empty CTA "Build a Program" title case; program titles render light weight unlike every other card title. Train programs tab component.
- Low: "Show  8  more · 25 left" odd spacing. Library/activity pager.

### Fuel food: C+ (reports/redesign-r1/fuel.png)
- High: kcal basis line truncated with ellipsis; the basis is the point. Wrap to two lines. Fuel food summary component (FoodTracker split).
- High: six equal-weight secondary buttons (Templates, Recipes, Meal ideas, Copy a day, Intake stats, Edit goals) under the log. Collapse into one "More" row/list; keep per-meal Add as the action. FoodTracker components.
- Med: week strip shows 7 empty dashed boxes with "0"; reads as broken. Show a single empty line when the week has no logs.

### Fuel body: C (reports/redesign-r1/fuel-body.png)
- High: "Smoothed trend of 26 weigh-ins" then "Not enough weigh-ins in this range" and Metabolism "Weight trend --". Contradictory engine state. Progress.jsx:229 and metabolism card.
- Med: "Log Weight" title case and an expander chevron; weigh-in already exists as a sheet (reports/redesign-r1/sheet-weigh-in.png). Use one entry point.
- Med: history rows show raw seed notes truncated ("OVN-weighin..."). Fine for test data, but truncation should not eat the delta.

### Fuel hydration: B (reports/redesign-r1/fuel-hydration.png)
- Med: supplement dose renders "5 G" (unit uppercased by CSS). Remove uppercase on the input. Supplements component.
- Low: two different "add" vocabularies (+100ml chips, Add supplement, Log). OK.

### Lifts: C (reports/redesign-r1/lifts.png)
- High: 94 lifts in one unbroken list (18,834 px tall page) with no search, grouping or pagination; title duplicated in header and hero. Add search + "Show more" like Library; remove hero title. Lifts.jsx.
- Med: most rows show "--/4wk"; show the basis only when it exists.

### Physique: C+ (reports/redesign-r1/physique.png)
- High: model voice in user copy: "The subject appears lean with visible muscle definition." Replace with flat measured line or remove. PhysiqueTracker components.
- Med: duplicated title; pose chips clip off the right edge without a fade; history grid is 12 identical "Video" placeholders. Show thumbnails or a compact list.

### Weekly schedule: C+ (reports/redesign-r1/weekly-schedule.png)
- Med: "Schedule" title twice. WeeklySchedule.jsx hero.
- Med: same screen as Train > Schedule; two routes, two looks. Redirect or share component.

### Program detail: C (reports/redesign-r1/program-detail.png)
- High: "0 lb · Stalled" on bodyweight lifts (Pull-up Pyramid, Push-up Pyramid, Hanging Leg Raise) is a false engine reading. Show reps or hide load for bodyweight. ProgramDetail.jsx:~490-505.
- Med: two back affordances (header chevron and "Back to Workouts"). Remove the inline one. ProgramDetail.jsx.
- Med: amber warning boxes stacked twice with near-identical RIR advice. Merge.

### Program builder: B (reports/redesign-r1/program-builder.png)
- Med: field labels title case with asterisks ("Program Name *", "Cycle Length *") vs sentence case everywhere else. ProgramBuilder step components.
- Low: Import JSON competes in the header; move to overflow.

### Athlete state: C (reports/redesign-r1/athlete-state.png)
- High: all three lifts "Stalled" in red while Squat shows "+9.9 lbs/wk" and "ETA 32d". Badge and rate disagree; red is not the datum hue. StrengthSection.jsx, athleteShared.jsx:7.
- Med: "As of 2026-07-01" ISO date, months stale, shown without a refresh path. AthleteState.jsx:79.
- Med: "LOAD READY" chip unexplained (no basis line).

### Recovery: C (reports/redesign-r1/recovery.png)
- High: two sync CTAs (primary "Sync wearable" and secondary "Sync") on one screen; readiness "-- Unknown" contradicts Today 68. RecoveryDetail.jsx.

### Brief history: C+ (reports/redesign-r1/brief-history.png)
- High (shared): dock grows a 6th "Analyze" tab on this route only. Layout.jsx dock config (lines ~18-80).
- Med: empty state left-aligned bare text vs centered card elsewhere; "Desktop Agent" is an internal system name.

### Analyze/Insights: C+ (reports/redesign-r1/insights.png)
- Med: header says "Analyze", eyebrow "Daily brief", hero "Analyze" again. One title. Insights.jsx.

### Mind: C+ (reports/redesign-r1/mind.png)
- Med: title twice; dock shows a Mind tab only here. Mind.jsx, Layout.jsx.
- Low: placeholder ends in "...".

### Career: C+ (reports/redesign-r1/career.png)
- Med: title twice, header has no date unlike siblings, underline tabs unlike the rest, dashed empty card unique to this page. Career.jsx.
- Low: "No applications yet." with period vs other empty titles without.

### Coach: B- (reports/redesign-r1/coach.png)
- Med: title twice and two stacked intro paragraphs saying the same thing. Coach.jsx.

### Profile: B- (reports/redesign-r1/profile.png)
- Med: back chevron plus dock (it is a top-level destination from avatar); title twice. "Sign Out" title case. "0 STREAK" contradicts brand ("no streak shaming"). Profile.jsx.

### Login: B (reports/redesign-r1/login.png)
- Med: typed "OPTIGAINS" eyebrow; use the Wordmark component or "OptiGains". Login.jsx.

### Workout logger: B (reports/redesign-r1/logger.png, reports/redesign-r1/logger-add-exercise.png, reports/redesign-r1/sheet-keypad.png)
- Med: Finish styled as primary at 0/1 sets; primary should be the set check until something is logged. QuickWorkout/WorkoutDetail header component.
- Med: Coach hint "Staying at 0 lbs" for a bodyweight lift (same bodyweight bug). ExerciseCard components.
- Med: inline "Exercise name / Add / x" row duplicates "Add exercise". Low clarity.
- Keypad sheet: A-. Clean, large, exact.

### Sheets: B+ (reports/redesign-r1/sheet-add-food.png, reports/redesign-r1/sheet-weigh-in.png, reports/redesign-r1/sheet-quick-add-menu.png)
- Low: Add-food sheet has no grabber while weigh-in does; quick-add menu mixes filled and outlined icon discs.
- Not captured: Today check-in sheet (rest day, no Start button).

## Fix list by file ownership (non-overlapping)

1. Layout + shared header: src/components/Layout.jsx, header/PageHeader component, src/components/Logo.jsx: Gauge in mobile header; one header pattern (title + date); fixed 5-item dock on every route (Mind/Analyze reached from State or avatar); remove in-page hero titles via a shared prop.
2. Today: src/pages/Today.jsx, src/components/dashboard/*: weight card contradiction, readiness verdict, single primary, dedupe vitals.
3. Fuel food: src/components/food-tracker/* (FoodTracker split), src/pages/FoodTracker.jsx: basis wrap, action consolidation, empty week strip.
4. Fuel body + hydration: src/pages/Progress.jsx, Supplements.jsx and body components: trend contradiction, single weigh-in entry, "5 G".
5. State group: src/pages/AthleteState.jsx, src/components/athlete/*, src/pages/RecoveryDetail.jsx: Stalled vs rate, red badge, stale date, single sync, readiness source.
6. Lifts + Physique: src/pages/Lifts.jsx, src/pages/PhysiqueTracker.jsx (+ components): search/pagination, model voice, chip fade.
7. Program: src/pages/ProgramDetail.jsx, src/pages/ProgramBuilder.jsx (+ components): bodyweight 0 lb, double back, labels case.
8. Logger: src/pages/QuickWorkout.jsx, WorkoutDetail.jsx header, ExerciseCard components (no session-flag/useWorkoutSession changes): Finish emphasis, bodyweight hint.
9. Secondary pages: Mind.jsx, Career.jsx, Coach.jsx, Insights.jsx, BriefHistory.jsx, Profile.jsx, WeeklySchedule.jsx, Login.jsx: duplicate titles, tab style, empty-state component, copy case, streak, OPTIGAINS.
10. Train: src/pages/Train.jsx and its tab components: rest-day primary, activity volume dup, programs case.

## Summary
High findings: 15. Criteria failing: 2, 4, 5, 6.

Verdict: FAIL
