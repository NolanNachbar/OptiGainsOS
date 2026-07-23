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
    # Full names first: they suppress the shorter "bench press"/"cable fly"
    # keywords so incline work credits upper_chest exclusively.
    "incline bench press":    ["upper_chest", "triceps"],
    "low-to-high cable fly":  ["upper_chest"],
    "low to high cable fly":  ["upper_chest"],
    "incline bench":     ["upper_chest", "triceps"],
    "incline press":     ["upper_chest", "triceps"],
    "incline dumbbell":  ["upper_chest", "triceps"],
    "incline db":        ["upper_chest", "triceps"],
    "incline fly":       ["upper_chest"],
    "low-to-high":       ["upper_chest"],
    "low to high":       ["upper_chest"],
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
    "lateral raise":     ["side_delts"],
    "face pull":         ["rear_delts"],
    "rear delt fly":     ["rear_delts"],
    "reverse fly":       ["rear_delts"],
    "reverse pec":       ["rear_delts"],
    "upright row":       ["side_delts", "traps"],
    "shrug":             ["traps"],
    "neck curl":         ["neck"],
    "neck extension":    ["neck"],
    "neck flexion":      ["neck"],
    "neck harness":      ["neck"],
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
    # MUST outrank the bare "curl" catch-all below (the keyword list is sorted
    # longest-first, and a shorter keyword contained in an already-matched longer
    # one is suppressed). Without these, "Hamstring Curl" and "Wrist Curl" fell
    # through to "curl" and credited BICEPS — a leg day was funding arm volume,
    # and that number fed the weekly frequency deficit and the MRV learner.
    "hamstring curl":    ["hamstrings"],
    "leg curls":         ["hamstrings"],
    "lying leg curl":    ["hamstrings"],
    "seated leg curl":   ["hamstrings"],
    "wrist curl":        ["forearms"],
    "curl":              ["biceps"],
    "ohp":               ["shoulders", "triceps"],
    "plank":             ["abs"],
    "crunch":            ["abs"],
    "ab wheel":          ["abs"],
    "hanging leg":       ["abs"],
    "sit up":            ["abs"],
    "leg raise":         ["abs"],
    # "leg press calf ..." / "... calf press" are CALF work done on the leg-press
    # machine. These outrank "leg press" so the movement doesn't also bank quad and
    # glute volume it never trained.
    "leg press calf":    ["calves"],
    "calf press":        ["calves"],
    "calf raises (leg press)": ["calves"],
    "calf machine shrug": ["traps"],
    "calf raise":        ["calves"],
    "seated calf":       ["calves"],
    # Grip / adductor work. Neither has a landmark in hypertrophy_volume.MUSCLES, so
    # _ANALYSIS_TO_LANDMARK maps them to nothing — but naming them here stops the
    # keyword fallthrough that used to credit BICEPS for a Wrist Curl / Barbell Hold.
    "barbell hold":      ["forearms"],
    "adductor":          ["adductors"],
    # Bench and incline-press variants the athlete actually logs. Without these,
    # "Reverse Grip Incline Smith Machine Press" and "Larsen Press" mapped to NOTHING,
    # so his heaviest pressing accessories contributed zero chest/triceps volume and
    # zero response signal to the MRV learner.
    "larsen press":         ["chest", "triceps"],
    "reverse grip incline": ["upper_chest", "triceps"],
    "smith machine incline": ["upper_chest", "triceps"],
    "incline smith":        ["upper_chest", "triceps"],
    "smith machine shoulder press": ["shoulders", "triceps"],
}

# Exercise names arrive with hyphens ("Pull-up", "Push-Up Pyramid", "Chest-supported
# Row") but the keywords above are space-separated, and a raw substring test never
# matches across that. That is why "Weighted Pull-up" and "Push-ups" mapped to NOTHING
# — the engine's own programmed pull-ups contributed no lat/bicep volume and no MRV
# signal at all. Normalize BOTH sides: lowercase, hyphens and underscores to spaces,
# collapse runs of whitespace.
def _norm(s: str) -> str:
    return " ".join((s or "").lower().replace("-", " ").replace("_", " ").split())


# Longest keyword first so "romanian deadlift" wins over "deadlift".
_MUSCLE_KEYWORDS = sorted((_norm(k) for k in EXERCISE_MUSCLE_MAP), key=len, reverse=True)
# Keyword lookup is by NORMALIZED key, so hyphenated keys ("t-bar row") still resolve.
_NORM_MUSCLE_MAP = {_norm(k): v for k, v in EXERCISE_MUSCLE_MAP.items()}

# Analysis-vocab → landmark-vocab. A muscle absent here is already landmark-vocab.
# "back" splits to both lat-dominant and upper-back-dominant landmarks since the
# rows/pulldowns/pulls that map to "back" train both. traps/side_delts/neck/
# upper_chest/rear_delts pass through untouched — first-class landmarks now.
_ANALYSIS_TO_LANDMARK: dict[str, list[str]] = {
    "back":       ["upper_back", "lats"],
    "abs":        ["core"],
    "lower_back": [],  # no dedicated landmark
    # No landmark in hypertrophy_volume.MUSCLES, so there is nothing to learn or fund
    # for these yet — they resolve to no landmark rather than being silently attributed
    # to a neighbouring muscle. NOTE: athlete_profile.MUSCLE_EMPHASIS boosts "forearms"
    # to 1.25, but with no landmark the allocator can never fund it; direct forearm work
    # stays pinned at 1 set. Adding a real forearms landmark needs MEV/MAV/MRV priors,
    # which is a deliberate call, not something to guess at here.
    "forearms":   [],
    "adductors":  [],
}

# Soreness check-in regions (daily_readiness.soreness_snapshot keys) → landmarks.
SORENESS_REGION_MUSCLES: dict[str, list[str]] = {
    "Chest":      ["chest", "upper_chest"],
    "Back":       ["upper_back", "lats"],
    "Shoulders":  ["shoulders", "side_delts", "rear_delts"],
    "Arms":       ["biceps", "triceps"],
    "Quads":      ["quads"],
    "Hamstrings": ["hamstrings", "glutes"],
    "Calves":     ["calves"],
    "Core":       ["core"],
    "Neck":       ["neck"],
    "Traps":      ["traps"],
}


def get_muscles(exercise_name: str) -> list[str]:
    """Analysis-vocab muscles trained by an exercise (keyword substring match).
    A keyword contained in an already-matched longer keyword is suppressed, so
    "neck curl" doesn't also credit biceps via "curl", "hamstring curl" doesn't
    credit biceps either, and "romanian deadlift" doesn't credit back via
    "deadlift" — longest match truly wins.

    The name is normalized (hyphens to spaces) before matching, so "Weighted
    Pull-up" resolves against the "pull up" keyword."""
    name = _norm(exercise_name)
    found: set[str] = set()
    matched: list[str] = []
    for kw in _MUSCLE_KEYWORDS:
        if kw in name and not any(kw in prev for prev in matched):
            matched.append(kw)
            found.update(_NORM_MUSCLE_MAP[kw])
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
