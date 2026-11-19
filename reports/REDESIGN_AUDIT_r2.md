# OptiGains redesign audit r2

Auditor: fresh-eyes, 2026-11-19. Device: Playwright WebKit, iPhone 13 Pro Max (428x926 @3x), dark, test athlete via ?bypass_auth=true. Base: main @ fd9b1df.
Screenshots: /Users/nolan/NolanBrain/.claude/loop/optigains-redesign/shots-r2/*.png (scripts: reports/shoot-r2.mjs, reports/shoot-r2b.mjs). All 33 PNGs were opened and graded. Full-page captures show the fixed dock partway down the page. That comes from the capture method and is not a finding. document.scrollWidth was 428 on every route, so no route scrolls horizontally.
Excluded: known e2e failures from before the redesign (baseline-failures.md). Not captured: the Today check-in sheet. Today is a rest day, so there is no Start button (same as r1).

## r1 findings: status

| r1 finding | Status | Evidence |
|---|---|---|
| Today: weight rate above "No trend yet" | Fixed | today.png: no rate caption, only "No trend yet" |
| Today: readiness 68 with "No verdict yet" | Fixed (new issue below) | today.png: "Train, but hold intensity moderate today." |
| Today: no primary | Fixed | today.png: "Log a workout" is the only filled button |
| Today: vitals repeat inputs | Fixed | today.png |
| Today: date eyebrow band | Fixed | today.png: shared header with title and date |
| Train: rest day has two primaries | Not fixed | train.png: the "Today's session" card is still filled white, and "Log recovery" is also filled. On train-programs.png it sits next to a filled "Build a program". |
| Train: activity volume twice | Fixed | train-activity.png |
| Train: programs CTA case / light titles | Partial | train-programs.png: "Build a program" is fixed. Program titles still render in a light weight, and tags are title case ("Buds Prep"). |
| Train: "Show  8  more" spacing | Not fixed | train-library.png, train-activity.png ("Load  8  more · 57 left") |
| Fuel: kcal basis truncated | Fixed | fuel.png: the basis wraps to two lines |
| Fuel: six secondary buttons | Fixed | fuel.png: now a single list group |
| Fuel: empty week strip | Fixed | fuel.png: a single empty line |
| Fuel body: trend contradiction | Not fixed | fuel-body.png: "Smoothed trend of 26 weigh-ins, no rate yet: the last 7 days n..." is truncated. The next line reads "Only 1 weigh-in in the last 30 days" above "1W +1 lbs, 1M +1 lbs", and Metabolism shows "Weight trend -- Needs 2 or more weigh-in..." (also truncated). |
| Fuel body: "Log Weight" / weigh-in entry points | Partial | Case is fixed. There are now three weigh-in entry points: the Today inline row, the quick-add sheet and Fuel body "Log weight". |
| Fuel body: seed notes truncate delta | Fixed | The delta now shows before the note |
| Hydration: "5 G" | Not fixed | fuel-hydration.png |
| Lifts: 94-row list, duplicate title | Fixed | lifts.png: search plus "Show more (74)" |
| Lifts: "--/4wk" | Partial | lifts.png: "0 / 4wk" still shows, plus a new false reading (see below) |
| Physique: model voice | Fixed | physique.png |
| Physique: title, chip fade, video placeholders | Partial | Title and fade are fixed. History is still 12 identical "Video" placeholder tiles. |
| Weekly schedule: title twice | Fixed | |
| Weekly schedule: two routes, two looks | Not fixed | weekly-schedule.png has no session card or sub-tabs. Train > Schedule has both. |
| Program detail: bodyweight "0 lb Stalled" | Fixed | program-detail.png |
| Program detail: double back | Fixed | |
| Program detail: stacked warnings | Fixed | One warning per lift |
| Program builder: labels case | Fixed | |
| Program builder: Import JSON in header | Not fixed | program-builder.png. The header title is also title case ("Program Builder"). |
| State: Stalled vs rate | Partial | athlete-state.png: Squat is fixed ("Slowing"). Bench is badged "Stalled" with the chip "ADD LOAD NEXT SESSION", which contradicts it. |
| State: red badge | Fixed | Warn hue |
| State: ISO stale date | Partial | Now reads "As of Jul 1 ... Refresh". The numbers under it are still presented as current (see High) |
| State: LOAD READY unexplained | Partial | Now "ADD LOAD NEXT SESSION", typed in caps, with no basis given |
| Recovery: two sync CTAs | Fixed | recovery.png |
| Recovery: readiness disagrees with Today | Partial | Same 68 on both. Today shows it in teal with no date. Recovery shows it in amber "Moderate", "Last computed Jul 1". |
| Dock grows tabs per route | Fixed | 5 fixed tabs on every route |
| Brief history: empty state / "Desktop Agent" | Partial | "Desktop Agent" is gone. The empty state is still bare and left-aligned, while Analyze uses a centered card with an icon disc. |
| Analyze: triple title | Fixed | insights.png |
| Mind: title twice, Mind dock tab | Fixed | mind.png |
| Career: title, tabs, empty card | Partial | Title is fixed. Tabs are now uppercase pills, still a different style from State's sentence-case pills. An empty band sits above the tabs on Career and Mind. |
| Coach: title, duplicate intro | Fixed | coach.png |
| Profile: back + dock, Sign Out, streak | Partial | "Sign out" and the streak are fixed. The back chevron, centered title and dock are still there. |
| Login: OPTIGAINS | Fixed | login.png: Gauge plus "OptiGains" |
| Logger: Finish primary at 0/1 | Fixed | logger.png: Finish is outlined |
| Logger: bodyweight hint | Fixed | |
| Logger: duplicate add row | Fixed | |
| Sheets: add-food grabber, mixed icon discs | Not fixed | sheet-add-food.png has no grabber. sheet-quick-add-menu.png still mixes filled and dark discs, and its labels are title case ("Quick Workout", "Log Food", "Weigh In"). |

## Review criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Named token scale only | PASS | 0 `text-[Npx]` in src (only an index.css comment). The only hex in JSX is a comment at StrengthSection.jsx:46. |
| 2 | Gauge mark in header/favicon/PWA/apple-touch, "OptiGains" spelling | PASS | The Gauge is in the mobile header on every tab page, plus login.png. No typed "OPTIGAINS" anywhere. |
| 3 | No "!", "successfully", cheerleading | PASS | Grep finds only comments. "nice work" is absent. |
| 4 | Engine numbers carry basis (Today, Train, Fuel) | FAIL | Fuel body trend basis is truncated and contradictory (fuel-body.png). Today readiness has no date even though it was computed Jul 1 (today.png vs recovery.png). Today kcal "1,800 left" has no basis line (Fuel has one). Lifts shows "-222.7 / 4wk" (lifts.png). |
| 5 | One primary, one-thumb, no h-scroll, dock never overlaps | FAIL | No horizontal scroll on any route. Train shows two filled primaries on schedule, programs and every tab, because the session card is filled white (train.png, train-programs.png). |
| 6 | Consistent header/card/list/empty/loading/error | FAIL | Two tab styles: uppercase pills (Train, Fuel, Career, Mind, Programs sub-toggle) vs sentence pills (State group, Analyze). Two empty-state treatments (insights.png centered card vs brief-history.png bare). Detail headers use a centered title with back (Profile, Program, Program Builder, Brief History) while every other screen uses the left title and date. That one is acceptable for pushed routes, but Profile is a top-level destination. |
| 7 | No src file over 1,200 lines | PASS | WorkoutDetail.jsx 1,189 and Today.jsx 1,079. Over 1,200 are only data files (exerciseDB.js, equipmentProfiles.json). |
| 8 | Restore invariant intact; e2e green | NOT VERIFIED HERE | No commits touch workoutSessionFlag.js or useWorkoutSession.js since 8cbd0fd. The gate is owned by integration. The logger restored an in-progress session at 2:43:15 (logger-start.png). |
| 9 | Screenshots of every route reviewed | PASS | 33 PNGs in shots-r2, all opened |

## Screens

### Today: B+ (today.png, today-fold.png)
- High: readiness 68 is presented as today's verdict in teal with no date. Recovery shows the same 68 as "Last computed Jul 1" in amber "Moderate". A months-stale engine number shown as current breaks "shows its working". Fix: add "as of <date>" to the basis line when the date is not today, and use one hue (teal per brand decision) on both screens. Files: src/pages/Today.jsx (readiness block), src/pages/RecoveryDetail.jsx.
- Med: Nutrition "1,800 left" has no basis line, while Fuel says "saved goal. No check-in, using defaults." Reuse the Fuel basis string. src/pages/Today.jsx.
- Med: the weigh-in entry is now in three places (Today inline, quick-add sheet, Fuel body). Today's inline row prefills 181 and has a dim Log button. Keep the quick-add sheet as the one entry point and turn the Today row into a link. src/pages/Today.jsx.
- Low: "View Past Briefs" is title case. src/components/dashboard/DailyBriefCard.jsx.

### Train (schedule/library/programs/activity): B- (train*.png)
- High: two filled primaries on every tab. The "Today's session" card is filled white even on a rest day, and the page also shows "Log recovery" or "Build a program" filled. Make the session card a secondary or outline row on rest days or when another primary is visible. src/pages/Train.jsx (session card).
- Med: past program titles are light weight and tags are title case ("Buds Prep"). Train programs tab component.
- Low: "Show  8  more · 25 left" / "Load  8  more" has odd spacing and two different verbs. Library and activity pager.

### Fuel food: A- (fuel.png, food-tracker.png)
- Med: /food-tracker renders Fuel without the Food/Body/Hydration tabs or Week plan, so one destination has two looks. Redirect /food-tracker to /fuel. src/App.jsx routes (or FoodTracker page wrapper).

### Fuel body: C (fuel-body.png)
- High: the trend basis contradicts itself and truncates. "Smoothed trend of 26 weigh-ins, no rate yet: the last 7 days n..." sits above "Only 1 weigh-in in the last 30 days", above "1W +1 lbs, 1M +1 lbs". Metabolism says "Weight trend -- Needs 2 or more weigh-in...". Fix: use one state from one source, wrap rather than truncate, and hide 1W/1M deltas when the trend is null. Files: src/pages/Progress.jsx and the metabolism card component.
- Med: the "Last logged 181.5 lbs" sheet hint disagrees with history "181 lbs" (rounding). Show one precision. The weigh-in sheet component.

### Fuel hydration: B (fuel-hydration.png)
- Med: "5 G" is still uppercased. Drop the uppercase on the dose input. src/pages/Supplements.jsx (or its component).

### Lifts: B- (lifts.png)
- High: "Chest-Supported Row 324 lbs, -222.7 / 4wk" is a false e1RM change. Clamp or hide the change when the 4-week window has under 2 data points, and hide "0 / 4wk". src/pages/Lifts.jsx.

### Physique: B (physique.png)
- Med: history is 12 identical "Video" placeholder tiles. Show thumbnails or a compact row list. PhysiqueTracker history component.
- Low: the body fat basis line truncates ("Jun 15, 2..."). Let it wrap.

### Weekly schedule: B- (weekly-schedule.png)
- Med: this is the same content as Train > Schedule with a different look. Redirect /weekly-schedule to /train?tab=schedule. src/App.jsx routes / WeeklySchedule.jsx.

### Program detail: B+ (program-detail.png)
- Low: "Ready to progress" rows truncate their basis ("1 session at current weight · a..."). Let it wrap to two lines. ProgramDetail progression row.

### Program builder: B (program-builder.png)
- Med: the header title is title case ("Program Builder") and Import JSON still competes in the header. Change to "New program" and move Import into an overflow. src/pages/ProgramBuilder.jsx.

### Athlete state: C+ (athlete-state.png)
- High: every tile is engine output from Jul 1 presented as live. "Days to PST 61, Aug 31 deadline" is a countdown to a date already past on Nov 19. Fix: when the state is older than 2 days, dim the tiles and show the stale state as the primary message with Refresh. Never show a countdown to a past date. Files: src/pages/AthleteState.jsx, src/components/athlete/*.
- Med: Bench is "Stalled" at -1.9 lbs/wk yet the chip says "ADD LOAD NEXT SESSION". The chip contradicts the badge, gives no basis, and is typed in caps. StrengthSection.jsx.
- Low: "Strength Goals" is title case, and the purple Physique icon tile uses a hue that is not a datum.

### Recovery: B (recovery.png)
- Med: readiness is amber here and teal on Today (see Today High). "Training Load (ACWR)" and "Current Ratio" are title case. RecoveryDetail.jsx.

### Brief history: C+ (brief-history.png)
- Med: the bare left-aligned empty state differs from Analyze's centered card. Use the shared EmptyState. The header is title case ("Brief History"). BriefHistory.jsx.

### Analyze: B (insights.png)
- Low: tab labels are title case ("Daily Brief", "Brief History"), and "View Past Briefs" is too.

### Mind: B (mind.png)
- Med: an empty band sits between the header and the tabs (same on Career). Purple section icons use a hue that is not a datum. Mind.jsx.

### Career: B (career.png)
- Med: same empty band above the tabs. Career.jsx.

### Coach: B+ (coach.png)
- No new findings.

### Profile: B (profile.png)
- Med: the back chevron and centered title remain on a top-level destination reached from the avatar menu. Use the shared left header. Profile.jsx.

### Account menu: B+ (sheet-account-menu.png)
- Low: the menu overlaps the readiness card with no scrim. Acceptable for a popover. No icons, which is consistent.

### Login: A- (login.png)
- No findings.

### Workout logger: A- (logger.png, logger-start.png, sheet-keypad.png)
- Low: "Add Exercise" is title case. ExerciseCard / logger body.

### Sheets: B (sheet-add-food.png, sheet-weigh-in.png, sheet-quick-add-menu.png, sheet-keypad.png)
- Med: quick-add labels are title case ("Quick Workout", "Log Food", "Weigh In", "Create Workout", "Stream Note"), and the icon discs mix filled and dark. Quick-add menu in Layout.jsx.
- Low: the Add-food sheet still has no grabber. FoodTracker add-food sheet.

## Fix list by file ownership (non-overlapping)

1. Today + Recovery readiness: src/pages/Today.jsx, src/components/dashboard/*, src/pages/RecoveryDetail.jsx. Readiness as-of date and one hue, kcal basis line, weigh-in row to link, "View past briefs", sentence case on Recovery labels.
2. State overview: src/pages/AthleteState.jsx, src/components/athlete/*. Stale-state treatment, no past-date countdown, Bench badge vs chip, basis, case, icon hue.
3. Fuel body + hydration: src/pages/Progress.jsx, the metabolism and weigh-in components, src/pages/Supplements.jsx. One trend state, wrap the basis, hide deltas, weigh-in precision, "5 G".
4. Lifts + Physique: src/pages/Lifts.jsx, src/pages/PhysiqueTracker.jsx and its components. Clamp the 4-week change, hide "0 / 4wk", history tiles, wrap the basis.
5. Train: src/pages/Train.jsx and its tab components (schedule, library, programs, activity). Session card demoted, program title weight, tag case, pager copy.
6. Routes: src/App.jsx route table only. /food-tracker to /fuel and /weekly-schedule to /train?tab=schedule.
7. Program: src/pages/ProgramDetail.jsx, src/pages/ProgramBuilder.jsx. Header title, Import to overflow, wrap the basis.
8. Shell: src/components/Layout.jsx (quick-add menu labels and discs), the shared SubTabs component (one tab style, sentence case, everywhere), and the shared EmptyState.
9. Secondary pages: src/pages/BriefHistory.jsx, Insights.jsx, Mind.jsx, Career.jsx, Profile.jsx. Adopt the shared EmptyState/SubTabs, remove the band above the tabs, Profile header, title case.
10. Logger + add-food sheet: logger body "Add exercise", and the FoodTracker add-food sheet grabber (no session-flag or useWorkoutSession changes).

## Summary
r1 Highs: 15, of which 11 fixed, 1 not fixed (Fuel body), and 3 partially fixed with the remainder raised again. Open Highs now: 5 (Today readiness staleness, Train two primaries, Fuel body trend, Lifts false change, State stale data and past-date countdown). Criteria failing: 4, 5, 6.

Verdict: FAIL
