# Spec: specialization-cycle test (n=1 self-experiment)

Status: proposed, not built. Written 2026-08-04 alongside the session-size fix.

## Why

Nolan wants OptiGains to run real experiments on him, using the Jeremy Ethier
specialization-cycle video as the exemplar: pick a priority muscle, train it far
harder than the rest for a block, measure it, keep the result. The engine's
current exploration is not that. `exploration_manager.ControlledExplorationManager`
is a UCB1 bandit whose arms are muscle names and whose probe magnitude is
`+1 set` on one muscle (`get_exploration_delta`). That is volume jitter. The
Ethier protocol is roughly 35 hard sets/week on the priority muscle against ~10
on the control, held for weeks, placed first in the session, rotated across two
exercises, and read out by tape measure.

The good news is the scaffolding already exists. `engine/controlled_tests.py`
plus the `controlled_tests` Supabase table already run a multi-week designed
probe end to end: schedule → weekly ramp → step → completion → a low-noise
observation fed to a learner (`TEST_OBS_VAR = 2.0` vs the passive
`OBS_VAR = 9.0`). This spec adds a second `test_type` to that framework rather
than building a parallel one.

## Design

### New test type

`test_type: "specialization"`, `target_key: f"spec.{muscle}"`.

```
baseline = {
  "muscle":        "side_delts",
  "week":          1,
  "weeks_total":   6,           # [ENG] SPEC_WEEKS
  "spec_sets":     30,          # weekly sets on the priority muscle
  "control_sets":  10,          # weekly sets on the paired control muscle
  "control":       "rear_delts",# the matched-but-unspecialized comparator
  "sets_per_ex":   1,           # the second arm, below
  "readout":       "e1rm",      # or "circumference"
  "start":         {"e1rm": ..., "circumference_cm": ...},
}
```

### Two arms, not one

Nolan's call (2026-08-04): one set per exercise is often exactly right for him,
but he is willing to test higher volume per exercise. So the test varies two
things independently, and they are genuinely different questions:

1. **Weekly volume on a priority muscle** — the Ethier variable. Delivered as a
   `ramp_target`-style override that lifts one muscle's allocation well above
   MAV for the block, the same hook `volume_tolerance` already uses.
2. **Sets per exercise** — 1 (his current default, `MAX_ACCESSORY_SETS_PER_EXERCISE`)
   vs 2-3. This is the arm he volunteered for. It is deliberately *not* coupled
   to arm 1: the session-size work already established that total volume and
   per-station volume are separate levers, and confounding them would make the
   readout uninterpretable.

Run one arm at a time. `can_schedule` already enforces one active test.

### Placement

The Ethier protocol puts the priority muscle first in the session. That hook
exists: `_build_session`'s `focus_muscle` / `_FOCUS_OVERRIDE` and the `+6.0`
`focus_bonus` in `_order_key`. An active specialization test should override
`focus_muscle` to the probed muscle for every session that trains it.

### Two-exercise rotation

Ethier's stated rule is rotating two exercises for the priority muscle rather
than hammering one. `_pick_assistance` already does deterministic week-indexed
rotation; reuse that shape so the block alternates a fixed pair and each
accrues its own e1RM history.

### Control

`volume_tolerance` has no control and does not need one — it is looking for a
ceiling, not a contrast. A specialization test is a comparison, so it needs a
matched comparator held at maintenance volume for the block. Pick the control by
similarity of current landmarks and n_obs, and record it at schedule time so the
readout cannot be chosen after the fact.

### Readout, pre-registered

The completion criterion and the measurement are both written at schedule time,
not decided when the block ends:

- `e1rm` — slope over the block from `StrengthProgressionRegistry`, spec vs control.
- `circumference` — the Ethier readout. Needs a tape measurement Nolan enters at
  block start and block end. There is no such input today; it needs a check-in
  field. Without it the test can only read strength, which is a weaker proxy for
  hypertrophy but requires no new plumbing.

On completion, emit the same `{key, obs, obs_var, complete}` shape
`step_volume_test` returns, so the existing learner wiring picks it up.

### Guards

- Never two active tests (`can_schedule`, already enforced).
- A specialization block raises total weekly volume. During a cut that fights
  the whole point of the session-size work, so gate specialization on
  `phase != "cut"`. Note this is the opposite call from `volume_tolerance`,
  which deliberately DOES run on a cut (see the long comment in `can_schedule`)
  because it was the only remaining path for MRV to move. Different rationale,
  different answer, so the phase gate belongs on the test type, not shared.
- The specialization block ignores the session-size target for the priority
  muscle's slots only. It must not reopen the 14-exercise problem across the
  rest of the session.

## First test: side delts, daily frequency

Nolan's call (2026-08-04): side delts are the first subject, and it starts now
rather than after a few weeks of watching the session-size fix settle. His reason
is that he is not a novice — he has been lifting long enough that the session-size
change is a shape change, not a training-age confound.

The variable here is FREQUENCY, not the weekly-volume arm above. The mandatory-
isolation rule already puts a lateral raise in every session, so side delts moved
from roughly 2-3x/week to 6-7x/week the moment that shipped. That is the
intervention; the test is what measures it.

```
test_type:   "specialization"
target_key:  "spec.side_delts"
baseline = {
  "muscle":       "side_delts",
  "arm":          "frequency",     # not the volume arm, not the sets-per-ex arm
  "control":      "rear_delts",    # same session, same equipment, left at 2-3x
  "weeks_total":  6,
  "sets_per_ex":  1,               # held at 1 — the frequency arm must not be
                                   # confounded with the per-exercise volume arm
  "readout":      "circumference", # falls back to e1rm if no tape entry exists
  "start":        {...captured at schedule time...},
}
```

Because the intervention is already live in `MANDATORY_ISOLATION_POOL`, the test
object does not need to change programming at all on week 1. It needs to (a) stamp
the start measurement, (b) hold the control muscle at its current frequency for the
block, and (c) refuse to let the exploration bandit probe either muscle while the
block runs, so the two learners do not fight.

Open item before this can read out honestly: there is no tape-measure input today.
Either add the check-in field, or accept e1RM slope on Lateral Raise vs Face Pull
as the readout and note in the result that it is a proxy.

## Build order

1. Session-size fix, mandatory isolations, and the session-size learner: shipped
   2026-08-04.
2. Add the tape-measure check-in field, or accept the e1RM-only readout.
3. Schedule the side-delt frequency test (above) — Nolan wants this started now,
   not deferred.
4. The weekly-volume and sets-per-exercise arms follow, one at a time.
