"""
Banister Dual-Pathway Kalman Filter.

Tracks latent Fitness (F_t) and Fatigue (f_t) states via a linear state-space model:

  x_t = A_t @ x_{t-1} + B_t * u_t + w_t   (state transition)
  y_t = C @ x_t + D + v_t                   (observation)

where:
  A_t  = diag([exp(-1/tau_fit), exp(-1/tau_fat)])   — exponential decay
  B_t  = [c_fit, c_fat]^T                            — load response
  C    = [1, -1]                                      — performance = F - f
  D    = baseline_perf                                — unprimed baseline
  w_t ~ N(0, Q)                                       — process noise
  v_t ~ N(0, R_t)                                     — measurement noise (dynamic)

State persists across days via the engine_params Supabase table.
RLS learner (rls_learner.py) hot-swaps tau/c parameters as it accumulates data.
"""
import math
import numpy as np
from typing import Optional

# Population-average defaults (overridden by RLS after 4+ weeks of data)
DEFAULT_TAU_FIT = 45.0   # fitness decay constant (days) — literature range 20-90
DEFAULT_TAU_FAT = 15.0   # fatigue decay constant (days) — literature range 5-25
DEFAULT_C_FIT   = 0.15   # fitness gain per unit load
DEFAULT_C_FAT   = 0.50   # fatigue gain per unit load
BASELINE_PERF   = 100.0  # arbitrary normalized performance baseline


class BanisterKalman:
    """
    Dual-pathway Fitness-Fatigue Kalman filter.

    x = [F_t, f_t]^T
    Performance(t) = BASELINE_PERF + F_t - f_t

    Usage per day:
        kf = BanisterKalman.from_dict(yesterday_params)
        kf.update_params(**rls.params_dict())   # if RLS has new estimates
        result = kf.step(u_t, y_t, hrv_z, soreness)
        save_to_supabase(kf.to_dict())
    """

    def __init__(
        self,
        tau_fit: float = DEFAULT_TAU_FIT,
        tau_fat: float = DEFAULT_TAU_FAT,
        c_fit:   float = DEFAULT_C_FIT,
        c_fat:   float = DEFAULT_C_FAT,
    ):
        self.tau_fit = tau_fit
        self.tau_fat = tau_fat
        self.c_fit   = c_fit
        self.c_fat   = c_fat

        # State [F, f] and covariance — cold start at zero with high uncertainty
        self.x: np.ndarray = np.array([[0.0], [0.0]])
        self.P: np.ndarray = np.eye(2) * 2.0

        self._build_matrices()

        # Process noise: fitness evolves slowly, fatigue is noisier day-to-day
        self.Q = np.diag([0.005, 0.025])
        # Base measurement noise (scaled by HRV/soreness in update step)
        self.R_base = 2.0

    # ── System matrices ───────────────────────────────────────────────────────

    def _build_matrices(self):
        self.A = np.array([
            [math.exp(-1.0 / self.tau_fit), 0.0],
            [0.0, math.exp(-1.0 / self.tau_fat)],
        ])
        self.B = np.array([[self.c_fit], [self.c_fat]])
        self.C = np.array([[1.0, -1.0]])   # performance = F − f

    def update_params(
        self,
        tau_fit: float,
        tau_fat: float,
        c_fit:   float,
        c_fat:   float,
        **kwargs,  # absorb extra keys from RLS params_dict
    ):
        """Hot-swap decay constants from RLS learner without resetting state."""
        self.tau_fit = float(tau_fit)
        self.tau_fat = float(tau_fat)
        self.c_fit   = float(c_fit)
        self.c_fat   = float(c_fat)
        self._build_matrices()

    # ── Kalman steps ──────────────────────────────────────────────────────────

    def predict(self, u_t: float):
        """
        Prediction step. Advance state by one day given training load u_t.

        u_t: daily training stress score (TSS), typically 0–150.
             Normalized internally to Banister load units.
        """
        # Normalize TSS → Banister load units (TSS 100 ≈ load 1.0)
        u = u_t / 100.0
        self.x = self.A @ self.x + self.B * u
        self.P = self.A @ self.P @ self.A.T + self.Q
        # Enforce symmetry to prevent numerical drift
        self.P = 0.5 * (self.P + self.P.T)

    def update(
        self,
        y_t:      float,
        hrv_z:    float = 0.0,
        soreness: float = 5.0,
    ):
        """
        Update step. Incorporate an observation.

        y_t:      observed performance on the Banister scale (100 = baseline form).
                  Supplied by compute_observation_y as today's e1RM relative to the
                  athlete's recent baseline (NOT the recovery score).
        hrv_z:    rolling 7-day HRV z-score. Positive = above baseline = reliable.
        soreness: composite muscle soreness 1–10. High = noisy measurement.
        """
        # Dynamic noise: low HRV or high soreness → less trustworthy observation
        noise_scaler = math.exp(-hrv_z * 0.25) * (1.0 + soreness / 25.0)
        R_t = max(0.2, self.R_base * noise_scaler)

        y_pred   = BASELINE_PERF + float((self.C @ self.x).item())
        residual = y_t - y_pred
        S_t      = float((self.C @ self.P @ self.C.T).item()) + R_t
        K_t      = (self.P @ self.C.T) / S_t   # 2×1 Kalman gain

        self.x = self.x + K_t * residual
        self.P = self.P - K_t @ self.C @ self.P
        self.P = 0.5 * (self.P + self.P.T)

        # Square-root safety: keep P positive definite
        eigvals = np.linalg.eigvalsh(self.P)
        if eigvals.min() < 1e-6:
            self.P += np.eye(2) * (1e-6 - eigvals.min())

    def step(
        self,
        u_t:      float,
        y_t:      Optional[float],
        hrv_z:    float = 0.0,
        soreness: float = 5.0,
    ) -> dict:
        """
        Full daily predict + optional update.

        y_t may be None on days with no reliable observation (e.g., no Garmin data).
        Returns state summary dict.
        """
        self.predict(u_t)
        if y_t is not None:
            self.update(y_t, hrv_z=hrv_z, soreness=soreness)
        return self.state_dict()

    # ── Simulation (used by MPC prescriber) ──────────────────────────────────

    def simulate_forward(self, load_sequence: list) -> list:
        """
        Simulate state evolution over a sequence of daily loads (TSS values).
        Does NOT mutate self — returns list of state snapshots.
        Used by mpc_prescriber for 14-day trajectory evaluation.
        """
        x = self.x.copy()
        P = self.P.copy()
        snapshots = []
        for u_t in load_sequence:
            u = u_t / 100.0
            x = self.A @ x + self.B * u
            P = self.A @ P @ self.A.T + self.Q
            P = 0.5 * (P + P.T)
            fitness  = float(x[0, 0])
            fatigue  = float(x[1, 0])
            snapshots.append({
                "fitness":  round(fitness, 3),
                "fatigue":  round(fatigue, 3),
                "tsb":      round(fitness - fatigue, 3),
                "perf":     round(BASELINE_PERF + fitness - fatigue, 2),
            })
        return snapshots

    # ── Output ────────────────────────────────────────────────────────────────

    def state_dict(self) -> dict:
        fitness    = float(self.x[0, 0])
        fatigue    = float(self.x[1, 0])
        confidence = round(1.0 / (1.0 + float(np.trace(self.P))), 3)
        return {
            "fitness":      round(fitness, 3),
            "fatigue":      round(fatigue, 3),
            "performance":  round(BASELINE_PERF + fitness - fatigue, 2),
            "tsb_banister": round(fitness - fatigue, 3),
            "confidence":   confidence,
            "P_trace":      round(float(np.trace(self.P)), 4),
        }

    # ── Serialization ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        """Serialize full state for storage in engine_params table."""
        return {
            "x":       self.x.flatten().tolist(),
            "P":       self.P.tolist(),
            "tau_fit": round(self.tau_fit, 3),
            "tau_fat": round(self.tau_fat, 3),
            "c_fit":   round(self.c_fit, 4),
            "c_fat":   round(self.c_fat, 4),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "BanisterKalman":
        """Restore from stored dict. Gracefully handles missing keys (first run)."""
        obj = cls(
            tau_fit=d.get("tau_fit", DEFAULT_TAU_FIT),
            tau_fat=d.get("tau_fat", DEFAULT_TAU_FAT),
            c_fit=d.get("c_fit",   DEFAULT_C_FIT),
            c_fat=d.get("c_fat",   DEFAULT_C_FAT),
        )
        if "x" in d:
            obj.x = np.array(d["x"], dtype=float).reshape(2, 1)
        if "P" in d:
            obj.P = np.array(d["P"], dtype=float)
        return obj
