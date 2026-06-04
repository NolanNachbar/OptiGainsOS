"""
Jack Daniels VDOT Aerobic Adaptation Engine.

Computes VDOT from timed run efforts, generates polarized training pace zones,
and calculates a mileage cap that protects lower-body joints under concurrent
strength training load.

PST run targets (hard deadline Aug 31 2026):
  1.5 mile < 9:00  →  required VDOT ≈ 47.5
  4.0 mile < 26:00 →  required VDOT ≈ 49.2

Polarized distribution: 80% easy (≤70% VO2max), 20% threshold+ (≥88% VO2max).
This maximizes aerobic adaptation while limiting joint/CNS stress that would
blunt concurrent strength gains.
"""
import math
from typing import Optional

# PST targets (Nolan-specific, Aug 31 2026 deadline)
PST_RUN_TARGETS = {
    "1_5_mile": {"distance_m": 2414,  "target_secs": 540},   # 9:00
    "4_mile":   {"distance_m": 6437,  "target_secs": 1560},  # 26:00
}

# VO2max intensity fractions for pace zones
ZONE_EASY_FRAC      = 0.70    # LISS ceiling: ≤70% VO2max
ZONE_THRESHOLD_FRAC = 0.88    # threshold floor: ≥88% VO2max
ZONE_INTERVAL_FRAC  = 0.98    # interval / race-pace: ~98% VO2max

# Mileage cap sensitivity to quad soreness
# Each soreness point × day reduces weekly mileage by 6%
OMEGA_ORTHO = 0.06

# Minimum reliable timed efforts before updating VDOT
MIN_EFFORTS_FOR_UPDATE = 1


# ── Jack Daniels equations ────────────────────────────────────────────────────

def vo2_at_velocity(v_m_per_min: float) -> float:
    """VO2 consumption (ml/kg/min) at running velocity v (m/min)."""
    return -4.60 + 0.182258 * v_m_per_min + 0.000104 * (v_m_per_min ** 2)


def fractional_intensity(t_min: float) -> float:
    """Fraction of VO2max utilized during a run of duration t_min."""
    return (0.8
            + 0.1894393 * math.exp(-0.012778  * t_min)
            + 0.2989558 * math.exp(-0.1932605 * t_min))


def vdot_from_effort(distance_m: float, time_secs: float) -> float:
    """
    Compute VDOT from a single timed run effort.
    Returns 0 if inputs are invalid.
    """
    if distance_m <= 0 or time_secs <= 0:
        return 0.0
    v     = distance_m / (time_secs / 60.0)   # m/min
    t_min = time_secs / 60.0
    vo2   = vo2_at_velocity(v)
    frac  = fractional_intensity(t_min)
    if frac <= 0:
        return 0.0
    return round(vo2 / frac, 2)


def velocity_for_fraction(vdot: float, fraction: float) -> float:
    """
    Invert the VO2-velocity curve to find pace for a given VO2max fraction.
    Solves: 0.000104·v² + 0.182258·v − (4.60 + vdot·fraction) = 0
    Returns velocity in m/min.
    """
    target_vo2 = vdot * fraction
    a = 0.000104
    b = 0.182258
    c = -4.60 - target_vo2
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return 0.0
    return (-b + math.sqrt(discriminant)) / (2 * a)


def pace_string(v_m_per_min: float) -> str:
    """Convert m/min velocity to MM:SS / mile pace string."""
    if v_m_per_min <= 0:
        return "N/A"
    min_per_mile = 1609.34 / v_m_per_min
    minutes      = int(min_per_mile)
    seconds      = round((min_per_mile - minutes) * 60)
    if seconds >= 60:
        minutes += 1
        seconds  = 0
    return f"{minutes}:{seconds:02d}"


# ── Engine class ──────────────────────────────────────────────────────────────

class VDOTEngine:
    """
    Tracks VDOT over time and prescribes polarized pace zones.

    Updated weekly when a timed run effort is logged.
    Uses 3-run rolling average for stability (single bad GPS effort won't tank VDOT).
    """

    def __init__(self, current_vdot: float = 45.0, base_mileage: float = 15.0):
        self.vdot         = current_vdot
        self.base_mileage = base_mileage   # baseline weekly miles
        self._vdot_history: list = []      # rolling list of computed VDOTs

    # ── VDOT update ───────────────────────────────────────────────────────────

    def record_effort(self, distance_m: float, time_secs: float):
        """
        Record a timed run and update VDOT.
        Only valid for efforts ≥ 800m (shorter runs don't reflect aerobic capacity).
        """
        if distance_m < 800:
            return
        new_vdot = vdot_from_effort(distance_m, time_secs)
        if new_vdot < 20 or new_vdot > 85:
            return   # sanity check — outside human range
        self._vdot_history.append(new_vdot)
        # Rolling 3-effort average for noise resistance
        recent     = self._vdot_history[-3:]
        self.vdot  = round(sum(recent) / len(recent), 1)

    # ── Pace zones ────────────────────────────────────────────────────────────

    def pace_zones(self) -> dict:
        """
        Current training pace prescriptions for polarized training.
        Also includes gap-to-target analysis for PST deadline.
        """
        v_easy      = velocity_for_fraction(self.vdot, ZONE_EASY_FRAC)
        v_threshold = velocity_for_fraction(self.vdot, ZONE_THRESHOLD_FRAC)
        v_interval  = velocity_for_fraction(self.vdot, ZONE_INTERVAL_FRAC)

        # Required VDOTs for PST targets
        pst_vdots = {
            k: round(vdot_from_effort(v["distance_m"], v["target_secs"]), 1)
            for k, v in PST_RUN_TARGETS.items()
        }
        target_vdot = max(pst_vdots.values())

        return {
            "current_vdot":      self.vdot,
            "target_vdot":       target_vdot,
            "vdot_gap":          round(target_vdot - self.vdot, 1),
            "pst_required_vdots": pst_vdots,
            # Training paces
            "easy_pace":         pace_string(v_easy),
            "threshold_pace":    pace_string(v_threshold),
            "interval_pace":     pace_string(v_interval),
            "easy_v_m_min":      round(v_easy, 1),
            "threshold_v_m_min": round(v_threshold, 1),
            "interval_v_m_min":  round(v_interval, 1),
            # Weekly run volume guidance
            "weekly_split":      "80% easy / 20% threshold+",
        }

    def time_projection(self, distance_m: float) -> Optional[str]:
        """
        Project current finish time for a given distance at race effort.
        Returns time string "MM:SS" or None if VDOT is unset.
        """
        if self.vdot <= 0:
            return None
        # Race velocity ≈ interval pace (98% VO2max)
        v_race   = velocity_for_fraction(self.vdot, ZONE_INTERVAL_FRAC)
        if v_race <= 0:
            return None
        secs     = (distance_m / v_race) * 60.0
        minutes  = int(secs // 60)
        seconds  = int(secs % 60)
        return f"{minutes}:{seconds:02d}"

    # ── Mileage cap ───────────────────────────────────────────────────────────

    def mileage_cap(self, quad_soreness_last_4d: list) -> float:
        """
        Weekly mileage ceiling adjusted for lower-body soreness.

        quad_soreness_last_4d: list of quad soreness scores for last 4 days (0–3 scale).
        High quad soreness → cut mileage to protect joint health under heavy squat load.
        """
        soreness_sum = sum(max(0.0, min(float(s), 3.0)) for s in quad_soreness_last_4d)
        reduction    = OMEGA_ORTHO * soreness_sum
        cap          = self.base_mileage * max(0.35, 1.0 - reduction)
        return round(cap, 1)

    # ── Serialization ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "vdot":          self.vdot,
            "base_mileage":  self.base_mileage,
            "vdot_history":  self._vdot_history[-10:],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "VDOTEngine":
        obj = cls(
            current_vdot=d.get("vdot", 45.0),
            base_mileage=d.get("base_mileage", 15.0),
        )
        obj._vdot_history = d.get("vdot_history", [])
        return obj
