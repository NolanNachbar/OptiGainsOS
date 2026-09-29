# Overnight audit report — 2026-09-28

Branch `overnight-audit-2026-09-27` (not pushed). Harness: `ui-audit/overnight/` (RUNBOOK.md, state.json, per-area outputs under `areas/`). Regression tests: `npm run test:e2e` (needs `npm run dev`).

## Needs your attention

**UNINTENDED PROD DEPLOY.** Committing 9af1d05c (the CORS fix on 5 edge functions, source-only change) printed `supabase functions deploy` output for all 18 functions at 13:21:38 MDT 2026-09-28. The fixer ran no deploy command, and no cause was found — no `.git/hooks`, no `core.hooksPath`, no Claude Code hooks configured anything like this. The trigger is unknown. Three later commits touched files outside `supabase/functions` and deployed nothing (checked via `list_edge_functions`: every function's `updated_at` was unchanged) — so the trigger, whatever it is, fires only on `supabase/functions` commits, or it was a one-off.

What's live now: main's function code plus the 5 CORS header lines. One function, `health-webhook`, had never been deployed before this and is now live for the first time (v1, `verify_jwt` on).

Side effect: the CORS bug was breaking 5 AI features in prod (physique analysis, meal estimate, nutrition-label reader, food macro estimate, Coach's form critique) at the preflight stage. Those should now work in prod — not yet tested live.

Your call: keep it, or roll back `health-webhook`. Also worth finding what triggered the deploy so it can't happen again unnoticed.

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
| Today | Deleting a todo hidden behind a same-text duplicate did nothing visible; delete/toggle now also target the right row | 1768b0e6 | e2e/today-delete-undo.spec.mjs |
| Today | Today's date could go stale (didn't re-derive across local midnight) | 6f932876 | e2e/today-midnight-rollover.spec.mjs |
| Today | Long unbroken todo text overflowed the page | 14a0e1b7 | e2e/today-long-todo-overflow.spec.mjs |
| Today | Today's engine data resolved by device timezone instead of your profile timezone | 6ad9af80 | e2e/today-athlete-state-timezone.spec.mjs |
| Today | Tapping "Practiced" while offline gave no feedback | 7aa7fc06 | e2e/today-mind-skill-offline-practiced.spec.mjs |
| Today | Reopening a Coach review with a missing clip spun forever instead of saying so | 2f46649d + 888025e9 | e2e/today-coach-missing-clip.spec.mjs |
| Today | Coach deleted the workout clip on any analyze-form failure, including ones where the review had already saved — now only deletes on a real rejection | 5c9d270c + 888025e9 | e2e/today-coach-analyze-failure-orphan.spec.mjs |
| Today | Coach clip preview/playback could be blocked by CSP | 98c8c0a4 | e2e/today-csp-media-src.spec.mjs |
| Train programs | Editing an existing program deleted all days before recreating them | 59250bba | e2e/train-programs-edit-insert-first.spec.mjs |
| Train programs | The mobile bottom CTA sat under the nav dock | de5e993b | e2e/train-programs-nav-cta-overlap.spec.mjs |
| Train programs | Enrolling while offline gave no feedback | 3bac7778 | e2e/train-programs-offline-enroll.spec.mjs |
| Train programs | Importing a program didn't validate blank names or out-of-range sets/rest | 2def2a8b | e2e/train-programs-import-validation.spec.mjs |
| Body | Progress page's weight input had no sanity bounds (train-logger-style typo guard) | 7401a158 | e2e/body-r1-02-weight-bounds.spec.mjs |
| Body | Measurements always inserted a new row instead of updating the day's entry; correction caught a re-save with a blank note wiping the earlier note | 0222cdb5 + 99aeea6d | e2e/body-r1-03-measurements-upsert.spec.mjs |
| Body | CORS `Allow-Headers` on 5 edge functions (analyze-physique, estimate-meal, read-nutrition-label, estimate-food-macros, analyze-form) was missing `apikey`/`x-client-info`, so supabase-js's own preflight failed in prod. Source fix only — see "Needs your attention" for the deploy that shipped it anyway | 9af1d05c | e2e/body-r1-11-cors-headers.spec.mjs |

## Nutrition/engine fixes from the critique
- **Adaptive TDEE never activated.** It required a 21-day window but only ever got 14 days of data, so it silently always fell back to the static formula. Widened the window so it can actually turn on. Correction caught the newly-live path counting future-dated/planned meal-plan rows as already-eaten food, which could have skewed real calorie goals — excluded those. (135e784c + d1245686)
- **Calorie adherence was capped at 100% when overeating**, hiding real overshoot from the number you see. Now shows the honest percentage. Checked every consumer of the field first — nothing in the app assumes it tops out at 1.0. (4e07b2b3)

## Coach critique (Chris Bumstead lens)
Two opus agents read the training and nutrition/body code, and drove the live UI read-only on the shared test account, as if CBum himself were reviewing it. That test account is a frozen June snapshot (BUD/S phase), so some numbers quoted in the docs are marked `[snapshot]` and may not match your account today — everything else is code-verified. Full lists: `ui-audit/overnight/critique/cbum-training.md` (13 ranked items) and `cbum-nutrition-body.md` (12 ranked items).

- **Training, top items:** experiment/test results are built but invisible and blocks can't be compared (#1 — includes a proposed **Experiments page** design in the doc's §3); the progression coach contradicts the engine's own RIR-0 prescription (#2); the engine can't program adductors and barely programs glutes — **no adductors muscle or exercise exists in the engine at all**, this is the one you asked about, and fixing it is an engine change, not a UI fix (#3, awaiting your call); there's no hypertrophy readout so every learner optimizes strength (#4); the per-exercise progress chart/PR table is unreachable (#5).
- **Nutrition/body, top items:** nutrition blocks aren't run as attributed experiments (#1); the app has two contradictory sources of calorie truth — a static formula and the engine (#2); trend weight isn't the hero over noisy daily scale reads (#3); adherence can read 100% while you're 1000 kcal over target, and "on track" doesn't catch an over-fast bulk or cut (#4); AI photo body-fat estimates drive phase decisions on shaky evidence (#5).
- Two items from this critique were already cheap enough to fix now and are in the section above: adaptive TDEE never activating, and calorie adherence capping at 100%.

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
- **Apply migration `supabase/migrations/20260928000000_program_workouts_notes.sql` (commit 640864f7) on hosted.** Program saves (edit-insert-first, train-programs r1-01 above) only fully work once this lands.
- **Re-approving the week plan discards hand-edited planned amounts.** Editing a planned item's amount, then re-approving the week, silently overwrites it back to the algorithm's number — two intentional behaviors (rebalance-to-target, delete+recreate on re-approve) interacting with no warning. Cheap fix: confirm before re-approve when planned rows already exist. Full fix (pin hand-edited rows so rebalance skips them) needs a new DB column. Left unfixed. (fuel r1-11)
- Fuel UX, held back as proposals rather than made: move the Week plan entry point higher on the Fuel page instead of a single row below the daily log (Nolan named this himself; weekly_plans used 13 times in 90 days) — flagged as a page redesign, not a reorder; surface "Food portions" (custom serving sizes) somewhere more discoverable, or fold it into manual entry — it has zero uses ever, worth confirming it's undiscoverable rather than unwanted before moving it; give "Approve & load the week" a visible success signal (e.g. "Loaded 42 items") instead of the sheet looking unchanged after it works; toast what changed when the day-rebalance silently rewrites a planned entry's grams to fit a shifted budget.
- **Today: same-text duplicate todos hide one of two real rows.** The de-dupe-by-text was added on purpose (commit ca0997ab) as a band-aid for duplicate AI-seeded todos, but it also hides a legitimate second todo with the same text and toggles/deletes only the wrong (earliest) row. Proper fix is either checking for existing rows before AI-seeding, or a DB unique index — a design call, not a quick patch. (today r1-03)
- **Body: the daily check-in (readiness/soreness/weigh-in) becomes unreachable** whenever a workout session is left "in progress" (even a stale, abandoned one) and today has no engine prescription — the whole card that hosts it gets suppressed with no other way in. Weigh-in is still reachable via Fuel > Body, so nothing is lost, just hidden. Cheap fix: only suppress on a *fresh* in-progress session, not any old one. (body r1-08)
- **Body: no way to delete a physique-tracker photo/entry in-app.** A bad shot (blurry, wrong lighting, clothed) has no removal path and keeps feeding the body-fat estimate that drives the TDEE engine indefinitely. (body r1-12)

## Unfixed / unconfirmed
- r1-07 phone locked 3+ h mid-workout (silent auto-finish): not testable in the simulator (mocked clock + reload blanks WebKit; `updated_at` trigger blocks backdating). Test on the phone.
- r1-10 exercise-swap name field under the keyboard: was a simulator bug (it scrolled the page behind a fixed sheet instead of panning like iOS). Fixed in iphone-sim; the field now sits at y=285 above the keyboard with no warning. Not an app bug.
- Intermittent `program_workouts` "access control checks" page error on /train: seen twice, didn't reproduce on demand.
- Rejected after verification: double-tap Finish duplicate schedule row (only with same-tick taps), offline retry "spam" (one failed save per edit, data correct).
- **Fuel, rejected after verification:** DST fall-back eaten_at was already correct (r1-02); serving amount of 0.00001g saves a 0-kcal ghost row but isn't a realistic fat-finger and one tap deletes it (r1-04); double-tap "mark as eaten" is safe, no duplicate (r1-07); an edit that loses a race with a reload leaves the row unchanged, no mixed state (r1-08); a program_workouts page error seen once during an r1-08 run traced to the test harness's own navigation aborting an unrelated fetch, not Fuel code (r1-08-console-error); double-tap "Approve & load the week" produces no duplicates (r1-10); the kcal ring and the intake-stats average agree even on a suspicious-density entry (r1-14).
- **Fuel Add Food dialog fields hidden by the on-screen keyboard**, same shape as train-logger r1-10: the verifier traced the warning to the iphone-sim layer failing to scroll a fixed-position sheet's own inner scroller (real iOS scrolls the enclosing overflow area before panning), not to app code. Flagged, not fixed. Worth an on-device check same as r1-10: focus Food Name, hit accessory-next to Calories, see if Calories stays covered. If it does on a real phone, the fix is a cheap onFocus scrollIntoView on the dialog's inputs. (fuel r1-00-ios-keyboard)

## Wish list
Full text in `ui-audit/overnight/areas/<area>/wishes.json`. "(done, sha)" = already shipped tonight, kept here so you don't re-ask.

**train-logger (8):** suggest a start weight for a swapped variant with no history; tag a set tempo/controlled so it doesn't read as strength loss; "Log a quick workout instead" on the Workout-not-found dead end; don't create a session row on Quick Workout until the first exercise is added; reconcile manual-vs-auto-finish log_date for midnight-crossing workouts (proposal, r1-08 above); undo on deleting a completed set (done, 61a59c5f); tell the athlete plainly when a save is rejected as an exact duplicate (proposal, r1-09 above); keyboard-avoiding layout for the Replace-exercise name field.

**fuel (10):** visible success summary after Approve & load the week; toast when day-rebalance silently rewrites a planned item; move the Week-plan entry point higher on the page; confirm/undo on deleting a food entry (done, 58cb69a9); surface Food portions or fold it into manual entry (zero uses ever); cap/confirm implausible serving amounts (done at the high end, 69983820); scroll the focused field above the keyboard in Add Food; make Approve & load the week atomic or report partial success (done, e4442610); feedback for a stalled offline Add Food (done, f2590dcd); distinct error for camera-unavailable vs product-not-found (done, 692b9060).

**today (5):** a "yesterday's leftovers" strip with one-tap bump-to-today; a todos history/archive view; delete-with-undo on Today's todo X (done, 1768b0e6); a "queued — will sync" badge for offline mutations, e.g. Mind's Practiced tap (done for Practiced, 7aa7fc06); Coach's reopened review should say "clip unavailable" instead of spinning forever (done, 2f46649d).

**body (10):** a delete path for a physique-tracker photo/entry (proposal, r1-12 above); reuse WeighInPrompt's sanity bounds on the Progress Weight tab (done, 7401a158); a DB-level upsert/unique constraint for today's weight — 7 components can race and double-insert; confirm/undo on water and supplement log delete; upsert Measurements by date or add a tiebreak sort (done, 0222cdb5); a manual-entry fallback for recovery_metrics on sync-miss days; badge the water goal "estimated" when weight is unset; a reachable check-in path when a stale in-progress session blocks it (proposal, r1-08 above); re-derive/revert `profile.current_weight` when its source entry is deleted; allow a typed 0 dose for supplements instead of silently falling back to the default.

**train-programs:** none logged this round.

## Run stats
- train-logger: round 1 (dry run) — 15 cases, 7 findings, 2 confirmed + fixed, 3 rejected, 2 proposals. ~1h50m.
- fuel: round 1 done ~05:05 — 15 cases, 9 confirmed (8 fixed, 1 left as a proposal), 7 rejected, 1 UX move tried and reverted, 4 UX proposals. Not clean (data-loss/engine findings), so a round-2 candidate if time allows.
- today: round 1 done — 16 cases, 10 confirmed (8 fixed, 1 corrected in review, r1-03 left as a proposal), 7 rejected.
- train-programs: round 1 done — 14 cases, 4 confirmed, all fixed, 3 rejected.
- body: round 1 done — 13 cases, 7 findings, 4 confirmed (r1-02, r1-03, r1-11 fixed — r1-03 with a review correction, 99aeea6d; r1-12 left as a proposal), r1-08 also a proposal, 3 rejected.
- analyze and profile-auth: not started — the session ran out of time after body.
- Usage-limit stops: ~05:25-12:15 MDT and ~16:50-18:35 MDT. Both times, in-flight agents were killed mid-run and the orchestrator resumed from state.json on reset.
- 38 commits since 9b4913a2 (train-logger's round-1 wrap-up commit) — fuel round 1 onward, not counting this report commit.
- Runbook adjustment at 04:00: to fit the remaining areas in the time budget, the next area's map/cases and read-only attack passes now run pipelined alongside the current area's fix/UX/review steps, instead of waiting for each area to fully finish. Round 2s were dropped for time as a result.
