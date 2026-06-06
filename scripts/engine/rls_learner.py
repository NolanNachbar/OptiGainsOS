"""
Recursive Least Squares (RLS) Parameter Learner.

Learns θ = [tau_fit, tau_fat, c_fit, c_fat] — the individual physiological
decay constants used by the Banister Kalman filter.

Population-average defaults work initially, but everyone's fitness and fatigue
dynamics differ. RLS accumulates performance residuals across weeks and nudges θ
toward what your actual data suggests.

Update schedule: once per week (Sunday), not daily. Daily updates amplify noise.
Skipped entirely when input variance is too low (e.g., uniform training) to prevent
covariance windup — a covariance that explodes causes wild parameter swings.

KNOWN LIMITATION (do not "fix" the windup guard expecting τ to start learning):
This linear regression of absolute performance (y_t ~ 100) onto
phi = [fitness, fatigue, load, nutrition] with theta = [tau_fit, tau_fat, c_fit, c_fat]
is NOT a sound system-identification of the Banister time-constants:
  - Scale mismatch: phi·theta is not on the performance scale, so any update that
    passes the guard drives theta toward its clamp bounds rather than toward the
    athlete's true values.
  - Identifiability: load builds fitness AND fatigue; from a single daily
    performance number you only observe the net (c_fit − c_fat), so c_fit and c_fat
    cannot be separated here.
The MIN_PHI_VAR guard is therefore conservative BY DESIGN — it keeps theta near the
(sane) population defaults instead of corrupting them. Properly personalising τ
requires a structural estimator (EKF / joint state-parameter Kalman, or an offline
multi-day Banister fit), which is a separate piece of work. Until then, treat the
learned params as advisory and lean on the Kalman's online STATE adaptation.
"""
import math
import numpy as np
from typing import Optional

# Physiological bounds — hard clamps after each update
THETA_BOUNDS = [
    (20.0, 90.0),    # tau_fit  (days)
    (5.0,  25.0),    # tau_fat  (days)
    (0.05, 0.40),    # c_fit
    (0.20, 0.80),    # c_fat
]

DEFAULT_THETA   = [45.0, 15.0, 0.15, 0.50]
LAMBDA_FORGET   = 0.98      # forgetting factor: ~0.98 tracks 50-week window
MIN_PHI_VAR     = 0.02      # skip update if regressor variance < this (windup guard)
MIN_UPDATES_FOR_CONFIDENCE = 4  # trust confidence score only after this many updates


class RLSParameterLearner:
    """
    Estimates personal Banister decay constants via RLS.

    phi_t (regressor) = [prev_fitness, prev_fatigue, weekly_load, nutrition_factor]
    y_t   (target)    = observed performance proxy (e.g., recovery score residual
                        or e1RM residual from Kalman prediction)

    After ~4-8 weeks of data the parameter estimates start diverging meaningfully
    from population averages. After 12+ weeks they're well-calibrated to you.
    """

    def __init__(
        self,
        initial_theta: Optional[list] = None,
        lambda_forget: float = LAMBDA_FORGET,
    ):
        self.theta         = np.array(initial_theta or DEFAULT_THETA, dtype=float).reshape(4, 1)
        self.P_theta       = np.eye(4) * 3.0   # high initial uncertainty
        self.lambda_forget = lambda_forget
        self.update_count  = 0

        # Accumulate weekly data points between Sunday updates
        self._weekly_buffer: list = []   # list of (phi, y_t) tuples

    # ── Data accumulation ─────────────────────────────────────────────────────

    def accumulate(self, phi: list, y_t: float):
        """
        Buffer one data point. Call daily during compute_athlete_state.
        The actual RLS update runs on Sunday via weekly_update().
        """
        self._weekly_buffer.append((list(phi), float(y_t)))

    def weekly_update(self) -> dict:
        """
        Run RLS update on the buffered week of data. Call on Sunday.
        Returns updated parameter estimates.
        Clears the buffer afterward.
        """
        if not self._weekly_buffer:
            return self.params_dict()

        for phi_list, y_t in self._weekly_buffer:
            self._single_update(phi_list, y_t)

        self._weekly_buffer.clear()
        return self.params_dict()

    def _single_update(self, phi: list, y_t: float):
        phi_vec = np.array(phi, dtype=float).reshape(4, 1)

        # Windup guard: skip if input variance is too flat
        if float(np.var(phi_vec)) < MIN_PHI_VAR:
            return

        denom    = self.lambda_forget + (phi_vec.T @ self.P_theta @ phi_vec).item()
        K        = (self.P_theta @ phi_vec) / denom
        pred_err = y_t - (phi_vec.T @ self.theta).item()

        self.theta   = self.theta + K * pred_err
        self.P_theta = ((self.P_theta - K @ phi_vec.T @ self.P_theta)
                        / self.lambda_forget)
        self.P_theta = 0.5 * (self.P_theta + self.P_theta.T)

        # Enforce physiological bounds
        for i, (lo, hi) in enumerate(THETA_BOUNDS):
            self.theta[i, 0] = float(np.clip(self.theta[i, 0], lo, hi))

        self.update_count += 1

    # ── Output ────────────────────────────────────────────────────────────────

    def params_dict(self) -> dict:
        """Return current parameter estimates + confidence score."""
        t = self.theta.flatten()
        # Confidence: exp(-det(P_theta)) → 1 when P→0 (very certain), 0 when P large
        # Only report meaningful confidence after enough data
        if self.update_count >= MIN_UPDATES_FOR_CONFIDENCE:
            raw_det = float(np.linalg.det(self.P_theta))
            confidence = round(math.exp(-max(0.0, raw_det)), 4)
        else:
            confidence = 0.0

        return {
            "tau_fit":    round(float(t[0]), 2),
            "tau_fat":    round(float(t[1]), 2),
            "c_fit":      round(float(t[2]), 4),
            "c_fat":      round(float(t[3]), 4),
            "confidence": confidence,
            "updates":    self.update_count,
            "buffer_len": len(self._weekly_buffer),
        }

    def is_mature(self) -> bool:
        """True once the learner has enough data to override Kalman defaults."""
        return self.update_count >= MIN_UPDATES_FOR_CONFIDENCE

    # ── Serialization ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "theta":         self.theta.flatten().tolist(),
            "P_theta":       self.P_theta.tolist(),
            "lambda_forget": self.lambda_forget,
            "update_count":  self.update_count,
            "weekly_buffer": self._weekly_buffer,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "RLSParameterLearner":
        obj = cls(
            initial_theta=d.get("theta", DEFAULT_THETA),
            lambda_forget=d.get("lambda_forget", LAMBDA_FORGET),
        )
        if "P_theta" in d:
            obj.P_theta = np.array(d["P_theta"], dtype=float)
        obj.update_count    = d.get("update_count", 0)
        obj._weekly_buffer  = d.get("weekly_buffer", [])
        return obj
