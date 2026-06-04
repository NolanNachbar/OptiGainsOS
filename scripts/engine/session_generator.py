"""
session_generator.py — Engine-driven session builder.

Builds exercise + cardio prescriptions from the full athlete state rather
than fixed templates. Decisions are driven by:

  • MPC action (STRENGTH / TWO_A_DAY / DELOAD / etc.)
  • Kalman TSB-derived intensity scalar [0.7–1.1]
  • Cellular state (AMPK / mTORC1 / interference_score)
      - High AMPK (recent aerobic stress) → prefer upper body, reduce lower volume
      - Low mTORC1 → reduce total volume, more recovery focus
  • Recent session history → prevents repeating the same split
  • Recent cardio TSS → manages aerobic load accumulation

Cardio zones are Garmin HR zones (Z1–Z5), not pace-based, since the
user uses Garmin for zone tracking.

Date-seeded randomness: the same date always produces the same session
structure even if the generator runs multiple times mid-week.
"""

import copy
import random
from datetime import date


# ── Exercise pool ─────────────────────────────────────────────────────────────

BENCH_DAILY = [
    {"name": "Bench Press (Daily Single)", "sets": 1, "rep_target": "1",
     "rir_target": 1, "rest_seconds": 180, "notes": "Build to today's heavy single."},
]

BENCH_BACKOFF = {
    "volume":    {"name": "Bench Press (Back-off)", "sets": 5, "rep_target": "3",
                  "rir_target": 2, "progression": {"daily_min_pct": 0.85}, "rest_seconds": 120},
    "intensity": {"name": "Bench Press (Back-off)", "sets": 5, "rep_target": "2",
                  "rir_target": 1, "progression": {"daily_min_pct": 0.90}, "rest_seconds": 120},
    "speed":     {"name": "Bench Press (Speed Work)", "sets": 6, "rep_target": "2",
                  "rir_target": 4, "progression": {"daily_min_pct": 0.60}, "rest_seconds": 60,
                  "notes": "Bar speed focus. 60% 1RM, crisp lockout."},
    "deload":    {"name": "Bench Press (Back-off)", "sets": 3, "rep_target": "3",
                  "rir_target": 3, "progression": {"daily_min_pct": 0.80}, "rest_seconds": 90},
}

UPPER_PULL_PRIMARY = [
    {"name": "Barbell Row",     "sets": 4, "rep_target": "5",   "rir_target": 2, "rest_seconds": 120},
    {"name": "Weighted Pull-up","sets": 4, "rep_target": "5",   "rir_target": 2, "rest_seconds": 120},
    {"name": "Pendlay Row",     "sets": 4, "rep_target": "5",   "rir_target": 2, "rest_seconds": 120},
    {"name": "Yates Row",       "sets": 4, "rep_target": "6-8", "rir_target": 2, "rest_seconds": 120},
]

UPPER_PULL_ACCESSORY = [
    {"name": "Lat Pulldown",        "sets": 3, "rep_target": "8-12",  "rir_target": 2, "rest_seconds": 75},
    {"name": "Chest-Supported Row", "sets": 3, "rep_target": "8-12",  "rir_target": 2, "rest_seconds": 75},
    {"name": "Cable Row",           "sets": 3, "rep_target": "10-12", "rir_target": 2, "rest_seconds": 75},
    {"name": "Dumbbell Row",        "sets": 3, "rep_target": "10-12", "rir_target": 2, "rest_seconds": 60},
    {"name": "Seal Row",            "sets": 3, "rep_target": "8-10",  "rir_target": 2, "rest_seconds": 75},
]

UPPER_ACCESSORIES = [
    {"name": "Triceps Pushdown",    "sets": 2, "rep_target": "12-15", "rir_target": 1, "rest_seconds": 60},
    {"name": "Triceps OH Extension","sets": 2, "rep_target": "10-15", "rir_target": 1, "rest_seconds": 60},
    {"name": "Face Pull",           "sets": 2, "rep_target": "15-20", "rir_target": 1, "rest_seconds": 45},
    {"name": "Lateral Raise",       "sets": 2, "rep_target": "15-20", "rir_target": 0, "rest_seconds": 45},
    {"name": "Rear Delt Fly",       "sets": 2, "rep_target": "15-20", "rir_target": 0, "rest_seconds": 45},
    {"name": "Bicep Curl",          "sets": 2, "rep_target": "10-12", "rir_target": 1, "rest_seconds": 60},
    {"name": "Hammer Curl",         "sets": 2, "rep_target": "10-12", "rir_target": 1, "rest_seconds": 60},
    {"name": "Overhead Press (DB)", "sets": 3, "rep_target": "10-12", "rir_target": 2, "rest_seconds": 75},
]

SQUAT_PRIMARY = [
    {"name": "Back Squat (Top Set)", "sets": 1, "rep_target": "3-5", "rir_target": 2, "rest_seconds": 180},
    {"name": "Front Squat",          "sets": 3, "rep_target": "4-6", "rir_target": 2, "rest_seconds": 150},
    {"name": "Box Squat",            "sets": 4, "rep_target": "3",   "rir_target": 2, "rest_seconds": 150},
    {"name": "Paused Squat",         "sets": 3, "rep_target": "3-5", "rir_target": 2, "rest_seconds": 150},
]

SQUAT_BACKOFF = [
    {"name": "Back Squat (Back-off)", "sets": 3, "rep_target": "5", "rir_target": 3, "rest_seconds": 120},
]

HINGE_PRIMARY = [
    {"name": "Deadlift (Top Set)",  "sets": 1, "rep_target": "3-5", "rir_target": 2, "rest_seconds": 180},
    {"name": "Romanian Deadlift",   "sets": 3, "rep_target": "6-8", "rir_target": 2, "rest_seconds": 150},
    {"name": "Trap Bar Deadlift",   "sets": 3, "rep_target": "5",   "rir_target": 2, "rest_seconds": 150},
    {"name": "Sumo Deadlift",       "sets": 3, "rep_target": "3-5", "rir_target": 2, "rest_seconds": 150},
]

LOWER_ACCESSORIES = [
    {"name": "Leg Press",             "sets": 3, "rep_target": "10-15", "rir_target": 2, "rest_seconds": 90},
    {"name": "Hamstring Curl",        "sets": 3, "rep_target": "10-12", "rir_target": 2, "rest_seconds": 60},
    {"name": "Bulgarian Split Squat", "sets": 3, "rep_target": "8-10",  "rir_target": 2, "rest_seconds": 90},
    {"name": "Back Extension",        "sets": 3, "rep_target": "10-15", "rir_target": 2, "rest_seconds": 60},
    {"name": "Calf Raise",            "sets": 3, "rep_target": "15-20", "rir_target": 1, "rest_seconds": 45},
    {"name": "Nordic Curl",           "sets": 3, "rep_target": "5-8",   "rir_target": 3, "rest_seconds": 90},
    {"name": "Leg Extension",         "sets": 2, "rep_target": "12-15", "rir_target": 2, "rest_seconds": 60},
]

BUDS_CALISTHENICS = [
    {"name": "Push-ups",          "sets": 3, "rep_target": "25-30", "rir_target": 2, "rest_seconds": 60},
    {"name": "Pull-ups",          "sets": 3, "rep_target": "10-15", "rir_target": 2, "rest_seconds": 75},
    {"name": "Dips",              "sets": 3, "rep_target": "15-20", "rir_target": 2, "rest_seconds": 60},
    {"name": "Hanging Leg Raise", "sets": 3, "rep_target": "15-20", "rir_target": 1, "rest_seconds": 45},
    {"name": "Diamond Push-ups",  "sets": 3, "rep_target": "15-20", "rir_target": 2, "rest_seconds": 60},
    {"name": "Pike Push-ups",     "sets": 3, "rep_target": "15-20", "rir_target": 2, "rest_seconds": 60},
]

SESSION_TITLE = {
    "upper_volume":    "Upper — Volume",
    "upper_intensity": "Upper — Intensity",
    "lower_squat":     "Lower — Squat Focus",
    "lower_hinge":     "Lower — Hinge Focus",
    "full_body":       "Full Body",
    "calisthenics":    "BUD/S Calisthenics",
}


# ── Scaling helpers ───────────────────────────────────────────────────────────

def _scale(ex: dict, intensity: float, is_primary: bool = False) -> dict:
    ex = copy.deepcopy(ex)
    base_sets = ex.get("sets", 3)

    if intensity >= 1.05 and is_primary:
        ex["sets"] = base_sets + 1
    elif intensity < 0.85:
        ex["sets"] = max(1, base_sets - 1)

    rir = ex.get("rir_target")
    if rir is not None:
        if intensity >= 1.05:
            ex["rir_target"] = max(0, rir - 1)
        elif intensity < 0.95:
            ex["rir_target"] = min(4, rir + 1)

    return ex


# ── Split decision ────────────────────────────────────────────────────────────

def _decide_split(recent_types: list, ampk: float, mtorc1: float, sim_date: date) -> str:
    """
    Choose upper/lower/etc. based on recent history and cellular state.

    Cellular interference logic:
      High AMPK (>0.55): aerobic stress suppresses mTORC1 in legs
        → prefer upper body to avoid concurrent training interference
      Low mTORC1 (<0.25): total synthesis suppressed → lower volume
      Normal: alternate to keep balance, avoid consecutive same-split days
    """
    recent_lower = sum(1 for t in recent_types[-4:] if "lower" in t)
    recent_upper = sum(1 for t in recent_types[-4:] if "upper" in t)

    # Aerobic interference → upper preferred
    if ampk > 0.55:
        if recent_upper >= 3:
            return "lower_hinge"  # hinge less quad-dominant, less running interference
        return "upper_volume" if recent_upper % 2 == 0 else "upper_intensity"

    # Suppressed synthesis → simple upper day
    if mtorc1 < 0.25:
        return "upper_volume"

    # Balance upper/lower
    if recent_lower + 2 <= recent_upper:
        return "lower_squat" if sim_date.day % 2 == 0 else "lower_hinge"
    if recent_upper + 2 <= recent_lower:
        return "upper_volume" if sim_date.day % 2 == 0 else "upper_intensity"

    # Default: alternate from last session
    last = next((t for t in reversed(recent_types) if t), "")
    if "upper" in last:
        return "lower_squat" if sim_date.day % 2 == 0 else "lower_hinge"
    elif "lower" in last:
        return "upper_volume" if sim_date.day % 2 == 0 else "upper_intensity"

    return "upper_volume"


# ── Cardio prescription ───────────────────────────────────────────────────────

def _build_cardio(action: str, intensity: float, ampk: float, recent_run_tss: float) -> list:
    """
    Cardio session driven entirely by engine state.

    Decision hierarchy:
      1. AMPK (cellular aerobic stress) — already running hard → back off
      2. Recent 7-day run TSS — cumulative load management
      3. MPC intensity scalar — overall readiness

    Uses Garmin HR zones (Z1–Z5). No pace targets.
    """
    if action not in ("TWO_A_DAY", "CARDIO", "MIXED"):
        return []

    # Composite aerobic stress: AMPK + normalized recent TSS (hard week ~400 TSS)
    aerobic_stress = ampk + min(recent_run_tss / 400.0, 0.8)

    if action == "MIXED":
        return [{"activity_type": "run", "zone": "Z2", "duration_minutes": 30,
                 "notes": "Easy aerobic. Garmin zone 2. Active recovery alongside lifting."}]

    if aerobic_stress > 1.4 or intensity < 0.80:
        return [{"activity_type": "run", "zone": "Z1", "duration_minutes": 30,
                 "notes": "Recovery jog. Garmin zone 1 only. Active recovery, not a training stimulus."}]
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
                 "notes": "Interval session. Garmin zone 4–5. 6×800m or 5×1km w/ 90s rest, or 4×1mi threshold."}]


# ── Strength session builder ──────────────────────────────────────────────────

def _build_strength(split: str, intensity: float, ampk: float, mtorc1: float,
                    rng: random.Random) -> list:
    exercises = []

    # Bench always first — daily single is the program anchor
    exercises.append(_scale(BENCH_DAILY[0], intensity, is_primary=True))

    backoff_type = "intensity" if split in ("upper_intensity", "lower_hinge") else "volume"
    exercises.append(_scale(BENCH_BACKOFF[backoff_type], intensity, is_primary=True))

    if split in ("upper_volume", "upper_intensity"):
        exercises.append(_scale(rng.choice(UPPER_PULL_PRIMARY),   intensity, is_primary=True))
        exercises.append(_scale(rng.choice(UPPER_PULL_ACCESSORY), intensity))

        n_acc = 3 if intensity >= 0.95 and ampk < 0.5 else 2
        for acc in rng.sample(UPPER_ACCESSORIES, min(n_acc, len(UPPER_ACCESSORIES))):
            exercises.append(_scale(acc, intensity))

    elif split == "lower_squat":
        exercises.append(_scale(rng.choice(SQUAT_PRIMARY), intensity, is_primary=True))
        if intensity >= 0.90:
            exercises.append(_scale(SQUAT_BACKOFF[0], intensity))

        n_acc = 1 if ampk > 0.5 else 2
        for acc in rng.sample(LOWER_ACCESSORIES, min(n_acc, len(LOWER_ACCESSORIES))):
            exercises.append(_scale(acc, intensity))

        if intensity >= 0.90 and ampk < 0.65:
            exercises.append(_scale(rng.choice(BUDS_CALISTHENICS[:3]), intensity))

    elif split == "lower_hinge":
        exercises.append(_scale(rng.choice(HINGE_PRIMARY), intensity, is_primary=True))

        n_acc = 1 if ampk > 0.4 or intensity < 0.90 else 2
        for acc in rng.sample(LOWER_ACCESSORIES[1:], min(n_acc, len(LOWER_ACCESSORIES) - 1)):
            exercises.append(_scale(acc, intensity))

        if intensity >= 0.90 and ampk < 0.65:
            exercises.append(_scale(rng.choice(BUDS_CALISTHENICS[:3]), intensity))

    elif split == "full_body":
        exercises.append(_scale(rng.choice(SQUAT_PRIMARY[:2]),     intensity, is_primary=True))
        exercises.append(_scale(rng.choice(UPPER_PULL_PRIMARY),    intensity, is_primary=True))
        exercises.append(_scale(rng.choice(LOWER_ACCESSORIES[:3]), intensity))
        exercises.append(_scale(rng.choice(UPPER_ACCESSORIES[:3]), intensity))

    elif split == "calisthenics":
        for ex in rng.sample(BUDS_CALISTHENICS, min(4, len(BUDS_CALISTHENICS))):
            exercises.append(_scale(ex, intensity))

    return exercises


# ── Public API ────────────────────────────────────────────────────────────────

def generate(
    action: str,
    intensity: float,
    sim_date: date,
    cellular_state: dict = None,
    recent_session_types: list = None,
    recent_run_tss: float = 0.0,
    vdot: float = None,
) -> tuple:
    """
    Generate (exercises, cardio_sessions) for one training day.

    Args:
        action               MPC action (STRENGTH / TWO_A_DAY / DELOAD / REST / etc.)
        intensity            Kalman TSB-derived scalar [0.7–1.1]
        sim_date             Calendar date — seeds RNG so same date = same session
        cellular_state       {ampk, mtorc1, interference_score} from athlete_state
        recent_session_types Focus strings for last 5–7 days (e.g. ["upper_volume", "lower_squat"])
        recent_run_tss       Sum of run TSS from last 7 days
        vdot                 Current VDOT (informational; Garmin zones used for cardio)

    Returns:
        (exercises: list[dict], cardio_sessions: list[dict])
    """
    rng = random.Random(int(sim_date.strftime("%Y%m%d")))

    if cellular_state    is None: cellular_state    = {}
    if recent_session_types is None: recent_session_types = []

    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)

    if action == "REST":
        return [], []

    if action == "DELOAD":
        note = "Deload: movement quality focus, stay well short of failure."
        return [
            {**_scale(BENCH_DAILY[0], 0.78), "notes": note},
            _scale(BENCH_BACKOFF["deload"], 0.78),
            _scale(rng.choice(UPPER_PULL_ACCESSORY), 0.78),
            _scale(rng.choice(UPPER_ACCESSORIES[:4]), 0.78),
        ], []

    if action == "LIGHT":
        return [
            {**_scale(BENCH_DAILY[0], 0.75), "notes": "Light day — technique single only."},
            _scale(BENCH_BACKOFF["speed"], 0.75),
        ], [{"activity_type": "run", "zone": "Z1", "duration_minutes": 30,
             "notes": "Easy walk/jog. Garmin zone 1. Active recovery."}]

    if action == "CARDIO":
        return [], _build_cardio("CARDIO", intensity, ampk, recent_run_tss)

    if action == "CALISTHENICS":
        exercises = [_scale(ex, intensity) for ex in rng.sample(BUDS_CALISTHENICS, min(4, len(BUDS_CALISTHENICS)))]
        return exercises, _build_cardio("CARDIO", intensity, ampk, recent_run_tss)

    # STRENGTH / MIXED / TWO_A_DAY
    split     = _decide_split(recent_session_types, ampk, mtorc1, sim_date)
    exercises = _build_strength(split, intensity, ampk, mtorc1, rng)
    cardio    = _build_cardio(action, intensity, ampk, recent_run_tss)

    return exercises, cardio


def get_split(action: str, intensity: float, sim_date: date,
              cellular_state: dict = None, recent_session_types: list = None) -> str:
    """Return the split name chosen for this day (for title generation)."""
    if action in ("REST", "DELOAD", "LIGHT", "CARDIO"): return action.lower()
    if action == "CALISTHENICS": return "calisthenics"

    if cellular_state is None: cellular_state = {}
    if recent_session_types is None: recent_session_types = []

    ampk   = float(cellular_state.get("ampk")   or 0.20)
    mtorc1 = float(cellular_state.get("mtorc1") or 0.30)
    return _decide_split(recent_session_types, ampk, mtorc1, sim_date)


def build_title(action: str, split: str, intensity: float) -> str:
    """Human-readable workout title."""
    if action == "REST":          return "Rest Day"
    if action == "DELOAD":        return "Deload"
    if action == "LIGHT":         return "Light Day"
    if action == "CARDIO":        return "Cardio"
    if action == "CALISTHENICS":  return "BUD/S Calisthenics"

    base   = SESSION_TITLE.get(split, "Strength")
    suffix = (" ↑ Push"    if intensity >= 1.05 else
              " ↓ Back Off" if intensity < 0.85  else
              " → Steady"   if intensity < 0.95  else "")
    return base + suffix
