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

# Secondary-mover set credit for hypertrophy VOLUME counting (compute_hypertrophy).
# Every EXERCISE_MUSCLE_MAP entry lists its primary mover first by convention
# (e.g. "overhead press": ["shoulders", "triceps"] — shoulders is the target,
# triceps is a synergist). Counting a synergist set as a full set double-books
# volume: Bench Press alone credits a full chest set AND a full triceps set,
# so pressing days alone can push triceps to apparent MRV before any direct
# triceps or vertical-press (OHP) work is even logged, which then reads to the
# allocator as "triceps is already maxed" and suppresses more pressing.
# Half-credit for indirect/synergist volume is Israetel's Core Volume Model
# convention (RP hypertrophy system); this is a LEARNABLE wide prior like the
# other [ENG] constants in this codebase, not a fixed law.
SECONDARY_MUSCLE_CREDIT = 0.5   # [ENG] fraction of a set credited to synergist movers

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

# ── Joint-action taxonomy (Clark Kent) ────────────────────────────────────────
# Clark Kent's stated volume unit isn't the muscle, it's the JOINT ACTION —
# chest-press and chest-fly are counted separately even though both hit
# "chest", at a 4-6 sets/joint-action/week cadence (see athlete_profile
# CLARK_KENT_JOINT_ACTION_TARGET). Reuses the same pattern vocabulary as
# session_generator.EXERCISES ("horizontal_push", "hinge", …) so a logged set
# and a programmed slot count the same way. Keyed on the SAME keywords as
# EXERCISE_MUSCLE_MAP (one keyword table, two things it's looked up for) so
# the two vocabularies can't drift out of sync with each other. [COACH]
JOINT_ACTION_MAP: dict[str, str] = {
    "romanian deadlift": "hinge", "rdl": "hinge", "good morning": "hinge",
    "nordic curl": "hinge", "leg curl": "isolation_lower",
    "hip thrust": "hip_thrust", "glute bridge": "hip_thrust",
    "cable kickback": "isolation_lower", "bulgarian split": "squat",
    "leg extension": "isolation_lower", "leg press": "squat",
    "hack squat": "squat", "lunge": "squat", "step up": "squat",
    "squat": "squat", "deadlift": "hinge",
    "incline bench press": "incline_push",
    "low-to-high cable fly": "isolation_upper", "low to high cable fly": "isolation_upper",
    "incline bench": "incline_push", "incline press": "incline_push",
    "incline dumbbell": "incline_push", "incline db": "incline_push",
    "incline fly": "isolation_upper", "low-to-high": "isolation_upper",
    "low to high": "isolation_upper", "decline bench": "horizontal_push",
    "bench press": "horizontal_push", "bench": "horizontal_push",
    "flat bench": "horizontal_push", "dumbbell press": "horizontal_push",
    "chest fly": "isolation_upper", "cable fly": "isolation_upper",
    "pec fly": "isolation_upper", "close grip": "horizontal_push",
    "skull crusher": "isolation_upper", "tricep pushdown": "isolation_upper",
    "tricep extension": "isolation_upper", "overhead tricep": "isolation_upper",
    "tricep": "isolation_upper", "dip": "dip",
    "push up": "horizontal_push", "pushup": "horizontal_push",
    "overhead press": "vertical_push", "military press": "vertical_push",
    "shoulder press": "vertical_push", "lateral raise": "isolation_upper",
    "face pull": "isolation_upper", "rear delt fly": "isolation_upper",
    "reverse fly": "isolation_upper", "reverse pec": "isolation_upper",
    "upright row": "isolation_upper", "shrug": "isolation_upper",
    "neck curl": "isolation_upper", "neck extension": "isolation_upper",
    "neck flexion": "isolation_upper", "neck harness": "isolation_upper",
    "barbell row": "horizontal_pull", "bent over row": "horizontal_pull",
    "pendlay row": "horizontal_pull", "t-bar row": "horizontal_pull",
    "chest supported": "horizontal_pull", "seal row": "horizontal_pull",
    "pull up": "vertical_pull", "pullup": "vertical_pull",
    "chin up": "vertical_pull", "chinup": "vertical_pull",
    "lat pulldown": "vertical_pull", "seated row": "horizontal_pull",
    "cable row": "horizontal_pull", "row": "horizontal_pull",
    "preacher curl": "isolation_upper", "hammer curl": "isolation_upper",
    "incline curl": "isolation_upper", "hamstring curl": "isolation_lower",
    "leg curls": "isolation_lower", "lying leg curl": "isolation_lower",
    "seated leg curl": "isolation_lower", "wrist curl": "isolation_upper",
    "curl": "isolation_upper", "ohp": "vertical_push",
    "plank": "isolation_lower", "crunch": "isolation_lower",
    "ab wheel": "isolation_lower", "hanging leg": "isolation_lower",
    "sit up": "isolation_lower", "leg raise": "isolation_lower",
    "leg press calf": "isolation_lower", "calf press": "isolation_lower",
    "calf raises (leg press)": "isolation_lower", "calf machine shrug": "isolation_upper",
    "calf raise": "isolation_lower", "seated calf": "isolation_lower",
    "barbell hold": "carry", "adductor": "isolation_lower",
    "larsen press": "horizontal_push", "reverse grip incline": "incline_push",
    "smith machine incline": "incline_push", "incline smith": "incline_push",
    "smith machine shoulder press": "vertical_push",
}
_NORM_JOINT_ACTION_MAP = {_norm(k): v for k, v in JOINT_ACTION_MAP.items()}
# Keyword coverage must match EXERCISE_MUSCLE_MAP exactly — a key present in one
# but not the other silently drops that exercise from one of the two volume
# counts. Fail loud at import time instead of at 2am three months from now.
assert set(_NORM_JOINT_ACTION_MAP) == set(_NORM_MUSCLE_MAP), (
    "JOINT_ACTION_MAP and EXERCISE_MUSCLE_MAP keyword sets have drifted apart"
)


def get_joint_action(exercise_name: str) -> str | None:
    """The single joint action an exercise trains (longest-keyword-match, same
    convention as get_muscles). None if the name matches nothing."""
    name = _norm(exercise_name)
    for kw in _MUSCLE_KEYWORDS:
        if kw in name:
            return _NORM_JOINT_ACTION_MAP[kw]
    return None

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


def get_muscle_credit(exercise_name: str) -> dict:
    """Analysis-vocab muscles trained by an exercise, weighted by primary
    (1.0) vs synergist (SECONDARY_MUSCLE_CREDIT) per the first-listed-is-
    primary convention in EXERCISE_MUSCLE_MAP. For hypertrophy VOLUME
    counting (compute_hypertrophy) — get_muscles() stays unweighted for
    plain membership checks (deviation tracking, session pattern dedup)."""
    name = _norm(exercise_name)
    matched: list[str] = []
    credit: dict[str, float] = {}
    for kw in _MUSCLE_KEYWORDS:
        if kw in name and not any(kw in prev for prev in matched):
            matched.append(kw)
            for i, m in enumerate(_NORM_MUSCLE_MAP[kw]):
                weight = 1.0 if i == 0 else SECONDARY_MUSCLE_CREDIT
                credit[m] = max(credit.get(m, 0.0), weight)
    return credit


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
