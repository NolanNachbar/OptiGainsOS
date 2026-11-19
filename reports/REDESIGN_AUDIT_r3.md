# OptiGains redesign audit r3

Auditor: fresh-eyes, 2026-11-19. Device: Playwright WebKit, iPhone 13 Pro Max (428x926 @3x), dark, test athlete via ?bypass_auth=true. Base: main @ 40c63b4.
Screenshots: /Users/nolan/NolanBrain/.claude/loop/optigains-redesign/shots-r3/*.png (scripts: reports/shoot-r3.mjs, shoot-r3b.mjs, shoot-r3c.mjs). All 33 PNGs opened. document.scrollWidth = 428 on every route, so nothing scrolls horizontally. Full-page captures show the fixed dock mid-page; that is a capture artifact, not a finding.
Redirects verified: /food-tracker -> /fuel, /weekly-schedule -> /train?tab=schedule.
The test data ends around Jul 1 2026, so stale states are expected. Graded on whether they are presented honestly.
Not captured: the Today check-in sheet. It is a rest day, so there is no Start button. Excluded: baseline-failures.md.

## r2 findings: status

| r2 finding | Status | Evidence |
|---|---|---|
| High Today readiness shown as current, teal | Fixed | today.png: neutral grey 68, "As of Jul 1. Inputs: ...", "Last reading Jul 1. Check in or sync for today's call." |
| Med Today kcal has no basis | Fixed | today.png: "1,800 kcal: saved goal. No check-in, using defaults." |
| Med weigh-in in three places / Today inline row | Not fixed | today.png still has the inline "Weigh in lbs Log" row |
| Low "View Past Briefs" | Fixed | "View past briefs" |
| High Train two filled primaries | Fixed | train.png, train-programs.png: the session card is now an outline row. Only "Log recovery" or "Build a program" is filled. |
| Med program title weight / tag case | Fixed | train-programs.png: medium-weight titles, "Buds prep" |
| Low pager spacing / two verbs | Partial | Spacing is fixed. It still says "Show 8 more" (library) and "Load 8 more" (activity). |
| Med /food-tracker two looks | Fixed | Redirects to /fuel |
| High Fuel body trend contradicts and truncates | Fixed | fuel-body.png: one consistent "No rate yet" state that wraps. The 1W/1M deltas are gone, and Metabolism uses the same sentence. |
| Med weigh-in precision | Fixed | sheet-weigh-in.png "Last logged 181.0 lbs" matches history "181.0 lbs" |
| Med "5 G" | Fixed | fuel-hydration.png "5 g" |
| High Lifts false -222.7 / 4wk | Fixed | lifts.png: no change column. The subtitle states the 4-week basis. |
| Med Physique 12 "Video" tiles | Fixed | physique.png: a compact row list with pose and date |
| Low body fat basis truncates | Fixed | Wraps to two lines |
| Med /weekly-schedule two looks | Fixed | Redirects to Train > Schedule |
| Low program detail basis truncates | Fixed | program-detail.png: wraps to two lines |
| Med Program builder title / Import in header | Fixed | program-builder.png: "Program builder", Import is in the overflow menu |
| High State stale data as live, past countdown | Fixed | athlete-state.png: "State is 141 days old ... last-known values, not today's" with Refresh. PST shows "Passed, Aug 31 deadline". |
| Med Bench Stalled vs ADD LOAD chip | Fixed | "Hold load until e1RM recovers" plus a basis line |
| Low "Strength Goals", purple tile | Fixed | "Strength goals", and the Physique tile is neutral |
| Med Recovery hue / title case | Fixed | recovery.png: neutral 68, "Training load (ACWR)", "Current ratio" |
| Med Brief history empty state / title | Partial | Title is fixed ("Brief history"). The empty state is still bare and left-aligned, while Analyze uses a centered card. |
| Low Analyze tab case | Partial | Tab still reads "Daily Brief" |
| Med Mind band, purple icons | Fixed | mind.png |
| Med Career band | Fixed | career.png |
| Med Profile back/centered header | Fixed | profile.png uses the shared left header |
| Low logger "Add Exercise" | Fixed | logger.png "Add exercise" |
| Med quick-add labels case / mixed discs | Fixed | sheet-quick-add-menu.png: sentence case, all dark discs |
| Low Add-food grabber | Fixed | sheet-add-food.png |

All 5 r2 Highs are fixed.

## Review criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Named token scale only | PASS | 1 `text-[Npx]` match in src, the index.css comment (unchanged from r2) |
| 2 | Gauge mark, "OptiGains" spelling | PASS | Gauge in every tab header and on login.png. "OPTIGAINS" appears only in an index.css comment. |
| 3 | No "!", "successfully", cheerleading | PASS | No user-facing hits seen in any screen |
| 4 | Engine numbers carry basis (Today, Train, Fuel) | PASS | Readiness as-of plus inputs, kcal basis, trend state, logger "Prefill basis", program progression basis, Bench basis |
| 5 | One primary, one-thumb, no h-scroll, dock clear | PASS | One filled action per screen. scrollWidth 428 everywhere. |
| 6 | Consistent header/card/list/empty/loading/error | FAIL (Med only) | Uppercase pill toggles remain (Programs ACTIVE / MY PROGRAMS, Activity ALL / STRENGTH / CARDIO) next to sentence-case tabs everywhere else. Brief history and Career use bare left-aligned empty states, while Analyze and Programs use the centered card. |
| 7 | No src file over 1,200 lines | PASS | Largest is WorkoutDetail.jsx at 1,189. Only data files are larger. |
| 8 | Restore invariant; e2e green | NOT VERIFIED HERE | Owned by the integration gate. The logger restored the in-progress session (logger-start.png). |
| 9 | Screenshots of every route reviewed | PASS | 33 PNGs in shots-r3, all opened |

## Screens

- Today: A- (today.png, today-fold.png). Med: the inline weigh-in row (dim "Log", empty field) duplicates the quick-add Weigh in. Make it a link row to the sheet. src/pages/Today.jsx.
- Train schedule/library/programs/activity: B+. Med: the uppercase ACTIVE / MY PROGRAMS and ALL / STRENGTH / CARDIO toggles. Use the shared SubTabs in sentence case. Train programs and activity tab components. Low: "Show 8 more" vs "Load 8 more". Pick one verb.
- Fuel food: A- (fuel.png). No new findings.
- Fuel body: B+ (fuel-body.png). Low: the history note "OVN-weigh..." is test data. Not a finding.
- Fuel hydration: A- (fuel-hydration.png). No findings.
- Lifts: B+ (lifts.png). Low: the "--" e1RM for Leg Press (only 0-rep sets) has no reason given. Show "No reps logged". src/pages/Lifts.jsx.
- Physique: A- (physique.png). Low: the pose chip row fades at the right edge mid-word ("Side ches"). Acceptable as a scroll affordance.
- Program detail: A- (program-detail.png). Low: the description uses an em dash ("primary — all lifts"). That is user data, so no action.
- Program builder: A- (program-builder.png). No findings.
- Athlete state: A- (athlete-state.png). Low: "ETA 32d" on Squat is projected from data 141 days old. Hide ETAs while the state is stale. src/components/athlete/StrengthSection.jsx.
- Recovery: A- (recovery.png). No findings.
- Brief history: B- (brief-history.png). Med: use the shared centered EmptyState. Low: the "Daily Brief" tab is title case. src/pages/BriefHistory.jsx, src/pages/Insights.jsx.
- Analyze: B+ (insights.png). Low: the "Daily Brief" tab case (same fix).
- Mind: A- (mind.png). No findings.
- Career: B+ (career.png). Med: same bare empty-state pattern as Brief history. src/pages/Career.jsx.
- Coach: A- (coach.png). No findings.
- Profile: A- (profile.png). Low: rows are title case ("Body & Nutrition", "Training Focus"). src/pages/Profile.jsx.
- Account menu: A- (sheet-account-menu.png). No findings.
- Login: A (login.png). No findings.
- Workout logger: A- (logger-start.png, logger.png, sheet-keypad.png). Low: "Prefill basis: last session 225 lbs x 0" prefills 0 reps. Fall back to the prescribed reps when the last value is 0. ExerciseCard prefill (do not touch the session flag or hook).
- Sheets: A- (sheet-quick-add-menu, sheet-add-food, sheet-weigh-in, sheet-keypad). No findings.

High count: 0.

## Fix list by file ownership

1. src/pages/Today.jsx: turn the weigh-in row into a link to the quick-add sheet.
2. Train tab components (programs toggle, activity filter, pagers): use the shared SubTabs in sentence case and one pager verb.
3. Shared EmptyState adoption: src/pages/BriefHistory.jsx, src/pages/Career.jsx. Insights.jsx: "Daily brief" tab.
4. src/components/athlete/StrengthSection.jsx: hide ETAs while the state is stale.
5. src/pages/Lifts.jsx: give a reason for "--".
6. src/pages/Profile.jsx: sentence-case row labels.
7. Logger ExerciseCard prefill: handle 0-rep prefill (no session-flag changes).

Verdict: PASS
