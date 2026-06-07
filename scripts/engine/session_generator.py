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

from engine.vdot_engine import VDOTEngine


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

    # ── Bench assistance (paused-comp 315 build: raw press, lockout, upper chest) ─
    # Appended after the bench back-off — not knapsack-selected (is_assistance).
    {"name": "Close-Grip Bench Press", "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["triceps", "chest"],
     "sets": 3, "rep_target": "5",   "rir_target": 2, "rest_seconds": 150,
     "notes": "Triceps/lockout for the paused bench.", "is_assistance": True, "assist_for": "bench"},
    {"name": "Larsen Press",           "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "4-6", "rir_target": 2, "rest_seconds": 150,
     "notes": "Legs up, no leg drive — raw pressing strength off the chest.",
     "is_assistance": True, "assist_for": "bench"},
    {"name": "Incline Bench Press",    "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["chest", "front_delt", "triceps"],
     "sets": 3, "rep_target": "6-8", "rir_target": 2, "rest_seconds": 120,
     "notes": "Upper chest + press strength.", "is_assistance": True, "assist_for": "bench"},
    {"name": "Weighted Dip",           "pattern": "dip", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "6-10","rir_target": 2, "rest_seconds": 120,
     "notes": "Loaded dips — bottom-range pressing strength.",
     "is_assistance": True, "assist_for": "bench"},

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

    # ── Deadlift assistance (submax build toward 500 CONVENTIONAL, not grind) ─
    # Appended after the deadlift top set — not knapsack-selected (is_assistance).
    {"name": "Deficit Deadlift",      "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["hamstrings", "glutes", "back"],
     "sets": 4, "rep_target": "3",    "rir_target": 2, "rest_seconds": 180,
     "notes": "1-2 in deficit. Off-the-floor strength for the conventional pull.",
     "is_assistance": True, "assist_for": "deadlift"},
    {"name": "Deadlift (Speed/Light)","pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.0, "muscles": ["hamstrings", "glutes", "back"],
     "sets": 6, "rep_target": "2",    "rir_target": 4, "progression": {"daily_min_pct": 0.65},
     "rest_seconds": 90, "notes": "Submaximal speed pulls ~65-70%. Bar speed, not grind.",
     "is_assistance": True, "assist_for": "deadlift"},
    {"name": "Paused Deadlift",       "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["hamstrings", "glutes", "back"],
     "sets": 3, "rep_target": "3",    "rir_target": 2, "rest_seconds": 150,
     "notes": "1-2 ct pause below the knee. Positional strength off the floor.",
     "is_assistance": True, "assist_for": "deadlift"},

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
    {"name": "Chest-Supported Row",   "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.5, "muscles": ["upper_back", "rear_delt"],
     "sets": 4, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 90, "is_primary": True},
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
    {"name": "Pull-up Pyramid",  "pattern": "calisthenics", "type": "COMPOUND_PERIPHERAL", "fatigue_cost": 3.0,
     "muscles": ["lats","biceps"], "sets": 1, "rep_target": "1-2-3-4-5-4-3-2-1",
     "rir_target": 2, "rest_seconds": 30, "notes": "Pyramid: 1 rep rest 2 reps rest... peak at 5 back down. 25 total reps."},
    {"name": "Push-up Pyramid",  "pattern": "calisthenics", "type": "COMPOUND_PERIPHERAL", "fatigue_cost": 2.5,
     "muscles": ["chest","triceps"], "sets": 1, "rep_target": "1-2-3-4-5-4-3-2-1",
     "rir_target": 2, "rest_seconds": 30, "notes": "Pyramid: 1 rep rest 2 reps... peak at 5. 25 total. Add rounds to scale."},
    {"name": "Dip Pyramid",      "pattern": "calisthenics", "type": "COMPOUND_PERIPHERAL", "fatigue_cost": 2.5,
     "muscles": ["triceps","chest"], "sets": 1, "rep_target": "1-2-3-4-5-4-3-2-1",
     "rir_target": 2, "rest_seconds": 30, "notes": "Pyramid: same structure as pull-up pyramid. 25 total."},
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

# Assistance pools appended after the main goal lift (rotated by date, not
# knapsack-selected). Bench → paused-comp 315; deadlift → 500 conventional via
# submaximal work rather than heavy grinding.
BENCH_ASSISTANCE    = ["Close-Grip Bench Press", "Larsen Press",
                       "Incline Bench Press", "Weighted Dip"]
DEADLIFT_ASSISTANCE = ["Deficit Deadlift", "Deadlift (Speed/Light)", "Paused Deadlift"]


# ── Muscle groups per session type ───────────────────────────────────────────

UPPER_MUSCLES = ["chest", "upper_back", "lats", "shoulders", "triceps", "biceps"]
LOWER_MUSCLES = ["quads", "hamstrings", "glutes", "calves", "core"]

UPPER_FREQ = {"chest": 5, "upper_back": 3, "lats": 3, "shoulders": 3, "triceps": 4, "biceps": 2}
LOWER_FREQ = {"quads": 3, "hamstrings": 3, "glutes": 3, "calves": 3, "core": 3}

PUSH_MUSCLES = ["chest", "shoulders", "triceps"]
PULL_MUSCLES = ["upper_back", "lats", "biceps"]
LEGS_MUSCLES = ["quads", "hamstrings", "glutes", "calves", "core"]
FULL_BODY_A  = ["chest", "quads", "lats", "calves", "core"]
FULL_BODY_B  = ["hamstrings", "shoulders", "upper_back", "triceps", "glutes"]

PUSH_FREQ = {"chest": 2, "shoulders": 2, "triceps": 3}
PULL_FREQ = {"upper_back": 2, "lats": 2, "biceps": 3}
LEGS_FREQ = {"quads": 2, "hamstrings": 2, "glutes": 2, "calves": 2, "core": 2}
FULL_FREQ = {"chest": 3, "quads": 3, "lats": 3, "calves": 3, "core": 3,
             "hamstrings": 3, "shoulders": 3, "upper_back": 3, "triceps": 3, "glutes": 3}

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
                         "type", "fatigue_cost", "is_assistance", "assist_for")}


def interference_attenuation(ampk, interference_score):
    """
    #19: how much to back the lift off under concurrent-training interference.
    High AMPK suppresses mTORC1 → heavy lifting that window is lower-quality and
    less recoverable, so trim load. Returns (atten, high_interference):
      atten ∈ [0.88, 1.0]   — multiply onto strength load_pct (1.0 = rested)
      high_interference bool — also drop a working set when True
    """
    a = float(ampk or 0.20)
    s = float(interference_score or 0.0)
    atten = round(max(0.88, 1.0 - 0.30 * max(0.0, a - 0.30)), 3)
    return atten, (s > 0.5 or a > 0.55)


# ── Cardio ────────────────────────────────────────────────────────────────────

# Polarized weekly run STRUCTURE (80/20). Each run day has a base slot keyed on
# weekday so quality + long runs are spread across the week instead of every day
# collapsing to one reactively-chosen zone. Readiness can only DOWNGRADE the slot
# (concurrent heavy strength → protect recovery), never upgrade it.
#   slot order (hardest→easiest): interval > threshold > long > easy > recovery
_RUN_SLOTS = ["recovery", "easy", "long", "threshold", "interval"]

# weekday() : 0=Mon … 6=Sun → base slot. ~2 quality + 1 long, rest easy.
_WEEKDAY_SLOT = {
    0: "easy",       # Mon
    1: "threshold",  # Tue  — tempo/threshold quality
    2: "easy",       # Wed
    3: "interval",   # Thu  — VO2 / race-pace quality
    4: "easy",       # Fri
    5: "long",       # Sat  — long aerobic run
    6: "easy",       # Sun
}

_SLOT_SPEC = {
    "interval":  {"zone": "Z4-Z5", "base_dur": 45, "pace_key": "interval_pace",
                  "note": "Intervals. 6x800m or 5x1km w/ 90s jog. Target {pace}/mi."},
    "threshold": {"zone": "Z3-Z4", "base_dur": 40, "pace_key": "threshold_pace",
                  "note": "Threshold. 20-25 min continuous or 3x8 min cruise. Target {pace}/mi."},
    "long":      {"zone": "Z2",    "base_dur": 80, "pace_key": "easy_pace",
                  "note": "Long aerobic run. Conversational. Target {pace}/mi."},
    "easy":      {"zone": "Z2",    "base_dur": 50, "pace_key": "easy_pace",
                  "note": "Aerobic base. Nasal breathing. Target {pace}/mi."},
    "recovery":  {"zone": "Z1",    "base_dur": 30, "pace_key": "recovery_pace",
                  "note": "Keep HR in Z1 on your watch — let pace fall where it must (~{pace}/mi or slower). Walk if HR drifts up."},
}


def _build_cardio(sim_date: date, intensity: float, ampk: float, recent_run_tss: float,
                  readiness_z: float = 0.0, quad_soreness_avg: float = 0.0,
                  vdot: float = None) -> list:
    """
    Polarized run prescription: weekly STRUCTURE (weekday slot) + VDOT pacing,
    autoregulated DOWN by readiness. Fixes the old behavior where, with no HRV
    stream, the reactive index sat at ~-0.8 and locked every run to Z2.

    Readiness index (lower = more fatigued) downgrades the base slot by 1-2 levels;
    it never upgrades, so quality days only happen when the athlete can absorb them.
    """
    base_slot = _WEEKDAY_SLOT.get(sim_date.weekday(), "easy")
    idx = _RUN_SLOTS.index(base_slot)

    # Readiness/fatigue downgrade: poor HRV, high AMPK (glycogen-depleted / endurance
    # residual), or high quad soreness pull intensity down a notch or two.
    readiness = 1.5 * readiness_z - 4.0 * ampk - 1.5 * quad_soreness_avg
    if readiness < -1.6:
        idx -= 2
    elif readiness < -0.7:
        idx -= 1
    slot = _RUN_SLOTS[max(0, idx)]
    spec = _SLOT_SPEC[slot]

    paces = VDOTEngine(current_vdot=float(vdot) if vdot else 45.0).pace_zones()
    pace = paces.get(spec["pace_key"], "—")

    soreness_scalar = max(0.6, 1.0 - 0.1 * quad_soreness_avg)
    readiness_scale = 1.0 + 0.1 * readiness_z
    max_dur = 95 if slot == "long" else 60
    duration = int(round(spec["base_dur"] * soreness_scalar * readiness_scale))
    duration = max(25, min(max_dur, duration))

    return [{
        "activity_type":   "run",
        "run_type":        slot,
        "zone":            spec["zone"],
        "duration_minutes": duration,
        "pace":            pace,
        "notes":           f"Garmin {spec['zone']}. " + spec["note"].format(pace=pace),
    }]


# ── Split decision ────────────────────────────────────────────────────────────

def _decide_split(recent_types: list, ampk: float, mtorc1: float,
                  split_framework: str = "upper_lower") -> str:
    """
    Upper vs lower based on AMPK interference + recent session balance.
    Supports split_framework: 'upper_lower' | 'ppl' | 'full_body'
    """
    if split_framework == "full_body":
        last = next((t for t in reversed(recent_types) if "full_body" in t), "full_body_b")
        return "full_body_b" if last == "full_body_a" else "full_body_a"

    if split_framework == "ppl":
        ppl_order = ["push", "pull", "legs"]
        last_ppl = next((t for t in reversed(recent_types) if t in ppl_order), None)
        if last_ppl is None:
            return "push"
        return ppl_order[(ppl_order.index(last_ppl) + 1) % 3]

    # upper_lower: existing logic unchanged below
    # 1. Find the last strength session split to prevent consecutive identical splits
    last_strength = next((t for t in reversed(recent_types) if "upper" in t or "lower" in t), "")

    # 2. Apply cellular overrides only if they don't violate the consecutive split guardrail
    if ampk > 0.55:
        # If the last strength session was upper, we can safely do lower
        if "upper" in last_strength:
            return "lower_hinge_primary"
        # Otherwise, if the last was lower, we must do upper to allow legs to recover
        else:
            recent_upper = sum(1 for t in recent_types[-4:] if "upper" in t)
            return "upper_volume" if recent_upper % 2 == 0 else "upper_intensity"

    # If mTORC1 is extremely low, prioritize upper body volume to kickstart translation,
    # but only if the last strength session wasn't already upper body
    if mtorc1 < 0.25 and "lower" in last_strength:
        return "upper_volume"

    # 3. Default alternating split logic based on the last strength session
    if "upper" in last_strength:
        last_lower = next((t for t in reversed(recent_types) if "lower" in t), "")
        return "lower_hinge_primary" if "squat" in last_lower else "lower_squat_primary"
    elif "lower" in last_strength:
        last_upper = next((t for t in reversed(recent_types) if "upper" in t), "")
        return "upper_intensity" if "volume" in last_upper else "upper_volume"

    return "upper_volume"


SESSION_TITLE = {
    "upper_volume":        "Upper — Volume",
    "upper_intensity":     "Upper — Intensity",
    "lower_squat_primary": "Lower — Squat",
    "lower_hinge_primary": "Lower — Hinge",
    "push":                "Push Session",
    "pull":                "Pull Session",
    "legs":                "Legs Session",
    "full_body_a":         "Full Body A",
    "full_body_b":         "Full Body B",
}


# ── Assistance ────────────────────────────────────────────────────────────────

def _assistance_slot(name: str, wt: dict, intensity: float, readiness_z: float) -> dict:
    """Scale an assistance accessory by its primary muscle's weekly target, then
    apply the usual intensity/readiness scaling — same treatment as a back-off."""
    ex = copy.deepcopy(_EX_BY_NAME[name])
    pm = (ex.get("muscles") or ["chest"])[0]
    weekly = wt.get(pm, 0)
    if weekly > 0:
        baseline = 8 if pm in ("triceps", "biceps") else 12
        ex["sets"] = max(1, round(ex.get("sets", 3) * weekly / baseline))
    return _scale(ex, intensity, False, readiness_z)


# ── Knapsack session builder ──────────────────────────────────────────────────

def _build_session(
    split: str,
    intensity: float,
    ampk: float,
    rng: random.Random,
    readiness_z: float = 0.0,
    weekly_set_targets: dict = None,
    assist_week: int = 0,
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
    split_map = {
        "upper_volume":        (UPPER_MUSCLES, UPPER_FREQ),
        "upper_intensity":     (UPPER_MUSCLES, UPPER_FREQ),
        "lower_squat_primary": (LOWER_MUSCLES, LOWER_FREQ),
        "lower_hinge_primary": (LOWER_MUSCLES, LOWER_FREQ),
        "push":                (PUSH_MUSCLES,  PUSH_FREQ),
        "pull":                (PULL_MUSCLES,  PULL_FREQ),
        "legs":                (LEGS_MUSCLES,  LEGS_FREQ),
        "full_body_a":         (FULL_BODY_A,   FULL_FREQ),
        "full_body_b":         (FULL_BODY_B,   FULL_FREQ),
    }
    relevant, freq_map = split_map.get(split, (UPPER_MUSCLES, UPPER_FREQ))
    if not wt:
        wt = {m: 12 for m in relevant}

    # Patterns that may repeat (not subject to compound-pattern uniqueness constraint)
    _REPEATABLE_PATTERNS = {"isolation_upper", "isolation_lower", "calisthenics", "hip_thrust"}

    used_patterns: set = set()
    slots: list = []

    for muscle in relevant:
        weekly = wt.get(muscle, 0)
        # All exercises that hit this muscle as primary, excluding back-off and
        # assistance variants (both are appended explicitly after the goal lift).
        pool = [e for e in EXERCISES
                if muscle in (e.get("muscles") or [])
                and not e.get("is_backoff")
                and not e.get("is_assistance")]
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
        
        # Adaptive set calculation: scale exercise's default sets by current weekly target vs baseline weekly target
        if ex_copy.get("is_goal") and ("Daily Single" in ex_copy.get("name", "") or "Top Set" in ex_copy.get("name", "")):
            ex_copy["sets"] = ex_copy.get("sets", 1)
        else:
            baseline_weekly = 8 if muscle in ("triceps", "biceps") else 12
            volume_scalar = weekly / baseline_weekly
            ex_copy["sets"] = max(1, round(ex_copy.get("sets", 3) * volume_scalar))
            
        slots.append((ex_copy, muscle))

    # Sort by fatigue_cost descending (compounds first)
    slots.sort(key=lambda t: t[0].get("fatigue_cost", 2.0), reverse=True)

    exercises = []
    for ex_copy, muscle in slots:
        # Goal/Top Set exercises are always exactly their default sets (usually 1)
        if ex_copy.get("is_goal") and ("Daily Single" in ex_copy.get("name", "") or "Top Set" in ex_copy.get("name", "")):
            ex_copy["sets"] = ex_copy.get("sets", 1)

        scaled = _scale(ex_copy, intensity, ex_copy.get("is_primary", False), readiness_z)

        # Goal/Top Set exercises — _scale must not inflate them
        if scaled.get("is_goal") and ("Daily Single" in scaled.get("name", "") or "Top Set" in scaled.get("name", "")):
            scaled["sets"] = ex_copy.get("sets", 1)

        exercises.append(scaled)

        # Bench daily single → always add appropriate back-off
        if ex_copy.get("name") == "Bench Press (Daily Single)":
            bo_name = ("Bench Press (Back-off Int)"
                       if "intensity" in split or "hinge" in split
                       else "Bench Press (Back-off Vol)")
            bench_bo = copy.deepcopy(_EX_BY_NAME[bo_name])
            chest_weekly = wt.get("chest", 0)
            if chest_weekly > 0:
                baseline_weekly = 12
                volume_scalar = chest_weekly / baseline_weekly
                bench_bo["sets"] = max(1, round(bench_bo.get("sets", 5) * volume_scalar))
            else:
                bench_bo["sets"] = bench_bo.get("sets", 5)
            exercises.append(_scale(bench_bo, intensity, True, readiness_z))

            # Bench assistance toward the paused-comp 315 (Larsen / close-grip /
            # incline / weighted dip). Deterministic ISO-week rotation — each
            # variant gets equal, consistent exposure so its own e1RM history
            # accrues (instrumentation for a future assistance bandit), rather
            # than the old date-seeded random pick that sampled unevenly.
            bench_assist = BENCH_ASSISTANCE[assist_week % len(BENCH_ASSISTANCE)]
            exercises.append(
                _assistance_slot(bench_assist, wt, intensity, readiness_z))

        # Deadlift top set → build the conventional 500 via SUBMAX assistance
        # (deficit / speed-light / paused) rather than heavy grinding back-offs.
        # Same deterministic weekly rotation as bench.
        if ex_copy.get("name") == "Deadlift (Top Set)":
            dl_assist = DEADLIFT_ASSISTANCE[assist_week % len(DEADLIFT_ASSISTANCE)]
            exercises.append(
                _assistance_slot(dl_assist, wt, intensity, readiness_z))

        # Back Squat top set → add back-off when intensity allows
        if ex_copy.get("name") == "Back Squat (Top Set)" and intensity >= 0.90:
            backoff = copy.deepcopy(_EX_BY_NAME["Back Squat (Back-off)"])
            quads_weekly = wt.get("quads", 0)
            if quads_weekly > 0:
                baseline_weekly = 12
                volume_scalar = quads_weekly / baseline_weekly
                backoff["sets"] = max(1, round(backoff.get("sets", 3) * volume_scalar))
            else:
                backoff["sets"] = 3
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
                pm = ex_copy.get("muscles", [""])[0]
                weekly_tgt = wt.get(pm, 0)
                if weekly_tgt > 0:
                    baseline_weekly = 8 if pm in ("triceps", "biceps") else 12
                    volume_scalar = weekly_tgt / baseline_weekly
                    backoff["sets"] = max(1, round(backoff.get("sets", 3) * volume_scalar))
                else:
                    backoff["sets"] = max(1, backoff.get("sets", 3))
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
    quad_soreness_avg: float = 0.0,
    split_framework: str = "upper_lower",
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
        return [], _build_cardio(sim_date, intensity, ampk, recent_run_tss,
                                 readiness_z, quad_soreness_avg, vdot)

    # All other actions: build strength session via knapsack.
    # The MPC intensity scalar already encodes the physiological prescription —
    # LIGHT/DELOAD → intensity ~0.78 → _scale reduces sets and adds RIR.
    # CALISTHENICS → high-AMPK state prioritises bodyweight movements naturally.
    # No special branches needed.
    split = _decide_split(recent_session_types, ampk, mtorc1, split_framework)
    exercises = _build_session(
        split, intensity, ampk, rng,
        readiness_z=readiness_z,
        weekly_set_targets=weekly_set_targets or {},
        assist_week=sim_date.isocalendar()[1],
    )
    cardio = (_build_cardio(sim_date, intensity, ampk, recent_run_tss,
                            readiness_z, quad_soreness_avg, vdot)
              if action in ("TWO_A_DAY", "MIXED") else [])

    return exercises, cardio


def get_split(action: str, intensity: float, sim_date: date,
              cellular_state: dict = None, recent_session_types: list = None,
              split_framework: str = "upper_lower") -> str:
    if action == "REST":
        return "rest"
    if action == "CARDIO":
        return "cardio"
    if cellular_state is None:       cellular_state       = {}
    if recent_session_types is None: recent_session_types = []
    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)
    return _decide_split(recent_session_types, ampk, mtorc1, split_framework)


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
        recent_session_types: list = None,
        soreness_by_muscle: dict = None,
        phase: str = None,
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
            recent_session_types=recent_session_types or [],
            recent_run_tss=0.0,
            vdot=vdot,
            weekly_set_targets=weekly_set_targets,
            readiness_z=readiness_z,
        )

        # Per-muscle soreness → trim sets on a muscle the athlete logged as sore
        # this morning (his own input, not engine sandbagging). Sore ≥2/5 drops a
        # set on exercises whose PRIMARY muscle is that region; ≥4 drops two.
        if soreness_by_muscle:
            _ALIAS = {"front_delt": "shoulders", "side_delt": "shoulders",
                      "rear_delt": "shoulders", "delts": "shoulders", "core": "abs",
                      "lats": "back", "upper_back": "back", "traps": "back"}
            _primary = {e["name"]: (e.get("muscles") or [None])[0] for e in EXERCISES}
            for ex in exercises:
                pm = _primary.get(ex.get("name"))
                if not pm:
                    continue
                region = _ALIAS.get(pm, pm)
                lvl = int(soreness_by_muscle.get(region, 0) or 0)
                if lvl >= 2 and ex.get("sets"):
                    cut = 2 if lvl >= 4 else 1
                    ex["sets"] = max(1, int(ex["sets"]) - cut)
                    if ex.get("rir_target") is not None:
                        ex["rir_target"] = int(ex["rir_target"]) + 1
                    ex["soreness_note"] = f"{region} sore ({lvl}/5) — trimmed {cut} set"

        # Cut volume management (TNF): on a cut, keep the WEIGHT heavy — trim
        # back-off/volume sets, never the heavy top sets, and never the load/RIR.
        # Top sets (is_primary / is_goal, not is_backoff) are untouched.
        if (phase or "").lower() == "cut":
            _backoff = {e["name"]: bool(e.get("is_backoff")) for e in EXERCISES}
            for ex in exercises:
                if _backoff.get(ex.get("name")) and ex.get("sets"):
                    ex["sets"] = max(1, round(int(ex["sets"]) * 0.6))  # [ENG] -40% back-off volume
                    ex["cut_note"] = "cut: back-off volume trimmed, weight kept heavy"

        # Format complete prescription dict
        strength_block = []
        calisthenics_block = {}
        run_block = None
        swim_block = None

        # ── #19: interference actually PROTECTS the lift (not just a banner) ──
        # High AMPK / concurrent-endurance load suppresses mTORC1, so heavy lifting
        # in that window is both lower-quality and less recoverable. Back the lift
        # off — trim the load and a working set — instead of only warning.
        # interference_atten: 1.0 when rested (AMPK≈0.20) → floor 0.88 when very hot.
        interference_atten, high_interference = interference_attenuation(
            cellular_state.get("ampk"), cellular_state.get("interference_score")
        )

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
            # Strength volume backs off a working set in a high-interference window
            # (calisthenics are already AMPK-prioritised, so leave them).
            if high_interference and not is_cal and sets > 1:
                sets = sets - 1
            reps = ex.get("rep_target", "10")
            rir = ex.get("rir_target", 2)
            
            # Estimate loads if possible
            load_lbs = 0.0
            load_pct = 0.0
            
            # Map lift names → the goal-lift keys emitted by compute_strength
            # (GOAL_TARGETS names). Assistance variants (close-grip, incline,
            # deficit, paused) inherit their parent goal lift's e1RM for load
            # estimation; the RIR target then autoregulates the actual weight.
            lift_key = None
            name_l = name.lower()
            if "bench" in name_l:
                lift_key = "Bench (paused comp)"
            elif "squat" in name_l:
                lift_key = "Squat (comp)"
            elif "deadlift" in name_l:
                lift_key = "Deadlift (conventional comp)"

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
                    load_pct = load_pct * mpc_intensity * interference_atten
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
                "notes": (
                    (ex.get("notes", "") + " · " if ex.get("notes") else "")
                    + "load backed off — high concurrent-training interference"
                ) if (not is_cal and (high_interference or interference_atten < 0.97))
                else ex.get("notes", ""),
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

        # Resolve split title or split key
        split = get_split(mpc_action, mpc_intensity, sim_date, cellular_state, recent_session_types)

        return {
            "session_type": session_type,
            "split": split,
            "rationale": rationale,
            "interference_warning": warning,
            "strength_block": strength_block,
            "calisthenics_block": calisthenics_block,
            "run_block": run_block,
            "swim_block": swim_block,
            "exercises": exercises,
            "cardio_sessions": cardio
        }
