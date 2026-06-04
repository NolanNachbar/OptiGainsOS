"""
session_generator.py — Engine-driven session builder.

Sessions are built by filling movement-pattern slots from the engine state,
NOT by randomly sampling category pools. This ensures:

  1. Goal exercises (bench single, squat, deadlift) always appear
  2. Every lower day has both quad AND posterior chain work
  3. Every upper day has one vertical pull AND one horizontal pull — never two of the same
  4. Intra-session movement pattern diversity is enforced structurally
  5. AMPK/mTORC1 state adjusts volume and bias, doesn't just gate sessions
  6. MILP weekly_set_targets drive per-muscle set counts when provided
     (MILP influences set counts only — never gates exercise inclusion)

Design spec: ~/Claude/BBrain/10-Projects/OptiGains/ENGINE.md#Session-Generator-Design

Date-seeded RNG: same date always generates same session, even if re-run.
"""

import copy
import random
from datetime import date


# ── Exercise pool with pattern + muscle tags ──────────────────────────────────
# pattern: squat | hinge | vertical_pull | horizontal_pull | vertical_push |
#          isolation_upper | isolation_lower | calisthenics
# muscles: primary muscles (used for per-muscle fatigue tracking)

EXERCISES = [
    # ── Bench (always included) ────────────────────────────────────────────
    {"name": "Bench Press (Daily Single)",  "pattern": "horizontal_push", "muscles": ["chest", "triceps", "front_delt"],
     "sets": 1, "rep_target": "1",   "rir_target": 1, "rest_seconds": 180, "notes": "Build to today's heavy single.", "is_primary": True, "is_goal": True},
    {"name": "Bench Press (Back-off Vol)",  "pattern": "horizontal_push", "muscles": ["chest", "triceps"],
     "sets": 5, "rep_target": "3",   "rir_target": 2, "progression": {"daily_min_pct": 0.85}, "rest_seconds": 120, "is_backoff": True},
    {"name": "Bench Press (Back-off Int)",  "pattern": "horizontal_push", "muscles": ["chest", "triceps"],
     "sets": 5, "rep_target": "2",   "rir_target": 1, "progression": {"daily_min_pct": 0.90}, "rest_seconds": 120, "is_backoff": True},
    {"name": "Bench Press (Speed Work)",    "pattern": "horizontal_push", "muscles": ["chest", "triceps"],
     "sets": 6, "rep_target": "2",   "rir_target": 4, "progression": {"daily_min_pct": 0.60}, "rest_seconds": 60,
     "notes": "60% 1RM, bar speed focus.", "is_backoff": True},
    {"name": "Bench Press (Deload)",        "pattern": "horizontal_push", "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "3",   "rir_target": 3, "progression": {"daily_min_pct": 0.80}, "rest_seconds": 90, "is_backoff": True},

    # ── Squat (goal exercise) ──────────────────────────────────────────────
    {"name": "Back Squat (Top Set)",   "pattern": "squat", "muscles": ["quads", "glutes", "core"],
     "sets": 1, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 180, "is_primary": True, "is_goal": True},
    {"name": "Back Squat (Back-off)",  "pattern": "squat", "muscles": ["quads", "glutes"],
     "sets": 3, "rep_target": "5",    "rir_target": 3, "rest_seconds": 120, "is_backoff": True},
    {"name": "Front Squat",            "pattern": "squat", "muscles": ["quads", "core"],
     "sets": 3, "rep_target": "4-6",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Box Squat",              "pattern": "squat", "muscles": ["quads", "glutes"],
     "sets": 4, "rep_target": "3",    "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Paused Squat",           "pattern": "squat", "muscles": ["quads", "core"],
     "sets": 3, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Leg Press",              "pattern": "squat", "muscles": ["quads", "glutes"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 90},
    {"name": "Bulgarian Split Squat",  "pattern": "squat", "muscles": ["quads", "glutes"],
     "sets": 3, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 90},
    {"name": "Leg Extension",          "pattern": "squat", "muscles": ["quads"],
     "sets": 2, "rep_target": "12-15","rir_target": 2, "rest_seconds": 60},

    # ── Hinge ──────────────────────────────────────────────────────────────
    {"name": "Deadlift (Top Set)",    "pattern": "hinge", "muscles": ["hamstrings", "glutes", "back"],
     "sets": 1, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 180, "is_primary": True, "is_goal": True},
    {"name": "Romanian Deadlift",     "pattern": "hinge", "muscles": ["hamstrings", "glutes"],
     "sets": 3, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Trap Bar Deadlift",     "pattern": "hinge", "muscles": ["hamstrings", "quads", "back"],
     "sets": 3, "rep_target": "5",    "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Sumo Deadlift",         "pattern": "hinge", "muscles": ["hamstrings", "glutes", "adductors"],
     "sets": 3, "rep_target": "3-5",  "rir_target": 2, "rest_seconds": 150, "is_primary": True},
    {"name": "Hamstring Curl",        "pattern": "hinge", "muscles": ["hamstrings"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 60},
    {"name": "Nordic Curl",           "pattern": "hinge", "muscles": ["hamstrings"],
     "sets": 3, "rep_target": "5-8",  "rir_target": 3, "rest_seconds": 90},
    {"name": "Back Extension",        "pattern": "hinge", "muscles": ["hamstrings", "glutes", "erectors"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 60},

    # ── Vertical pull ──────────────────────────────────────────────────────
    {"name": "Weighted Pull-up",  "pattern": "vertical_pull", "muscles": ["lats", "biceps"],
     "sets": 4, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Lat Pulldown",      "pattern": "vertical_pull", "muscles": ["lats", "biceps"],
     "sets": 3, "rep_target": "8-12", "rir_target": 2, "rest_seconds": 75},
    {"name": "Pull-ups",          "pattern": "vertical_pull", "muscles": ["lats", "biceps"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 75},

    # ── Horizontal pull ────────────────────────────────────────────────────
    {"name": "Barbell Row",           "pattern": "horizontal_pull", "muscles": ["upper_back", "biceps", "rear_delt"],
     "sets": 4, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Pendlay Row",           "pattern": "horizontal_pull", "muscles": ["upper_back", "rear_delt"],
     "sets": 4, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Yates Row",             "pattern": "horizontal_pull", "muscles": ["lats", "upper_back"],
     "sets": 4, "rep_target": "6-8",  "rir_target": 2, "rest_seconds": 120, "is_primary": True},
    {"name": "Chest-Supported Row",   "pattern": "horizontal_pull", "muscles": ["upper_back", "rear_delt"],
     "sets": 3, "rep_target": "8-12", "rir_target": 2, "rest_seconds": 75},
    {"name": "Cable Row",             "pattern": "horizontal_pull", "muscles": ["lats", "upper_back"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 75},
    {"name": "Dumbbell Row",          "pattern": "horizontal_pull", "muscles": ["lats", "upper_back"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 60},
    {"name": "Seal Row",              "pattern": "horizontal_pull", "muscles": ["upper_back", "rear_delt"],
     "sets": 3, "rep_target": "8-10", "rir_target": 2, "rest_seconds": 75},

    # ── Vertical push (accessory) ──────────────────────────────────────────
    {"name": "Overhead Press (BB)",   "pattern": "vertical_push", "muscles": ["front_delt", "triceps"],
     "sets": 3, "rep_target": "5",    "rir_target": 2, "rest_seconds": 120},
    {"name": "Overhead Press (DB)",   "pattern": "vertical_push", "muscles": ["front_delt", "triceps", "side_delt"],
     "sets": 3, "rep_target": "10-12","rir_target": 2, "rest_seconds": 75},

    # ── Upper isolation ────────────────────────────────────────────────────
    {"name": "Triceps Pushdown",     "pattern": "isolation_upper", "muscles": ["triceps"],
     "sets": 2, "rep_target": "12-15","rir_target": 1, "rest_seconds": 60},
    {"name": "Triceps OH Extension", "pattern": "isolation_upper", "muscles": ["triceps"],
     "sets": 2, "rep_target": "10-15","rir_target": 1, "rest_seconds": 60},
    {"name": "Face Pull",            "pattern": "isolation_upper", "muscles": ["rear_delt", "rotator_cuff"],
     "sets": 2, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},
    {"name": "Lateral Raise",        "pattern": "isolation_upper", "muscles": ["side_delt"],
     "sets": 2, "rep_target": "15-20","rir_target": 0, "rest_seconds": 45},
    {"name": "Rear Delt Fly",        "pattern": "isolation_upper", "muscles": ["rear_delt"],
     "sets": 2, "rep_target": "15-20","rir_target": 0, "rest_seconds": 45},
    {"name": "Bicep Curl",           "pattern": "isolation_upper", "muscles": ["biceps"],
     "sets": 2, "rep_target": "10-12","rir_target": 1, "rest_seconds": 60},
    {"name": "Hammer Curl",          "pattern": "isolation_upper", "muscles": ["biceps", "brachialis"],
     "sets": 2, "rep_target": "10-12","rir_target": 1, "rest_seconds": 60},

    # ── Lower isolation ────────────────────────────────────────────────────
    {"name": "Calf Raise",    "pattern": "isolation_lower", "muscles": ["calves"],
     "sets": 3, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},

    # ── BUD/S calisthenics ─────────────────────────────────────────────────
    {"name": "Push-ups",              "pattern": "calisthenics", "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "25-30","rir_target": 2, "rest_seconds": 60},
    {"name": "Bodyweight Pull-ups",   "pattern": "calisthenics", "muscles": ["lats", "biceps"],
     "sets": 3, "rep_target": "10-15","rir_target": 2, "rest_seconds": 75},
    {"name": "Dips",              "pattern": "calisthenics", "muscles": ["chest", "triceps"],
     "sets": 3, "rep_target": "15-20","rir_target": 2, "rest_seconds": 60},
    {"name": "Hanging Leg Raise", "pattern": "calisthenics", "muscles": ["core", "hip_flexors"],
     "sets": 3, "rep_target": "15-20","rir_target": 1, "rest_seconds": 45},
    {"name": "Diamond Push-ups",  "pattern": "calisthenics", "muscles": ["triceps", "chest"],
     "sets": 3, "rep_target": "15-20","rir_target": 2, "rest_seconds": 60},
]

# Quick lookup by name
_EX_BY_NAME = {e["name"]: e for e in EXERCISES}

def _by_pattern(pattern: str, primary_only=False, goal_only=False) -> list:
    return [e for e in EXERCISES
            if e["pattern"] == pattern
            and (not primary_only or e.get("is_primary"))
            and (not goal_only   or e.get("is_goal"))]


# ── Weekly target → per-session set conversion ────────────────────────────────

# Expected sessions per week per muscle by session type
_UPPER_FREQ = {"chest": 5, "upper_back": 3, "lats": 3, "shoulders": 3, "triceps": 4, "biceps": 2}
_LOWER_FREQ = {"quads": 3, "hamstrings": 3, "glutes": 3, "calves": 3, "core": 3}


def _session_sets(muscle: str, weekly_target: int, session_type: str) -> int:
    """Convert weekly target → per-session set count based on expected frequency."""
    if weekly_target <= 0:
        return 0  # only return 0 if MILP explicitly says 0 — never gate based on this
    if "upper" in session_type:
        freq = _UPPER_FREQ.get(muscle, 3)
    else:
        freq = _LOWER_FREQ.get(muscle, 3)
    return max(1, round(weekly_target / freq))


# ── Scaling ───────────────────────────────────────────────────────────────────

def _scale(ex: dict, intensity: float, is_primary: bool = False,
           readiness_z: float = 0.0) -> dict:
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
            if k not in ("pattern", "muscles", "is_primary", "is_backoff", "is_goal")}


# ── Cardio ────────────────────────────────────────────────────────────────────

def _build_cardio(action: str, intensity: float, ampk: float,
                  recent_run_tss: float) -> list:
    """
    Cardio zone driven by engine state. Uses Garmin HR zones (Z1–Z5).
    """
    if action not in ("TWO_A_DAY", "CARDIO", "MIXED"):
        return []

    aerobic_stress = ampk + min(recent_run_tss / 400.0, 0.8)

    if action == "MIXED":
        return [{"activity_type": "run", "zone": "Z2", "duration_minutes": 30,
                 "notes": "Easy aerobic. Garmin zone 2. Active recovery alongside lifting."}]

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


# ── Session builders ──────────────────────────────────────────────────────────

def _build_upper(
    split: str,
    intensity: float,
    ampk: float,
    rng: random.Random,
    readiness_z: float = 0.0,
    weekly_set_targets: dict = None,
    e1rm_registry: dict = None,
) -> list:
    """
    Upper session — always produces a complete session.

    weekly_set_targets drives set counts when provided; it never gates
    exercise inclusion. MILP saying 0 for a muscle only means 0 sets
    for that specific accessory, not that the compound slot disappears.
    """
    wt = weekly_set_targets or {}
    exercises = []

    # Slot 1: Bench daily single (always)
    bench = copy.deepcopy(_EX_BY_NAME["Bench Press (Daily Single)"])
    bench["sets"] = 1  # always 1 for daily single
    exercises.append(_scale(bench, intensity, True, readiness_z))

    # Slot 2: Bench back-off (always — bench everyday program)
    backoff_name = "Bench Press (Back-off Int)" if "intensity" in split else "Bench Press (Back-off Vol)"
    backoff = copy.deepcopy(_EX_BY_NAME[backoff_name])
    if wt.get("chest", 0) > 0:
        backoff["sets"] = _session_sets("chest", wt["chest"], split)
    exercises.append(_scale(backoff, intensity, True, readiness_z))

    # Slot 3: ONE vertical pull (always on upper days)
    v_pulls = _by_pattern("vertical_pull")
    if intensity >= 1.00:
        v_pick = rng.choice([e for e in v_pulls if "Weighted" in e["name"]] or v_pulls)
    else:
        v_pick = rng.choice([e for e in v_pulls if "Weighted" not in e["name"]] or v_pulls)
    v_pick = copy.deepcopy(v_pick)
    if wt.get("lats", 0) > 0:
        v_pick["sets"] = _session_sets("lats", wt["lats"], split)
    exercises.append(_scale(v_pick, intensity, v_pick.get("is_primary", False), readiness_z))

    # Slot 4: ONE horizontal pull (always on upper days — enforces pattern diversity)
    h_pulls = _by_pattern("horizontal_pull")
    if intensity >= 0.95:
        h_pool = [e for e in h_pulls if e.get("is_primary")] or h_pulls
    else:
        h_pool = [e for e in h_pulls if not e.get("is_primary")] or h_pulls
    h_pick = copy.deepcopy(rng.choice(h_pool))
    if wt.get("upper_back", 0) > 0:
        h_pick["sets"] = _session_sets("upper_back", wt["upper_back"], split)
    exercises.append(_scale(h_pick, intensity, h_pick.get("is_primary", False), readiness_z))

    # Slots 5-7: isolation accessories
    n_acc = 3 if intensity >= 0.95 and ampk < 0.5 else 2
    acc_picks = []
    face_pull_opts = [e for e in EXERCISES if e["pattern"] == "isolation_upper"
                      and ("rear" in e["name"].lower() or "face" in e["name"].lower())]
    tri_opts = [e for e in EXERCISES if e["pattern"] == "isolation_upper"
                and "tricep" in e["name"].lower()]
    other_acc = [e for e in EXERCISES if e["pattern"] == "isolation_upper"
                 and not any(k in e["name"].lower() for k in ("tricep", "rear", "face"))]

    if face_pull_opts:
        acc_picks.append(rng.choice(face_pull_opts))
    if tri_opts and len(acc_picks) < n_acc:
        acc_picks.append(rng.choice(tri_opts))
    while len(acc_picks) < n_acc and other_acc:
        pick = rng.choice(other_acc)
        other_acc = [e for e in other_acc if e["name"] != pick["name"]]
        acc_picks.append(pick)

    iso_muscle_map = {"tricep": "triceps", "bicep": "biceps", "lateral": "shoulders",
                      "rear": "shoulders", "face": "shoulders"}
    for acc in acc_picks:
        acc_copy = copy.deepcopy(acc)
        # Scale iso sets from weekly target if available
        for kw, milp_m in iso_muscle_map.items():
            if kw in acc_copy["name"].lower() and wt.get(milp_m, 0) > 0:
                acc_copy["sets"] = _session_sets(milp_m, wt[milp_m], split)
                break
        exercises.append(_scale(acc_copy, intensity, readiness_z=readiness_z))

    return [_clean(e) for e in exercises]


def _build_lower(
    split: str,
    intensity: float,
    ampk: float,
    rng: random.Random,
    readiness_z: float = 0.0,
    weekly_set_targets: dict = None,
    e1rm_registry: dict = None,
) -> list:
    """
    Lower session — ALWAYS includes both squat and hinge patterns.

    weekly_set_targets scales set counts; it never gates exercise inclusion.
    """
    wt = weekly_set_targets or {}
    exercises = []

    # Bench always (even on lower days — bench everyday program)
    bench = copy.deepcopy(_EX_BY_NAME["Bench Press (Daily Single)"])
    bench["sets"] = 1
    exercises.append(_scale(bench, intensity, True, readiness_z))

    backoff_name = "Bench Press (Back-off Int)" if "hinge" in split else "Bench Press (Back-off Vol)"
    backoff = copy.deepcopy(_EX_BY_NAME[backoff_name])
    if wt.get("chest", 0) > 0:
        backoff["sets"] = _session_sets("chest", wt["chest"], split)
    exercises.append(_scale(backoff, intensity, True, readiness_z))

    squat_primaries = _by_pattern("squat", primary_only=True)
    hinge_primaries = _by_pattern("hinge", primary_only=True)

    if "squat_primary" in split:
        # Slot 3: Squat primary (always)
        if intensity >= 0.95 and ampk < 0.6:
            primary = _EX_BY_NAME["Back Squat (Top Set)"]
        else:
            primary = rng.choice(squat_primaries)
        p_copy = copy.deepcopy(primary)
        if wt.get("quads", 0) > 0:
            p_copy["sets"] = _session_sets("quads", wt["quads"], split)
        exercises.append(_scale(p_copy, intensity, True, readiness_z))

        # Back-off squat (when top set selected and intensity allows)
        if "Top Set" in primary["name"] and intensity >= 0.90:
            bo = copy.deepcopy(_EX_BY_NAME["Back Squat (Back-off)"])
            if wt.get("quads", 0) > 0:
                bo["sets"] = max(1, _session_sets("quads", wt["quads"], split) - 1)
            exercises.append(_scale(bo, intensity, readiness_z=readiness_z))

        # Slot 4: Hinge secondary (always — posterior chain must be covered)
        if ampk < 0.5:
            hinge_sec = rng.choice(
                [e for e in hinge_primaries if "Romanian" in e["name"] or "Back Ext" in e["name"]]
                or [_EX_BY_NAME["Romanian Deadlift"]]
            )
        else:
            hinge_sec = _EX_BY_NAME["Back Extension"]
        h_copy = copy.deepcopy(hinge_sec)
        if wt.get("hamstrings", 0) > 0:
            h_copy["sets"] = _session_sets("hamstrings", wt["hamstrings"], split)
        exercises.append(_scale(h_copy, intensity, readiness_z=readiness_z))

    else:  # hinge_primary
        # Slot 3: Hinge primary (always)
        if intensity >= 0.95 and ampk < 0.5:
            primary = _EX_BY_NAME["Deadlift (Top Set)"]
        else:
            primary = rng.choice(
                [e for e in hinge_primaries if "Deadlift (Top Set)" not in e["name"]]
                or hinge_primaries
            )
        p_copy = copy.deepcopy(primary)
        if wt.get("hamstrings", 0) > 0:
            p_copy["sets"] = _session_sets("hamstrings", wt["hamstrings"], split)
        exercises.append(_scale(p_copy, intensity, True, readiness_z))

        # Slot 4: Squat secondary (always — quad work must be covered)
        if ampk > 0.5:
            squat_sec = rng.choice(
                [e for e in _by_pattern("squat")
                 if e["name"] in ("Leg Press", "Leg Extension", "Bulgarian Split Squat")]
            )
        else:
            squat_sec = rng.choice(
                [e for e in _by_pattern("squat") if not e.get("is_goal")]
                or _by_pattern("squat")
            )
        s_copy = copy.deepcopy(squat_sec)
        if wt.get("quads", 0) > 0:
            s_copy["sets"] = _session_sets("quads", wt["quads"], split)
        exercises.append(_scale(s_copy, intensity, readiness_z=readiness_z))

    # Slots 5-6: isolation_lower accessories (always at least 1)
    n_iso = 1 if ampk > 0.5 or intensity < 0.85 else 2

    iso_lower = [e for e in EXERCISES if e["pattern"] == "isolation_lower"]
    iso_lower += [_EX_BY_NAME["Hamstring Curl"]]

    for iso in rng.sample(iso_lower, min(n_iso, len(iso_lower))):
        i_copy = copy.deepcopy(iso)
        # Scale calves/hamstring iso sets from weekly target
        for muscle_kw, milp_m in (("calve", "calves"), ("hamstring", "hamstrings")):
            if muscle_kw in iso["name"].lower() and wt.get(milp_m, 0) > 0:
                i_copy["sets"] = _session_sets(milp_m, wt[milp_m], split)
                break
        exercises.append(_scale(i_copy, intensity, readiness_z=readiness_z))

    # BUD/S calisthenics
    if intensity >= 0.90 and ampk < 0.65:
        cals = [e for e in EXERCISES if e["pattern"] == "calisthenics"
                and any(m in ["chest", "triceps", "lats"] for m in (e.get("muscles") or []))]
        if cals:
            exercises.append(_scale(rng.choice(cals), intensity, readiness_z=readiness_z))

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
    weekly_set_targets: dict = None,   # {muscle: total_sets_this_week} from MILP — drives set counts
    readiness_z: float = 0.0,
    e1rm_registry: dict = None,
) -> tuple:
    """
    Generate (exercises, cardio_sessions) for one training day.

    Args:
        action                  MPC action (STRENGTH / TWO_A_DAY / DELOAD / REST / etc.)
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
    """
    rng = random.Random(int(sim_date.strftime("%Y%m%d")))

    if cellular_state is None:       cellular_state       = {}
    if recent_session_types is None: recent_session_types = []

    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)

    if action == "REST":
        return [], []

    if action == "DELOAD":
        note = "Deload: movement quality focus, stay well short of failure."
        exercises = [
            {**_clean(_scale(_EX_BY_NAME["Bench Press (Daily Single)"], 0.78,
                             readiness_z=readiness_z)), "notes": note},
            _clean(_scale(_EX_BY_NAME["Bench Press (Deload)"], 0.78, readiness_z=readiness_z)),
            _clean(_scale(rng.choice(_by_pattern("horizontal_pull")), 0.78, readiness_z=readiness_z)),
            _clean(_scale(rng.choice([e for e in EXERCISES if e["pattern"] == "isolation_upper"]),
                          0.78, readiness_z=readiness_z)),
        ]
        return exercises, []

    if action == "LIGHT":
        return [
            {**_clean(_scale(_EX_BY_NAME["Bench Press (Daily Single)"], 0.75,
                             readiness_z=readiness_z)),
             "notes": "Light day — technique single only."},
            _clean(_scale(_EX_BY_NAME["Bench Press (Speed Work)"], 0.75, readiness_z=readiness_z)),
        ], [{"activity_type": "run", "zone": "Z1", "duration_minutes": 30,
             "notes": "Easy walk/jog. Garmin zone 1. Active recovery."}]

    if action == "CARDIO":
        return [], _build_cardio("CARDIO", intensity, ampk, recent_run_tss)

    if action == "CALISTHENICS":
        cals = [e for e in EXERCISES if e["pattern"] == "calisthenics"]
        exercises = [_clean(_scale(e, intensity, readiness_z=readiness_z))
                     for e in rng.sample(cals, min(4, len(cals)))]
        return exercises, _build_cardio("CARDIO", intensity, ampk, recent_run_tss)

    # STRENGTH / MIXED / TWO_A_DAY
    split = _decide_split(recent_session_types, ampk, mtorc1)

    if "upper" in split:
        exercises = _build_upper(split, intensity, ampk, rng,
                                 readiness_z=readiness_z,
                                 weekly_set_targets=weekly_set_targets,
                                 e1rm_registry=e1rm_registry)
    else:
        exercises = _build_lower(split, intensity, ampk, rng,
                                 readiness_z=readiness_z,
                                 weekly_set_targets=weekly_set_targets,
                                 e1rm_registry=e1rm_registry)

    cardio = _build_cardio(action, intensity, ampk, recent_run_tss)
    return exercises, cardio


def get_split(action: str, intensity: float, sim_date: date,
              cellular_state: dict = None, recent_session_types: list = None) -> str:
    if action in ("REST", "DELOAD", "LIGHT", "CARDIO"): return action.lower()
    if action == "CALISTHENICS": return "calisthenics"
    if cellular_state is None:       cellular_state       = {}
    if recent_session_types is None: recent_session_types = []
    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)
    return _decide_split(recent_session_types, ampk, mtorc1)


def build_title(action: str, split: str, intensity: float) -> str:
    if action == "REST":         return "Rest Day"
    if action == "DELOAD":       return "Deload"
    if action == "LIGHT":        return "Light Day"
    if action == "CARDIO":       return "Cardio"
    if action == "CALISTHENICS": return "BUD/S Calisthenics"
    base   = SESSION_TITLE.get(split, "Strength")
    suffix = (" ↑ Push"      if intensity >= 1.05 else
              " ↓ Back Off"  if intensity < 0.85  else
              " → Steady"    if intensity < 0.95  else "")
    return base + suffix
