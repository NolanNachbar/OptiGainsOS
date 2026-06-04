"""
Stability Guardrails.

Prevents the engine from overreacting to transient noise or oscillating
at state boundaries. Three mechanisms:

  1. First-order low-pass filter — limits how fast any prescription variable
     can change per day (α = 0.15 → max ~15% daily shift in weighted-average terms).

  2. Hysteresis buffer — requires N consecutive days in a new training state
     before confirming the state transition. Stops flip-flopping between
     STIMULATIVE and DE-ESCALATION on alternating days.

  3. Hard ACWR caps — override any proposed load increase when the acute:chronic
     workload ratio is unsafe. Non-negotiable; applied after all other logic.

  4. Overreaching early-warning — detects the HRV↓ + RHR↑ signature that
     precedes full overreaching by 3-5 days, allowing pre-emptive reduction.
"""

ALPHA_SMOOTH          = 0.15   # low-pass smoothing factor
ACWR_INCREASE_LIMIT   = 1.30   # ACWR ceiling for any load increase
ACWR_FORCE_DECREASE   = 1.50   # ACWR floor that forces mandatory reduction
HYSTERESIS_DAYS       = 3      # days in new state before confirming transition

# Overreaching z-score thresholds
HRV_Z_OVERREACH  = -1.5
RHR_Z_OVERREACH  =  1.2
HRV_Z_STRESSED   = -1.0


class SystemGuardrail:
    """
    Low-pass filter + hysteresis + ACWR hard caps + overreaching detection.

    Maintains one filtered value per named variable.
    State history tracks the last 10 daily training states for hysteresis.
    """

    def __init__(self, alpha: float = ALPHA_SMOOTH):
        self.alpha           = alpha
        self._filtered: dict = {}          # variable_name → smoothed value
        self._state_history: list = []     # rolling daily state log (last 10)

    # ── Low-pass filter ───────────────────────────────────────────────────────

    def filter_value(self, key: str, raw_value: float) -> float:
        """
        Smooth a named prescription variable.
        First call initializes; subsequent calls apply exponential smoothing.

        Typical usage:
            weekly_sets = guardrail.filter_value("weekly_sets", raw_sets)
        """
        if key not in self._filtered:
            self._filtered[key] = float(raw_value)
            return self._filtered[key]
        self._filtered[key] = (self.alpha * float(raw_value)
                               + (1.0 - self.alpha) * self._filtered[key])
        return round(self._filtered[key], 3)

    # ── ACWR gate ─────────────────────────────────────────────────────────────

    def gate_load_action(self, proposed_action: str, acwr: float) -> str:
        """
        Override proposed training action if ACWR is out of safe range.

        proposed_action: "INCREASE" | "MAINTAIN" | "DECREASE" | "REST"
        Returns gated action string.
        """
        if acwr > ACWR_FORCE_DECREASE:
            return "DECREASE"
        if acwr > ACWR_INCREASE_LIMIT and proposed_action == "INCREASE":
            return "MAINTAIN"
        return proposed_action

    # ── Overreaching detection ────────────────────────────────────────────────

    def check_overreaching(
        self,
        hrv_history: list,
        rhr_history: list,
        acwr: float,
    ) -> dict:
        """
        Multi-signal overreaching early-warning detection.

        Uses trailing 3-day z-scores against a 7-day baseline.
        The HRV↓ + RHR↑ combination is the most specific signature — either
        alone is noisier (single bad night, caffeine, illness can cause one).

        hrv_history: list of RMSSD values, most-recent last. Needs ≥3 values.
        rhr_history: list of resting HR values, most-recent last. Needs ≥3 values.
        acwr:        current acute:chronic workload ratio.
        """
        if len(hrv_history) < 3 or len(rhr_history) < 3:
            return {"fatigue_state": "UNKNOWN", "overreaching": False,
                    "hrv_z_3d": None, "rhr_z_3d": None}

        def z_score_trailing(vals: list) -> float:
            arr  = [float(v) for v in vals if v is not None]
            if len(arr) < 3:
                return 0.0
            mean = sum(arr) / len(arr)
            std  = (sum((x - mean) ** 2 for x in arr) / len(arr)) ** 0.5 + 1e-6
            trailing_3 = sum(arr[-3:]) / 3
            return (trailing_3 - mean) / std

        hrv_z = z_score_trailing(hrv_history)
        rhr_z = z_score_trailing(rhr_history)

        if hrv_z < HRV_Z_OVERREACH and rhr_z > RHR_Z_OVERREACH:
            state = "CRITICAL_OVERREACH"
        elif acwr > ACWR_FORCE_DECREASE or hrv_z < HRV_Z_STRESSED:
            state = "STRESSED"
        else:
            state = "NORMAL"

        return {
            "fatigue_state": state,
            "overreaching":  state == "CRITICAL_OVERREACH",
            "hrv_z_3d":      round(hrv_z, 2),
            "rhr_z_3d":      round(rhr_z, 2),
        }

    # ── Hysteresis ────────────────────────────────────────────────────────────

    def record_state(self, state: str):
        """Log today's training state. Called after each daily decision."""
        self._state_history.append(state)
        if len(self._state_history) > 10:
            self._state_history.pop(0)

    def confirmed_state(self, proposed_state: str) -> str:
        """
        Confirm a state change only after HYSTERESIS_DAYS consecutive days.
        Returns the confirmed state (may differ from proposed_state if in transition).
        """
        if len(self._state_history) < HYSTERESIS_DAYS:
            return proposed_state

        recent = self._state_history[-HYSTERESIS_DAYS:]
        if all(s == proposed_state for s in recent):
            return proposed_state

        # In transition — hold last confirmed state
        for s in reversed(self._state_history[:-HYSTERESIS_DAYS + 1] or [proposed_state]):
            return s
        return proposed_state

    # ── Serialization ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "filtered":      self._filtered,
            "state_history": self._state_history,
            "alpha":         self.alpha,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "SystemGuardrail":
        obj = cls(alpha=d.get("alpha", ALPHA_SMOOTH))
        obj._filtered      = d.get("filtered",      {})
        obj._state_history = d.get("state_history", [])
        return obj
