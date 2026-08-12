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
import re
from datetime import date

from engine.vdot_engine import VDOTEngine
from engine.athlete_profile import (apply_philosophy, MUSCLE_EMPHASIS,
                                    target_exercises_per_session,
                                    MANDATORY_ISOLATION_MUSCLES,
                                    MIN_EXERCISES_PER_SESSION,
                                    split_type as _split_type_of)
from engine.log_ingest import canon
from engine.muscle_map import get_joint_action

# How strongly the learned exercise-value posterior (learners.exercise_value) and
# note-caution shift exercise selection. Caution stays BELOW the goal-lift bonus
# (+10 in _priority_score) so a vague note never auto-drops a competition lift —
# it deprioritizes accessories and surfaces in the brief instead. [ENG]
EXVAL_SELECT_WEIGHT = 1.5
CAUTION_PENALTY     = 8.0
# Explicit athlete preference (user_profiles.exercise_preferences) — the "like"
# button writes here. A `preferred` (liked) movement gets a fixed selection bonus
# set to DECISIVELY win its muscle slot: it must beat is_primary (+2) AND a strong
# learned exercise-value (EXVAL_SELECT_WEIGHT × posterior, up to ~±3), so that when
# the engine needs an exercise for a muscle the athlete liked, it goes to a liked
# one. Kept BELOW the +10 goal-lift bonus so it never displaces a competition lift.
# A `blocked` movement is filtered out entirely — knapsack pool AND assistance pools.
PREFER_SELECT_WEIGHT = 8.0

# Gap #4 (OHP-vs-bench redundancy): compute_joint_action_volume() counts weekly
# hard sets PER JOINT ACTION (Clark Kent's counting unit), independent of
# muscle-level credit — a bench-heavy week reads as chest/triceps "covered" even
# when vertical_push (OHP) sits at zero, because muscle-level selection never
# saw the two patterns as distinct. This boost makes an under-target joint
# action's own exercises win their muscle slot instead of losing every tiebreak
# to whichever pattern already dominates that muscle. Kept below PREFER (+8) —
# an explicit like still wins — but above EXVAL (±3 max) so it isn't drowned out
# by a mild learned-value edge for the over-represented pattern. [ENG]
JOINT_ACTION_UNDER_TARGET_BOOST = 5.0

# Per-session set scaling: a muscle's per-session sets = catalog default × (weekly
# target / baseline weekly). The baseline is the weekly volume at which the catalog
# default sets are "right"; small/isolation muscles carry less. Named so the
# conversion denominator is a documented knob, not a buried literal (F11). [ENG]
BASELINE_WEEKLY_SMALL   = 8
BASELINE_WEEKLY_DEFAULT = 12
_SMALL_BASELINE_MUSCLES = {"triceps", "biceps", "side_delts", "traps", "neck",
                           "rear_delts", "upper_chest"}


def _baseline_weekly(muscle: str) -> int:
    """Baseline weekly sets for the per-session volume scalar (F11)."""
    return (BASELINE_WEEKLY_SMALL if muscle in _SMALL_BASELINE_MUSCLES
            else BASELINE_WEEKLY_DEFAULT)

# session-vocab muscle → caution/landmark vocab (notes_parser keys on landmarks)
_CAUTION_ALIAS = {"front_delt": "shoulders", "side_delt": "side_delts",
                  "rear_delt": "rear_delts", "delts": "shoulders", "core": "core",
                  "erectors": "lower_back"}


def _caution_severity(ex: dict, caution: dict) -> int:
    """Max severity (0=none,1=ache,2=sharp) among caution keys matching this
    exercise's name or muscles. 0 when nothing was flagged."""
    if not caution:
        return 0
    sev = 0
    keys = [canon(ex.get("name", ""))]
    for m in (ex.get("muscles") or []):
        keys.append(m)
        keys.append(_CAUTION_ALIAS.get(m, m))
    for k in keys:
        c = caution.get(k)
        if c:
            sev = max(sev, int(c.get("severity", 1)))
    return sev


def _is_cautioned(ex: dict, caution: dict) -> bool:
    """True if this exercise (by name) or one of its muscles was flagged in notes."""
    return _caution_severity(ex, caution) > 0


# ── Exercise pool ─────────────────────────────────────────────────────────────
# pattern: squat | hinge | vertical_pull | horizontal_pull | vertical_push |
#          horizontal_push | dip | isolation_upper | isolation_lower
# type: COMPOUND_AXIAL | COMPOUND_PERIPHERAL | ISOLATION
# fatigue_cost: 1.0–5.0 (neurological cost; higher = heavier CNS demand)
# muscles: primary muscles (used for per-muscle fatigue tracking)

EXERCISES = [
    # ── Bench (always included on upper days) ─────────────────────────────
    {"name": "Bench Press (Top Set)",  "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["chest", "triceps", "front_delt"],
     "sets": 1, "rep_target": "3",   "rir_target": 2, "rest_seconds": 180,
     "notes": "Heavy top set (~85%), leave 2 in the tank. Frequent heavy bench, not a max single.",
     "is_primary": True, "is_goal": True},
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
    {"name": "Reverse Grip Incline Smith Machine Press", "pattern": "incline_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.0, "muscles": ["triceps", "upper_chest"],
     "sets": 3, "rep_target": "8-10",  "rir_target": 2, "rest_seconds": 120,
     "notes": "Reverse grip on smith machine incline — triceps + upper chest without elbow stress.",
     "is_assistance": True, "assist_for": "bench"},
    {"name": "Larsen Press",           "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "4-6", "rir_target": 2, "rest_seconds": 150,
     "notes": "Legs up, no leg drive — raw pressing strength off the chest.",
     "is_assistance": True, "assist_for": "bench"},
    {"name": "Incline Bench Press",    "pattern": "horizontal_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["upper_chest", "front_delt", "triceps"],
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
    {"name": "Pin Squat",              "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["quads", "glutes"],
     "sets": 4, "rep_target": "3",    "rir_target": 2, "rest_seconds": 150, "is_primary": True,
     "notes": "Pins at mid-squat sticking height. Dead-stop start every rep."},
    {"name": "Paused Squat",           "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["quads", "core"],
     "sets": 3, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Zercher Squat",          "pattern": "squat", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["quads", "core", "upper_back"],
     "sets": 3, "rep_target": "4-6",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Leg Press",              "pattern": "squat", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["quads", "glutes"],
     "sets": 2, "rep_target": "8-12", "rir_target": 2, "rest_seconds": 90},
    {"name": "Bulgarian Split Squat",  "pattern": "squat", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["quads", "glutes"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 90},
    {"name": "Leg Extension",          "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["quads"],
     "sets": 2, "rep_target": "10-12","rir_target": 1, "rest_seconds": 60},

    # ── Hinge ──────────────────────────────────────────────────────────────
    {"name": "Deadlift (Top Set)",    "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 5.0, "muscles": ["hamstrings", "glutes", "back"],
     "sets": 1, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 180,
     "is_primary": True, "is_goal": True},
    {"name": "Romanian Deadlift",     "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["hamstrings", "glutes"],
     "sets": 3, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Deadlift (Volume)",     "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["hamstrings", "glutes", "back"],
     "sets": 3, "rep_target": "5",    "rir_target": 2, "rest_seconds": 150, "is_primary": True,
     "notes": "Conventional, straight bar. Submax volume for the standard pull."},
    {"name": "Sumo Deadlift",         "pattern": "hinge", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 3.5, "muscles": ["hamstrings", "glutes", "adductors"],
     "sets": 3, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Hamstring Curl",        "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["hamstrings"],
     "sets": 2, "rep_target": "8-10", "rir_target": 1, "rest_seconds": 60},
    {"name": "Nordic Curl",           "pattern": "hinge", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["hamstrings"],
     "sets": 2, "rep_target": "5-8",  "rir_target": 3, "rest_seconds": 90},
    {"name": "Back Extension",        "pattern": "hinge", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["hamstrings", "glutes", "erectors"],
     "sets": 2, "rep_target": "8-12", "rir_target": 2, "rest_seconds": 60},

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
    {"name": "Barbell Hold",          "pattern": "carry", "type": "ISOLATION",
     "fatigue_cost": 1.5, "muscles": ["forearms"],
     "sets": 3, "rep_target": "1",    "rir_target": 1, "rest_seconds": 90,
     "notes": "Double-overhand static hold at lockout, ~10-20s, straps OFF. Builds the "
              "raw grip that's the real limiter on the conventional pull.",
     "is_assistance": True, "assist_for": "deadlift"},
    {"name": "Wrist Curl",            "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["forearms"],
     "sets": 2, "rep_target": "10-15", "rir_target": 0, "rest_seconds": 60,
     "notes": "Direct forearm flexor work — seated, off the bench edge, full stretch at "
              "the bottom. Reverse variation (extensors) rotates in weekly.",
     "is_bodyweight": False},

    # ── Vertical pull ──────────────────────────────────────────────────────
    {"name": "Weighted Pull-up",  "pattern": "vertical_pull", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["lats", "biceps"],
     "sets": 2, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Lat Pulldown",      "pattern": "vertical_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "biceps"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 75},
    {"name": "Pull-ups",          "pattern": "vertical_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.5, "muscles": ["lats", "biceps"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 75},

    # ── Horizontal pull ────────────────────────────────────────────────────
    {"name": "Chest-Supported Row",   "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.5, "muscles": ["upper_back", "rear_delts"],
     "sets": 2, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 90, "is_primary": True},
    {"name": "Cable Row",             "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "upper_back"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 75},
    {"name": "Dumbbell Row",          "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "upper_back"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 60},
    {"name": "Seal Row",              "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["upper_back", "rear_delts"],
     "sets": 2, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 75},

    # ── Incline push (upper-chest focus; own pattern so it can coexist with
    #    flat bench in the same session) ──────────────────────────────────────
    {"name": "Incline DB Press",      "pattern": "incline_push", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["upper_chest", "triceps", "front_delt"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 90, "is_primary": True,
     "notes": "30-45° incline. Full stretch at the bottom."},
    {"name": "Low-to-High Cable Fly", "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["upper_chest"],
     "sets": 2, "rep_target": "10-12","rir_target": 1, "rest_seconds": 45,
     "notes": "Low pulley, sweep up and in — upper-chest line of pull."},

    # ── Vertical push (accessory) ──────────────────────────────────────────
    {"name": "Overhead Press (BB)",   "pattern": "vertical_push", "type": "COMPOUND_AXIAL",
     "fatigue_cost": 4.0, "muscles": ["shoulders", "triceps"],
     "sets": 2, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 120},
    {"name": "Overhead Press (DB)",   "pattern": "vertical_push", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["shoulders", "triceps"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 75},

    # ── Upper isolation ────────────────────────────────────────────────────
    {"name": "Triceps Pushdown",     "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["triceps"],
     "sets": 2, "rep_target": "8-12", "rir_target": 1, "rest_seconds": 60},
    {"name": "Triceps OH Extension", "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["triceps"],
     "sets": 2, "rep_target": "8-12", "rir_target": 1, "rest_seconds": 60},
    {"name": "Face Pull",            "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["rear_delts", "rotator_cuff"],
     "sets": 2, "rep_target": "12-15","rir_target": 1, "rest_seconds": 45},
    {"name": "Lateral Raise",        "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["side_delts"],
     "sets": 2, "rep_target": "12-15","rir_target": 0, "rest_seconds": 45},
    {"name": "Cable Lateral Raise",  "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["side_delts"],
     "sets": 2, "rep_target": "12-15","rir_target": 0, "rest_seconds": 45,
     "notes": "Constant tension — lean away, full ROM."},
    {"name": "Rear Delt Fly",        "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["rear_delts"],
     "sets": 2, "rep_target": "12-15","rir_target": 0, "rest_seconds": 45},
    {"name": "Dumbbell Shrug",       "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["traps"],
     "sets": 2, "rep_target": "10-12","rir_target": 0, "rest_seconds": 45,
     "notes": "Pause 1 ct at the top."},
    {"name": "Barbell Shrug",        "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.5, "muscles": ["traps"],
     "sets": 2, "rep_target": "8-10", "rir_target": 1, "rest_seconds": 60},
    {"name": "Neck Curl",            "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 0.5, "muscles": ["neck"],
     "sets": 2, "rep_target": "12-15","rir_target": 1, "rest_seconds": 45,
     "notes": "Plate or harness. Slow and controlled — never jerk the neck."},
    {"name": "Neck Extension",       "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 0.5, "muscles": ["neck"],
     "sets": 2, "rep_target": "12-15","rir_target": 1, "rest_seconds": 45,
     "notes": "Harness or plate. Slow eccentric, no momentum."},
    {"name": "Bicep Curl",           "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["biceps"],
     "sets": 2, "rep_target": "8-10", "rir_target": 1, "rest_seconds": 60},
    {"name": "Hammer Curl",          "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["biceps", "brachialis"],
     "sets": 2, "rep_target": "8-10", "rir_target": 1, "rest_seconds": 60},

    # ── Lower isolation ────────────────────────────────────────────────────
    {"name": "Calf Raise",    "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["calves"],
     "sets": 3, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},
    {"name": "Seated Calf Raise", "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["calves"],
     "sets": 3, "rep_target": "12-15","rir_target": 1, "rest_seconds": 45,
     "notes": "Soleus bias — pause at the stretch."},

    # ── Calisthenics (selected by knapsack when AMPK/session-type warrants) ─
    # Tagged with their TRUE movement family so the compound-pattern uniqueness
    # check sees pull-ups as vertical_pull, push-ups as horizontal_push, etc.;
    # is_bodyweight marks them for AMPK prioritisation.
    {"name": "Pull-up Pyramid",  "pattern": "vertical_pull", "type": "COMPOUND_PERIPHERAL", "fatigue_cost": 3.0,
     "muscles": ["lats","biceps"], "sets": 1, "rep_target": "1-2-3-4-5-4-3-2-1",
     "rir_target": 2, "rest_seconds": 30, "is_bodyweight": True,
     "notes": "Pyramid: 1 rep rest 2 reps rest... peak at 5 back down. 25 total reps."},
    {"name": "Push-up Pyramid",  "pattern": "horizontal_push", "type": "COMPOUND_PERIPHERAL", "fatigue_cost": 2.5,
     "muscles": ["chest","triceps"], "sets": 1, "rep_target": "1-2-3-4-5-4-3-2-1",
     "rir_target": 2, "rest_seconds": 30, "is_bodyweight": True,
     "notes": "Pyramid: 1 rep rest 2 reps... peak at 5. 25 total. Add rounds to scale."},
    {"name": "Dip Pyramid",      "pattern": "dip", "type": "COMPOUND_PERIPHERAL", "fatigue_cost": 2.5,
     "muscles": ["triceps","chest"], "sets": 1, "rep_target": "1-2-3-4-5-4-3-2-1",
     "rir_target": 2, "rest_seconds": 30, "is_bodyweight": True,
     "notes": "Pyramid: same structure as pull-up pyramid. 25 total."},
    {"name": "Push-ups",              "pattern": "horizontal_push", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "25-30","rir_target": 2, "rest_seconds": 60, "is_bodyweight": True},
    {"name": "Bodyweight Pull-ups",   "pattern": "vertical_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "biceps"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 75, "is_bodyweight": True},
    {"name": "Dips",              "pattern": "dip", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "15-20","rir_target": 2, "rest_seconds": 60, "is_bodyweight": True},
    {"name": "Hanging Leg Raise", "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["core", "hip_flexors"],
     "sets": 3, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},
    {"name": "Plank",             "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["core"],
     "sets": 3, "rep_target": "60s", "rir_target": 1, "rest_seconds": 45},
    {"name": "Hip Thrust",        "pattern": "hip_thrust",      "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.5, "muscles": ["glutes", "hamstrings"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 75, "is_primary": True},
    {"name": "Diamond Push-ups",  "pattern": "horizontal_push", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 2.0, "muscles": ["triceps", "chest"],
     "sets": 3, "rep_target": "15-20","rir_target": 2, "rest_seconds": 60, "is_bodyweight": True},

    # ── Limited-equipment additions (see equipment_profiles.py) ──
    {"name": "DB Bench Press",        "pattern": "horizontal_push", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["chest", "triceps", "front_delt"],
     "sets": 3, "rep_target": "6-10", "rir_target": 2, "rest_seconds": 120},
    {"name": "Barbell Row",           "pattern": "horizontal_pull", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["lats", "upper_back"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 90},
    {"name": "Seated DB Overhead Press", "pattern": "vertical_push", "type": "COMPOUND_PERIPHERAL",
     "fatigue_cost": 3.0, "muscles": ["shoulders", "triceps"],
     "sets": 2, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 90,
     "notes": "Seated, no back support — ceiling too low for standing OHP."},
    {"name": "Barbell Curl",          "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["biceps"],
     "sets": 2, "rep_target": "8-10", "rir_target": 1, "rest_seconds": 60},
    {"name": "Skull Crushers",        "pattern": "isolation_upper", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["triceps"],
     "sets": 2, "rep_target": "8-12", "rir_target": 1, "rest_seconds": 60,
     "notes": "Lying on flat bench, DB or barbell."},
    {"name": "Weighted DB Sit-Up",    "pattern": "isolation_lower", "type": "ISOLATION",
     "fatigue_cost": 1.0, "muscles": ["core"],
     "sets": 3, "rep_target": "12-15","rir_target": 1, "rest_seconds": 45,
     "notes": "DB held at chest."},
]

# Quick lookup by name
_EX_BY_NAME = {e["name"]: e for e in EXERCISES}

# Assistance pools appended after the main goal lift (rotated by date, not
# knapsack-selected). Bench → paused-comp 315; deadlift → 500 conventional via
# submaximal work rather than heavy grinding.
BENCH_ASSISTANCE    = ["Reverse Grip Incline Smith Machine Press", "Larsen Press",
                       "Incline Bench Press", "Weighted Dip"]
DEADLIFT_ASSISTANCE = ["Deficit Deadlift", "Deadlift (Speed/Light)", "Paused Deadlift"]

# Chest hypertrophy press pool. The bench top set is a STRENGTH movement — 1-3 reps
# at RIR 2 — and Nolan's call (2026-08-07) is that it is not a hypertrophy stimulus
# at that prescription. Bench wins the chest slot on the knapsack's +10 is_goal
# bonus, which spends the slot and leaves the day with no chest press that actually
# grows anything on every day chest is not the focus muscle. These three are the
# movements he named; rotated deterministically by ISO week so each accrues its own
# e1RM history. [COACH]
CHEST_HYPERTROPHY_PRESS = ["Reverse Grip Incline Smith Machine Press",
                           "Incline DB Press", "Weighted Dip"]

# Patterns that count as a chest press for the "does this session already have one"
# check. Excludes the bench top set and its back-offs by flag, not by name, so any
# future goal press is handled too.
_CHEST_PRESS_PATTERNS = ("horizontal_push", "incline_push", "dip")
# Squat has no dedicated assistance pool (its variants are knapsack primaries);
# these are aimed at a flagged squat sticking point as an ADDED slot.
SQUAT_ASSISTANCE    = ["Paused Squat", "Zercher Squat", "Pin Squat", "Front Squat"]

# Which sticking point each assistance variant fixes: name → (lift, region).
# Drives weakness-aimed selection: "failed bench lockout" → Close-Grip. [COACH]
_ASSIST_TARGET = {
    "Reverse Grip Incline Smith Machine Press": ("bench", "lockout"),
    "Larsen Press":           ("bench", "chest"),
    "Weighted Dip":           ("bench", "chest"),
    "Incline Bench Press":    ("bench", "upper"),
    "Deficit Deadlift":       ("deadlift", "floor"),
    "Paused Deadlift":        ("deadlift", "floor"),
    "Deadlift (Speed/Light)": ("deadlift", "speed"),
    "Paused Squat":           ("squat", "bottom"),
    "Zercher Squat":          ("squat", "upper"),
    "Pin Squat":              ("squat", "mid"),
    "Front Squat":            ("squat", "back"),
}

# A second, isolated mover for a flagged weak point (1-2 sets to failure under the
# accessory rule). Only added when the goal lift is in the session. [COACH]
_WEAKNESS_ACCESSORY = {
    ("bench", "lockout"):    "Triceps OH Extension",   # top-end = triceps
    ("squat", "back"):       "Back Extension",          # torso collapse = erectors
    ("deadlift", "lockout"): "Hip Thrust",              # lockout = glute/hip drive
}


def _pick_assistance(lift: str, pool: list, weakness: dict, assist_week: int) -> str:
    """Choose the assistance variant: aim at the flagged sticking point if there is
    one, else fall back to the deterministic weekly rotation."""
    w = (weakness or {}).get(lift)
    if w and w.get("region"):
        region = w["region"]
        for name in pool:
            tgt = _ASSIST_TARGET.get(name)
            if tgt and tgt == (lift, region):
                return name
    return pool[assist_week % len(pool)]


# ── Muscle groups per session type ───────────────────────────────────────────

# Upper A and B hit the SAME muscles every session — full upper every time.
# The difference is ORDER: A is push-first (bench before pull-ups), B is pull-first.
# The stable fatigue_cost sort in _build_session preserves insertion order for ties
# (bench and pull-up both at 4.0), so the muscle list order drives exercise order
# within a fatigue tier. That sort also applies an emphasis nudge (see _order_key),
# so priority isolations like side delts lead the isolation block rather than trail it.
UPPER_A_MUSCLES = ["chest", "upper_chest", "shoulders", "triceps", "side_delts",
                   "lats", "upper_back", "biceps", "rear_delts", "traps", "neck"]
UPPER_B_MUSCLES = ["lats", "upper_back", "biceps", "rear_delts",
                   "chest", "upper_chest", "shoulders", "triceps", "side_delts",
                   "traps", "neck"]

# Legacy names kept for fallback / PPL compat
UPPER_MUSCLES = ["chest", "upper_back", "lats", "shoulders", "triceps", "biceps",
                 "side_delts", "traps", "neck", "upper_chest", "rear_delts"]
LOWER_MUSCLES = ["quads", "hamstrings", "glutes", "calves", "core"]

UPPER_FREQ = {"chest": 5, "upper_back": 3, "lats": 3, "shoulders": 3, "triceps": 4, "biceps": 3,
              "side_delts": 4, "traps": 3, "neck": 3, "upper_chest": 3, "rear_delts": 3}
LOWER_FREQ = {"quads": 3, "hamstrings": 3, "glutes": 3, "calves": 3, "core": 3}

# Guaranteed isolation slots — added when the knapsack didn't already select the
# specific isolation exercise. Biceps / triceps are covered by the full UPPER_A/B
# muscle lists, but the knapsack may pick a compound (Dips, OHP) for those slots;
# these supplements ensure a true isolation always appears too. Forearms is
# deliberately NOT in UPPER_A/B_MUSCLES — it's outside the session's muscle domain,
# so it isn't added as an automatic bolt-on; doing so was exactly the kind of
# unrequested 12th-muscle padding that inflated Upper B to 15 exercises (Nolan,
# 2026-07-29). Module-scope so _build_session can reserve budget for these before
# it decides how many muscle slots the day can afford.
ISOLATION_SUPPLEMENTS = {
    "upper_a":             [("triceps", "Triceps Pushdown")],
    "upper_b":             [("triceps", "Triceps OH Extension")],
    "lower_squat_primary": [("quads", "Leg Extension"), ("hamstrings", "Hamstring Curl")],
    "lower_hinge_primary": [("quads", "Leg Extension"), ("hamstrings", "Hamstring Curl")],
    # Legs-focus full-body day earns the same guaranteed quad+ham isolations so
    # it reads like the FBEOD "Legs Focus" template, not one squat + calves.
    "full_body_legs":      [("quads", "Leg Extension"), ("hamstrings", "Hamstring Curl")],
    "upper_volume":        [("triceps", "Triceps Pushdown")],   # legacy
    "upper_intensity":     [("triceps", "Triceps OH Extension")],  # legacy
}

# Mandatory-isolation pools. One movement from each pool lands in EVERY session,
# on top of the exercise-count target (see athlete_profile.MANDATORY_ISOLATION_MUSCLES).
# Two entries per muscle so consecutive sessions rotate rather than grinding the
# same movement — the same deterministic week/day rotation _pick_assistance uses.
# TBJP's own picks for these three slots are a cable lateral raise, a single-arm
# pushdown and a cable curl (Episode 03, ~line 500-510); the pools mirror that.
MANDATORY_ISOLATION_POOL = {
    "side_delts": ["Lateral Raise", "Cable Lateral Raise"],
    "triceps":    ["Triceps Pushdown", "Triceps OH Extension"],
    "biceps":     ["Bicep Curl", "Hammer Curl"],
}

PUSH_MUSCLES = ["chest", "shoulders", "triceps", "side_delts", "upper_chest"]
PULL_MUSCLES = ["upper_back", "lats", "biceps", "traps", "neck", "rear_delts"]
LEGS_MUSCLES = ["quads", "hamstrings", "glutes", "calves", "core"]
# Full-body (FBEOD): every session trains the WHOLE body — a chest press, a back
# pull, a squat, a hinge, a shoulder, an arm, calves and core — and the FOCUS
# muscle earns a second movement. The 4-day rotation mirrors the athlete's saved
# "FBEOD - Hypertrophy" template (Chest → Back → Shoulders/Arms → Legs), so a
# single full-body day is never half a body the way the old A/B partition was.
FULL_BODY_CHEST  = ["chest", "upper_chest", "lats", "quads", "hamstrings",
                    "side_delts", "triceps", "calves", "core"]
FULL_BODY_BACK   = ["lats", "upper_back", "chest", "quads", "hamstrings",
                    "side_delts", "biceps", "calves", "core"]
FULL_BODY_SHARMS = ["shoulders", "side_delts", "rear_delts", "chest", "lats",
                    "quads", "biceps", "triceps", "calves"]
FULL_BODY_LEGS   = ["quads", "hamstrings", "glutes", "chest", "lats",
                    "side_delts", "biceps", "triceps", "calves"]
# Legacy 2-day aliases — older logs / hand-edited titles that still say
# "full_body_a/b" resolve to the nearest focus day instead of breaking.
FULL_BODY_A = FULL_BODY_CHEST
FULL_BODY_B = FULL_BODY_LEGS

PUSH_FREQ = {"chest": 2, "shoulders": 2, "triceps": 3, "side_delts": 2, "upper_chest": 2}
PULL_FREQ = {"upper_back": 2, "lats": 2, "biceps": 3, "traps": 2, "neck": 2, "rear_delts": 2}
LEGS_FREQ = {"quads": 2, "hamstrings": 2, "glutes": 2, "calves": 2, "core": 2}
FULL_FREQ = {"chest": 3, "quads": 3, "lats": 3, "calves": 3, "core": 3,
             "hamstrings": 3, "shoulders": 3, "upper_back": 3, "triceps": 3, "glutes": 3,
             "side_delts": 3, "traps": 3, "neck": 3, "upper_chest": 3, "rear_delts": 3,
             "biceps": 3}

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


_VARIANT_SUFFIX = re.compile(r"\s*\([^)]*\)\s*$")

# Per-group fields carried into a set_scheme entry, if the row has them. Named
# rather than "everything else" so a future engine tag doesn't silently become
# part of the athlete-facing scheme.
_SCHEME_FIELDS = ("sets", "rep_target", "rir_target", "rest_seconds", "notes",
                  "reps", "rir", "load_lbs", "load_pct", "progression",
                  "soreness_note", "cut_note")


# Only these trailing parentheticals name a BLOCK OF SETS of one lift. Others
# ("(BB)", "(DB)") name a different exercise sharing a stem, and merging or
# renaming those would quietly turn the barbell press into "Overhead Press" and
# let it absorb the dumbbell one.
_VARIANT_WORDS = ("top set", "back-off", "backoff", "speed", "volume", "daily single")


def _is_variant_suffix(name: str) -> bool:
    m = re.search(r"\(([^)]*)\)\s*$", name or "")
    return bool(m) and m.group(1).strip().lower().startswith(_VARIANT_WORDS)


def _base_lift(name: str) -> str:
    """"Bench Press (Back-off Vol)" → "Bench Press". Equipment qualifiers such as
    "Overhead Press (BB)" are left alone — they are not set variants."""
    if not _is_variant_suffix(name):
        return (name or "").strip()
    return _VARIANT_SUFFIX.sub("", name or "").strip()


def _variant_label(name: str) -> str:
    """The parenthetical, as the athlete-facing name for one block of sets."""
    m = re.search(r"\(([^)]*)\)\s*$", name or "")
    return m.group(1).strip() if m else "Working"


def _merge_lift_variants(rows: list) -> list:
    """Collapse the (Top Set) / (Back-off) / (Speed Work) rows of ONE lift into a
    single exercise carrying a `set_scheme`.

    The engine builds a top set and its back-offs as separate catalog entries so
    every upstream layer (selection, scaling, cut trim, load assignment) can treat
    them as the different prescriptions they are. That is an engine-internal
    detail, and leaking it produced a session listing "Bench Press (Top Set)" as
    its own movement — Nolan's 2026-08-07 call: it should be one exercise, a heavy
    top set followed by back-off sets, the way a lifter would write it.

    Only CONSECUTIVE rows of the same base lift merge, so this never reorders a
    session or pulls a lift out of the alternation the pass before it just built.
    A lone variant row still merges (into a one-block scheme) — a single set
    labelled "Top Set" with nothing under it was the most visible half of the bug.
    `components` records the catalog names so the merge can be undone exactly when
    an approved plan is fed back through the daily engine."""
    merged: list = []
    for row in rows:
        name = row.get("name") or ""
        base = _base_lift(name)
        prev = merged[-1] if merged else None
        if prev is not None and prev["_base"] == base and base != name:
            block = {k: row[k] for k in _SCHEME_FIELDS if row.get(k) is not None}
            block["label"] = _variant_label(name)
            block["set_type"] = "backoff"
            prev["set_scheme"].append(block)
            prev["components"].append(name)
            prev["sets"] = (prev.get("sets") or 0) + (row.get("sets") or 0)
            continue
        head = dict(row)
        head["_base"] = base
        block = {k: row[k] for k in _SCHEME_FIELDS if row.get(k) is not None}
        block["label"] = _variant_label(name)
        # A first block is only a "top set" when the row actually named itself one;
        # otherwise this is an ordinary movement that merged with nothing.
        block["set_type"] = "top_set" if "top set" in name.lower() else "working"
        head["set_scheme"] = [block]
        head["components"] = [name]
        merged.append(head)

    out = []
    for m in merged:
        m.pop("_base", None)
        # A movement with no variant suffix at all ("Lateral Raise") gains nothing
        # from a one-block scheme; leave it exactly as it was so nothing downstream
        # has to special-case it. A LONE suffixed row still gets renamed and given
        # a scheme — "Bench Press (Top Set)", one set, nothing under it, is the
        # half of this bug Nolan actually trained.
        if _base_lift(m.get("name") or "") == (m.get("name") or ""):
            m.pop("set_scheme", None)
            m.pop("components", None)
        else:
            m["name"] = _base_lift(m.get("name") or "")
        out.append(m)
    return out


def _clean(ex: dict) -> dict:
    """Strip internal engine tags before writing to DB."""
    return {k: v for k, v in ex.items()
            if k not in ("pattern", "muscles", "is_primary", "is_backoff", "is_goal",
                         "type", "fatigue_cost", "is_assistance", "assist_for",
                         "is_bodyweight", "is_chest_press")}


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

# Polarized weekly run STRUCTURE (80/20): ~2 quality (threshold/interval) + 1 long,
# the rest easy. The DISTRIBUTION is the prior we keep; PLACEMENT is adaptive — runs
# are assigned by the caller (pick_run_slot) to fit the actual lifting schedule and
# recovery, not nailed to the calendar. Readiness can only DOWNGRADE a slot, never
# upgrade it.
#   slot order (hardest→easiest): interval > threshold > long > easy > recovery
_RUN_SLOTS = ["recovery", "easy", "long", "threshold", "interval"]


def pick_run_slot(split: str, action: str, quality_placed: int, long_placed: int,
                  max_quality: int = 2, max_long: int = 1) -> str:
    """
    Adaptive run placement (replaces the old fixed weekday template). Hard runs land
    on UPPER lift days or pure cardio days — never on a heavy LOWER day, where the
    legs are already taxed and a quality run interferes and raises injury risk. The
    caller tracks how many quality/long runs are already placed this week so the
    polarized target (≈2 quality + 1 long) is hit wherever the eligible days fall.
    """
    if action in ("REST",):
        return None
    is_lower = "lower" in (split or "")
    if is_lower:
        return "easy"                       # leg day → aerobic only
    # `max_quality` comes from allocator.build_run_plan's hard-run count, which scales
    # with the PST readiness gap. It was previously accepted and ignored, so the week
    # always got exactly threshold + interval no matter what the plan asked for.
    if quality_placed < max_quality:
        # First eligible day gets the tempo work, the next the VO2 work, alternating
        # after that so a larger quality allowance stays polarized rather than
        # stacking one modality.
        return "threshold" if quality_placed % 2 == 0 else "interval"
    if long_placed < max_long:
        return "long"                       # then the long aerobic run
    return "easy"

# `note` is used when VDOT is validated by a real timed effort. `hr_note` is the
# fallback when it isn't: prescribe by HR zone and effort, never by a pace number
# derived from an HR-corrected estimate (which is how the engine came to prescribe
# 6x800 at 5:46/mi — faster than 1.5-mile goal race pace). See the VDOT block in
# compute_athlete_state.py.
_SLOT_SPEC = {
    "interval":  {"zone": "Z4-Z5", "base_dur": 45, "pace_key": "interval_pace",
                  "note": "Intervals. 6x800m or 5x1km w/ 90s jog. Target {pace}/mi.",
                  "hr_note": "Intervals. 6x800m or 5x1km w/ 90s jog. Run each rep at hard-but-repeatable effort (Z4-Z5, ~3k-5k race effort) — hold the SAME pace on the last rep as the first. Note the split you actually hold."},
    "threshold": {"zone": "Z3-Z4", "base_dur": 40, "pace_key": "threshold_pace",
                  "note": "Threshold. 20-25 min continuous or 3x8 min cruise. Target {pace}/mi.",
                  "hr_note": "Threshold. 20-25 min continuous or 3x8 min cruise. Comfortably hard — the fastest pace you could hold for an hour. Keep HR in Z3-Z4."},
    "long":      {"zone": "Z2",    "base_dur": 80, "pace_key": "easy_pace",
                  "note": "Long aerobic run. Conversational. Target {pace}/mi.",
                  "hr_note": "Long aerobic run. Conversational the whole way — keep HR in Z2, let pace fall where it must."},
    "easy":      {"zone": "Z2",    "base_dur": 50, "pace_key": "easy_pace",
                  "note": "Aerobic base. Nasal breathing. Target {pace}/mi.",
                  "hr_note": "Aerobic base. Nasal breathing, HR in Z2. If you can't nasal-breathe it, slow down."},
    "recovery":  {"zone": "Z1",    "base_dur": 30, "pace_key": "recovery_pace",
                  "note": "Keep HR in Z1 on your watch — let pace fall where it must (~{pace}/mi or slower). Walk if HR drifts up.",
                  "hr_note": "Keep HR in Z1 on your watch — let pace fall where it must. Walk if HR drifts up."},
}


def _build_cardio(sim_date: date, intensity: float, ampk: float, recent_run_tss: float,
                  readiness_z: float = 0.0, quad_soreness_avg: float = 0.0,
                  vdot: float = None, slot: str = None) -> list:
    """
    Polarized run prescription: the caller assigns the base `slot` (adaptive
    placement via pick_run_slot), VDOT sets the pace, and readiness can only
    autoregulate DOWN — never up.
    """
    base_slot = slot if slot in _RUN_SLOTS else "easy"
    idx = _RUN_SLOTS.index(base_slot)

    # Protect the PST quality runs through the cut (Nolan's call, 2026-06-07).
    # Routine elevated RHR from a deficit must NOT delete threshold/interval work —
    # that's the same over-softness removed from the diet. Only a REAL acute signal
    # downgrades a run: genuinely beat-up legs, or a SEVERE sustained recovery crash
    # (not day-to-day noise). Thresholds tunable [ENG].
    SORE_HI       = 7.0    # quad soreness (0-10) at/above which legs are too beat for quality
    CRASH_READY_Z = -2.0   # readiness z that low = a real crash, not cut-driven RHR drift
    downgrade = 0
    if quad_soreness_avg >= SORE_HI:
        downgrade += 1
    if readiness_z <= CRASH_READY_Z:
        downgrade += 1
    idx = max(0, idx - downgrade)
    slot = _RUN_SLOTS[idx]
    spec = _SLOT_SPEC[slot]

    # vdot is None when no real timed effort has validated it. Prescribe by HR/effort
    # rather than inventing a pace off an unvalidated estimate.
    if vdot:
        paces = VDOTEngine(current_vdot=float(vdot)).pace_zones()
        pace  = paces.get(spec["pace_key"], "—")
        note  = spec["note"].format(pace=pace)
    else:
        pace  = None
        note  = spec["hr_note"] + " (No timed 1.5-mile on file — log one to unlock pace targets.)"

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
        "notes":           f"Garmin {spec['zone']}. " + note,
    }]


# ── Split decision ────────────────────────────────────────────────────────────

# Candidate split keys per framework, and each split's muscle set — used by the
# convergent selector to score how well a day would close the weekly frequency
# deficit. Reuses the same muscle lists the session builder trains for that split.
_FRAMEWORK_SPLITS = {
    "upper_lower": ["upper_a", "upper_b", "lower_squat_primary", "lower_hinge_primary"],
    "full_body":   ["full_body_chest", "full_body_back", "full_body_sharms", "full_body_legs"],
    "ppl":         ["push", "pull", "legs"],
}
_SPLIT_MUSCLES_FOR_SCORING = {
    "upper_a": UPPER_A_MUSCLES, "upper_b": UPPER_B_MUSCLES,
    "lower_squat_primary": LOWER_MUSCLES, "lower_hinge_primary": LOWER_MUSCLES,
    "full_body_chest": FULL_BODY_CHEST, "full_body_back": FULL_BODY_BACK,
    "full_body_sharms": FULL_BODY_SHARMS, "full_body_legs": FULL_BODY_LEGS,
    "push": PUSH_MUSCLES, "pull": PULL_MUSCLES, "legs": LEGS_MUSCLES,
}

# Upper A and Upper B train the SAME 11 muscles, and both lower days the same 5
# (see the muscle-list comment above — the variants differ in ORDER and emphasis,
# not coverage). So a scorer reasoning over per-muscle frequency deficits cannot
# tell the variants apart: score(upper_a) == score(upper_b) by construction, and
# ranking raw splits just hands the win to whichever sits first in the candidate
# list. Decide in two steps instead: pick the REGION from the data, then pick the
# emphasis VARIANT by alternating off the last session actually logged in it.
SPLIT_REGION = {
    "upper_a": "upper",             "upper_b": "upper",
    "lower_squat_primary": "lower", "lower_hinge_primary": "lower",
}

# Selection-time bias so upper_a/upper_b actually diverge on which compound wins
# a shared muscle slot (press-led vs. pull-led), not just isolation supplements.
_PUSH_PATTERNS = {"horizontal_push", "incline_push", "vertical_push", "dip"}
_PULL_PATTERNS = {"horizontal_pull", "vertical_pull", "carry"}
_UPPER_VARIANT_PATTERN_BIAS = {
    "upper_a": {**{p: 1.5 for p in _PUSH_PATTERNS}, **{p: -1.5 for p in _PULL_PATTERNS}},
    "upper_b": {**{p: -1.5 for p in _PUSH_PATTERNS}, **{p: 1.5 for p in _PULL_PATTERNS}},
}


def _converge_split(recent_types, split_framework, frequency_targets,
                    week_muscle_counts, muscle_emphasis=None):
    """Program the next split the way a coach reading the logs would.

    Two steps:
      1. REGION — train what is most RECOVERED and most BEHIND its weekly frequency
         target. After an upper day the upper muscles are freshly fatigued, so a
         lower day wins; a group that hasn't been trained in days gets priority.
      2. VARIANT — within the winning region, run the emphasis that wasn't run last
         time (press-led ↔ pull-led upper, squat- ↔ hinge-primary lower), read off
         the real logged history via classify_log_split.

    `recent_types` is oldest→newest (newest last) and holds real logged sessions.
    `week_muscle_counts` MUST be THIS CALENDAR WEEK's sessions per muscle. Seeding it
    from a rolling N-session window instead pushes every count past its weekly target,
    drives all deficits negative, and collapses every score to zero.
    """
    candidates = _FRAMEWORK_SPLITS.get(split_framework, _FRAMEWORK_SPLITS["upper_lower"])
    muscle_emphasis = muscle_emphasis or {}

    # Per-muscle: how many sessions ago it was last trained (0 = the last session).
    sessions_ago = {}
    for i, t in enumerate(reversed(recent_types)):   # i=0 is the most recent session
        for m in _SPLIT_MUSCLES_FOR_SCORING.get(t, []):
            sessions_ago.setdefault(m, i)

    def recovery_factor(m):
        # Local recovery (training-science: fatigue is local, ~1-3 days to recover).
        # Just trained → mostly off-limits; a session ago → partial; 2+ → recovered.
        # TUNABLE prior, not a research constant.
        s = sessions_ago.get(m, 99)
        if s <= 0:  return 0.10
        if s == 1:  return 0.45
        if s == 2:  return 0.80
        return 1.0

    def deficit_score(split):
        """MEAN per-muscle recovered deficit. Mean, not sum: an 11-muscle upper day
        must not outscore a 5-muscle lower day purely for covering more muscles."""
        muscles = _SPLIT_MUSCLES_FOR_SCORING.get(split, [])
        if not muscles:
            return 0.0
        total = 0.0
        for m in muscles:
            deficit = float(frequency_targets.get(m, 0)) - float(week_muscle_counts.get(m, 0))
            if deficit > 0:
                total += deficit * recovery_factor(m) * float(muscle_emphasis.get(m, 1.0))
        return total / len(muscles)

    def recovery_score(split):
        """How rested a split's muscles are, ignoring the weekly target."""
        muscles = _SPLIT_MUSCLES_FOR_SCORING.get(split, [])
        if not muscles:
            return 0.0
        return sum(recovery_factor(m) * float(muscle_emphasis.get(m, 1.0))
                   for m in muscles) / len(muscles)

    scored = {sp: deficit_score(sp) for sp in candidates}

    # Once every muscle has met its weekly frequency target, every deficit clamps to
    # zero and the deficit signal carries NO information. The old code still ran
    # sorted() over it, so the winner fell out of the candidate list's declaration
    # order — that is exactly how an Upper day got programmed the day after an Upper
    # day. When the week is saturated, fall through to recovery and train whatever is
    # freshest, which is what a coach would do.
    if max(scored.values(), default=0.0) <= 0.0:
        key = recovery_score
    else:
        key = lambda sp: scored[sp]

    # Rank REGIONS, not raw splits — variants of a region share a muscle set, so they
    # always tie and the winner would again be decided by list position.
    regions: dict = {}
    for sp in candidates:
        regions.setdefault(SPLIT_REGION.get(sp, sp), []).append(sp)   # ppl/full_body: split IS the region

    # ANTI-REPEAT. `recovery_factor` only *discounts* a just-trained muscle (0.10);
    # it does not exclude it, so a large enough frequency deficit still outscores the
    # penalty and the same region gets programmed twice running (this is what
    # produced 07-25 Lower B → 07-26 Lower A from a single generation run).
    # Mirrors the `last_strength` guard in the `_decide_split` fallback below.
    # Skipped when only one region exists (full_body), which has nothing to alternate.
    eligible = regions
    last_type = recent_types[-1] if recent_types else None
    last_region = SPLIT_REGION.get(last_type, last_type) if last_type else None
    if last_region and len(regions) > 1 and last_region in regions:
        eligible = {r: v for r, v in regions.items() if r != last_region}

    best_region = max(eligible, key=lambda r: max(key(sp) for sp in eligible[r]))
    variants = regions[best_region]
    if len(variants) < 2:
        return variants[0]

    # Alternate the emphasis off the last session actually LOGGED in this region.
    last = next((t for t in reversed(recent_types) if t in variants), None)
    if last is None:
        return variants[0]
    return variants[(variants.index(last) + 1) % len(variants)]


def _decide_split(recent_types: list, ampk: float, mtorc1: float,
                  split_framework: str = "upper_lower",
                  frequency_targets: dict = None, week_muscle_counts: dict = None,
                  muscle_emphasis: dict = None) -> str:
    """
    Upper vs lower based on AMPK interference + recent session balance.
    Supports split_framework: 'upper_lower' | 'ppl' | 'full_body'

    When `frequency_targets` is supplied, the choice CONVERGES to the allocator's
    per-muscle frequency targets (see _converge_split) instead of the fixed
    alternation below — the split shape becomes an output of the targets + logs.
    The alternation logic remains as the fallback when no targets are available.
    """
    if frequency_targets:
        return _converge_split(recent_types, split_framework, frequency_targets,
                               week_muscle_counts or {}, muscle_emphasis)

    if split_framework == "full_body":
        # 4-day FBEOD rotation: Chest → Back → Shoulders/Arms → Legs. Advance from
        # the most-recent full-body focus; unknown/legacy history restarts at chest.
        fb_order = ["full_body_chest", "full_body_back", "full_body_sharms", "full_body_legs"]
        last = next((t for t in reversed(recent_types) if t in fb_order), None)
        if last is None:
            return fb_order[0]
        return fb_order[(fb_order.index(last) + 1) % len(fb_order)]

    if split_framework == "ppl":
        ppl_order = ["push", "pull", "legs"]
        last_ppl = next((t for t in reversed(recent_types) if t in ppl_order), None)
        if last_ppl is None:
            return "push"
        return ppl_order[(ppl_order.index(last_ppl) + 1) % 3]

    # upper_lower (A/B): Upper A (push-biased) ↔ Upper B (pull-biased)
    #                     Lower A (squat) ↔ Lower B (hinge)
    # 1. Find the last strength session split to prevent consecutive identical splits
    last_strength = next((t for t in reversed(recent_types) if "upper" in t or "lower" in t), "")

    def _next_upper(recent: list) -> str:
        """Alternate upper_a / upper_b from the most-recent upper session."""
        last_upper = next((t for t in reversed(recent) if "upper" in t), "")
        return "upper_b" if "upper_a" in last_upper else "upper_a"

    def _next_lower(recent: list) -> str:
        """Alternate lower squat-primary / hinge-primary from the most-recent lower
        session. After a squat-focused lower day, do hinge; after hinge, do squat.
        Requires the log classifier to label lower days squat vs hinge accurately —
        otherwise every lower day collapses to one variant."""
        last_lower = next((t for t in reversed(recent) if "lower" in t), "")
        return "lower_hinge_primary" if "squat" in last_lower else "lower_squat_primary"

    # 2. Apply cellular overrides only if they don't violate the consecutive split guardrail
    if ampk > 0.55:
        if "upper" in last_strength:
            return _next_lower(recent_types)
        else:
            return _next_upper(recent_types)

    # If mTORC1 is extremely low, prioritize upper body volume to kickstart translation,
    # but only if the last strength session wasn't already upper body
    if mtorc1 < 0.25 and "lower" in last_strength:
        return _next_upper(recent_types)

    # 3. Default alternating split logic based on the last strength session
    if "upper" in last_strength:
        return _next_lower(recent_types)
    elif "lower" in last_strength:
        return _next_upper(recent_types)

    return "upper_a"


def split_from_title(title: str) -> str | None:
    """Recover the canonical split key from a planned program_workouts title
    ("Upper A — Push ↑ Push" → "upper_a"). Single shared title→split classifier so
    the weekly generator and the daily prescriber agree on the split (F8) instead
    of each re-deriving it from its own log view on different vocabularies.
    Distinguishes A/B and squat/hinge via exact base-title prefix; falls back to a
    coarse upper/lower/full-body match for legacy or hand-edited titles."""
    if not title:
        return None
    t = str(title).strip().lower()
    for split, base in SESSION_TITLE.items():
        if t.startswith(base.lower()):
            return split
    if "lower" in t or "legs" in t:
        return "lower_squat_primary"
    if "upper" in t or "push" in t or "pull" in t:
        return "upper_a"
    if "full body" in t or "full_body" in t:
        return "full_body_a"
    return None


SESSION_TITLE = {
    "upper_a":             "Upper A — Push",
    "upper_b":             "Upper B — Pull",
    "upper_volume":        "Upper — Volume",   # legacy fallback
    "upper_intensity":     "Upper — Intensity", # legacy fallback
    "lower_squat_primary": "Lower A — Squat",
    "lower_hinge_primary": "Lower B — Hinge",
    "push":                "Push Session",
    "pull":                "Pull Session",
    "legs":                "Legs Session",
    "full_body_chest":     "Full Body — Chest",
    "full_body_back":      "Full Body — Back",
    "full_body_sharms":    "Full Body — Shoulders + Arms",
    "full_body_legs":      "Full Body — Legs",
    "full_body_a":         "Full Body A",   # legacy alias (older titles)
    "full_body_b":         "Full Body B",   # legacy alias (older titles)
}

# Recognised split keys — an override outside this set falls back to _decide_split.
_SPLIT_KEYS = set(SESSION_TITLE.keys())


# ── Assistance ────────────────────────────────────────────────────────────────

def _assistance_slot(name: str, wt: dict, intensity: float, readiness_z: float) -> dict:
    """Scale an assistance accessory by its primary muscle's weekly target, then
    apply the usual intensity/readiness scaling — same treatment as a back-off."""
    ex = copy.deepcopy(_EX_BY_NAME[name])
    pm = (ex.get("muscles") or ["chest"])[0]
    weekly = wt.get(pm, 0)
    if weekly > 0:
        baseline = BASELINE_WEEKLY_SMALL if pm in ("triceps", "biceps") else BASELINE_WEEKLY_DEFAULT
        ex["sets"] = max(1, round(ex.get("sets", 3) * weekly / baseline))
    return _scale(ex, intensity, False, readiness_z)


def _is_chest_press(e: dict) -> bool:
    """A pressing movement that trains chest or upper chest for hypertrophy.

    Deliberately excludes the goal press and its back-offs: those are the strength
    prescription (heavy triples at RIR 2) and are the reason a session can look like
    it has chest work while having none that grows anything.
    """
    return bool(
        e.get("pattern") in _CHEST_PRESS_PATTERNS
        and any(m in ("chest", "upper_chest") for m in (e.get("muscles") or []))
        and not e.get("is_goal") and not e.get("is_backoff")
    )


def _chest_press_slot(name: str, wt: dict, intensity: float, readiness_z: float) -> dict:
    """Build a chest hypertrophy press row.

    Two of the three pool members ("Reverse Grip Incline Smith Machine Press",
    "Weighted Dip") also live in BENCH_ASSISTANCE and carry is_assistance. Here the
    movement is NOT bench assistance — it is the day's chest hypertrophy work — so
    that flag is stripped: is_assistance would route it down apply_philosophy's
    strength branch (multi-set at RIR 2, the exact prescription that isn't growing
    anything) and would make it the first row the cut-day trim deletes.

    The reverse-grip smith press lists triceps first in the pool because it was
    authored as a lockout aid. Used as a chest press its primary mover is the upper
    chest, which is what muscle_map already credits it for, so reorder the local copy
    to match — it drives both the set sizing here and apply_philosophy's cap later.
    """
    ex = copy.deepcopy(_EX_BY_NAME[name])
    ex.pop("is_assistance", None)
    ex.pop("assist_for", None)
    ex.pop("is_primary", None)
    ex["is_chest_press"] = True

    muscles = list(ex.get("muscles") or [])
    chest_first = ([m for m in muscles if m in ("chest", "upper_chest")]
                   + [m for m in muscles if m not in ("chest", "upper_chest")])
    ex["muscles"] = chest_first

    pm = (chest_first or ["chest"])[0]
    weekly = wt.get(pm, 0)
    if weekly > 0:
        ex["sets"] = max(1, round(ex.get("sets", 3) * weekly / BASELINE_WEEKLY_DEFAULT))
    return _scale(ex, intensity, False, readiness_z)


# ── Knapsack session builder ──────────────────────────────────────────────────

_PUSH_PATTERNS = {"horizontal_push", "incline_push", "vertical_push", "dip"}
_PULL_PATTERNS = {"vertical_pull", "horizontal_pull"}

# Which chain a movement trains, for alternation purposes. Pattern alone only
# classifies COMPOUNDS — every isolation falls through to "other" and gets
# appended in bucket order, which is how a row landed straight into a curl and a
# face pull (all three are back-chain work; Nolan trained it 2026-08-07 and it
# was three pulling movements in a row). Primary muscle closes that gap: a curl
# is pull-chain whether or not its pattern is.
_PUSH_MUSCLES = {"chest", "upper_chest", "front_delt", "side_delt", "side_delts",
                 "shoulders", "triceps"}
_PULL_MUSCLES = {"back", "lats", "upper_back", "rear_delt", "rear_delts",
                 "biceps", "traps", "forearms"}
_LEG_MUSCLES  = {"quads", "hamstrings", "glutes", "calves", "adductors", "abductors"}
_CORE_MUSCLES = {"abs", "core", "obliques", "lower_back"}

# Tie-break order when two chains have equally many movements left. Push first
# keeps the bench-leads rule from the old pairing loop.
_CHAIN_PRIORITY = ("push", "pull", "legs", "core", "other")


def _alternate_antagonists(exercises: list, focus_muscle: str = None) -> list:
    """Reorder so no two consecutive movements train the same chain — push, pull,
    legs, core (Nolan's call, 2026-07-08; extended past compounds 2026-08-07 after
    a session put pull-up, row, curl and face pull back to back). Antagonist
    alternation also gives each muscle more rest between its sets. Reorder only:
    nothing is substituted, and the only movements dropped are duplicate pressing
    /pulling PATTERNS, as before. A back-off / speed set stays attached to the lift
    it backs off (it's the same movement, more sets — not a new exercise). A day
    whose work is all one chain (lower body) comes out in its existing
    emphasis-nudged order, since there is nothing to alternate with.

    EXCEPT: on full-body days the focus muscle is often a squat/hinge/isolation
    ('other') movement — quads on a legs-focus day, shoulders on a sharms-focus
    day — and it would otherwise get buried behind every push/pull compound,
    defeating the day's whole point (Clark Kent: the focus muscle leads the
    SESSION, not just its own tier). If `focus_muscle`'s unit is in 'other',
    pull it out and place it first, ahead of the push/pull pairing. Bench still
    leads when push IS the focus (or push always leads pull per the rule above,
    e.g. bench-as-technique-practice) — this only rescues the case that rule
    doesn't cover."""
    units: list = []
    for ex in exercises:
        if ex.get("is_backoff") and units:
            units[-1].append(ex)      # same lift as the unit above — keep together
        else:
            units.append([ex])

    def kind(u):
        """Chain this unit trains. Pattern wins when it names one (a compound's
        pattern is the more reliable signal), then primary muscle, which is the
        only thing an isolation has."""
        p = u[0].get("pattern", "")
        if p in _PUSH_PATTERNS: return "push"
        if p in _PULL_PATTERNS: return "pull"
        m = (u[0].get("muscles") or [None])[0]
        if m in _PUSH_MUSCLES: return "push"
        if m in _PULL_MUSCLES: return "pull"
        if m in _LEG_MUSCLES:  return "legs"
        if m in _CORE_MUSCLES: return "core"
        return "other"

    push = [u for u in units if kind(u) == "push"]
    pull = [u for u in units if kind(u) == "pull"]

    # 0. One movement per pressing/pulling PATTERN per session. The bench complex
    #    already supplies an incline (reverse-grip incline assistance); without this
    #    the knapsack ALSO picks a second incline (incline DB) plus extra chest, which
    #    is Nolan's "too much chest volume." Keep the first movement of each pattern
    #    (bench assistance is added before the knapsack's redundant pick, so the liked
    #    reverse-grip incline wins over the DB press). Dropped only from THIS session —
    #    the movement stays available for other days. [ENG]
    #    Only PRESSING/PULLING patterns are deduped. The push/pull buckets now also
    #    hold isolation work (classified by muscle above), and two isolations can
    #    legitimately share a pattern — deduping those would silently drop a
    #    movement the knapsack chose.
    _COMPOUND_PATTERNS = _PUSH_PATTERNS | _PULL_PATTERNS

    def _dedup_by_pattern(unit_list):
        seen, kept = set(), []
        for u in unit_list:
            p = u[0].get("pattern", "")
            if p in _COMPOUND_PATTERNS:
                if p in seen:
                    continue
                seen.add(p)
            kept.append(u)
        return kept
    push = _dedup_by_pattern(push)
    pull = _dedup_by_pattern(pull)

    # Pull the focus muscle's unit out of whichever bucket it landed in — 'other'
    # (squat/hinge/isolation days) most often, but also push/pull when the day's
    # focus IS a press or pull movement (e.g. shoulders-focus full-body: OHP is
    # push-classified same as the bench technique touch, and without this it
    # loses the lead purely because the touch set happens to already be first
    # in `exercises` before this reorder runs).
    chains = {c: [] for c in _CHAIN_PRIORITY}
    chains["push"] = push
    chains["pull"] = pull
    for u in units:
        k = kind(u)
        if k not in ("push", "pull"):
            chains[k].append(u)

    focus_lead = None
    if focus_muscle:
        for c in _CHAIN_PRIORITY:
            for idx, u in enumerate(chains[c]):
                if (u[0].get("muscles") or [None])[0] == focus_muscle:
                    focus_lead = chains[c].pop(idx)
                    break
            if focus_lead:
                break

    # Compounds lead their own chain. The greedy below always takes the FIRST
    # remaining unit of whichever chain it picks, so an isolation sitting ahead of
    # a compound would get scheduled while he's fresh and push the heavy work late.
    def _is_compound(u):
        return "COMPOUND" in (u[0].get("type") or "")
    for c in chains:
        chains[c] = ([u for u in chains[c] if _is_compound(u)]
                     + [u for u in chains[c] if not _is_compound(u)])

    # Lay the session out so no two consecutive movements train the same chain.
    # Always draw from the chain with the most work LEFT (excluding the one just
    # used): taking from the largest remaining pile is what keeps the surplus from
    # collecting into a same-chain run at the end. The old code paired push with
    # pull and then appended the leftovers back to back, so the seam between the
    # last paired unit and the first leftover was never separated — that is the
    # exact "two back movements in a row" Nolan hit. A repeat only happens when one
    # chain outnumbers all the others combined, where it is unavoidable.
    # The focus movement leads the session, but it leads it as the greedy's FIRST
    # PICK rather than as a unit glued on afterward. Prepending it (the old
    # behaviour) meant the alternation never saw it, so a chest-focus day opened
    # bench then incline press — two chest movements in a row, arrived at by the
    # very pass whose job is to prevent that.
    ordered, prev = [], None
    if focus_lead:
        ordered.append(focus_lead)
        prev = kind(focus_lead)
    while any(chains[c] for c in chains):
        avail = [c for c in _CHAIN_PRIORITY if chains[c] and c != prev]
        if not avail:                                    # only `prev` has work left
            avail = [c for c in _CHAIN_PRIORITY if chains[c]]
        pick = max(avail, key=lambda c: (len(chains[c]), -_CHAIN_PRIORITY.index(c)))
        ordered.append(chains[pick].pop(0))
        prev = pick

    return [ex for u in ordered for ex in u]


def _build_session(
    split: str,
    intensity: float,
    ampk: float,
    readiness_z: float = 0.0,
    weekly_set_targets: dict = None,
    assist_week: int = 0,
    exercise_values: dict = None,
    caution: dict = None,
    weakness: dict = None,
    blocked: set = None,
    preferred: set = None,
    joint_action_volume: dict = None,
    target_exercises: int = None,
    spec_muscle: str = None,
) -> list:
    """
    Knapsack session builder. For each muscle relevant to this split:
      1. Compute per-session set target = max(1, round(weekly_target / freq))
      2. Pick highest-priority exercise for that muscle (goal > primary > fatigue_cost)
      3. Enforce pattern diversity — no two exercises of the same compound pattern
         (only isolation patterns can repeat freely)
      4. Sort by fatigue_cost descending (heavy compounds first)

    Calisthenics movements are eligible for the knapsack when AMPK is elevated
    or recent session history indicates accumulated axial fatigue — the priority
    scoring and pattern logic surface them naturally without a hardcoded branch.
    """
    wt = weekly_set_targets or {}
    # Athlete exercise preferences (canon-keyed). `blocked` lifts are never
    # programmed; `preferred` lifts get a selection bonus. _allowed() filters a
    # name list (used for the assistance pools) down to the permitted variants.
    blocked   = blocked or set()
    preferred = preferred or set()
    joint_action_volume = joint_action_volume or {}
    def _allowed(names):
        return [n for n in names if canon(n) not in blocked]
    split_map = {
        "upper_a":             (UPPER_A_MUSCLES, UPPER_FREQ),
        "upper_b":             (UPPER_B_MUSCLES, UPPER_FREQ),
        "upper_volume":        (UPPER_MUSCLES,   UPPER_FREQ),  # legacy
        "upper_intensity":     (UPPER_MUSCLES,   UPPER_FREQ),  # legacy
        "lower_squat_primary": (LOWER_MUSCLES,   LOWER_FREQ),
        "lower_hinge_primary": (LOWER_MUSCLES,   LOWER_FREQ),
        "push":                (PUSH_MUSCLES,    PUSH_FREQ),
        "pull":                (PULL_MUSCLES,    PULL_FREQ),
        "legs":                (LEGS_MUSCLES,    LEGS_FREQ),
        "full_body_chest":     (FULL_BODY_CHEST,  FULL_FREQ),
        "full_body_back":      (FULL_BODY_BACK,   FULL_FREQ),
        "full_body_sharms":    (FULL_BODY_SHARMS, FULL_FREQ),
        "full_body_legs":      (FULL_BODY_LEGS,   FULL_FREQ),
        "full_body_a":         (FULL_BODY_A,      FULL_FREQ),  # legacy alias
        "full_body_b":         (FULL_BODY_B,      FULL_FREQ),  # legacy alias
    }
    relevant, freq_map = split_map.get(split, (UPPER_MUSCLES, UPPER_FREQ))
    if not wt:
        wt = {m: 12 for m in relevant}

    # Clark Kent's method: the day's designated focus muscle gets its priority
    # movement placed FIRST in the session (front-loaded, not just nudged up a
    # fatigue tier). Each split's muscle list is already ordered by domain
    # emphasis (FULL_BODY_CHEST starts "chest", FULL_BODY_LEGS starts "quads",
    # UPPER_B_MUSCLES starts "lats", …) — the first entry IS the focus muscle
    # for every split EXCEPT the two lower splits, which share one LOWER_MUSCLES
    # list (["quads", "hamstrings", ...]) and differentiate by which goal lift
    # is excluded, not by list order — so they need an explicit override. [COACH]
    _FOCUS_OVERRIDE = {"lower_squat_primary": "quads", "lower_hinge_primary": "hamstrings"}
    # An active specialization block outranks both: its protocol puts the priority
    # muscle first in every session that trains it (SPEC_specialization_test.md).
    # Only when the muscle is actually in this split's domain — a side-delt block
    # does not reorder a lower day around a muscle that day never trains.
    focus_muscle = ((spec_muscle if spec_muscle in relevant else None)
                    or _FOCUS_OVERRIDE.get(split)
                    or (relevant[0] if relevant else None))

    # Patterns that may repeat (not subject to compound-pattern uniqueness constraint)
    _REPEATABLE_PATTERNS = {"isolation_upper", "isolation_lower"}

    # Lower-split emphasis rotation: the squat-primary day drops the deadlift top
    # set (RDL fills hamstrings) and the hinge-primary day drops the squat top set
    # (Front/Pin Squat fills quads), so the alternation actually alternates.
    excluded_names: set = set()
    if split == "lower_squat_primary":
        excluded_names.add("Deadlift (Top Set)")
    elif split == "lower_hinge_primary":
        excluded_names.add("Back Squat (Top Set)")
    elif split.startswith("full_body"):
        # Full-body = FBEOD hypertrophy mode. The competition singles (squat/deadlift
        # top sets) give way to hypertrophy compounds (Barbell/Zercher/Front Squat,
        # RDL) so every day reads like the athlete's "FBEOD - Hypertrophy" template
        # rather than a stack of 1x3-5 comp singles. The comp Bench Daily Single is
        # kept ONLY on the chest-focus day (its heavy day + the daily-bench technique);
        # the other focuses press with a single hypertrophy movement (Incline DB, Dips).
        excluded_names.add("Back Squat (Top Set)")
        excluded_names.add("Deadlift (Top Set)")
        if split != "full_body_chest":
            excluded_names.add("Bench Press (Top Set)")

    # Upper A/B share the same 11-muscle domain (see UPPER_A/B_MUSCLES comment) so
    # the knapsack alone always converges on the same compound per muscle. Bias
    # press patterns on A and pull patterns on B so the two variants actually read
    # as press-led vs. pull-led, not just a reordered isolation supplement.
    bias = _UPPER_VARIANT_PATTERN_BIAS.get(split, {})

    # ── Session-size budget ───────────────────────────────────────────────────
    # `relevant` is the split's full muscle DOMAIN, and the loop below used to make
    # a slot for every entry unconditionally — 11 muscles on upper, before the
    # isolation supplement and the goal lift's back-off + assistance stack. Budget
    # the muscle slots against the day's total exercise target instead.
    #
    # What is NOT dropped, in priority order:
    #   1. any muscle carrying a goal lift for this split (the SBD work is
    #      truncation-immune — _priority_score's +10 must not be undone here),
    #   2. the day's focus muscle,
    #   3. the remaining muscles in the split domain's OWN order. That order is
    #      authored emphasis-first per day and is the only thing that distinguishes
    #      upper_a from upper_b — they hold the same 11 muscles, permuted (:432).
    #      Ranking the survivors by weekly set target instead would pick the same
    #      winners on both days and collapse the two upper sessions into one, and
    #      it drops biceps from the PULL day while keeping chest there (chest
    #      carries the bench goal lift, so it outranks on volume everywhere).
    #      Weekly target enters only as a demotion: a muscle the allocator gave
    #      nothing this week goes to the back regardless of where it sits in the
    #      domain list.
    #
    # A muscle that loses its slot on this day does NOT get its sets pushed onto
    # another day: per-exercise sets come from `weekly / _baseline_weekly(muscle)`,
    # not from a per-session frequency divisor, so dropping the slot genuinely
    # lowers that muscle's weekly volume. That is the intended trade — fewer,
    # harder stations rather than the same volume smeared wider. [COACH]
    target_exercises = int(target_exercises or 0)
    if target_exercises > 0 and len(relevant) > 1:
        _goal_muscles = {
            (e.get("muscles") or [""])[0] for e in EXERCISES
            if e.get("is_goal")
            and e.get("name") not in excluded_names
            and canon(e.get("name", "")) not in blocked
            and (e.get("muscles") or [""])[0] in relevant
        }
        # No slack reserved for ISOLATION_SUPPLEMENTS or the goal lift's back-off:
        # those additions are conditional and the pattern-diversity / dedup filters
        # eat roughly as many slots as they add, so reserving for them undershot the
        # target by exactly one on every split tested. The tail trim below is the
        # real binder; this budget just has to stop the 11-muscle blowout.
        # No second clamp here: target_exercises_per_session already bounded the
        # target by MIN/MAX. Re-flooring it with MIN_EXERCISES_PER_SESSION made the
        # constant do two unrelated jobs and would quietly raise a lower-day cut
        # budget back above what the cut multiplier decided.
        _n_slots = target_exercises
        if _n_slots < len(relevant):
            # calves are protected on lower and full-body days for the same reason
            # the trim below protects them: TBJP's lower template ends with a calf
            # raise, and calves sit last in every leg domain list, so an unprotected
            # calves entry loses its slot before it ever becomes an exercise.
            _calf_protected = _split_type_of(split) in ("lower", "full_body")
            _protected = [m for m in relevant
                          if m in _goal_muscles or m == focus_muscle
                          or (_calf_protected and m == "calves")]
            _rest = [m for m in relevant if m not in _protected]
            # stable sort on "allocator gave this muscle nothing" only — everything
            # else keeps the domain list's own emphasis order
            _rest.sort(key=lambda m: 1 if float(wt.get(m, 0) or 0) <= 0 else 0)
            _keep = set(_protected) | set(_rest[:max(0, _n_slots - len(_protected))])
            relevant = [m for m in relevant if m in _keep]

    used_patterns: set = set()
    chosen_names: set = set()
    slots: list = []

    for muscle in relevant:
        weekly = wt.get(muscle, 0)
        # All exercises that hit this muscle, excluding back-off and assistance
        # variants (both are appended explicitly after the goal lift). Goal lifts
        # may only fill their PRIMARY-muscle slot — otherwise the +10 goal bonus
        # lets them leak into other splits via secondary muscles and defeat the
        # split's recovery partition (e.g. full_body_b picking the heavy squat).
        #
        # An exercise's PRIMARY muscle must belong to this split's domain
        # (`relevant`) — otherwise a lower-body lift fills an upper slot through a
        # shared secondary muscle. Zercher Squat lists `upper_back` as a secondary
        # and, being `preferred` (+4.0) and a non-goal lift, won the upper_back
        # slot on upper/pull days — a squat on an upper day. Partitioning on the
        # primary muscle keeps cross-domain leaks out without the over-strict
        # "primary == this slot" rule (compounds still cover secondary slots
        # *within* their own domain).
        pool = [e for e in EXERCISES
                if muscle in (e.get("muscles") or [])
                and not e.get("is_backoff")
                and not e.get("is_assistance")
                and e.get("name") not in excluded_names
                and canon(e.get("name", "")) not in blocked
                and (e.get("muscles") or [""])[0] in relevant
                and (not e.get("is_goal") or (e.get("muscles") or [""])[0] == muscle)]
        if not pool:
            continue

        # Sort by priority score, biased by the LEARNED exercise value (movements
        # Nolan responds to / reaches for rank up) and DEMOTED when notes flagged
        # pain on the movement or its muscle. Goal lifts keep their +10 dominance,
        # so a note never silently drops a competition lift.
        def _sel_key(ex):
            score = _priority_score(ex)
            score += bias.get(ex.get("pattern", ""), 0.0)
            if exercise_values:
                value = float(exercise_values.get(canon(ex.get("name", "")), 0.0))
                score += EXVAL_SELECT_WEIGHT * max(-3.0, min(3.0, value))
            if preferred and canon(ex.get("name", "")) in preferred:
                score += PREFER_SELECT_WEIGHT
            if joint_action_volume:
                jpat = get_joint_action(ex.get("name", ""))
                if jpat and (joint_action_volume.get(jpat) or {}).get("below_target"):
                    score += JOINT_ACTION_UNDER_TARGET_BOOST
            if _is_cautioned(ex, caution):
                score -= CAUTION_PENALTY
            return score
        pool.sort(key=_sel_key, reverse=True)

        # Pick highest-priority exercise respecting compound-pattern diversity
        # and name dedup — the same exercise never fills two slots in a session.
        chosen = None
        for ex in pool:
            if ex.get("name") in chosen_names:
                continue
            pat = ex.get("pattern", "")
            is_repeatable = pat in _REPEATABLE_PATTERNS
            if is_repeatable or pat not in used_patterns:
                chosen = ex
                if not is_repeatable:
                    used_patterns.add(pat)
                break

        if not chosen:
            continue
        chosen_names.add(chosen.get("name"))

        ex_copy = copy.deepcopy(chosen)
        
        # Adaptive set calculation: scale exercise's default sets by current weekly target vs baseline weekly target
        if ex_copy.get("is_goal") and ("Daily Single" in ex_copy.get("name", "") or "Top Set" in ex_copy.get("name", "")):
            ex_copy["sets"] = ex_copy.get("sets", 1)
        else:
            baseline_weekly = _baseline_weekly(muscle)
            volume_scalar = weekly / baseline_weekly
            ex_copy["sets"] = max(1, round(ex_copy.get("sets", 3) * volume_scalar))

        slots.append((ex_copy, muscle))

    # Isolation supplements: add targeted isolation work for muscles that only
    # received a compound exercise in the knapsack. Compounds alone under-stimulate
    # biceps and quads/hamstrings isolation patterns — these are added as guaranteed
    # accessory slots and still go through apply_philosophy (1-2 sets to failure).
    # Guaranteed isolation slots — added when the knapsack didn't already select
    # the specific isolation exercise. Biceps / triceps are covered by the full
    # UPPER_A/B muscle lists, but the knapsack may pick a compound (Dips, OHP) for
    # those slots; these supplements ensure a true isolation always appears too.
    # Forearms is deliberately NOT in UPPER_A/B_MUSCLES — it's outside the
    # session's muscle domain, so it isn't added as an automatic bolt-on here;
    # doing so was exactly the kind of unrequested 12th-muscle padding that
    # inflated Upper B to 15 exercises (Nolan, 2026-07-29).
    # Hoisted to module scope (ISOLATION_SUPPLEMENTS) so the session-size budget
    # can reserve slots for these before the muscle loop runs.
    _ISOLATION_SUPPLEMENTS = ISOLATION_SUPPLEMENTS
    # The knapsack's own pick for a muscle may already BE a true isolation
    # (e.g. Triceps Pushdown for triceps) — in that case the supplement was
    # duplicating it under a different name (Triceps Pushdown + Triceps OH
    # Extension both showing up for one muscle), which is more of the same
    # unrequested padding. Only fire the supplement when the knapsack's own
    # pick for that muscle was a compound. [COACH]
    _muscle_type = {m: e.get("type") for e, m in slots}
    for iso_muscle, iso_name in _ISOLATION_SUPPLEMENTS.get(split, []):
        if iso_name in chosen_names or iso_name not in _EX_BY_NAME:
            continue
        if _muscle_type.get(iso_muscle) == "ISOLATION":
            continue
        if canon(iso_name) in blocked:
            continue
        iso_ex = copy.deepcopy(_EX_BY_NAME[iso_name])
        iso_weekly = wt.get(iso_muscle, 0)
        iso_baseline = BASELINE_WEEKLY_SMALL
        iso_scalar = max(0.5, iso_weekly / iso_baseline if iso_weekly > 0 else 0.5)
        iso_ex["sets"] = max(1, round(iso_ex.get("sets", 2) * iso_scalar))
        # Trim-protected: these rows exist precisely to guarantee a true isolation
        # appears for a muscle whose knapsack pick was a compound (see :450). Letting
        # the session-size trim delete them defeats the whole point — it is what
        # stripped Hamstring Curl off full_body_legs. They still COUNT against the
        # target; they just can't be the thing that gets cut to meet it.
        iso_ex["is_iso_supplement"] = True
        chosen_names.add(iso_name)
        slots.append((iso_ex, iso_muscle))

    # ── Mandatory isolations (bicep / tricep / side delt, every session) ───────
    # Nolan, 2026-08-04: "I do think I need at least one bicep, tricep, and
    # lateral delt isolation exercise per workout", and they ride on top of the
    # exercise count rather than competing with it. So this runs AFTER the
    # session-size budget has already picked the compounds, and the results are
    # tagged `is_mandatory_iso` so the tail trim below skips them.
    #
    # This also fixes the collateral damage from the first cut of the session-size
    # work: budgeting muscle slots stripped the isolation tail off the upper day
    # entirely, which is the opposite of the TBJP template — his upper session
    # ENDS with side-delt, tricep and bicep isolation. Fewer compounds, not fewer
    # arms. [COACH]
    for _m_muscle in MANDATORY_ISOLATION_MUSCLES:
        _pool = [n for n in MANDATORY_ISOLATION_POOL.get(_m_muscle, [])
                 if n in _EX_BY_NAME and canon(n) not in blocked
                 and n not in excluded_names]
        if not _pool:
            continue
        # Already have a true isolation for this muscle? Then the requirement is
        # satisfied — but TAG that slot rather than just moving on. Otherwise the
        # guarantee depends on where the movement came from: a Bicep Curl the
        # knapsack picked would count against the target and stay trimmable, while
        # an identical one appended here would not, and the trim would delete the
        # knapsack's version and leave the session with no bicep work at all.
        _existing = next((e for e, m in slots
                          if m == _m_muscle and e.get("type") == "ISOLATION"), None)
        if _existing is not None:
            _existing["is_mandatory_iso"] = True
            continue
        _pick = next((n for n in _pool if n not in chosen_names), None)
        if _pick is None:
            continue
        # deterministic rotation across the pool, same shape as _pick_assistance
        _rot = [n for n in _pool if n not in chosen_names]
        _pick = _rot[assist_week % len(_rot)]
        _m_ex = copy.deepcopy(_EX_BY_NAME[_pick])
        _m_weekly = wt.get(_m_muscle, 0)
        _m_scalar = max(0.5, _m_weekly / BASELINE_WEEKLY_SMALL if _m_weekly > 0 else 0.5)
        _m_ex["sets"] = max(1, round(_m_ex.get("sets", 1) * _m_scalar))
        _m_ex["is_mandatory_iso"] = True
        chosen_names.add(_pick)
        slots.append((_m_ex, _m_muscle))

    # Sort by fatigue_cost descending (compounds first), with a priority nudge so
    # emphasised muscles (side delts, upper chest, traps, …) LEAD the isolation
    # block instead of sinking to the very end of the session. MUSCLE_EMPHASIS only
    # drove weekly volume before — order ignored it, so a 1.5x-priority side delt
    # still landed dead last behind triceps and face pulls. The nudge is bounded
    # below the isolation→compound gap (isolations ~1.0, lightest compound ~3.0) so
    # it only reorders work WITHIN a fatigue tier: priority isolations float above
    # other isolations, but never ahead of a real compound. The SBD goal lifts /
    # top sets stay first and fresh.
    def _order_key(slot):
        ex, muscle = slot
        fc = ex.get("fatigue_cost", 2.0)
        # emphasis 1.0 (neutral) → +0.0 ; 1.5 (top priority) → +0.5.
        # Capped at 1.9 so the max isolation key (1.0 + 1.9 = 2.9) can never reach
        # the lightest compound (3.0) — the compound/isolation boundary is preserved.
        nudge = min(1.9, max(0.0, MUSCLE_EMPHASIS.get(muscle, 1.0) - 1.0))
        # Goal Top Sets/Daily Singles keep Nolan's own fresh-first rule untouched
        # (competition lifts always lead, regardless of the day's focus muscle) —
        # sorted as a separate, higher tier. Within the non-goal tier, the focus
        # muscle's slot leads: +6.0 clears the widest non-goal compound spread
        # (~3.0-5.0 fatigue_cost) so it can't be out-ranked by another muscle's
        # heavier compound.
        is_goal_tier = 1 if ex.get("is_goal") else 0
        focus_bonus = 6.0 if (muscle == focus_muscle and not ex.get("is_goal")) else 0.0
        return (is_goal_tier, fc + nudge + focus_bonus)
    slots.sort(key=_order_key, reverse=True)

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

        # A goal lift (bench/squat/deadlift) only earns its full back-off +
        # assistance stack when its muscle is the day's designated FOCUS —
        # e.g. bench on a chest-focus upper day, squat on the squat-primary
        # lower day. When the knapsack's +10 is_goal bonus wins a goal lift a
        # slot on a day NOT about that muscle (bench winning the chest slot on
        # a pull-focus upper day), it's a single technique-touch set instead —
        # this used to unconditionally pile on 2-3 extra exercises regardless
        # of focus, which is exactly the "random exercises thrown in" bloat
        # Nolan flagged (2026-07-29): a pull day carrying a full bench
        # back-off + assistance stack it has no business carrying. [COACH]
        is_focus_slot = (muscle == focus_muscle)

        # Bench daily single → the back-off sets attach EVERY time bench is
        # programmed; the assistance movement stays gated to the chest-focus day.
        # The 2026-07-29 bloat complaint was about a pull day carrying extra
        # EXERCISES it had no business carrying, and the assistance slot is still
        # exactly that. The back-off is not: since the merge (2026-08-07) it is
        # more sets of a movement already on the card, not a new row. Gating it
        # left Nolan with a lone 3-rep top set as his whole bench prescription on
        # any day chest was not the focus, which is the "one set of bench as my
        # only chest volume" he trained and objected to.
        if ex_copy.get("name") == "Bench Press (Top Set)":
            bo_name = ("Bench Press (Back-off Int)"
                       if "intensity" in split or "hinge" in split
                       else "Bench Press (Back-off Vol)")
            bench_bo = copy.deepcopy(_EX_BY_NAME[bo_name])
            chest_weekly = wt.get("chest", 0)
            if chest_weekly > 0:
                baseline_weekly = BASELINE_WEEKLY_DEFAULT
                # Cap at 1.0: the back-off never inflates past its base sets. A high
                # weekly chest target is delivered by benching MORE OFTEN (frequency),
                # not by dumping extra back-off sets into one session (low-per-session
                # philosophy). Prevents the "chest piled every session" pattern. [ENG]
                volume_scalar = min(1.0, chest_weekly / baseline_weekly)
                bench_bo["sets"] = max(1, round(bench_bo.get("sets", 5) * volume_scalar))
            else:
                bench_bo["sets"] = bench_bo.get("sets", 5)
            exercises.append(_scale(bench_bo, intensity, True, readiness_z))

            # Bench assistance toward the paused-comp 315. AIMED at a flagged
            # sticking point ("failed lockout" → Reverse Grip Incline Smith; "off the chest" →
            # Larsen/dip), else the deterministic ISO-week rotation so every variant
            # still accrues its own e1RM history.
            _bench_pool = _allowed(BENCH_ASSISTANCE) if is_focus_slot else []
            if _bench_pool:
                bench_assist = _pick_assistance("bench", _bench_pool, weakness, assist_week)
                exercises.append(
                    _assistance_slot(bench_assist, wt, intensity, readiness_z))

        # Deadlift top set → build the conventional 500 via SUBMAX assistance,
        # only on the day deadlift/hamstrings is actually the focus.
        if ex_copy.get("name") == "Deadlift (Top Set)" and is_focus_slot:
            _dl_pool = _allowed(DEADLIFT_ASSISTANCE)
            if _dl_pool:
                dl_assist = _pick_assistance("deadlift", _dl_pool, weakness, assist_week)
                exercises.append(
                    _assistance_slot(dl_assist, wt, intensity, readiness_z))
            # Proactive grip work — raw double-overhand grip is the limiter on the
            # conventional pull (straps mask it). Add a grip hold on every deadlift
            # day, on top of the strength assistance. [COACH]
            _grip = "Barbell Hold"
            if (_grip in _EX_BY_NAME and canon(_grip) not in blocked
                    and not any(e.get("name") == _grip for e in exercises)):
                exercises.append(_assistance_slot(_grip, wt, intensity, readiness_z))

        # Back Squat top set → back-off whenever intensity allows, focus or not
        # (same reasoning as bench above: it is sets of a movement already on the
        # card, not an extra exercise).
        if ex_copy.get("name") == "Back Squat (Top Set)" and intensity >= 0.90:
            backoff = copy.deepcopy(_EX_BY_NAME["Back Squat (Back-off)"])
            quads_weekly = wt.get("quads", 0)
            if quads_weekly > 0:
                baseline_weekly = BASELINE_WEEKLY_DEFAULT
                volume_scalar = quads_weekly / baseline_weekly
                backoff["sets"] = max(1, round(backoff.get("sets", 3) * volume_scalar))
            else:
                backoff["sets"] = 3
            exercises.append(_scale(backoff, intensity, readiness_z=readiness_z))

        # Generic: goal "Top Set" exercises → add back-off when intensity warrants
        # and its muscle is the day's focus (catches any future goal Top Set
        # exercises beyond bench/squat)
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
                    baseline_weekly = _baseline_weekly(pm)
                    volume_scalar = weekly_tgt / baseline_weekly
                    backoff["sets"] = max(1, round(backoff.get("sets", 3) * volume_scalar))
                else:
                    backoff["sets"] = max(1, backoff.get("sets", 3))
                exercises.append(_scale(backoff, intensity, readiness_z=readiness_z))

        # Squat top set → aim a targeted variant at a flagged squat sticking point
        # ("out of the hole" → Paused Squat, "back rounds" → Front Squat). Added as
        # an extra slot only when a weakness is flagged (squat has no standing
        # assistance pool); deduped so it can't repeat the chosen primary.
        if ex_copy.get("name") == "Back Squat (Top Set)":
            sq = (weakness or {}).get("squat")
            _sq_pool = _allowed(SQUAT_ASSISTANCE)
            if sq and sq.get("region") and _sq_pool:
                variant = _pick_assistance("squat", _sq_pool, weakness, assist_week)
                if variant and variant not in {e.get("name") for e in exercises}:
                    exercises.append(_assistance_slot(variant, wt, intensity, readiness_z))

    # Full-body bench frequency: the athlete benches 3-4x/week. On the non-chest
    # focus days the MAIN chest work is a hypertrophy press (chosen in the knapsack
    # above); add a light comp Bench Daily Single as a technique touch — a single
    # top rep, no back-off/assistance — so bench frequency holds without becoming the
    # day's primary chest volume. Skipped on the chest-focus day (it already benches
    # heavy) and when bench is blocked.
    if (split.startswith("full_body") and split != "full_body_chest"
            and canon("Bench Press (Top Set)") not in blocked
            and "Bench Press (Top Set)" in _EX_BY_NAME
            and not any(e.get("name") == "Bench Press (Top Set)" for e in exercises)):
        touch = _scale(copy.deepcopy(_EX_BY_NAME["Bench Press (Top Set)"]),
                       intensity, True, readiness_z)
        touch["sets"] = 1
        exercises.insert(0, touch)

    # Weak-point accessory: a second isolated mover for a flagged sticking point
    # (e.g. bench-lockout → triceps extension), added only when that goal lift is
    # actually in today's session, deduped, then capped to 1-2 sets by the
    # philosophy pass below.
    _present = {e.get("name") for e in exercises}
    _goal_in = {("bench" if any("Bench" in n for n in _present) else None),
                ("squat" if any("Squat" in n for n in _present) else None),
                ("deadlift" if any("Deadlift" in n for n in _present) else None)}
    for lift, w in (weakness or {}).items():
        if lift not in _goal_in:
            continue
        acc = _WEAKNESS_ACCESSORY.get((lift, w.get("region")))
        if acc and acc in _EX_BY_NAME and acc not in _present and canon(acc) not in blocked:
            exercises.append(_assistance_slot(acc, weekly_set_targets or {}, intensity, readiness_z))
            _present.add(acc)

    # Sync chosen_names with all assistance/back-off slots appended above so
    # any future dedup checks (EN-05) see the full picture.
    chosen_names.update(e.get("name") for e in exercises if e.get("name"))

    # Session-size backstop. The muscle-slot budget above cannot predict how many
    # extra slots the goal lift's back-off + assistance stack, the full-body bench
    # touch, or a weak-point accessory will add — those are conditional and are
    # appended after the loop. So enforce the target on the FINAL list, trimming
    # from the tail (the list is already sorted heaviest-first, so the tail is the
    # lightest isolation work) and never touching a goal lift, its back-off or
    # assistance, or the focus muscle's own slot.
    #
    # What COUNTS is not len(exercises). Two rows are exempt (Nolan, 2026-08-04):
    # a goal lift's back-off, because top set + back-off is one movement done twice
    # and TBJP calls that pair one exercise; and the mandatory bicep/tricep/side-delt
    # isolations, which ride on top of the target by design. So the trim measures
    # only the countable rows, and it can never remove an exempt one — otherwise
    # the exemption would be self-defeating.
    def _countable(e):
        return not (e.get("is_backoff") or e.get("is_mandatory_iso"))

    # A calf raise is the last slot of TBJP's lower template ([[TBJP EDUCATION
    # SERIES - EPISODE.03]], line 34-35), and calves sit last in LOWER_MUSCLES
    # (:442), so the tail trim ate them on every lower and leg-focused session.
    # It is a countable exercise — it does not ride on top of the target like the
    # arm isolations — but it must not be the row that gets cut to meet the target.
    # Something earlier in the domain order gives up the slot instead.
    _calf_day = _split_type_of(split) in ("lower", "full_body")

    if target_exercises > 0 and sum(1 for e in exercises if _countable(e)) > target_exercises:
        def _trim_protected(e):
            return bool(e.get("is_goal") or e.get("is_backoff") or e.get("is_assistance")
                        or e.get("is_mandatory_iso") or e.get("is_iso_supplement")
                        or (_calf_day and "calves" in (e.get("muscles") or []))
                        or (e.get("muscles") or [None])[0] == focus_muscle)
        _over = sum(1 for e in exercises if _countable(e)) - target_exercises
        for i in range(len(exercises) - 1, -1, -1):
            if _over <= 0:
                break
            if _trim_protected(exercises[i]):
                continue
            exercises.pop(i)
            _over -= 1

        # Second pass: goal-lift ASSISTANCE only, and only if the first pass could
        # not get there. A hinge day stacks Deficit Deadlift and Barbell Hold on top
        # of the deadlift itself, and with those permanently protected the cut target
        # was unreachable — the session came out at 6 countable against a target of 4,
        # which is the gassing shape the whole change exists to stop. The goal lift
        # and its back-off are never touched, so the day keeps its purpose; it just
        # sheds the supporting work first, which is what a cut is for.
        if _over > 0:
            for i in range(len(exercises) - 1, -1, -1):
                if _over <= 0:
                    break
                e = exercises[i]
                if not e.get("is_assistance") or e.get("is_goal") or e.get("is_backoff"):
                    continue
                exercises.pop(i)
                _over -= 1

    # Alternate chest/back compounds so we never stack three chest movements in a
    # row (bench, row, incline, pull-up, dip). Runs after all slots are assembled
    # and before the philosophy/clean pass so pattern + is_backoff tags are intact.
    exercises = _alternate_antagonists(exercises, focus_muscle)

    # Chest hypertrophy press. Every day that benches gets one pressing movement
    # actually prescribed for growth (1-2 sets to failure at 8-10 after the philosophy
    # pass) on top of the bench top set, which is strength work. Skipped when the
    # session already carries a chest press — on a chest-focus day the bench assistance
    # slot is usually one of these, and on Upper A the knapsack often wins the
    # upper-chest slot with Incline DB Press. In practice it fires on the days chest
    # lost its slot to bench's is_goal bonus. [COACH]
    #
    # Runs LAST, deliberately — after both the trim and the antagonist pass, because
    # each of those removes rows and an earlier check counted chest presses that were
    # about to disappear. The trim deleted them outright; _alternate_antagonists then
    # dropped what was left to one movement per pressing pattern, and on every
    # full-body day that meant the bench technique single evicted the Push-up Pyramid
    # sharing its horizontal_push pattern. Both left the day reading as though it had
    # chest work while ending with none. Like the mandatory arm isolations, this row
    # rides on top of target_exercises instead of competing for a slot: it is one
    # working set or two. The antagonist pass re-runs afterward so the press is placed
    # against the day's pulls rather than tacked onto the end.
    if (any(e.get("name") == "Bench Press (Top Set)" for e in exercises)
            and not any(_is_chest_press(e) for e in exercises)):
        _press_pool = [n for n in _allowed(CHEST_HYPERTROPHY_PRESS)
                       if n in _EX_BY_NAME and n not in {e.get("name") for e in exercises}]
        if _press_pool:
            exercises.append(
                _chest_press_slot(_press_pool[assist_week % len(_press_pool)],
                                  wt, intensity, readiness_z))
            exercises = _alternate_antagonists(exercises, focus_muscle)

    # Enforce the low-volume / high-intensity philosophy as the LAST word: cap
    # accessories at 1-2 sets to failure (RIR 0); strength movements (goal lifts,
    # back-offs, assistance, primary compounds) keep their multi-set, submaximal
    # structure. Applied before _clean so the is_* tags are still readable.
    out = []
    for e in exercises:
        pm = (e.get("muscles") or [None])[0]
        pm_weekly = (weekly_set_targets or {}).get(pm, 0)
        apply_philosophy(e, pm_weekly, _session_sets(pm, pm_weekly, split) if pm else None)
        # Pain back-off: a sharp (severity-2) flag on this movement or its muscle
        # trims an accessory to a single set; a strength lift is left intact but
        # annotated so the brief surfaces it (never auto-drop a comp lift on a note).
        if _caution_severity(e, caution) >= 2:
            from engine.athlete_profile import is_strength_movement as _is_str
            if _is_str(e):
                e["notes"] = ((e.get("notes", "") + " · ") if e.get("notes") else "") \
                    + "⚠ flagged pain — monitor form / load"
            elif e.get("sets"):
                e["sets"] = 1
                e["notes"] = ((e.get("notes", "") + " · ") if e.get("notes") else "") \
                    + "backed off — flagged pain"
        out.append(_clean(e))
    # Last word: a lift and its back-offs leave here as ONE exercise. Runs after
    # the philosophy pass so the per-block set counts in the scheme are final.
    return _merge_lift_variants(out)


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
    run_slot: str = None,
    exercise_values: dict = None,
    caution: dict = None,
    weakness: dict = None,
    blocked_exercises: set = None,
    preferred_exercises: set = None,
    split_override: str = None,
    joint_action_volume: dict = None,
    phase: str = None,
    session_size_learned: float = None,
    spec_muscle: str = None,
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
    cellular_state = cellular_state or {}
    recent_session_types = recent_session_types or []

    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)

    if action == "REST":
        return [], []

    if action == "CARDIO":
        return [], _build_cardio(sim_date, intensity, ampk, recent_run_tss,
                                 readiness_z, quad_soreness_avg, vdot, slot=run_slot)

    # All other actions: build strength session via knapsack.
    # The MPC intensity scalar already encodes the physiological prescription —
    # LIGHT/DELOAD → intensity ~0.78 → _scale reduces sets and adds RIR.
    # CALISTHENICS → high-AMPK state prioritises bodyweight movements naturally.
    # No special branches needed.
    # F8: when the weekly plan already decided TODAY's split, honor it (the daily
    # card is subordinate to the learned weekly allocation) instead of re-deriving
    # from the daily log classifier and risking a contradictory split on a deviation
    # day. Re-derive only when no plan exists or its split is unrecognised.
    split = split_override if split_override in _SPLIT_KEYS else \
        _decide_split(recent_session_types, ampk, mtorc1, split_framework)
    exercises = _build_session(
        split, intensity, ampk,
        readiness_z=readiness_z,
        weekly_set_targets=weekly_set_targets or {},
        assist_week=sim_date.isocalendar()[1],
        exercise_values=exercise_values,
        caution=caution,
        weakness=weakness,
        blocked=blocked_exercises,
        preferred=preferred_exercises,
        joint_action_volume=joint_action_volume,
        target_exercises=target_exercises_per_session(split, phase, session_size_learned),
        spec_muscle=spec_muscle,
    )
    cardio = (_build_cardio(sim_date, intensity, ampk, recent_run_tss,
                            readiness_z, quad_soreness_avg, vdot, slot=run_slot)
              if action in ("TWO_A_DAY", "MIXED") else [])

    return exercises, cardio


def get_split(action: str, intensity: float, sim_date: date,
              cellular_state: dict = None, recent_session_types: list = None,
              split_framework: str = "upper_lower",
              frequency_targets: dict = None, week_muscle_counts: dict = None,
              muscle_emphasis: dict = None) -> str:
    if action == "REST":
        return "rest"
    if action == "CARDIO":
        return "cardio"
    if cellular_state is None:       cellular_state       = {}
    if recent_session_types is None: recent_session_types = []
    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)
    return _decide_split(recent_session_types, ampk, mtorc1, split_framework,
                         frequency_targets=frequency_targets,
                         week_muscle_counts=week_muscle_counts,
                         muscle_emphasis=muscle_emphasis)


def split_muscles_for(split: str) -> list:
    """The muscle set a split trains (for tallying weekly frequency as the
    convergent scheduler places each day)."""
    return list(_SPLIT_MUSCLES_FOR_SCORING.get(split, []))


# ── Log classification ───────────────────────────────────────────────────────
# ONE classifier, shared by mpc_prescriber and generate_weekly_program. They used to
# carry separate, non-identical copies, and the weekly generator's could only ever
# return "upper_a" or "lower_squat_primary" — so the scheduler literally could not
# see that a hinge day or a pull-led upper day had happened, and the emphasis
# alternation had nothing to alternate off.
# Lower keywords are checked FIRST so "leg press" / "calf raise" / "leg extension"
# aren't miscounted as upper by "press" / "raise" / "extension".
_LOWER_KW = ("squat", "deadlift", "rdl", "lunge", "calf", "leg press",
             "leg extension", "leg curl", "hamstring", "hip thrust", "glute",
             "trap bar", "good morning", "back extension", "nordic",
             "leg raise", "crunch", "plank", "ab ")
_UPPER_KW = ("bench", "press", "pull-up", "pullup", "pulldown", "row", "curl",
             "raise", "fly", "push-up", "pushup", "dip", "shrug", "overhead",
             "triceps", "tricep", "bicep", "lat ", "delt", "chest", "shoulder",
             "face pull", "neck", "skull")
_SQUAT_KW = ("squat",)
_HINGE_KW = ("deadlift", "rdl", "hinge", "hip thrust", "good morning",
             "back extension", "trap bar", "nordic")
# Press-led vs pull-led, for the Upper A / Upper B emphasis. Pull is tested first so
# "Face Pull" and "Pulldown" aren't swallowed by the "press" substring.
_PULL_KW  = ("pull-up", "pullup", "chin", "pulldown", "row", "curl", "shrug",
             "face pull", "rear delt", "lat ")
_PRESS_KW = ("bench", "press", "dip", "fly", "skull", "triceps", "tricep",
             "pushdown", "lateral raise", "overhead", "push-up", "pushup")


def classify_log_split(exercises) -> str | None:
    """Classify a LOGGED session into one of the four upper_lower splits.
    Returns None when the session has no recognisable lifting content."""
    up = lo = squat = hinge = press = pull = 0
    for ex in (exercises or []):
        n = (ex.get("name") or "").lower()
        if any(k in n for k in _LOWER_KW):
            lo += 1
            if any(k in n for k in _SQUAT_KW):     squat += 1
            elif any(k in n for k in _HINGE_KW):   hinge += 1
        elif any(k in n for k in _UPPER_KW):
            up += 1
            if any(k in n for k in _PULL_KW):      pull += 1
            elif any(k in n for k in _PRESS_KW):   press += 1
    if up == 0 and lo == 0:
        return None
    if up > lo:
        return "upper_a" if press >= pull else "upper_b"   # A leads with pressing, B with pulling
    return "lower_squat_primary" if squat >= hinge else "lower_hinge_primary"


def week_muscle_counts_from_logs(workout_log_rows, week_start) -> dict:
    """{muscle: sessions trained THIS CALENDAR WEEK}, for the convergent scheduler's
    frequency deficit. Counted off the real exercise→muscle map, so it reflects what
    was actually trained rather than assuming a logged session hit every muscle its
    split nominally covers.

    `frequency_targets` are per-week, so this MUST be scoped to the current week.
    Seeding it from a rolling N-session window (the old behaviour) counts sessions
    from previous weeks against this week's target, drives every deficit negative,
    and collapses the whole score to zero.
    """
    from engine.muscle_map import hypertrophy_muscles

    counts: dict = {}
    seen_dates = set()
    for row in (workout_log_rows or []):
        d = str(row.get("log_date") or "")
        if not d or d < str(week_start) or d in seen_dates:
            continue
        seen_dates.add(d)
        hit = set()
        for ex in (row.get("exercises") or []):
            hit.update(hypertrophy_muscles(ex.get("name") or ""))
        for m in hit:
            counts[m] = counts.get(m, 0) + 1
    return counts


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
        run_slot: str = None,
        exercise_values: dict = None,
        caution: dict = None,
        weakness: dict = None,
        blocked_exercises: set = None,
        preferred_exercises: set = None,
        split_override: str = None,
        frequency_targets: dict = None,
        week_muscle_counts: dict = None,
        muscle_emphasis: dict = None,
        joint_action_volume: dict = None,
        session_size_learned: float = None,
        spec_muscle: str = None,
        planned_exercises: list = None,
        equipment_blocked: set = None,
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

        # Retrieve VDOT — but only if a real timed effort validated it. Unvalidated
        # (HR-corrected estimate) → None, and the run layer prescribes by HR zone.
        vdot = vdot_zones.get("current_vdot", 45.0) if vdot_zones.get("validated") else None

        # Decide the ONE split that drives exercises AND the displayed title, so the
        # two can never disagree (the old code built exercises from split_override but
        # recomputed the label via a separate get_split() call — that's how a "Lower
        # Hinge" title landed on all-upper lifts). Decide off what was actually LOGGED:
        # that self-corrects after a deviation day (log upper → next day goes lower)
        # instead of blindly repeating a stale weekly-plan split.
        #
        # When frequency_targets are supplied, this takes the SAME convergent path the
        # weekly generator uses (_converge_split), so the Today card and the Train tab
        # cannot prescribe different sessions for the same day. Previously the caller
        # passed no targets, so the daily card silently fell through to the naive A/B
        # alternation branch while the weekly plan converged — two engines, two answers.
        # split_override is the split the weekly program already planned for today
        # (program_workouts.title, what the Train tab reads) — honor it whenever it's
        # given, same as the module-level generate() below (F8). It used to be gated
        # behind `not _rt` (no recent session history), which meant it was silently
        # unreachable for any athlete with actual training logs: mpc_prescriber.py
        # would print "Inheriting planned split for today: X" and then immediately
        # ignore it, re-deriving a DIFFERENT split from log history via _decide_split.
        # That's how Today (this classmethod) and Train (program_workouts.title,
        # written by the module-level generate() which always honors the override)
        # ended up showing different splits for the same day — not a sync-timing
        # bug, a genuine override-vs-log-derivation conflict. Only fall through to
        # _decide_split when there's truly no plan for today (cold start / no row).
        _rt = recent_session_types or []
        _ampk = float(cellular_state.get("ampk") or 0.20)
        _mtorc1 = float(cellular_state.get("mtorc1") or 0.30)
        if split_override in _SPLIT_KEYS:
            resolved_split = split_override
        else:
            resolved_split = _decide_split(_rt, _ampk, _mtorc1,
                                           frequency_targets=frequency_targets,
                                           week_muscle_counts=week_muscle_counts,
                                           muscle_emphasis=muscle_emphasis)

        # Call module-level generate function. Pass resolved_split as the authoritative
        # override so the exercises are built from the exact split we'll label below.
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
            run_slot=run_slot,
            exercise_values=exercise_values,
            caution=caution,
            weakness=weakness,
            blocked_exercises=blocked_exercises,
            preferred_exercises=preferred_exercises,
            split_override=resolved_split,
            joint_action_volume=joint_action_volume,
            phase=phase,
            session_size_learned=session_size_learned,
            spec_muscle=spec_muscle,
        )

        # ── The approved plan owns SELECTION; today owns AUTOREGULATION ───────
        # Everything above re-picks the movements from scratch. The weekly
        # generator already picked them, Nolan approved that list, and it is what
        # the Train tab renders off program_workouts — so re-picking here is two
        # engines answering the same question, and Today and Train showed
        # different exercises for the same day (2026-08-05: 8 movements vs 9, only
        # 5 shared). Same class of bug as the split_override conflict documented
        # above, one layer deeper: selection instead of the split label.
        #
        # So when today's approved plan has lifts, the plan's movement list wins
        # outright. Every daily layer below — soreness trim, cut back-off trim,
        # interference back-off, e1RM load assignment — still runs, unchanged, on
        # those movements. The daily engine decides how hard, never what.
        #
        # Rows are rebuilt from the EXERCISES catalog so the downstream layers see
        # the fields they read (`muscles`, `is_backoff`, `progression`, `type`),
        # which a stored plan row doesn't carry; the plan's own sets / rep_target /
        # rir_target / rest_seconds then override the catalog defaults, since those
        # are already philosophy-applied. A name the catalog doesn't know passes
        # through as-is rather than being dropped.
        #
        # Deliberately NOT substituted: a day the MPC turned into rest or pure
        # cardio (no `exercises` to replace), and a plan with no lifts of its own.
        # Both mean the plan and today disagree about whether to lift at all, which
        # is the MPC's call, not the plan's. `blocked` still filters — a lift he
        # blocked after the plan was approved must not come back through it.
        # An equipment_profile switch is a different question from a lift blocked
        # by hand. A manual block means "drop this one lift" — subtracting it from
        # the approved plan is right. A location change means the plan was written
        # against equipment that isn't here today, so subtracting leaves a gutted
        # session (a Casper day that lost squat, pull-ups, cables and the dip
        # station down to four movements). When equipment took anything out of the
        # plan, keep the session generated above instead: it was built for the same
        # split from only the movements actually available, so the day gets
        # RE-PLANNED rather than trimmed. The weekly plan stays full-gym and today
        # owns the substitution.
        _eq_blocked = {canon(n) for n in (equipment_blocked or set())}
        _plan_hits_equipment = any(
            canon((_p or {}).get("name") or "") in _eq_blocked
            for _p in (planned_exercises or [])
        )
        selection_pinned = False
        if planned_exercises and exercises and not _plan_hits_equipment:
            _blocked = {canon(n) for n in (blocked_exercises or set())}
            _pinned = []
            for _p in planned_exercises:
                _name = (_p or {}).get("name")
                if not _name or canon(_name) in _blocked:
                    continue
                # An approved plan stores a lift and its back-offs as one merged
                # exercise (see _merge_lift_variants). Expand it back into the
                # catalog rows it was built from, so every daily layer below —
                # soreness trim, cut trim, e1RM load assignment — keeps seeing the
                # separate prescriptions it knows how to reason about. The merge at
                # the end of this function puts it back together with today's loads.
                _parts = list(zip(_p.get("components") or [_name],
                                  _p.get("set_scheme") or [_p]))
                for _cname, _blk in _parts:
                    _row = copy.deepcopy(_EX_BY_NAME.get(_cname) or _p)
                    for _k in ("sets", "rep_target", "rir_target", "rest_seconds", "notes"):
                        if _blk.get(_k) is not None:
                            _row[_k] = _blk[_k]
                    _row["name"] = _cname
                    _row.pop("set_scheme", None)
                    _row.pop("components", None)
                    _pinned.append(_row)
            if _pinned:
                exercises = _pinned
                selection_pinned = True

        # Per-muscle soreness → trim sets on a muscle the athlete logged as sore
        # this morning (his own input, not engine sandbagging). Sore ≥2/5 drops a
        # set on exercises whose PRIMARY muscle is that region; ≥4 drops two.
        if soreness_by_muscle:
            _ALIAS = {"front_delt": "shoulders", "side_delt": "shoulders",
                      "side_delts": "shoulders", "rear_delt": "shoulders",
                      "rear_delts": "shoulders", "delts": "shoulders", "core": "abs",
                      "lats": "back", "upper_back": "back",
                      "upper_chest": "chest"}
            # traps/neck pass through — they're first-class check-in regions now
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
                    # Speed / back-off sets carry an intended sub-max ceiling
                    # (progression.daily_min_pct). The Epley-from-RIR % can exceed it — a
                    # reps-2 / RIR-4 speed pull solves to ~83%, not the documented ~65% — so
                    # clamp to the intended %. Fixes "why is the speed work heavier than the
                    # top set?" (speed pulls were coming out near the top set). [ENG]
                    target_pct = (ex.get("progression") or {}).get("daily_min_pct")
                    if target_pct:
                        load_pct = min(load_pct, float(target_pct))
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

            # A pinned session is the approved plan, whole. Splitting pull-ups and
            # push-ups off into calisthenics_block would mean the plan's list lives
            # in two places, so strength_block no longer equals the plan and the
            # Train tab's single list has no one block to match. The UI already
            # drops calisthenics_block whenever it renders the plan, so keeping it
            # here would only ever render the same movement twice or not at all.
            # `is_cal` still stands above, where it governs the interference
            # back-off: calisthenics stay AMPK-prioritised either way.
            if is_cal and not selection_pinned:
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

        # Same merge the plan gets, applied to the prescribed session: a lift and
        # its back-offs read as one movement, each block carrying its own load.
        strength_block = _merge_lift_variants(strength_block)

        # Build run block
        for c in cardio:
            if c.get("activity_type") == "run":
                dur = c.get("duration_minutes", 30)
                pace_str = c.get("pace", "")
                try:
                    # pace_str format: "M:SS/mi" or "MM:SS/mi"
                    pace_parts = pace_str.split("/")[0].split(":")
                    pace_min = int(pace_parts[0]) + int(pace_parts[1]) / 60.0
                    session_miles = round(dur / pace_min, 1) if pace_min > 0 else round(dur * 0.12, 1)
                except Exception:
                    session_miles = round(dur * 0.12, 1)
                run_block = {
                    "run_type": c.get("run_type", ""),
                    "zone": c.get("zone", "Z2"),
                    "session_miles": session_miles,
                    "pace": c.get("pace", ""),
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

        # Label with the SAME split the exercises were built from (resolved above),
        # so the title and the lifts can never contradict each other.
        split = resolved_split

        return {
            "session_type": session_type,
            "split": split,
            "rationale": rationale,
            "interference_warning": warning,
            # Whether today's lifts came from the approved weekly plan (True) or
            # were generated fresh here (False). The UI joins strength_block
            # against program_workouts so a plan approved after the 4am compute
            # still renders correctly — but that join must not run on a re-planned
            # day, or the substitutions this function just made (Zercher Squat for
            # a racked squat on a Casper day) get filtered out for not appearing
            # in a plan written for another location. Consumers: the Today card
            # and the workout logger.
            "plan_pinned": selection_pinned,
            "strength_block": strength_block,
            "calisthenics_block": calisthenics_block,
            "run_block": run_block,
            "swim_block": swim_block,
            "exercises": exercises,
            "cardio_sessions": cardio
        }
