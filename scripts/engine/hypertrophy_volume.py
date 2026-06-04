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
]

# Muscles with lower baseline volume capacity (isolation / small)
_ISOLATION_MUSCLES = {"triceps", "biceps"}

# Lower body muscles affected by running interference
_LOWER_BODY_MUSCLES = {"quads", "hamstrings", "calves", "glutes"}


def _default_landmarks(muscle: str) -> dict:
    if muscle in _ISOLATION_MUSCLES:
        return {"MEV": 4, "MAV": 8, "MRV": 12}
    return {"MEV": 6, "MAV": 12, "MRV": 18}


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

        reduction = omega * weekly_km sets, subtracted from MRV.
        """
        reduction = omega * max(0.0, weekly_km)
        for m in _LOWER_BODY_MUSCLES:
            if m not in self.landmarks:
                continue
            lm  = self.landmarks[m]
            mev = lm["MEV"]
            lm["MRV"] = max(mev + 1, round(lm["MRV"] - reduction))

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
