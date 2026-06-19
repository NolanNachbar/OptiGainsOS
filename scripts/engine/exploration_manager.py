"""
exploration_manager.py — Controlled exploration via UCB1 bandit.

Manages which muscle/parameter to probe with slightly higher volume.
Uses a DETERMINISTIC epsilon schedule + UCB1 scoring, the epsilon annealing over
training weeks down to a floor (never zero) so probing never permanently stops.

CONVERGENCE_AUDIT F3: the old design drew `rng.random() < epsilon` with a fixed
seed re-seeded every run (`default_rng(42).random()` == 0.7740, max epsilon 0.30),
so the draw was False on every run forever and the entire active-probing subsystem
was dead from day 1. The fix replaces the random draw with a deterministic
step-count schedule: fire on the weeks where the running expected-probe count
crosses an integer (long-run rate == epsilon, fully reproducible, no RNG state to
persist). Part 1.3: epsilon now floors at 0.10 (was 0.05) so an indefinitely
running N=1 system keeps probing ~1/10 weeks instead of annealing to near-frozen.
"""

import math
import numpy as np


def _epsilon_for_week(time_step: int) -> float:
    """
    Phase epsilon schedule (annealed exploration rate):
      Weeks 1-4  (steps 0-3)   → 0.30
      Weeks 5-12 (steps 4-11)  → 0.15
      Week 13+   (steps 12+)   → 0.10   ← FLOOR, never anneals below (F3 / Part 1.3)
    """
    week = time_step  # caller passes 0-indexed week count
    if week < 4:
        return 0.30
    if week < 12:
        return 0.15
    return 0.10


def _expected_probes_through(week: int, epsilon=None) -> float:
    """Cumulative expected probe count from week 0 through `week` inclusive.
    With `epsilon` (a constant), use it for every week (re-warming override)."""
    if week < 0:
        return 0.0
    eps = (lambda _w: float(epsilon)) if epsilon is not None else _epsilon_for_week
    return sum(eps(w) for w in range(week + 1))


def _should_explore(time_step: int, epsilon=None) -> bool:
    """Deterministic probe trigger: True on weeks where the running expected-probe
    count crosses an integer (so the long-run firing rate equals epsilon). Replaces
    the dead `rng.random() < epsilon` draw (F3)."""
    if time_step < 0:
        return False
    prev = _expected_probes_through(time_step - 1, epsilon)
    return int(_expected_probes_through(time_step, epsilon)) > int(prev)


class ControlledExplorationManager:
    """
    UCB1 multi-armed bandit over muscle/parameter names.

    With probability epsilon: select the arm with highest UCB1 score and
    return it as the exploration target (returning +1 set for that muscle).
    Otherwise: return {} (no exploration this step).
    """

    def __init__(self, parameters: list):
        self.parameters = list(parameters)
        n = len(parameters)
        self.counts = np.zeros(n, dtype=float)
        self.values = np.zeros(n, dtype=float)  # mean reward per arm
        self._param_idx = {p: i for i, p in enumerate(parameters)}

    # ── UCB1 ──────────────────────────────────────────────────────────────────

    def _ucb1_scores(self, total_pulls: int) -> np.ndarray:
        """
        UCB1: value[i] + sqrt(2 * ln(total_pulls) / counts[i])
        Arms never pulled get infinite score.
        """
        scores = np.full(len(self.parameters), np.inf)
        if total_pulls == 0:
            return scores
        log_t = math.log(max(1, total_pulls))
        for i, c in enumerate(self.counts):
            if c > 0:
                scores[i] = self.values[i] + math.sqrt(2.0 * log_t / c)
        return scores

    # ── Public API ─────────────────────────────────────────────────────────────

    def select_exploration_parameter(
        self,
        time_step: int,
        epsilon_override: float = None,
        eligible=None,
    ) -> str | None:
        """
        Returns the name of the parameter to explore this step, or None.

        Deterministic schedule: on a probe week, return the arm with highest UCB1
        score; otherwise None. `epsilon_override` (a constant rate, e.g. 0.20 to
        re-warm after a phase change) replaces the annealed schedule when given.

        E8 (bounded self-experimentation): `eligible`, when given, restricts probing to
        parameters whose posterior is still WIDE (immature — the Clues/Patterns phase).
        As posteriors converge to Established the eligible set shrinks and exploration
        DECAYS toward zero (near-silent once converged); when nothing is eligible no probe
        fires. None means "all eligible" (back-compat).
        """
        if not self.parameters:
            return None
        if not _should_explore(time_step, epsilon_override):
            return None
        if eligible is None:
            elig_idx = list(range(len(self.parameters)))
        else:
            elig_set = set(eligible)
            elig_idx = [i for i, p in enumerate(self.parameters) if p in elig_set]
        if not elig_idx:
            return None                       # all converged → exploration is silent
        scores = self._ucb1_scores(int(self.counts.sum()))
        best_idx = max(elig_idx, key=lambda i: scores[i])
        return self.parameters[best_idx]

    def record_outcome(self, parameter: str, reward: float) -> None:
        """Update counts and mean reward for the named arm."""
        i = self._param_idx.get(parameter)
        if i is None:
            return
        self.counts[i] += 1
        n = self.counts[i]
        # Incremental mean update
        self.values[i] += (reward - self.values[i]) / n

    def get_exploration_delta(self, time_step: int, epsilon_override=None,
                              eligible=None) -> dict:
        """
        Returns {muscle_name: extra_sets} if exploring this step, else {}.

        Extra sets = +1 on the selected muscle (bounded, recovery-safe probe magnitude).
        Pass `epsilon_override` (e.g. 0.20) to re-warm exploration after a phase change.
        `eligible` (E8) restricts probing to still-uncertain parameters; an empty/converged
        eligible set yields {} (no probe).
        """
        param = self.select_exploration_parameter(time_step, epsilon_override, eligible)
        if param is None:
            return {}
        return {param: 1}

    # ── Serialisation ──────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "parameters": self.parameters,
            "counts":     self.counts.tolist(),
            "values":     self.values.tolist(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ControlledExplorationManager":
        params = d.get("parameters", [])
        obj = cls(parameters=params)
        if "counts" in d:
            obj.counts = np.array(d["counts"], dtype=float)
        if "values" in d:
            obj.values = np.array(d["values"], dtype=float)
        return obj
