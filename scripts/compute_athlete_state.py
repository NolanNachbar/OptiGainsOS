#!/usr/bin/env python3
"""
compute_athlete_state.py — Daily athlete state computation for OptiGains.

Runs at 4am MT (11am UTC) after garmin-sync (3am MT / 10am UTC).
Writes one deterministic row to `athlete_state` in Supabase.
No LLM calls — pure math. The daily brief reads this as primary input.

Requirements:
    pip install python-dotenv        # optional, for loading .env

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

# ── Load .env ─────────────────────────────────────────────────────────────────

try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    load_dotenv(_env_path)
except ImportError:
    pass  # python-dotenv not installed; env vars must be set externally

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
USER_ID      = os.environ.get("USER_ID", "")

if not all([SUPABASE_URL, SUPABASE_KEY, USER_ID]):
    print("ERROR: Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID")
    sys.exit(1)

TODAY = datetime.date.today().isoformat()

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
    url = f"{SUPABASE_URL}/rest/v1/{table}"
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

def epley_e1rm(weight: float, reps: int) -> float:
    """Epley estimated 1RM: weight × (1 + reps/30). Returns 0 for invalid input."""
    if reps <= 0 or weight <= 0:
        return 0.0
    if reps == 1:
        return float(weight)
    return weight * (1.0 + reps / 30.0)


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

# Keyword → primary muscle groups.
# Longer keywords checked first (via sorted by length) to prefer specific matches.
EXERCISE_MUSCLE_MAP: dict[str, list[str]] = {
    "romanian deadlift": ["hamstrings", "glutes"],
    "rdl":               ["hamstrings", "glutes"],
    "good morning":      ["hamstrings", "lower_back"],
    "nordic curl":       ["hamstrings"],
    "leg curl":          ["hamstrings"],
    "hip thrust":        ["glutes", "hamstrings"],
    "glute bridge":      ["glutes"],
    "cable kickback":    ["glutes"],
    "bulgarian split":   ["quads", "glutes"],
    "leg extension":     ["quads"],
    "leg press":         ["quads", "glutes"],
    "hack squat":        ["quads"],
    "lunge":             ["quads", "glutes"],
    "step up":           ["quads", "glutes"],
    "squat":             ["quads", "glutes"],
    "deadlift":          ["back", "hamstrings", "glutes"],
    "incline bench":     ["chest", "triceps"],
    "decline bench":     ["chest", "triceps"],
    "bench press":       ["chest", "triceps"],
    "flat bench":        ["chest", "triceps"],
    "dumbbell press":    ["chest", "triceps"],
    "chest fly":         ["chest"],
    "cable fly":         ["chest"],
    "pec fly":           ["chest"],
    "close grip":        ["triceps", "chest"],
    "skull crusher":     ["triceps"],
    "tricep pushdown":   ["triceps"],
    "tricep extension":  ["triceps"],
    "overhead tricep":   ["triceps"],
    "tricep":            ["triceps"],
    "dip":               ["chest", "triceps"],
    "push up":           ["chest", "triceps"],
    "pushup":            ["chest", "triceps"],
    "overhead press":    ["shoulders", "triceps"],
    "military press":    ["shoulders", "triceps"],
    "shoulder press":    ["shoulders", "triceps"],
    "lateral raise":     ["shoulders"],
    "face pull":         ["rear_delts"],
    "rear delt fly":     ["rear_delts"],
    "reverse fly":       ["rear_delts"],
    "reverse pec":       ["rear_delts"],
    "upright row":       ["shoulders", "traps"],
    "shrug":             ["traps"],
    "barbell row":       ["back", "biceps"],
    "bent over row":     ["back", "biceps"],
    "pendlay row":       ["back", "biceps"],
    "t-bar row":         ["back", "biceps"],
    "chest supported":   ["back", "biceps"],
    "seal row":          ["back", "biceps"],
    "pull up":           ["back", "biceps"],
    "pullup":            ["back", "biceps"],
    "chin up":           ["back", "biceps"],
    "chinup":            ["back", "biceps"],
    "lat pulldown":      ["back", "biceps"],
    "seated row":        ["back", "biceps"],
    "cable row":         ["back", "biceps"],
    "row":               ["back", "biceps"],
    "preacher curl":     ["biceps"],
    "hammer curl":       ["biceps"],
    "incline curl":      ["biceps"],
    "curl":              ["biceps"],
    "ohp":               ["shoulders", "triceps"],
    "plank":             ["abs"],
    "crunch":            ["abs"],
    "ab wheel":          ["abs"],
    "hanging leg":       ["abs"],
    "leg raise":         ["abs"],
    "calf raise":        ["calves"],
    "seated calf":       ["calves"],
}

# Volume landmarks (sets/week): MEV=minimum effective, MAV=maximum adaptive, MRV=maximum recoverable
MUSCLE_TARGETS: dict[str, dict] = {
    "quads":      {"mev": 8,  "mav": 14, "mrv": 20},
    "hamstrings": {"mev": 6,  "mav": 12, "mrv": 16},
    "glutes":     {"mev": 6,  "mav": 12, "mrv": 16},
    "chest":      {"mev": 8,  "mav": 14, "mrv": 20},
    "back":       {"mev": 10, "mav": 16, "mrv": 22},
    "shoulders":  {"mev": 6,  "mav": 12, "mrv": 18},
    "rear_delts": {"mev": 6,  "mav": 12, "mrv": 18},
    "biceps":     {"mev": 8,  "mav": 14, "mrv": 20},
    "triceps":    {"mev": 8,  "mav": 14, "mrv": 18},
    "abs":        {"mev": 0,  "mav": 12, "mrv": 16},
    "lower_back": {"mev": 4,  "mav": 8,  "mrv": 12},
    "traps":      {"mev": 4,  "mav": 10, "mrv": 16},
    "calves":     {"mev": 8,  "mav": 16, "mrv": 24},
}

# Primary lifts to track — update targets as goals change
TRACKED_LIFTS: dict[str, dict] = {
    "squat": {
        "keywords": ["back squat", "front squat", "squat"],
        "exclude":  ["goblet", "box squat", "jump squat"],
        "target":   405,
    },
    "bench": {
        "keywords": ["bench press", "flat bench", "barbell bench"],
        "exclude":  [],
        "target":   315,
    },
    "deadlift": {
        "keywords": ["deadlift"],
        "exclude":  ["romanian", " rdl", "sumo", "trap bar", "hex bar"],
        "target":   495,
    },
    "rdl": {
        "keywords": ["romanian deadlift", "rdl"],
        "exclude":  [],
        "target":   365,
    },
    "ohp": {
        "keywords": ["overhead press", "ohp", "military press", "standing press"],
        "exclude":  [],
        "target":   185,
    },
}

# Exercises that heavily tax the CNS (for CNS fatigue calculation)
CNS_HEAVY: list[str] = [
    "squat", "deadlift", "barbell row", "bent over row",
    "overhead press", "ohp", "pendlay", "military press",
]

# Sorted keyword list (longest first) for O(n) muscle lookup
_MUSCLE_KEYWORDS = sorted(EXERCISE_MUSCLE_MAP.keys(), key=len, reverse=True)


def get_muscles(exercise_name: str) -> list[str]:
    name = exercise_name.lower()
    found: set[str] = set()
    for kw in _MUSCLE_KEYWORDS:
        if kw in name:
            found.update(EXERCISE_MUSCLE_MAP[kw])
    return list(found)


def matches_lift(exercise_name: str, cfg: dict) -> bool:
    name = exercise_name.lower()
    for ex in cfg.get("exclude", []):
        if ex in name:
            return False
    return any(kw in name for kw in cfg["keywords"])


# ── Strength computation ──────────────────────────────────────────────────────

def compute_strength(workout_logs: list) -> dict:
    result: dict[str, dict] = {}

    for lift_name, cfg in TRACKED_LIFTS.items():
        # Collect max e1RM per date
        by_date: dict[str, float] = {}
        for log in workout_logs:
            date = log.get("log_date", "")
            for ex in log.get("exercises", []) or []:
                if not matches_lift(ex.get("name", ""), cfg):
                    continue
                for s in ex.get("sets", []) or []:
                    w = float(s.get("weight") or 0)
                    r = int(s.get("reps") or 0)
                    e = epley_e1rm(w, r)
                    if e > by_date.get(date, 0):
                        by_date[date] = e

        if not by_date:
            continue

        sorted_sessions = sorted(by_date.items())  # [(date, e1rm), ...]
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
        target = cfg.get("target")
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

    muscle_sets: dict[str, int] = {}

    for log in workout_logs:
        if log.get("log_date", "") < week_start:
            continue
        for ex in log.get("exercises", []) or []:
            muscles = get_muscles(ex.get("name", ""))
            sets = ex.get("sets", []) or []
            # Count sets that have either weight or reps data
            hard_sets = len([s for s in sets if s.get("weight") or s.get("reps")])
            if not hard_sets:
                continue
            for muscle in muscles:
                if muscle in MUSCLE_TARGETS:
                    muscle_sets[muscle] = muscle_sets.get(muscle, 0) + hard_sets

    # Always include the primary tracked muscles even if 0 sets
    ALWAYS_SHOW = {"quads", "hamstrings", "chest", "back", "shoulders", "rear_delts", "biceps", "triceps"}
    all_muscles = set(muscle_sets.keys()) | ALWAYS_SHOW

    result: dict[str, dict] = {}
    for muscle in sorted(all_muscles):
        if muscle not in MUSCLE_TARGETS:
            continue
        t = MUSCLE_TARGETS[muscle]
        sets = muscle_sets.get(muscle, 0)
        fatigue_score = round(min(sets / max(t["mrv"], 1), 1.0), 2)

        result[muscle] = {
            "weekly_sets":  sets,
            "mev":          t["mev"],
            "mav":          t["mav"],
            "mrv":          t["mrv"],
            "fatigue_score": fatigue_score,
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

    return {
        "atl":             atl,
        "ctl":             ctl,
        "tsb":             tsb,
        "cns_fatigue":     cns_fatigue,
        "global_fatigue":  global_fatigue,
        "interpretation":  interpretation,
    }


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

    return {
        "data_available":       True,
        "score":                score,
        "push_readiness":       readiness,
        "hrv":                  hrv,
        "sleep_score":          sleep_score,
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

    dates_desc = sorted(by_date.keys(), reverse=True)
    recent_7   = dates_desc[:7]

    avg_cal     = round(sum(by_date[d]["cal"]     for d in recent_7) / max(len(recent_7), 1))
    avg_protein = round(sum(by_date[d]["protein"] for d in recent_7) / max(len(recent_7), 1))

    calorie_adherence = round(min(avg_cal / calorie_target, 1.0), 2) if calorie_target else None

    # Weight trend (linear regression on up to 14 entries)
    weight_trend: Optional[float] = None
    if len(weight_entries) >= 3:
        sorted_w = sorted(weight_entries, key=lambda r: r.get("recorded_date", ""))
        recent_14 = sorted_w[-14:]
        base = datetime.date.fromisoformat(recent_14[0]["recorded_date"])
        x_vals = [(datetime.date.fromisoformat(r["recorded_date"]) - base).days for r in recent_14]
        y_vals = [float(r.get("weight") or 0) for r in recent_14]
        slope, _ = linear_regression(x_vals, y_vals)
        weight_trend = round(slope * 7, 2)  # lbs/week

    # Infer phase from profile
    training_phase = str(profile.get("training_phase") or "maintenance").lower()
    if "cut" in training_phase:
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
        "weight_trend_lbs_per_week": weight_trend,
        "on_track":                on_track,
    }


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

    print("\nComputing metrics...")

    strength    = compute_strength(workout_logs)
    hypertrophy = compute_hypertrophy(workout_logs)
    fatigue     = compute_fatigue(workout_logs, recovery_rows)
    recovery    = compute_recovery(recovery_rows, checkin)
    endurance   = compute_endurance(recovery_rows, pst_tests)
    nutrition   = compute_nutrition(food_entries, weight_entries, profile)

    # Summary to console
    print(f"\n  Strength lifts tracked: {list(strength.keys())}")
    if strength.get("squat"):
        sq = strength["squat"]
        print(f"    squat e1RM={sq['current_e1rm']}lbs  rate={sq['progression_rate_lbs_per_week']}lbs/wk  stall={sq['stall_risk']}")
    print(f"  Recovery: score={recovery.get('score')}  readiness={recovery.get('push_readiness')}  hrv_trend={recovery.get('hrv_trend')}")
    print(f"  Fatigue:  TSB={fatigue.get('tsb')}  CNS={fatigue.get('cns_fatigue')}  interp={fatigue.get('interpretation')}")
    print(f"  Nutrition: {nutrition.get('avg_calories_7d')} kcal avg  {nutrition.get('avg_protein_7d')}g protein  trend={nutrition.get('weight_trend_lbs_per_week')} lbs/wk")

    print("\nUpserting to athlete_state...")
    row = {
        "created_by":  USER_ID,
        "date":        TODAY,
        "strength":    strength,
        "hypertrophy": hypertrophy,
        "fatigue":     fatigue,
        "recovery":    recovery,
        "endurance":   endurance,
        "nutrition":   nutrition,
        "computed_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    ok = sb_upsert("athlete_state", row)
    if ok:
        print(f"\n✓  Athlete state written for {TODAY}")
    else:
        print(f"\n✗  Failed to write athlete state")
        sys.exit(1)


if __name__ == "__main__":
    main()
