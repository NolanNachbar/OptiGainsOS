"""
learners.py — N=1 Bayesian learners (ADAPTIVE_ENGINE_DESIGN.md §4).

Each parameter is Normal(mean, var), updated weekly with a Kalman-style gain.
A learned value is only ACTED ON once its credible interval excludes the prior
(`mature`); until then the allocator uses the population prior and keeps
exploring. This is the discipline the old rls_learner lacked.

All constants tagged [ENG] are tunable engineering defaults, not principles.
"""
from __future__ import annotations
import math

# MRV learner constants
K_MAX    = 0.34   # [ENG] cap a single week's influence (no one week swings a posterior)
SOR_OK   = 2.5    # [ENG] mean soreness (0-5) at/below which a muscle is "recoverable"
SOR_HI   = 4.0    # [ENG] soreness at/above which a stall signals over-MRV
OBS_VAR  = 9.0    # [ENG] observation noise (sets^2); designed tests can pass lower


def update_mrv(row: dict, weekly_sets: float, e1rm_slope, soreness_avg: float,
               prior_mrv: float) -> dict:
    """
    Update one muscle's MRV posterior from last week's response.

    row: current athlete_landmarks row (mrv_mean, mrv_var, n_obs, mev, mav, mrv).
    weekly_sets: sets the muscle actually got (use last week's planned target).
    e1rm_slope: per-muscle e1RM slope (None if no strength signal -> uninformative).
    soreness_avg: mean soreness 0-5.
    prior_mrv: population prior MRV (maturity is measured against this).

    Returns the fields to upsert (mrv_mean, mrv_var, n_obs, mature, mrv, mav).
    Leaves the posterior unchanged on an uninformative week.
    """
    mean = float(row.get("mrv_mean", prior_mrv))
    var  = float(row.get("mrv_var", 9.0))
    n    = int(row.get("n_obs", 0))
    mev  = float(row.get("mev", 6))

    obs = None
    if weekly_sets and weekly_sets > 0 and e1rm_slope is not None:
        responding  = e1rm_slope > 0
        recoverable = soreness_avg <= SOR_OK
        if responding and recoverable:
            obs = weekly_sets + 1          # MRV is at least this, probably higher
        elif (not responding) and soreness_avg >= SOR_HI:
            obs = weekly_sets - 1          # over MRV — stalling and sore

    if obs is not None:
        K = min(var / (var + OBS_VAR), K_MAX)
        mean = mean + K * (obs - mean)
        var  = var * (1 - K)
        n   += 1

    mature = abs(mean - prior_mrv) > 1.96 * math.sqrt(max(var, 1e-9))
    mrv = round(mean) if mature else round(prior_mrv)
    mav = max(mev + 1, min(round(mean) - 2, mrv - 1))  # keep MAV below MRV
    return {"mrv_mean": round(mean, 2), "mrv_var": round(var, 3), "n_obs": n,
            "mature": bool(mature), "mrv": mrv, "mav": mav}


# ── Frequency bandit (per muscle) ─────────────────────────────────────────────
FREQ_OBS_VAR = 1.0   # [ENG]
FREQ_MIN_N   = 3     # [ENG] arms need this many obs before they're trusted


def update_frequency(meta: dict, freq_used: int, reward: float) -> dict:
    """Update the posterior for the frequency arm that was actually run.
    meta: {str(arm): {"mean","var","n"}}. reward = that muscle's e1RM slope."""
    meta = dict(meta or {})
    arm = str(int(freq_used))
    a = meta.get(arm, {"mean": 0.0, "var": 1.0, "n": 0})
    K = a["var"] / (a["var"] + FREQ_OBS_VAR)
    a["mean"] = round(a["mean"] + K * (reward - a["mean"]), 4)
    a["var"]  = round(a["var"] * (1 - K), 4)
    a["n"]    = a["n"] + 1
    meta[arm] = a
    return meta


def best_frequency(meta: dict, default: int = 4) -> int:
    """Best frequency arm among those with enough observations; else the prior."""
    if not meta:
        return default
    matured = {int(k): v for k, v in meta.items() if v.get("n", 0) >= FREQ_MIN_N}
    if not matured:
        return default
    return max(matured, key=lambda k: matured[k]["mean"])
