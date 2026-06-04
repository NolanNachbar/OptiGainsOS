#!/usr/bin/env python3
"""
generate_weekly_program.py — MPC-driven weekly program generator.

Uses your existing Week 1 workout templates as the base structure and
applies MPC intensity scaling on top. This preserves the program design
(Upper Max Effort on Fri, Lower Light + Long Run on Sat, etc.) while
letting the engine manage load based on current athlete state.

The MPC selects a day-level action (STRENGTH / DELOAD / REST / etc.) and
an intensity scalar (0.7–1.1). That scalar modifies:
  - rep_target on the back-off sets (±1-2 reps)
  - RIR targets (+1 if fatigued, -1 if fresh)
  - Set counts (deload: -1 set, fresh: +1 set on primaries)
  - Notes annotated with today's load context

Run via GitHub Actions → Generate Weekly Program → Run workflow.
Set DAYS_AHEAD=7 to program the full next week (Sunday cron does this).
Default (DAYS_AHEAD=0): programs remaining days of the current week.
"""

import os
import sys
import json
import datetime
import urllib.request
import urllib.parse
import urllib.error
import copy

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


# ── Template modifier — core of the approach ─────────────────────────────────

def _parse_reps(rep_target: str) -> tuple:
    """Parse '5', '3-5', '8-12', 'Max', '1→7→1', '25-30 min' → (lo, hi, is_range, raw)."""
    raw = str(rep_target).strip()
    if "-" in raw and "min" not in raw.lower():
        parts = raw.split("-")
        try:
            lo, hi = int(parts[0]), int(parts[1])
            return lo, hi, True, raw
        except ValueError:
            pass
    try:
        v = int(raw)
        return v, v, False, raw
    except ValueError:
        return None, None, False, raw  # non-numeric (Max, pyramid, min, etc.)


def apply_mpc_to_exercises(exercises: list, action: str, intensity: float) -> list:
    """
    Scale the template exercises based on MPC action + intensity scalar.

    Intensity scalar interpretation:
      1.10 → very fresh, push: +1 rep on working sets, RIR -1
      1.00 → standard: no change
      0.90 → slightly fatigued: +1 RIR, note to stay conservative
      0.78 → heavily fatigued: +2 RIR, -1 set on accessories, flag recovery
    """
    result = []
    for ex in exercises:
        ex = copy.deepcopy(ex)
        name  = (ex.get("name") or "").lower()
        notes = ex.get("notes") or ""
        lo, hi, is_range, raw_reps = _parse_reps(ex.get("rep_target", ""))
        rir   = ex.get("rir_target")
        sets  = int(ex.get("sets") or 1)

        # Skip modifying run/swim/active recovery entries
        is_cardio = any(k in name for k in ("run","swim","cardio","zone","active recovery","sprint"))
        if is_cardio:
            result.append(ex)
            continue

        # ── REST day: keep structure but flag as optional ──────────────────
        if action == "REST":
            ex["notes"] = "REST DAY — skip unless feeling genuinely good."
            result.append(ex)
            continue

        # ── DELOAD: reduce load, cut accessories ──────────────────────────
        if action == "DELOAD":
            if "daily single" in name or "top set" in name or "max effort" in name:
                ex["notes"] = (notes + " DELOAD: hit daily single at comfortable weight, no max attempt.").strip()
            elif "back-off" in name or "speed work" in name:
                ex["sets"]      = max(1, sets - 1)
                ex["rep_target"] = str(lo) if lo else raw_reps
                if rir is not None:
                    ex["rir_target"] = min(rir + 2, 4)
                ex["notes"] = (notes + f" DELOAD week: -{1} set, conservative load.").strip()
            else:
                # Accessories: drop 1 set
                ex["sets"] = max(1, sets - 1)
                if rir is not None:
                    ex["rir_target"] = min(rir + 1, 4)
            result.append(ex)
            continue

        # ── Normal intensity scaling ───────────────────────────────────────
        if intensity >= 1.05:
            # Very fresh — push rep targets up, reduce RIR
            if is_range and lo and hi:
                ex["rep_target"] = f"{lo}-{hi + 1}"
            if rir is not None:
                ex["rir_target"] = max(0, rir - 1)
            if "daily single" in name or "top set" in name:
                ex["notes"] = (notes + " Feeling fresh — push the single.").strip()

        elif intensity >= 0.95:
            # Standard — no change
            pass

        elif intensity >= 0.85:
            # Slightly fatigued — conservative
            if rir is not None:
                ex["rir_target"] = min(rir + 1, 4)
            if "daily single" in name or "top set" in name:
                ex["notes"] = (notes + " Stay conservative on the single today.").strip()

        else:
            # Heavily fatigued (intensity < 0.85)
            if is_range and lo and hi:
                ex["rep_target"] = f"{lo}-{max(lo, hi - 1)}"
            if rir is not None:
                ex["rir_target"] = min(rir + 2, 4)
            # Cut 1 accessory set when deeply fatigued
            if rir is not None and rir <= 2 and "daily single" not in name:
                ex["sets"] = max(1, sets - 1)
            if "daily single" in name or "top set" in name:
                ex["notes"] = (notes + " High fatigue — treat as technique single, not a max.").strip()
            elif "back-off" in name:
                ex["notes"] = (notes + " Back off 5-10% from normal working weight today.").strip()

        result.append(ex)
    return result


def mpc_title_suffix(action: str, intensity: float) -> str:
    if action == "REST":    return " (Rest)"
    if action == "DELOAD":  return " (Deload)"
    if intensity >= 1.05:   return " ↑ Push"
    if intensity >= 0.95:   return ""
    if intensity >= 0.85:   return " → Steady"
    return " ↓ Back Off"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global USER_ID
    if not USER_ID:
        USER_ID = resolve_user_id()
        print(f"  Resolved USER_ID: {USER_ID}")

    # ── Days to generate ──────────────────────────────────────────────────────
    days_ahead_env = int(os.environ.get("DAYS_AHEAD", 0))
    if days_ahead_env > 0:
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_ahead_env)]
    else:
        days_remaining   = 6 - TODAY.weekday()
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_remaining + 1)]

    print(f"=== generate_weekly_program  {TODAY} ===")
    print(f"  Generating for: {[d.isoformat() for d in days_to_generate]}")

    # ── Load state ────────────────────────────────────────────────────────────
    engine_rows  = sb_get("engine_params", {
        "select": "*", "order": "date.desc", "limit": "1",
        "created_by": f"eq.{USER_ID}",
    })
    engine = engine_rows[0] if engine_rows else {}

    athlete_rows = sb_get("athlete_state", {
        "select": "date,fatigue,recovery", "order": "date.desc", "limit": "30",
        "created_by": f"eq.{USER_ID}",
    })

    kalman    = BanisterKalman.from_dict(engine.get("kalman_state") or {})
    guardrail = SystemGuardrail.from_dict(engine.get("guardrail_state") or {})

    load_history = []
    for row in reversed(athlete_rows):
        atl = (row.get("fatigue") or {}).get("atl")
        load_history.append(float(atl) if atl is not None else 0.0)

    # ── Find active enrollment + program ──────────────────────────────────────
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
    print(f"  Program: {program_id} | Enrollment week: {current_week}")

    # Load the week 1 templates (canonical base structure)
    templates = sb_get("program_workouts", {
        "select":       "*",
        "program_id":   f"eq.{program_id}",
        "week_number":  "eq.1",
        "created_by":   f"eq.{USER_ID}",
        "order":        "day_index.asc",
    })
    template_by_day = {int(t["day_index"]): t for t in templates}
    print(f"  Loaded {len(templates)} week-1 templates (day_index 1–{max(template_by_day) if template_by_day else '?'})")

    # ── Generate each day ─────────────────────────────────────────────────────
    for sim_day in days_to_generate:
        weekday   = sim_day.weekday()       # 0=Mon … 6=Sun
        day_index = weekday + 1             # program uses 1=Mon … 7=Sun
        day_name  = sim_day.strftime("%A")

        # ACWR for this simulated day
        acwr = 1.0
        if len(load_history) >= 7:
            acute   = sum(load_history[-7:])  / 7.0
            chronic = sum(load_history[-28:]) / max(len(load_history[-28:]), 1)
            acwr    = acute / (chronic + 1e-5)

        hrv_hist = []
        rhr_hist = []
        overreach = guardrail.check_overreaching(hrv_hist, rhr_hist, acwr)

        action, intensity = select_action(
            kalman, load_history, acwr, overreach["overreaching"]
        )

        print(f"\n  [{sim_day}] {day_name} (day_index={day_index})")
        print(f"    MPC: {action}  intensity={intensity}  ACWR={acwr:.2f}  overreach={overreach['overreaching']}")

        # Get the template for this day
        template = template_by_day.get(day_index)
        if not template:
            print(f"    WARN: No week-1 template found for day_index={day_index}, skipping.")
            continue

        # Apply MPC scaling to template exercises
        base_exercises = template.get("exercises") or []
        scaled         = apply_mpc_to_exercises(base_exercises, action, intensity)
        suffix         = mpc_title_suffix(action, intensity)
        title          = (template.get("title") or day_name) + suffix

        pw_row = {
            "program_id":       program_id,
            "created_by":       USER_ID,
            "title":            title,
            "focus":            template.get("focus", "strength"),
            "week_number":      current_week,
            "day_index":        day_index,
            "day_of_week":      weekday,
            "scheduled_date":   sim_day.isoformat(),
            "exercises":        scaled,
            "cardio_sessions":  template.get("cardio_sessions") or [],
            "duration_minutes": template.get("duration_minutes"),
        }

        ok = sb_upsert("program_workouts", pw_row)
        print(f"    {'✓' if ok else '✗'}  '{title}' — {len(scaled)} exercises")

        # Advance Kalman state for next simulated day
        projected_tss = ACTION_TSS.get(action, 50.0)
        kalman.step(projected_tss, None)
        load_history.append(projected_tss)
        guardrail.record_state(overreach["fatigue_state"])

    print(f"\n✓  Done — {len(days_to_generate)} days written")


if __name__ == "__main__":
    main()
