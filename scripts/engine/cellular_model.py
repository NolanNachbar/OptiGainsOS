"""
mTORC1/AMPK Cellular Interference Model.

Models intracellular signaling crosstalk for concurrent training:

  dAMPK/dt   = α₁ · TRIMP_run · (1 − AMPK)   − β₁ · AMPK
  dmTORC1/dt = α₂ · Vol_str  · (1 − mTORC1)  − β₂ · mTORC1 · (1 + γᵢ · AMPK)

AMPK is activated by aerobic running load (TRIMP).
mTORC1 is activated by resistance training volume and inhibited by AMPK via
phosphorylation of the Raptor subunit — the molecular mechanism behind the
"interference effect" in concurrent training.

CLOSED-LOOP FIX (vs. original spec):
The ODE can't directly observe intracellular kinase fractions, so it would drift
if run open-loop. Instead, we use barbell e1RM progression rate (lbs/week) from
compute_strength() as the observable proxy for cumulative mTORC1 output.
Each week we compare predicted vs. actual strength gain and correct α₂ and γᵢ
so the model stays coupled to reality.
"""
import numpy as np
from typing import Optional

# Default kinetic constants (will self-correct via close_loop_update)
DEFAULT_ALPHA1 = 0.10   # AMPK activation rate constant (per unit TRIMP)
DEFAULT_BETA1  = 0.20   # AMPK clearance rate constant
DEFAULT_ALPHA2 = 0.15   # mTORC1 activation rate constant (per unit strength vol)
DEFAULT_BETA2  = 0.10   # mTORC1 clearance rate constant
DEFAULT_GAMMA  = 2.50   # AMPK→mTORC1 interference coefficient

# Closed-loop parameter correction rates
LR_ALPHA2 = 0.04    # learning rate for alpha_2 correction
LR_GAMMA  = 0.06    # learning rate for gamma_i correction

# Scaling constant: maps 7-day mTOR integral to expected lbs/week strength gain.
# Empirical starting point; corrections will tune this over weeks.
MTOR_TO_STRENGTH_SCALE = 0.008

# Minimum strength tracking sessions before trusting the closed-loop signal
MIN_SESSIONS_FOR_CLOSE_LOOP = 4

# Hard bounds on correctable parameters
ALPHA2_BOUNDS = (0.04, 0.40)
GAMMA_BOUNDS  = (0.30, 8.00)


class CellularInterferenceModel:
    """
    Euler-integrated ODE of concurrent training interference.

    Active fractions bounded [0, 1].
    α₂ and γᵢ self-correct weekly via observed strength progression (closed-loop).

    Run once daily via step(). Run close_loop_update() each Sunday.
    """

    def __init__(
        self,
        alpha1: float = DEFAULT_ALPHA1,
        beta1:  float = DEFAULT_BETA1,
        alpha2: float = DEFAULT_ALPHA2,
        beta2:  float = DEFAULT_BETA2,
        gamma_i: float = DEFAULT_GAMMA,
    ):
        self.ampk    = 0.0
        self.mtorc1  = 0.0

        self.alpha1  = alpha1
        self.beta1   = beta1
        self.alpha2  = alpha2
        self.beta2   = beta2
        self.gamma_i = gamma_i

        # Weekly accumulator for closed-loop parameter update
        self._mtorc1_integral = 0.0
        self._days_accumulated = 0

    # ── ODE step ──────────────────────────────────────────────────────────────

    def step(
        self,
        run_trimp:    float,
        strength_vol: float,
        dt:           float = 1.0,
    ) -> dict:
        """
        Advance the ODE by dt days using Euler integration.

        run_trimp:    normalized running TRIMP ∈ [0, 1].
                      Derive from: Garmin training load / 150 (typical max session).
        strength_vol: normalized strength volume ∈ [0, 1].
                      Derive from: total_sets_today / 25 (typical hard session).
        dt:           integration step (days). Keep at 1.0 for daily operation.
        """
        u_run = float(np.clip(run_trimp,    0.0, 1.0))
        u_str = float(np.clip(strength_vol, 0.0, 1.0))

        d_ampk  = (self.alpha1 * u_run * (1.0 - self.ampk)
                   - self.beta1 * self.ampk)
        d_mtorc = (self.alpha2 * u_str * (1.0 - self.mtorc1)
                   - self.beta2 * self.mtorc1 * (1.0 + self.gamma_i * self.ampk))

        self.ampk   = float(np.clip(self.ampk   + d_ampk  * dt, 0.0, 1.0))
        self.mtorc1 = float(np.clip(self.mtorc1 + d_mtorc * dt, 0.0, 1.0))

        # Accumulate for weekly closed-loop update
        self._mtorc1_integral  += self.mtorc1
        self._days_accumulated += 1

        return self.state_dict()

    # ── Closed-loop parameter correction ─────────────────────────────────────

    def close_loop_update(
        self,
        strength_slope_lbs_per_week: float,
        strength_sessions: int,
    ):
        """
        Weekly closed-loop correction using observed strength progression.

        strength_slope_lbs_per_week: e1RM linear regression slope from
                                     compute_strength() → progression_rate_lbs_per_week.
                                     This is the ground-truth sensor for mTORC1 output.
        strength_sessions:           number of sessions in the regression window.
                                     Gate: skip correction if too few sessions.
        """
        if strength_sessions < MIN_SESSIONS_FOR_CLOSE_LOOP or self._days_accumulated == 0:
            self._reset_accumulator()
            return

        # Predicted strength gain from integrated mTOR activity
        avg_mtorc1      = self._mtorc1_integral / self._days_accumulated
        predicted_gain  = avg_mtorc1 * MTOR_TO_STRENGTH_SCALE * 7.0
        actual_gain     = max(0.0, float(strength_slope_lbs_per_week))
        error           = actual_gain - predicted_gain

        if error > 0:
            # Actual > predicted: mTOR producing more than model thinks.
            # Increase activation rate α₂.
            self.alpha2 = float(np.clip(
                self.alpha2 + LR_ALPHA2 * abs(error),
                *ALPHA2_BOUNDS,
            ))
        elif error < 0:
            # Actual < predicted: more interference than model accounts for.
            # Increase interference coefficient γᵢ.
            self.gamma_i = float(np.clip(
                self.gamma_i + LR_GAMMA * abs(error),
                *GAMMA_BOUNDS,
            ))

        self._reset_accumulator()

    def _reset_accumulator(self):
        self._mtorc1_integral  = 0.0
        self._days_accumulated = 0

    # ── Derived signals ───────────────────────────────────────────────────────

    def interference_level(self) -> str:
        """Human-readable concurrent training interference signal."""
        if self.ampk > 0.55 and self.mtorc1 > 0.25:
            return "HIGH"
        if self.ampk > 0.35:
            return "MODERATE"
        return "LOW"

    def anabolic_window_open(self) -> bool:
        """
        True when AMPK is low enough that a strength session won't suffer
        significant mTOR suppression. Optimal: AMPK < 0.25.
        """
        return self.ampk < 0.25

    def state_dict(self) -> dict:
        return {
            "ampk":               round(self.ampk,    3),
            "mtorc1":             round(self.mtorc1,  3),
            "interference_level": self.interference_level(),
            "anabolic_window":    self.anabolic_window_open(),
            "alpha2":             round(self.alpha2,  4),
            "gamma_i":            round(self.gamma_i, 3),
        }

    # ── Serialization ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "ampk":               self.ampk,
            "mtorc1":             self.mtorc1,
            "alpha1":             self.alpha1,
            "beta1":              self.beta1,
            "alpha2":             self.alpha2,
            "beta2":              self.beta2,
            "gamma_i":            self.gamma_i,
            "mtorc1_integral":    self._mtorc1_integral,
            "days_accumulated":   self._days_accumulated,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "CellularInterferenceModel":
        obj = cls(
            alpha1=d.get("alpha1", DEFAULT_ALPHA1),
            beta1=d.get("beta1",   DEFAULT_BETA1),
            alpha2=d.get("alpha2", DEFAULT_ALPHA2),
            beta2=d.get("beta2",   DEFAULT_BETA2),
            gamma_i=d.get("gamma_i", DEFAULT_GAMMA),
        )
        obj.ampk   = d.get("ampk",   0.0)
        obj.mtorc1 = d.get("mtorc1", 0.0)
        obj._mtorc1_integral  = d.get("mtorc1_integral",  0.0)
        obj._days_accumulated = d.get("days_accumulated", 0)
        return obj
