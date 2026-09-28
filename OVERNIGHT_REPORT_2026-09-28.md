# Overnight audit report — 2026-09-28

Branch `overnight-audit-2026-09-27` (not pushed). Harness: `ui-audit/overnight/` (RUNBOOK.md, state.json, per-area outputs under `areas/`). Regression tests: `npm run test:e2e` (needs `npm run dev`).

## Bugs fixed
| Area | Bug | Commit | Regression test |
|---|---|---|---|
| Workout logger | A fat-fingered weight (1710 for 171) saved with no check. Now a one-time "are you sure" per exercise when a weight is far above your recent weight or the field max | f541e685 + 03c2dc26 | e2e/train-logger-weight-typo-guard.spec.mjs |
| Workout logger | Deleting a completed set had no undo. Now an Undo toast restores it in place | 61a59c5f + 03c2dc26 | e2e/train-logger-delete-set-undo.spec.mjs |

## UX moves made
| Area | Move | Why | Commit | Screens |
|---|---|---|---|---|
| Workout logger | "Replace exercise" moved to the top of each exercise's ⋯ menu (was 3rd, behind notes/how-to) | Swapping when equipment is taken is the common mid-session action | 04afc8b0 | ui-audit/overnight/shots/tl-ux-exercise-menu-{before,after}.png |

## Proposals needing your call
- **Workout crossing midnight gets different dates** depending on how it ends: finish by hand → log date is the finish day; stale-session auto-finish → the start day. Pick one rule. (train-logger r1-08)
- **Two identical workouts on the same day save as one.** The `workout_logs_no_exact_dupes` constraint treats a byte-identical second session as a double submit and shows success. Intended as a guard, but it would drop a real AM/PM repeat. (r1-09)
- Don't create a `workout_sessions` row on /quick-workout until the first exercise is added (avoids empty orphan sessions).
- Add a "Log a quick workout instead" way out on the "Workout not found" screen.
- Enforce reps/RIR ceilings like the new weight guard (small; candidate for a later round).
- Program saves need migration `supabase/migrations/20260928000000_program_workouts_notes.sql` (commit 640864f7) applied to hosted.

## Unfixed / unconfirmed
- r1-07 phone locked 3+ h mid-workout (silent auto-finish): not testable in the simulator (mocked clock + reload blanks WebKit; `updated_at` trigger blocks backdating). Test on the phone.
- r1-10 exercise-swap name field under the keyboard: was a simulator bug (it scrolled the page behind a fixed sheet instead of panning like iOS). Fixed in iphone-sim; the field now sits at y=285 above the keyboard with no warning. Not an app bug.
- Intermittent `program_workouts` "access control checks" page error on /train: seen twice, didn't reproduce on demand.
- Rejected after verification: double-tap Finish duplicate schedule row (only with same-tick taps), offline retry "spam" (one failed save per edit, data correct).

## Wish list
See `ui-audit/overnight/areas/<area>/wishes.json` (train-logger: 8 ideas, incl. your two seeds). Summarized per area at the end of the run.

## Run stats
- train-logger: round 1 (dry run) — 15 cases, 7 findings, 2 confirmed + fixed, 3 rejected, 2 proposals. ~1h50m.
