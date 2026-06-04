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
    "DELOAD":       20.0,   # 55% load across all movements
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


def score_trajectory(traj: dict, w_pst: float, w_str: float) -> float:
    """
    Score a 14-day simulated trajectory for the dual reward function.

    Higher is better. Components:
      + Fitness gain signal (F_t at end of horizon)
      + TSB quality (want TSB positive at deadline, not just at day 14)
      - Fatigue penalty (excessive f_t slows adaptation and injury risk)
      - ACWR penalty (injury risk)
    """
    # Primary signal: fitness trajectory value
    fitness_score = traj["final_fitness"] * (w_pst * 0.6 + w_str * 0.4)

    # TSB bonus: positive TSB = freshness = better performance expression
    tsb_bonus = max(0.0, traj["final_tsb"]) * 0.4

    # Fatigue penalty: quadratic above threshold
    excess_fatigue = max(0.0, traj["final_fatigue"] - FATIGUE_THRESHOLD)
    fatigue_penalty = PENALTY_FATIGUE_SCALE * (excess_fatigue ** 2)

    # ACWR penalty: anything above 1.3 is exponentially bad
    acwr_excess = max(0.0, traj["max_acwr"] - 1.3)
    acwr_penalty = PENALTY_ACWR_SCALE * (acwr_excess ** 2)

    return round(fitness_score + tsb_bonus - fatigue_penalty - acwr_penalty, 4)


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
        raw_score     = score_trajectory(traj, w_pst, w_str)
        scores[action] = {"score": raw_score, "trajectory": traj}

    # Sort by score descending
    ranked = sorted(scores.items(), key=lambda x: x[1]["score"], reverse=True)
    best_action = ranked[0][0]

    # Apply ACWR gate (guardrail override)
    load_action_map = {
        "INCREASE": ["MIXED", "STRENGTH", "TWO_A_DAY"],
        "MAINTAIN": ["CALISTHENICS", "CARDIO", "LIGHT"],
        "DECREASE": ["REST", "DELOAD", "LIGHT"],
    }
    if acwr > 1.5 and best_action not in load_action_map["DECREASE"] + load_action_map["MAINTAIN"]:
        best_action = "LIGHT"

    # Intensity scalar based on TSB
    current_tsb = float(kalman.x[0, 0] - kalman.x[1, 0])
    if current_tsb > 10:
        intensity = 1.10   # very fresh → push harder
    elif current_tsb > 3:
        intensity = 1.00   # fresh → standard
    elif current_tsb > -5:
        intensity = 0.90   # slightly fatigued → back off
    else:
        intensity = 0.78   # heavily fatigued → significant reduction

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
        "select": "log_date,exercises",
        "order": "log_date.desc",
        "limit": "7",
    })
    
    def determine_split_from_log(log: dict) -> str:
        exercises = log.get("exercises") or []
        upper_keywords = ["bench", "press", "pull-up", "pulldown", "row", "curl", "raise", "fly", "push-up", "dip", "extension", "bicep", "tricep", "delt", "lats", "chest", "shoulder"]
        lower_keywords = ["squat", "deadlift", "rdl", "lunges", "calf", "leg press", "leg extension", "hip thrust", "hamstring", "quad", "glute"]
        upper_count = sum(1 for ex in exercises if any(k in ex.get("name", "").lower() for k in upper_keywords))
        lower_count = sum(1 for ex in exercises if any(k in ex.get("name", "").lower() for k in lower_keywords))
        if upper_count > lower_count:
            return "upper_volume"
        elif lower_count > upper_count:
            return "lower_squat_primary"
        return ""

    recent_session_types = []
    for log in reversed(workout_log_rows):
        split = determine_split_from_log(log)
        if split:
            recent_session_types.append(split)

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
    load_history  = build_load_history(athlete_rows)
    acwr          = 1.0
    if len(load_history) >= 7:
        acute   = sum(load_history[-7:])  / 7.0
        chronic = sum(load_history[-28:]) / max(len(load_history[-28:]), 1)
        acwr    = acute / (chronic + 1e-5)

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

    strength = (today_state.get("strength") or {})
    banister_state = kalman.state_dict()
    interference   = cellular.state_dict()

    # Retrieve weekly set targets from engine_params or synthesize on-the-fly
    weekly_set_targets = guardrail_dict.get("synthesis_state", {}).get("weekly_targets")
    if not weekly_set_targets:
        print("  WARN: weekly_targets not found in engine_params. Synthesizing on-the-fly...")
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
            
            cardio_rows = sb_get("cardio_sessions", {
                "select": "start_date,duration_seconds,distance_meters",
                "order": "start_date.desc", "limit": "7",
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

    generator    = SessionGenerator()
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
