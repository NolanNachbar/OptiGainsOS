#!/usr/bin/env python3
"""
mpc_prescriber.py — Model Predictive Control training prescription engine.

Runs at 4:05am MT daily, after compute_athlete_state.py has written today's
athlete state and engine params to Supabase.

What it does:
  1. Loads current athlete state + engine params from Supabase.
  2. Runs a 14-day forward simulation using the Banister Kalman model.
  3. Evaluates candidate today-actions (REST / CARDIO / CALISTHENICS / STRENGTH /
     MIXED / DELOAD) against a dual reward function:
       reward = w_pst × PST_readiness_gain + w_str × strength_progress
               - penalty_fatigue - penalty_acwr
  4. Selects the action that maximizes the 14-day trajectory score.
  5. Calls SessionGenerator to build the full session prescription.
  6. Writes result to the training_prescription table in Supabase.

MPC vs DQN:
  DQN needs to "explore" failure states to learn they're bad — dangerous for an
  N=1 system (one overuse injury ends the experiment). MPC uses your own Banister
  model to simulate consequences before committing, so no exploration is needed.

Env vars (loaded from ../.env):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
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

# ── Path setup ────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_DIR, ".env"))
except ImportError:
    pass

import numpy as np
from engine.banister_kalman    import BanisterKalman
from engine.guardrail          import SystemGuardrail
from engine.session_generator  import SessionGenerator

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY", "")
                or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
USER_ID      = os.environ.get("USER_ID", "")
TODAY        = datetime.date.today().isoformat()

if not all([SUPABASE_URL, SUPABASE_KEY]):
    print("ERROR: Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)


def _resolve_user_id() -> str:
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
        print(f"ERROR: Could not resolve USER_ID: {e}")
    sys.exit(1)


if not USER_ID:
    USER_ID = _resolve_user_id()
    print(f"  Resolved USER_ID from DB: {USER_ID}")

# ── MPC configuration ─────────────────────────────────────────────────────────

# TSS load associated with each candidate action.
# TWO_A_DAY = heavy lift + quality PM conditioning session.
# Only selected by MPC when TSB > 5, ACWR < 1.2, and recovery score is high.
ACTION_TSS = {
    "REST":          0.0,
    "LIGHT":        25.0,   # walk, easy swim, mobility
    "CARDIO":       55.0,   # moderate aerobic run
    "CALISTHENICS": 45.0,   # bodyweight PT session
    "STRENGTH":     70.0,   # heavy barbell session
    "MIXED":        85.0,   # strength + calisthenics or cardio
    "TWO_A_DAY":   120.0,   # strength AM (70) + conditioning PM (50)
    # No DELOAD action by design: deloads are treated as a programming failure,
    # not a tool. Volume is auto-regulated continuously (cut sets, keep weight)
    # rather than via forced deload weeks.
}

# MPC horizon (days to simulate forward)
HORIZON = 14

# Reward function weights (dynamic — adjusted by deadline urgency in code)
# Base weights when deadline is 90+ days away
W_PST_BASE = 0.50
W_STR_BASE = 0.50

# Penalty constants
PENALTY_FATIGUE_SCALE  = 0.08   # per unit of f_t above threshold
PENALTY_ACWR_SCALE     = 2.00   # per unit of ACWR above 1.3
FATIGUE_THRESHOLD      = 8.0    # f_t above this incurs penalty

# #13: per-action goal-readiness values for the dual reward. simulate_trajectory
# only sees an action's LOAD (TSS), so two equal-load actions otherwise score
# identically and w_pst couldn't actually steer toward PST development. These give
# each action a real PST-readiness vs strength-progress value, weighted by the
# deadline weights — so as the Aug 31 PST nears (w_pst↑) the MPC genuinely shifts
# toward conditioning instead of just reweighting the same fitness scalar.
PST_READINESS_VALUE = {
    "CARDIO": 1.0, "TWO_A_DAY": 0.9, "CALISTHENICS": 0.85, "MIXED": 0.7,
    "LIGHT": 0.4, "STRENGTH": 0.15, "REST": 0.0,
}
STRENGTH_PROGRESS_VALUE = {
    "STRENGTH": 1.0, "TWO_A_DAY": 0.7, "MIXED": 0.6,
    "CALISTHENICS": 0.25, "LIGHT": 0.2, "CARDIO": 0.1, "REST": 0.0,
}
GOAL_REWARD_SCALE      = 3.0    # magnitude of the goal-readiness reward

# Deadline
DEADLINE = datetime.date(2026, 8, 31)


# ── Supabase helpers ──────────────────────────────────────────────────────────

def _headers(extra=None):
    h = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }
    if extra:
        h.update(extra)
    return h


def sb_get(table, params):
    query = {"created_by": f"eq.{USER_ID}", **params}
    qs    = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}"
                     for k, v in query.items())
    url   = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req   = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  WARN sb_get({table}): {e}")
        return []


def sb_upsert(table, row):
    url  = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=created_by,date"
    data = json.dumps(row).encode()
    req  = urllib.request.Request(
        url, data=data, method="POST",
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except urllib.error.HTTPError as e:
        print(f"  ERROR sb_upsert({table}) {e.code}: {e.read().decode()[:300]}")
        return False
    except Exception as e:
        print(f"  ERROR sb_upsert({table}): {e}")
        return False


# ── MPC core ──────────────────────────────────────────────────────────────────

def deadline_weights() -> tuple:
    """Dynamic PST/strength weights based on days remaining to Aug 31."""
    days_left = max(0, (DEADLINE - datetime.date.today()).days)
    urgency   = 1.0 - min(days_left / 90.0, 1.0)
    w_pst     = min(0.90, W_PST_BASE + urgency * 0.45)
    w_str     = 1.0 - w_pst
    return round(w_pst, 3), round(w_str, 3)


def simulate_trajectory(
    kalman:        BanisterKalman,
    action_today:  str,
    load_history:  list,
    days:          int = HORIZON,
) -> dict:
    """
    Simulate Banister state evolution for `days` starting from current state.

    Day 0: apply action_today load.
    Days 1+: apply a balanced "smart default" heuristic that alternates
             STRENGTH / CARDIO / CALISTHENICS / REST in a realistic pattern.
             (The precise choice for days 2+ matters less than today's choice —
             this is the receding-horizon principle of MPC.)

    Returns a dict with trajectory summary metrics.
    """
    default_rotation = [
        "STRENGTH", "CARDIO", "CALISTHENICS", "REST",
        "STRENGTH", "MIXED",  "CARDIO",       "REST",
        "STRENGTH", "CALISTHENICS", "CARDIO",  "LIGHT",
        "STRENGTH", "REST",
    ]

    # Build load sequence for simulation (TSS per day)
    load_seq = [ACTION_TSS[action_today]]
    for d in range(1, days):
        action = default_rotation[d % len(default_rotation)]
        load_seq.append(ACTION_TSS[action])

    # Simulate Banister state
    snapshots = kalman.simulate_forward(load_seq)

    # Track ACWR across simulation (EWMA, not exact rolling window)
    hist = list(load_history[-28:]) + load_seq  # extend with simulated loads
    max_acwr   = 0.0
    min_tsb    = float("inf")
    total_load = sum(load_seq)

    for i in range(len(load_seq)):
        window = hist[max(0, len(load_history) - 28 + i): len(load_history) + i + 1]
        if len(window) >= 7:
            acute   = sum(window[-7:]) / 7.0
            chronic = sum(window) / len(window)
            acwr    = acute / (chronic + 1e-5)
            max_acwr = max(max_acwr, acwr)

    for snap in snapshots:
        min_tsb = min(min_tsb, snap["tsb"])

    final = snapshots[-1]
    peak  = max(snapshots, key=lambda s: s["tsb"])

    return {
        "final_fitness":  final["fitness"],
        "final_fatigue":  final["fatigue"],
        "final_tsb":      final["tsb"],
        "final_perf":     final["perf"],
        "peak_tsb":       peak["tsb"],
        "min_tsb":        min_tsb if min_tsb != float("inf") else final["tsb"],
        "max_acwr":       round(max_acwr, 3),
        "total_load":     round(total_load, 1),
    }


def score_trajectory(traj: dict, w_pst: float, w_str: float, action: str = "REST") -> float:
    """
    Score a 14-day simulated trajectory for the dual reward function.

    Higher is better. Components:
      + Goal-readiness reward: w_pst × PST-readiness(action) + w_str × strength(action)
      + Fitness gain signal (F_t at end of horizon)
      + TSB quality (want TSB positive at deadline, not just at day 14)
      - Fatigue penalty (excessive f_t slows adaptation and injury risk)
      - ACWR penalty (injury risk)
    """
    # The dual goal-readiness reward the docstring promised — this is what makes
    # today's ACTION CHOICE matter beyond its raw load (the trajectory sim is
    # otherwise load-only). Conditioning actions earn PST readiness, lifting earns
    # strength progress, each weighted by how close the deadline is.
    goal_term = GOAL_REWARD_SCALE * (
        w_pst * PST_READINESS_VALUE.get(action, 0.3)
        + w_str * STRENGTH_PROGRESS_VALUE.get(action, 0.3)
    )

    # Recovery/health signal: fitness trajectory value
    fitness_score = traj["final_fitness"] * (w_pst * 0.6 + w_str * 0.4)

    # TSB bonus: positive TSB = freshness = better performance expression
    tsb_bonus = max(0.0, traj["final_tsb"]) * 0.4

    # Fatigue penalty: quadratic above threshold
    excess_fatigue = max(0.0, traj["final_fatigue"] - FATIGUE_THRESHOLD)
    fatigue_penalty = PENALTY_FATIGUE_SCALE * (excess_fatigue ** 2)

    # ACWR penalty: anything above 1.3 is exponentially bad
    acwr_excess = max(0.0, traj["max_acwr"] - 1.3)
    acwr_penalty = PENALTY_ACWR_SCALE * (acwr_excess ** 2)

    return round(goal_term + fitness_score + tsb_bonus - fatigue_penalty - acwr_penalty, 4)


def select_action(
    kalman:       BanisterKalman,
    guardrail:    SystemGuardrail,
    load_history: list,
    acwr:         float,
    overreaching: bool,
) -> tuple:
    """
    Evaluate all candidate actions and return (best_action, best_intensity, scores).

    Returns early with REST if overreaching is detected — no simulation needed.
    """
    if overreaching:
        return "REST", 0.7, {}

    w_pst, w_str = deadline_weights()

    scores = {}
    for action in ACTION_TSS:
        traj          = simulate_trajectory(kalman, action, load_history)
        raw_score     = score_trajectory(traj, w_pst, w_str, action)
        scores[action] = {"score": raw_score, "trajectory": traj}

    # Sort by score descending
    ranked = sorted(scores.items(), key=lambda x: x[1]["score"], reverse=True)
    best_action = ranked[0][0]

    # No auto LIGHT gym days. Per athlete preference, high ACWR/TSB does NOT
    # force an easy session — he trains through it. ACWR is still computed and
    # surfaced (engine output + brief) as information, and genuine overreach
    # (HRV-crash signature) still returns REST at the top of this function. The
    # athlete decides whether to back off; the engine won't sandbag him.
    intensity = 1.0

    return best_action, round(intensity, 2), {k: v["score"] for k, v in scores.items()}


# ── Load history helper ───────────────────────────────────────────────────────

def build_load_history(athlete_state_rows: list) -> list:
    """
    Reconstruct daily TSS load history from stored athlete states.
    Used for ACWR calculation in MPC simulation.
    """
    history = []
    for row in reversed(athlete_state_rows):   # oldest first
        fat = row.get("fatigue") or {}
        atl = fat.get("atl")
        if atl is not None:
            history.append(float(atl))
        else:
            history.append(0.0)
    return history


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"=== mpc_prescriber  {TODAY} ===")

    # ── Load data from Supabase ───────────────────────────────────────────────
    print("Loading athlete state and engine params...")

    engine_rows = sb_get("engine_params", {
        "select":  "*",
        "order":   "date.desc",
        "limit":   "1",
    })
    engine_params = engine_rows[0] if engine_rows else {}

    athlete_rows = sb_get("athlete_state", {
        "select":  "date,fatigue,recovery,strength,endurance",
        "order":   "date.desc",
        "limit":   "30",
    })
    today_state = athlete_rows[0] if athlete_rows else {}
    if not athlete_rows:
        print('WARN: No athlete_state row — MPC running on stale/default state', flush=True)

    pst_rows = sb_get("pst_tests", {
        "select": "*",
        "order":  "test_date.desc",
        "limit":  "1",
    })
    latest_pst = pst_rows[0] if pst_rows else {}

    soreness_rows = sb_get("soreness_logs", {
        "select": "date,muscle_group,level",
        "date":   f"gte.{(datetime.date.today() - datetime.timedelta(days=4)).isoformat()}",
        "order":  "date.desc",
    })

    profile_rows = sb_get("user_profiles", {"select": "*", "limit": "1"})
    profile      = profile_rows[0] if profile_rows else {}

    # ── Recent session history from actual logged workouts ───────────────────
    workout_log_rows = sb_get("workout_logs", {
        "select": "log_date,exercises,notes",
        "order": "log_date.desc",
        "limit": "21",
    })
    
    # Lower keywords are tested FIRST so "leg press" / "calf raise" / "leg extension"
    # don't get miscounted as upper by "press" / "raise" / "extension". Lower days are
    # further classified squat- vs hinge-primary by whichever compound pattern
    # dominates, so the downstream alternation can rotate squat ↔ hinge instead of
    # collapsing every lower day to "hinge". Mirrors classify_log_split in
    # generate_weekly_program.py — keep the two in sync.
    _LOWER_KW = ("squat", "deadlift", "rdl", "lunge", "calf", "leg press",
                 "leg extension", "leg curl", "hamstring", "hip thrust", "glute",
                 "trap bar", "good morning", "back extension", "nordic")
    _UPPER_KW = ("bench", "press", "pull-up", "pullup", "pulldown", "row", "curl",
                 "raise", "fly", "push-up", "pushup", "dip", "shrug", "overhead",
                 "triceps", "tricep", "bicep", "lat ", "delt", "chest", "shoulder",
                 "face pull", "neck")
    _SQUAT_KW = ("squat",)
    _HINGE_KW = ("deadlift", "rdl", "hinge", "hip thrust", "good morning",
                 "back extension", "trap bar", "nordic")

    def determine_split_from_log(log: dict) -> str:
        up = lo = squat = hinge = 0
        for ex in (log.get("exercises") or []):
            n = (ex.get("name") or "").lower()
            if any(k in n for k in _LOWER_KW):
                lo += 1
                if any(k in n for k in _SQUAT_KW):
                    squat += 1
                elif any(k in n for k in _HINGE_KW):
                    hinge += 1
            elif any(k in n for k in _UPPER_KW):
                up += 1
        if lo == 0 and up == 0:
            return ""
        if up > lo:
            return "upper_a"   # unified vocab with the weekly generator / _decide_split
        return "lower_squat_primary" if squat >= hinge else "lower_hinge_primary"

    # Dedup to one classification per calendar date, then order oldest→newest so
    # _decide_split's reversed() lookback sees the true most-recent logged session.
    _seen_dates = set()
    _classified = []   # most-recent-first
    for log in workout_log_rows:   # already ordered log_date.desc
        d = log.get("log_date")
        if d in _seen_dates:
            continue
        split = determine_split_from_log(log)
        if split:
            _seen_dates.add(d)
            _classified.append(split)
    recent_session_types = list(reversed(_classified))

    # Fallback to training prescription if no actual workouts have been logged
    if not recent_session_types:
        prescription_rows = sb_get("training_prescription", {
            "select": "date,mpc_action,session_type,prescription",
            "order":  "date.desc",
            "limit":  "7",
        })

        def determine_split_from_row(r: dict) -> str:
            pres = r.get("prescription") or {}
            if isinstance(pres, str):
                try: pres = json.loads(pres)
                except: pres = {}
            if "split" in pres and pres["split"]:
                return pres["split"].lower()
            s_type = (r.get("session_type") or r.get("mpc_action") or "").lower()
            if "upper" in s_type or "lower" in s_type:
                return s_type
            exercises = pres.get("exercises") or []
            upper_count = sum(1 for ex in exercises if any(k in ex.get("name", "").lower() for k in ["bench", "press", "pull-up", "pulldown", "row", "curl", "raise", "fly", "push-up", "dip"]))
            lower_count = sum(1 for ex in exercises if any(k in ex.get("name", "").lower() for k in ["squat", "deadlift", "rdl", "lunges", "calf", "leg press", "leg extension", "hip thrust"]))
            if upper_count > lower_count:
                return "upper_volume"
            elif lower_count > upper_count:
                return "lower_squat_primary"
            return s_type

        recent_session_types = [
            determine_split_from_row(r)
            for r in reversed(prescription_rows)
        ]

    # ── Restore engine state ──────────────────────────────────────────────────
    kalman_dict    = engine_params.get("kalman_state")    or {}
    cellular_dict  = engine_params.get("cellular_state")  or {}
    vdot_dict      = engine_params.get("vdot_state")      or {}
    guardrail_dict = engine_params.get("guardrail_state")  or {}

    kalman   = BanisterKalman.from_dict(kalman_dict)
    guardrail = SystemGuardrail.from_dict(guardrail_dict)

    # ── Current ACWR ─────────────────────────────────────────────────────────
    # Prefer the true ACWR computed in compute_athlete_state (acute 7d load /
    # chronic weekly avg). Fall back to the legacy reconstruction only if absent
    # (e.g. older state rows written before the fix).
    load_history  = build_load_history(athlete_rows)
    latest_fat    = (athlete_rows[0].get("fatigue") or {}) if athlete_rows else {}
    acwr          = latest_fat.get("acwr")
    if acwr is None:
        acwr = 1.0
        if len(load_history) >= 7:
            acute   = sum(load_history[-7:])  / 7.0
            chronic = sum(load_history[-28:]) / max(len(load_history[-28:]), 1)
            acwr    = acute / (chronic + 1e-5)
    acwr = float(acwr)

    # ── Overreaching check ────────────────────────────────────────────────────
    recovery_history = [
        (r.get("recovery") or {}).get("hrv") for r in reversed(athlete_rows)
    ]
    rhr_history = [
        (r.get("recovery") or {}).get("resting_hr") for r in reversed(athlete_rows)
    ]
    hrv_list = [v for v in recovery_history if v is not None][-7:]
    rhr_list = [v for v in rhr_history      if v is not None][-7:]
    overreach = guardrail.check_overreaching(hrv_list, rhr_list, acwr)

    # ── MPC action selection ──────────────────────────────────────────────────
    print(f"  Current ACWR={acwr:.2f}  overreaching={overreach['overreaching']}")
    print("  Evaluating candidate actions over 14-day horizon...")

    best_action, intensity, action_scores = select_action(
        kalman, guardrail, load_history, acwr,
        overreach["overreaching"],
    )

    if action_scores:
        sorted_scores = sorted(action_scores.items(), key=lambda x: x[1], reverse=True)
        for action, score in sorted_scores:
            marker = " ← SELECTED" if action == best_action else ""
            print(f"    {action:15s}  score={score:+.4f}{marker}")

    # ── Session generation ────────────────────────────────────────────────────
    # Reconstruct state objects for session generator
    from engine.cellular_model     import CellularInterferenceModel
    from engine.vdot_engine        import VDOTEngine
    from engine.nutrition_modulator import NutritionModulator

    cellular = CellularInterferenceModel.from_dict(cellular_dict)
    vdot_eng = VDOTEngine.from_dict(vdot_dict)

    maintenance_kcal = float(profile.get("maintenance_kcal") or 3200)
    nutrition_mod_obj = NutritionModulator(maintenance_kcal=maintenance_kcal)

    nutrition = (today_state.get("nutrition") or {})
    avg_kcal  = float(nutrition.get("avg_calories_7d") or maintenance_kcal)
    base_tau_fat = kalman.tau_fat
    base_mrv     = 16.0

    nutrition_mod_result = nutrition_mod_obj.modulate(avg_kcal, base_tau_fat, base_mrv)
    vdot_zones           = vdot_eng.pace_zones()

    # Quad soreness last 4 days
    quad_soreness = []
    for row in soreness_rows:
        if row.get("muscle_group", "").lower() in ("quads", "quad", "quadriceps"):
            quad_soreness.append(int(row.get("level") or 0))
    quad_soreness = (quad_soreness + [0, 0, 0, 0])[:4]
    mileage_cap = vdot_eng.mileage_cap(quad_soreness)

    # Latest soreness level per muscle group → per-muscle set trimming in the session.
    soreness_by_muscle: dict = {}
    for row in sorted(soreness_rows, key=lambda r: r.get("date", "") or r.get("created_at", "")):
        mg = (row.get("muscle_group") or "").lower().strip()
        if mg:
            soreness_by_muscle[mg] = int(row.get("level") or 0)  # last write wins (most recent)

    strength = (today_state.get("strength") or {})
    banister_state = kalman.state_dict()
    interference   = cellular.state_dict()

    # Plumbing fix (audit defect #3): the LEARNED weekly plan lives in weekly_plans,
    # written by the allocator off the personalized athlete_landmarks. Read it FIRST
    # so today's session is built from the SAME targets as the weekly program —
    # not the retired MILP / second volume engine, which could disagree.
    week_start = (datetime.date.today()
                  - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
    _wp = sb_get("weekly_plans", {
        "select": "set_targets,week_start", "order": "week_start.desc", "limit": "1"})
    weekly_set_targets = None
    if _wp and str(_wp[0].get("week_start")) == week_start:
        weekly_set_targets = _wp[0].get("set_targets") or None
        if weekly_set_targets:
            print(f"  Using LEARNED weekly plan from weekly_plans ({week_start})")

    # Fallbacks: engine_params synthesis_state, then on-the-fly synthesis.
    if not weekly_set_targets:
        weekly_set_targets = ((guardrail_dict or {}).get("synthesis_state") or {}).get("weekly_targets")
    if not weekly_set_targets:
        print("  WARN: weekly_targets not found in weekly_plans/engine_params. Synthesizing on-the-fly...")
        try:
            from engine.hypertrophy_volume import HypertrophyVolumeEngine, MUSCLES as MUSCLE_GROUPS
            from engine.program_synthesis  import ProgramSynthesisEngine
            from engine.exploration_manager  import ControlledExplorationManager
            from engine.resource_allocator   import (
                compute_reserve_score,
                allocate_constrained_resources,
            )
            
            volume_engine = HypertrophyVolumeEngine.from_dict(guardrail_dict.get("mrv_state") or {})
            exploration_manager = ControlledExplorationManager.from_dict(
                guardrail_dict.get("exploration_state") or {"parameters": MUSCLE_GROUPS}
            )
            step_count = int(guardrail_dict.get("step_count") or 0)
            
            hrv_z_3d = overreach.get("hrv_z_3d") or 0.0
            
            cardio_rows = sb_get("garmin_activities", {
                "select": "activity_date,duration_seconds,distance_meters",
                "activity_type": "eq.running",
                "order": "activity_date.desc", "limit": "7",
            })
            weekly_km = sum(float(r.get("distance_meters") or 0) / 1000.0 for r in cardio_rows)
            
            volume_engine.adjust_for_running(weekly_km)
            
            # Fetch caloric balance
            kcal_maintenance = float(profile.get("maintenance_kcal") or 3200.0)
            avg_cal = float(nutrition.get("avg_calories_7d") or nutrition.get("avg_daily_calories_7d") or kcal_maintenance)
            kcal_deficit = max(0.0, kcal_maintenance - avg_cal)
            if kcal_deficit > 0 and kcal_maintenance > 0:
                volume_engine.adjust_for_caloric_deficit(kcal_deficit, kcal_maintenance)
                
            mrv_dict = volume_engine.get_mrv_dict()
            
            # Apply UCB1 exploration delta
            exploration_delta = exploration_manager.get_exploration_delta(step_count)
            for muscle, extra in exploration_delta.items():
                base_mrv = volume_engine.landmarks.get(muscle, {}).get("MRV", mrv_dict.get(muscle, 18))
                mrv_dict[muscle] = min(mrv_dict.get(muscle, base_mrv) + extra, base_mrv + 2)
                
            reserve_score = compute_reserve_score(hrv_z_3d)
            user_prefs = {
                "max_daily_sets": int(os.environ.get("MAX_DAILY_SETS", 20)),
                "min_strength_days": 4,
            }
            synthesis_engine = ProgramSynthesisEngine(MUSCLE_GROUPS)
            allocation_matrix = synthesis_engine.synthesize_weekly_block(mrv_dict, user_prefs, acwr)
            allocation_matrix, alloc_metadata = allocate_constrained_resources(
                reserve_score, allocation_matrix, MUSCLE_GROUPS
            )
            weekly_set_targets = {
                m: int(allocation_matrix[mi].sum())
                for mi, m in enumerate(MUSCLE_GROUPS)
            }
            print(f"  Synthesized on-the-fly weekly targets: {weekly_set_targets}")
        except Exception as e:
            print(f"  ERROR: Failed to synthesize weekly targets on-the-fly: {e}. Using default landmarks fallback.")
            from engine.hypertrophy_volume import MUSCLES as MUSCLE_GROUPS
            weekly_set_targets = {m: 12 for m in MUSCLE_GROUPS}

    # Notes caution + learned exercise values so today's session reflects what
    # Nolan wrote and what's been learned about each movement (matches the weekly
    # generator). Notes are re-parsed here (cheap, deterministic); values are read
    # from the posterior the weekly run maintains.
    from engine.notes_parser import parse_workout_notes
    from engine.failure_reasons import parse_set_failures, format_sticking_summary
    _notes = parse_workout_notes(workout_log_rows, today_iso=TODAY)
    _caution = _notes["caution"]
    _weakness = dict(_notes["weakness"])   # sticking points → aim assistance
    # Structured set-level failure tags (higher confidence than parsed text) override.
    _fail_weakness = parse_set_failures(workout_log_rows, today_iso=str(TODAY))["weakness"]
    for _lift, _w in _fail_weakness.items():
        _weakness[_lift] = _w
    if (_sp := format_sticking_summary(_fail_weakness)):
        print(_sp)
    _ev_rows = sb_get("athlete_params", {
        "select": "meta", "param_key": "eq.exercise_values", "limit": "1"})
    _exercise_values = {
        n: float(v.get("mean", 0.0))
        for n, v in ((_ev_rows[0].get("meta") if _ev_rows else None) or {}).items()
    }
    if _notes["flags"]:
        print(f"  Notes signals today: {_notes['flags'][:5]}")

    # Athlete exercise preferences (user_profiles.exercise_preferences): same
    # block/prefer lists the weekly generator honors, so the daily card and the
    # weekly schedule surface the same movements (no Box Squat / Trap Bar, etc.).
    from engine.log_ingest import canon
    _ex_prefs     = profile.get("exercise_preferences") or {}
    _blocked_ex   = {canon(n) for n in (_ex_prefs.get("blocked") or [])}
    _preferred_ex = {canon(n) for n in (_ex_prefs.get("preferred") or [])}

    generator    = SessionGenerator()
    # Today's run slot AND split are decided by the weekly plan (adaptive placement +
    # learned allocation); read them so the daily prescription inherits the program
    # instead of recomputing. F8: passing the planned split as authoritative keeps the
    # daily card from contradicting the weekly plan on a deviation day (the two used
    # to classify the split independently, from different log views, and could fight).
    from engine.session_generator import split_from_title
    _today_plan = sb_get("program_workouts", {
        "select": "cardio_sessions,title", "created_by": f"eq.{USER_ID}",
        "scheduled_date": f"eq.{TODAY}", "limit": "1"})
    _today_run_slot = None
    _today_split = None
    if _today_plan:
        _cs = _today_plan[0].get("cardio_sessions") or []
        if _cs:
            _today_run_slot = _cs[0].get("run_type")
        _today_split = split_from_title(_today_plan[0].get("title"))
        if _today_split:
            print(f"  Inheriting planned split for today: {_today_split}")

    prescription = generator.generate(
        banister_state  = banister_state,
        interference    = interference,
        overreach       = overreach,
        acwr            = acwr,
        strength        = strength,
        latest_pst      = latest_pst,
        nutrition_mod   = nutrition_mod_result,
        vdot_zones      = vdot_zones,
        mileage_cap     = mileage_cap,
        mpc_action      = best_action,
        mpc_intensity   = intensity,
        weekly_set_targets = weekly_set_targets,
        recent_session_types = recent_session_types,
        soreness_by_muscle = soreness_by_muscle,
        phase = (today_state.get("nutrition") or {}).get("phase"),
        run_slot = _today_run_slot,
        exercise_values = _exercise_values,
        caution = _caution,
        weakness = _weakness,
        blocked_exercises = _blocked_ex,
        preferred_exercises = _preferred_ex,
        split_override = _today_split,
    )

    # ── Upsert to Supabase ────────────────────────────────────────────────────
    w_pst, w_str = deadline_weights()

    row = {
        "created_by":        USER_ID,
        "date":              TODAY,
        "session_type":      prescription.get("session_type"),
        "prescription":      prescription,
        "mpc_action":        best_action,
        "mpc_intensity":     intensity,
        "mpc_action_scores": action_scores,
        "w_pst":             w_pst,
        "w_str":             w_str,
        "acwr":              round(acwr, 3),
        "banister_state":    banister_state,
        "interference":      interference,
        "overreach":         overreach,
        "interference_warning": prescription.get("interference_warning"),
        "rationale":         prescription.get("rationale"),
        "computed_at":       datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    ok = sb_upsert("training_prescription", row)
    if ok:
        print(f"\n✓  Prescription written: {best_action} (intensity {intensity})")
        print(f"   Session type: {prescription.get('session_type')}")
        print(f"   Rationale: {prescription.get('rationale')}")
    else:
        print("\n✗  Failed to write prescription")
        sys.exit(1)


if __name__ == "__main__":
    main()
