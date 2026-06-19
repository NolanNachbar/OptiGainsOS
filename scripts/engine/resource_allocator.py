"""
resource_allocator.py — Reserve-based volume scaling.

Systemic reserve is derived from HRV z-score; low reserve triggers
sacrificial cuts to isolation work while protecting tactical and
powerlifting muscles.
"""

import numpy as np

_TACTICAL_DEFAULT    = {"quads", "hamstrings", "calves", "chest", "upper_back", "lats"}
_POWERLIFTING_DEFAULT = {"chest", "quads", "hamstrings", "upper_back", "lats", "glutes"}
_ISOLATION_MUSCLES   = {"triceps", "biceps", "shoulders", "calves"}


def compute_reserve_score(hrv_z_3d: float) -> float:
    """
    Map 3-day HRV z-score to a systemic reserve scalar in [0.1, 1.0].

    z >= 0 → 1.0  (fully recovered)
    z <  0 → max(0.1, 1.0 + z/3.0)
    """
    if hrv_z_3d >= 0.0:
        return 1.0
    return max(0.1, 1.0 + hrv_z_3d / 3.0)


def allocate_constrained_resources(
    systemic_reserve_score: float,
    allocation_matrix: np.ndarray,
    muscle_groups: list,
    tactical_muscles: set = None,
    powerlifting_muscles: set = None,
) -> tuple:
    """
    Apply reserve-based scaling to the MILP allocation matrix.

    Args:
        systemic_reserve_score   Float [0.1, 1.0] from compute_reserve_score()
        allocation_matrix        np.ndarray shape (n_muscles, 7)
        muscle_groups            List of muscle names matching matrix row order
        tactical_muscles         Muscles protected from cuts (BUD/S relevant)
        powerlifting_muscles     Muscles where intensity factor is tracked

    Returns:
        (adjusted_matrix, metadata)
        metadata keys:
          "powerlifting_intensity_factor"  float
          "cuts_applied"                   bool
          "reserve_score"                  float
    """
    if tactical_muscles is None:
        tactical_muscles = _TACTICAL_DEFAULT
    if powerlifting_muscles is None:
        powerlifting_muscles = _POWERLIFTING_DEFAULT

    mat      = allocation_matrix.astype(float).copy()
    metadata = {
        "powerlifting_intensity_factor": 1.0,
        "cuts_applied":                  False,
        "reserve_score":                 systemic_reserve_score,
    }

    if systemic_reserve_score < 0.30:
        # Aggressive cuts
        for i, m in enumerate(muscle_groups):
            if m in tactical_muscles:
                continue  # never cut tactical
            if m in _ISOLATION_MUSCLES:
                mat[i, :] = np.floor(mat[i, :] * 0.35)
            elif m not in powerlifting_muscles:
                mat[i, :] = np.floor(mat[i, :] * 0.60)
        metadata["powerlifting_intensity_factor"] = 0.85
        metadata["cuts_applied"] = True

    elif systemic_reserve_score < 0.50:
        # Moderate cuts: sacrifice isolation, protect powerlifting + tactical
        for i, m in enumerate(muscle_groups):
            if m in tactical_muscles:
                continue
            if m in _ISOLATION_MUSCLES:
                mat[i, :] = np.floor(mat[i, :] * 0.50)
        metadata["powerlifting_intensity_factor"] = 0.90
        metadata["cuts_applied"] = True

    mat = np.clip(mat, 0, None)
    return mat.astype(int), metadata


# E13: lift-before-endurance is the mandated within-day order on any shared lift+run day.
# Lifting first protects ~6.9% lower-body dynamic strength at no cost to hypertrophy or
# aerobic adaptation, so it is the sequence the scheduler always encodes — AM lift, PM
# endurance, ≥6h apart on a split; lift-then-cardio within a combined session otherwise.
LIFT_BEFORE_ENDURANCE = ("lift", "endurance")


def evaluate_two_a_day_split(
    total_sets: int,
    planned_km: float,
    reserve_score: float,
) -> tuple:
    """
    Decide whether a two-a-day split is warranted.

    Returns (should_split: bool, reason: str, sequence: tuple). `sequence` is always
    LIFT_BEFORE_ENDURANCE — lift first whether the day is split (AM lift / PM endurance,
    ≥6h apart) or a single combined session (lift, then cardio). This encodes E13's
    lift-before-endurance ordering as a first-class engine output, not an implicit
    convention.

    Conditions for split (per OptiGainsOS spec):
      - total_sets > 8  AND planned_km > 5.0  AND reserve_score >= 0.40
    Minimum 6-hour separation enforced; lifting AM, cardio PM.
    """
    if reserve_score < 0.40:
        return False, "suppressed_low_recovery", LIFT_BEFORE_ENDURANCE
    if total_sets > 8 and planned_km > 5.0:
        return True, "high_volume_two_a_day", LIFT_BEFORE_ENDURANCE
    return False, "combined_session", LIFT_BEFORE_ENDURANCE
