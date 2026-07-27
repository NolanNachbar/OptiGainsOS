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
K_MAX    = 0.45   # [ENG] cap a single week's influence. Raised from 0.34 (F1) so a
                  #       string of strong weeks can separate the posterior off the
                  #       prior without a designed test — still <0.5 so no single
                  #       week swings it. Pairs with the distance-above-MAV obs below.
SOR_OK   = 4.0    # [ENG] mean soreness (1-10; check-in 0-3 mapped 1+3v) at/below which a muscle is "recoverable"
SOR_HI   = 7.0    # [ENG] soreness (1-10) at/above which a stall signals over-MRV
OBS_VAR  = 9.0    # [ENG] observation noise (sets^2); designed tests can pass lower
IMMATURE_HEADROOM = 4  # [ENG] F1 keystone: while a muscle is still immature, let the
                       #       allocator MRV ceiling drift up to prior+this toward a
                       #       climbing posterior. Without it the ceiling is pinned at
                       #       round(prior), so funded volume (and thus the censored
                       #       "MRV ≥ tolerated" observation) can never exceed the prior
                       #       and maturity is unreachable on passive data. Bounded so a
                       #       perpetually-"responding" muscle can't ratchet up forever
                       #       before maturity — beyond +headroom needs a designed test.
CUT_OBS_VAR_MULT = 2.0  # [ENG] F9: during a cut, down-weight the (energy-deficit-masked)
                        #       e1RM signal rather than trusting it at face value
STALL_OBS_VAR_MULT = 2.0  # [ENG] F14: a moderate-soreness stall is a real but noisier
                        #       down-signal than the SOR_HI ratchet — down-weight it
MEV_TICK_VAR_DECAY = 0.97  # [ENG] F14: a responding-but-below-mean week is genuine
                        #       tolerance evidence even though it can't move the mean
                        #       (would wrongly drag MRV down) — it still counts toward
                        #       maturity and tightens the CI a touch, so n_obs isn't
                        #       stuck at 0 forever on a budget-bound athlete.
MESOCYCLE_MIN_OBS = 8   # [ENG] C8/E5: a hypertrophy-VOLUME parameter (MRV) may not be
                        #       declared MATURE on fewer than a mesocycle of weekly
                        #       observations, no matter how fast its credible interval
                        #       shrinks. The hypertrophy signal is slow and noisy, so a
                        #       handful of strong weeks (or one low-noise designed-test
                        #       observation) tightening the CI is premature — maturity must
                        #       also clear ~8-12 weeks of accumulated evidence. 8 is the floor.


def update_mrv(row: dict, weekly_sets: float, e1rm_slope, soreness_avg: float,
               prior_mrv: float, phase: str | None = None,
               obs_var: float = OBS_VAR) -> dict:
    """
    Update one muscle's MRV posterior from last week's response.

    row: current athlete_landmarks row (mrv_mean, mrv_var, n_obs, mev, mav, mrv).
    weekly_sets: sets the muscle actually got (use last week's planned target).
    e1rm_slope: per-muscle e1RM slope (None if no strength signal -> uninformative).
                A FALLBACK top-set-quality slope may be passed for slope-less
                muscles (F2) — pass a higher obs_var so it nudges, not lurches.
    soreness_avg: mean soreness 1-10 (check-in 0-3 mapped 1+3v).
    prior_mrv: population prior MRV (maturity is measured against this).
    phase: current diet phase; on "cut" the MRV-DOWN ratchet is suppressed (F9) —
           a flat/negative slope under a deficit is masking, not over-MRV.
    obs_var: observation noise for THIS update (default OBS_VAR; higher for the
             F2 fallback signal).

    Returns the fields to upsert (mrv_mean, mrv_var, n_obs, mature, mrv, mav).
    Leaves the posterior unchanged on an uninformative week.
    """
    mean = float(row.get("mrv_mean", prior_mrv))
    var  = float(row.get("mrv_var", 9.0))
    n    = int(row.get("n_obs", 0))
    mev  = float(row.get("mev", 6))
    mav  = float(row.get("mav", mean))
    on_cut = (phase or "").lower() == "cut"

    obs = None
    obs_var_eff = obs_var
    mev_tick = False   # F14: evidence-only tick — tightens the CI without moving the mean
    if weekly_sets and weekly_sets > 0 and e1rm_slope is not None:
        responding  = e1rm_slope > 0
        recoverable = soreness_avg <= SOR_OK
        if responding and recoverable and weekly_sets + 1 > mean:
            # Censored "MRV is at least this" — only informative ABOVE the mean,
            # otherwise positive response below the posterior drags MRV down. The
            # ceiling below lets weekly_sets (and thus this obs) climb past the prior
            # on a responding muscle, which is what makes maturity reachable (F1).
            obs = weekly_sets + 1
            if on_cut:
                obs_var_eff = obs_var * CUT_OBS_VAR_MULT
        elif (not responding) and soreness_avg >= SOR_HI and not on_cut:
            # E3 reframe: this ratchet does NOT mean "more volume reverses gains" (the
            # inverted-U is refuted). It is a RECOVERY-LIMITED signal — at this volume
            # the recovery COST is too high to clear (stalling + sustained soreness), so
            # the soft MRV boundary for THIS athlete sits a bit lower than the prior.
            # F9: never ratchet MRV DOWN on a cut — you can't separate recovery-limited
            # from deficit masking without a deload (and there is none by design).
            obs = weekly_sets - 1          # recovery cost too high here → soft MRV lower
        elif (not responding) and SOR_OK < soreness_avg < SOR_HI and not on_cut:
            # F14: a stall with MODERATE (not yet extreme) soreness is a real but
            # noisier down-signal than the SOR_HI ratchet above — previously only
            # soreness >= 7 moved anything down, so a budget-bound athlete sitting
            # well under MRV every week (never sore enough to trip that threshold)
            # left the posterior frozen indefinitely. Down-weighted and, like the
            # ratchet above, still only a downward pull — fatigue-safe.
            obs = weekly_sets
            obs_var_eff = obs_var * STALL_OBS_VAR_MULT
        elif responding and recoverable:
            # F14: responding-and-recoverable but weekly_sets+1 <= mean — the classic
            # dead zone when the recovery budget funds well under the prior MRV. This
            # genuinely IS evidence the athlete tolerates this volume, but feeding it
            # as a mean-moving observation would wrongly drag MRV down toward however
            # little was funded. Instead just tick the evidence counter and tighten
            # the CI slightly, so maturity (which needs n_obs, not just mean movement)
            # becomes reachable instead of frozen at n_obs=0 forever.
            mev_tick = True

    if obs is not None:
        K = min(var / (var + obs_var_eff), K_MAX)
        mean = mean + K * (obs - mean)
        var  = var * (1 - K)
        n   += 1
    elif mev_tick:
        var *= MEV_TICK_VAR_DECAY
        n   += 1

    # E5/C8: the CI must separate from the prior AND clear a mesocycle of observations.
    mature = abs(mean - prior_mrv) > 1.96 * math.sqrt(max(var, 1e-9)) and n >= MESOCYCLE_MIN_OBS
    # F1 keystone: while immature, let the allocator MRV ceiling drift toward a
    # climbing posterior (bounded by IMMATURE_HEADROOM) instead of pinning it at the
    # prior — otherwise funded volume, the censored observation, and MAV are all
    # capped at the prior and the posterior can never separate on passive data.
    mrv_ceiling = round(mean) if mature else round(min(mean, prior_mrv + IMMATURE_HEADROOM))
    mrv = max(mrv_ceiling, round(mev) + 2)
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
    # E5/C8: even a low-noise designed-test observation cannot mature a volume parameter
    # before a mesocycle of evidence has accumulated.
    mature = abs(mean - prior_mrv) > 1.96 * math.sqrt(max(var, 1e-9)) and n >= MESOCYCLE_MIN_OBS
    mrv_ceiling = round(mean) if mature else round(min(mean, prior_mrv + IMMATURE_HEADROOM))
    mrv = max(mrv_ceiling, round(mev) + 2)
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
PAIN_PENALTY    = -1.5   # [ENG] a CORROBORATED pain note is a strong "stop programming this"
PAIN_SOFT_PENALTY = -0.5 # [ENG] F13: a single low-severity mention de-prioritises, not vetoes
SLOPE_SCALE     = 2.5    # [ENG] lbs/session that saturates the strength-response term


def update_exercise_value(meta: dict, exercise: str, reward: float) -> dict:
    """
    Kalman-gain Normal update of one exercise's value posterior.
    meta: {canon_name: {"mean","var","n"}}.  Mutates a copy and returns it.
    """
    try:
        from engine.log_ingest import canon
        exercise = canon(exercise)
    except ImportError:
        pass
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
                    hard_mentions: int = 0, pain_severity: int = 0,
                    pain_mentions: int = 0) -> float:
    """Blend the per-exercise signals for one week into a single reward scalar.

    Pain handling (CONVERGENCE_AUDIT F13): a single low-severity mention should
    DE-PRIORITISE a movement, not wipe it. One ambiguous "shoulder cranky" note gets
    attributed to every pressing exercise sharing the cautioned muscle, so a hard
    veto on any single mention reshapes the whole next program off one datum. The
    hard veto now requires corroboration — a sharp/strain flag (severity ≥ 2) or a
    repeat (≥ 2 mentions); otherwise a softer penalty applies."""
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
        corroborated = int(pain_severity or 0) >= 2 or int(pain_mentions or 0) >= 2
        if corroborated:
            # Hard veto: no amount of progress masks a flagged injury signal.
            return round(min(r + PAIN_PENALTY, PAIN_PENALTY), 4)
        # First low-severity mention: back off, don't ban.
        r += PAIN_SOFT_PENALTY
    return round(r, 4)


def exercise_value(meta: dict, exercise: str) -> float:
    """Learned value for an exercise (0 if never observed)."""
    try:
        from engine.log_ingest import canon
        exercise = canon(exercise)
    except ImportError:
        pass
    return float((meta or {}).get(exercise, {}).get("mean", 0.0))
