#!/usr/bin/env python3
"""
generate_weekly_program.py — Full engine-driven weekly program generator.

Architecture:
  State Estimation (Kalman) → Program Synthesis (MILP) → Session Generation → DB

Engine layers:
  - BanisterKalman        : fitness/fatigue tracking
  - SystemGuardrail       : overreaching detection
  - HypertrophyVolumeEngine: MEV/MAV/MRV per muscle
  - ProgramSynthesisEngine : MILP weekly allocation
  - StrengthProgressionRegistry: e1RM trend → load commands
  - ControlledExplorationManager: UCB1 volume probing
  - ResourceAllocator     : reserve-based volume scaling

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
from engine.banister_kalman    import BanisterKalman
from engine.guardrail          import SystemGuardrail
from engine.session_generator  import generate as gen_session, get_split, build_title, pick_run_slot
from engine.hypertrophy_volume import HypertrophyVolumeEngine, MUSCLES as MUSCLE_GROUPS
from engine.allocator          import plan_week, default_goal_priorities
from engine.athlete_profile    import MUSCLE_EMPHASIS
from engine.hypertrophy_volume import LANDMARK_PRIORS
from engine.learners           import update_mrv, update_frequency, best_frequency, apply_mrv_observation
from engine.controlled_tests   import (
    get_active, pick_volume_test_muscle, can_schedule, schedule_volume_test,
    ramp_target, step_volume_test, should_schedule_pst, schedule_pst_diagnostic,
)
from engine.strength_progression import StrengthProgressionRegistry, compute_trend_slope
from engine.log_ingest           import normalize_workout_logs, populate_registry, GOAL_LIFTS, canon
from engine.notes_parser         import parse_workout_notes
from engine.deviation_tracker    import track_deviations
from engine.learners             import update_exercise_value, exercise_reward
from engine.muscle_map           import hypertrophy_muscles, soreness_by_muscle
from engine.exploration_manager  import ControlledExplorationManager
from engine.resource_allocator   import (
    compute_reserve_score,
    evaluate_two_a_day_split,
)

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

def sb_upsert(table, row, conflict_cols="program_id,scheduled_date"):
    url  = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={conflict_cols}"
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

def sb_insert(table, row):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    req = urllib.request.Request(url, data=json.dumps(row).encode(), method="POST",
                                 headers=_headers({"Prefer": "return=minimal"}))
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except Exception as e:
        print(f"  ERROR sb_insert({table}): {e}")
        return False

def sb_patch(table, filt, row):
    """PATCH rows matching filt (dict of col->'eq.val' style already formatted)."""
    qs = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in filt.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, data=json.dumps(row).encode(), method="PATCH",
                                 headers=_headers({"Prefer": "return=minimal"}))
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except Exception as e:
        print(f"  ERROR sb_patch({table}): {e}")
        return False

def sb_upsert_engine(row):
    """Upsert engine_params — conflict on created_by,date."""
    url  = f"{SUPABASE_URL}/rest/v1/engine_params?on_conflict=created_by,date"
    data = json.dumps(row).encode()
    req  = urllib.request.Request(
        url, data=data, method="POST",
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except urllib.error.HTTPError as e:
        print(f"  ERROR sb_upsert(engine_params) {e.code}: {e.read().decode()[:300]}")
        return False
    except Exception as e:
        print(f"  ERROR sb_upsert(engine_params): {e}")
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
    "STRENGTH": 70.0, "MIXED": 85.0, "TWO_A_DAY": 120.0,
    # No DELOAD (programming failure, not a tool) — matches the daily prescriber.
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
    # Matches the daily prescriber's athlete preferences: NO intensity downscaling
    # (always full working weight), NO auto-LIGHT on ACWR, NO deloads. Only a true
    # HRV-crash overreach rests; ACWR is informational here.
    if overreaching:
        return "REST", 1.0
    w_pst, w_str = deadline_weights()
    scores      = {a: simulate_and_score(kalman, a, load_history, w_pst, w_str) for a in ACTION_TSS}
    best        = max(scores, key=scores.get)
    return best, 1.0


# ── State persistence ─────────────────────────────────────────────────────────

def save_engine_state(
    user_id: str,
    kalman: BanisterKalman,
    guardrail: SystemGuardrail,
    volume_engine: HypertrophyVolumeEngine,
    progression_registry: StrengthProgressionRegistry,
    exploration_manager: ControlledExplorationManager,
    synthesis_engine=None,  # retired (MILP); kept as a no-op param for call compatibility
    weekly_targets: dict = None,
    step_count: int = None,
    extra_synthesis: dict = None,
    last_explored: list = None,
) -> bool:
    """Single upsert of all engine state blobs to engine_params."""
    prev_rows = sb_get("engine_params", {
        "select": "*", "order": "date.desc", "limit": "1",
        "created_by": f"eq.{user_id}",
    })
    prev = prev_rows[0] if prev_rows else {}

    guardrail_dict = guardrail.to_dict()
    guardrail_dict["mrv_state"] = volume_engine.to_dict()
    guardrail_dict["e1rm_registry"] = progression_registry.to_dict()
    guardrail_dict["exploration_state"] = exploration_manager.to_dict()
    if step_count is not None:
        guardrail_dict["step_count"] = step_count
    if last_explored is not None:
        guardrail_dict["last_explored"] = list(last_explored)
    # synthesis_state holds the weekly_targets the prescriber reads. Write it
    # whenever we have targets (the allocator now produces them; synthesis_engine
    # may be None since the MILP was retired).
    synthesis_dict = synthesis_engine.to_dict() if synthesis_engine is not None else {}
    if weekly_targets is not None:
        synthesis_dict["weekly_targets"] = weekly_targets
    if extra_synthesis:
        synthesis_dict.update(extra_synthesis)
    if synthesis_dict:
        guardrail_dict["synthesis_state"] = synthesis_dict

    row = {
        "created_by":         user_id,
        "date":               TODAY.isoformat(),
        "kalman_state":       kalman.to_dict(),
        "guardrail_state":    guardrail_dict,
        "rls_params":         prev.get("rls_params") or {},
        "cellular_state":     prev.get("cellular_state") or {},
        "vdot_state":         prev.get("vdot_state") or {},
    }
    ok = sb_upsert_engine(row)
    print(f"  {'✓' if ok else '✗'}  Engine state saved")
    return ok


# ── Split framework selection ────────────────────────────────────────────────

def determine_optimal_split_framework(compliance_rate, avg_soreness, performance_trend, days_to_deadline):
    """
    High frequency is preferred — upper/lower is the default.
    Full body when compliance is low or soreness is high (easier to recover from per session).
    PPL is never auto-selected — lower per-muscle frequency doesn't match training response.
    """
    if compliance_rate < 0.70 or avg_soreness > 7.0:
        return "full_body"
    return "upper_lower"


# ── HRV helpers ───────────────────────────────────────────────────────────────

def _metric_z_3d(recovery_rows: list, key: str, invert: bool = False):
    """
    3-day rolling z-score of one recovery metric vs its ~30-day baseline.
    Positive = more recovered. `invert` for metrics where LOWER is better
    (resting HR). Returns None when there isn't enough signal.
    """
    series = sorted(
        ((r.get("date", ""), float(r.get(key) or 0)) for r in recovery_rows if (r.get(key) or 0) > 0),
        reverse=True,  # newest first
    )
    vals = [v for _, v in series]
    if len(vals) < 4:
        return None
    mean = sum(vals) / len(vals)
    std  = (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5
    if std < 1e-6:
        return None
    avg_3 = sum(vals[:3]) / len(vals[:3])
    z = (avg_3 - mean) / std
    return -z if invert else z


def compute_readiness_z(recovery_rows: list) -> float:
    """
    Composite 3-day recovery z-score (positive = ready) from recovery_metrics.

    Prefers HRV, but the current Garmin sync only populates resting_hr/sleep_score
    (HRV comes back null), so this falls back to resting HR (inverted: lower RHR =
    more recovered) and sleep score. Whichever signals are present are weighted-
    averaged, so the engine autoregulates off real data instead of sitting at 0.
    """
    parts = []  # (weight, z)
    for key, weight, invert in (("hrv", 1.0, False),
                                ("resting_hr", 0.7, True),
                                ("sleep_score", 0.5, False)):
        z = _metric_z_3d(recovery_rows, key, invert)
        if z is not None:
            parts.append((weight, z))
    if not parts:
        return 0.0
    return round(sum(w * z for w, z in parts) / sum(w for w, _ in parts), 4)


# ── Per-muscle performance signal ─────────────────────────────────────────────

def muscle_perf_slopes(registry: StrengthProgressionRegistry) -> dict:
    """
    {muscle: mean e1RM-per-session slope} derived from every tracked lift.

    Each lift's e1RM trend (>=3 sessions) is attributed to the muscles it trains
    via the shared muscle_map, then averaged per muscle. This is the only
    response signal the volume-landmark loop and the exploration bandit get, so
    muscles with no loaded-lift history simply don't appear (and stay un-nudged).
    """
    history = registry.to_dict().get("history", {})
    acc: dict[str, list] = {}
    for lift, e1rms in history.items():
        if len(e1rms) < 3:
            continue
        slope = compute_trend_slope(e1rms)
        for muscle in hypertrophy_muscles(lift):
            acc.setdefault(muscle, []).append(slope)
    return {m: sum(v) / len(v) for m, v in acc.items() if v}


# ── Daily-state refresh ────────────────────────────────────────────────────────

def refresh_athlete_state():
    """Recompute athlete_state + engine_params + training_prescription before
    generating, so a standalone `python generate_weekly_program.py` run isn't
    reading stale engine output.

    The generator only READS engine_params (VDOT, Kalman, guardrail), athlete_state
    (vdot_zones, fatigue), and training_prescription — all written by the daily
    engine (compute_athlete_state.py → mpc_prescriber.py). Run as fresh
    subprocesses to mirror the daily-engine workflow and avoid module-global
    bleed (TODAY/USER_ID are module-level in those scripts).

    Set SKIP_STATE_REFRESH=1 to opt out (e.g. the daily-engine workflow, which
    already runs both steps itself).
    """
    if os.environ.get("SKIP_STATE_REFRESH"):
        print("  SKIP_STATE_REFRESH set — using existing engine state")
        return
    import subprocess
    for script in ("compute_athlete_state.py", "mpc_prescriber.py"):
        path = os.path.join(SCRIPT_DIR, script)
        print(f"  ── refreshing state: {script} ──")
        result = subprocess.run([sys.executable, path], cwd=SCRIPT_DIR)
        if result.returncode != 0:
            raise SystemExit(
                f"State refresh failed: {script} exited {result.returncode}. "
                f"Aborting before generation to avoid writing a program off stale state."
            )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global USER_ID
    if not USER_ID:
        USER_ID = resolve_user_id()
        print(f"  Resolved USER_ID: {USER_ID}")

    refresh_athlete_state()

    days_ahead_env = int(os.environ.get("DAYS_AHEAD", 0))
    if days_ahead_env > 0:
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_ahead_env)]
    else:
        days_remaining   = 6 - TODAY.weekday()
        days_to_generate = [TODAY + datetime.timedelta(days=i) for i in range(days_remaining + 1)]

    print(f"=== generate_weekly_program  {TODAY} ===")
    print(f"  Generating for: {[d.isoformat() for d in days_to_generate]}")

    # ── 1. Load engine state ──────────────────────────────────────────────────
    engine_rows = sb_get("engine_params", {
        "select": "*", "order": "date.desc", "limit": "1",
        "created_by": f"eq.{USER_ID}",
    })
    engine = engine_rows[0] if engine_rows else {}

    kalman    = BanisterKalman.from_dict(engine.get("kalman_state") or {})
    guardrail_state = engine.get("guardrail_state") or {}
    guardrail = SystemGuardrail.from_dict(guardrail_state)
    volume_engine = HypertrophyVolumeEngine.from_dict(guardrail_state.get("mrv_state") or {})
    progression_registry = StrengthProgressionRegistry.from_dict(guardrail_state.get("e1rm_registry") or {})
    exploration_manager  = ControlledExplorationManager.from_dict(
        guardrail_state.get("exploration_state") or {"parameters": MUSCLE_GROUPS}
    )
    # ── Rebuild strength registry from logged sets (the previously-missing wire).
    # The persisted e1rm_registry was never fed by anything — generate never
    # called log_set. Rebuild it from workout_logs each run via the shared
    # log_ingest module (idempotent, single source of truth with audit_strength).
    workout_log_rows = sb_get("workout_logs", {
        "select": "log_date,exercises,notes",
        "created_by": f"eq.{USER_ID}",
        "order": "log_date.desc", "limit": "365",
    })
    log_rows = normalize_workout_logs(workout_log_rows)
    progression_registry = StrengthProgressionRegistry()
    populate_registry(progression_registry, log_rows)
    print(f"  Strength registry rebuilt: {len(workout_log_rows)} logs, "
          f"{len(log_rows)} sets → {len(progression_registry.to_dict()['history'])} tracked lifts")
    # Step counter for exploration epsilon schedule (week index)
    step_count = int(guardrail_state.get("step_count") or 0)
    # Muscles the bandit probed (+1 set) last run — their reward gets recorded
    # this run now that a week of response data has accrued.
    last_explored = list(guardrail_state.get("last_explored") or [])

    # ── 2. Load recent athlete data ───────────────────────────────────────────
    athlete_rows = sb_get("athlete_state", {
        "select": "date,fatigue,recovery,cellular,vdot_zones,nutrition,nutrition_modulation",
        "order": "date.desc", "limit": "30",
        "created_by": f"eq.{USER_ID}",
    })

    load_history = []
    for row in reversed(athlete_rows):
        atl = (row.get("fatigue") or {}).get("atl")
        load_history.append(float(atl) if atl is not None else 0.0)

    latest_athlete = athlete_rows[0] if athlete_rows else {}
    cellular_state  = latest_athlete.get("cellular") or latest_athlete.get("cellular_state") or {}
    vdot_zones      = latest_athlete.get("vdot_zones") or {}
    vdot            = latest_athlete.get("vdot") or vdot_zones.get("current_vdot")
    
    # Load profile to obtain maintenance_kcal
    profile_rows = sb_get("user_profiles", {"select": "*", "limit": "1"})
    profile      = profile_rows[0] if profile_rows else {}
    kcal_maintenance = float(profile.get("maintenance_kcal") or 3200.0)
    
    nutrition = latest_athlete.get("nutrition") or {}
    avg_cal   = float(nutrition.get("avg_calories_7d") or nutrition.get("avg_daily_calories_7d") or kcal_maintenance)
    kcal_deficit = max(0.0, kcal_maintenance - avg_cal)
    
    caloric_balance = {
        "deficit_kcal": kcal_deficit,
        "maintenance_kcal": kcal_maintenance
    }

    # ── Garmin recovery data (HRV / resting HR / sleep) ───────────────────────
    # Source of truth is recovery_metrics (written by the garmin-sync edge fn);
    # the old garmin_daily_stats table does not exist.
    recovery_rows = sb_get("recovery_metrics", {
        "select": "date,hrv,resting_hr,sleep_score",
        "created_by": f"eq.{USER_ID}",
        "order": "date.desc", "limit": "30",
    })
    hrv_z_3d = compute_readiness_z(recovery_rows)

    # ── Recent session history ────────────────────────────────────────────────
    prescription_rows = sb_get("training_prescription", {
        "select": "date,mpc_action,session_type,prescription",
        "created_by": f"eq.{USER_ID}",
        "order": "date.desc", "limit": "7",
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

    # Classify an actually-logged session as upper/lower from its exercises.
    # The freshness signal MUST reflect what Nolan did, not what was prescribed —
    # he routinely deviates (e.g. logged UPPER on a day the MPC prescribed lower),
    # and feeding _decide_split the prescription instead of the log is exactly how
    # it scheduled upper-on-upper. Lower keywords are checked first so "leg press"
    # / "calf raise" don't get miscounted as upper by "press"/"raise".
    _LOWER_KW = ("squat", "deadlift", "rdl", "lunge", "calf", "leg press",
                 "leg extension", "leg curl", "hamstring", "hip thrust", "glute")
    _UPPER_KW = ("bench", "press", "pull-up", "pullup", "pulldown", "row", "curl",
                 "raise", "fly", "push-up", "pushup", "dip", "shrug", "overhead",
                 "triceps", "bicep", "lat ")

    def classify_log_split(exercises) -> str | None:
        up = lo = 0
        for ex in (exercises or []):
            n = (ex.get("name") or "").lower()
            if any(k in n for k in _LOWER_KW):
                lo += 1
            elif any(k in n for k in _UPPER_KW):
                up += 1
        if up == 0 and lo == 0:
            return None
        return "upper_volume" if up > lo else "lower_squat_primary"

    # Prefer real logs (deduped to one per date, most-recent-first), classify each,
    # then put oldest→newest so _decide_split's reversed() lookback sees the true
    # last session. Fall back to prescription-derived splits only if no logs exist.
    logged_splits = []
    seen_dates = set()
    for r in workout_log_rows:  # already ordered log_date.desc
        d = r.get("log_date")
        if d in seen_dates:
            continue
        seen_dates.add(d)
        s = classify_log_split(r.get("exercises"))
        if s:
            logged_splits.append(s)
        if len(logged_splits) >= 7:
            break
    if logged_splits:
        recent_session_types = list(reversed(logged_splits))
    else:
        recent_session_types = [
            determine_split_from_row(r)
            for r in reversed(prescription_rows)
        ]

    # Continuity across the generation boundary. The seed above is logged sessions
    # only, so regenerating a window that starts mid-week — or a fresh week butting
    # against last week's Sunday — doesn't see the sessions already PLANNED right
    # before the window, and the first generated day can double up the same split
    # (the back-to-back legs/upper bug). Seed off the latest planned-but-unlogged
    # day before the window so the alternation carries across the seam.
    window_start = days_to_generate[0]
    _planned_before = sb_get("program_workouts", {
        "select": "scheduled_date,title,focus", "created_by": f"eq.{USER_ID}",
        "scheduled_date": f"lt.{window_start.isoformat()}",
        "order": "scheduled_date.desc", "limit": "1"})
    if _planned_before:
        # Classify the preceding planned day from its title (unambiguous: "Upper —"
        # / "Lower —"); planned exercises store sets as an int so classify_log_split
        # (built for logged sets-lists) can't read them.
        _t = str(_planned_before[0].get("title") or "").lower()
        _s = ("lower_squat_primary" if "lower" in _t else
              "upper_volume" if "upper" in _t else None)
        _last_log = workout_log_rows[0].get("log_date") if workout_log_rows else None
        if _s and (_last_log is None or str(_planned_before[0].get("scheduled_date")) > str(_last_log)):
            recent_session_types.append(_s)
            if len(recent_session_types) > 7:
                recent_session_types.pop(0)

    # Never reprogram a day already trained. Regenerating today after he's logged a
    # session would plant a phantom session (e.g. today's plan flips to Upper while
    # he actually did Lower), and the next day then alternates off the phantom —
    # producing back-to-back same-split days. Generate only untrained days; the
    # alternation seeds off his most recent ACTUAL logged session above.
    _logged_dates = {str(r.get("log_date")) for r in workout_log_rows}
    days_to_generate = [d for d in days_to_generate if d.isoformat() not in _logged_dates]

    # ── Recent cardio TSS (from Garmin runs) ──────────────────────────────────
    cardio_rows = sb_get("garmin_activities", {
        "select": "activity_date,duration_seconds,distance_meters",
        # treadmill_running / trail_running etc. count as runs too
        "activity_type": "like.*running*",
        "created_by": f"eq.{USER_ID}",
        "order": "activity_date.desc", "limit": "7",
    })
    recent_run_tss = sum((float(r.get("duration_seconds") or 0) / 60.0) * 0.9 for r in cardio_rows)
    weekly_km      = sum(float(r.get("distance_meters") or 0) / 1000.0 for r in cardio_rows)

    # Per-region soreness from the morning check-in (daily_readiness.soreness_snapshot).
    # athlete_state has no soreness column, so the previous read here was always 0 —
    # the orthopedic mileage cap and the MRV-downgrade rule never saw real soreness.
    soreness_rows = sb_get("daily_readiness", {
        "select": "checkin_date,soreness_snapshot",
        "created_by": f"eq.{USER_ID}",
        "order": "checkin_date.desc", "limit": "7",
    })
    snapshots = [r.get("soreness_snapshot") for r in soreness_rows]
    # soreness_snapshot is a 0–3 severity scale; the landmark/bandit/split rules
    # all threshold on a 0–10 scale (avg_soreness > 7). Convert once here with the
    # same 1+raw*3 mapping compute_athlete_state uses for its composite, so every
    # downstream consumer sees one scale instead of silently never firing.
    soreness_muscle = {
        m: [1.0 + v * 3.0 for v in vals]
        for m, vals in soreness_by_muscle(snapshots[:4]).items()  # last 4 days
    }
    quad_vals = soreness_muscle.get("quads", [])
    quad_soreness_avg = sum(quad_vals) / len(quad_vals) if quad_vals else 0.0

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
    enrollment_start = datetime.date.fromisoformat(raw_start[:10]) if raw_start else TODAY

    print(f"  Program: {program_id} | Week: {current_week} | Start: {enrollment_start}")
    if cellular_state:
        print(f"  Cellular — AMPK: {cellular_state.get('ampk', 0):.2f}  "
              f"mTORC1: {cellular_state.get('mtorc1', 0):.2f}")
    else:
        print("  Cellular state: none yet")
    print(f"  HRV z-3d: {hrv_z_3d:.2f}")
    print(f"  Recent session types: {recent_session_types}")
    print(f"  7-day run TSS: {recent_run_tss:.1f}  |  weekly_km: {weekly_km:.1f}")

    # ── 3. Strength progression analysis ─────────────────────────────────────
    print("\n  Strength progression commands:")
    # GOAL aggregates keyed by log_ingest.GOAL_LIFTS — bench = paused competition
    # (NOT the touch-and-go cheat), deadlift = conventional, squat = competition.
    goal_exercises = list(GOAL_LIFTS)
    for exercise in goal_exercises:
        cmd = progression_registry.get_command(exercise, hrv_z_3d)
        hist = progression_registry.get_history(exercise)
        latest = f"{hist[-1]:.0f}" if hist else "—"
        print(f"    {exercise:28s}: {cmd:13s} (latest e1RM {latest}, {len(hist)} sess)")

    # ── 4. Update volume landmarks ────────────────────────────────────────────
    # Per-muscle e1RM response — drives both the landmark loop and the bandit.
    perf_slopes = muscle_perf_slopes(progression_registry)

    # Idempotency: learn at most once per week. If we already produced a plan for
    # THIS week — or a partially-failed run already armed the learned_week marker —
    # skip ALL learner updates on re-run (just re-allocate below). The marker is
    # written BEFORE the first learner update so a crash between the learner
    # writes and the weekly_plans upsert can't double-count on retry.
    prev_plans = sb_get("weekly_plans", {
        "select": "week_start,set_targets,frequency_targets", "created_by": f"eq.{USER_ID}",
        "order": "week_start.desc", "limit": "1"})
    _this_week = (TODAY - datetime.timedelta(days=TODAY.weekday())).isoformat()
    _lw_rows = sb_get("athlete_params", {
        "select": "meta", "created_by": f"eq.{USER_ID}", "param_key": "eq.learned_week"})
    _lw_meta = ((_lw_rows[0].get("meta") if _lw_rows else None) or {})
    already_ran = bool(
        (prev_plans and str(prev_plans[0].get("week_start")) == _this_week)
        or str(_lw_meta.get("week_start")) == _this_week)
    if already_ran:
        print("  (already ran this week — skipping learner updates, re-allocating only)")
    else:
        sb_upsert("athlete_params", {
            "created_by": USER_ID, "param_key": "learned_week",
            "mean": 0.0, "variance": 1.0, "n_obs": 0, "mature": False,
            "meta": {"week_start": _this_week},
        }, conflict_cols="created_by,param_key")

    # 4a. Close last week's exploration loop: reward the muscle(s) we probed by
    #     their actual response, penalised by soreness. Only muscles with a real
    #     slope signal are scored — an un-measurable probe stays "unpulled" so
    #     UCB keeps it eligible instead of pinning its value at a fake zero.
    for muscle in (last_explored if not already_ran else []):
        slope = perf_slopes.get(muscle)
        if slope is None:
            continue
        sore_vals = soreness_muscle.get(muscle, [])
        avg_sore = sum(sore_vals) / len(sore_vals) if sore_vals else 0.0
        reward = slope - 0.5 * max(0.0, avg_sore - 7.0)
        exploration_manager.record_outcome(muscle, reward)
        print(f"  Bandit reward: {muscle} ← {reward:+.3f} "
              f"(slope {slope:+.3f}, soreness {avg_sore:.1f})")

    # 4b. Learn each muscle's MEV/MAV/MRV from its own response + soreness
    #     (the previously-dormant update_landmarks loop). MRV ratchets down only
    #     when a muscle stalls AND is sore; MAV creeps up while it's responding.
    if not already_ran:
        learned = volume_engine.learn_from_response(perf_slopes, soreness_muscle)
        if learned:
            print(f"  Landmarks learned: "
                  f"{ {m: lm['MRV'] for m, lm in learned.items()} }")

    # 4c. Environmental scaling on top of the learned landmarks.
    volume_engine.adjust_for_running(weekly_km)

    kcal_deficit      = float(caloric_balance.get("deficit_kcal")      or 0)
    kcal_maintenance  = float(caloric_balance.get("maintenance_kcal")   or 0)
    if kcal_deficit > 0 and kcal_maintenance > 0:
        volume_engine.adjust_for_caloric_deficit(kcal_deficit, kcal_maintenance)

    mrv_dict = volume_engine.get_mrv_dict()

    # ── 5. Apply exploration ──────────────────────────────────────────────────
    exploration_delta = exploration_manager.get_exploration_delta(step_count)
    for muscle, extra in exploration_delta.items():
        base_mrv = volume_engine.landmarks.get(muscle, {}).get("MRV", mrv_dict.get(muscle, 18))
        mrv_dict[muscle] = min(mrv_dict.get(muscle, base_mrv) + extra, base_mrv + 2)
    if exploration_delta:
        print(f"  Exploration delta: {exploration_delta}")
    # Remember which muscles were probed so next week can score their response.
    new_last_explored = list(exploration_delta.keys())

    # ── 5b. Notes + deviations → exercise-value learning ──────────────────────
    # Read what Nolan WROTE and what he actually DID, and fold both into the
    # per-exercise value posterior so next week programs the movements he responds
    # to / reaches for and backs off the ones he flags. Acts fast (a single note
    # moves things) but a swap is only a one-off vote — repetition is what sticks.
    notes_signals = parse_workout_notes(workout_log_rows, today_iso=TODAY.isoformat())
    prescribed_rows = sb_get("program_workouts", {
        "select": "scheduled_date,exercises", "created_by": f"eq.{USER_ID}",
        "scheduled_date": f"gte.{(TODAY - datetime.timedelta(days=21)).isoformat()}",
        "order": "scheduled_date.desc"})
    deviations = track_deviations(prescribed_rows, workout_log_rows, today_iso=TODAY.isoformat())

    _ev_rows = sb_get("athlete_params", {
        "select": "*", "created_by": f"eq.{USER_ID}", "param_key": "eq.exercise_values"})
    ev_meta = ((_ev_rows[0].get("meta") if _ev_rows else None) or {})

    # One reward per exercise touched by any signal this week, then a posterior
    # update. Guarded by already_ran so a same-week re-run can't double-count.
    if not already_ran:
        _ex_history = progression_registry.to_dict().get("history", {})
        touched = (set(_ex_history)
                   | set(deviations["chosen"]) | set(deviations["dropped"])
                   | set(notes_signals["sentiment"]) | set(notes_signals["too_easy"])
                   | set(notes_signals["too_hard"])
                   | {k for k in notes_signals["caution"] if " " in k or k in _ex_history})
        # Session-level pain notes caution by MUSCLE, not exercise — attribute
        # them to the exercises actually logged in the notes window whose
        # muscles intersect the caution, so the offending lift's posterior
        # takes the pain penalty too (not just this week's selection).
        _notes_cutoff = (TODAY - datetime.timedelta(days=14)).isoformat()
        _recent_logged = {canon(ex.get("name") or "")
                          for r in workout_log_rows
                          if str(r.get("log_date") or "") >= _notes_cutoff
                          for ex in (r.get("exercises") or [])}
        for name in touched:
            hist = _ex_history.get(name, [])
            slope = compute_trend_slope(hist) if len(hist) >= 3 else None
            pain = (name in notes_signals["caution"]
                    or (name in _recent_logged
                        and any(m in notes_signals["caution"]
                                for m in hypertrophy_muscles(name))))
            reward = exercise_reward(
                slope,
                deviations["chosen"].get(name, 0),
                deviations["dropped"].get(name, 0),
                notes_signals["sentiment"].get(name, 0.0),
                notes_signals["too_easy"].get(name, 0),
                pain=pain,
                hard_mentions=notes_signals["too_hard"].get(name, 0),
            )
            if reward != 0.0:
                ev_meta = update_exercise_value(ev_meta, name, reward)
        sb_upsert("athlete_params", {
            "created_by": USER_ID, "param_key": "exercise_values",
            "mean": 0.0, "variance": 1.0,
            "n_obs": sum(int(v.get("n", 0)) for v in ev_meta.values()),
            "mature": False, "meta": ev_meta,
        }, conflict_cols="created_by,param_key")

    # Maps consumed by the session generator: learned value per movement, and the
    # note-caution dict (keyed by exercise canon + landmark muscle).
    exercise_values = {name: float(v.get("mean", 0.0)) for name, v in ev_meta.items()}
    caution = notes_signals["caution"]
    weakness = notes_signals["weakness"]   # {lift: {region}} → aim assistance
    note_flags = notes_signals["flags"] + deviations["events"][:4]
    if note_flags:
        print(f"  Notes/deviation signals: {note_flags[:6]}")

    # ── 6. MILP synthesis ─────────────────────────────────────────────────────
    reserve_score = compute_reserve_score(hrv_z_3d)

    # ACWR — prefer the true value from athlete_state (acute 7d / chronic weekly
    # avg). Fall back to the legacy reconstruction only if absent.
    acwr_global = (latest_athlete.get("fatigue") or {}).get("acwr")
    if acwr_global is None:
        acwr_global = 1.0
        if len(load_history) >= 7:
            acute      = sum(load_history[-7:]) / 7.0
            chronic    = sum(load_history[-28:]) / max(len(load_history[-28:]), 1)
            acwr_global = acute / (chronic + 1e-5)
    acwr_global = float(acwr_global)

    user_prefs = {
        "max_daily_sets":    int(os.environ.get("MAX_DAILY_SETS", 20)),
        "min_strength_days": 4,
    }

    # ── 6a. Bayesian learners (ADAPTIVE_ENGINE_DESIGN.md §4) ──────────────────
    # Update each muscle's MRV posterior + frequency bandit from last week's
    # planned volume vs measured response. The allocator then reads the LEARNED
    # landmarks (athlete_landmarks), so the program personalizes over time.
    prior_mrv = {m: LANDMARK_PRIORS.get(m, {}).get("mrv", 18) for m in MUSCLE_GROUPS}
    lm_rows = sb_get("athlete_landmarks", {"select": "*", "created_by": f"eq.{USER_ID}"})
    landmarks_db = {r["muscle"]: dict(r) for r in (lm_rows or [])}
    prev_targets = (prev_plans[0].get("set_targets") if prev_plans else {}) or {}
    prev_freq    = (prev_plans[0].get("frequency_targets") if prev_plans else {}) or {}
    freq_rows = sb_get("athlete_params", {"select": "*", "created_by": f"eq.{USER_ID}",
                                          "param_key": "like.freq.*"}) or []
    freq_params = {r["param_key"]: dict(r) for r in freq_rows}

    learned_freq = {}
    for m in (MUSCLE_GROUPS if not already_ran else []):
        row = landmarks_db.get(m)
        if not row:
            # Newly added landmark muscle with no DB row yet: seed it from the
            # priors so it joins the learning loop and volume-test rotation.
            p = LANDMARK_PRIORS.get(m, {"mev": 6, "mav": 12, "mrv": 18})
            row = {"mev": p["mev"], "mav": p["mav"], "mrv": p["mrv"],
                   "mrv_mean": float(p["mrv"]), "mrv_var": 9.0,
                   "n_obs": 0, "mature": False}
            landmarks_db[m] = row
        sore_vals = soreness_muscle.get(m, [])
        avg_sore  = (sum(sore_vals) / len(sore_vals)) if sore_vals else 0.0
        upd = update_mrv(row, prev_targets.get(m), perf_slopes.get(m), avg_sore, prior_mrv[m])
        row.update(upd)
        sb_upsert("athlete_landmarks", {
            "created_by": USER_ID, "muscle": m, "mev": row["mev"],
            "mav": upd["mav"], "mrv": upd["mrv"], "mrv_mean": upd["mrv_mean"],
            "mrv_var": upd["mrv_var"], "n_obs": upd["n_obs"], "mature": upd["mature"],
        }, conflict_cols="created_by,muscle")
        # Frequency bandit: reward = this muscle's slope at the freq it was run.
        if perf_slopes.get(m) is not None and prev_freq.get(m):
            meta = (freq_params.get(f"freq.{m}") or {}).get("meta") or {}
            meta = update_frequency(meta, int(prev_freq[m]), float(perf_slopes[m]))
            sb_upsert("athlete_params", {
                "created_by": USER_ID, "param_key": f"freq.{m}",
                "mean": best_frequency(meta), "variance": 1.0,
                "n_obs": sum(a.get("n", 0) for a in meta.values()),
                "mature": any(a.get("n", 0) >= 3 for a in meta.values()), "meta": meta,
            }, conflict_cols="created_by,param_key")
            if any(a.get("n", 0) >= 3 for a in meta.values()):
                learned_freq[m] = best_frequency(meta)

    matured = sum(1 for r in landmarks_db.values() if r.get("mature"))
    print(f"  Learners: {matured}/{len(landmarks_db) or len(MUSCLE_GROUPS)} muscles MRV-personalized")

    # ── 6a-test. Controlled exploration: volume-tolerance test (§6) ───────────
    # Actively probe a muscle's MRV by ramping it above MAV; a completed ramp
    # feeds a LOW-noise observation to the learner. One test at a time, never on a cut.
    phase_test = (latest_athlete.get("nutrition") or {}).get("phase")
    tests = sb_get("controlled_tests", {"select": "*", "created_by": f"eq.{USER_ID}",
                   "status": "eq.active", "test_type": "eq.volume_tolerance",
                   "order": "created_at.desc", "limit": "1"})
    active_test = get_active(tests)
    if active_test and active_test.get("test_type") == "volume_tolerance" and not already_ran:
        tm = (active_test.get("baseline") or {}).get("muscle")
        sv = soreness_muscle.get(tm, [])
        avg_sore = (sum(sv) / len(sv)) if sv else 0.0
        updated, obs = step_volume_test(active_test, perf_slopes.get(tm),
                                        avg_sore, prev_targets.get(tm) or 0)
        sb_patch("controlled_tests", {"id": f"eq.{active_test['id']}"},
                 {"status": updated["status"], "baseline": updated["baseline"],
                  "result": updated.get("result")})
        if obs and tm in landmarks_db:
            upd = apply_mrv_observation(landmarks_db[tm], obs["obs"], obs["obs_var"], prior_mrv.get(tm, 18))
            landmarks_db[tm].update(upd)
            sb_upsert("athlete_landmarks", {
                "created_by": USER_ID, "muscle": tm, "mev": landmarks_db[tm]["mev"],
                "mav": upd["mav"], "mrv": upd["mrv"], "mrv_mean": upd["mrv_mean"],
                "mrv_var": upd["mrv_var"], "n_obs": upd["n_obs"], "mature": upd["mature"],
            }, conflict_cols="created_by,muscle")
            print(f"  Volume-tolerance test COMPLETE: {tm} → MRV obs {obs['obs']} (mature={upd['mature']})")
            active_test = None
        else:
            active_test = updated
            print(f"  Volume-tolerance test active: {tm} (ramp week {updated['baseline']['week']})")
    elif can_schedule(active_test, phase_test) and not already_ran:
        tm = pick_volume_test_muscle(landmarks_db)
        if tm:
            sb_insert("controlled_tests", {
                **schedule_volume_test(tm, float(landmarks_db[tm].get("mrv_mean", 18)), TODAY.isoformat()),
                "created_by": USER_ID})
            active_test = {"test_type": "volume_tolerance", "baseline": {"muscle": tm, "week": 1}}
            print(f"  Scheduled volume-tolerance test: {tm}")

    # ── 6a-pst. PST diagnostic scheduler (§6.4) — benchmark every 4 weeks ─────
    if not already_ran:
        pst_rows = sb_get("pst_tests", {"select": "test_date", "created_by": f"eq.{USER_ID}",
                          "order": "test_date.desc", "limit": "1"})
        last_pst = pst_rows[0].get("test_date") if pst_rows else None
        active_pst = sb_get("controlled_tests", {"select": "id", "created_by": f"eq.{USER_ID}",
                            "status": "eq.active", "test_type": "eq.pst_diagnostic", "limit": "1"})
        if should_schedule_pst(last_pst, TODAY, bool(active_pst)):
            sb_insert("controlled_tests", {**schedule_pst_diagnostic(TODAY.isoformat()), "created_by": USER_ID})
            print(f"  Scheduled PST diagnostic (last PST: {last_pst or 'never'})")

    # ── 6b. Weekly volume allocator (ADAPTIVE_ENGINE_DESIGN.md §2) ────────────
    # Reads the LEARNED landmarks (fallback to priors), goal-weighted under the
    # recovery budget. Frequency uses learned-mature values where available.
    # Priors for every muscle, overlaid with LEARNED rows where they exist — so a
    # newly added landmark muscle (no DB row yet) still enters the allocator.
    landmarks_lc = {m: dict(LANDMARK_PRIORS[m]) for m in LANDMARK_PRIORS}
    for m, r in (landmarks_db or {}).items():
        landmarks_lc[m] = {"mev": float(r["mev"]), "mav": float(r["mav"]), "mrv": float(r["mrv"])}

    # Active volume-tolerance test → raise the probed muscle's MRV ceiling so the
    # allocator ramps its volume above MAV this week.
    if active_test and active_test.get("test_type") == "volume_tolerance":
        for mm, boosted in ramp_target(active_test, landmarks_lc).items():
            if mm in landmarks_lc:
                landmarks_lc[mm]["mrv"] = max(landmarks_lc[mm]["mrv"], boosted)
    tsb_now   = float((latest_athlete.get("fatigue") or {}).get("tsb") or 0.0)
    phase_now = (latest_athlete.get("nutrition") or {}).get("phase")
    days_to_deadline = max(0, (DEADLINE - TODAY).days)
    pst_mult  = max(1.0, min(1.5, 1.0 + (90 - days_to_deadline) / 180.0))  # [ENG] PST urgency
    deadline_mult = {"strength": 1.0, "hypertrophy": 1.0, "pst": pst_mult}
    goal_prio = profile.get("goal_priorities") or default_goal_priorities(profile.get("training_phase"))
    emphasis  = profile.get("muscle_emphasis") or MUSCLE_EMPHASIS
    vdot_gap  = float(vdot_zones.get("vdot_gap") or 0.0)

    plan = plan_week(landmarks_lc, tsb_now, phase_now, goal_prio, deadline_mult,
                     days_available=6, vdot_gap=vdot_gap, learned_freq=learned_freq,
                     muscle_emphasis=emphasis)
    weekly_targets = {m: int(v) for m, v in plan["set_targets"].items()}

    print(f"\n  Reserve score: {reserve_score:.2f}  |  ACWR: {acwr_global:.2f}")
    print(f"  Allocator budget: {plan['budget']} sets  |  goal_prio: {goal_prio}  pst_mult: {pst_mult:.2f}")
    print(f"  Weekly set targets: {weekly_targets}")

    # Persist the weekly plan (what session gen / the brief can surface).
    week_start = (TODAY - datetime.timedelta(days=TODAY.weekday())).isoformat()  # Monday
    sb_upsert("weekly_plans", {
        "created_by": USER_ID,
        "week_start": week_start,
        "set_targets": weekly_targets,
        "frequency_targets": plan["frequency_targets"],
        "run_plan": plan["run_plan"],
        "rationale": (f"budget {plan['budget']} sets; goal_prio {goal_prio}; emphasis {emphasis}; "
                      f"pst_mult {pst_mult:.2f}; {matured}/{len(landmarks_db) or len(MUSCLE_GROUPS)} muscles MRV-personalized"
                      + (f"; signals: {'; '.join(note_flags[:4])}" if note_flags else "")),
    }, conflict_cols="created_by,week_start")

    # ── 6b. Determine split framework ─────────────────────────────────────────
    days_to_deadline = (DEADLINE - TODAY).days
    compliance_rate = float(((engine.get("guardrail_state") or {}).get("synthesis_state") or {}).get("compliance_rate", 0.80))

    perf_slopes = []
    for ex_name in GOAL_LIFTS:
        hist = progression_registry.get_history(ex_name)
        if len(hist) >= 3:
            x = np.arange(len(hist))
            perf_slopes.append(float(np.polyfit(x, hist, 1)[0]))
    perf_trend = sum(perf_slopes) / len(perf_slopes) if perf_slopes else 0.0

    split_framework = determine_optimal_split_framework(
        compliance_rate, quad_soreness_avg, perf_trend, days_to_deadline
    )
    print(f"  Split framework: {split_framework}  compliance={compliance_rate:.0%}  soreness={quad_soreness_avg:.2f}")

    # ── 7. Per-day generation ─────────────────────────────────────────────────
    # Snapshot the REAL Kalman/guardrail state before the loop: the per-day
    # generation below advances them with PROJECTED future loads (for scoring
    # only), and persisting that simulated state would double-count up to 7 days
    # of phantom load once the daily compute steps it again with actual loads.
    kalman_pre    = BanisterKalman.from_dict(kalman.to_dict())
    guardrail_pre = SystemGuardrail.from_dict(guardrail.to_dict())
    # Polarized run placement is adaptive (no fixed weekday template): track how many
    # quality/long runs have been placed so the week hits ~2 quality + 1 long, landed
    # on upper/cardio days rather than heavy leg days.
    quality_placed, long_placed = 0, 0
    for i, sim_day in enumerate(days_to_generate):
        day_name = sim_day.strftime("%A")

        # day_index aligned to the calendar week (Mon=1 … Sun=7) so the plan reads
        # in step with the actual week instead of an enrollment-anchored cycle.
        day_index = sim_day.weekday() + 1

        # Per-day ACWR
        acwr = 1.0
        if len(load_history) >= 7:
            acute   = sum(load_history[-7:])  / 7.0
            chronic = sum(load_history[-28:]) / max(len(load_history[-28:]), 1)
            acwr    = acute / (chronic + 1e-5)

        overreach = guardrail.check_overreaching([], [], acwr)
        action, intensity = select_action(kalman, load_history, acwr, overreach["overreaching"])

        # Forward-step cellular state
        sim_cellular = dict(cellular_state)
        days_ahead = (sim_day - TODAY).days
        if days_ahead > 0 and sim_cellular:
            decay = 0.85 ** days_ahead
            sim_cellular = {
                "ampk":              float(sim_cellular.get("ampk", 0.2)) * decay,
                "mtorc1":            min(0.8, float(sim_cellular.get("mtorc1", 0.3)) + (1 - decay) * 0.3),
                "interference_score": float(sim_cellular.get("interference_score", 0.1)) * decay,
            }

        # Decide the split first, then place the run adaptively around it (hard runs
        # off heavy leg days), tracking the weekly polarized budget.
        split = get_split(action, intensity, sim_day, sim_cellular, recent_session_types,
                          split_framework=split_framework)
        run_slot = pick_run_slot(split, action, quality_placed, long_placed)
        if run_slot in ("threshold", "interval"):
            quality_placed += 1
        elif run_slot == "long":
            long_placed += 1

        # Generate session with weekly MILP targets (session gen handles per-session distribution)
        exercises, cardio = gen_session(
            action=action,
            intensity=intensity,
            sim_date=sim_day,
            cellular_state=sim_cellular,
            recent_session_types=recent_session_types,
            recent_run_tss=recent_run_tss,
            vdot=vdot,
            weekly_set_targets=weekly_targets,  # weekly totals, session gen handles per-session distribution
            readiness_z=hrv_z_3d,
            e1rm_registry=progression_registry.to_dict(),
            quad_soreness_avg=quad_soreness_avg,
            split_framework=split_framework,
            run_slot=run_slot,
            exercise_values=exercise_values,
            caution=caution,
            weakness=weakness,
        )

        title = build_title(action, split, intensity)

        # Two-a-day split evaluation
        total_sets  = sum(e.get("sets", 0) for e in exercises)
        planned_km  = sum(c.get("duration_minutes", 0) * 0.15 for c in cardio)
        _split_2a, _split_reason = evaluate_two_a_day_split(total_sets, planned_km, reserve_score)
        # (structure already separated: exercises AM, cardio PM — no structural change needed)
        if _split_2a:
            # Stamp the PM half so the UI's TWO_A_DAY classification (which keys
            # off cardio time_of_day) can see engine-decided two-a-day days.
            for c in cardio:
                c["time_of_day"] = "pm"

        print(f"\n  [{sim_day}] {day_name} (day_index={day_index})")
        print(f"    MPC: {action}  intensity={intensity}  ACWR={acwr:.2f}  split={split}")
        print(f"    AMPK={sim_cellular.get('ampk', 0):.2f}  mTORC1={sim_cellular.get('mtorc1', 0):.2f}")
        print(f"    two_a_day={_split_2a} ({_split_reason})")

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

        # Advance rolling state
        recent_session_types.append(split)
        if len(recent_session_types) > 7:
            recent_session_types.pop(0)

        if cardio:
            recent_run_tss += ACTION_TSS.get(action, 0) * 0.5

        projected_tss = ACTION_TSS.get(action, 50.0)
        kalman.step(projected_tss, None)
        load_history.append(projected_tss)
        guardrail.record_state(overreach["fatigue_state"])

    # ── 8. Save all engine state ──────────────────────────────────────────────
    new_step = step_count + 1
    save_engine_state(
        USER_ID, kalman_pre, guardrail_pre, volume_engine,
        progression_registry, exploration_manager, None,  # MILP synthesis_engine retired (allocator owns targets)
        weekly_targets=weekly_targets, step_count=new_step,
        extra_synthesis={"split_framework": split_framework, "compliance_rate": compliance_rate},
        last_explored=new_last_explored,
    )

    print(f"\n  Step count: {step_count} → {new_step}")
    print(f"\n✓  Done — {len(days_to_generate)} days written")


if __name__ == "__main__":
    main()
