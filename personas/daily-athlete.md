# Persona: Daily Athlete (the core loop, populated)

> The everyday user running their training day. The product's main job. Needs the
> daily loop to be fast, mobile-perfect, and trustworthy. Code-agnostic: needs and
> pass/fail signals. Needs POPULATED mode (local Supabase + seeded data); mark
> data-dependent steps [BLOCKED: needs local supabase] if not set up.

## Identity
Trains most days, tracks food and bodyweight, checks recovery. Knows the app. Opens
it several times a day on a phone. Paid in time saved; hates friction and re-typing.

## Environment
- Phone, 390x844, dock + FAB. Often mid-workout, one hand, between sets.
- Has an active program, a prescribed workout today, a food log in progress, body data.

## Must do (the job)
- Open Today (P1): see today's workout, readiness, what to do now.
- Start and log the prescribed workout (WorkoutDetail P9): log sets/reps/weight, use the
  rest timer (O23), see the muscle heatmap, finish the session.
- Quick-log when off-plan (QuickWorkout P10).
- Log food across the day (FoodTracker P12/P14): add foods (O8), see macro bars hit.
- Weigh in (O2) and log wellness (Fuel wellness P13: water, supplements).
- Check recovery / athlete state (P15 AthleteState, P16 RecoveryDetail).
- Read the Daily Brief (Insights P18) and act on it.

## Expect (mental model)
"Open Today, it knows what I'm doing. Tap into the workout, log fast, done. Food in a
few taps. One glance tells me if I'm recovered." Expects the day to flow without hunting.

## Easiest (the lazy path they will actually take)
Today surfaces the one next action (start today's workout). Logging a set is a couple
taps with the last values prefilled. Rest timer auto-starts. Food add is search +
recent-first, not a long scroll. Everything reachable from the dock or FAB in one tap.

## Blown away
- Logging a full workout faster than a notes app, with the heatmap filling as you go.
- Today and the Daily Brief actually reflect what they did and how recovered they are.
- The whole loop (workout + food + weigh-in) done one-handed, mid-session, no jank.
- Nothing ever lost: navigate away mid-log and come back to exactly where they were.

## Verifiable success criteria (loop can check)
- The prescribed workout is reachable from Today in <= 1 tap; logging a set is <= N taps
  with prefill [PERF].
- The rest timer (O23) starts and counts; the muscle heatmap updates after a logged set.
- Food add (O8) is searchable / recent-first, not a raw scrolling list.
- Navigating away mid-log and back loses zero entered data [BLOCKER if data loss].
- Macro bars, readiness, and Today reflect logged data correctly (no stale/zero) [DATA].
- Every step works one-handed at 390px: targets 44px+, no horizontal scroll [MOBILE][A11Y].
- No loop step dead-ends; there is always a clear next action [BLOCKER].

## States this persona exercises
Populated P1 Today (workout-in-progress banner), P9 WorkoutDetail logging + heatmap,
P10 QuickWorkout prescribed, P12/P14 Fuel populated + macro bars, P13 wellness, P15/P16
recovery, P18 Insights brief; overlays O2 WeighIn, O8 Food add, O23 rest timer, O1 FAB.
