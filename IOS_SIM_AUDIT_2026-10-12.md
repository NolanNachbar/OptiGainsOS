# iOS Simulator persona audit — 2026-10-12

Branch: `ios-sim-audit-2026-10-12` (never pushed/merged). Driven through the
real iOS Simulator (iPhone 13 Pro Max, iOS 27.0, Appium 3.8.0 + XCUITest,
`ios-sim/run.mjs`) against the live deployed site, logged in as
`optigains-sim-test@example.invalid` — a fresh clone of Nolan's real account
made this session (`ios-sim/clone-test-user.mjs`), not the prior run's stale
June snapshot.

## Why this run, and how it differs from the September overnight run

Nolan asked for two things: (1) does the app actually program progressive
overload, and (2) a persona audit ("if CBum or Nippard used this app, what
would they think") run through a real device instead of Playwright's
emulated-iPhone layer, since the prior overnight run (`ui-audit/overnight/`,
branch `overnight-audit-2026-09-27`) had already flagged uncertainty about
whether some of its own findings were real bugs or artifacts of not using a
real device.

This pass is deliberately **not** a re-run of that overnight run's full
multi-round map→cases→attack→verify→fix→review loop — that was a multi-agent,
multi-hour operation; this was a single agent, one real shared simulator, one
pass. It's narrower and deeper in three places (progression correctness,
training-focus adjustability, RIR input UX) rather than broad across every
screen.

## Methodology note — read before trusting any "empty" screenshot

The cloned test account has real workout/food/body-weight/program history
(129 workouts, 2.6M lbs, `ios-sim/audit/sweep2/15-profile.png`), but **no
`athlete_state` rows** — that table is only computed by the GitHub Actions
cron, hardcoded to Nolan's real `USER_ID`. So every screen downstream of
`athlete_state` (Body→State, Insights' Daily Brief, readiness) reads "No
analysis yet" / "No brief for today yet" on the clone regardless of how much
history it has. Treat those specific screenshots as proof the *pipeline* is
cron-only and single-user (expected, matches `CLAUDE.md`'s "single-user
engine" framing), not as evidence about what those screens show for the real
account.

## What's new since the September run

1. **Real device, not Playwright emulation** — closes the open question from
   that run's own log ("r1-10 ios ... blamed on iphone-sim layer → double-
   check in the morning").
2. **Fresh data, not a frozen June snapshot** — the `[snapshot]`-caveated
   findings in `cbum-training.md`/`cbum-nutrition-body.md` can now be checked
   against current behavior, not just inferred from code.
3. **Two independent persona critiques** instead of one — Nippard specifically
   checks implementation against the app's own `Science-Unified.md` spec, not
   just against general training-science intuition.
4. **Nolan's two specific questions answered directly**, with both source
   citations and live screenshots, not just code-level inference.

## Bugs/findings

Full detail and evidence paths in `ios-sim/audit/findings.json` (RUNBOOK
finding schema). Summary:

| id | title | verdict | disposition |
|---|---|---|---|
| iosaud-01 | Progression coach deloads exercises trained to failure by design | confirmed, live | proposal |
| iosaud-02 | No UI control for training-focus / goal_priorities anywhere | confirmed | proposal |
| iosaud-03 | RIR entry breaks the weight/reps input pattern | confirmed, live | proposal |
| iosaud-04 | Hypertrophy volume doesn't weight by the spec's own effective-reps formula | confirmed (code) | proposal |
| iosaud-05 | Mid-session navigation does not lose entered set data | rejected (pass) | no_change_needed |

**No crash/data-loss/broken-flow bugs were confirmed in this pass**, so no
fix commits were made. iosaud-01 through -04 are all structural/engine/UX
issues that need a design decision, not a one-line patch — consistent with
this run's ground rules (fix only clear crash/data-loss/broken-flow bugs,
everything else goes to proposals). iosaud-05 is a clean regression check
that passed, logged per the RUNBOOK's "verify rejected at least something"
convention — it covers only one interruption scenario (background-navigate-
return), not the fuller space (lock, offline, reload) the September run's
persona situations list.

This pass's live-driving time went to depth on the two questions Nolan asked
rather than breadth of fuzzing, so treat the absence of more bugs here as "not
exhaustively searched," not "none exist" — the September run's broader
multi-round sweep already found and fixed two real ones (1710-no-clamp
engine bug, no-undo set delete) that this pass didn't re-touch.

## Persona critiques

- **`ui-audit/overnight/critique/cbum-addendum-2026-10-12.md`** — extends
  the existing `cbum-training.md`/`cbum-nutrition-body.md` with live-device,
  fresh-data confirmation of their top findings, plus two new ones: no
  training-focus control anywhere, and the RIR input UX problem. Read this
  one first if you only read one.
- **`ui-audit/overnight/critique/nippard-training-nutrition.md`** — new,
  independent voice. Checks the engine against its own `Science-Unified.md`
  spec rather than general intuition: finds the hypertrophy-volume counter
  doesn't use the spec's own effective-reps stimulus formula, and that three
  muscles get a hardcoded frequency the spec explicitly says shouldn't exist.
  Converges with CBum independently on the progression-coach and RIR-UX
  findings.

## Answering Nolan's two original questions directly

**"Does the app program progressive overload?"** Partially, and what exists
doesn't reach the user reliably. The three competition lifts get a real but
purely reactive e1RM-trend mechanism; accessories get none at all from the
backend (default to "whatever you did last time"); the one real forward-
looking coaching layer (`coachingEngine.js`) is advisory-only, gated on RIR
data whose entry UX likely suppresses it (iosaud-03), and — per this pass's
live evidence — actively wrong for failure-trained accessories (iosaud-01).

**"How do I adjust focus between powerlifting/bodybuilding/cardio?"** You
currently can't, anywhere in the app (iosaud-02). The engine has the
machinery (`goal_priorities`, `training_phase`) and no UI ever writes to it.

## Wish list

`ios-sim/audit/wishlist.json` — five items, ideas only, not built.

## Infrastructure left in place

- `ios-sim/clone-test-user.mjs` — reusable for future passes; re-running it
  refreshes the clone from the real account's current data.
- `ios-sim/flows/audit-sweep.json`, `rir-ux-test*.json`, `goal-switch-test.json`
  — reusable flow definitions for the screens and interactions this pass
  covered.
- All raw screenshots/dumps under `ios-sim/audit/` (sweep1/sweep2, rir1-5,
  switch1).

## Run stats

One agent, one real shared simulator (serialized driving, as required). ~15
live simulator interactions across 7 flow runs. Two full persona critique
documents, one addendum, 5 logged findings, 5 wishlist items, zero fix
commits (none met the crash/data-loss/broken-flow bar). Branch has one
earlier commit (`24b4413`, the harness setup itself) plus this report; see
`git log ios-sim-audit-2026-10-12` for the full list.
