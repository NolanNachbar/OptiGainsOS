#!/usr/bin/env python3
"""
generate_weekly_program.py — Full engine-driven weekly program generator.

Uses the complete athlete state — Kalman fitness/fatigue, cellular AMPK/mTORC1
interference, recent session history, and cumulative cardio load — to generate
workouts from first principles rather than fixed templates.

Decision hierarchy per day:
  1. MPC forward simulation → action (STRENGTH / TWO_A_DAY / DELOAD / REST / etc.)
  2. Kalman TSB → intensity scalar [0.7–1.1]
  3. AMPK/mTORC1 → split selection (upper vs lower) + cardio zone
  4. Recent session history → prevents repeating same split consecutively
  5. 7-day run TSS → aerobic volume management

Cardio uses Garmin HR zones (Z1–Z5), not pace targets.

Run via GitHub Actions → Generate Weekly Program → Run workflow.
Default (DAYS_AHEAD=0): programs remaining days of the current week.
Sunday cron runs with DAYS_AHEAD=0 on Monday → programs full week.
"""

import os
import sys
import json
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
from engine.banister_kalman import BanisterKalman
from engine.guardrail       import SystemGuardrail
from engine.session_generator import generate as gen_session, get_split, build_title

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
    qs  = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in params.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  WARN sb_get({table}): {e}")
        return []

def sb_upsert(table, row):
    url  = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=program_id,scheduled_date"
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


# ── MPC action selection (mirrors mpc_prescriber.py) ─────────────────────────

ACTION_TSS = {
    "REST": 0.0, "LIGHT": 25.0, "CARDIO": 55.0, "CALISTHENICS": 45.0,
    "STRENGTH": 70.0, "MIXED": 85.0, "TWO_A_DAY": 120.0, "DELOAD": 20.0,
}
DEADLINE = datetime.date(2026, 8, 31)

def deadline_weights():
    days_left = max(0, (DEADLINE - TODAY).days)
    urgency   = 1.0 - min(days_left / 90.0, 1.0)
    w_pst     = min(0.90, 0.50 + urgency * 0.45)
    return round(w_pst, 3), round(1.0 - w_pst, 3)

def simulate_and_score(kalman, action, load_history, w_pst, w_str):
    default = ["STRENGTH","CARDIO","CALISTHENICS","REST","STRENGTH","MIXED","CARDIO","REST",
               "STRENGTH","CALISTHENICS","CARDIO","LIGHT","STRENGTH","REST"]
    load_seq = [ACTION_TSS[action]] + [ACTION_TSS[default[d % len(default)]] for d in range(1, 14)]
    snaps    = kalman.simulate_forward(load_seq)
    hist     = list(load_history[-28:]) + load_seq
    max_acwr = 0.0
    for i in range(len(load_seq)):
        win = hist[max(0, len(load_history)-28+i): len(load_history)+i+1]
        if len(win) >= 7:
            acwr = (sum(win[-7:])/7.0) / (sum(win)/len(win) + 1e-5)
            max_acwr = max(max_acwr, acwr)
    f    = snaps[-1]
    fs   = f["fitness"] * (w_pst * 0.6 + w_str * 0.4)
    tb   = max(0.0, f["tsb"]) * 0.4
    fp   = 0.08 * (max(0.0, f["fatigue"] - 8.0) ** 2)
    ap   = 2.00 * (max(0.0, max_acwr - 1.3) ** 2)
    return round(fs + tb - fp - ap, 4)

def select_action(kalman, load_history, acwr, overreaching):
    if overreaching:
        return "REST", 0.7
    w_pst, w_str = deadline_weights()
    scores      = {a: simulate_and_score(kalman, a, load_history, w_pst, w_str) for a in ACTION_TSS}
    best        = max(scores, key=scores.get)
    if acwr > 1.5 and best not in ("REST","DELOAD","LIGHT","CALISTHENICS","CARDIO"):
        best = "LIGHT"
    tsb = float(kalman.x[0, 0] - kalman.x[1, 0])
    intensity = 1.10 if tsb > 10 else (1.00 if tsb > 3 else (0.90 if tsb > -5 else 0.78))
    return best, round(intensity, 2)



# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global USER_ID
    if not USER_ID:
        USER_ID = resolve_user_id()
        print(f"  Resolved USER_ID: {USER_ID}")

    days_ahead_env = int(os.environ.get("DAYS_AHEAD", 0))
    if days_ahead_env > 0:
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_ahead_env)]
    else:
        days_remaining   = 6 - TODAY.weekday()
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_remaining + 1)]

    print(f"=== generate_weekly_program  {TODAY} ===")
    print(f"  Generating for: {[d.isoformat() for d in days_to_generate]}")

    # ── Load engine state ─────────────────────────────────────────────────────
    engine_rows = sb_get("engine_params", {
        "select": "*", "order": "date.desc", "limit": "1",
        "created_by": f"eq.{USER_ID}",
    })
    engine = engine_rows[0] if engine_rows else {}

    athlete_rows = sb_get("athlete_state", {
        "select": "date,fatigue,recovery,cellular_state,vdot",
        "order": "date.desc", "limit": "30",
        "created_by": f"eq.{USER_ID}",
    })

    kalman    = BanisterKalman.from_dict(engine.get("kalman_state") or {})
    guardrail = SystemGuardrail.from_dict(engine.get("guardrail_state") or {})

    load_history = []
    for row in reversed(athlete_rows):
        atl = (row.get("fatigue") or {}).get("atl")
        load_history.append(float(atl) if atl is not None else 0.0)

    # Current cellular state (AMPK/mTORC1) from most recent athlete_state
    latest_athlete = athlete_rows[0] if athlete_rows else {}
    cellular_state = latest_athlete.get("cellular_state") or {}
    vdot           = latest_athlete.get("vdot")

    # ── Recent session history (for split decision) ───────────────────────────
    # Read last 7 days of training_prescription for session type history
    prescription_rows = sb_get("training_prescription", {
        "select": "date,action,session_type",
        "created_by": f"eq.{USER_ID}",
        "order": "date.desc", "limit": "7",
    })
    # Build list of recent session focus strings, oldest first
    recent_session_types = [
        (r.get("session_type") or r.get("action") or "").lower()
        for r in reversed(prescription_rows)
    ]

    # ── Recent cardio TSS (for aerobic load management) ───────────────────────
    cardio_rows = sb_get("cardio_sessions", {
        "select": "tss,start_date",
        "created_by": f"eq.{USER_ID}",
        "order": "start_date.desc", "limit": "7",
    })
    recent_run_tss = sum(float(r.get("tss") or 0) for r in cardio_rows)

    # ── Enrollment ────────────────────────────────────────────────────────────
    enrollments = sb_get("program_enrollments", {
        "select": "*", "status": "eq.active", "limit": "1",
        "created_by": f"eq.{USER_ID}",
    })
    if not enrollments:
        print("ERROR: No active program enrollment.")
        sys.exit(1)

    enrollment   = enrollments[0]
    program_id   = enrollment["program_id"]
    current_week = int(enrollment.get("current_week") or 1)
    cycle_length = int(enrollment.get("days_per_week") or 7)

    raw_start        = enrollment.get("started_at") or enrollment.get("start_date") or ""
    enrollment_start = datetime.date.fromisoformat(raw_start[:10])

    print(f"  Program: {program_id} | Week: {current_week} | Start: {enrollment_start}")
    print(f"  Cellular — AMPK: {cellular_state.get('ampk', 'n/a'):.2f}  mTORC1: {cellular_state.get('mtorc1', 'n/a'):.2f}" if cellular_state else "  Cellular state: none yet")
    print(f"  Recent session types: {recent_session_types}")
    print(f"  7-day run TSS: {recent_run_tss:.1f}")

    # ── Generate each day ─────────────────────────────────────────────────────
    for sim_day in days_to_generate:
        day_name = sim_day.strftime("%A")

        # day_index matches frontend getProgramSchedule:
        #   date = addDays(anchor, cycleStartOffset + (day_index - 1))
        days_since_start = (sim_day - enrollment_start).days
        day_index        = (days_since_start % cycle_length) + 1

        # ACWR
        acwr = 1.0
        if len(load_history) >= 7:
            acute   = sum(load_history[-7:])  / 7.0
            chronic = sum(load_history[-28:]) / max(len(load_history[-28:]), 1)
            acwr    = acute / (chronic + 1e-5)

        overreach = guardrail.check_overreaching([], [], acwr)
        action, intensity = select_action(kalman, load_history, acwr, overreach["overreaching"])

        # Forward-step cellular state (simple decay approximation for future days)
        sim_cellular = dict(cellular_state)
        days_ahead = (sim_day - TODAY).days
        if days_ahead > 0 and sim_cellular:
            decay = 0.85 ** days_ahead  # ~15%/day decay toward baseline
            sim_cellular = {
                "ampk":              float(sim_cellular.get("ampk", 0.2)) * decay,
                "mtorc1":            min(0.8, float(sim_cellular.get("mtorc1", 0.3)) + (1 - decay) * 0.3),
                "interference_score": float(sim_cellular.get("interference_score", 0.1)) * decay,
            }

        # Generate session using full engine state
        exercises, cardio = gen_session(
            action=action,
            intensity=intensity,
            sim_date=sim_day,
            cellular_state=sim_cellular,
            recent_session_types=recent_session_types,
            recent_run_tss=recent_run_tss,
            vdot=vdot,
        )

        split = get_split(action, intensity, sim_day, sim_cellular, recent_session_types)
        title = build_title(action, split, intensity)

        print(f"\n  [{sim_day}] {day_name} (day_index={day_index})")
        print(f"    MPC: {action}  intensity={intensity}  ACWR={acwr:.2f}  split={split}")
        print(f"    AMPK={sim_cellular.get('ampk', 0):.2f}  mTORC1={sim_cellular.get('mtorc1', 0):.2f}")

        pw_row = {
            "program_id":       program_id,
            "created_by":       USER_ID,
            "title":            title,
            "focus":            "strength" if action not in ("CARDIO",) else "cardio",
            "week_number":      current_week,
            "day_index":        day_index,
            "day_of_week":      sim_day.weekday(),
            "scheduled_date":   sim_day.isoformat(),
            "exercises":        exercises,
            "cardio_sessions":  cardio,
            "duration_minutes": None,
        }

        ok = sb_upsert("program_workouts", pw_row)
        print(f"    {'✓' if ok else '✗'}  '{title}' — {len(exercises)} exercises + {len(cardio)} cardio")

        # Update recent session types for next day's split decision
        recent_session_types.append(split)
        if len(recent_session_types) > 7:
            recent_session_types.pop(0)

        # Update aerobic load estimate
        if cardio:
            recent_run_tss += ACTION_TSS.get(action, 0) * 0.5  # rough proxy

        # Advance Kalman + guardrail
        projected_tss = ACTION_TSS.get(action, 50.0)
        kalman.step(projected_tss, None)
        load_history.append(projected_tss)
        guardrail.record_state(overreach["fatigue_state"])

    print(f"\n✓  Done — {len(days_to_generate)} days written")


if __name__ == "__main__":
    main()
