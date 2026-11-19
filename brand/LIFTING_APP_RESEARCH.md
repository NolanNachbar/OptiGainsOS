---
type: research
title: Lifting App Design Research
origin: distilled
source: web research 2026-11-18 (vendor help centers, App Store listings, design teardowns, comparison blogs); some app details from prior product knowledge, flagged below
tags: [optigains, design, research, competitors]
status: active
created: 2026-11-18
---

# Lifting App Design Research

Goal: find what makes the best lifting and fitness apps feel professional, then turn it into buildable patterns for OptiGains ("the training instrument that shows its working").

Caveat on evidence: direct Reddit threads did not surface in search; most comparison pages are written by competing apps (Setgraph, LastLift, Boostcamp, repreturn affiliate). Vendor help centers are the most reliable source for mechanics. Items marked (pk) come from prior product knowledge, not a source fetched today.

## Per-app notes

### MacroFactor (nutrition)
- Expenditure: starts from a TDEE equation, then re-estimates continuously from logged intake plus a trended (smoothed) weight. Help docs say the estimate settles after about 14 to 30 days depending on logging consistency. [help: interpret expenditure](https://help.macrofactorapp.com/FAQ/interpet_energy_expenditure)
- V3 algorithm is pitched as both more responsive (catches real trends 1 to 5 days sooner) and more stable. [expenditure v3](https://macrofactor.com/expenditure-v3/)
- Coaching: weekly check-in adjusts targets from three inputs (expenditure change, goal change, smoothing). Adjustments are deliberately damped, not 1:1 with expenditure moves. [goal adjustments](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal)
- Explicitly refuses wearable calorie burn as input and says why in public docs. [algorithms and philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/)
- Explains "why is my number different from a calculator" in a short-answer-first article format. [help article 126](https://help.macrofactorapp.com/en/articles/126-why-is-my-expenditure-in-macrofactor-different-from-the-output-of-a-tdee-calculator)
- Feel (pk): dense but calm dashboard, trend lines over raw points (raw weight as faint dots, trend as solid line), no shame language when you miss a day, "adherence-neutral" tone.

### MacroFactor Workouts
- "Smart progression" is rule-based, adjusts day to day from logged sets. [App Store](https://apps.apple.com/ca/app/id6737156524), [product page](https://macrofactorapp.com/workouts/)
- Help doc explains why it sometimes lowers weight or reps: a set logged harder than target RIR pulls the next load down. [help 373](https://help.macrofactorapp.com/en/articles/373-why-does-the-app-sometimes-recommend-lowering-weight-or-reps)
- 2026 updates: can widen a set's target rep range and offer one-tap fixes across all affected sets; reps-first vs weight-first setting. [Jan 2026](https://macrofactor.com/mm-jan-2026/), [Apr 2026](https://macrofactor.com/mm-apr-2026/)
- Complaints: "clunky" on Android; irregular weight and rep assignments acknowledged by the company. Praise: suggests loads users would not have chosen themselves. [GainFrame review](https://gainframe.app/blog/macrofactor-workouts-review/), [screensdesign teardown](https://screensdesign.com/showcase/macrofactor-workouts-tracker)

### Strong
- Reputation: fastest logger, set in under 5 seconds; previous session's numbers shown inline per set; one checkbox completes the set and auto-starts rest timer. Clean charts, minimal chrome. [Strong vs Hevy](https://repreturn.com/strong-app-vs-hevy/), [Reddit roundup](https://setgraph.app/ai-blog/best-workout-tracker-app-reddit)
- Supports warmup, drop, failure set types with fast access. Complaint (pk): dated look, paywalled templates limit.

### Hevy
- Praised for friendly design and easy logging; social feed and motivational framing. Weak on advanced set types. [Hevy vs Strong 2026](https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026)
- (pk) "Previous" column greyed beside input; tapping it copies values. Complaint: feed and social noise around a tool.

### Liftosaur (pk)
- Programs written as text in its own scripting language; progression logic is fully visible and editable. Loved by programmers, steep for others. Lesson: show the rule, not just the result.

### RP Hypertrophy
- After sets/sessions, asks for pump, soreness, joint pain, workload; uses answers to set next week's sets and loads. [RP app page](https://rpstrength.com/hypertrophy-app), [Dr Muscle review](https://dr-muscle.com/rp-hypertrophy-app-for-strength-training-expert-review/)
- Complaint: beginners cannot rate pump reliably; questionnaire fatigue. RIR guessing is admitted to be imperfect. [RP help](https://help.rpstrength.com/hc/en-us/articles/32435225484183-What-if-I-miss-my-target-RIR-in-week-1)

### Juggernaut AI, Alpha Progression, Boostcamp (pk, thin web evidence today)
- Juggernaut AI: pre-session readiness check adjusts the day's loads; RPE-driven autoregulation.
- Alpha Progression: per-set suggested weight and reps with RIR, colored progress indicator per exercise.
- Boostcamp: library of known programs, week/day grid as primary program view. [Boostcamp logging](https://www.boostcamp.app/best/workout-logging)

### Whoop
- 2025 home: three dials (Sleep, Recovery, Strain) at the top, each with a deep-dive page; lock-screen widgets; week/month/6-month views. [Whoop home](https://www.whoop.com/us/en/thelocker/the-all-new-whoop-home-screen/), [2025 launches](https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/)
- Recovery is 0 to 100 with green/yellow/red bands that drive the strain target. [925 Studios teardown](https://www.925studios.co/blog/whoop-design-breakdown)
- Critique: pretty and faster, but daunting density for new users, deep insight navigation unclear. [the5krunner](https://the5krunner.com/2023/03/28/new-whoop-home-screen-looks-pretty-but-is-it-as-intuitive/)

### Oura (pk)
- Readiness score with a "contributors" list beneath it (each contributor a labeled bar: optimal, good, pay attention). One sentence of plain-language interpretation under the score. This is the closest analog to "every number carries a reason."

### Apple Fitness (pk)
- Rings: one glanceable composite per day; large numerals, SF-style tabular figures, saturated hue per metric on black. Trends screen uses arrows (up/down/hold) rather than raw stats. Haptic and ring-close animation as the only celebration.

## Cross-cutting themes
1. Speed wins logging wars: the leader (Strong) is defined by sub-5-second set entry and pre-filled values.
2. Trust comes from explained, damped numbers (MacroFactor) rather than impressive ones.
3. Readiness apps lead with one score plus contributors (Whoop, Oura); density is fine when hierarchy is strict.
4. Subjective questionnaires cost trust when they are long or vague (RP).
5. Social and gamified chrome reads as consumer, not professional (Hevy critique).

## Patterns for OptiGains (ranked by impact)

1. **Prefilled set row, one-tap complete.** [Train/logger] Each set row shows target weight x reps prefilled from the engine; a 44px check button commits it as-is (1 tap). Editing: tap the number opens a numeric stepper sheet (weight +/- plate increment, reps +/-), not the keyboard. Target: 1 tap for an on-plan set, 3 for a deviation. Completing a set starts the rest timer automatically.
2. **Reason line under every engine number.** [System-wide] 13px muted text, single line, ellipsized, directly under the number: "+2.5 kg: last 2 sessions hit top of range at RIR 2". Tap expands an inline drawer (not a modal) with inputs, rule, and the previous value. Never a bare "AI recommends".
3. **Today = one readiness score + 3 contributors + next action.** [Today] Top: teal readiness numeral (56px tabular), one interpretation sentence, then 3 contributor bars (sleep, soreness/fatigue, recent load). Below: a single off-white primary button "Start Push A" with the session's first lift and target. Nothing else above the fold.
4. **Trend over raw.** [Body/progress, Fuel] Raw weigh-ins as 3px low-opacity dots, smoothed trend as a 2px solid line; the headline number is the trend value with weekly rate ("-0.4 kg/wk"). Same for e1RM charts.
5. **Damped weekly check-in with diff view.** [Fuel, Programs] Weekly card shows old target, new target, delta, and the 2 to 3 inputs that drove it; changes capped and the cap stated ("limited to 150 kcal this week"). Accept is one tap; "keep current" is a secondary text link.
6. **Previous-session ghost values.** [Train/logger] Last time's numbers in a muted column beside each set; a tap copies them in. Shows PR delta inline (+5 kg) in the datum hue when beaten.
7. **Inline deviation explanations.** [Train/logger] When a logged set misses or overshoots target RIR, the next set's suggestion updates live with a reason line ("-5 kg: last set RIR 0 vs target 2"), and offers a one-tap "apply to remaining sets" like the bulk-fix pattern.
8. **Two-question readiness check, max.** [Today, Train] Before a session: sleep quality and soreness on 5-point segmented controls (thumb-sized 48px segments). Skippable; engine states "no check-in, using defaults". Avoid long pump/joint surveys.
9. **Tabular, strict type scale.** [System-wide] Tabular figures everywhere numbers sit in columns; 4 sizes only (56 hero / 22 section / 15 body / 13 reason). Units smaller and muted next to values. Density OK because hierarchy is strict.
10. **Hue = datum, consistently.** [System-wide] Each metric owns one hue across every screen (teal readiness, others per metric); the only button fill is off-white. No red for "bad" days; use neutral plus a reason.
11. **Program as visible rules.** [Programs] Each exercise shows its progression rule in plain words ("double progression 6-10, +2.5 kg when all sets hit 10") and the week grid (weeks x days) with completed cells filled. Editable rules, not hidden logic.
12. **Fast food logging: recents first.** [Fuel] Search field autofocus on open; below it, recent and frequent foods with last-used serving; one tap adds at last serving, long-press/edit for amount. Running macro bar stays pinned at top.
13. **Honest empty states.** [System-wide, Body/progress] Empty state says what the engine needs and how long: "Expenditure estimate firms up after ~14 days of weigh-ins and logs. Day 3 of 14." with a progress bar. No illustrations, no mascots.
14. **Restrained motion.** [Shell/nav, Train] 150 to 200ms ease-out for sheets and number changes; numbers tween on update so changes are noticeable; one subtle haptic/flash on set complete and PR. No confetti.
15. **Bottom tab bar, five fixed destinations, persistent session pill.** [Shell/nav] Today, Train, Fuel, Body, Programs; an active workout shows as a pinned mini bar above tabs with elapsed time and rest countdown, tap to return to logger.

## Anti-patterns to avoid
- Social feeds, streak flames, badges, or confetti: consumer, not instrument.
- Unexplained "AI" numbers or scores without contributors.
- Keyboard-first numeric entry mid-set.
- Undamped targets that jump daily, causing distrust.
- Long subjective questionnaires after every set.
- Red/green moral coloring of days; shame language for missed logs.
- Dense home screens without a single clear primary action (Whoop critique).
- Modals for explanations; keep them inline and dismissible.
