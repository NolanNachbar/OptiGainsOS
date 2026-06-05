"""
muscle_map.py — Single source of truth for mapping exercises and soreness
check-in regions onto muscle groups.

Two vocabularies exist in the codebase and this module reconciles them:
  - ANALYSIS vocab (EXERCISE_MUSCLE_MAP values): back / abs / rear_delts / traps /
    lower_back — used by compute_athlete_state.compute_hypertrophy.
  - LANDMARK vocab (hypertrophy_volume.MUSCLES): upper_back / lats / core / … —
    the per-muscle MEV/MAV/MRV landmarks the engine actually learns.

`hypertrophy_muscles()` and `soreness_by_muscle()` translate into the LANDMARK
vocab so the volume engine, exploration bandit, and orchestrator all agree.
"""

from engine.hypertrophy_volume import MUSCLES as LANDMARK_MUSCLES

# ── Exercise name keyword → analysis-vocab muscles ────────────────────────────
# Moved verbatim from compute_athlete_state.py so both the daily compute and the
# weekly orchestrator share one definition (was duplicated/at risk of drift).
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
    "bench":             ["chest", "triceps"],
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

# Longest keyword first so "romanian deadlift" wins over "deadlift".
_MUSCLE_KEYWORDS = sorted(EXERCISE_MUSCLE_MAP.keys(), key=len, reverse=True)

# Analysis-vocab → landmark-vocab. A muscle absent here is already landmark-vocab.
# "back" splits to both lat-dominant and upper-back-dominant landmarks since the
# rows/pulldowns/pulls that map to "back" train both.
_ANALYSIS_TO_LANDMARK: dict[str, list[str]] = {
    "back":       ["upper_back", "lats"],
    "abs":        ["core"],
    "rear_delts": ["shoulders"],
    "traps":      ["upper_back"],
    "lower_back": [],  # no dedicated landmark
}

# Soreness check-in regions (daily_readiness.soreness_snapshot keys) → landmarks.
SORENESS_REGION_MUSCLES: dict[str, list[str]] = {
    "Chest":      ["chest"],
    "Back":       ["upper_back", "lats"],
    "Shoulders":  ["shoulders"],
    "Arms":       ["biceps", "triceps"],
    "Quads":      ["quads"],
    "Hamstrings": ["hamstrings", "glutes"],
    "Calves":     ["calves"],
    "Core":       ["core"],
}


def get_muscles(exercise_name: str) -> list[str]:
    """Analysis-vocab muscles trained by an exercise (keyword substring match)."""
    name = (exercise_name or "").lower()
    found: set[str] = set()
    for kw in _MUSCLE_KEYWORDS:
        if kw in name:
            found.update(EXERCISE_MUSCLE_MAP[kw])
    return list(found)


def hypertrophy_muscles(exercise_name: str) -> list[str]:
    """Landmark-vocab muscles trained by an exercise (for MEV/MAV/MRV learning)."""
    out: set[str] = set()
    for m in get_muscles(exercise_name):
        for lm in _ANALYSIS_TO_LANDMARK.get(m, [m]):
            if lm in LANDMARK_MUSCLES:
                out.add(lm)
    return list(out)


def soreness_by_muscle(snapshots: list) -> dict:
    """
    {landmark_muscle: [soreness, …]} from a list of soreness_snapshot dicts
    (newest-first or any order — used only for averaging). Each snapshot is the
    per-region {"Chest": n, "Quads": n, …} jsonb from daily_readiness.
    """
    out: dict[str, list] = {}
    for snap in snapshots or []:
        if not isinstance(snap, dict):
            continue
        for region, val in snap.items():
            if val is None:
                continue
            try:
                v = float(val)
            except (TypeError, ValueError):
                continue
            for lm in SORENESS_REGION_MUSCLES.get(region, []):
                out.setdefault(lm, []).append(v)
    return out
