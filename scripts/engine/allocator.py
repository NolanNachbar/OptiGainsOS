"""
allocator.py — Weekly volume allocator (ADAPTIVE_ENGINE_DESIGN.md §2).

Greedy marginal-value allocation of weekly sets across muscles under a systemic
recovery budget, then a run plan and per-muscle frequency. This is the keystone
that makes the program adaptive: it allocates volume toward the athlete's goals,
bounded by his LEARNED landmarks and current recovery, instead of a fixed split.

Budget note vs the design doc: the doc sketched B = days/wk × max-sets/day. This
implementation uses a MAV-anchored budget instead — B = Σ MAV scaled by recovery
and phase — because it self-scales on the athlete's own learned landmarks and
doesn't require guessing a per-day cap. [ENG]

All tunable constants are tagged [ENG]; landmark numbers are [COACH] priors that
the learner overrides.
"""
from __future__ import annotations

# ── Goal → muscle relevance (landmark vocab) ──────────────────────────────────
# [COACH] prime movers for the 315/450/500 goal lifts and the PST events.
_RELEVANCE = {
    "strength": {  # bench / squat / deadlift prime movers
        "quads": 1.0, "glutes": 1.0, "hamstrings": 0.9, "chest": 1.0,
        "triceps": 0.8, "shoulders": 0.7, "upper_back": 0.9, "lats": 0.8,
        "biceps": 0.5, "calves": 0.4, "core": 0.6,
    },
    "hypertrophy": {m: 1.0 for m in (
        "chest","upper_back","lats","quads","hamstrings","glutes",
        "shoulders","triceps","biceps","calves","core")},
    "pst": {  # push-ups / sit-ups / pull-ups (running handled in run plan)
        "chest": 0.9, "triceps": 0.9, "shoulders": 0.8, "core": 1.0,
        "lats": 1.0, "upper_back": 0.9, "biceps": 0.8,
        "quads": 0.5, "glutes": 0.5, "hamstrings": 0.4, "calves": 0.3,
    },
}

MV_FLOOR = 0.05          # [ENG] stop spending budget below this marginal value
MAX_SETS_PER_MUSCLE_PER_SESSION = 5   # [ENG] supports high-frequency distribution


def default_goal_priorities(training_phase: str | None) -> dict:
    """[ENG] BUD/S prep weights conditioning; otherwise balanced toward strength."""
    if (training_phase or "").lower() in ("buds_prep", "tactical"):
        return {"strength": 0.35, "hypertrophy": 0.25, "pst": 0.40}
    return {"strength": 0.40, "hypertrophy": 0.30, "pst": 0.30}


def recovery_budget(landmarks: dict, tsb: float, phase: str | None) -> float:
    """
    Systemic weekly set budget = Σ MAV, scaled by recovery (TSB) and diet phase.
    Fresh (TSB>0) flexes the budget up toward MRV territory; fatigue/cut pull it
    down. [ENG] coefficients.
    """
    mav_sum = sum(float(lm.get("mav", 0)) for lm in landmarks.values())
    # Gentle, continuous volume auto-regulation (this REPLACES deloads). Floor at
    # 0.8 so deep fatigue trims volume modestly, never sandbags. [ENG] — tunable.
    r_recovery = max(0.80, min(1.15, 1.0 + 0.02 * float(tsb or 0.0)))
    r_phase = 0.8 if (phase or "").lower() == "cut" else 1.0
    return mav_sum * r_recovery * r_phase


def goal_weights(goal_priorities: dict, deadline_mult: dict, muscles) -> dict:
    """w[m] = Σ_goal priority[goal] · relevance[goal][m] · deadline_mult[goal]."""
    w = {}
    for m in muscles:
        w[m] = sum(
            float(goal_priorities.get(g, 0.0))
            * float(_RELEVANCE.get(g, {}).get(m, 0.0))
            * float(deadline_mult.get(g, 1.0))
            for g in _RELEVANCE
        )
    return w


def marginal_value(s: float, w: float, lm: dict) -> float:
    """Inverted-U marginal value of the next set (doc §2). 0 at/above MRV."""
    mev, mav, mrv = float(lm["mev"]), float(lm["mav"]), float(lm["mrv"])
    if s < mev:
        base = 1.00
    elif s < mav:
        base = 0.80 * (1 - (s - mev) / max(1e-6, mav - mev))
    elif s < mrv:
        base = 0.20 * (1 - (s - mav) / max(1e-6, mrv - mav))
    else:
        base = 0.0
    return w * base


def allocate(budget: float, weights: dict, landmarks: dict) -> dict:
    """Greedy: fund MEV for prioritized muscles first, then spend remaining
    budget one set at a time on the highest marginal value, capped at MRV."""
    muscles = [m for m in landmarks if weights.get(m, 0) > 0]
    sets = {m: 0 for m in muscles}
    B = float(budget)

    # 1. Fund MEV (threshold is non-negotiable), highest-weight first.
    for m in sorted(muscles, key=lambda x: weights[x], reverse=True):
        need = int(landmarks[m]["mev"])
        take = int(min(need, max(0, B)))
        sets[m] += take
        B -= take

    # 2. Spend the rest on marginal value.
    guard = 0
    while B > 0 and guard < 5000:
        guard += 1
        best_m, best_v = None, MV_FLOOR
        for m in muscles:
            if sets[m] >= landmarks[m]["mrv"]:
                continue
            v = marginal_value(sets[m], weights[m], landmarks[m])
            if v > best_v:
                best_m, best_v = m, v
        if best_m is None:
            break
        sets[best_m] += 1
        B -= 1
    return sets


def frequency_targets(set_targets: dict, days_available: int) -> dict:
    """Sessions/week per muscle: spread sets so no session exceeds the per-muscle
    cap, honoring the high-frequency preference (≥2 exposures once volume allows)."""
    freq = {}
    for m, s in set_targets.items():
        if s <= 0:
            freq[m] = 0
            continue
        f = max(1, -(-int(s) // MAX_SETS_PER_MUSCLE_PER_SESSION))  # ceil
        if s >= 6:
            f = max(f, 2)
        freq[m] = min(f, max(1, days_available))
    return freq


def build_run_plan(days_available: int, vdot_gap: float, pst_mult: float) -> list:
    """Lightweight polarized run plan: more quality as the PST deadline nears /
    the VDOT gap is large. [ENG] — full running optimization is a later increment."""
    quality = 2 if (pst_mult > 1.15 or (vdot_gap or 0) > 3) else 1
    runs = [{"type": "interval", "count": quality},
            {"type": "long", "count": 1},
            {"type": "easy", "count": max(0, min(2, days_available - quality - 1))}]
    return [r for r in runs if r["count"] > 0]


def plan_week(landmarks: dict, tsb: float, phase: str | None,
              goal_priorities: dict, deadline_mult: dict,
              days_available: int = 6, vdot_gap: float = 0.0) -> dict:
    """Top-level: produce the full weekly plan dict."""
    muscles = list(landmarks.keys())
    B = recovery_budget(landmarks, tsb, phase)
    w = goal_weights(goal_priorities, deadline_mult, muscles)
    set_targets = allocate(B, w, landmarks)
    freq = frequency_targets(set_targets, days_available)
    runs = build_run_plan(days_available, vdot_gap, deadline_mult.get("pst", 1.0))
    return {
        "set_targets": set_targets,
        "frequency_targets": freq,
        "run_plan": runs,
        "budget": round(B, 1),
        "weights": {m: round(v, 3) for m, v in w.items()},
    }
