# OptiGainsOS Keyboard-Typing and Fix Verification Audit - 2026-10-13

Method: iOS Simulator `og-sim` (iPhone 13 Pro Max, iOS 27), own Appium on :4724 (WDA :8101), driver
`ios-sim/run-kbd.mjs` (runner `ios-sim/run-kbd.sh`, label lister `ios-sim/kbd-labels.py`, flows
`ios-sim/flows/kbd-*.json`, screenshots `ios-sim/out-kbd/<run>/`, untracked). Code under test: branch
`friction-fixes-2026-10-13` (built into a scratch outDir, served on 127.0.0.1:4177). Test account
`optigains-sim-test@example.invalid` only. No `src/` edits, no commits.

## A. Keyboard typing: what was wrong and the working recipe

Typing now works (yes). It types through the real iOS soft keyboard, with autocorrect and QuickType on.

What made it unreliable before:

1. `el.addValue()` relied on the tapped element; web inputs in Safari do not report keyboard focus, so
   it often typed into nothing or the wrong field.
2. iOS 27 changed the keyboard accessibility tree. Letters/digits/punctuation are `XCUIElementTypeKey`,
   but **shift and Return are `XCUIElementTypeButton`** (outside the `XCUIElementTypeKeyboard` node on
   some pages). The page-switch key is `name="more"` with `label` = the page it goes *to*
   (`numbers` / `letters`). On the numbers page the shift button's label becomes `symbols`, and on the
   symbols page it becomes `numbers`, so "is there a `numbers` key" does not identify the letters page.
   `&` has name `ampersand`. Labels turn uppercase while shifted/auto-capitalised.
3. iOS flips pages by itself (back to letters after punctuation), so cached page state goes stale.
4. The accessory bar (up/down chevrons + check) is not "Done" by name: it is a toolbar Button
   labelled `Done` reported `visible=false` but tappable. `driver.hideKeyboard()` does nothing in Safari.

Recipe (in `run-kbd.mjs`, `typeSoft`):

- Find keys with a class chain scoped to the keyboard
  (`**/XCUIElementTypeKeyboard/**/*[`label == "x" AND visible == 1`]`), falling back to a Button
  predicate for `shift`, `return`, `symbols`.
- Detect the letters page by the presence of `q`/`Q`, the digits page by `1`; poll and switch pages
  immediately before each char. Letters: try the label as typed (handles auto-cap), else tap `shift` once.
  Non-letters: try the current page, then `numbers`, then `symbols`.
- Dismiss with the toolbar `Done` button; delete with the `delete`/`Delete` key; for the app's own
  keypad sheet use `btn` taps (`Next field`, `Backspace`, digits).
- Caveats that are iOS, not app bugs: double space inserts ". " (a title typed with a trailing double
  space saved as `Kbd Typed Workout.`), and the sheet scrolls under the keyboard so coordinates move; the
  `focus` step scrolls a field into the 110-540pt band before tapping.

## B. Pass/fail on the 9 fix verifications (branch `friction-fixes-2026-10-13`)

| # | Fix | Result | Evidence |
|---|---|---|---|
| 1 | Reps required to complete a set | PASS | Toast "Enter reps before completing the set", set stays unchecked. `out-kbd/52/05-reps-zero-complete.png` |
| 2 | Weight cap notice at >2000 | FAIL (keypad path) | Typing 99999 on the keypad silently shows/stores 2000; no "Weight capped" notice appeared in the dump or screenshot. Toast exists only in the inline-input path (`ExerciseCard.jsx:500-502`); the keypad path only clamps the display (`:1603`). `out-kbd/53/01-cap-typed.png` |
| 3 | Create Workout inline errors | PASS | "Give the workout a title." under the field, "Exercise 1 needs a name." in the card; no native bubble. `out-kbd/60/01-empty-save.png` |
| 4 | One-tap log: Undo, triple tap logs once, meal by time | PASS | Three synchronous clicks on a Recent chip logged once (total 944 = 451 + 493); toast has Undo and Undo restored the total; 8 PM entries defaulted to Dinner. `out-kbd/40`, `out-kbd/41b` |
| 5 | Edit Food Entry leads with name/meal/amount | PASS | Search/describe collapsed; Food Name, Eating now/Logging earlier, Meal Type, Amount in the first screen. `out-kbd/42/02-edit-sheet.png` |
| 6 | Resume a second program pauses the first | PASS | Toast "Program resumed. Your other active program was paused"; header and Active 1 name the new program, old one under Past. Restored afterwards. `out-kbd/73` |
| 7 | Finish recap toast | PASS (PRs not exercised) | "Workout logged / 1 set · 1,080 lbs volume · 4 min", sticky with close button. No PR set this session so PR text is unverified. `out-kbd/55` |
| 8 | Manage menu caption and training-day totals | CAPTION PASS, TOTALS FAIL | Caption "Pause keeps your progress and frees the schedule." present. Totals regressed: program detail shows `10/1755 workouts · 1%` and "135 training days per cycle" while the Programs card shows `10 / 91 sessions`. `ProgramDetail.jsx:256-258` counts every entry in `program.workouts` (135, all cycles) as one cycle's training days, then multiplies by 13 cycles. `out-kbd/71/04-detail.png` |
| 9 | Quick-workout caption under weekly ring | PASS | "Today's quick workout isn't part of the program we..." under 0/7. `out-kbd/55/04-finish-b.xml` |

## C. Friction and bugs found while typing, ranked

### High

1. **"Estimate" (Describe it) gives no feedback and fills nothing.** Typed "8 oz grilled chicken
   breast", tapped Estimate, waited 9 s: no result, no error, Manual Entry fields still empty
   (Food Name blank, calories 0). Either the edge function failed silently or the result never
   renders. Fix: show a loading state and an error toast; populate Manual Entry and expand it on
   success. `out-kbd/82`, `out-kbd/83/04-manual-after-est.png`. (Not confirmed whether the edge
   function itself errored; the UI shows nothing either way.)
2. **USDA search burns the 200/hour proxy quota fast and the error message is wrong.** Each query is
   2-4 proxy calls (generic + branded, plus tier-3 retry) after a 300 ms debounce
   (`FoodTracker.jsx:~400-461`); the proxy limits 200/user/hour (`usda-proxy/index.ts:42-54`). After
   about a dozen searches the UI says "Could not reach the food database." with a Retry button that can
   never succeed, instead of the proxy's "Rate limit exceeded. Try again in an hour." Fix: surface
   `err.error` from `callProxy`, skip Retry on 429, cache by query, and debounce longer or search on
   submit. `out-kbd/24d/04-fail-step17.png`.
3. **Program detail totals regression** (see B8): 1755 vs 91. Fix: count distinct training days in
   one cycle (e.g. unique `day_index` with exercises) rather than all `program.workouts`.
4. **Weight cap is silent on the keypad** (see B2). Fix: toast from the keypad commit path too.

### Medium

5. **Search results are mostly hidden behind the keyboard.** With the keyboard open only about 3 of 6
   results are visible and taps on rows under the accessory bar do nothing; the user must tap the
   toolbar check first. Fix: shrink the results area to the visual viewport (`--keyboard-inset`),
   or dismiss the keyboard on scroll. `out-kbd/21c/02-search-typed.png`.
6. **Result ranking is poor.** For "chicken breast" the first result is "Lunchmeat, chicken breast,
   sliced - 0 kcal / 100g, P 0 C 0 F 1" (bad data); plain raw chicken breast is 4th. Fix: rank exact/
   prefix and common foods first, drop 0-kcal rows.
7. **Create Workout stores the title untrimmed.** The Delete Workout dialog quotes
   `" Kbd Typed Workout. "`. Custom food names are trimmed, workout titles are not. Fix: trim on save.
8. **Add Food form: Amount and Meal are below the fold and the layout jumps.** After picking a result
   or opening manual entry, Meal Type/Amount need a scroll under the sticky Add Food bar; typing the
   first calorie value inserts a "TOTAL FOR 1 SERVING" block that pushes the macro fields down about
   330 pt, so a tap aimed at Protein hits empty space. Fix: reserve the totals block's height, or put
   Meal/Amount above the fold. `out-kbd/31b/06-fail-step25.png`.
9. **Existing amount is not selected on focus.** Tapping Amount "100" requires three Backspaces before
   typing a new number. Fix: select-all on focus.
10. **Toast covers the dock and persists.** The success/Undo toast sits on top of the dock icons
    (Today/Train/+/Fuel hidden behind it) and the post-add "Food logged successfully!" toast is partly
    clipped by the dock. Fix: offset toasts by `--dock-total-height`. `out-kbd/41/02-toast.png`.
11. **Activity and Today disagree.** Activity shows "THIS WEEK 9 sessions (7 strength, 2 cardio)" while
    Today shows "Weekly training 0/7" the same day. Different windows (rolling vs program week) with no
    explanation. `out-kbd/95/02-activity.png`, `out-kbd/55/04-finish-b.xml`.
12. **Barcode "Enter manually" does not offer manual barcode entry.** Camera error ("Could not start
    camera: Invalid constraint", expected in the simulator) offers Enter manually, which just returns to
    the Add Food sheet; there is no field for typing a barcode number. Also the keyboard stays open
    behind the camera-error screen. `out-kbd/90/01-barcode-path.png`, `out-kbd/91/03-fail-step11.png`.

### Low

13. While the keyboard is open the Add Food sheet scrolls up so its header and close X sit under the
    status bar, and the X is half clipped. `out-kbd/21c/02-search-typed.png`.
14. Exercise-name combobox: suggestion text is very low contrast and "bench" surfaces a single
    "Bench Press"; the focused input draws a square focus ring over a rounded field.
    `out-kbd/61/03-exercise-typed.png`.
15. Number formatting is mixed in a meal row: header "451 / 31 / 55 / 12" vs row "451 30.5 55 12.3"
    for the same entry (calories typed 450.5, fat 12.25). `out-kbd/31d/08-after-add.png`.
16. Library now lists finished quick workouts as library items ("Quick Workout - Bench Press", two
    entries). Probably intended as re-runnable sessions, but they sit next to authored workouts.
17. On this branch the Coach card still advises "Machine Incline Press: RIR 0.0 and e1RM trending
    down ... deload" on Quick Workout; the `engine-no-deload-2026-10-13` change is not in
    `friction-fixes`. (Cross-branch note, not a bug in this branch.)
18. The login screen with the keyboard open: the iOS Passwords/accessory strip overlaps the Password
    label until the field scrolls into place; login typing, Save Password prompt, and Return-to-submit
    all work. `out-kbd/10b/03-login-password-keyboard.png`.

## D. Not covered (be honest)

- Recipe creation (RecipeBuilder), Copy a day, Program Builder steps 2-4, Profile text fields, and
  Stream Note typing were not completed: the USDA quota was exhausted by earlier typing runs (so the
  recipe-ingredient search was unavailable), and time ran out. Recipe, builder and Profile flows
  should be rerun with `run-kbd.sh` now that typing works; recipes need the quota to reset.
- Emoji and true paste could not be driven through the soft keyboard (only typed characters).
- PR text in the finish recap was not exercised (no PR in the test session).

## E. Cleanup state of the test account

- Food entries (Chicken Breast, Pork Loin, Kbd Test Bowl) deleted; Today shows 0 kcal logged.
- Workout "Kbd Typed Workout." deleted. Program state restored (Powerlifting HF active,
  Strength + BUD/S Conditioning paused).
- **Left behind:** custom food "Kbd Test Bowl" in My Foods (no delete control found), and one Quick
  Workout log (Bench Press 135 x 8, 1,080 lbs, 4 min) in Activity/Library. Both are in the clone only.
