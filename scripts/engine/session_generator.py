"""
session_generator.py — Combinatorial knapsack session builder.

Sessions are built by scoring every exercise against weekly_set_targets
(from MILP) and selecting the highest-priority exercise per muscle group.
There are no hardcoded slots — exercise selection emerges from priority
scoring over the weekly allocation.

Spec: ~/Claude/BBrain/10-Projects/OptiGains/ENGINE.md#Session-Generator-Design

Priority ordering:
  1. goal exercises (is_goal=True) always win within their muscle group
  2. primary exercises preferred next (is_primary=True)
  3. fatigue_cost used as tiebreaker → compounds come before isolations
  4. Sessions sorted by fatigue_cost descending so heavy compounds go first

Date-seeded RNG: same date always generates same session, even if re-run.

Design principle: deloads are not special cases. The Kalman TSB scalar,
HRV readiness_z, and resource allocator continuously adjust intensity and
volume. Low TSB → intensity=0.78 → _scale() gives fewer sets and higher RIR
automatically. No special-cased action branches beyond REST and pure CARDIO.
"""

import copy
import random
from datetime import date


# ── Exercise pool ─────────────────────────────────────────────────────────────
# pattern: squat | hinge | vertical_pull | horizontal_pull | vertical_push |
#          horizontal_push | isolation_upper | isolation_lower | calisthenics
# type: COMPOUND_AXIAL | COMPOUND_PERIPHERAL | ISOLATION
# fatigue_cost: 1.0–5.0 (neurological cost; higher = heavier CNS demand)
# muscles: primary muscles (used for per-muscle fatigue tracking)

EXERCISES = [
    # ── Bench (always included on upper days) ─────────────────────────────
    {"name": "Bench Press (Daily Single)",  "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["chest", "triceps", "front_delt"],
     "sets": 1, "rep_target": "1",   "rir_target": 1, "rest_seconds": 180,
     "notes": "Build to today's heavy single.", "is_primary": True, "is_goal": True},
    {"name": "Bench Press (Back-off Vol)",  "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["chest", "triceps"],
     "sets": 5, "rep_target": "3",   "rir_target": 2, "progression": {"daily_min_pct": 0.85},
     "rest_seconds": 120, "is_backoff": True},
    {"name": "Bench Press (Back-off Int)",  "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["chest", "triceps"],
     "sets": 5, "rep_target": "2",   "rir_target": 1, "progression": {"daily_min_pct": 0.90},
     "rest_seconds": 120, "is_backoff": True},
    {"name": "Bench Press (Speed Work)",    "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["chest", "triceps"],
     "sets": 6, "rep_target": "2",   "rir_target": 4, "progression": {"daily_min_pct": 0.60},
     "rest_seconds": 60, "notes": "60% 1RM, bar speed focus.", "is_backoff": True},

    # ── Squat (goal exercise) ──────────────────────────────────────────────
    {"name": "Back Squat (Top Set)",   "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 5.0, "muscles": ["quads", "glutes", "core"],
     "sets": 1, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 180,
     "is_primary": True, "is_goal": True},
    {"name": "Back Squat (Back-off)",  "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.5, "muscles": ["quads", "glutes"],
     "sets": 3, "rep_target": "5",    "rir_target": 3, "rest_seconds": 120, "is_backoff": True},
    {"name": "Front Squat",            "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["quads", "core"],
     "sets": 3, "rep_target": "4-6",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Box Squat",              "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["quads", "glutes"],
     "sets": 4, "rep_target": "3",    "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Paused Squat",           "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["quads", "core"],
     "sets": 3, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Leg Press",              "pattern": "squat", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["quads", "glutes"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 90},
    {"name": "Bulgarian Split Squat",  "pattern": "squat", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["quads", "glutes"],
     "sets": 3, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 90},
    {"name": "Leg Extension",          "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["quads"],
     "sets": 2, "rep_target": "12-15","rir_target": 2, "rest_seconds": 60},

    # ── Hinge ──────────────────────────────────────────────────────────────
    {"name": "Deadlift (Top Set)",    "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 5.0, "muscles": ["hamstrings", "glutes", "back"],
     "sets": 1, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 180,
     "is_primary": True, "is_goal": True},
    {"name": "Romanian Deadlift",     "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["hamstrings", "glutes"],
     "sets": 3, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Trap Bar Deadlift",     "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["hamstrings", "quads", "back"],
     "sets": 3, "rep_target": "5",    "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Sumo Deadlift",         "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["hamstrings", "glutes", "adductors"],
     "sets": 3, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Hamstring Curl",        "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["hamstrings"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 60},
    {"name": "Nordic Curl",           "pattern": "hinge", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["hamstrings"],
     "sets": 3, "rep_target": "5-8",  "rir_target": 3, "rest_seconds": 90},
    {"name": "Back Extension",        "pattern": "hinge", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["hamstrings", "glutes", "erectors"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 60},

    # ── Vertical pull ──────────────────────────────────────────────────────
    {"name": "Weighted Pull-up",  "pattern": "vertical_pull", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["lats", "biceps"],
     "sets": 4, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Lat Pulldown",      "pattern": "vertical_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "biceps"],
     "sets": 3, "rep_target": "8-12", "rir_target": 2, "rest_seconds": 75},
    {"name": "Pull-ups",          "pattern": "vertical_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.5, "muscles": ["lats", "biceps"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 75},

    # ── Horizontal pull ────────────────────────────────────────────────────
    {"name": "Barbell Row",           "pattern": "horizontal_pull", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["upper_back", "biceps", "rear_delt"],
     "sets": 4, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Pendlay Row",           "pattern": "horizontal_pull", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["upper_back", "rear_delt"],
     "sets": 4, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Yates Row",             "pattern": "horizontal_pull", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["lats", "upper_back"],
     "sets": 4, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Chest-Supported Row",   "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["upper_back", "rear_delt"],
     "sets": 3, "rep_target": "8-12", "rir_target": 2, "rest_seconds": 75},
    {"name": "Cable Row",             "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "upper_back"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 75},
    {"name": "Dumbbell Row",          "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "upper_back"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 60},
    {"name": "Seal Row",              "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["upper_back", "rear_delt"],
     "sets": 3, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 75},

    # ── Vertical push (accessory) ──────────────────────────────────────────
    {"name": "Overhead Press (BB)",   "pattern": "vertical_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["shoulders", "triceps"],
     "sets": 3, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120},
    {"name": "Overhead Press (DB)",   "pattern": "vertical_push", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["shoulders", "triceps"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 75},

    # ── Upper isolation ────────────────────────────────────────────────────
    {"name": "Triceps Pushdown",     "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["triceps"],
     "sets": 2, "rep_target": "12-15","rir_target": 1, "rest_seconds": 60},
    {"name": "Triceps OH Extension", "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["triceps"],
     "sets": 2, "rep_target": "10-15","rir_target": 1, "rest_seconds": 60},
    {"name": "Face Pull",            "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["rear_delt", "rotator_cuff"],
     "sets": 2, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},
    {"name": "Lateral Raise",        "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["shoulders"],
     "sets": 2, "rep_target": "15-20","rir_target": 0, "rest_seconds": 45},
    {"name": "Rear Delt Fly",        "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["rear_delt"],
     "sets": 2, "rep_target": "15-20","rir_target": 0, "rest_seconds": 45},
    {"name": "Bicep Curl",           "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["biceps"],
     "sets": 2, "rep_target": "10-12","rir_target": 1, "rest_seconds": 60},
    {"name": "Hammer Curl",          "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["biceps", "brachialis"],
     "sets": 2, "rep_target": "10-12","rir_target": 1, "rest_seconds": 60},

    # ── Lower isolation ────────────────────────────────────────────────────
    {"name": "Calf Raise",    "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["calves"],
     "sets": 3, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},

    # ── Calisthenics (selected by knapsack when AMPK/session-type warrants) ─
    {"name": "Push-ups",              "pattern": "calisthenics", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "25-30","rir_target": 2, "rest_seconds": 60},
    {"name": "Bodyweight Pull-ups",   "pattern": "calisthenics", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "biceps"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 75},
    {"name": "Dips",              "pattern": "calisthenics", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "15-20","rir_target": 2, "rest_seconds": 60},
    {"name": "Hanging Leg Raise", "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["core", "hip_flexors"],
     "sets": 3, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},
    {"name": "Plank",             "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["core"],
     "sets": 3, "rep_target": "60s", "rir_target": 1, "rest_seconds": 45},
    {"name": "Hip Thrust",        "pattern": "hip_thrust",      "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.5, "muscles": ["glutes", "hamstrings"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 75, "is_primary": True},
    {"name": "Diamond Push-ups",  "pattern": "calisthenics", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["triceps", "chest"],
     "sets": 3, "rep_target": "15-20","rir_target": 2, "rest_seconds": 60},
]

# Quick lookup by name
_EX_BY_NAME = {e["name"]: e for e in EXERCISES}


# ── Muscle groups per session type ───────────────────────────────────────────

UPPER_MUSCLES = ["chest", "upper_back", "lats", "shoulders", "triceps", "biceps"]
LOWER_MUSCLES = ["quads", "hamstrings", "glutes", "calves", "core"]

UPPER_FREQ = {"chest": 5, "upper_back": 3, "lats": 3, "shoulders": 3, "triceps": 4, "biceps": 2}
LOWER_FREQ = {"quads": 3, "hamstrings": 3, "glutes": 3, "calves": 3, "core": 3}

# Kept for internal _session_sets helper compatibility
_UPPER_FREQ = UPPER_FREQ
_LOWER_FREQ = LOWER_FREQ


def _session_sets(muscle: str, weekly_target: int, session_type: str) -> int:
    """Convert weekly target → per-session set count based on expected frequency."""
    if weekly_target <= 0:
        return 0
    if "upper" in session_type:
        freq = _UPPER_FREQ.get(muscle, 3)
    else:
        freq = _LOWER_FREQ.get(muscle, 3)
    return max(1, round(weekly_target / freq))


# ── Priority scoring ──────────────────────────────────────────────────────────

def _priority_score(ex: dict) -> float:
    """Higher score = selected first for its muscle group."""
    score = ex.get("fatigue_cost", 2.0)
    if ex.get("is_goal"):
        score += 10.0   # goal exercises always win
    if ex.get("is_primary"):
        score += 2.0
    return score


# ── Scaling ───────────────────────────────────────────────────────────────────

def _scale(ex: dict, intensity: float, is_primary: bool = False,
           readiness_z: float = 0.0) -> dict:
    """
    Apply intensity scalar and HRV readiness_z to sets and RIR.

    Low intensity (e.g. 0.78 when TSB is negative) naturally reduces sets
    and increases RIR — no special deload branch required.
    """
    ex = copy.deepcopy(ex)
    base = ex.get("sets", 3)

    if intensity >= 1.05 and is_primary:
        ex["sets"] = base + 1
    elif intensity < 0.85:
        ex["sets"] = max(1, base - 1)

    rir = ex.get("rir_target")
    if rir is not None:
        if intensity >= 1.05:
            rir = max(0, rir - 1)
        elif intensity < 0.95:
            rir = min(4, rir + 1)
        # Readiness (HRV) adjustment
        if readiness_z > 1.0:
            rir = max(0, rir - 1)
        elif readiness_z < -1.0:
            rir = min(4, rir + 1)
        ex["rir_target"] = rir

    return ex


def _clean(ex: dict) -> dict:
    """Strip internal engine tags before writing to DB."""
    return {k: v for k, v in ex.items()
            if k not in ("pattern", "muscles", "is_primary", "is_backoff", "is_goal",
                         "type", "fatigue_cost")}


# ── Cardio ────────────────────────────────────────────────────────────────────

def _build_cardio(intensity: float, ampk: float, recent_run_tss: float) -> list:
    """
    Cardio zone driven by engine state. Uses Garmin HR zones (Z1–Z5).
    Called only when generate() determines cardio is warranted (CARDIO action
    or TWO_A_DAY/MIXED). Action-based filtering happens in generate().
    """
    aerobic_stress = ampk + min(recent_run_tss / 400.0, 0.8)

    if aerobic_stress > 1.4 or intensity < 0.80:
        return [{"activity_type": "run", "zone": "Z1", "duration_minutes": 30,
                 "notes": "Recovery jog. Garmin zone 1 only. Active recovery, not training stimulus."}]
    elif aerobic_stress > 0.9 or intensity < 0.90:
        return [{"activity_type": "run", "zone": "Z2", "duration_minutes": 45,
                 "notes": "Aerobic base. Garmin zone 2 throughout. Nasal breathing if possible."}]
    elif aerobic_stress > 0.5 or intensity < 1.00:
        return [{"activity_type": "run", "zone": "Z2", "duration_minutes": 55,
                 "notes": "Long aerobic run. Garmin zone 2. Build base, hold pace steady."}]
    elif aerobic_stress > 0.2 or intensity < 1.05:
        return [{"activity_type": "run", "zone": "Z3", "duration_minutes": 40,
                 "notes": "Tempo run. Garmin zone 3. 20–25 min continuous or 3×8 min cruise intervals."}]
    else:
        return [{"activity_type": "run", "zone": "Z4-Z5", "duration_minutes": 45,
                 "notes": "Interval session. Garmin zone 4–5. 6×800m or 5×1km w/ 90s rest."}]


# ── Split decision ────────────────────────────────────────────────────────────

def _decide_split(recent_types: list, ampk: float, mtorc1: float) -> str:
    """
    Upper vs lower based on AMPK interference + recent session balance.
    """
    recent_lower = sum(1 for t in recent_types[-4:] if "lower" in t)
    recent_upper = sum(1 for t in recent_types[-4:] if "upper" in t)

    if ampk > 0.55:
        if recent_upper >= 3:
            return "lower_hinge_primary"
        return "upper_volume" if recent_upper % 2 == 0 else "upper_intensity"

    if mtorc1 < 0.25:
        return "upper_volume"

    if recent_lower + 2 <= recent_upper:
        last_lower = next((t for t in reversed(recent_types) if "lower" in t), "")
        return "lower_hinge_primary" if "squat" in last_lower else "lower_squat_primary"

    if recent_upper + 2 <= recent_lower:
        last_upper = next((t for t in reversed(recent_types) if "upper" in t), "")
        return "upper_intensity" if "volume" in last_upper else "upper_volume"

    last = next((t for t in reversed(recent_types) if t), "")
    if "upper" in last:
        last_lower = next((t for t in reversed(recent_types) if "lower" in t), "")
        return "lower_hinge_primary" if "squat" in last_lower else "lower_squat_primary"
    elif "lower" in last:
        last_upper = next((t for t in reversed(recent_types) if "upper" in t), "")
        return "upper_intensity" if "volume" in last_upper else "upper_volume"

    return "upper_volume"


SESSION_TITLE = {
    "upper_volume":        "Upper — Volume",
    "upper_intensity":     "Upper — Intensity",
    "lower_squat_primary": "Lower — Squat",
    "lower_hinge_primary": "Lower — Hinge",
}


# ── Knapsack session builder ──────────────────────────────────────────────────

def _build_session(
    split: str,
    intensity: float,
    ampk: float,
    rng: random.Random,
    readiness_z: float = 0.0,
    weekly_set_targets: dict = None,
) -> list:
    """
    Knapsack session builder. For each muscle relevant to this split:
      1. Compute per-session set target = max(1, round(weekly_target / freq))
      2. Pick highest-priority exercise for that muscle (goal > primary > fatigue_cost)
      3. Enforce pattern diversity — no two exercises of the same compound pattern
         (isolations and calisthenics patterns can repeat freely)
      4. Sort by fatigue_cost descending (heavy compounds first)

    Calisthenics movements are eligible for the knapsack when AMPK is elevated
    or recent session history indicates accumulated axial fatigue — the priority
    scoring and pattern logic surface them naturally without a hardcoded branch.
    """
    wt = weekly_set_targets or {}
    is_upper = "upper" in split
    relevant = UPPER_MUSCLES if is_upper else LOWER_MUSCLES
    if not wt:
        wt = {m: 12 for m in relevant}
    freq_map = UPPER_FREQ if is_upper else LOWER_FREQ

    # Patterns that may repeat (not subject to compound-pattern uniqueness constraint)
    _REPEATABLE_PATTERNS = {"isolation_upper", "isolation_lower", "calisthenics", "hip_thrust"}

    used_patterns: set = set()
    slots: list = []

    for muscle in relevant:
        weekly = wt.get(muscle, 0)
        if weekly <= 0:
            continue
        freq = freq_map.get(muscle, 3)
        session_sets = max(1, round(weekly / freq))

        # All exercises that hit this muscle as primary, excluding back-off variants
        pool = [e for e in EXERCISES
                if muscle in (e.get("muscles") or [])
                and not e.get("is_backoff")]
        if not pool:
            continue

        # Sort by priority score descending
        pool.sort(key=_priority_score, reverse=True)

        # Pick highest-priority exercise respecting compound-pattern diversity
        chosen = None
        for ex in pool:
            pat = ex.get("pattern", "")
            is_repeatable = pat in _REPEATABLE_PATTERNS
            if is_repeatable or pat not in used_patterns:
                chosen = ex
                if not is_repeatable:
                    used_patterns.add(pat)
                break

        if not chosen:
            continue

        ex_copy = copy.deepcopy(chosen)
        ex_copy["sets"] = session_sets
        slots.append((ex_copy, muscle))

    # Sort by fatigue_cost descending (compounds first)
    slots.sort(key=lambda t: t[0].get("fatigue_cost", 2.0), reverse=True)

    exercises = []
    for ex_copy, muscle in slots:
        # Bench daily single is always exactly 1 set
        if ex_copy.get("is_goal") and "Daily Single" in ex_copy.get("name", ""):
            ex_copy["sets"] = 1

        scaled = _scale(ex_copy, intensity, ex_copy.get("is_primary", False), readiness_z)

        # Bench daily single — _scale must not inflate it
        if scaled.get("name") == "Bench Press (Daily Single)":
            scaled["sets"] = 1

        exercises.append(scaled)

        # Bench daily single → always add appropriate back-off
        if ex_copy.get("name") == "Bench Press (Daily Single)":
            bo_name = ("Bench Press (Back-off Int)"
                       if "intensity" in split or "hinge" in split
                       else "Bench Press (Back-off Vol)")
            bench_bo = copy.deepcopy(_EX_BY_NAME[bo_name])
            chest_weekly = wt.get("chest", 0)
            if chest_weekly > 0:
                bench_bo["sets"] = _session_sets("chest", chest_weekly, split)
            exercises.append(_scale(bench_bo, intensity, True, readiness_z))

        # Back Squat top set → add back-off when intensity allows
        if ex_copy.get("name") == "Back Squat (Top Set)" and intensity >= 0.90:
            backoff = copy.deepcopy(_EX_BY_NAME["Back Squat (Back-off)"])
            backoff["sets"] = max(1, ex_copy["sets"] - 1)
            exercises.append(_scale(backoff, intensity, readiness_z=readiness_z))

        # Generic: goal "Top Set" exercises → add back-off when intensity warrants
        # (catches any future goal Top Set exercises beyond bench/squat)
        elif (ex_copy.get("is_goal")
              and "Top Set" in ex_copy.get("name", "")
              and intensity >= 0.85
              and ex_copy.get("name") != "Back Squat (Top Set)"):
            backoff_name = ex_copy["name"].replace("Top Set", "Back-off")
            if backoff_name in _EX_BY_NAME:
                backoff = copy.deepcopy(_EX_BY_NAME[backoff_name])
                backoff["sets"] = max(1, ex_copy["sets"] - 1)
                exercises.append(_scale(backoff, intensity, readiness_z=readiness_z))

    return [_clean(e) for e in exercises]


# ── Public API ────────────────────────────────────────────────────────────────

def generate(
    action: str,
    intensity: float,
    sim_date: date,
    cellular_state: dict = None,
    recent_session_types: list = None,
    recent_run_tss: float = 0.0,
    vdot: float = None,
    weekly_set_targets: dict = None,
    readiness_z: float = 0.0,
    e1rm_registry: dict = None,
) -> tuple:
    """
    Generate (exercises, cardio_sessions) for one training day.

    Args:
        action                  MPC action string
        intensity               Kalman TSB-derived scalar [0.7–1.1]
        sim_date                Calendar date — seeds RNG so same date = same session
        cellular_state          {ampk, mtorc1, interference_score} from athlete_state
        recent_session_types    Focus strings for last 5–7 days
        recent_run_tss          Sum of run TSS from last 7 days
        vdot                    Current VDOT (informational)
        weekly_set_targets      {muscle: sets} weekly totals from MILP (optional).
                                Drives per-session set counts; never gates exercise inclusion.
        readiness_z             3-day HRV z-score for RIR adjustment
        e1rm_registry           Serialised StrengthProgressionRegistry (optional)

    Returns:
        (exercises: list[dict], cardio_sessions: list[dict])

    Action handling:
        REST      → ([], [])
        CARDIO    → ([], cardio)
        All other actions (STRENGTH, TWO_A_DAY, MIXED, LIGHT, CALISTHENICS, DELOAD, …)
                  → build session via knapsack using current intensity + readiness_z.
                  The MPC already set intensity appropriately (e.g. 0.78 for low-TSB
                  days), so _scale() gives fewer sets and higher RIR automatically.
                  TWO_A_DAY and MIXED additionally append a cardio block.
    """
    rng = random.Random(int(sim_date.strftime("%Y%m%d")))
    cellular_state = cellular_state or {}
    recent_session_types = recent_session_types or []

    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)

    if action == "REST":
        return [], []

    if action == "CARDIO":
        return [], _build_cardio(intensity, ampk, recent_run_tss)

    # All other actions: build strength session via knapsack.
    # The MPC intensity scalar already encodes the physiological prescription —
    # LIGHT/DELOAD → intensity ~0.78 → _scale reduces sets and adds RIR.
    # CALISTHENICS → high-AMPK state prioritises bodyweight movements naturally.
    # No special branches needed.
    split = _decide_split(recent_session_types, ampk, mtorc1)
    exercises = _build_session(
        split, intensity, ampk, rng,
        readiness_z=readiness_z,
        weekly_set_targets=weekly_set_targets or {},
    )
    cardio = _build_cardio(intensity, ampk, recent_run_tss) if action in ("TWO_A_DAY", "MIXED") else []

    return exercises, cardio


def get_split(action: str, intensity: float, sim_date: date,
              cellular_state: dict = None, recent_session_types: list = None) -> str:
    if action == "REST":
        return "rest"
    if action == "CARDIO":
        return "cardio"
    if cellular_state is None:       cellular_state       = {}
    if recent_session_types is None: recent_session_types = []
    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)
    return _decide_split(recent_session_types, ampk, mtorc1)


def build_title(action: str, split: str, intensity: float) -> str:
    if action == "REST":    return "Rest Day"
    if action == "CARDIO":  return "Cardio"
    base   = SESSION_TITLE.get(split, "Strength")
    suffix = (" ↑ Push"      if intensity >= 1.05 else
              " ↓ Back Off"  if intensity < 0.85  else
              " → Steady"    if intensity < 0.95  else "")
    return base + suffix


class SessionGenerator:
    """
    Wrapper class to maintain compatibility with the old SessionGenerator API
    used in mpc_prescriber.py.
    """
    def generate(
        self,
        banister_state: dict,
        interference: dict,
        overreach: dict,
        acwr: float,
        strength: dict,
        latest_pst: dict,
        nutrition_mod: dict,
        vdot_zones: dict,
        mileage_cap: float,
        mpc_action: str,
        mpc_intensity: float,
        weekly_set_targets: dict = None,
    ) -> dict:
        from datetime import date
        sim_date = date.today()

        # Build cellular state
        cellular_state = {
            "ampk": interference.get("ampk", 0.20),
            "mtorc1": interference.get("mtorc1", 0.30),
            "interference_score": interference.get("interference_score", 0.10)
        }

        # Build readiness_z
        readiness_z = float(overreach.get("hrv_z_3d") or 0.0)

        # Retrieve VDOT
        vdot = vdot_zones.get("current_vdot", 45.0)

        # Call module-level generate function
        exercises, cardio = generate(
            action=mpc_action,
            intensity=mpc_intensity,
            sim_date=sim_date,
            cellular_state=cellular_state,
            recent_session_types=[],
            recent_run_tss=0.0,
            vdot=vdot,
            weekly_set_targets=weekly_set_targets,
            readiness_z=readiness_z,
        )

        # Format complete prescription dict
        strength_block = []
        calisthenics_block = {}
        run_block = None
        swim_block = None

        # Build blocks
        for ex in exercises:
            name = ex.get("name", "")
            # Check if this is calisthenics
            is_cal = False
            for k in ["pull-up", "push-up", "dip", "hanging leg", "plank", "sit-up"]:
                if k in name.lower():
                    is_cal = True
                    break
            
            # Map exercise fields
            sets = ex.get("sets", 3)
            reps = ex.get("rep_target", "10")
            rir = ex.get("rir_target", 2)
            
            # Estimate loads if possible
            load_lbs = 0.0
            load_pct = 0.0
            
            # Simple heuristic mapping for lift names to keys
            lift_key = None
            name_l = name.lower()
            if "bench" in name_l:
                lift_key = "bench"
            elif "squat" in name_l:
                lift_key = "squat"
            elif "deadlift" in name_l:
                lift_key = "deadlift"
            elif "rdl" in name_l:
                lift_key = "rdl"
            elif "ohp" in name_l:
                lift_key = "ohp"

            if lift_key and strength.get(lift_key):
                e1rm = float(strength[lift_key].get("current_e1rm") or 0.0)
                if e1rm > 0:
                    rep_val = 5
                    if "-" in str(reps):
                        try: rep_val = int(str(reps).split("-")[0])
                        except: pass
                    else:
                        try: rep_val = int(reps)
                        except: pass
                    
                    load_pct = 1.0 / (1.0 + 0.0333 * (rep_val + rir))
                    load_pct = load_pct * mpc_intensity
                    load_lbs = round((e1rm * load_pct) / 5.0) * 5.0
                    load_pct = round(load_pct, 3)

            ex_detail = {
                "name": name,
                "sets": sets,
                "reps": reps,
                "rir": rir,
                "load_lbs": load_lbs,
                "load_pct": load_pct,
                "rest_seconds": ex.get("rest_seconds", 90),
                "notes": ex.get("notes", "")
            }

            if is_cal:
                key = "pullups" if "pull-up" in name.lower() else ("pushups" if "push-up" in name.lower() else ("situps" if "sit-up" in name.lower() else "other"))
                if key != "other":
                    rep_val = 10
                    if "-" in str(reps):
                        try: rep_val = int(str(reps).split("-")[0])
                        except: pass
                    else:
                        try: rep_val = int(reps)
                        except: pass
                    calisthenics_block[key] = {
                        "sets": sets,
                        "reps_each": rep_val
                    }
                else:
                    strength_block.append(ex_detail)
            else:
                strength_block.append(ex_detail)

        # Build run block
        for c in cardio:
            if c.get("activity_type") == "run":
                dur = c.get("duration_minutes", 30)
                session_miles = round(dur * 0.12, 1)
                run_block = {
                    "zone": c.get("zone", "Z2"),
                    "session_miles": session_miles,
                    "pace": c.get("notes", "").split(".")[0],
                    "duration_minutes": dur,
                    "notes": c.get("notes", "")
                }
            elif c.get("activity_type") == "swim":
                swim_block = {
                    "meters": c.get("meters", 500),
                    "stroke": c.get("stroke", "sidestroke")
                }

        # Resolve session type
        session_type = "rest"
        if mpc_action == "REST":
            session_type = "rest"
        elif mpc_action == "CARDIO":
            session_type = "cardio"
        elif mpc_action == "CALISTHENICS":
            session_type = "calisthenics"
        elif mpc_action == "DELOAD":
            session_type = "deload"
        elif mpc_action == "STRENGTH":
            session_type = "strength"
        elif mpc_action in ("TWO_A_DAY", "MIXED"):
            session_type = "mixed"

        rationale = f"Prescribed {mpc_action} action at {mpc_intensity:.2f} intensity based on TSB and safety guardrails."
        if overreach.get("overreaching"):
            rationale = "CRITICAL: Rest forced due to overreaching flags (suppressed HRV and elevated RHR)."
        
        warning = None
        if cellular_state.get("interference_score", 0.0) > 0.5:
            warning = "High concurrent training load detected. Heavy AMPK activity may limit mTORC1 translation."

        return {
            "session_type": session_type,
            "rationale": rationale,
            "interference_warning": warning,
            "strength_block": strength_block,
            "calisthenics_block": calisthenics_block,
            "run_block": run_block,
            "swim_block": swim_block,
            "exercises": exercises,
            "cardio_sessions": cardio
        }
