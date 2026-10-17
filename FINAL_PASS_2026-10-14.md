# Final on-device pass, 2026-10-14

Code under test: branch `friction-fixes-2026-10-13` at `18d352c`, built to a scratch outDir and served on
127.0.0.1:4179. Simulator `og-sim` (iPhone 13 Pro Max, iOS 27), own Appium on :4724, keyboard harness
`ios-sim/run-kbd.mjs` via `ios-sim/run-final.sh`, flows `ios-sim/flows/final-*.json`, screenshots
`ios-sim/out-final/<run>/` (untracked). Test account `optigains-sim-test@example.invalid` only. No `src/`
edits, no commits.

Harness note: my Appium and preview server were killed externally three times mid-run (another session
or the usage cutoff); `ios-sim/ensure-final.sh` restarts them. Not an app issue.

## Part 1: late fixes

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Kebab: "Cancel entire workout" visible without scrolling | PASS | Menu shows all 8 items incl. red "Cancel entire workout" with separator. `out-final/01/09-kebab-open.png` |
| 2 | Add Food: header + close X stay visible with keyboard up | **FAIL (partial)** | Sheet lifts above the keyboard and 5+ results are visible, but the header and X are ~174 CSS px above the visible area. Measured with keyboard up: `visualViewport.offsetTop=109`, `height=459`, `innerHeight=781`, `--keyboard-inset=213px`, close button `top=-196`. `out-final/02/01-banana-kb-up.png`, `06/*` |
| 3 | Barcode: no keyboard behind the scanner | PASS | Scanner opened from Fuel's camera button: `activeElement=BODY`, `--keyboard-inset=0px`; "Type the barcode number" + Look up + "Fill in by hand" render. `out-final/05/01-scanner-open.png` |
| 4 | Ranking: "banana" / "chicken breast" lead with raw/plain | banana PASS, chicken breast **PARTIAL** | "banana": Bananas, raw first; dehydrated sinks to 6th. "chicken breast": no breaded/0-kcal row first, but deli/roll/sliced cuts (roll oven-roasted, deli rotisserie, fat-free mesquite, oven-roasted fat-free sliced) rank 1-4 and "Chicken, breast, boneless, skinless, raw" is 5th. `out-final/04/03-*.png` |
| 5 | Pick scrolls Amount into view; "Bananas, raw" case kept | PASS | Amount input at `top=408px` after pick; food name value `Bananas, raw`. `out-final/03/02-after-pick.png` |
| 6 | Base-values label reads as total | PASS | "The values below are the total for 100 g and rescale when you change the amount." |
| 7 | Tap a result while keyboard is up | PASS | Single tap selected the result and dismissed the keyboard. `out-final/03` |

## Part 2: previously uncovered flows

| Flow | Result | Notes |
|---|---|---|
| Recipe create (name, ingredient, servings, save) | PASS | Typed "Final Pass Bowl", servings 2, ingredient Kbd Test Bowl (451 kcal): header 451, per serving 226 = 451/2. Card: "226 cal P15.3 C27.5 F6.2", "1 Ingredients · 2 Servings". `out-final/14` |
| Log recipe | PASS | Log dialog defaults Meal Type by time (lunch at 1 PM), servings, macros; entry "Final Pass Bowl (Recipe)" 226/15/28/6, header and row agree; appears in Recent. `out-final/15`, `16` |
| Edit recipe | **FAIL** | "Edit recipe" opens an empty "Create Recipe" form. See bug 1. `out-final/22/03-edit-open.png` |
| Delete recipe | **BLOCKED** | No delete control exists on the mobile (compact) recipe card, only Edit and Log. See bug 2. Cleaned up through the test account's own API session instead. |
| Program Builder steps 2-4 (typed) | PASS with friction | Typed name "Final Pass Program" (step 1, "28 TOTAL DAYS"), step 2 day editor, exercise "Back Squat" (3 x 10, rest 90, +5/session), step 3 progression preview, step 4 Confirm ("1 of 7 days", "Ready to save: 1 training days, 1 exercises"). Abandoned via Cancel, nothing saved. See bugs 8-10. `out-final/30c`, `31`, `32`, `33` |
| Profile text field (Display Name) | PASS | Typing shows Cancel / Save Changes bar; Cancel restores the original; Save persists across reload; reverted to exactly `TEST ACCOUNT (ios-sim clone)` and verified after reload. `out-final/42`-`47` |
| Stream Note typing + capture | PASS | Quick add -> Stream Note -> typed -> Capture: toast "Captured to Second Brain inbox" above the dock. Row removed afterwards. `out-final/50b/03-note-captured.png` |
| Copy a day | PASS | Picked Eggs and Nutricost Dextrose from Sep 9, "Copy 2 to 2026-10-14": Breakfast 323 kcal (210 + 113), 8:00 AM stamp, remaining 1,251 left = 1,800 - 226 - 323. `out-final/21` |
| Entry delete + Undo toast | PASS | "Entry deleted" with Undo; Today back to 1,800 left. `out-final/23b` |
| 429 path | NOT HIT | Search runs this pass triggered no rate-limit message; cached repeat searches. |

## New bugs (ranked)

1. **HIGH, recipe Edit is broken.** `src/components/nutrition/RecipeBuilder.jsx:92-95` `handleEdit` calls
   `setEditingRecipe(recipe); setShowCreateDialog(true)`, but `setShowCreateDialog` (`:66-70`) does
   `if (v) setEditingRecipe(null)`, so the recipe is cleared in the same batch and the dialog opens as an empty
   "Create Recipe". Fix: remove `if (v) setEditingRecipe(null);` from `setShowCreateDialog`. The close paths
   (`onOpenChange(false)`) already null it, and "New" arrives with `editingRecipe` already null.
2. **HIGH, no way to delete a recipe on mobile.** The compact card (`RecipeBuilder.jsx:~100-150`, used in the
   Fuel "Templates & Recipes" sheet) renders only Edit (pencil) and Log; `handleDelete` is only wired to the
   desktop card's "Recipe options" menu (`:356`). Fix: add a delete action (confirm dialog already exists at
   `:175`) to the compact card or inside the Edit dialog.
3. **MEDIUM, Add Food header/X scrolled off with keyboard up** (Part 1 #2). Cause: `DialogContent` max-height
   (`src/components/ui/dialog.jsx`) subtracts `--keyboard-inset` from `100dvh` but ignores
   `visualViewport.offsetTop` (iOS scrolls the page by 109px). Fix: publish `--vv-height` (and `--vv-top`) in
   `Layout.jsx`'s keyboard effect and use `maxHeight: calc(var(--vv-height, 100dvh) - 1rem)` on the sheet.
4. **MEDIUM, ranking still favours processed cuts for multi-word queries.** `FoodTracker.jsx` `rank()` treats
   `startsWith("chicken breast,")` as rank 1 so "Chicken breast, roll/deli/sliced" beat "Chicken, breast,
   boneless, skinless, raw". Fix: add `deli|sliced|roll|prepackaged|rotisserie|seasoned|luncheon|smoked|cured`
   to `PROCESSED`, and give a `raw` description containing all query words (any order) rank 1.
5. **LOW, "Copy a day" shows a raw ISO date:** dialog title "Copy a day to 2026-10-14" and button
   "Copy 2 to 2026-10-14" (`FoodTracker.jsx:~4015`, `~4081`). Fix: format with `format(parseISO(...), "EEE, MMM d")`.
6. **LOW, "1 Ingredients":** `RecipeBuilder.jsx:~131` always pluralises. Fix: `ingredient{n !== 1 ? "s" : ""}`.
7. **LOW, empty-state copy mismatch:** sheet says "Use the + button to create your first recipe" next to a
   button labelled "+ NEW"; desktop copy (`RecipeBuilder.jsx:202`) says "New Recipe". Align the wording.
8. **MEDIUM, Program Builder step 2: the day editor opens below the fold.** Tapping a day opens "Editing
   Exercises" at the bottom of the page; its first row, "No exercises yet" and "Add Exercise" sit under the
   sticky Back/Next bar and Safari chrome with no auto-scroll. Fix: `scrollIntoView({block:"start"})` on the
   editor panel when a day is selected (`ProgramBuilder.jsx`, Step 2 component, ~`:940-1100`).
   `out-final/31/06-day1-editor.png`.
9. **LOW, Program Builder day cards overlap "Day N" and "Rest"** in the 4-up first row (text collision) and
   say "Click or drop to add" on a touch device. Fix: stack the label with a gap / `leading-tight`, and use
   "Tap to add" when `(pointer: coarse)`.
10. **LOW, Program Builder Cancel discards the whole draft without confirmation** from any step (including
    Confirm); also "1 training days, 1 exercises" pluralisation on step 4. Fix: confirm-on-cancel when the
    draft has any content; pluralise.
11. **LOW, Create Recipe: ingredient quantity controls are clipped under the sticky Save bar** after adding
    the first ingredient (needs a scroll to adjust).
12. **LOW, tapping Display Name puts the caret at the start of the text** on iOS when tapped near the left
    edge, so typed text lands before the existing name; expected iOS behaviour, noted because it made the
    revert fiddly (select-all-on-focus like Amount would avoid it).
13. **INFO, still present on this branch:** Coach card on an empty Quick Workout says "Machine Incline Press:
    RIR 0.0 and e1RM trending down over 3 sessions. Staying at 270 lbs" (engine-no-deload change is on a
    different branch).

## Not covered

- A real USDA 429 (not triggered, by design).
- Recipe delete and a working recipe edit (blocked by bugs 1 and 2); the edit fix could not be verified
  because the branch is read-only for this pass.
- Barcode camera scanning (simulator has no camera); the typed-number path was exercised in the earlier
  re-check (Coca-Cola, 5449000000996), not repeated here.
- Emoji and true paste through the soft keyboard.

## Test-account state

- Deleted: the "Final Pass Bowl" recipe, the logged recipe entry, the two copied entries, the Stream Note
  capture row. Display Name reverted exactly. No program was created. Today shows 1,800 kcal left.
- Left behind: custom food "Kbd Test Bowl" (earlier runs), a Bench Press 320 x 5 workout log from the earlier
  re-check, and an empty in-progress Quick Workout (created by opening /quick-workout; harmless, restores
  silently).
- Servers: my Appium (:4724), WDA (:8101) and the preview server (:4179) are shut down; worktree untouched
  (HEAD `18d352c`).
