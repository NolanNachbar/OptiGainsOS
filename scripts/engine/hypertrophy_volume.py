"""
hypertrophy_volume.py — Per-muscle MEV/MAV/MRV landmark tracking.

Landmarks adapt based on:
  - Performance slope (e1RM trend)
  - Soreness history
  - Caloric deficit
  - Running volume (lower-body interference)
"""

MUSCLES = [
    "chest", "upper_back", "lats", "quads", "hamstrings",
    "glutes", "shoulders", "triceps", "biceps", "calves", "core",
    # First-class focus muscles (split out of shoulders/upper_back/chest so the
    # allocator can target them directly): SBD covers the prime movers, so the
    # regions it leaves behind get their own landmarks and emphasis.
    "side_delts", "traps", "neck", "upper_chest", "rear_delts",
]

# Muscles with lower baseline volume capacity (isolation / small)
_ISOLATION_MUSCLES = {"triceps", "biceps"}

# Lower body muscles affected by running interference
_LOWER_BODY_MUSCLES = {"quads", "hamstrings", "calves", "glutes"}
RUNNING_OMEGA = 0.05   # [ENG] lower-body MRV sets shed per weighted interference-km

# E13: endurance modality/intensity interference weights (learnable [COACH] priors, not
# fixed law). Running interferes with leg hypertrophy far more than cycling (Type I SMD
# −0.81 vs no significant cycling effect); swimming is mechanistically lowest (non-weight-
# bearing, concentric-biased). CONTINUOUS steady running costs more than short HIIT/PST-
# pace work. So the high-volume aerobic BASE should be cycling/swimming (also 2 of 3
# Ironman disciplines) and running confined to HIIT/PST pace — this weighting is what makes
# the engine prefer that structure instead of treating all endurance as one generic penalty.
MODALITY_INTERFERENCE = {
    "running_continuous": 1.00,   # weight-bearing eccentric, steady — worst for legs
    "running":            1.00,   # alias: unqualified running treated as continuous
    "running_hiit":       0.55,   # PST-pace / intervals: shorter, less eccentric volume
    "cycling":            0.25,   # concentric, non-impact — low leg-hypertrophy interference
    "swimming":           0.10,   # non-weight-bearing — lowest
}


def _apply_interference_reduction(landmarks_lc: dict, reduction: float) -> dict:
    """Shared core: subtract `reduction` MRV sets from each lower-body muscle in place,
    flooring MRV at mev+1 (a MAINTENANCE floor — running never zeros leg volume, E13
    bullet 5) and keeping MAV < MRV."""
    if reduction <= 0:
        return landmarks_lc
    for m in _LOWER_BODY_MUSCLES:
        lm = landmarks_lc.get(m)
        if not lm:
            continue
        lm["mrv"] = max(float(lm["mev"]) + 1, round(float(lm["mrv"]) - reduction))
        lm["mav"] = min(float(lm["mav"]), lm["mrv"] - 1)
    return landmarks_lc


def endurance_interference_km(modality_km: dict) -> float:
    """E13: weighted interference-equivalent km from a per-modality volume dict, e.g.
    {'running_continuous': 20, 'running_hiit': 5, 'cycling': 40, 'swimming': 30}. Running
    (especially continuous) dominates; cycling/swimming contribute little, so loading the
    aerobic base on the bike/pool barely dents leg recoverable volume. Unknown modalities
    are treated as continuous running (the conservative worst case)."""
    worst = MODALITY_INTERFERENCE["running_continuous"]
    return sum(MODALITY_INTERFERENCE.get(mode, worst) * max(0.0, float(km or 0))
               for mode, km in (modality_km or {}).items())


def apply_running_interference(landmarks_lc: dict, weekly_km: float,
                               omega: float = RUNNING_OMEGA) -> dict:
    """
    Subtract per-muscle running interference from a LIVE allocator landmarks dict
    (lowercase mev/mav/mrv), in place, flooring MRV at mev+1 and keeping MAV<MRV.
    Backward-compatible running-only path: total weekly_km is treated as CONTINUOUS
    running (weight 1.0). For modality-aware interference use apply_endurance_interference.

    CONVERGENCE_AUDIT F6: the engine computed this per-muscle lower-body interference
    but only on the discarded in-memory volume engine, so it never reached the plan.
    This applies it to the same `landmarks_lc` the allocator actually reads. The CUT
    is deliberately NOT applied here — the systemic recovery_budget r_phase=0.8 scalar
    already trims cut volume, and stacking a per-muscle cut on top would double-count.
    """
    return _apply_interference_reduction(landmarks_lc, omega * max(0.0, float(weekly_km or 0)))


def apply_endurance_interference(landmarks_lc: dict, modality_km: dict,
                                 omega: float = RUNNING_OMEGA) -> dict:
    """E13: modality-aware interference. `modality_km` maps each endurance modality
    (running_continuous / running_hiit / cycling / swimming) to weekly km; the weighted
    interference-km drives the lower-body MRV reduction. Cycling/swimming volume costs a
    fraction of the equivalent running km, so the engine can carry a large aerobic base
    without crushing leg hypertrophy. Same MAINTENANCE floor (MRV ≥ mev+1) as the
    running-only path. Cut is still left to r_phase (no double-count)."""
    return _apply_interference_reduction(landmarks_lc, omega * endurance_interference_km(modality_km))

# ── Canonical per-muscle landmark PRIORS (sets/wk) ────────────────────────────
# SINGLE SOURCE OF TRUTH for MEV/MAV/MRV. Replaces the old generic {6,12,18} /
# {4,8,12} constants AND the duplicate per-muscle table that lived in
# compute_athlete_state.MUSCLE_TARGETS (which now derives from this). [COACH]
# Israetel-style per-muscle defaults; the Bayesian learner overrides per athlete.
# Keyed in the LANDMARK vocab (the vocab the volume engine learns on).
LANDMARK_PRIORS: dict[str, dict] = {
    "chest":      {"mev": 8,  "mav": 14, "mrv": 20},
    "upper_back": {"mev": 10, "mav": 16, "mrv": 22},
    "lats":       {"mev": 10, "mav": 16, "mrv": 22},
    "quads":      {"mev": 8,  "mav": 14, "mrv": 20},
    "hamstrings": {"mev": 6,  "mav": 12, "mrv": 16},
    "glutes":     {"mev": 6,  "mav": 12, "mrv": 16},
    "shoulders":  {"mev": 6,  "mav": 12, "mrv": 18},
    "triceps":    {"mev": 8,  "mav": 14, "mrv": 18},
    "biceps":     {"mev": 8,  "mav": 14, "mrv": 20},
    "calves":     {"mev": 8,  "mav": 16, "mrv": 24},
    "core":       {"mev": 0,  "mav": 12, "mrv": 16},
    # DIRECT sets only (indirect work from presses/rows/deadlifts not counted).
    # All three recover fast and tolerate high frequency. "shoulders" above now
    # means front/rear delt + overhead pressing; lateral-raise work counts here.
    "side_delts": {"mev": 8,  "mav": 16, "mrv": 24},
    "traps":      {"mev": 4,  "mav": 10, "mrv": 16},
    "neck":       {"mev": 4,  "mav": 8,  "mrv": 12},
    # "chest" above is flat-press dominated (the bench work); upper_chest counts
    # incline pressing/fly work only. rear_delts split from "shoulders" — rows
    # feed them indirectly but direct work is what moves them.
    "upper_chest": {"mev": 6, "mav": 12, "mrv": 18},
    "rear_delts":  {"mev": 6, "mav": 12, "mrv": 18},
}

# Exercise-catalog muscle name -> canonical landmark vocab.
# side_delt/rear_delt/traps/upper_chest are no longer lumped into bigger groups —
# they are first-class landmarks so they can be prioritized and learned
# independently. "shoulders" now means front delts + overhead pressing.
MUSCLE_ALIAS: dict[str, str] = {
    "front_delt": "shoulders", "side_delt": "side_delts", "rear_delt": "rear_delts",
    "delts": "shoulders", "abs": "core",
    "back": "upper_back", "lower_back": "upper_back",
}


def _default_landmarks(muscle: str) -> dict:
    """Per-muscle priors (uppercase keys for the engine's internal use)."""
    p = LANDMARK_PRIORS.get(muscle)
    if p is None:
        p = {"mev": 4, "mav": 8, "mrv": 12} if muscle in _ISOLATION_MUSCLES \
            else {"mev": 6, "mav": 12, "mrv": 18}
    return {"MEV": p["mev"], "MAV": p["mav"], "MRV": p["mrv"]}


class HypertrophyVolumeEngine:
    """
    Tracks and adapts MEV/MAV/MRV landmarks per muscle group.
    """

    def __init__(self, muscles=None):
        self.muscles = list(muscles or MUSCLES)
        self.landmarks: dict[str, dict] = {
            m: _default_landmarks(m) for m in self.muscles
        }

    # ── Landmark adaptation ────────────────────────────────────────────────────

    def update_landmarks(
        self,
        muscle: str,
        performance_slope: float,
        soreness_history: list,
    ) -> dict:
        """
        Adjust MRV/MAV for a single muscle.

        Rules:
          - slope < 0 AND avg_soreness > 7 → MRV -= 1 (overreaching signal)
          - slope > 0.10                   → MAV = min(MRV-1, MAV + 0.5)

        Returns updated landmark dict for the muscle.
        """
        if muscle not in self.landmarks:
            self.landmarks[muscle] = _default_landmarks(muscle)

        lm = self.landmarks[muscle]
        avg_soreness = (sum(soreness_history) / len(soreness_history)
                        if soreness_history else 0.0)

        if performance_slope < 0 and avg_soreness > 7:
            lm["MRV"] = max(lm["MEV"] + 1, lm["MRV"] - 1)

        if performance_slope > 0.10:
            lm["MAV"] = min(lm["MRV"] - 1, lm["MAV"] + 0.5)
            # Round to nearest 0.5 for cleanliness
            lm["MAV"] = round(lm["MAV"] * 2) / 2

        self.landmarks[muscle] = lm
        return dict(lm)

    def learn_from_response(
        self,
        muscle_slopes: dict,
        soreness_by_muscle: dict,
    ) -> dict:
        """
        Adapt every muscle's landmarks from its own measured response.

        muscle_slopes      {muscle: e1RM-per-session slope} — the performance
                           signal. Muscles absent from this dict have NO real
                           strength signal yet, so their landmarks are left
                           untouched (we don't move a landmark on noise).
        soreness_by_muscle {muscle: [soreness, …]} from the check-in snapshot.

        Returns {muscle: updated_landmark_dict} for the muscles that moved.
        This closes the N=1 volume-landmark loop: MRV ratchets down only when
        a muscle is both stalling AND sore, MAV creeps up while it's responding.
        """
        updated = {}
        for muscle, slope in muscle_slopes.items():
            if muscle not in self.landmarks:
                continue
            updated[muscle] = self.update_landmarks(
                muscle, slope, soreness_by_muscle.get(muscle, [])
            )
        return updated

    def adjust_for_caloric_deficit(
        self,
        kcal_deficit: float,
        kcal_maintenance: float,
    ) -> None:
        """
        Scale MRV down proportionally to caloric deficit.

        MRV_adj = MRV_base * (1.0 - 0.75 * deficit / maintenance)
        Capped at 0.65× baseline (never below 65% of original).
        """
        if kcal_maintenance <= 0:
            return
        ratio    = max(0.0, min(kcal_deficit / kcal_maintenance, 1.0))
        scale    = max(0.65, 1.0 - 0.75 * ratio)
        for m in self.muscles:
            lm = self.landmarks[m]
            default_mrv = _default_landmarks(m)["MRV"]
            lm["MRV"] = max(lm["MEV"] + 1, round(default_mrv * scale))

    def adjust_for_running(self, weekly_km: float, omega: float = 0.05) -> None:
        """
        Reduce lower-body MRV proportionally to weekly running volume.

        reduction = omega * weekly_km sets, subtracted from the BASELINE MRV
        (mirrors adjust_for_caloric_deficit) — never from the previously-saved
        value, so repeated runs at constant mileage don't compound the cut.
        """
        reduction = omega * max(0.0, weekly_km)
        for m in _LOWER_BODY_MUSCLES:
            if m not in self.landmarks:
                continue
            lm  = self.landmarks[m]
            mev = lm["MEV"]
            lm["MRV"] = max(mev + 1, round(_default_landmarks(m)["MRV"] - reduction))

    # ── Accessors ──────────────────────────────────────────────────────────────

    def get_mrv_dict(self) -> dict:
        """Return {muscle: MRV_value}."""
        return {m: self.landmarks[m]["MRV"] for m in self.muscles}

    # ── Serialisation ──────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "muscles":   self.muscles,
            "landmarks": self.landmarks,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "HypertrophyVolumeEngine":
        obj = cls(muscles=d.get("muscles"))
        if "landmarks" in d:
            for m, lm in d["landmarks"].items():
                obj.landmarks[m] = lm
        return obj
