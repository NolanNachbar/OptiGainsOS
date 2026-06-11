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
SOR_OK   = 4.0    # [ENG] mean soreness (1-10; check-in 0-3 mapped 1+3v) at/below which a muscle is "recoverable"
SOR_HI   = 7.0    # [ENG] soreness (1-10) at/above which a stall signals over-MRV
OBS_VAR  = 9.0    # [ENG] observation noise (sets^2); designed tests can pass lower


def update_mrv(row: dict, weekly_sets: float, e1rm_slope, soreness_avg: float,
               prior_mrv: float) -> dict:
    """
    Update one muscle's MRV posterior from last week's response.

    row: current athlete_landmarks row (mrv_mean, mrv_var, n_obs, mev, mav, mrv).
    weekly_sets: sets the muscle actually got (use last week's planned target).
    e1rm_slope: per-muscle e1RM slope (None if no strength signal -> uninformative).
    soreness_avg: mean soreness 1-10 (check-in 0-3 mapped 1+3v).
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
        if responding and recoverable and weekly_sets + 1 > mean:
            # Censored "MRV is at least this" — only informative ABOVE the mean,
            # otherwise positive response below the posterior drags MRV down.
            obs = weekly_sets + 1
        elif (not responding) and soreness_avg >= SOR_HI:
            obs = weekly_sets - 1          # over MRV — stalling and sore

    if obs is not None:
        K = min(var / (var + OBS_VAR), K_MAX)
        mean = mean + K * (obs - mean)
        var  = var * (1 - K)
        n   += 1

    mature = abs(mean - prior_mrv) > 1.96 * math.sqrt(max(var, 1e-9))
    mrv = max(round(mean) if mature else round(prior_mrv), round(mev) + 2)
    mav = max(mev + 1, min(round(mean) - 2, mrv - 1))  # keep MAV below MRV
    return {"mrv_mean": round(mean, 2), "mrv_var": round(var, 3), "n_obs": n,
            "mature": bool(mature), "mrv": mrv, "mav": mav}


def apply_mrv_observation(row: dict, obs: float, obs_var: float, prior_mrv: float) -> dict:
    """Apply a DIRECT MRV observation (e.g. from a designed volume-tolerance test,
    which carries low obs_var so it moves the posterior faster than a passive week)."""
    mean = float(row.get("mrv_mean", prior_mrv))
    var  = float(row.get("mrv_var", 9.0))
    n    = int(row.get("n_obs", 0))
    mev  = float(row.get("mev", 6))
    K = min(var / (var + obs_var), 0.5)   # [ENG] designed tests may update a bit harder
    mean = mean + K * (obs - mean)
    var  = var * (1 - K)
    n   += 1
    mature = abs(mean - prior_mrv) > 1.96 * math.sqrt(max(var, 1e-9))
    mrv = max(round(mean) if mature else round(prior_mrv), round(mev) + 2)
    mav = max(mev + 1, min(round(mean) - 2, mrv - 1))
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


# ── Exercise-value learner (ADAPTIVE_ENGINE_DESIGN.md §4, exercise→growth) ─────
# A Normal posterior per exercise. The reward blends three N=1 signals:
#   1. strength response  — e1RM slope while the exercise is in the program
#   2. revealed preference — Nolan swapping it IN (+) or skipping it (-)
#   3. written feedback   — notes sentiment (liked / disliked / too-easy / pain)
# The learned mean is added to the session generator's priority score, so movements
# he responds to and reaches for get programmed more; ones he drops fade out.
# Per his call: a single swap is a small nudge (one-off vote), not an instant
# rewrite — repetition is what moves the posterior decisively.
EXVAL_OBS_VAR   = 1.0    # [ENG] observation noise
EXVAL_PRIOR_VAR = 1.0    # [ENG] starting uncertainty
SWAP_VOTE       = 0.5    # [ENG] value of one "chose this" deviation vote
DROP_VOTE       = -0.5   # [ENG] value of one "skipped this" deviation vote
SENTIMENT_GAIN  = 0.6    # [ENG] per net like/dislike mention
EASY_GAIN       = 0.3    # [ENG] "too easy" reads as productive (earning its slot)
HARD_LOSS       = -0.3   # [ENG] "too hard / grinding" reads as hold / back off
PAIN_PENALTY    = -1.5   # [ENG] a pain note is a strong "stop programming this"
SLOPE_SCALE     = 2.5    # [ENG] lbs/session that saturates the strength-response term


def update_exercise_value(meta: dict, exercise: str, reward: float) -> dict:
    """
    Kalman-gain Normal update of one exercise's value posterior.
    meta: {canon_name: {"mean","var","n"}}.  Mutates a copy and returns it.
    """
    meta = dict(meta or {})
    a = dict(meta.get(exercise, {"mean": 0.0, "var": EXVAL_PRIOR_VAR, "n": 0}))
    K = a["var"] / (a["var"] + EXVAL_OBS_VAR)
    a["mean"] = round(a["mean"] + K * (reward - a["mean"]), 4)
    a["var"]  = round(a["var"] * (1 - K), 4)
    a["n"]    = int(a.get("n", 0)) + 1
    meta[exercise] = a
    return meta


def exercise_reward(slope, chosen_votes: int, dropped_votes: int,
                    sentiment: float, easy_mentions: int, pain: bool,
                    hard_mentions: int = 0) -> float:
    """Blend the per-exercise signals for one week into a single reward scalar."""
    r = 0.0
    if slope is not None:
        # Strength response, normalized to the ±1 scale of the vote/note terms
        # so a normally progressing lift can't drown them (raw slope is lbs/session).
        r += max(-1.0, min(1.0, float(slope) / SLOPE_SCALE))
    r += SWAP_VOTE * int(chosen_votes or 0)
    r += DROP_VOTE * int(dropped_votes or 0)
    r += SENTIMENT_GAIN * float(sentiment or 0.0)
    r += EASY_GAIN * int(easy_mentions or 0)
    r += HARD_LOSS * int(hard_mentions or 0)
    if pain:
        # Hard veto: no amount of progress masks a flagged injury signal.
        return round(min(r + PAIN_PENALTY, PAIN_PENALTY), 4)
    return round(r, 4)


def exercise_value(meta: dict, exercise: str) -> float:
    """Learned value for an exercise (0 if never observed)."""
    return float((meta or {}).get(exercise, {}).get("mean", 0.0))
