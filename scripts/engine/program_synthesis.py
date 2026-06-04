"""
program_synthesis.py — MILP-based weekly volume allocation engine.

Uses scipy.optimize.milp when available; falls back to numpy proportional
distribution if scipy is absent or the solver fails.

Each call to synthesize_weekly_block() returns a (num_muscles, 7) matrix
where entry [i, d] is the number of sets for muscle i on day d.
"""

import numpy as np

try:
    from scipy.optimize import milp, LinearConstraint, Bounds
    _SCIPY_AVAILABLE = True
except ImportError:
    _SCIPY_AVAILABLE = False

MUSCLE_GROUPS = [
    "chest", "upper_back", "lats", "quads", "hamstrings",
    "glutes", "shoulders", "triceps", "biceps", "calves", "core",
]

# Default objective weights (higher = prioritised in allocation)
_DEFAULT_WEIGHTS = {m: 1.0 for m in MUSCLE_GROUPS}
_DEFAULT_WEIGHTS.update({"chest": 1.4, "quads": 1.3, "lats": 1.2,
                          "hamstrings": 1.2, "upper_back": 1.2})


class ProgramSynthesisEngine:
    """
    Synthesises a weekly volume block via MILP.

    Decision variables: x[i, d] = integer sets for muscle i on day d.
    Auxiliary binary:   z[d]     = 1 if day d is a strength day (total sets >= 1).
    """

    def __init__(self, muscle_groups=None, weights=None):
        self.muscle_groups = list(muscle_groups or MUSCLE_GROUPS)
        self.n_muscles = len(self.muscle_groups)
        self.weights = {m: float((weights or {}).get(m, _DEFAULT_WEIGHTS.get(m, 1.0)))
                        for m in self.muscle_groups}
        # Bayesian prior hyperparams per muscle (alpha, beta for reward model)
        self._alpha = {m: 1.0 for m in self.muscle_groups}
        self._beta  = {m: 1.0 for m in self.muscle_groups}

    # ── Public API ─────────────────────────────────────────────────────────────

    def synthesize_weekly_block(
        self,
        mrv_dict: dict,
        user_preferences: dict,
        historical_acwr: float,
    ) -> np.ndarray:
        """
        Returns allocation matrix shape (n_muscles, 7).

        Args:
            mrv_dict           {muscle: MRV_sets}
            user_preferences   dict with optional keys:
                                 "max_daily_sets" (default 20)
                                 "min_strength_days" (default 4)
            historical_acwr    recent ACWR float (>1.4 triggers volume cap)
        """
        max_daily = int(user_preferences.get("max_daily_sets", 20))
        min_str   = int(user_preferences.get("min_strength_days", 4))

        mrv = np.array([float(mrv_dict.get(m, 18)) for m in self.muscle_groups])

        # ACWR guard: cap total weekly volume
        acwr_cap_factor = 0.70 if historical_acwr > 1.4 else 1.0
        mrv_effective = mrv * acwr_cap_factor

        if _SCIPY_AVAILABLE:
            result = self._milp_solve(mrv_effective, max_daily, min_str)
            if result is not None:
                return result

        # Fallback
        return self._proportional_fallback(mrv_effective, max_daily, min_str)

    def update_weights(self, performance_deltas: dict) -> None:
        """
        Bayesian weight update: positive delta increases weight for that muscle.

        performance_delta is typically e1RM slope or subjective progress score.
        """
        for muscle, delta in performance_deltas.items():
            if muscle not in self.weights:
                continue
            # Treat delta as Bernoulli reward signal scaled to [0,1]
            reward = min(1.0, max(0.0, 0.5 + delta * 5.0))
            self._alpha[muscle] += reward
            self._beta[muscle]  += (1.0 - reward)
            # Posterior mean of Beta distribution
            post_mean = self._alpha[muscle] / (self._alpha[muscle] + self._beta[muscle])
            # Map [0,1] posterior to weight range [0.5, 2.0]
            self.weights[muscle] = round(0.5 + 1.5 * post_mean, 4)

    def to_dict(self) -> dict:
        return {
            "muscle_groups": self.muscle_groups,
            "weights":       self.weights,
            "_alpha":        self._alpha,
            "_beta":         self._beta,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ProgramSynthesisEngine":
        obj = cls(muscle_groups=d.get("muscle_groups"), weights=d.get("weights"))
        obj._alpha = d.get("_alpha", {m: 1.0 for m in obj.muscle_groups})
        obj._beta  = d.get("_beta",  {m: 1.0 for m in obj.muscle_groups})
        return obj

    # ── MILP solver ────────────────────────────────────────────────────────────

    def _milp_solve(
        self,
        mrv_effective: np.ndarray,
        max_daily: int,
        min_str_days: int,
    ) -> np.ndarray | None:
        """
        Variables layout (all integers):
          x[i, d] for i in 0..n_muscles-1, d in 0..6  → n_muscles*7 vars
          z[d]    for d in 0..6                        → 7 binary vars

        Total vars: n_muscles*7 + 7
        """
        N  = self.n_muscles
        D  = 7
        NV = N * D + D  # total decision variables

        # ── Objective: maximise weighted volume (milp minimises) ──────────────
        w = np.array([self.weights.get(m, 1.0) for m in self.muscle_groups])
        # Repeat weights across 7 days
        c_x = np.tile(-w, D)          # shape (N*D,)
        c_z = np.zeros(D)             # binary variables don't contribute
        c   = np.concatenate([c_x, c_z])

        # ── Variable bounds ───────────────────────────────────────────────────
        lb = np.zeros(NV)
        ub = np.empty(NV)
        # x upper bounds: MRV per muscle (repeats across 7 days as per-day cap)
        per_day_mrv = mrv_effective / D  # rough per-day limit used as soft cap
        for d in range(D):
            for i in range(N):
                ub[d * N + i] = max(1.0, mrv_effective[i])  # daily can be at most full MRV (soft)
        # z binary
        ub[N * D:] = 1.0

        bounds = Bounds(lb=lb, ub=ub)

        # ── Integrality ───────────────────────────────────────────────────────
        # 0 = continuous, 1 = integer
        integrality = np.ones(NV)

        # ── Constraints ──────────────────────────────────────────────────────
        constraint_rows = []
        constraint_lb   = []
        constraint_ub   = []

        # 1. Per-muscle weekly sum <= MRV
        for i in range(N):
            row = np.zeros(NV)
            for d in range(D):
                row[d * N + i] = 1.0
            constraint_rows.append(row)
            constraint_lb.append(0.0)
            constraint_ub.append(float(mrv_effective[i]))

        # 2. Per-day total sets <= max_daily
        for d in range(D):
            row = np.zeros(NV)
            for i in range(N):
                row[d * N + i] = 1.0
            constraint_rows.append(row)
            constraint_lb.append(0.0)
            constraint_ub.append(float(max_daily))

        # 3. Binary z_d: z_d = 1 iff day d has >= 1 set
        #    Linearise: sum_i x[i,d] <= max_daily * z_d  AND
        #               sum_i x[i,d] >= z_d
        BIG_M = float(max_daily)
        for d in range(D):
            # sum x[i,d] - BIG_M * z_d <= 0
            row = np.zeros(NV)
            for i in range(N):
                row[d * N + i] = 1.0
            row[N * D + d] = -BIG_M
            constraint_rows.append(row)
            constraint_lb.append(-np.inf)
            constraint_ub.append(0.0)

            # sum x[i,d] - z_d >= 0
            row2 = np.zeros(NV)
            for i in range(N):
                row2[d * N + i] = 1.0
            row2[N * D + d] = -1.0
            constraint_rows.append(row2)
            constraint_lb.append(0.0)
            constraint_ub.append(np.inf)

        # 4. At least min_str_days with z_d = 1
        row = np.zeros(NV)
        row[N * D:] = 1.0
        constraint_rows.append(row)
        constraint_lb.append(float(min_str_days))
        constraint_ub.append(float(D))

        A   = np.vstack(constraint_rows)
        lc  = LinearConstraint(A, constraint_lb, constraint_ub)

        try:
            res = milp(c=c, constraints=lc, integrality=integrality, bounds=bounds,
                       options={"disp": False, "time_limit": 10.0})
            if res.success or res.status in (0, 3):  # optimal or feasible
                x_flat = res.x[:N * D]
                mat    = np.round(x_flat).reshape(D, N).T  # (N, 7)
                return np.clip(mat, 0, None).astype(int)
        except Exception as exc:
            print(f"  WARN milp solver error: {exc}")

        return None

    # ── Fallback ───────────────────────────────────────────────────────────────

    def _proportional_fallback(
        self,
        mrv_effective: np.ndarray,
        max_daily: int,
        min_str_days: int,
    ) -> np.ndarray:
        """
        Simple proportional allocation:
        Spread each muscle's MRV evenly across min_str_days training days,
        capping per-day totals at max_daily.
        """
        D = 7
        mat = np.zeros((self.n_muscles, D), dtype=float)

        # Training days: evenly spaced, prefer Mon-Sat pattern
        training_days = list(range(min(min_str_days, D)))

        for i, mrv in enumerate(mrv_effective):
            sets_per_day = mrv / max(len(training_days), 1)
            for d in training_days:
                mat[i, d] = sets_per_day

        # Enforce per-day cap
        for d in range(D):
            col_sum = mat[:, d].sum()
            if col_sum > max_daily:
                mat[:, d] *= max_daily / col_sum

        return np.round(mat).astype(int)
