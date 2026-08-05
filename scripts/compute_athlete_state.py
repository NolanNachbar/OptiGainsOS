#!/usr/bin/env python3
"""
compute_athlete_state.py — Daily athlete state computation for OptiGains.

Runs at 4am MT (11am UTC) after garmin-sync (3am MT / 10am UTC).
Writes one deterministic row to `athlete_state` in Supabase.
Also runs all adaptive engine modules and writes to `engine_params`.
No LLM calls — pure math. The daily brief reads both tables.

Requirements:
    pip install python-dotenv numpy

Env vars (loaded from ../.env or environment):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    USER_ID
"""

import os
import sys
import json
import math
import datetime
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional

# ── Engine modules ────────────────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _SCRIPT_DIR)

# Single source of truth for logged-sets → e1RM (canonical names, RIR-aware
# Epley, ≤12-rep cap, competition-variant goal rollup). Imported outside the
# numpy guard because compute_strength always runs and this needs no numpy.
from engine.log_ingest import (normalize_workout_logs, goal_histories, GOAL_TARGETS,
                               proximity_fatigue_factor, EFFORT_COST_PRIOR)
from engine.tdee import (estimate_tdee as _estimate_tdee, ewma_trend as _ewma_trend,
                         learned_intake_bias, energy_density_kcal_per_lb,
                         KG_PER_LB, DEFAULT_BODYFAT_FRAC)
from engine.sleep_debt import sleep_debt_hours, is_poor_night
from engine.strength_progression import process_strength_progression
# Single source of truth for exercise/region → muscle mapping (shared with the
# weekly orchestrator so per-muscle slopes and soreness never disagree).
from engine.muscle_map import EXERCISE_MUSCLE_MAP, get_muscles, get_muscle_credit, get_joint_action
from engine.athlete_profile import CLARK_KENT_JOINT_ACTION_TARGET
from engine.log_ingest import GOAL_LIFTS

# Flat set of every logged-name variant of the big-three competition lifts (Top
# Set / Back-off, CSV-era and app-era names) — the one goal-lift identity table
# the codebase already uses elsewhere (log_ingest.goal_histories), reused here
# so hypertrophy volume and goal-lift tracking can never define "goal lift"
# two different ways.
_GOAL_LIFT_NAMES: set = {name for names in GOAL_LIFTS.values() for name in names}
# Canonical per-muscle volume landmarks (single source; no numpy needed).
from engine.hypertrophy_volume import LANDMARK_PRIORS as _LANDMARK_PRIORS

try:
    import numpy as np
    from engine.banister_kalman     import BanisterKalman
    from engine.rls_learner         import RLSParameterLearner
    from engine.cellular_model      import CellularInterferenceModel
    from engine.vdot_engine         import VDOTEngine, vdot_from_effort
    from engine.nutrition_modulator import NutritionModulator
    from engine.guardrail           import SystemGuardrail
    _ENGINE_AVAILABLE = True
except ImportError as _e:
    print(f"  WARN: Engine modules not available ({_e}). "
          "Run: pip install numpy")
    _ENGINE_AVAILABLE = False

# ── Load .env ─────────────────────────────────────────────────────────────────

try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    load_dotenv(_env_path)
except ImportError:
    pass  # python-dotenv not installed; env vars must be set externally

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
USER_ID      = os.environ.get("USER_ID", "")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    print("ERROR: Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

TODAY = datetime.date.today().isoformat()


def _resolve_user_id() -> str:
    """Look up the single user's ID from user_profiles when USER_ID env var is not set."""
    url = f"{SUPABASE_URL}/rest/v1/user_profiles?select=created_by&limit=1"
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read())
            if rows:
                return rows[0]["created_by"]
    except Exception as e:
        print(f"ERROR: Could not resolve USER_ID from user_profiles: {e}")
    print("ERROR: USER_ID not set and no user_profiles row found.")
    sys.exit(1)


def _ensure_user_id():
    # Resolving USER_ID makes a live network call, which must never fire just
    # from importing this module — validate_convergence_fixes.py (and CI's
    # placeholder-credential test run) imports it for its pure functions, not
    # to run the estimator.
    global USER_ID
    if not USER_ID:
        USER_ID = _resolve_user_id()
        print(f"  Resolved USER_ID from DB: {USER_ID}")

# ── Supabase REST helpers ─────────────────────────────────────────────────────

def _headers(extra: dict = None) -> dict:
    h = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }
    if extra:
        h.update(extra)
    return h


def sb_get(table: str, params: dict) -> list:
    """Query a Supabase table, always filtering by created_by=USER_ID."""
    query = {"created_by": f"eq.{USER_ID}", **params}
    qs = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in query.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  WARN: sb_get({table}) HTTP {e.code}: {e.read().decode()[:200]}")
        return []
    except Exception as e:
        print(f"  WARN: sb_get({table}) failed: {e}")
        return []


def sb_upsert(table: str, row: dict) -> bool:
    """Upsert a row; merges on UNIQUE(created_by, date)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=created_by,date"
    data = json.dumps(row).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ERROR: sb_upsert({table}) {e.code}: {body[:400]}")
        return False
    except Exception as e:
        print(f"  ERROR: sb_upsert({table}): {e}")
        return False


def days_before(n: int) -> str:
    return (datetime.date.today() - datetime.timedelta(days=n)).isoformat()


# ── Math helpers ──────────────────────────────────────────────────────────────

def linear_regression(x_vals: list, y_vals: list) -> tuple:
    """Returns (slope, intercept). slope is per unit of x."""
    n = len(x_vals)
    if n < 2:
        return 0.0, (y_vals[0] if y_vals else 0.0)
    x_mean = sum(x_vals) / n
    y_mean = sum(y_vals) / n
    ss_xy = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
    ss_xx = sum((x - x_mean) ** 2 for x in x_vals)
    if ss_xx < 1e-9:
        return 0.0, y_mean
    slope = ss_xy / ss_xx
    return slope, y_mean - slope * x_mean


# ── Exercise / muscle mappings ────────────────────────────────────────────────
# EXERCISE_MUSCLE_MAP and get_muscles() now live in engine.muscle_map (imported
# above) so the daily compute and the weekly orchestrator share one definition.

# Volume landmarks (sets/week) for the daily hypertrophy DISPLAY (analysis vocab).
# DERIVED from the single canonical source (hypertrophy_volume.LANDMARK_PRIORS,
# landmark vocab) so the display and the volume engine can never drift again.
# Each analysis muscle maps to its representative landmark; lower_back has no
# landmark so it keeps an explicit analysis-only default.
_ANALYSIS_TO_LANDMARK_DISPLAY = {
    "quads": "quads", "hamstrings": "hamstrings", "glutes": "glutes",
    "chest": "chest", "back": "upper_back", "shoulders": "shoulders",
    "rear_delts": "rear_delts", "biceps": "biceps", "triceps": "triceps",
    "abs": "core", "traps": "traps", "calves": "calves",
    "side_delts": "side_delts", "neck": "neck", "upper_chest": "upper_chest",
}
MUSCLE_TARGETS: dict[str, dict] = {
    a: dict(_LANDMARK_PRIORS[lm]) for a, lm in _ANALYSIS_TO_LANDMARK_DISPLAY.items()
}
MUSCLE_TARGETS["lower_back"] = {"mev": 4, "mav": 8, "mrv": 12}  # analysis-only

# Goal lifts (the three competition variants) and their targets come from
# engine.log_ingest — GOAL_TARGETS — so this file, the orchestrator, and the
# audit can never drift on definitions or numbers.

# Exercises that heavily tax the CNS (for CNS fatigue calculation)
CNS_HEAVY: list[str] = [
    "squat", "deadlift", "barbell row", "bent over row",
    "overhead press", "ohp", "pendlay", "military press",
]

# ── Strength computation ──────────────────────────────────────────────────────

# #14: when a goal lift stalls for weeks despite decent recovery, the engine emits
# SWAP_EXERCISE — break the plateau with a close variation, then re-test the comp
# lift. These are the concrete swaps surfaced to the athlete.
SWAP_SUGGESTIONS = {
    "Bench (paused comp)":          "Close-Grip or Larsen Press for ~3 weeks to break the sticking point, then re-test the paused bench.",
    "Squat (comp)":                 "Pause or Tempo Squat for ~3 weeks to rebuild positional strength, then re-test the comp squat.",
    "Deadlift (conventional comp)": "Deficit or Paused Deadlift for ~3 weeks to attack the off-the-floor weakness, then re-test the comp pull.",
}


def compute_strength(workout_logs: list) -> dict:
    """
    e1RM tracking for the three COMPETITION goal lifts, computed through the
    shared engine.log_ingest pipeline (canonical names, RIR-aware Epley, ≤12-rep
    cap, competition-variant rollup) so these numbers match the orchestrator's
    StrengthProgressionRegistry and the offline audit exactly. The old keyword
    tracker is gone — it used no RIR, stale targets (squat 405 / DL 495), and a
    "bench press" keyword that matched the invalid touch-and-go single.
    """
    rows      = normalize_workout_logs(workout_logs)
    goal_hist = goal_histories(rows)  # {goal: [(date, e1rm), ...]} chronological

    result: dict[str, dict] = {}

    for lift_name, sorted_sessions in goal_hist.items():
        if not sorted_sessions:
            continue
        n = len(sorted_sessions)

        # Current e1RM: average of last 3 sessions (smoothed, not just latest)
        last_3 = [e for _, e in sorted_sessions[-3:]]
        current_e1rm = round(sum(last_3) / len(last_3))

        # Progression rate: linear regression on last 6 sessions
        recent = sorted_sessions[-6:]
        if len(recent) >= 2:
            base = datetime.date.fromisoformat(recent[0][0])
            x_vals = [(datetime.date.fromisoformat(d) - base).days for d, _ in recent]
            y_vals = [e for _, e in recent]
            slope_per_day, _ = linear_regression(x_vals, y_vals)
            rate_per_week = round(slope_per_day * 7, 1)
        else:
            rate_per_week = 0.0

        # Stall risk
        if n >= 3:
            last3_vals = [e for _, e in sorted_sessions[-3:]]
            if last3_vals[-1] < last3_vals[0]:
                stall_risk = 1.0         # regressing
            elif last3_vals[-1] == last3_vals[0]:
                stall_risk = 0.75        # flat
            elif rate_per_week < 0.5:
                stall_risk = 0.4         # very slow progress
            else:
                stall_risk = round(max(0.0, 0.3 - rate_per_week * 0.04), 2)
        else:
            stall_risk = 0.0

        # ETA to target
        target = GOAL_TARGETS.get(lift_name)
        eta_days = None
        if target:
            if current_e1rm >= target:
                eta_days = 0
            elif rate_per_week > 0:
                eta_days = round((target - current_e1rm) / rate_per_week * 7)

        result[lift_name] = {
            "current_e1rm":                current_e1rm,
            "target":                       target,
            "progression_rate_lbs_per_week": rate_per_week,
            "stall_risk":                   round(stall_risk, 2),
            "eta_days":                     eta_days,
            "sessions":                     n,
        }

    return result


# ── Hypertrophy computation ───────────────────────────────────────────────────

def compute_hypertrophy(workout_logs: list) -> dict:
    # Current week starts on Monday
    today = datetime.date.today()
    week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()

    muscle_sets: dict[str, float] = {}

    for log in workout_logs:
        if log.get("log_date", "") < week_start:
            continue
        for ex in log.get("exercises", []) or []:
            # Goal-lift sets (Top Set/Back-off on the big three) are submaximal
            # strength work by design — RIR 1-2, never taken to failure — not a
            # hypertrophy stimulus set. Your logs carry no real per-set RIR (see
            # log_ingest.FAILURE_RIR), so a literal RIR-threshold gate would be
            # a no-op; goal-lift identity is the one signal actually present in
            # the data that distinguishes "trained for strength" from "trained
            # to failure for size." Nolan's call, 2026-07-27. [COACH]
            if ex.get("name", "") in _GOAL_LIFT_NAMES:
                continue
            credit = get_muscle_credit(ex.get("name", ""))
            sets = ex.get("sets", []) or []
            # Count sets that have either weight or reps data
            hard_sets = len([s for s in sets if s.get("weight") or s.get("reps")])
            if not hard_sets:
                continue
            for muscle, weight in credit.items():
                if muscle in MUSCLE_TARGETS:
                    muscle_sets[muscle] = muscle_sets.get(muscle, 0) + hard_sets * weight

    # Always include the primary tracked muscles even if 0 sets
    ALWAYS_SHOW = {"quads", "hamstrings", "chest", "back", "shoulders", "rear_delts", "biceps", "triceps"}
    all_muscles = set(muscle_sets.keys()) | ALWAYS_SHOW

    result: dict[str, dict] = {}
    for muscle in sorted(all_muscles):
        if muscle not in MUSCLE_TARGETS:
            continue
        t = MUSCLE_TARGETS[muscle]
        sets = round(muscle_sets.get(muscle, 0), 1)
        fatigue_score = round(min(sets / max(t["mrv"], 1), 1.0), 2)

        result[muscle] = {
            "weekly_sets":  sets,
            "mev":          t["mev"],
            "mav":          t["mav"],
            "mrv":          t["mrv"],
            "fatigue_score": fatigue_score,
        }

    return result


def compute_joint_action_volume(workout_logs: list) -> dict:
    """Weekly hard-set count per JOINT ACTION (Clark Kent's counting unit — see
    athlete_profile.CLARK_KENT_JOINT_ACTION_TARGET), independent of muscle-level
    credit. This is the volume signal for gap #4 (OHP-vs-bench redundancy): a
    joint action reads as "already covered" only when ITS OWN pattern hit
    target, never because a different pattern happened to hit the same muscle
    as a synergist — a bench-heavy week doesn't suppress OHP just because both
    train chest/triceps, since horizontal_push and vertical_push are counted
    separately. Full credit (no SECONDARY_MUSCLE_CREDIT weighting) — a set
    either performed this joint action or it didn't."""
    today = datetime.date.today()
    week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()

    pattern_sets: dict[str, int] = {}
    for log in workout_logs:
        if log.get("log_date", "") < week_start:
            continue
        for ex in log.get("exercises", []) or []:
            pattern = get_joint_action(ex.get("name", ""))
            if not pattern:
                continue
            sets = ex.get("sets", []) or []
            hard_sets = len([s for s in sets if s.get("weight") or s.get("reps")])
            if not hard_sets:
                continue
            pattern_sets[pattern] = pattern_sets.get(pattern, 0) + hard_sets

    lo, hi = CLARK_KENT_JOINT_ACTION_TARGET
    result: dict[str, dict] = {}
    for pattern, sets in sorted(pattern_sets.items()):
        result[pattern] = {
            "weekly_sets": sets,
            "target_low": lo,
            "target_high": hi,
            "below_target": sets < lo,
        }
    return result


# ── Fatigue / load computation ────────────────────────────────────────────────

def compute_fatigue(workout_logs: list, recovery_rows: list) -> dict:
    atl: Optional[float] = None
    ctl: Optional[float] = None

    # Prefer Garmin's own ATL/CTL (already computed by their EPOC model)
    for r in recovery_rows:
        if r.get("training_load_acute") and r.get("training_load_chronic"):
            atl = round(float(r["training_load_acute"]), 1)
            ctl = round(float(r["training_load_chronic"]), 1)
            break

    if atl is None:
        # Fallback: compute exponential moving averages from workout volume
        today = datetime.date.today()
        tss_by_date: dict[str, float] = {}
        for log in workout_logs:
            d = log.get("log_date", "")
            volume = sum(
                float(s.get("weight") or 0) * int(s.get("reps") or 0)
                for ex in (log.get("exercises") or [])
                for s in (ex.get("sets") or [])
            )
            tss = min(volume / 100.0, 150.0)  # normalize; cap at 150 per session
            tss_by_date[d] = tss_by_date.get(d, 0) + tss

        k_atl = 1 - math.exp(-1 / 7)   # 7-day time constant
        k_ctl = 1 - math.exp(-1 / 42)  # 42-day time constant
        atl_v = ctl_v = 0.0
        for i in range(42, -1, -1):
            d = (today - datetime.timedelta(days=i)).isoformat()
            tss = tss_by_date.get(d, 0.0)
            atl_v += k_atl * (tss - atl_v)
            ctl_v += k_ctl * (tss - ctl_v)

        atl = round(atl_v, 1)
        ctl = round(ctl_v, 1)

    tsb = round((ctl or 0) - (atl or 0), 1)

    # Interpret TSB
    if tsb > 10:
        interpretation = "fresh_peak"
    elif tsb > 0:
        interpretation = "recovering"
    elif tsb > -10:
        interpretation = "optimal_load"
    elif tsb > -20:
        interpretation = "accumulated_fatigue"
    else:
        interpretation = "overreached"

    # CNS fatigue: intensity-weighted compound volume over last 5 days
    cutoff = days_before(5)
    cns_volume = 0.0
    for log in workout_logs:
        if log.get("log_date", "") < cutoff:
            continue
        for ex in log.get("exercises", []) or []:
            name_lower = (ex.get("name") or "").lower()
            if not any(c in name_lower for c in CNS_HEAVY):
                continue
            for s in ex.get("sets") or []:
                w = float(s.get("weight") or 0)
                r = int(s.get("reps") or 0)
                if w > 0 and r > 0:
                    intensity_factor = min(w / 315.0, 1.0)  # normalize to ~315lb compound
                    cns_volume += w * r * intensity_factor

    # 0=fresh, 1.0=heavily taxed (>40,000 intensity-weighted volume in 5 days)
    cns_fatigue = round(min(cns_volume / 40000.0, 1.0), 2)

    # Global fatigue: blend of TSB signal and CNS
    tsb_fatigue = max(0.0, min(1.0, (-tsb + 10) / 30.0))
    global_fatigue = round(tsb_fatigue * 0.6 + cns_fatigue * 0.4, 2)

    # True ACWR: acute (7d load sum) / chronic (28d weekly average), from daily
    # training load — NOT the prior degenerate mean-of-EMA / mean-of-EMA form,
    # which sat near 1.0 by construction and could never flag an acute spike.
    today_acwr = datetime.date.today()
    daily_tss: dict[str, float] = {}
    for log in workout_logs:
        d = log.get("log_date", "")
        if not d:
            continue
        volume = sum(
            float(s.get("weight") or 0) * int(s.get("reps") or 0)
            for ex in (log.get("exercises") or [])
            for s in (ex.get("sets") or [])
        )
        daily_tss[d] = daily_tss.get(d, 0.0) + min(volume / 100.0, 150.0)
    acute_7d    = sum(daily_tss.get((today_acwr - datetime.timedelta(days=i)).isoformat(), 0.0) for i in range(7))
    chronic_28d = sum(daily_tss.get((today_acwr - datetime.timedelta(days=i)).isoformat(), 0.0) for i in range(28))
    chronic_weekly = chronic_28d / 4.0
    acwr = round(acute_7d / chronic_weekly, 2) if chronic_weekly > 1e-6 else None

    return {
        "atl":             atl,
        "ctl":             ctl,
        "tsb":             tsb,
        "cns_fatigue":     cns_fatigue,
        "global_fatigue":  global_fatigue,
        "interpretation":  interpretation,
        "acwr":            acwr,
        "acute_load_7d":   round(acute_7d, 1),
        "chronic_load_wk": round(chronic_weekly, 1),
    }


# ── Adaptive TDEE ─────────────────────────────────────────────────────────────

def estimate_tdee(bodyweight_lb: float, avg_kcal_7d, weight_trend_lb_wk,
                  fallback: float = 3200.0, bodyfat_frac=None,
                  intake_bias: float = 1.0, weeks_in_phase=None,
                  log_coverage: float = 1.0) -> float:
    """
    Adaptive maintenance estimate from intake + trend bodyweight (E10 / MacroFactor +
    Hall-NIDDK style). Delegates to engine.tdee, which replaces the old single fixed
    energy-density constant and the 25% under-logging GATE with a composition-aware
    (Forbes) energy density, a learned-intake-bias trend anchor, an early-transient
    discount, and a trust BLEND + sanity CLAMP (the signal is anchored, never discarded).
    `weight_trend_lb_wk` should be the EWMA-trend slope (de-noised) from compute_nutrition.
    `log_coverage` is the logged fraction of the intake window (see engine.tdee).
    """
    return _estimate_tdee(bodyweight_lb, avg_kcal_7d, weight_trend_lb_wk, fallback,
                          bodyfat_frac=bodyfat_frac, intake_bias=intake_bias,
                          weeks_in_phase=weeks_in_phase, log_coverage=log_coverage)


def compute_physique_bf_frac(rows, max_stale_days: int = 45, alpha: float = 0.3):
    """Session-EWMA photo body-fat as a FRACTION, for the Forbes density (E10).

    Per-shot photo BF is noisy and low-accuracy in absolute terms; the TREND is
    the signal — which is exactly what the Forbes fat-mass term consumes. So:
    average all shots of one session day (taken_at), then EWMA across sessions
    (alpha per-session; [ENG] tunable, no literature anchor). Returns None when
    there are no estimates or the newest session is older than max_stale_days
    ([ENG] tunable), so estimate_tdee falls back to its DEFAULT_BODYFAT_FRAC
    prior instead of trusting a stale photo.
    """
    by_day = {}
    for r in rows or []:
        d, bf = r.get("taken_at"), r.get("bodyfat_estimate")
        if d and bf is not None:
            by_day.setdefault(d, []).append(float(bf))
    if not by_day:
        return None
    days = sorted(by_day)
    newest = datetime.date.fromisoformat(days[-1][:10])
    if (datetime.date.today() - newest).days > max_stale_days:
        return None
    ewma = None
    for d in days:
        session_bf = sum(by_day[d]) / len(by_day[d])
        ewma = session_bf if ewma is None else ewma + alpha * (session_bf - ewma)
    return round(ewma / 100.0, 4)


# ── Recovery computation ──────────────────────────────────────────────────────

def compute_recovery(recovery_rows: list, checkin: Optional[dict]) -> dict:
    if not recovery_rows:
        return {
            "data_available": False,
            "score":          None,
            "push_readiness": "unknown",
        }

    r = recovery_rows[0]
    hrv          = float(r.get("hrv") or 0) or None
    sleep_score  = float(r.get("sleep_score") or 0) or None
    body_battery = float(r.get("body_battery") or 0) or None
    resting_hr   = float(r.get("resting_hr") or 0) or None
    energy       = float((checkin or {}).get("energy") or 0) or None

    # Normalized inputs (0-1 scale with sensible defaults when missing)
    # HRV: 30ms baseline → 0, 80ms → 1.0 (will self-calibrate once we have baselines)
    hrv_norm     = round(min(max((hrv - 30) / 50.0, 0.0), 1.0), 2) if hrv else 0.5
    sleep_norm   = round(sleep_score / 100.0, 2)                     if sleep_score else 0.5
    battery_norm = round(body_battery / 100.0, 2)                    if body_battery else 0.5
    energy_norm  = round(energy / 10.0, 2)                           if energy else 0.5

    # Weighted composite score
    score = round(hrv_norm * 35 + sleep_norm * 30 + battery_norm * 25 + energy_norm * 10)
    score = max(0, min(100, score))

    if score >= 75:
        readiness = "high"
    elif score >= 55:
        readiness = "moderate"
    elif score >= 35:
        readiness = "low"
    else:
        readiness = "rest"

    # HRV trend over last 7 days
    hrv_points = sorted(
        [(row.get("date", ""), float(row.get("hrv") or 0))
         for row in recovery_rows if row.get("hrv")],
        key=lambda x: x[0]
    )
    hrv_trend = "stable"
    if len(hrv_points) >= 3:
        recent = [h for _, h in hrv_points[-3:]]
        if recent[-1] < recent[0] - 5:
            hrv_trend = "declining"
        elif recent[-1] > recent[0] + 3:
            hrv_trend = "improving"

    # Check the 3-consecutive-drops rule (used by brief to gate cardio cuts)
    consecutive_drops = 0
    for i in range(len(hrv_points) - 1, 0, -1):
        if hrv_points[i][1] < hrv_points[i - 1][1]:
            consecutive_drops += 1
        else:
            break

    # E11: true cumulative sleep debt from the actual logged DURATION (trailing 7 nights),
    # a more principled systemic-fatigue input than the opaque 0-100 score.
    sleep_debt_7d = sleep_debt_hours(
        [row.get("sleep_duration_min") for row in recovery_rows[:7]])

    return {
        "data_available":       True,
        "score":                score,
        "push_readiness":       readiness,
        "hrv":                  hrv,
        "sleep_score":          sleep_score,
        "sleep_debt_7d_hours":  sleep_debt_7d,
        "body_battery":         body_battery,
        "resting_hr":           resting_hr,
        "energy":               energy,
        "hrv_trend":            hrv_trend,
        "hrv_consecutive_drops": consecutive_drops,
    }


# ── Endurance computation ─────────────────────────────────────────────────────

def compute_endurance(recovery_rows: list, pst_tests: list) -> dict:
    aug31 = datetime.date(2026, 8, 31)
    days_to_aug31 = max(0, (aug31 - datetime.date.today()).days)

    # VO2max from most recent Garmin row that has it
    vo2max          = None
    running_atl     = None
    aerobic_proxy   = None

    for r in recovery_rows:
        if r.get("vo2max_run") and vo2max is None:
            vo2max = float(r["vo2max_run"])
        if r.get("training_load_acute") and running_atl is None:
            running_atl = round(float(r["training_load_acute"]), 1)
        if vo2max is not None and running_atl is not None:
            break

    if vo2max:
        # 0% = VO2max 30 (sedentary), 100% = VO2max 60 (very fit)
        aerobic_proxy = round(max(0.0, min((vo2max - 30) / 30.0, 1.0)), 2)

    result: dict = {
        "days_to_aug31":        days_to_aug31,
        "vo2max":               vo2max,
        "aerobic_fitness_proxy": aerobic_proxy,
        "running_fatigue_atl":  running_atl,
    }

    # PST baselines from most recent test
    if pst_tests:
        t = pst_tests[0]
        result["pst_latest"] = {
            "date":         t.get("test_date"),
            "swim_seconds": t.get("swim_seconds"),
            "pushups":      t.get("pushups"),
            "situps":       t.get("situps"),
            "pullups":      t.get("pullups"),
            "run_seconds":  t.get("run_seconds"),
        }

        # PST targets (BUD/S competitive minimums)
        PST_TARGETS = {
            "swim_seconds": {"target": 540, "competitive": 480, "lower_is_better": True},
            "run_seconds":  {"target": 570, "competitive": 540, "lower_is_better": True},
            "pushups":      {"target": 100, "lower_is_better": False},
            "situps":       {"target": 100, "lower_is_better": False},
            "pullups":      {"target": 20,  "lower_is_better": False},
        }

        readiness_pcts = []
        for field, cfg in PST_TARGETS.items():
            val = t.get(field)
            if val is None:
                continue
            if cfg["lower_is_better"]:
                comp = cfg.get("competitive", cfg["target"])
                pct = min(comp / val * 100, 100) if val > 0 else 0
            else:
                pct = min(val / cfg["target"] * 100, 100)
            readiness_pcts.append(pct)

        if readiness_pcts:
            result["pst_readiness_pct"] = round(sum(readiness_pcts) / len(readiness_pcts), 1)

    return result


# ── Nutrition computation ─────────────────────────────────────────────────────

def compute_nutrition(food_entries: list, weight_entries: list, profile: dict) -> dict:
    calorie_target = float(profile.get("daily_calorie_goal") or 1800)
    protein_target = float(profile.get("daily_protein_goal") or 200)

    # Daily totals
    by_date: dict[str, dict] = {}
    for e in food_entries:
        d = e.get("date", "")
        if not d:
            continue
        if d not in by_date:
            by_date[d] = {"cal": 0.0, "protein": 0.0}
        by_date[d]["cal"]     += float(e.get("calories") or 0)
        by_date[d]["protein"] += float(e.get("protein_grams") or 0)

    # Calendar-anchored window over the 7 COMPLETE days before today. Two bugs died here:
    #
    #  1. `sorted(by_date)[:7]` took the 7 most recent dates THAT HAD ENTRIES, so a week
    #     with three logged days silently reached back three calendar weeks for the rest.
    #     Unlogged days vanished instead of being counted as unknown, which made a spotty
    #     log look like a complete one and hid the gap from every downstream consumer.
    #  2. It included TODAY, a partial day. Running the engine at 08:00 averaged in a
    #     one-meal day and dragged mean intake down every single morning.
    #
    # An unlogged day is a day with NO intake information — it is not a 0-kcal day (that
    # would understate intake even worse), and it is not a day that resembled the days he
    # did log. So keep the mean over logged days, but publish `log_coverage_7d` next to it
    # so estimate_tdee can discount an incomplete window instead of trusting it blindly.
    anchor  = datetime.date.fromisoformat(TODAY)
    window  = [(anchor - datetime.timedelta(days=i)).isoformat() for i in range(1, 8)]
    logged  = [d for d in window if d in by_date]
    log_coverage = round(len(logged) / len(window), 3)

    avg_cal     = round(sum(by_date[d]["cal"]     for d in logged) / len(logged)) if logged else 0
    avg_protein = round(sum(by_date[d]["protein"] for d in logged) / len(logged)) if logged else 0

    calorie_adherence = round(min(avg_cal / calorie_target, 1.0), 2) if calorie_target else None

    # Weight trend (linear regression on up to 14 entries). Exclude null/zero
    # weights up front — mapping a bad row to y=0 swings the slope to hundreds
    # of lbs/week, which poisons on_track and the phase recommendation.
    weight_trend: Optional[float] = None
    valid_w = [r for r in weight_entries
               if (r.get("weight") or 0) > 0 and r.get("recorded_date")]
    if len(valid_w) >= 3:
        sorted_w = sorted(valid_w, key=lambda r: r.get("recorded_date", ""))
        recent = sorted_w[-28:]  # ~4 weeks for a stable EWMA trend
        ys = [float(r["weight"]) for r in recent]
        # E10: de-noise scale weight with an EWMA TREND WEIGHT (alpha~0.10/day, ~7-10 day
        # half-life; the public Hacker's-Diet analog of MacroFactor's recency-weighted
        # average), then take the OLS slope OF THE SMOOTHED SERIES against the actual day
        # offsets. Regressing the smoothed series (rather than endpoint-differencing it)
        # keeps the magnitude unbiased — endpoint differencing compresses a sustained trend
        # by ~30% and would silently make the on_track thresholds stricter.
        trend_series = _ewma_trend(ys, alpha=0.10)
        base = datetime.date.fromisoformat(recent[0]["recorded_date"])
        x_days = [(datetime.date.fromisoformat(r["recorded_date"]) - base).days for r in recent]
        slope, _ = linear_regression(x_days, trend_series)
        weight_trend = round(slope * 7, 2)  # lbs/week

    # Diet phase drives the nutrition math. Prefer the dedicated diet_phase field
    # (set by accepting the engine's cut/maintain/bulk recommendation); fall back
    # to substring-matching training_phase for backward compat. Kept distinct from
    # training_phase so a cut doesn't wipe the tactical focus (e.g. buds_prep).
    diet_phase = str(profile.get("diet_phase") or "").lower()
    training_phase = str(profile.get("training_phase") or "maintenance").lower()
    if diet_phase in ("cut", "bulk"):
        phase = diet_phase
    elif diet_phase == "maintain":
        phase = "maintenance"
    elif "cut" in training_phase:
        phase = "cut"
    elif "bulk" in training_phase or "gain" in training_phase:
        phase = "bulk"
    else:
        phase = "maintenance"

    on_track: Optional[bool] = None
    if phase == "cut" and weight_trend is not None:
        on_track = weight_trend < -0.5
    elif phase == "bulk" and weight_trend is not None:
        on_track = weight_trend > 0.2

    return {
        "phase":                   phase,
        "avg_calories_7d":         avg_cal,
        "avg_protein_7d":          avg_protein,
        "calorie_target":          round(calorie_target),
        "protein_target":          round(protein_target),
        "calorie_adherence":       calorie_adherence,
        "log_coverage_7d":         log_coverage,
        "days_logged_7d":          len(logged),
        "weight_trend_lbs_per_week": weight_trend,
        "on_track":                on_track,
    }


# ── Engine helpers ────────────────────────────────────────────────────────────

def compute_training_load_tss(workout_logs: list, recovery_rows: list,
                              effort_coeff: float = EFFORT_COST_PRIOR) -> float:
    """
    Compute today's training stress score (TSS) for the Kalman filter u_t input.

    Priority: use Garmin's EPOC/training-load-acute delta if available (a measured
    physiological load that already reflects effort).
    Fallback: compute from workout volume normalized to 0–150 TSS scale, then scale
    each session by its proximity-to-failure fatigue cost (E2) so a 0-RIR session
    accrues more Banister fatigue than the same volume left 3 in reserve. Failure is
    preserved; its extra cost just becomes visible to the allocator. `effort_coeff`
    is a learnable per-person prior threaded from engine params.
    """
    # The Kalman steps ONCE PER CALENDAR DAY, and the daily cron fires at 10:00 UTC —
    # 4am Mountain, BEFORE the athlete has trained. So the load for today's step is the
    # load he actually incurred YESTERDAY, the last completed training day.
    #
    # This used to read `log_date == TODAY`, which at 4am matches nothing: u_t was 0.0
    # every single day. The Garmin branch below never rescued it either (there are zero
    # recovery_metrics rows carrying training_load_acute), so the filter was driven with
    # ZERO training load for its entire life — fitness and fatigue never accumulated,
    # fatigue never crossed FATIGUE_THRESHOLD, and the MPC therefore saw a permanently
    # fresh athlete and kept selecting the highest-load action. Meanwhile
    # compute_observation_y already looked back PERF_OBS_MAX_AGE_DAYS=1, so the filter
    # was observing yesterday's performance while being told nothing had caused it.
    # Reference the same day both places.
    load_day = (datetime.date.fromisoformat(TODAY) - datetime.timedelta(days=1)).isoformat()

    # Garmin's measured acute load for that day, if we have it (already reflects effort).
    for r in recovery_rows:
        if r.get("date", "") == load_day and r.get("training_load_acute"):
            return min(float(r["training_load_acute"]), 150.0)

    # Fallback: sum volume from that day's workout logs. Summing (not taking the first)
    # so a genuine two-a-day contributes both sessions.
    day_tss = 0.0
    for log in workout_logs:
        if log.get("log_date", "") != load_day:
            continue
        sets = [s for ex in (log.get("exercises") or [])
                for s in (ex.get("sets") or [])]
        session_vol = sum(
            float(s.get("weight") or 0) * int(s.get("reps") or 0) for s in sets
        )
        base_tss = min(session_vol / 100.0, 150.0)
        # E2: proximity-to-failure scales fatigue AFTER the volume cap, so two
        # equally-high-volume sessions still differ by how close to failure they ran.
        day_tss += base_tss * proximity_fatigue_factor(sets, effort_coeff)

    return round(day_tss, 1)


def compute_manual_cardio_tss(completions: list, prescribed_cardio: list) -> float:
    """
    TSS credit for manually checked-off prescribed cardio (cardio_completions)
    on a day Garmin captured no run. The UI writes one row per session name
    (e.g. "Z2 run" from PrescribedSessionCard, or the normalized "Z2 Run"
    title from WeeklySchedule); match those against the day's prescribed
    cardio_sessions and credit duration_minutes ≈ 1 TSS/min, capped at 150.
    Garmin remains the source of truth whenever a real activity exists.
    """
    if not completions or not prescribed_cardio:
        return 0.0
    done = {str(c.get("name") or "").strip().lower() for c in completions}
    done.discard("")
    if not done:
        return 0.0
    total = 0.0
    for s in prescribed_cardio:
        zone = str(s.get("zone") or "Z2").strip()
        act  = str(s.get("activity_type") or "run").strip()
        candidates = {
            str(s.get("title") or "").strip().lower(),
            f"{zone} {act}".lower(),
        }
        candidates.discard("")
        matched = bool(candidates & done)
        # Single prescribed session + a check-off that didn't match by name
        # (UI naming drift) — still unambiguous, credit it.
        if not matched and len(prescribed_cardio) == 1:
            matched = True
        if matched:
            total += float(s.get("duration_minutes") or 0)
    return round(min(total, 150.0), 1)


def compute_hrv_zscore(recovery_rows: list) -> float:
    """
    Compute 7-day rolling HRV z-score for today's reading.
    Positive = above personal baseline = reliable / recovered.
    """
    hrv_series = sorted(
        [(r.get("date", ""), float(r.get("hrv") or 0))
         for r in recovery_rows if r.get("hrv")],
        key=lambda x: x[0],
    )
    if len(hrv_series) < 3:
        return 0.0

    values = [h for _, h in hrv_series[-7:]]
    mean   = sum(values) / len(values)
    std    = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5 + 1e-6
    today_hrv = values[-1]
    return round((today_hrv - mean) / std, 2)


def compute_soreness_composite(checkin: Optional[dict]) -> float:
    """
    Composite soreness 1–10 from the morning check-in for Kalman noise scaling.

    Reads the per-region `soreness_snapshot` jsonb (keys Chest/Back/Quads/…),
    which is what the check-in actually writes — the old per-column fields
    (soreness_chest, …) never existed, so this always returned the 5.0 default.
    Falls back to the `soreness` / `soreness_score` scalar, then to 5.0.
    """
    if not checkin:
        return 5.0
    snapshot = checkin.get("soreness_snapshot")
    if isinstance(snapshot, dict) and snapshot:
        # App-written jsonb is untrusted — skip non-numeric values instead of
        # crashing the daily compute (matches muscle_map.soreness_by_muscle).
        valid = []
        for v in snapshot.values():
            try:
                valid.append(float(v))
            except (TypeError, ValueError):
                continue
        if valid:
            # Snapshot regions are a 0-3 severity scale → map to 1-10.
            avg_03 = sum(valid) / len(valid)
            return round(1.0 + avg_03 * 3.0, 1)
    scalar = checkin.get("soreness")
    if scalar is None:
        scalar = checkin.get("soreness_score")
    if scalar is not None:
        return round(float(scalar), 1)
    return 5.0


def compute_normalized_cardio_trimp(recovery_rows: list) -> float:
    """
    Normalized running TRIMP for today ∈ [0, 1].
    Used as input to the cellular interference ODE.
    Derived from Garmin acute training load.
    """
    for r in recovery_rows:
        if r.get("date") == TODAY and r.get("training_load_acute"):
            # Garmin ATL is roughly in TSS units. Normalize to 0-1 (150 TSS = 1.0).
            return round(min(float(r["training_load_acute"]) / 150.0, 1.0), 3)
    return 0.0


def _glycogen_demand(user_id: str):
    """
    Per-day glycogen demand for carb cycling, from this week's scheduled
    program_workouts. demand = working sets + CARDIO_K × cardio minutes (long
    steady cardio is a big glycogen sink). Returns (today_demand, week_demand);
    a rest day with no scheduled session contributes 0. Used to split the weekly
    carb budget toward hard days. Falls back to (0,0) if no plan exists.
    """
    CARDIO_K = 0.5  # [ENG] minutes of cardio → set-equivalents of glycogen cost
    today = datetime.date.today()
    week_start = today - datetime.timedelta(days=today.weekday())
    week_end   = week_start + datetime.timedelta(days=6)
    try:
        rows = sb_get("program_workouts", {
            "select": "scheduled_date,exercises,cardio_sessions",
            "created_by": f"eq.{user_id}",
            "scheduled_date": f"gte.{week_start.isoformat()}",
            "order": "scheduled_date.asc",
        }) or []
    except Exception:
        return 0.0, 0.0
    today_d, week_d = 0.0, 0.0
    for r in rows:
        sd = str(r.get("scheduled_date") or "")[:10]
        if not (week_start.isoformat() <= sd <= week_end.isoformat()):
            continue
        sets = sum(int(e.get("sets") or 0) for e in (r.get("exercises") or []))
        cmin = sum(float(c.get("duration_minutes") or 0) for c in (r.get("cardio_sessions") or []))
        demand = sets + CARDIO_K * cmin
        week_d += demand
        if sd == today.isoformat():
            today_d = demand
    return round(today_d, 2), round(week_d, 2)


def _carb_windows(user_id: str, carb_target_g):
    """
    Split today's carb target into timing windows around today's scheduled
    session(s) — pre / post on a single-session day, or pre / between / post on
    a genuine two-a-day. Rest days get no windows; there's no session to time
    carbs around. Split percentages are engineering defaults, not a researched
    protocol. [ENG]

    "Genuine two-a-day" means the lift and the cardio are stamped with DIFFERENT
    `time_of_day` values. This used to branch on "the day has a lift AND has
    cardio", which is a different question: evaluate_two_a_day_split() in
    generate_weekly_program.py decides separately whether the two halves are
    actually pulled apart, and only stamps time_of_day when they are. On a
    combined day the app was showing a "Between sessions" window for a between
    that does not exist. Rows carrying no stamps at all (hand-created, or staged
    before the stamping existed) read as one block — the conservative call, since
    nothing in the data says there are two sessions.

    Labels name the MODALITY rather than AM/PM, because "eat 25g between
    sessions" does not tell you which side of the run it belongs on. Order comes
    off the stamps, so this stays correct if lift-before-endurance ever flips.

    The final window gets extra weight when TOMORROW is also a training day —
    top off glycogen tonight rather than split it evenly, since there's
    back-to-back demand coming. (The originally-sketched <4h same-day gap-merge
    rule is dormant: generate_weekly_program.py already enforces >=6h between a
    two-a-day's own halves by design, so that gap never occurs under
    engine-generated plans.)
    """
    if not carb_target_g:
        return []
    today = datetime.date.today()
    tomorrow = today + datetime.timedelta(days=1)
    try:
        rows = sb_get("program_workouts", {
            "select": "scheduled_date,exercises,cardio_sessions",
            "created_by": f"eq.{user_id}",
            "scheduled_date": f"gte.{today.isoformat()}",
            "order": "scheduled_date.asc",
            "limit": "7",
        }) or []
    except Exception:
        return []

    def _real_lifts(row):
        return [e for e in ((row or {}).get("exercises") or []) if int(e.get("sets") or 0) > 0]

    def _real_cardio(row):
        return [c for c in ((row or {}).get("cardio_sessions") or [])
                if float(c.get("duration_minutes") or 0) > 0]

    def _tods(items):
        """The distinct time_of_day stamps on a set of session items, unstamped dropped."""
        return {str(i.get("time_of_day") or "").strip().lower() for i in items} - {""}

    today_row = next((r for r in rows if str(r.get("scheduled_date") or "")[:10] == today.isoformat()), None)
    tomorrow_row = next((r for r in rows if str(r.get("scheduled_date") or "")[:10] == tomorrow.isoformat()), None)

    lifts, cardio = _real_lifts(today_row), _real_cardio(today_row)
    tomorrow_trains = bool(_real_lifts(tomorrow_row) or _real_cardio(tomorrow_row))

    if not lifts and not cardio:
        return []  # rest day — nothing to time carbs around

    lift_tods, cardio_tods = _tods(lifts), _tods(cardio)
    # Split only when both halves are stamped AND the stamps disagree. Equal
    # stamps (both "am") mean one block that happens to contain both, which is
    # exactly the combined day the old has_lift-and-has_cardio test misread.
    is_split = bool(lifts and cardio and lift_tods and cardio_tods
                    and not (lift_tods & cardio_tods))

    # "am" sorts before "pm", which is the order the generator stamps (E13
    # lift-before-endurance). Comparing the stamps rather than assuming the lift
    # is first keeps the labels honest if that ever changes.
    lift_label, cardio_label = "lift", "cardio"
    if is_split:
        first, second = ((lift_label, cardio_label)
                         if min(lift_tods) <= min(cardio_tods)
                         else (cardio_label, lift_label))
        pre_pct, mid_pct, post_pct = (0.30, 0.20, 0.50) if tomorrow_trains else (0.35, 0.25, 0.40)
        return _windows([
            (f"Pre-{first}", pre_pct),
            (f"Between (post-{first}, pre-{second})", mid_pct),
            (f"Post-{second}", post_pct),
        ], carb_target_g)

    # One block: a lift, a cardio session, or both done together.
    what = (f"{lift_label}+{cardio_label}" if lifts and cardio
            else (lift_label if lifts else cardio_label))
    return _windows([(f"Pre-{what}", 0.55), (f"Post-{what}", 0.45)], carb_target_g)


def _windows(split, carb_target_g):
    """
    Materialize (label, fraction) pairs into window rows.

    Carries `pct` alongside `grams` because the two numbers have different
    owners. The engine owns the SHAPE of the split; the UI owns the carb TOTAL,
    since useDailyTargets re-derives carbs as the calorie remainder after its own
    cut clamps on protein and fat (which can sit above the engine's floors) plus
    the dextrose-overshoot term. Absolute grams computed here therefore did not
    always sum to the carb number displayed right above them. The client rescales
    off `pct`; `grams` stays for any consumer reading the state row directly.
    """
    return [{"label": label, "pct": round(frac, 4), "grams": round(carb_target_g * frac)}
            for label, frac in split]


def _consecutive_poor_sleep(recovery_rows: list, threshold: int = 60) -> int:
    """
    Count consecutive most-recent poor nights. Half of the severe-crash recovery valve
    (the other half is sustained low HRV). E11: prefer the actual logged sleep DURATION
    (a night under POOR_NIGHT_HOURS) when present, falling back to the 0-100 sleep_score;
    stops at the first good or fully-missing night so it measures a real run of bad sleep.
    """
    rows = sorted([r for r in recovery_rows if r.get("date")],
                  key=lambda r: str(r.get("date")), reverse=True)
    n = 0
    for r in rows:
        poor = is_poor_night(r.get("sleep_duration_min"), r.get("sleep_score"),
                             score_threshold=threshold)
        if poor is None:      # neither duration nor score → missing night, stop the run
            break
        if poor:
            n += 1
        else:
            break
    return n


def compute_normalized_strength_vol(workout_logs: list) -> float:
    """
    Normalized strength training volume for today ∈ [0, 1].
    Used as input to the cellular interference ODE.
    25 hard sets = 1.0 (typical hard session upper bound).
    """
    total_sets = 0
    for log in workout_logs:
        if log.get("log_date", "") != TODAY:
            continue
        for ex in (log.get("exercises") or []):
            sets = ex.get("sets") or []
            hard = sum(1 for s in sets if s.get("weight") or s.get("reps"))
            total_sets += hard
    return round(min(total_sets / 25.0, 1.0), 3)


def is_sunday() -> bool:
    return datetime.date.today().weekday() == 6 or os.environ.get("FORCE_WEEKLY") == "1"


# Banister observation (y_t) tuning — relative-e1RM strength performance index.
PERF_BASELINE          = 100.0  # Banister scale: performance = 100 + F − f
PERF_BASELINE_WINDOW   = 28     # days of prior sessions that define "recent baseline"
PERF_MIN_BASELINE_N    = 4      # min prior sessions in-window to trust a baseline
PERF_OBS_MAX_AGE_DAYS  = 1      # only observe a lift trained ~today (absorbs tz/late-night)
PERF_GAIN_K            = 100.0  # 1% e1RM deviation from baseline = 1 performance unit
PERF_DEV_CLAMP         = 20.0   # cap |deviation| at ±20 units to reject Epley outliers


def compute_observation_y(workout_logs: list) -> Optional[float]:
    """
    Kalman observation y_t = today's STRENGTH performance relative to recent baseline,
    on the Banister scale (100 = at baseline / neutral form).

    For each competition goal lift trained ~today, compare its latest e1RM to that
    lift's trailing-28d baseline (mean of prior in-window sessions, excluding the
    latest). A fresh-day PR lands above 100 (positive form); a fatigued grind lands
    below 100 — which is exactly the fitness-minus-fatigue residual the filter models.
    Deviations are averaged across the lifts trained that day.

    Why RELATIVE, not absolute: Banister "performance" must be stationary around a
    load-driven equilibrium. Raw e1RM trends upward over months (long-term adaptation,
    already tracked in compute_strength), which would force the fitness state F to
    chase a non-stationary target while its 45-day decay fights it — a miscalibrated,
    perpetually-lagging filter. Detrending against the recent baseline keeps y_t
    centered at 100 so F stays well-behaved.

    Deliberately does NOT use the recovery score: performance is observed from actual
    lifts, not from how rested the athlete feels (the prior recovery→performance
    mapping made the "fitness-fatigue" state an HRV/sleep smoother in disguise).

    Returns None when no goal lift was trained ~today or there's insufficient history
    to form a baseline — the Kalman runs predict-only on those days (step handles it).
    """
    goal_hist = goal_histories(normalize_workout_logs(workout_logs))
    if not goal_hist:
        return None

    today = datetime.date.today()
    deviations: list[float] = []

    for _lift, sessions in goal_hist.items():
        # Need the latest session plus enough prior history for a baseline.
        if len(sessions) < PERF_MIN_BASELINE_N + 1:
            continue

        latest_date_str, latest_e1rm = sessions[-1]
        try:
            latest_date = datetime.date.fromisoformat(latest_date_str)
        except (ValueError, TypeError):
            continue

        # Only treat this as today's observation if the lift was trained ~today.
        if (today - latest_date).days > PERF_OBS_MAX_AGE_DAYS:
            continue

        window_start = latest_date - datetime.timedelta(days=PERF_BASELINE_WINDOW)
        prior: list[float] = []
        for d_str, e1rm in sessions[:-1]:
            try:
                d = datetime.date.fromisoformat(d_str)
            except (ValueError, TypeError):
                continue
            if window_start <= d < latest_date:
                prior.append(float(e1rm))

        if len(prior) < PERF_MIN_BASELINE_N:
            continue
        baseline = sum(prior) / len(prior)
        if baseline <= 0:
            continue

        dev = (float(latest_e1rm) / baseline - 1.0) * PERF_GAIN_K
        dev = max(-PERF_DEV_CLAMP, min(PERF_DEV_CLAMP, dev))
        deviations.append(dev)

    if not deviations:
        return None

    return round(PERF_BASELINE + sum(deviations) / len(deviations), 2)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"=== compute_athlete_state  {TODAY} ===")

    print("Fetching data from Supabase...")

    workout_logs = sb_get("workout_logs", {
        "select": "*",
        "log_date": f"gte.{days_before(90)}",
        "order": "log_date.desc",
    })
    print(f"  workout_logs: {len(workout_logs)} records")

    recovery_rows = sb_get("recovery_metrics", {
        "select": "*",
        "date": f"gte.{days_before(42)}",
        "order": "date.desc",
    })
    print(f"  recovery_metrics: {len(recovery_rows)} records")

    food_entries = sb_get("food_entries", {
        "select": "*",
        "date": f"gte.{days_before(14)}",
        # Weekly-plan rows load as planned=true and only flip false when the
        # athlete checks them off as eaten. Counting them would inflate
        # avg_calories_7d / adherence / TDEE with food that was never eaten.
        "planned": "not.is.true",
        "order": "date.desc",
    })
    print(f"  food_entries: {len(food_entries)} records")

    weight_entries = sb_get("body_weight_entries", {
        "select": "*",
        "recorded_date": f"gte.{days_before(30)}",
        "order": "recorded_date.desc",
    })
    print(f"  body_weight_entries: {len(weight_entries)} records")

    profile_rows = sb_get("user_profiles", {"select": "*", "limit": "1"})
    if not profile_rows:
        print('WARN: No user_profiles row — using defaults', flush=True)
    profile      = profile_rows[0] if profile_rows else {}

    pst_tests = sb_get("pst_tests", {
        "select": "*",
        "order": "test_date.desc",
        "limit": "3",
    })
    print(f"  pst_tests: {len(pst_tests)} records")

    checkin_rows = sb_get("daily_readiness", {
        "select": "*",
        "date": f"eq.{TODAY}",
        "limit": "1",
    })
    checkin = checkin_rows[0] if checkin_rows else None
    print(f"  daily_readiness: {'found' if checkin else 'none'}")

    # Fetch Garmin runs for VDOT derivation (newest first, recent window).
    # Garmin type keys include treadmill_running / trail_running / track_running
    # — a strict eq.running filter made those runs invisible to VDOT/run-TSS
    # while the UI counted them as done.
    garmin_runs = sb_get("garmin_activities", {
        "select": "activity_date,activity_type,distance_meters,duration_seconds,avg_hr,max_hr",
        "activity_type": "like.*running*",
        "activity_date": f"gte.{days_before(42)}",
        "order": "activity_date.desc",
    })
    print(f"  garmin_activities (runs, 42d): {len(garmin_runs)} records")

    # Manual "prescribed cardio done" check-offs (cardio_completions) — the UI's
    # fallback for sessions Garmin missed. Only credited as load when Garmin has
    # no run today (no double count when the real activity synced).
    manual_cardio_tss = 0.0
    cardio_completions = sb_get("cardio_completions", {
        "select": "name", "cardio_date": f"eq.{TODAY}",
    })
    if cardio_completions and not any(
            str(r.get("activity_date") or "")[:10] == TODAY for r in garmin_runs):
        _plan_rows = sb_get("program_workouts", {
            "select": "cardio_sessions",
            "scheduled_date": f"eq.{TODAY}", "limit": "1",
        })
        _prescribed_cardio = (_plan_rows[0].get("cardio_sessions") or []) if _plan_rows else []
        manual_cardio_tss = compute_manual_cardio_tss(cardio_completions, _prescribed_cardio)
        if manual_cardio_tss > 0:
            print(f"  cardio_completions: crediting {manual_cardio_tss} TSS "
                  f"(manual check-off, no Garmin run today)")

    print("\nComputing metrics...")

    strength      = compute_strength(workout_logs)
    hypertrophy   = compute_hypertrophy(workout_logs)
    joint_action  = compute_joint_action_volume(workout_logs)
    fatigue       = compute_fatigue(workout_logs, recovery_rows)
    recovery    = compute_recovery(recovery_rows, checkin)
    endurance   = compute_endurance(recovery_rows, pst_tests)
    nutrition   = compute_nutrition(food_entries, weight_entries, profile)

    # Summary to console
    print(f"\n  Strength lifts tracked: {list(strength.keys())}")
    for _lift, _d in strength.items():
        print(f"    {_lift}: e1RM={_d['current_e1rm']}lbs  rate={_d['progression_rate_lbs_per_week']}lbs/wk  "
              f"stall={_d['stall_risk']}  (target {_d['target']}, {_d['sessions']} sessions)")
    print(f"  Recovery: score={recovery.get('score')}  readiness={recovery.get('push_readiness')}  hrv_trend={recovery.get('hrv_trend')}")
    print(f"  Fatigue:  TSB={fatigue.get('tsb')}  CNS={fatigue.get('cns_fatigue')}  interp={fatigue.get('interpretation')}")
    print(f"  Nutrition: {nutrition.get('avg_calories_7d')} kcal avg  {nutrition.get('avg_protein_7d')}g protein  trend={nutrition.get('weight_trend_lbs_per_week')} lbs/wk")

    # ── Adaptive engine ───────────────────────────────────────────────────────
    banister_out      = None
    cellular_out      = None
    vdot_zones_out    = None
    nutrition_mod_out = None
    overreach_out     = None
    engine_params_row = None

    if _ENGINE_AVAILABLE:
        print("\nRunning adaptive engine...")

        # 1. Load yesterday's engine params.
        # `date=lt.TODAY` is load-bearing, not decoration. Without it a SECOND run on
        # the same day reads back the row THIS script just wrote, so kalman.step()
        # applies today's load on top of an already-stepped state, rls.accumulate()
        # buffers the same point twice, and guardrail.record_state() appends the day
        # twice. That is not hypothetical: generate-weekly-program.yml (05:00 UTC Mon)
        # shells out to this script via refresh_athlete_state(), and daily-engine.yml
        # runs it again at 10:00 UTC the same day — so fatigue was double-stepped every
        # Monday, plus on every workflow_dispatch and every job retry.
        prev_params = sb_get("engine_params", {
            "select": "*",
            "date":   f"lt.{TODAY}",
            "order":  "date.desc",
            "limit":  "1",
        })
        prev = prev_params[0] if prev_params else {}

        kalman    = BanisterKalman.from_dict(prev.get("kalman_state")    or {})
        rls       = RLSParameterLearner.from_dict(prev.get("rls_params") or {})
        cellular  = CellularInterferenceModel.from_dict(prev.get("cellular_state") or {})
        vdot_eng  = VDOTEngine.from_dict(prev.get("vdot_state")          or {})
        guardrail = SystemGuardrail.from_dict(prev.get("guardrail_state") or {})

        # 2. RLS τ-personalisation is DISABLED as a Kalman consumer (CONVERGENCE_AUDIT F4).
        #    The RLS estimator is under-identified (scale-mismatch + c_fit/c_fat
        #    unobservable from a single daily performance number), so a "mature"
        #    learner drives θ to its clamp BOUNDS rather than to true values and then
        #    silently corrupts the fitness/fatigue A/B matrices every MPC decision
        #    rests on. The MIN_PHI_VAR windup guard does not save it (the regressor's
        #    heterogeneous-scale variance is ~700× the threshold, so it never fires).
        #    Population defaults are demonstrably better than clamp-pinned values.
        #    We keep learning/persisting RLS (harmless, cheap) but DO NOT consume it
        #    until a structural estimator exists (joint state-parameter EKF / offline
        #    Banister fit) — matching the already-disabled cellular closed loop.
        #    To re-enable, gate on `not _at_bounds(theta) and confidence > THRESH`.
        # if rls.is_mature():
        #     kalman.update_params(**rls.params_dict())

        # 3. Compute today's inputs
        # E2: effort-cost is a learnable per-athlete prior; use a stored override if
        # one has been persisted, else the wide population prior.
        _effort_coeff = prev.get("effort_cost_coeff")
        _effort_coeff = float(_effort_coeff) if _effort_coeff is not None else EFFORT_COST_PRIOR
        u_t       = compute_training_load_tss(workout_logs, recovery_rows, _effort_coeff)
        if manual_cardio_tss > 0:
            # Checked-off prescribed cardio Garmin missed — count it as load so
            # the engine and the UI agree the session happened.
            u_t = round(u_t + manual_cardio_tss, 1)
        hrv_z     = compute_hrv_zscore(recovery_rows)
        soreness  = compute_soreness_composite(checkin)

        # #14: consume the per-lift progression command (was emitted but never
        # acted on). Surfaces INCREASE_LOAD / HOLD / DELOAD / SWAP_EXERCISE per goal
        # lift; on SWAP_EXERCISE (multi-week stall despite recovery) attach a concrete
        # variation so the plateau actually gets broken instead of silently persisting.
        _goal_hist = goal_histories(normalize_workout_logs(workout_logs))
        for _lift, _d in strength.items():
            _hist = [e for _, e in _goal_hist.get(_lift, [])]
            cmd = process_strength_progression(_hist, hrv_z)
            _d["progression_command"] = cmd
            if cmd == "SWAP_EXERCISE":
                _d["swap_suggestion"] = SWAP_SUGGESTIONS.get(
                    _lift, "Swap to a close variation for ~3 weeks, then re-test the comp lift."
                )
                print(f"  ⚠️  {_lift}: extended stall → SWAP_EXERCISE recommended")
        y_t       = compute_observation_y(workout_logs)
        run_trimp = compute_normalized_cardio_trimp(recovery_rows)
        str_vol   = compute_normalized_strength_vol(workout_logs)

        # 4. Nutrition modulation (computed BEFORE the Kalman step so a caloric deficit
        #    can slow fatigue-clearance for THIS step — E9 wires this previously-dead
        #    output into the engine).
        # Physique photo BF trend → Forbes density (E10). The bodyfat_frac hook on
        # estimate_tdee existed but was never fed, so the composition term always
        # ran on the 0.18 population prior regardless of what the photos showed.
        _phys_rows = sb_get("physique_entries", {
            "select": "taken_at,bodyfat_estimate", "created_by": f"eq.{USER_ID}",
            "bodyfat_estimate": "not.is.null", "order": "taken_at.desc", "limit": "60"})
        bf_frac_physique = compute_physique_bf_frac(_phys_rows)

        # Learned under-report correction. `learned_intake_bias` shipped in engine/tdee.py
        # but nothing ever called it, so intake_bias sat at its 1.0 default and the
        # energy-balance term took the food log at face value forever. It is a bounded
        # [1.0, 1.5] per-person nudge reconciling LOGGED intake with the intake the trend
        # weight IMPLIES. Anchor expenditure on the bodyweight prior, NOT on a log-derived
        # TDEE — using the latter would make the bias justify the very log it is correcting.
        _bw          = float(profile.get("current_weight") or 0)
        _avg_kcal_7d = nutrition.get("avg_calories_7d")
        _trend       = nutrition.get("weight_trend_lbs_per_week")
        _coverage    = float(nutrition.get("log_coverage_7d") or 0.0)
        _days_logged = nutrition.get("days_logged_7d") or 0
        _prev_bias   = float((prev.get("nutrition_state") or {}).get("intake_bias") or 1.0)

        intake_bias = _prev_bias
        if _bw > 0 and _avg_kcal_7d and _trend is not None and _coverage > 0:
            _bf_frac = bf_frac_physique if bf_frac_physique is not None else DEFAULT_BODYFAT_FRAC
            _density = energy_density_kcal_per_lb(_bw * KG_PER_LB * _bf_frac)
            intake_bias = learned_intake_bias(
                mean_intake=float(_avg_kcal_7d),
                expenditure_est=_bw * 15.5,
                daily_rate_lb=float(_trend) / 7.0,
                density_kcal_per_lb=_density,
                prev_bias=_prev_bias,
            )

        maintenance_kcal  = estimate_tdee(
            _bw,
            _avg_kcal_7d,
            _trend,
            fallback=float(profile.get("maintenance_kcal") or 3200),
            bodyfat_frac=bf_frac_physique,
            intake_bias=intake_bias,
            log_coverage=_coverage,
        )
        print(f"  TDEE (adaptive): {round(maintenance_kcal)} kcal  "
              f"(bw {_bw}lb, intake {_avg_kcal_7d} over {_days_logged}/7 d, "
              f"bias {intake_bias:.2f}, trend {_trend} lb/wk, "
              f"photo BF {f'{bf_frac_physique:.1%}' if bf_frac_physique is not None else 'n/a → prior'})")
        if _coverage < 1.0:
            print(f"  ⚠️  intake logged {_days_logged}/7 days (coverage {_coverage:.0%}) — "
                  f"energy-balance TDEE down-weighted toward the bodyweight prior. "
                  f"Log every day to sharpen it.")
        nutrition_mod_obj = NutritionModulator(maintenance_kcal=maintenance_kcal)
        avg_kcal          = float(nutrition.get("avg_calories_7d") or maintenance_kcal)
        nutrition_mod_out = nutrition_mod_obj.modulate(
            avg_kcal, kalman.tau_fat, base_mrv_sets=16.0
        )
        print(f"  Nutrition: deficit_ratio={nutrition_mod_out['deficit_ratio']:.2f}  "
              f"tau_fat_adj={nutrition_mod_out['tau_fat_adj']}  "
              f"reliability={nutrition_mod_out['metric_reliability']}")
        # E9: under a deficit feed the slowed fatigue-clearance into THIS Kalman step
        # (transient — never overwrites the learned base tau_fat, so it can't compound).
        _tau_fat_eff = (nutrition_mod_out["tau_fat_adj"]
                        if nutrition_mod_out.get("phase") == "deficit" else None)

        # 5. Kalman step (predict + update)
        _obs = f"{y_t:.2f} (strength perf vs baseline)" if y_t is not None else "none → predict-only"
        print(f"  Observation y_t: {_obs}")
        banister_out = kalman.step(u_t, y_t, hrv_z=hrv_z, soreness=soreness,
                                   tau_fat_eff=_tau_fat_eff)
        print(f"  Banister: F={banister_out['fitness']:.2f}  f={banister_out['fatigue']:.2f}  "
              f"TSB={banister_out['tsb_banister']:.2f}  conf={banister_out['confidence']}")

        # 6. Cellular ODE step
        cellular_out = cellular.step(run_trimp, str_vol)
        print(f"  Cellular: AMPK={cellular_out['ampk']:.3f}  mTORC1={cellular_out['mtorc1']:.3f}  "
              f"interference={cellular_out['interference_level']}")

        # 7. VDOT: derive from real Garmin runs (HR-corrected for effort).
        # Garmin run data lives in garmin_activities with avg_hr, so submax base
        # runs can be effort-corrected via HR instead of being mistaken for max
        # efforts (which would lowball VDOT).
        hr_max = max(
            float(max((float(r.get("max_hr") or 0) for r in garmin_runs), default=0)),
            round(208.0 - 0.7 * float(profile.get("age") or 25)),
        )
        new_vdot = vdot_eng.set_from_recent_runs(garmin_runs, hr_max)
        if new_vdot is not None:
            print(f"  VDOT derived from {len(garmin_runs)} Garmin runs "
                  f"(HRmax={hr_max:.0f}) → VDOT={new_vdot}")
        else:
            print(f"  VDOT: no qualifying Garmin runs; holding VDOT={vdot_eng.vdot}")
        vdot_zones_out = vdot_eng.pace_zones()
        print(f"  VDOT: {vdot_zones_out['current_vdot']} (target {vdot_zones_out['target_vdot']}, "
              f"gap {vdot_zones_out['vdot_gap']})")

        # 8. Overreaching check
        hrv_hist = [float(r.get("hrv") or 0) for r in sorted(recovery_rows, key=lambda r: r.get("date",""))
                    if r.get("hrv")][-7:]
        rhr_hist = [float(r.get("resting_hr") or 0) for r in sorted(recovery_rows, key=lambda r: r.get("date",""))
                    if r.get("resting_hr")][-7:]
        stress_hist = [float(r.get("stress_score") or 0) for r in sorted(recovery_rows, key=lambda r: r.get("date",""))
                       if r.get("stress_score")][-7:]
        acwr     = float(fatigue.get("atl") or 0) / (float(fatigue.get("ctl") or 1) + 1e-5)
        overreach_out = guardrail.check_overreaching(hrv_hist, rhr_hist, acwr, stress_hist)
        if overreach_out["overreaching"]:
            print(f"  ⚠️  OVERREACHING DETECTED: HRV_z={overreach_out['hrv_z_3d']}  "
                  f"RHR_z={overreach_out['rhr_z_3d']}")
        else:
            print(f"  Fatigue state: {overreach_out['fatigue_state']}")

        # 8b. Recovery-gated deficit recommendation — how aggressive a cut is
        # safe TODAY given recovery (overreach / HRV / RHR / form / sleep). Goal:
        # max leanness without compromising recovery. Written into the nutrition
        # block so the app + weekly meal plan can target it (apply only when cutting).
        latest_weight_lb = None
        for w in sorted(weight_entries, key=lambda x: x.get("recorded_date", ""), reverse=True):
            try:
                latest_weight_lb = float(w.get("weight"))
                break
            except (ValueError, TypeError):
                continue
        latest_sleep = next(
            (r.get("sleep_score") for r in sorted(recovery_rows, key=lambda r: r.get("date", ""), reverse=True)
             if r.get("sleep_score") is not None),
            None,
        )
        # Failure-reason gate: a lift whose recent miss was TECHNICAL (lockout, off
        # the chest, form, grip) is a skill/leverage issue, not a fuelling signal, so
        # its negative slope must NOT ease the cut deficit. Exclude such lifts from
        # strength_min_slope unless they ALSO had a systemic ("out of gas") miss
        # (genuine strength dip wins). Only the systemic signal eases calories.
        from engine.failure_reasons import parse_set_failures, infer_lift
        _fail = parse_set_failures(workout_logs, today_iso=str(TODAY))
        _exclude_lifts = _fail["technical_miss_lifts"] - _fail["systemic_miss_lifts"]
        _slopes = [float(v.get("progression_rate_lbs_per_week") or 0)
                   for k, v in (strength.items() if isinstance(strength, dict) else [])
                   if isinstance(v, dict) and v.get("progression_rate_lbs_per_week") is not None
                   and infer_lift(k) not in _exclude_lifts]
        strength_min_slope = min(_slopes) if _slopes else None
        if _exclude_lifts:
            print(f"  Cut gate: excluding technical-miss lifts from strength signal: {sorted(_exclude_lifts)}")
        # Weeks elapsed in the current open diet phase (from diet_phases) → the
        # TNF 4-6 week duration cap. Dormant until a cut phase with a start is logged.
        weeks_in_cut = None
        try:
            # created_by filter is load-bearing: a stale duplicate user id holds a second
            # copy of the diet_phases rows, and without it the open-phase lookup can read
            # the wrong athlete's cut start.
            _dp = sb_get("diet_phases", {
                "select": "*", "created_by": f"eq.{USER_ID}",
                "end_date": "is.null", "order": "created_at.desc", "limit": "1",
            })
            if _dp:
                _sd = _dp[0].get("start_date") or _dp[0].get("created_at")
                if _sd:
                    _start = datetime.date.fromisoformat(str(_sd)[:10])
                    weeks_in_cut = (datetime.date.today() - _start).days / 7.0
        except Exception:
            weeks_in_cut = None
        # Carb-cycling demand: distribute the week's carb budget by each day's
        # glycogen cost (lifting volume + cardio minutes), read from the scheduled
        # program_workouts for this week. glyco_today / glyco_week feed the modulator.
        glyco_today, glyco_week = _glycogen_demand(USER_ID)

        # Sustained poor sleep (consecutive recent nights below threshold) — half of
        # the severe-crash recovery valve on a cut (the other half is HRV).
        poor_sleep_days = _consecutive_poor_sleep(recovery_rows)

        # Manual escape valves: did he tap "ease today" (fuel a rough day), "hold
        # the hard deficit" (override the auto-ease and run the full deficit), or
        # "manual" (typed in his own calorie/protein target, MacroFactor-style —
        # this outranks the recovery-gated math entirely, applied below).
        _ov_rows = sb_get("nutrition_overrides", {
            "select": "action,manual_calorie_target,manual_protein_g", "created_by": f"eq.{USER_ID}",
            "date": f"eq.{datetime.date.today().isoformat()}", "limit": "1"})
        _ov = _ov_rows[0] if _ov_rows else {}
        _ov_action = _ov.get("action")
        ease_today = _ov_action == "ease"
        push_today = _ov_action == "push"
        manual_cal = _ov.get("manual_calorie_target") if _ov_action == "manual" else None
        manual_protein = _ov.get("manual_protein_g") if _ov_action == "manual" else None

        nutrition["recommended_intake"] = nutrition_mod_obj.recommend_deficit({
            "overreaching":  overreach_out.get("overreaching"),
            "hrv_z":         overreach_out.get("hrv_z_3d"),
            "rhr_z":         overreach_out.get("rhr_z_3d"),
            "tsb_banister":  banister_out.get("tsb_banister"),
            "sleep_score":   latest_sleep,
            "bodyweight_lb": latest_weight_lb,
            "phase":         nutrition.get("phase"),
            "strength_min_slope": strength_min_slope,
            "weeks_in_cut":  weeks_in_cut,
            "glyco_today":   glyco_today,
            "glyco_week":    glyco_week,
            "poor_sleep_days": poor_sleep_days,
            "ease_today":    ease_today,
            "force_full_deficit": push_today,
        })
        _rec = nutrition["recommended_intake"]
        # Manual target wins outright: he outranks the algorithm the same way
        # force_full_deficit does, but for the number itself, not just the gates.
        # Macro floors (protein/fat/carb) from the recovery-gated calc are kept as
        # metadata only when he didn't also override protein.
        if manual_cal:
            _rec["calorie_target"] = int(manual_cal)
            if manual_protein:
                _rec["protein_g"] = int(manual_protein)
            _maint = _rec.get("maintenance_kcal") or 0
            _rec["kcal_deficit"] = round(_maint - manual_cal)
            _rec["deficit_ratio"] = round(_rec["kcal_deficit"] / _maint, 3) if _maint else 0.0
            _rec["gates"] = ["manual_override"]
            _rec["rationale"] = (
                f"You set this manually: {int(manual_cal)} kcal"
                + (f" / {int(manual_protein)}g protein" if manual_protein else "")
                + " — overriding the engine's recovery-gated target."
            )
        print(f"  Deficit rec: target={_rec['calorie_target']} kcal  "
              f"deficit={round(_rec['deficit_ratio']*100)}%  "
              f"gates={_rec['gates'] or ['clear']}")
        nutrition["carb_windows"] = _carb_windows(USER_ID, _rec.get("carb_target_g"))

        # 8b. Diet-phase recommendation (engine acts as the coaching team: should
        # he cut / maintain / bulk for his goals?). Advisory — he accepts (sets
        # training_phase) or rejects. Uses latest physique bodyfat when available.
        from engine.phase_recommender import recommend_phase
        # Reuse the SESSION-EWMA photo bodyfat the TDEE path already computes, rather than
        # re-fetching one arbitrary row. `order=taken_at.desc limit 1` tie-breaks ARBITRARILY
        # among shots from the same session, and per-shot vision BF is pose-dependent: one
        # 2026-06-07 session read 18% front-relaxed and 10% front-flexed off the same body.
        # Since REVERSE_BF is 12%, that single row decided cut-vs-bulk on a coin flip
        # between a 10 and an 18. The session mean + cross-session EWMA is the actual signal.
        _bodyfat = round(bf_frac_physique * 100.0, 1) if bf_frac_physique is not None else None
        from engine.allocator import default_goal_priorities
        # Single source of truth for the default split (E1: hypertrophy-primary).
        _goal_prio = profile.get("goal_priorities") or default_goal_priorities(
            profile.get("training_phase"))
        nutrition["phase_recommendation"] = recommend_phase(
            weight_trend=nutrition.get("weight_trend_lbs_per_week"),
            days_to_deadline=max(0, (datetime.date(2026, 8, 31) - datetime.date.today()).days),
            bodyfat=float(_bodyfat) if _bodyfat is not None else None,
            goal_priorities=_goal_prio,
            current_phase=nutrition.get("phase"),
            # The 4-6 week duration cap. nutrition_modulator already eases the DEFICIT at
            # week 6; without this the phase recommender kept saying "cut" while the
            # modulator was quietly backing the calories out — the two disagreed.
            weeks_in_cut=weeks_in_cut,
        )
        _pr = nutrition["phase_recommendation"]
        print(f"  Phase recommendation: {_pr['phase'].upper()} ({_pr['confidence']}) — {_pr['rationale']}")

        # 9. Weekly updates (Sunday only)
        if is_sunday():
            print("  Running weekly updates (Sunday)...")

            # RLS: accumulate today's point ONLY when there is a real performance
            # observation. Previously a neutral 100 was injected on non-lift days,
            # teaching the learner that performance never moves with load — exactly
            # the wrong lesson. Pairs with the e1RM Kalman observation (y_t is None
            # on days without a fresh lift). NOTE: the RLS regression itself is
            # under-identified for the Banister time-constants (see rls_learner.py
            # header) — this only cleans the input, it does not make τ-learning sound.
            if y_t is not None:
                phi = [
                    banister_out.get("fitness", 0),
                    banister_out.get("fatigue", 0),
                    u_t / 100.0,
                    1.0 - nutrition_mod_out.get("deficit_ratio", 0),
                ]
                rls.accumulate(phi, y_t)
            rls_params = rls.weekly_update()
            print(f"    RLS update: tau_fit={rls_params['tau_fit']}  "
                  f"tau_fat={rls_params['tau_fat']}  updates={rls_params['updates']}")

            # Cellular closed-loop learning DISABLED (ADAPTIVE_ENGINE_DESIGN §7):
            # the coefficient is not identifiable from a single net-performance
            # number, so its parameter updates were unsound. The AMPK/mTORC1
            # SIGNAL still computes via cellular.step() and feeds the interference
            # penalty; only the (speculative) learning loop is off.
        else:
            # Non-Sunday: buffer the RLS point only on a real performance
            # observation (see the Sunday branch).
            if y_t is not None:
                phi = [
                    banister_out.get("fitness", 0),
                    banister_out.get("fatigue", 0),
                    u_t / 100.0,
                    1.0 - nutrition_mod_out.get("deficit_ratio", 0),
                ]
                rls.accumulate(phi, y_t)

        # 10. Guardrail state tracking
        guardrail.record_state(overreach_out["fatigue_state"])

        # Preserve nested weekly engine states from prev_params to avoid overwriting them
        prev_guardrail = prev.get("guardrail_state") or {}
        guardrail_dict = guardrail.to_dict()
        for key in ["mrv_state", "e1rm_registry", "exploration_state", "synthesis_state", "step_count"]:
            if key in prev_guardrail:
                guardrail_dict[key] = prev_guardrail[key]

        # 11. Save engine params
        engine_params_row = {
            "created_by":     USER_ID,
            "date":           TODAY,
            "kalman_state":   kalman.to_dict(),
            "rls_params":     rls.to_dict(),
            "cellular_state": cellular.to_dict(),
            "vdot_state":     vdot_eng.to_dict(),
            "guardrail_state": guardrail_dict,
            # Learned nutrition params. intake_bias is a slow nudge (gain 0.2), so it only
            # converges if it is carried across runs — recomputing it from 1.0 every day
            # would pin it near 1.0 forever and the learner would never actually learn.
            "nutrition_state": {
                "intake_bias":     intake_bias,
                "log_coverage_7d": _coverage,
                "days_logged_7d":  _days_logged,
                "maintenance_kcal": round(maintenance_kcal),
            },
            "computed_at":    datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        ok_engine = sb_upsert("engine_params", engine_params_row)
        if ok_engine:
            print("  ✓  Engine params saved")
        else:
            print("  ✗  Engine params save FAILED")

    # ── Write athlete_state ───────────────────────────────────────────────────
    print("\nUpserting to athlete_state...")
    row = {
        "created_by":           USER_ID,
        "date":                 TODAY,
        "strength":             strength,
        "hypertrophy":          hypertrophy,
        "joint_action_volume":  joint_action,
        "fatigue":              fatigue,
        "recovery":             recovery,
        "endurance":            endurance,
        "nutrition":            nutrition,
        "banister":             banister_out,
        "cellular":             cellular_out,
        "vdot_zones":           vdot_zones_out,
        "nutrition_modulation": nutrition_mod_out,
        "overreach_signal":     overreach_out,
        "computed_at":          datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    ok = sb_upsert("athlete_state", row)
    if ok:
        print(f"\n✓  Athlete state written for {TODAY}")
    else:
        print(f"\n✗  Failed to write athlete state")
        sys.exit(1)


if __name__ == "__main__":
    _ensure_user_id()
    main()
