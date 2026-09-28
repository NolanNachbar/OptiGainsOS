# Overnight audit report — 2026-09-28

Branch `overnight-audit-2026-09-27` (not pushed). Harness: `ui-audit/overnight/` (RUNBOOK.md, state.json, per-area outputs under `areas/`). Regression tests: `npm run test:e2e` (needs `npm run dev`).

## Bugs fixed
| Area | Bug | Commit | Regression test |
|---|---|---|---|
| Workout logger | A fat-fingered weight (1710 for 171) saved with no check. Now a one-time "are you sure" per exercise when a weight is far above your recent weight or the field max | f541e685 + 03c2dc26 | e2e/train-logger-weight-typo-guard.spec.mjs |
| Workout logger | Deleting a completed set had no undo. Now an Undo toast restores it in place | 61a59c5f + 03c2dc26 | e2e/train-logger-delete-set-undo.spec.mjs |
| Fuel | Logging food after midnight while Fuel stayed open silently saved to yesterday. Now the date re-derives while you're viewing today (review caught it rolling mid-edit and moving an open entry to the new day — fixed) | 5331532b + 07010071 | e2e/fuel-midnight-rollover.spec.mjs |
| Fuel | Rows with null protein/carbs/fats showed blank instead of 0 | efa40480 | e2e/fuel-null-macros-render-zero.spec.mjs |
| Fuel | A 10x serving typo (e.g. 10000g instead of 1000g) saved silently at 57,900 kcal. Now a one-time confirm above 2500 kcal (review caught it re-prompting on every save of an unchanged big entry — fixed) | 69983820 + 07010071 | e2e/fuel-huge-calorie-confirm.spec.mjs |
| Fuel | Deleting a food entry had no confirm and no undo. Now an Undo toast restores it (review caught a failed restore vanishing silently — now toasts an error) | 58cb69a9 + 51b16dca | e2e/fuel-delete-entry-undo.spec.mjs |
| Fuel | Going offline mid-Add-Food left the button stuck on "Adding..." forever with no feedback. Now it reads "Offline - saves when you're back online" | f2590dcd | e2e/fuel-offline-add-feedback.spec.mjs |
| Fuel | Approving the week plan wrote ~40 rows as separate parallel inserts; a transient failure partway through could leave the week half-loaded with only a generic failure toast. Now one atomic insert (review caught the regression spec leaving stray rows on the shared account — fixed) | e4442610 + bbecb867 | e2e/fuel-approve-week-atomic.spec.mjs |
| Fuel | Recipes used the wrong column names, so creating a recipe always failed and logging any existing recipe saved null/NaN macros | 5755f086 + 8aa7bd96 | e2e/fuel-recipe-scaling.spec.mjs |
| Fuel | Barcode scanner's "camera unavailable" error, on Enter manually, showed "Product not found" even though nothing was ever scanned | 692b9060 | e2e/fuel-barcode-camera-error-toast.spec.mjs |

## UX moves made
| Area | Move | Why | Commit | Screens |
|---|---|---|---|---|
| Workout logger | "Replace exercise" moved to the top of each exercise's ⋯ menu (was 3rd, behind notes/how-to) | Swapping when equipment is taken is the common mid-session action | 04afc8b0 | ui-audit/overnight/shots/tl-ux-exercise-menu-{before,after}.png |

Fuel: one move was tried and reverted. Manual entry was swapped to lead the AI-estimate fallback in the Add Food dialog (82b50256), on the reasoning that manual entry is the more common fallback path. Review caught that the AI estimate expands the manual form above its own box, so its "filled in below" hint became false and the filled-in macros landed out of view on iPhone. Reverted (a6d62856); the benefit was marginal since both options were already one tap either way.

## Proposals needing your call
- **Workout crossing midnight gets different dates** depending on how it ends: finish by hand → log date is the finish day; stale-session auto-finish → the start day. Pick one rule. (train-logger r1-08)
- **Two identical workouts on the same day save as one.** The `workout_logs_no_exact_dupes` constraint treats a byte-identical second session as a double submit and shows success. Intended as a guard, but it would drop a real AM/PM repeat. (r1-09)
- Don't create a `workout_sessions` row on /quick-workout until the first exercise is added (avoids empty orphan sessions).
- Add a "Log a quick workout instead" way out on the "Workout not found" screen.
- Enforce reps/RIR ceilings like the new weight guard (small; candidate for a later round).
- Program saves need migration `supabase/migrations/20260928000000_program_workouts_notes.sql` (commit 640864f7) applied to hosted.
- **Re-approving the week plan discards hand-edited planned amounts.** Editing a planned item's amount, then re-approving the week, silently overwrites it back to the algorithm's number — two intentional behaviors (rebalance-to-target, delete+recreate on re-approve) interacting with no warning. Cheap fix: confirm before re-approve when planned rows already exist. Full fix (pin hand-edited rows so rebalance skips them) needs a new DB column. Left unfixed. (fuel r1-11)
- Fuel UX, held back as proposals rather than made: move the Week plan entry point higher on the Fuel page instead of a single row below the daily log (Nolan named this himself; weekly_plans used 13 times in 90 days) — flagged as a page redesign, not a reorder; surface "Food portions" (custom serving sizes) somewhere more discoverable, or fold it into manual entry — it has zero uses ever, worth confirming it's undiscoverable rather than unwanted before moving it; give "Approve & load the week" a visible success signal (e.g. "Loaded 42 items") instead of the sheet looking unchanged after it works; toast what changed when the day-rebalance silently rewrites a planned entry's grams to fit a shifted budget.

## Unfixed / unconfirmed
- r1-07 phone locked 3+ h mid-workout (silent auto-finish): not testable in the simulator (mocked clock + reload blanks WebKit; `updated_at` trigger blocks backdating). Test on the phone.
- r1-10 exercise-swap name field under the keyboard: was a simulator bug (it scrolled the page behind a fixed sheet instead of panning like iOS). Fixed in iphone-sim; the field now sits at y=285 above the keyboard with no warning. Not an app bug.
- Intermittent `program_workouts` "access control checks" page error on /train: seen twice, didn't reproduce on demand.
- Rejected after verification: double-tap Finish duplicate schedule row (only with same-tick taps), offline retry "spam" (one failed save per edit, data correct).
- **Fuel, rejected after verification:** DST fall-back eaten_at was already correct (r1-02); serving amount of 0.00001g saves a 0-kcal ghost row but isn't a realistic fat-finger and one tap deletes it (r1-04); double-tap "mark as eaten" is safe, no duplicate (r1-07); an edit that loses a race with a reload leaves the row unchanged, no mixed state (r1-08); a program_workouts page error seen once during an r1-08 run traced to the test harness's own navigation aborting an unrelated fetch, not Fuel code (r1-08-console-error); double-tap "Approve & load the week" produces no duplicates (r1-10); the kcal ring and the intake-stats average agree even on a suspicious-density entry (r1-14).
- **Fuel Add Food dialog fields hidden by the on-screen keyboard**, same shape as train-logger r1-10: the verifier traced the warning to the iphone-sim layer failing to scroll a fixed-position sheet's own inner scroller (real iOS scrolls the enclosing overflow area before panning), not to app code. Flagged, not fixed. Worth an on-device check same as r1-10: focus Food Name, hit accessory-next to Calories, see if Calories stays covered. If it does on a real phone, the fix is a cheap onFocus scrollIntoView on the dialog's inputs. (fuel r1-00-ios-keyboard)

## Wish list
See `ui-audit/overnight/areas/<area>/wishes.json` (train-logger: 8 ideas, incl. your two seeds; fuel: 10 ideas). Summarized per area at the end of the run.

## Run stats
- train-logger: round 1 (dry run) — 15 cases, 7 findings, 2 confirmed + fixed, 3 rejected, 2 proposals. ~1h50m.
- fuel: round 1 done ~05:05 — 15 cases, 9 confirmed (8 fixed, 1 left as a proposal), 7 rejected, 1 UX move tried and reverted, 4 UX proposals. Not clean (data-loss/engine findings), so a round-2 candidate if time allows.
- Runbook adjustment at 04:00: to fit the remaining areas in the time budget, the next area's map/cases and read-only attack passes now run pipelined alongside the current area's fix/UX/review steps, instead of waiting for each area to fully finish. Round 2s are likely to get dropped for time as a result.
