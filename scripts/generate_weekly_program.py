#!/usr/bin/env python3
"""
generate_weekly_program.py — MPC-driven weekly program generator.

Loads today's athlete state and engine params, simulates forward through
the remaining days of the current week using the Banister Kalman model,
and upserts program_workouts for each day into the active program.

Run manually (mid-week) or on Sunday to program the following week.

Env vars:
    SUPABASE_URL (or VITE_SUPABASE_URL)
    SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
    USER_ID (optional — resolved from user_profiles if not set)
    DAYS_AHEAD (optional — override how many days to generate, default=rest of week)
"""

import os
import sys
import json
import math
import datetime
import urllib.request
import urllib.parse
import urllib.error

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
from engine.cellular_model     import CellularInterferenceModel
from engine.vdot_engine        import VDOTEngine
from engine.nutrition_modulator import NutritionModulator

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
USER_ID      = os.environ.get("USER_ID", "")
TODAY        = datetime.date.today()

if not all([SUPABASE_URL, SUPABASE_KEY]):
    print("ERROR: Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

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
    query = {**params}
    if "created_by" not in query:
        query["created_by"] = f"eq.{USER_ID}"
    qs  = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in query.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  WARN sb_get({table}): {e}")
        return []

def sb_upsert(table, row, on_conflict="id"):
    url  = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(row).encode()
    req  = urllib.request.Request(
        url, data=data, method="POST",
        headers=_headers({"Prefer": f"resolution=merge-duplicates,return=minimal"}),
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

def sb_delete_where(table, params):
    qs  = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in params.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, method="DELETE", headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except Exception as e:
        print(f"  WARN sb_delete({table}): {e}")
        return False

def resolve_user_id():
    url = f"{SUPABASE_URL}/rest/v1/user_profiles?select=created_by&limit=1"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read())
            if rows:
                return rows[0]["created_by"]
    except Exception as e:
        print(f"ERROR: Could not resolve USER_ID: {e}")
    sys.exit(1)


# ── Prescription → program_workout converter ──────────────────────────────────

def prescription_to_exercises(prescription: dict, sim_day: datetime.date) -> list:
    """
    Convert an MPC prescription dict into the exercises[] format
    used by program_workouts. Runs go in as exercise entries following
    the existing program convention.
    """
    exercises = []

    # Strength block
    sb = prescription.get("strength_block") or []
    for ex in sb:
        load_pct = float(ex.get("load_pct", 0.80))
        # Derive RIR from intensity: 0.95+ → RIR 1, 0.85-0.94 → RIR 2, <0.85 → RIR 3
        rir = 1 if load_pct >= 0.95 else (2 if load_pct >= 0.85 else 3)
        exercises.append({
            "name":         ex["name"].title(),
            "sets":         int(ex.get("sets", 3)),
            "rep_target":   str(ex.get("reps", "5")),
            "rir_target":   rir,
            "rest_seconds": 180,
            "notes":        f"e1RM ref: {ex.get('e1rm_ref')}lbs @ {round(load_pct*100)}%",
        })

    # Calisthenics block
    cb = prescription.get("calisthenics_block") or {}
    pu = cb.get("pullups")
    ps = cb.get("pushups")
    su = cb.get("situps")
    if pu:
        exercises.append({
            "name":         "Pull-Up",
            "sets":         int(pu.get("sets", 6)),
            "rep_target":   str(pu.get("reps_each", 6)),
            "rest_seconds": 60,
            "notes":        pu.get("note", "GTG — spread sets across the day."),
        })
    if ps:
        exercises.append({
            "name":         "Push-Up",
            "sets":         int(ps.get("sets", 5)),
            "rep_target":   str(ps.get("reps_each", 20)),
            "rest_seconds": 60,
        })
    if su:
        exercises.append({
            "name":         "Sit-Up",
            "sets":         int(su.get("sets", 5)),
            "rep_target":   str(su.get("reps_each", 20)),
            "rest_seconds": 45,
        })

    # Run block
    rb = prescription.get("run_block") or {}
    if rb:
        run_type = rb.get("type", "easy")
        if run_type == "intervals":
            reps = rb.get("reps", 6)
            dist = rb.get("distance_m", 400)
            rep_target = f"{reps}×{dist}m"
            note = f"Hard effort. {rb.get('pace', '')} pace. {rb.get('rest_seconds', 90)}s rest between reps. PM preferred."
        else:
            miles = rb.get("session_miles", 3.0)
            rep_target = f"{miles} miles"
            note = f"{rb.get('zone', 'Zone 2')}. {rb.get('pace', '')} pace. PM preferred."
        exercises.append({
            "name":         "Run",
            "sets":         1,
            "rep_target":   rep_target,
            "rest_seconds": 0,
            "notes":        note,
        })

    # Swim block
    swim = prescription.get("swim_block") or {}
    if swim:
        exercises.append({
            "name":         "Swim",
            "sets":         1,
            "rep_target":   f"{swim.get('meters', 500)}m",
            "rest_seconds": 0,
            "notes":        swim.get("note", "Easy pace. Time it."),
        })

    return exercises


def prescription_to_title(prescription: dict, sim_day: datetime.date) -> str:
    action      = prescription.get("mpc_action", "")
    session_type = prescription.get("session_type", "")
    day_name    = sim_day.strftime("%A")
    if action == "REST":
        return f"{day_name} — Rest"
    if action == "DELOAD":
        return f"{day_name} — Deload"
    if "two_a_day" in (session_type or "").lower():
        return f"{day_name} — Two-A-Day"
    if action == "STRENGTH":
        return f"{day_name} — Strength"
    if action == "CALISTHENICS":
        return f"{day_name} — Calisthenics + Conditioning"
    if action == "CARDIO":
        return f"{day_name} — Conditioning"
    return f"{day_name} — {action.title()}"


# ── MPC config (mirrors mpc_prescriber.py) ───────────────────────────────────

ACTION_TSS = {
    "REST":          0.0,
    "LIGHT":        25.0,
    "CARDIO":       55.0,
    "CALISTHENICS": 45.0,
    "STRENGTH":     70.0,
    "MIXED":        85.0,
    "TWO_A_DAY":   120.0,
    "DELOAD":       20.0,
}
HORIZON            = 14
PENALTY_FAT_SCALE  = 0.08
PENALTY_ACWR_SCALE = 2.00
FATIGUE_THRESHOLD  = 8.0
DEADLINE           = datetime.date(2026, 8, 31)
W_PST_BASE         = 0.50
W_STR_BASE         = 0.50

def deadline_weights():
    days_left = max(0, (DEADLINE - TODAY).days)
    urgency   = 1.0 - min(days_left / 90.0, 1.0)
    w_pst     = min(0.90, W_PST_BASE + urgency * 0.45)
    return round(w_pst, 3), round(1.0 - w_pst, 3)

def score_trajectory(traj, w_pst, w_str):
    fitness_score   = traj["final_fitness"] * (w_pst * 0.6 + w_str * 0.4)
    tsb_bonus       = max(0.0, traj["final_tsb"]) * 0.4
    excess_fatigue  = max(0.0, traj["final_fatigue"] - FATIGUE_THRESHOLD)
    fatigue_penalty = PENALTY_FAT_SCALE * (excess_fatigue ** 2)
    acwr_excess     = max(0.0, traj["max_acwr"] - 1.3)
    acwr_penalty    = PENALTY_ACWR_SCALE * (acwr_excess ** 2)
    return round(fitness_score + tsb_bonus - fatigue_penalty - acwr_penalty, 4)

def simulate_trajectory(kalman, action_today, load_history, days=HORIZON):
    default_rotation = [
        "STRENGTH","CARDIO","CALISTHENICS","REST",
        "STRENGTH","MIXED","CARDIO","REST",
        "STRENGTH","CALISTHENICS","CARDIO","LIGHT",
        "STRENGTH","REST",
    ]
    load_seq   = [ACTION_TSS[action_today]]
    for d in range(1, days):
        load_seq.append(ACTION_TSS[default_rotation[d % len(default_rotation)]])

    snapshots  = kalman.simulate_forward(load_seq)
    hist       = list(load_history[-28:]) + load_seq
    max_acwr   = 0.0
    for i in range(len(load_seq)):
        window = hist[max(0, len(load_history)-28+i): len(load_history)+i+1]
        if len(window) >= 7:
            acute   = sum(window[-7:]) / 7.0
            chronic = sum(window) / len(window)
            acwr    = acute / (chronic + 1e-5)
            max_acwr = max(max_acwr, acwr)

    final = snapshots[-1]
    return {
        "final_fitness":  final["fitness"],
        "final_fatigue":  final["fatigue"],
        "final_tsb":      final["tsb"],
        "final_perf":     final["perf"],
        "max_acwr":       round(max_acwr, 3),
    }

def select_action(kalman, guardrail, load_history, acwr, overreaching):
    if overreaching:
        return "REST", 0.7
    w_pst, w_str = deadline_weights()
    scores = {}
    for action in ACTION_TSS:
        traj          = simulate_trajectory(kalman, action, load_history)
        scores[action] = score_trajectory(traj, w_pst, w_str)
    ranked      = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    best_action = ranked[0][0]
    if acwr > 1.5 and best_action not in ["REST","DELOAD","LIGHT","CALISTHENICS","CARDIO"]:
        best_action = "LIGHT"
    tsb = float(kalman.x[0, 0] - kalman.x[1, 0])
    if   tsb > 10: intensity = 1.10
    elif tsb > 3:  intensity = 1.00
    elif tsb > -5: intensity = 0.90
    else:          intensity = 0.78
    return best_action, round(intensity, 2)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global USER_ID
    if not USER_ID:
        USER_ID = resolve_user_id()
        print(f"  Resolved USER_ID: {USER_ID}")

    # ── Determine days to generate ────────────────────────────────────────────
    days_ahead_env = int(os.environ.get("DAYS_AHEAD", 0))
    if days_ahead_env > 0:
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_ahead_env)]
    else:
        # Default: rest of this week (Mon=0 … Sun=6), starting today
        days_remaining = 6 - TODAY.weekday()  # days until end of week (Sunday)
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_remaining + 1)]

    print(f"=== generate_weekly_program  {TODAY} ===")
    print(f"  Generating for: {[d.isoformat() for d in days_to_generate]}")

    # ── Load engine state ─────────────────────────────────────────────────────
    engine_rows = sb_get("engine_params", {"select":"*","order":"date.desc","limit":"1"})
    engine      = engine_rows[0] if engine_rows else {}

    athlete_rows = sb_get("athlete_state", {
        "select": "date,fatigue,recovery,strength,endurance,nutrition",
        "order":  "date.desc",
        "limit":  "30",
    })
    today_state = athlete_rows[0] if athlete_rows else {}

    pst_rows   = sb_get("pst_tests", {"select":"*","order":"test_date.desc","limit":"1"})
    latest_pst = pst_rows[0] if pst_rows else {}

    profile_rows = sb_get("user_profiles", {"select":"*","limit":"1"})
    profile      = profile_rows[0] if profile_rows else {}

    soreness_rows = sb_get("soreness_logs", {
        "select": "date,muscle_group,soreness_level",
        "date":   f"gte.{(TODAY - datetime.timedelta(days=4)).isoformat()}",
        "order":  "date.desc",
    })

    # ── Restore engine objects ────────────────────────────────────────────────
    kalman    = BanisterKalman.from_dict(engine.get("kalman_state") or {})
    guardrail = SystemGuardrail.from_dict(engine.get("guardrail_state") or {})
    cellular  = CellularInterferenceModel.from_dict(engine.get("cellular_state") or {})
    vdot_eng  = VDOTEngine.from_dict(engine.get("vdot_state") or {})

    maintenance_kcal  = float(profile.get("maintenance_kcal") or 3200)
    nutrition_mod_obj = NutritionModulator(maintenance_kcal=maintenance_kcal)
    nutrition         = today_state.get("nutrition") or {}
    avg_kcal          = float(nutrition.get("avg_calories_7d") or maintenance_kcal)
    nutrition_mod     = nutrition_mod_obj.modulate(avg_kcal, kalman.tau_fat, 16.0)
    vdot_zones        = vdot_eng.pace_zones()

    quad_soreness = []
    for row in soreness_rows:
        if row.get("muscle_group", "").lower() in ("quads","quad","quadriceps"):
            quad_soreness.append(int(row.get("soreness_level") or 0))
    quad_soreness = (quad_soreness + [0,0,0,0])[:4]
    mileage_cap   = vdot_eng.mileage_cap(quad_soreness)

    strength = today_state.get("strength") or {}

    # Build load history for ACWR
    load_history = []
    for row in reversed(athlete_rows):
        atl = (row.get("fatigue") or {}).get("atl")
        load_history.append(float(atl) if atl is not None else 0.0)

    # ── Find active program ───────────────────────────────────────────────────
    programs = sb_get("programs", {"select":"*","order":"created_at.desc","limit":"5"})
    enrollments = sb_get("program_enrollments", {
        "select": "*",
        "status": "eq.active",
        "limit":  "1",
    })
    if not enrollments:
        print("ERROR: No active program enrollment found.")
        sys.exit(1)

    enrollment  = enrollments[0]
    program_id  = enrollment["program_id"]
    current_week = int(enrollment.get("current_week") or 1)
    print(f"  Active program: {program_id} | Week {current_week}")

    # ── Generate a prescription for each day and write program_workouts ───────
    generator = SessionGenerator()

    # Simulate Kalman forward so each day uses a projected state
    # Day 0 = today (use actual state), days 1+ = projected
    for i, sim_day in enumerate(days_to_generate):
        day_name    = sim_day.strftime("%A")
        weekday     = sim_day.weekday()  # 0=Mon … 6=Sun
        day_index   = weekday + 1        # program uses 1=Mon … 7=Sun

        print(f"\n  [{sim_day}] {day_name} (day_index={day_index})")

        # ACWR for this simulated day
        acwr = 1.0
        if len(load_history) >= 7:
            acute   = sum(load_history[-7:])  / 7.0
            chronic = sum(load_history[-28:]) / max(len(load_history[-28:]), 1)
            acwr    = acute / (chronic + 1e-5)

        hrv_list = []
        rhr_list = []
        overreach = guardrail.check_overreaching(hrv_list, rhr_list, acwr)

        # Select action for this day
        best_action, intensity = select_action(
            kalman, guardrail, load_history, acwr, overreach["overreaching"]
        )

        # Build prescription
        banister_state = kalman.state_dict()
        interference   = cellular.state_dict()

        prescription = generator.generate(
            banister_state  = banister_state,
            interference    = interference,
            overreach       = overreach,
            acwr            = acwr,
            strength        = strength,
            latest_pst      = latest_pst,
            nutrition_mod   = nutrition_mod,
            vdot_zones      = vdot_zones,
            mileage_cap     = mileage_cap,
            mpc_action      = best_action,
            mpc_intensity   = intensity,
        )

        print(f"    Action={best_action}  intensity={intensity}  session={prescription.get('session_type')}")
        print(f"    {prescription.get('rationale','')[:80]}")

        # Convert prescription to exercises[]
        exercises = prescription_to_exercises(prescription, sim_day)
        title     = prescription_to_title(prescription, sim_day)

        if not exercises:
            exercises = [{"name": "Rest / Active Recovery", "sets": 1, "rep_target": "—",
                          "rest_seconds": 0, "notes": prescription.get("rationale", "")}]

        # Delete existing program_workout for this day/week to allow overwrite
        existing = sb_get("program_workouts", {
            "select":       "id",
            "program_id":   f"eq.{program_id}",
            "week_number":  f"eq.{current_week}",
            "day_index":    f"eq.{day_index}",
            "created_by":   f"eq.{USER_ID}",
        })
        for row in existing:
            sb_delete_where("program_workouts", {
                "id":         f"eq.{row['id']}",
                "created_by": f"eq.{USER_ID}",
            })

        # Insert new program_workout
        pw_row = {
            "program_id":       program_id,
            "created_by":       USER_ID,
            "title":            title,
            "focus":            "strength" if best_action in ("STRENGTH","TWO_A_DAY","MIXED") else "conditioning",
            "week_number":      current_week,
            "day_index":        day_index,
            "day_of_week":      weekday,
            "exercises":        exercises,
            "duration_minutes": None,
        }
        ok = sb_upsert("program_workouts", pw_row, on_conflict="program_id,week_number,day_index")
        print(f"    {'✓' if ok else '✗'}  Wrote {len(exercises)} exercises to program_workouts")

        # Advance Kalman state for next day's simulation using this day's projected load
        projected_tss = ACTION_TSS.get(best_action, 50.0)
        kalman.step(projected_tss, None)  # no observation for future days
        load_history.append(projected_tss)
        guardrail.record_state(overreach["fatigue_state"])

    print(f"\n✓  Weekly program written for {len(days_to_generate)} days")


if __name__ == "__main__":
    main()
