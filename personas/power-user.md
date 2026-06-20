# Persona: Power User (us, breadth + depth, no tutorial)

> This is us. No onboarding, no hand-holding. Exercises the deep builders, the
> analytics, the adaptive engine, and every overlay. Finds the edge cases and the
> features the daily loop never touches. Code-agnostic: needs and pass/fail signals.

## Identity
Knows every surface. Builds programs, recipes, diet phases. Reads the analytics and
the engine. Tolerates complexity but expects power tools to be correct and consistent.

## Environment
- Phone and desktop (tests both: mobile dock + desktop sidebar). Will resize.
- Has rich data; uses the long-tail surfaces the daily athlete skips.

## Must do (the job)
- Build a program (ProgramBuilder P8 4-step wizard; O16 duration, O17 schedule-after,
  O18 custom split) and enroll (ProgramDetail P11).
- Build and log recipes (RecipeBuilder O13 2-step, O14 log); meal templates (O10/O11/O12);
  diet phases (O7); TDEE setup (O15 StatsSetupModal).
- Use calculators (O3: 1RM / working / plates) and stream/quick notes (O4/O5).
- Read analytics + engine: AthleteState engine panel + load chart (P15), RecoveryDetail
  tabs (P16), Insights + BriefHistory (P18/P19), Physique compare (P17).
- Use the long-tail sections: Mind (P20), Career (P21).
- Manage account: Profile (P22), data export (DataExport), and verify the destructive
  paths gate correctly (O19 confirm; account delete) WITHOUT executing them.

## Expect (mental model)
"Every builder is consistent, every wizard remembers my steps, every number is right,
every overlay opens and closes cleanly. Power features should not feel like beta."

## Easiest (the lazy path they will actually take)
Wizards keep state across steps and survive a back-navigation. Edit and create reuse the
same form. Calculators are instant. Analytics load without a long spinner. Consistent
patterns across every builder so nothing has to be relearned.

## Blown away
- The adaptive engine (AthleteState) visibly reflects recent training and recovery.
- The builders feel first-class: multi-step wizards never lose state, never trap focus.
- Analytics are fast and legible on a phone, not just desktop.

## Verifiable success criteria (loop can check)
- Every overlay (O1-O23) opens, is focus-trapped, closes on escape/backdrop, and on
  mobile behaves as a bottom sheet (track the known centered-modal systemic issue once)
  [MOBILE][A11Y].
- Multi-step wizards (P8, O13, O16-O18) keep state across steps and a back-nav; no step
  dead-ends [BLOCKER].
- Calculators (O3) return correct values for known inputs [DATA].
- Create and edit reuse one consistent form per entity (no divergent UIs) [TASTE].
- Every destructive action routes through a confirm and is reversible-or-guarded; account
  delete is gated and is NOT executed by the test [BLOCKER].
- Analytics/engine surfaces (P15/P16/P18/P19) render without an unresolved spinner [PERF].
- Long-tail pages (P20 Mind, P21 Career) load, CRUD works, empty states designed.

## States this persona exercises
P8 ProgramBuilder, P11 ProgramDetail, P15 engine, P16 recovery tabs, P17 compare,
P18/P19 insights, P20 Mind, P21 Career, P22 Profile; overlays O3, O4, O7, O10-O18, O19,
O20-O22. Both 390x844 and a desktop width.
