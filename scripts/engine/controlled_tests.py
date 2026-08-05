"""
controlled_tests.py — Controlled exploration / capacity probes
(ADAPTIVE_ENGINE_DESIGN.md §6).

The system shouldn't only react — it should actively gather information to learn
the athlete's limits. A test writes a controlled_tests row; while active it
nudges the allocator (e.g. a volume-tolerance ramp pushes one muscle above MAV);
on completion it feeds a LOW-noise observation into the §4 learner (a designed
probe is more informative than a passive week).

Rules: one test at a time, never during a cut. This increment implements the
volume-tolerance test end-to-end (it most directly accelerates MRV maturity).
Recovery-stress and running-tolerance scheduling are scaffolded for a follow-on.

Constants tagged [ENG] are tunable.
"""
from __future__ import annotations

RAMP_WEEKS   = 3     # [ENG] weeks to ramp a muscle above MAV
RAMP_STEP    = 2     # [ENG] +sets/wk during the ramp
RAMP_MAX     = 6     # [ENG] cap above MAV
TEST_OBS_VAR = 2.0   # [ENG] designed-test observation noise (< passive OBS_VAR=9)


PST_INTERVAL_DAYS = 28   # [COACH] benchmark every 4 weeks (CARDIO_PROGRAM)


def get_active(tests: list) -> dict | None:
    """The single active test row, if any."""
    for t in tests or []:
        if t.get("status") == "active":
            return t
    return None


def should_schedule_pst(last_pst_date_iso, today, active_pst) -> bool:
    """Schedule a PST diagnostic if none is pending and it's been >=4 weeks."""
    if active_pst:
        return False
    if not last_pst_date_iso:
        return True
    import datetime as _dt
    last = _dt.date.fromisoformat(str(last_pst_date_iso)[:10])
    return (today - last).days >= PST_INTERVAL_DAYS


def schedule_pst_diagnostic(today_iso: str) -> dict:
    """A PST diagnostic reminder (the brief surfaces it; completed when a new
    pst_tests row appears). Orthogonal to volume tests — doesn't block them."""
    return {"test_type": "pst_diagnostic", "status": "active",
            "scheduled_date": today_iso, "target_key": "pst"}


def pick_volume_test_muscle(landmarks_db: dict, emphasis: dict | None = None) -> str | None:
    """Next muscle to probe: among the not-yet-mature muscles, prefer the athlete's
    higher-EMPHASIS focus muscles (CONVERGENCE_AUDIT F2 pairing — those are the ones
    starved of a passive signal and most worth a designed test), breaking ties by
    least-personalized (lowest n_obs)."""
    emphasis = emphasis or {}
    candidates = [m for m, r in landmarks_db.items() if not r.get("mature")]
    if not candidates:
        return None
    # Higher emphasis first, then fewest observations.
    return min(candidates,
               key=lambda m: (-float(emphasis.get(m, 1.0)), int(landmarks_db[m].get("n_obs", 0))))


def can_schedule(active: dict | None, phase: str | None = None) -> bool:
    """One volume-tolerance test at a time. Volume tests DO run during a cut.

    This used to also refuse while `phase == "cut"`. The reasoning was sound in
    isolation: on an energy deficit you cannot separate "recovery-limited at this
    volume" from "the deficit is masking my response."

    But it interacted catastrophically with update_mrv. On a cut the MRV learner has
    exactly two paths, and BOTH were closed:
      - the DOWN-ratchet is suppressed on a cut, by design (F9);
      - the UP-ratchet needs `weekly_sets + 1 > mrv_mean`, and the allocator programs
        roughly half of MRV, so it only ever becomes true DURING a volume-test ramp
        (ramp_target is what pushes a muscle above MAV toward its ceiling).
    Blocking the ramp therefore closed the last remaining path. The athlete has been on
    an open-ended cut since 2026-06-07; every landmark stayed pinned to its population
    prior for the 34 days since, 10 of 16 muscles reached n_obs=0, the weekly set
    targets never changed, and the program was byte-identical week after week.

    The deficit confound is ASYMMETRIC: a deficit can HIDE a response, it cannot
    manufacture one. A muscle that keeps progressing while under-fed has demonstrably
    tolerated that volume — conservative, valid evidence. Only a STALL is ambiguous,
    and that case is already handled: update_mrv refuses to ratchet DOWN on a cut, and
    inflates the observation variance by CUT_OBS_VAR_MULT so a cut-week update nudges
    rather than lurches. Those two guards are what make probing safe while cutting.

    `phase` is retained for call-site compatibility and is deliberately unused.
    """
    return active is None


def schedule_volume_test(muscle: str, mrv_mean: float, today_iso: str) -> dict:
    """A new active volume-tolerance test row."""
    return {
        "test_type": "volume_tolerance",
        "target_key": f"mrv.{muscle}",
        "status": "active",
        "started_at": today_iso,
        "baseline": {"muscle": muscle, "week": 1, "mrv_mean_start": mrv_mean,
                     "best_tolerated": None},
    }


# ── Specialization tests (SPEC_specialization_test.md) ────────────────────────
# A volume-tolerance test looks for a CEILING on one muscle and needs no control.
# A specialization test is a CONTRAST: train one muscle far harder than a matched
# comparator for a block and read the difference. Different question, so the phase
# gate, the completion rule and the observation all differ from volume_tolerance.

SPEC_WEEKS       = 6      # [ENG] block length before the contrast is read out
SPEC_MIN_WEEKS   = 4      # [ENG] refuse to read out earlier than this


def can_schedule_specialization(active: dict | None, phase: str | None = None,
                                muscle: str | None = None,
                                control: str | None = None) -> bool:
    """One test at a time. Runs during a cut (Nolan, 2026-08-04).

    This first refused while `phase == "cut"`, on the grounds that a block raises
    total weekly volume and a deficit can erase a hypertrophy contrast for both arms
    at once. Nolan overrode it, and the override holds up for the arm actually
    running: FREQUENCY costs no extra volume — the lateral raise is already in every
    session and rides outside the exercise count — so the session-size objection does
    not apply to it. He has also been cutting open-ended since 2026-06-07, so a
    cut-gate here is not a delay, it is a cancellation.

    The confound is real and does not go away. It is handled at readout instead of at
    scheduling: the comparison is spec vs a matched CONTROL trained in the same
    deficit, so an energy-availability effect hits both arms and cancels out of the
    contrast. What a deficit can still do is shrink the contrast toward zero, which
    makes a null result weak evidence rather than strong evidence. `result` carries
    the phase for exactly that reason.

    Note the VOLUME and SETS_PER_EX arms do add volume and do fight the session-size
    work. When one of those is scheduled, revisit this — the reasoning above is
    arm-specific, not a blanket clearance.

    Concurrency: one test per MUSCLE SET, not one test globally. A specialization
    block may run alongside an active volume-tolerance ramp when the two touch
    disjoint muscles. The one-at-a-time rule exists so two probes cannot confound
    each other's readout, and probes on disjoint muscles cannot: a calves ramp does
    not enter a side-delt vs rear-delt contrast. Requiring global exclusivity instead
    meant the side-delt block could not start for two more weeks behind a calves ramp
    it has nothing to do with, and Nolan asked for it started now (2026-08-04).

    What this does NOT license is two probes on the same muscle, or on a muscle and
    its own control — those still collide, and the overlap check refuses them.

    `phase` is retained for call-site compatibility and for the result stamp.
    """
    if active is None:
        return True
    if active.get("test_type") == "specialization":
        return False       # never two specialization blocks
    return not (_test_muscles(active) & {muscle, control} if muscle else True)


def _test_muscles(test: dict | None) -> set:
    """Every muscle an active test touches, whatever its type."""
    if not test:
        return set()
    b = test.get("baseline") or {}
    return {m for m in (b.get("muscle"), b.get("control")) if m}


def schedule_specialization_test(muscle: str, control: str, today_iso: str,
                                 arm: str = "frequency", readout: str = "e1rm",
                                 start: dict | None = None,
                                 weeks: int = SPEC_WEEKS,
                                 sets_per_ex: int = 1,
                                 phase: str | None = None) -> dict:
    """A new active specialization test row.

    `arm` names the variable under test and is recorded at schedule time so the
    readout cannot be reinterpreted afterward:
      "frequency"    — sessions per week on the muscle (the side-delt test)
      "volume"       — weekly sets, the Ethier variable
      "sets_per_ex"  — 1 vs 2-3 per station, the arm Nolan volunteered for
    Only one arm moves per block; the others are pinned at their current values.
    """
    return {
        "test_type": "specialization",
        "target_key": f"spec.{muscle}",
        "status": "active",
        "started_at": today_iso,
        "baseline": {"muscle": muscle, "control": control, "arm": arm,
                     "week": 1, "weeks_total": int(weeks),
                     "sets_per_ex": int(sets_per_ex), "readout": readout,
                     "start": start or {},
                     # stamped because a deficit shrinks the contrast toward zero:
                     # a null read on a cut is weak evidence, not strong evidence
                     "phase_at_start": phase,
                     "spec_slopes": [], "control_slopes": []},
    }


def spec_focus_muscle(active: dict | None) -> str | None:
    """The muscle an active specialization block wants placed first in the session.
    Ethier's protocol puts the priority muscle first; `_build_session` already has
    a focus slot, so the block just overrides who owns it."""
    if not active or active.get("test_type") != "specialization":
        return None
    return (active.get("baseline") or {}).get("muscle") or None


def spec_locked_muscles(active: dict | None) -> set:
    """Muscles the exploration bandit must not probe while a block runs.

    Both arms, not just the probed one. A +1-set probe on the CONTROL would quietly
    destroy the contrast the block exists to measure, and a probe on the specialized
    muscle would confound the arm under test with a volume bump."""
    if not active or active.get("test_type") != "specialization":
        return set()
    b = active.get("baseline") or {}
    return {m for m in (b.get("muscle"), b.get("control")) if m}


def step_specialization_test(active: dict, spec_slope, control_slope) -> tuple:
    """Record this week's two slopes, then advance (or complete the block).

    Returns (updated_row, observation_or_None). The observation is the CONTRAST —
    mean spec slope minus mean control slope over the block — in the same
    {"key","obs","obs_var","complete"} shape `step_volume_test` emits.

    Note the contrast is recorded, not fed to a landmark learner. There is no
    frequency landmark for it to update; inventing one to consume this would be
    fabricating a rule the engine does not have. The result row is the finding.
    """
    b = dict(active.get("baseline") or {})
    b["spec_slopes"] = list(b.get("spec_slopes") or [])
    b["control_slopes"] = list(b.get("control_slopes") or [])
    if spec_slope is not None:
        b["spec_slopes"].append(float(spec_slope))
    if control_slope is not None:
        b["control_slopes"].append(float(control_slope))

    week = int(b.get("week", 1))
    weeks_total = int(b.get("weeks_total", SPEC_WEEKS))
    row = dict(active)

    if week < max(SPEC_MIN_WEEKS, weeks_total):
        b["week"] = week + 1
        row["baseline"] = b
        return row, None

    def _mean(xs):
        return (sum(xs) / len(xs)) if xs else None

    s_mean, c_mean = _mean(b["spec_slopes"]), _mean(b["control_slopes"])
    contrast = None if (s_mean is None or c_mean is None) else round(s_mean - c_mean, 4)
    m = b.get("muscle")
    row["baseline"] = b
    row["status"] = "complete"
    row["result"] = {
        "arm": b.get("arm"), "muscle": m, "control": b.get("control"),
        "weeks": week, "readout": b.get("readout"),
        "spec_slope_mean": s_mean, "control_slope_mean": c_mean,
        "phase_at_start": b.get("phase_at_start"),
        "contrast": contrast,
        # honesty flag: e1RM slope is a strength proxy for a hypertrophy question.
        "proxy_readout": b.get("readout") != "circumference",
        "inconclusive": contrast is None,
    }
    return row, {"key": f"spec.{m}", "muscle": m, "obs": contrast,
                 "obs_var": TEST_OBS_VAR, "complete": True}


def ramp_target(active: dict, landmarks_lc: dict) -> dict:
    """During a volume-tolerance ramp, return {muscle: boosted_mrv} so the
    allocator allocates more to the probed muscle (MAV + step·week, capped).
    Uses the current ramp week (1-based)."""
    if not active or active.get("test_type") != "volume_tolerance":
        return {}
    b = active.get("baseline") or {}
    m = b.get("muscle")
    if not m or m not in landmarks_lc:
        return {}
    week = int(b.get("week", 1))
    mav = float(landmarks_lc[m]["mav"])
    return {m: mav + min(RAMP_STEP * week, RAMP_MAX)}


def step_volume_test(active: dict, muscle_slope, soreness_avg: float,
                     week_sets: float) -> tuple:
    """
    Evaluate the just-completed ramp week, then advance (or complete).

    Returns (updated_row, observation_or_None). observation, when present, is
    {"key","obs","obs_var","complete":True} to feed the MRV learner — emitted on
    a stall+sore (over MRV found) or after RAMP_WEEKS.
    """
    b = dict(active.get("baseline") or {})
    m = b.get("muscle")
    week = int(b.get("week", 1))

    responding  = muscle_slope is not None and muscle_slope > 0
    recoverable = soreness_avg < 7.0   # 1-10 scale (check-in 0-3 mapped 1+3v)
    if responding and recoverable:
        b["best_tolerated"] = max(b.get("best_tolerated") or 0, week_sets)

    stalled = (muscle_slope is not None and muscle_slope <= 0) and soreness_avg >= 7.0
    done = stalled or week >= RAMP_WEEKS

    row = dict(active)
    if not done:
        b["week"] = week + 1
        row["baseline"] = b
        return row, None

    best = b.get("best_tolerated") or week_sets
    obs = best if not stalled else max(1, week_sets - 1)
    row["baseline"] = b
    row["status"] = "complete"
    row["result"] = {"observed_mrv": obs, "stalled": bool(stalled), "weeks": week}
    return row, {"key": f"mrv.{m}", "muscle": m, "obs": obs,
                 "obs_var": TEST_OBS_VAR, "complete": True}
