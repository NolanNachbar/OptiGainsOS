# Persona: New User (first run, empty state)

> A person opening OptiGains for the first time. Empty data everywhere. Tests
> whether the app tells them what to do, and whether every empty state is designed,
> not blank. Code-agnostic: needs and pass/fail signals, not implementation.
> Runs in UI-AUDIT mode (bypass auth, mock user, empty data) by default.

## Identity
New to the app. Wants to start training and tracking. Does not know the 5-section
model (Today / Train / Fuel / Body / Analyze) or what the FAB does yet. Will judge
in the first 60 seconds whether this is worth it.

## Environment
- Phone, 390x844, mobile dock. One-handed. Impatient with blank screens.
- Fresh account: no workouts, no programs, no food log, no body data, no brief.

## Must do (the job)
- Land somewhere that explains what this is and what to do first.
- Discover the FAB and the 5 dock sections without a manual.
- Create or start their first workout (CreateWorkout P7 / QuickWorkout P10 / Program P8).
- Log their first food entry (FoodTracker P14) and first weigh-in (WeighInModal O2).
- Find where their body/recovery data will live (AthleteState P15, Physique P17).
- Understand what the Daily Brief (Insights P18) will give them once there is data.

## Expect (mental model)
"I just signed up. Show me a starting point and one obvious next action." Expects
empty states to coach, not to dead-end. Expects the FAB to be the way to add things.

## Easiest (the lazy path they will actually take)
Today (P1) greets them with one clear primary action ("log your first workout" or
"set up your plan"). Every empty section has a single CTA that starts the right flow.
The FAB's 6 actions are labeled and discoverable. No section is a blank wall.

## Blown away
- Every empty state is a designed invitation, not an empty list.
- A first-run path that goes start-a-workout -> log a set -> see it on Today, in under
  a minute, with no confusion.
- The app feels coherent: the 5 sections obviously map to train / eat / recover / learn.

## Verifiable success criteria (loop can check)
- Every page in an empty state shows a heading + an explanatory line + a primary CTA;
  no page renders a bare empty list or a blank screen [BLOCKER if blank].
- The first-workout path (Today or FAB -> create/quick -> log -> back to Today) completes
  with no dead end and no step that assumes prior data.
- The FAB opens, all 6 actions are labeled, each opens its flow [BLOCKER if any dead-ends].
- No empty state shows a spinner that never resolves (empty != loading).
- At 390px every first-run screen has no horizontal scroll and 44px+ targets [MOBILE][A11Y].

## States this persona exercises
Empty variants of P1 Today, P3-P6 Train tabs, P12-P14 Fuel, P15-P17 Body, P18-P20
Analyze; overlays O1 FAB, O2 WeighIn, O8 Food add, O5 Quick Note.
