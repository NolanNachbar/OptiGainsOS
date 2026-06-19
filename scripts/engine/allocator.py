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

import math

# ── Goal → muscle relevance (landmark vocab) ──────────────────────────────────
# [COACH] prime movers for the 315/450/500 goal lifts and the PST events.
_RELEVANCE = {
    "strength": {  # bench / squat / deadlift prime movers
        "quads": 1.0, "glutes": 1.0, "hamstrings": 0.9, "chest": 1.0,
        "triceps": 0.8, "shoulders": 0.7, "upper_back": 0.9, "lats": 0.8,
        "biceps": 0.5, "calves": 0.4, "core": 0.6,
        "traps": 0.4, "side_delts": 0.2, "neck": 0.1,  # traps support DL lockout
        "upper_chest": 0.6, "rear_delts": 0.3,  # incline = bench assistance
    },
    "hypertrophy": {m: 1.0 for m in (
        "chest","upper_back","lats","quads","hamstrings","glutes",
        "shoulders","triceps","biceps","calves","core",
        "side_delts","traps","neck","upper_chest","rear_delts")},
    "pst": {  # push-ups / sit-ups / pull-ups (running handled in run plan)
        "chest": 0.9, "triceps": 0.9, "shoulders": 0.8, "core": 1.0,
        "lats": 1.0, "upper_back": 0.9, "biceps": 0.8,
        "quads": 0.5, "glutes": 0.5, "hamstrings": 0.4, "calves": 0.3,
        "traps": 0.4, "neck": 0.3, "side_delts": 0.2,  # neck matters tactically
        "upper_chest": 0.5, "rear_delts": 0.4,
    },
}

from engine.athlete_profile import (
    MAX_ACCESSORY_SETS_PER_MUSCLE_PER_SESSION as _MAX_PER_SESSION,
    HIGH_FREQUENCY_FLOOR as _FREQ_FLOOR,
    per_session_muscle_cap as _per_session_cap,
)

MV_FLOOR = 0.05          # [ENG] stop spending budget below this marginal value
# Inverted-U marginal-value coefficients (doc §2) — these DEFINE the curve shape:
# how aggressively junk volume above MAV is discounted. Named so the shape is a
# documented knob, not a buried literal (CONVERGENCE_AUDIT F11). The MAV→MRV slope
# is the "junk zone" discount and is the most defensible to make learnable later.
MV_BELOW_MEV  = 1.00     # [ENG] full marginal value below MEV (threshold work)
MV_MEV_TO_MAV = 0.80     # [ENG] productive zone, tapering MEV→MAV
MV_MAV_TO_MRV = 0.20     # [ENG] junk zone, steep taper MAV→MRV
# E3: the old MRV was a HARD ceiling — marginal value cliffed to 0 at MRV and the
# greedy refused to fund past it. The evidence refutes that inverted-U: hypertrophy
# keeps climbing (no reversal) to ~25 sets, so MRV is a SOFT recovery-limited
# boundary, not a wall. Marginal benefit stays small-but-positive past MRV; a convex
# RECOVERY COST (rising past MAV, amplified by a state multiplier) is what stops the
# allocator — when recovery cost outweighs the shrinking benefit, not at a fixed line.
MV_AT_MRV            = 0.06   # [ENG] small positive marginal benefit AT the soft MRV
RECOVERY_COST_SCALE  = 0.06   # [ENG] convex recovery-cost at MRV under NEUTRAL state
                              # (= MV_AT_MRV → neutral net≈0 at MRV: focus muscles still
                              # fund to ~MRV, low-priority stop earlier, as before)
SOFT_MRV_OVERSHOOT   = 1.30   # [ENG] numeric backstop ceiling; the recovery-cost term
                              # halts funding before this, but it guards against runaway
# E4: strength and hypertrophy have DIFFERENT volume curves. Strength saturates fast
# (most of it by ~4-6 hard sets on the SBD prime movers); hypertrophy keeps climbing.
# The SBD work supplies the cheap strength stimulus first; past saturation the strength
# goal stops demanding more volume and only hypertrophy/PST drive sets higher. So the
# STRENGTH share of a muscle's weight decays past STR_SAT_SETS while the rest persists —
# strength is "funded from the SBD work, hypertrophy climbs on top," not a blended scalar.
STR_SAT_SETS  = 5.0   # [COACH] weekly hard sets at which strength is ~saturated (learnable)
STR_SAT_SCALE = 2.0   # [ENG] how fast the strength weight share decays past saturation
# recovery_budget auto-regulation band (REPLACES deloads — gentle, continuous).
R_RECOVERY_MIN  = 0.80   # [ENG] deep fatigue trims volume modestly, never sandbags
R_RECOVERY_MAX  = 1.15   # [ENG] freshness flexes the budget toward MRV territory
R_RECOVERY_GAIN = 0.02   # [ENG] sets of budget scale per unit TSB
R_PHASE_CUT     = 0.8    # [ENG] systemic (whole-budget) cut volume scalar. The per-muscle
                         # deficit effect rides E9's recovery_cost_mult (E3 cost term), which
                         # is complementary: this scales total budget, that reshapes per-muscle cost.
# Low per-session muscle volume (Nolan's philosophy) → weekly sets are delivered
# by FREQUENCY, not by piling sets onto one day. Sourced from athlete_profile so
# the allocator and session generator can't disagree on the cap.
MAX_SETS_PER_MUSCLE_PER_SESSION = _MAX_PER_SESSION


def default_goal_priorities(training_phase: str | None) -> dict:
    """[ENG] BUD/S prep weights conditioning; otherwise hypertrophy-primary.

    Hypertrophy is the primary objective (pursued through SBD); strength and PST
    are real concurrent secondaries held at MAINTENANCE, not crushed. One blended
    weight set, no rotating phase profiles — both adaptations advance together at
    these volumes (E1; concurrent-training research 2026-06-18). The BUD/S-prep
    branch still weights conditioning for that explicit context."""
    if (training_phase or "").lower() in ("buds_prep", "tactical"):
        return {"strength": 0.35, "hypertrophy": 0.25, "pst": 0.40}
    return {"hypertrophy": 0.40, "strength": 0.30, "pst": 0.30}


def recovery_budget(landmarks: dict, tsb: float, phase: str | None) -> float:
    """
    Systemic weekly set budget = Σ MAV, scaled by recovery (TSB) and diet phase.
    Fresh (TSB>0) flexes the budget up toward MRV territory; fatigue/cut pull it
    down. [ENG] coefficients.
    """
    mav_sum = sum(float(lm.get("mav", 0)) for lm in landmarks.values())
    # Gentle, continuous volume auto-regulation (this REPLACES deloads — there is no
    # programmed deload by design). Floored so deep fatigue trims modestly, never
    # sandbags. NOTE (F10): the budget base is Σ MAV, a population PRIOR that is not
    # itself learned (the §6.1 recovery-stress test that would learn it is unbuilt
    # and out of scope — Nolan's philosophy is to autoregulate via this band, not to
    # learn a separate recovery-capacity budget). So total weekly volume tracks the
    # prior ΣMAV scaled only by TSB and cut phase. [ENG]
    r_recovery = max(R_RECOVERY_MIN, min(R_RECOVERY_MAX, 1.0 + R_RECOVERY_GAIN * float(tsb or 0.0)))
    r_phase = R_PHASE_CUT if (phase or "").lower() == "cut" else 1.0
    return mav_sum * r_recovery * r_phase


def goal_weights(goal_priorities: dict, deadline_mult: dict, muscles,
                 muscle_emphasis: dict = None) -> dict:
    """w[m] = Σ_goal priority[goal] · relevance[goal][m] · deadline_mult[goal],
    scaled by the athlete's per-muscle emphasis (1.0 = neutral). Emphasis feeds
    both MEV funding order and marginal value, so a focused muscle is funded
    early and keeps receiving sets deeper into the budget."""
    muscle_emphasis = muscle_emphasis or {}
    w = {}
    for m in muscles:
        w[m] = sum(
            float(goal_priorities.get(g, 0.0))
            * float(_RELEVANCE.get(g, {}).get(m, 0.0))
            * float(deadline_mult.get(g, 1.0))
            for g in _RELEVANCE
        ) * float(muscle_emphasis.get(m, 1.0))
    return w


def strength_weights(goal_priorities: dict, deadline_mult: dict, muscles,
                     muscle_emphasis: dict = None) -> dict:
    """The STRENGTH-only share of each muscle's blended weight (same formula as
    goal_weights but the strength goal only). E4 uses this to let the strength demand
    saturate (~STR_SAT_SETS) while the hypertrophy/PST share keeps driving volume —
    the SBD sets are credited toward both, strength just stops asking for MORE first."""
    muscle_emphasis = muscle_emphasis or {}
    rel = _RELEVANCE.get("strength", {})
    p   = float(goal_priorities.get("strength", 0.0)) * float(deadline_mult.get("strength", 1.0))
    return {m: p * float(rel.get(m, 0.0)) * float(muscle_emphasis.get(m, 1.0)) for m in muscles}


def marginal_benefit(s: float, lm: dict) -> float:
    """Diminishing-returns marginal HYPERTROPHY benefit of the next set (Core Volume
    Model). Unlike the old inverted-U it never cliffs to 0 at MRV: past MRV it decays
    toward 0 but stays positive (no reversal of gains within the trained range)."""
    mev, mav, mrv = float(lm["mev"]), float(lm["mav"]), float(lm["mrv"])
    if s < mev:
        return MV_BELOW_MEV
    if s < mav:
        return MV_MEV_TO_MAV * (1 - (s - mev) / max(1e-6, mav - mev))
    if s < mrv:
        # productive→junk taper, now landing on a small positive value at MRV
        frac = (s - mav) / max(1e-6, mrv - mav)
        return MV_MAV_TO_MRV + (MV_AT_MRV - MV_MAV_TO_MRV) * frac
    # Past the soft boundary: shrinking-but-positive tail (one MAV→MRV span ≈ 1/e).
    span = max(1e-6, mrv - mav)
    return MV_AT_MRV * math.exp(-(s - mrv) / span)


def recovery_cost(s: float, lm: dict, rc_mult: float = 1.0) -> float:
    """Convex recovery cost of the next set: ~0 below MAV, rising past it, anchored so
    that under NEUTRAL state (rc_mult=1) it equals the marginal benefit at MRV. A
    higher rc_mult (caloric deficit / accumulated fatigue — E9) raises the cost and
    compresses recoverable volume; a lower one (freshness) lets it climb past MRV."""
    mav, mrv = float(lm["mav"]), float(lm["mrv"])
    over = max(0.0, (s - mav) / max(1e-6, mrv - mav))
    return RECOVERY_COST_SCALE * max(0.0, rc_mult) * over * over


def effective_weight(s: float, w: float, w_strength: float = 0.0) -> float:
    """E4: the strength share of the weight saturates ~STR_SAT_SETS (strength is cheap
    and SBD-supplied); past that only the hypertrophy/PST share drives more volume. The
    strength share decays exponentially past saturation; the remainder is unchanged.
    Below saturation the full blended weight applies (strength + hypertrophy both want
    the early sets — the SBD sets are credited to both)."""
    if w_strength <= 0.0 or s < STR_SAT_SETS:
        return w
    decay = math.exp(-(s - STR_SAT_SETS) / STR_SAT_SCALE)
    return max(0.0, w - w_strength * (1.0 - decay))


def marginal_value(s: float, w: float, lm: dict, rc_mult: float = 1.0,
                   w_strength: float = 0.0) -> float:
    """Net marginal value of the next set: priority-weighted (benefit − recovery cost).
    Replaces the hard-MRV inverted-U (E3). The greedy stops a muscle when this drops
    below MV_FLOOR — i.e. when recovery cost outweighs the shrinking benefit, not at a
    fixed ceiling. E4: the strength share of the weight saturates early (effective_weight)
    so hypertrophy, not a blended strength scalar, carries the high-volume tail."""
    w_eff = effective_weight(s, w, w_strength)
    return w_eff * (marginal_benefit(s, lm) - recovery_cost(s, lm, rc_mult))


def allocate(budget: float, weights: dict, landmarks: dict,
             recovery_cost_mult: float = 1.0, str_weights: dict = None) -> dict:
    """Greedy: fund MEV for prioritized muscles first, then spend remaining budget one
    set at a time on the highest NET marginal value (benefit − recovery cost). E3: no
    hard MRV cap — a muscle stops accruing volume when its net marginal value falls
    below MV_FLOOR (recovery cost outweighs benefit), which under neutral state lands
    near MRV and under a deficit (recovery_cost_mult>1) compresses below it. A numeric
    backstop at MRV·SOFT_MRV_OVERSHOOT guards against runaway only. E4: str_weights (the
    per-muscle strength share) lets the strength demand saturate early so hypertrophy
    carries the high-volume tail."""
    str_weights = str_weights or {}
    muscles = [m for m in landmarks if weights.get(m, 0) > 0]
    sets = {m: 0 for m in muscles}
    B = float(budget)

    # 1. Fund MEV (threshold is non-negotiable), highest-weight first.
    for m in sorted(muscles, key=lambda x: weights[x], reverse=True):
        need = int(landmarks[m]["mev"])
        take = int(min(need, max(0, B)))
        sets[m] += take
        B -= take

    # 2. Spend the rest on net marginal value (no hard ceiling; soft backstop only).
    guard = 0
    while B > 0 and guard < 5000:
        guard += 1
        best_m, best_v = None, MV_FLOOR
        for m in muscles:
            if sets[m] >= landmarks[m]["mrv"] * SOFT_MRV_OVERSHOOT:
                continue  # numeric runaway backstop, not the inverted-U wall
            v = marginal_value(sets[m], weights[m], landmarks[m], recovery_cost_mult,
                               str_weights.get(m, 0.0))
            if v > best_v:
                best_m, best_v = m, v
        if best_m is None:
            break
        sets[best_m] += 1
        B -= 1
    return sets


def frequency_targets(set_targets: dict, days_available: int,
                      learned_freq: dict = None) -> dict:
    """Sessions/week per muscle: spread sets so no session exceeds the per-muscle
    cap, honoring the high-frequency preference (≥2 exposures once volume allows).
    A LEARNED (mature) frequency for a muscle overrides the set-based default."""
    learned_freq = learned_freq or {}
    freq = {}
    for m, s in set_targets.items():
        if s <= 0:
            freq[m] = 0
            continue
        if learned_freq.get(m):
            freq[m] = min(int(learned_freq[m]), max(1, days_available))
            continue
        # Per-muscle session cap — higher for fast-recovery muscles so a learned high
        # MRV (e.g. calves/side_delts 24) stays deliverable within days_available (F5).
        cap = _per_session_cap(m)
        f = max(1, -(-int(s) // cap))  # ceil
        # High-frequency preference: once a muscle has real weekly volume, train it
        # often (low sets each visit) rather than dumping it in one session.
        if s >= cap:
            f = max(f, _FREQ_FLOOR)
        elif s >= 4:
            f = max(f, 2)
        freq[m] = min(f, max(1, days_available))
    return freq


# E13 run-plan priors (learnable [ENG]). The run layer is the PST SPEED layer, not the
# aerobic base — the high-volume Zone-2 base belongs on the bike/pool (low interference,
# see hypertrophy_volume.MODALITY_INTERFERENCE). Runs stay polarized and short.
RUN_QUALITY_FLOOR      = 1    # maintenance dose: hard run quality never drops to zero
RUN_QUALITY_CAP        = 2    # keep the split polarized — small hard fraction (~80/20 by time)
RUN_CONTINUOUS_CAP_MIN = 45   # cap continuous easy/long run duration (interference ∝ duration)
RUN_INTERVAL_CAP_MIN   = 30   # hard interval/PST-pace sessions stay short


def build_run_plan(days_available: int, vdot_gap: float, pst_mult: float) -> list:
    """Explicit polarized (~80/20 by time) run plan: a SMALL hard fraction (threshold /
    VO2 / PST-pace) scaled by the PST readiness gap — never a peak or taper — over a mostly
    easy Zone-2 base. Hard quality is floored at a maintenance dose (RUN_QUALITY_FLOOR;
    VO2max holds on ~2 quality sessions/wk) so it is never zeroed, and capped so the plan
    stays polarized. Continuous runs are duration-capped (interference scales with duration);
    the long low-intensity aerobic base belongs on the bike/pool, so these runs are the speed
    layer, not the base. Each session is intensity-tagged with a duration cap. [ENG]"""
    hard = RUN_QUALITY_CAP if (pst_mult > 1.15 or (vdot_gap or 0) > 3) else RUN_QUALITY_FLOOR
    hard = max(RUN_QUALITY_FLOOR, min(hard, max(1, days_available - 1)))  # leave room for ≥1 easy
    easy = max(0, min(2, days_available - hard - 1))
    runs = [{"type": "interval", "count": hard, "intensity": "hard",
             "max_minutes": RUN_INTERVAL_CAP_MIN},
            {"type": "long", "count": 1, "intensity": "easy",
             "max_minutes": RUN_CONTINUOUS_CAP_MIN},
            {"type": "easy", "count": easy, "intensity": "easy",
             "max_minutes": RUN_CONTINUOUS_CAP_MIN}]
    return [r for r in runs if r["count"] > 0]


def plan_week(landmarks: dict, tsb: float, phase: str | None,
              goal_priorities: dict, deadline_mult: dict,
              days_available: int = 6, vdot_gap: float = 0.0,
              learned_freq: dict = None, muscle_emphasis: dict = None,
              recovery_cost_mult: float = 1.0) -> dict:
    """Top-level: produce the full weekly plan dict. `recovery_cost_mult` (default 1.0,
    neutral) scales the E3 recovery-cost term: >1 compresses recoverable volume under a
    deficit / accumulated fatigue (wired by the nutrition modulator, E9), <1 lets it
    climb when fresh."""
    muscles = list(landmarks.keys())
    B = recovery_budget(landmarks, tsb, phase)
    w = goal_weights(goal_priorities, deadline_mult, muscles, muscle_emphasis)
    # E4: strength share saturates early; hypertrophy carries the high-volume tail.
    w_str = strength_weights(goal_priorities, deadline_mult, muscles, muscle_emphasis)
    set_targets = allocate(B, w, landmarks, recovery_cost_mult, w_str)
    freq = frequency_targets(set_targets, days_available, learned_freq)
    runs = build_run_plan(days_available, vdot_gap, deadline_mult.get("pst", 1.0))
    return {
        "set_targets": set_targets,
        "frequency_targets": freq,
        "run_plan": runs,
        "budget": round(B, 1),
        "weights": {m: round(v, 3) for m, v in w.items()},
    }
