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
