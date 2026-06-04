"""
strength_progression.py — e1RM tracking and progression command generation.

Epley formula: Load * (1.0 + 0.0333 * (Reps + RIR))

Progression commands:
  INCREASE_LOAD  — positive slope, load can go up next session
  HOLD           — neutral; stay at current load
  DELOAD         — negative slope + HRV suppression
  SWAP_EXERCISE  — extended stall despite good recovery
"""

import math


# ── e1RM ──────────────────────────────────────────────────────────────────────

def compute_e1rm(load: float, reps: int, rir: int) -> float:
    """Epley e1RM: Load * (1.0 + 0.0333 * (Reps + RIR))."""
    return round(load * (1.0 + 0.0333 * (int(reps) + int(rir))), 2)


# ── Trend slope ───────────────────────────────────────────────────────────────

def compute_trend_slope(history: list) -> float:
    """
    Ordinary least-squares slope (e1RM per observation index).

    Returns 0.0 if fewer than 2 data points.
    """
    n = len(history)
    if n < 2:
        return 0.0
    xs   = list(range(n))
    x_m  = sum(xs) / n
    y_m  = sum(history) / n
    num  = sum((xs[i] - x_m) * (history[i] - y_m) for i in range(n))
    den  = sum((xs[i] - x_m) ** 2 for i in range(n))
    if den == 0.0:
        return 0.0
    return round(num / den, 6)


# ── Progression decision ──────────────────────────────────────────────────────

def process_strength_progression(
    e1rm_history: list,
    hrv_z_3d: float,
) -> str:
    """
    Determine next-session load recommendation.

    Args:
        e1rm_history  List of e1RM floats (chronological, arbitrary length).
        hrv_z_3d      3-day rolling HRV z-score.

    Returns one of: "INCREASE_LOAD" | "HOLD" | "DELOAD" | "SWAP_EXERCISE"
    """
    if not e1rm_history:
        return "HOLD"

    slope = compute_trend_slope(e1rm_history)

    if slope > 0.05:
        return "INCREASE_LOAD"

    if slope < -0.10 and hrv_z_3d < -1.2:
        return "DELOAD"

    # Stall for >= 21 observations (approx 3 weeks of daily logging)
    if len(e1rm_history) >= 21 and slope < 0 and hrv_z_3d >= -0.5:
        # Confirm stall over last 21 entries
        stall_slope = compute_trend_slope(e1rm_history[-21:])
        if stall_slope < 0:
            return "SWAP_EXERCISE"

    return "HOLD"


# ── Registry ──────────────────────────────────────────────────────────────────

_MAX_HISTORY = 90


class StrengthProgressionRegistry:
    """
    Tracks e1RM history for each exercise and emits progression commands.
    """

    def __init__(self):
        # {exercise_name: [e1RM, ...]}
        self._history: dict[str, list] = {}

    def log_set(self, exercise_name: str, load: float, reps: int, rir: int) -> None:
        """Append a new e1RM estimate (max 90 entries per exercise)."""
        val = compute_e1rm(load, reps, rir)
        if exercise_name not in self._history:
            self._history[exercise_name] = []
        self._history[exercise_name].append(val)
        # Trim to 90 most recent
        if len(self._history[exercise_name]) > _MAX_HISTORY:
            self._history[exercise_name] = self._history[exercise_name][-_MAX_HISTORY:]

    def get_command(self, exercise_name: str, hrv_z_3d: float) -> str:
        """Return progression command for the named exercise."""
        history = self._history.get(exercise_name, [])
        return process_strength_progression(history, hrv_z_3d)

    def get_history(self, exercise_name: str) -> list:
        return list(self._history.get(exercise_name, []))

    def to_dict(self) -> dict:
        return {"history": dict(self._history)}

    @classmethod
    def from_dict(cls, d: dict) -> "StrengthProgressionRegistry":
        obj = cls()
        obj._history = {k: list(v) for k, v in (d.get("history") or {}).items()}
        return obj
