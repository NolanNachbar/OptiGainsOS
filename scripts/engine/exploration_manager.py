"""
exploration_manager.py — Controlled exploration via UCB1 bandit.

Manages which muscle/parameter to probe with slightly higher volume.
Uses epsilon-greedy + UCB1 scoring, with epsilon annealing over training weeks.
"""

import math
import numpy as np


def _epsilon_for_week(time_step: int) -> float:
    """
    Phase epsilon schedule:
      Weeks 1-4  (steps 0-3)   → 0.30
      Weeks 5-12 (steps 4-11)  → 0.15
      Week 13+   (steps 12+)   → 0.05
    """
    week = time_step  # caller passes 0-indexed week count
    if week < 4:
        return 0.30
    if week < 12:
        return 0.15
    return 0.05


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
        self._rng = np.random.default_rng(seed=42)

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
    ) -> str | None:
        """
        Returns the name of the parameter to explore this step, or None.

        With probability epsilon: return the arm with highest UCB1 score.
        Else: return None (no exploration).
        """
        epsilon = epsilon_override if epsilon_override is not None else _epsilon_for_week(time_step)
        if self._rng.random() < epsilon:
            total = int(self.counts.sum())
            scores = self._ucb1_scores(total)
            best_idx = int(np.argmax(scores))
            return self.parameters[best_idx]
        return None

    def record_outcome(self, parameter: str, reward: float) -> None:
        """Update counts and mean reward for the named arm."""
        i = self._param_idx.get(parameter)
        if i is None:
            return
        self.counts[i] += 1
        n = self.counts[i]
        # Incremental mean update
        self.values[i] += (reward - self.values[i]) / n

    def get_exploration_delta(self, time_step: int) -> dict:
        """
        Returns {muscle_name: extra_sets} if exploring this step, else {}.

        Extra sets = +1 on the selected muscle.
        """
        param = self.select_exploration_parameter(time_step)
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
