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
    CUT_PROTEIN_G_PER_LB      = 1.3    # 1.2-1.5 g/lb to retain muscle ON A CUT (TNF cutting philosophy)
    BASE_PROTEIN_G_PER_LB     = 1.0    # ~1 g/lb when not cutting
    MIN_FAT_G_PER_LB          = 0.33   # ~1/3 g/lb hormonal floor on fat (TNF); floored at 50g absolute
    CARB_FLOOR_G_PER_DAY      = 25     # avg cut carbs/day; ×7 = the weekly budget that gets cycled
    CARB_PREWORKOUT_MIN_G     = 20     # min carbs on any real training day (pre-workout fuel)

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
          phase        : str     — "cut" | "bulk" | "maintain"
          strength_min_slope : float — worst key-lift e1RM slope (lbs/wk); gates the cut deficit
          weeks_in_cut : float   — weeks elapsed in the current cut; >=6 forces a diet break
        """
        target = target_deficit_ratio if target_deficit_ratio is not None else self.AGGRESSIVE_TARGET_DEFICIT
        target = self._clamp(target, 0.0, MAX_DEFICIT_RATIO)

        overreaching = bool(signals.get("overreaching"))
        hrv_z   = float(signals.get("hrv_z") or 0.0)
        rhr_z   = float(signals.get("rhr_z") or 0.0)
        tsb     = float(signals.get("tsb_banister") or 0.0)
        sleep   = signals.get("sleep_score")
        bw      = float(signals.get("bodyweight_lb") or 0.0)
        phase   = signals.get("phase")

        # Recovery headroom multiplier. 1.0 = run the full deficit.
        headroom = 1.0
        gates = []

        # TNF philosophy (Nolan's call, 2026-06-07): on a CUT the only brakes are
        # strength regression and the 4-6 week duration cap — NOT day-to-day
        # recovery signals. Recovery governs TRAINING (volume / keep-weight-heavy),
        # not how hard you eat; the macro floor already protects muscle. So the
        # overreach/HRV/RHR/TSB/sleep gates apply only OUTSIDE a cut. On a cut the
        # deficit runs to the macro floor to get it over with ASAP.
        if phase != "cut":
            if overreaching:
                headroom = min(headroom, self.OVERREACH_HEADROOM)
                gates.append("overreaching")
            # Suppressed HRV (hrv_z < 0) trims the deficit; above-baseline earns a little extra.
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

        # Strength-vs-peak gate — TNF's muscle-retention signal: performance, not
        # the scale, tells you if you're keeping muscle on a cut. If a key lift is
        # regressing during a cut, ease the deficit before digging deeper.
        # (The -1.0 lb/wk regression cutoff and the 0.70 ease factor are tunable
        # engineering defaults, not TNF-specified numbers — the learning layer
        # should eventually replace them.)
        strength_min_slope = signals.get("strength_min_slope")
        if phase == "cut" and strength_min_slope is not None and float(strength_min_slope) < -1.0:
            headroom *= 0.70
            gates.append("strength_dropping")

        # Recovery escape valve on a CUT (Nolan's call, 2026-06-07). Day-to-day
        # recovery does NOT gate cut calories (see above) — but two coarse, high-bar
        # exceptions do, because a genuine crash is worth eating through:
        #   1. Manual: he tapped "ease today" (a bad day he wants to fuel).
        #   2. Severe auto: a SUSTAINED crash, not daily noise — HRV deeply
        #      suppressed AND several poor-sleep nights stacked together.
        # Both ease the deficit ~35% for the day. Thresholds are tunable [ENG].
        EASE_FACTOR = 0.65
        if phase == "cut":
            if signals.get("ease_today"):
                headroom = min(headroom, EASE_FACTOR)
                gates.append("manual_ease")
            poor_sleep_days = int(signals.get("poor_sleep_days") or 0)
            if hrv_z <= -1.5 and poor_sleep_days >= 3:
                headroom = min(headroom, EASE_FACTOR)
                gates.append("recovery_crash")

        # Duration cap (TNF: get out at 4-6 weeks). Past 6 weeks in a cut, force
        # the deficit toward maintenance — it's time to end the cut / diet break,
        # not keep grinding.
        weeks_in_cut = signals.get("weeks_in_cut")
        if phase == "cut" and weeks_in_cut is not None and float(weeks_in_cut) >= 6:
            headroom = min(headroom, 0.25)
            gates.append("cut_too_long")

        headroom = self._clamp(headroom, 0.0, 1.0)

        # Muscle-preservation macros (computed first — they set the cut floor).
        protein_per_lb = self.CUT_PROTEIN_G_PER_LB if phase == "cut" else self.BASE_PROTEIN_G_PER_LB
        protein_g = round(protein_per_lb * bw) if bw > 0 else None
        fat_floor_g = max(50, round(self.MIN_FAT_G_PER_LB * bw)) if bw > 0 else 50
        # Carbs: deficit-neutral cycling (Nolan's call, 2026-06-07). The week's carb
        # budget (CARB_FLOOR_G_PER_DAY × 7) is distributed across days by glycogen
        # demand: hard training days (volume + long cardio) get the carbs, rest days
        # drop near zero. Weekly carbs — and therefore the weekly deficit — are
        # unchanged; the carbs just land where they fuel performance. Falls back to
        # a flat pre-workout target if the week's demand profile isn't available.
        carb_target_g = None
        if phase == "cut":
            glyco_today = float(signals.get("glyco_today") or 0.0)
            glyco_week  = float(signals.get("glyco_week") or 0.0)
            weekly_carb_budget = self.CARB_FLOOR_G_PER_DAY * 7
            if glyco_week > 0:
                carb_target_g = round(weekly_carb_budget * glyco_today / glyco_week)
                # Pre-workout minimum on any real training day so there's fuel in the tank.
                if glyco_today > 0:
                    carb_target_g = max(carb_target_g, self.CARB_PREWORKOUT_MIN_G)
            else:
                carb_target_g = self.CARB_FLOOR_G_PER_DAY

        if phase == "cut" and bw > 0:
            # Goal on a cut: lose fat as fast as possible. Drive the deficit as deep
            # as possible DOWN TO the calorie floor that still hits the muscle-
            # preservation macros (protein + fat floor + pre-workout carbs). No
            # loss-rate cap — the only brakes are the recovery/strength gates
            # (headroom) and the 4-6 week duration cap enforced elsewhere.
            # Pure macro arithmetic underestimates the true calorie floor because real
            # protein sources carry fat calories (~10% overhead) and fixed staples are
            # always prepended by the optimizer (whey ~120 kcal always; dextrose ~112 kcal
            # on training days). Add a ~10% overhead + whey base so calorie_target never
            # lands below what the optimizer can actually achieve.
            staple_kcal  = 120 + (112 if carb_target_g and carb_target_g > 0 else 0)
            floor_kcal   = (protein_g * 4 + fat_floor_g * 9 + (carb_target_g or 0) * 4) * 1.10 + staple_kcal
            max_deficit  = max(0.0, self.maintenance_kcal - floor_kcal)
            kcal_deficit = round(max_deficit * headroom)
            calorie_target = round(self.maintenance_kcal - kcal_deficit)
            deficit_ratio = round(kcal_deficit / self.maintenance_kcal, 3) if self.maintenance_kcal else 0.0
        else:
            # Non-cut: conventional capped target-deficit model.
            deficit_ratio = round(target * headroom, 3)
            kcal_deficit  = round(self.maintenance_kcal * deficit_ratio)
            calorie_target = round(self.maintenance_kcal - kcal_deficit)

        if not gates:
            rationale = (f"Recovery is clear — running the full {round(deficit_ratio*100)}% deficit "
                         f"({kcal_deficit} kcal) for max fat loss.")
        elif "overreaching" in gates:
            rationale = ("Overreaching flagged — deficit collapsed toward maintenance to protect "
                         f"recovery (target {calorie_target} kcal). Leanness can wait a day; recovery can't.")
        elif "cut_too_long" in gates:
            rationale = (f"6+ weeks deep in the cut — time to end it. Easing toward maintenance "
                         f"({calorie_target} kcal); take a diet break before grinding further.")
        elif "manual_ease" in gates:
            rationale = (f"You flagged today as a rough one — easing to {calorie_target} kcal and "
                         "adding carbs back to recover. Back to the max deficit tomorrow.")
        elif "recovery_crash" in gates:
            rationale = (f"Sustained crash (low HRV + several poor-sleep nights) — easing to "
                         f"{calorie_target} kcal to dig out. This is a real signal, not a daily blip.")
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
            "carb_target_g":         carb_target_g,
            "gates":                 gates,
            "rationale":             rationale,
        }

    def to_dict(self) -> dict:
        return {"maintenance_kcal": self.maintenance_kcal}

    @classmethod
    def from_dict(cls, d: dict) -> "NutritionModulator":
        return cls(maintenance_kcal=d.get("maintenance_kcal", 3200.0))
