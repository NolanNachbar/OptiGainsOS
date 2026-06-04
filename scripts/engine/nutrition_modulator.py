"""
Nutrition Modulation Layer.

A meaningful caloric deficit changes the physiology of adaptation:
  - Fatigue clears more slowly (τ_fat increases)
  - The volume you can recover from drops (MRV decreases)
  - Standard performance metrics become less reliable (glycogen fluctuations,
    water shifts, elevated cortisol all pollute the signal)

This module quantifies those adjustments so the Banister filter and session
generator can operate correctly regardless of diet phase.

Scaling coefficients (κ, η) are from the spec's empirical estimates. They will
be imprecise — the RLS learner will eventually absorb the nutrition effect into
the τ_fat parameter directly, making this module increasingly redundant over
many weeks of data. It acts as an informed prior in the meantime.
"""
import math

# Empirical scaling coefficients
KAPPA_DEFICIT = 1.25    # τ_fat multiplier sensitivity to deficit fraction
ETA_DEFICIT   = 0.75    # MRV reduction sensitivity to deficit fraction
MAX_DEFICIT_RATIO = 0.35  # cap: don't extrapolate past 35% deficit

# Thresholds for metric reliability downgrade
DEFICIT_MODERATE = 0.08   # 8% deficit: start monitoring
DEFICIT_SIGNIFICANT = 0.18  # 18% deficit: low trust on scale weight


class NutritionModulator:
    """
    Adjusts τ_fat and MRV based on caloric state.

    Call modulate() once per day. Pass the result to:
      - BanisterKalman.update_params() — supply adjusted τ_fat
      - SessionGenerator — supply adjusted MRV for set-count limits
    """

    def __init__(self, maintenance_kcal: float = 3200.0):
        self.maintenance_kcal = maintenance_kcal

    def modulate(
        self,
        current_kcal_7d_avg: float,
        base_tau_fat:        float,
        base_mrv_sets:       float,
    ) -> dict:
        """
        Apply nutritional scaling.

        current_kcal_7d_avg: 7-day rolling average caloric intake (from nutrition compute).
        base_tau_fat:        baseline fatigue decay constant from Kalman / RLS (days).
        base_mrv_sets:       baseline max recoverable weekly sets (from MUSCLE_TARGETS or RLS).

        Returns adjusted values + metadata for the brief and session generator.
        """
        if current_kcal_7d_avg >= self.maintenance_kcal or current_kcal_7d_avg <= 0:
            return {
                "phase":              "surplus_or_maintenance",
                "deficit_ratio":      0.0,
                "kcal_deficit":       0,
                "tau_fat_adj":        round(base_tau_fat, 2),
                "mrv_adj":            round(base_mrv_sets, 1),
                "metric_reliability": "standard",
                "note":               None,
            }

        raw_ratio     = ((self.maintenance_kcal - current_kcal_7d_avg)
                         / self.maintenance_kcal)
        deficit_ratio = min(raw_ratio, MAX_DEFICIT_RATIO)
        kcal_deficit  = round(self.maintenance_kcal - current_kcal_7d_avg)

        tau_fat_adj   = base_tau_fat   * (1.0 + KAPPA_DEFICIT * deficit_ratio)
        mrv_adj       = base_mrv_sets  * (1.0 - ETA_DEFICIT   * deficit_ratio)

        # Metric reliability flag: under significant deficit, scale weight and
        # intra-workout RPE are noisy — brief should weight HRV/RHR more heavily.
        if deficit_ratio >= DEFICIT_SIGNIFICANT:
            reliability = "low_trust_scale_weight"
            note = (f"Eating {kcal_deficit} kcal below maintenance. "
                    "Scale weight and RPE are unreliable signals — "
                    "prioritize HRV and RHR trends for recovery assessment.")
        elif deficit_ratio >= DEFICIT_MODERATE:
            reliability = "moderate"
            note = (f"Mild deficit ({kcal_deficit} kcal). "
                    "Fatigue clearance slightly slower than baseline.")
        else:
            reliability = "standard"
            note = None

        return {
            "phase":              "deficit",
            "deficit_ratio":      round(deficit_ratio, 3),
            "kcal_deficit":       kcal_deficit,
            "tau_fat_adj":        round(tau_fat_adj, 2),
            "mrv_adj":            round(mrv_adj, 1),
            "metric_reliability": reliability,
            "note":               note,
        }

    def to_dict(self) -> dict:
        return {"maintenance_kcal": self.maintenance_kcal}

    @classmethod
    def from_dict(cls, d: dict) -> "NutritionModulator":
        return cls(maintenance_kcal=d.get("maintenance_kcal", 3200.0))
