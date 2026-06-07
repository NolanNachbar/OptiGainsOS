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

    # ── Recovery-gated deficit recommendation ────────────────────────────────
    # The inverse of modulate(): instead of "given intake, what's the recovery
    # cost?", this answers "given recovery, how aggressive a deficit is safe?".
    # Goal: stay as lean as possible WITHOUT compromising recovery. Start from an
    # aggressive target deficit and gate it down by the recovery signals.

    # Tunables (documented so they're easy to dial in):
    AGGRESSIVE_TARGET_DEFICIT = 0.25   # the deficit we'd run if recovery were perfect
    OVERREACH_HEADROOM        = 0.15   # overreaching → collapse deficit toward maintenance
    HRV_GATE_GAIN             = 0.30   # how hard suppressed HRV pulls the deficit down
    RHR_GATE_GAIN             = 0.25   # how hard elevated RHR pulls it down
    TSB_GATE_GAIN             = 0.04   # per unit of deep negative form (fatigue)
    POOR_SLEEP_SCORE          = 60     # below this, multiply headroom by POOR_SLEEP_FACTOR
    POOR_SLEEP_FACTOR         = 0.70
    PROTEIN_G_PER_LB          = 1.0    # high protein to retain muscle in a deficit
    MIN_FAT_G_PER_LB          = 0.30   # hormonal floor on fat

    @staticmethod
    def _clamp(x, lo, hi):
        return max(lo, min(hi, x))

    def recommend_deficit(self, signals: dict, target_deficit_ratio: float = None) -> dict:
        """
        Recommend today's calorie target from recovery state.

        signals (all optional, sensible defaults if missing):
          overreaching : bool   — engine overreach guardrail tripped
          hrv_z        : float   — 7d HRV z-score (negative = below baseline = bad)
          rhr_z        : float   — resting-HR z-score (positive = elevated = bad)
          tsb_banister : float   — Banister form (very negative = deep fatigue)
          sleep_score  : float   — last night / recent sleep score 0-100
          bodyweight_lb: float   — for protein/fat floors
          weight_trend_lbs_per_week : float — realized weight trend (closes the cut loop)
          phase        : str     — "cut" | "bulk" | "maintain"
        """
        target = target_deficit_ratio if target_deficit_ratio is not None else self.AGGRESSIVE_TARGET_DEFICIT
        target = self._clamp(target, 0.0, MAX_DEFICIT_RATIO)

        overreaching = bool(signals.get("overreaching"))
        hrv_z   = float(signals.get("hrv_z") or 0.0)
        rhr_z   = float(signals.get("rhr_z") or 0.0)
        tsb     = float(signals.get("tsb_banister") or 0.0)
        sleep   = signals.get("sleep_score")
        bw      = float(signals.get("bodyweight_lb") or 0.0)

        # Recovery headroom multiplier in [0, 1.1]. 1.0 = run the full target deficit.
        headroom = 1.0
        gates = []
        if overreaching:
            headroom = min(headroom, self.OVERREACH_HEADROOM)
            gates.append("overreaching")
        # Suppressed HRV (hrv_z < 0) trims the deficit; above-baseline HRV earns a little extra.
        headroom *= self._clamp(1.0 + self.HRV_GATE_GAIN * hrv_z, 0.40, 1.10)
        if hrv_z <= -1.0:
            gates.append("hrv_suppressed")
        # Elevated RHR (rhr_z > 0) trims it.
        headroom *= self._clamp(1.0 - self.RHR_GATE_GAIN * max(0.0, rhr_z), 0.50, 1.0)
        if rhr_z >= 1.0:
            gates.append("rhr_elevated")
        # Deep negative form (accumulated fatigue) trims it.
        headroom *= self._clamp(1.0 - self.TSB_GATE_GAIN * max(0.0, -tsb), 0.50, 1.0)
        # Poor sleep trims it.
        if sleep is not None and float(sleep) < self.POOR_SLEEP_SCORE:
            headroom *= self.POOR_SLEEP_FACTOR
            gates.append("poor_sleep")

        # Realized-trend feedback — closes the cut loop. If actual loss is faster
        # than ~1.5 lb/wk during a cut, ease the deficit to protect lean mass
        # instead of holding a static target the user has to police manually.
        weight_trend = signals.get("weight_trend_lbs_per_week")
        phase = signals.get("phase")
        if phase == "cut" and weight_trend is not None and float(weight_trend) < -1.5:
            headroom *= 0.70
            gates.append("loss_too_fast")

        headroom = self._clamp(headroom, 0.0, 1.0)
        deficit_ratio = round(target * headroom, 3)
        kcal_deficit  = round(self.maintenance_kcal * deficit_ratio)
        calorie_target = round(self.maintenance_kcal - kcal_deficit)

        protein_g = round(self.PROTEIN_G_PER_LB * bw) if bw > 0 else None
        fat_floor_g = round(self.MIN_FAT_G_PER_LB * bw) if bw > 0 else None

        if not gates:
            rationale = (f"Recovery is clear — running the full {round(deficit_ratio*100)}% deficit "
                         f"({kcal_deficit} kcal) for max fat loss.")
        elif "overreaching" in gates:
            rationale = ("Overreaching flagged — deficit collapsed toward maintenance to protect "
                         f"recovery (target {calorie_target} kcal). Leanness can wait a day; recovery can't.")
        else:
            rationale = (f"Easing the deficit to {round(deficit_ratio*100)}% ({kcal_deficit} kcal) — "
                         f"{', '.join(gates)} signalling reduced recovery headroom.")

        return {
            "maintenance_kcal":      round(self.maintenance_kcal),
            "target_deficit_ratio":  round(target, 3),
            "recovery_headroom":     round(headroom, 3),
            "deficit_ratio":         deficit_ratio,
            "kcal_deficit":          kcal_deficit,
            "calorie_target":        calorie_target,
            "protein_g":             protein_g,
            "fat_floor_g":           fat_floor_g,
            "gates":                 gates,
            "rationale":             rationale,
        }

    def to_dict(self) -> dict:
        return {"maintenance_kcal": self.maintenance_kcal}

    @classmethod
    def from_dict(cls, d: dict) -> "NutritionModulator":
        return cls(maintenance_kcal=d.get("maintenance_kcal", 3200.0))
