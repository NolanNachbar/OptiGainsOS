"""
equipment_profiles.py — what a location's equipment makes possible.

A profile declares the EQUIPMENT that is present. What's trainable is derived
from that, by checking each catalog exercise's requirements against it. The
earlier version instead listed allowed exercise NAMES and blocked everything
else, which meant the list had to enumerate every doable movement or it was
silently banned — push-ups, deadlifts and incline bench were all blocked at
Casper despite needing nothing that isn't there. Naming equipment is the fact
the athlete actually knows; enumerating exercises is a chore that goes stale
every time the catalog grows.

Unknown exercises FAIL OPEN. An exercise with no entry in EQUIPMENT_REQUIRED is
assumed to need nothing and stays available, so adding to the catalog can never
silently remove a movement from a limited-equipment day. The cost of a wrong
fail-open is one substitution the athlete swaps out; the cost of a wrong
fail-closed is a gutted session, which is what the name-list version produced.

mpc_prescriber.py unions the result on top of the athlete's manual
exercise_preferences blocked/preferred sets — a profile can only ADD
restrictions, never remove one set by hand. generate_weekly_program.py
deliberately does NOT apply this: the weekly template is the full-gym plan and
location is decided per-day at check-in.

'casper': adjustable dumbbells, one barbell + plates, a flat bench and a second
adjustable bench. No rack, no pull-up bar, no cables or machines, and a ceiling
too low to press standing overhead.
"""

from engine.log_ingest import canon

# Equipment tokens. BAR/PLATES are one token — they're never apart here.
BARBELL      = "barbell"           # bar + plates
DUMBBELLS    = "dumbbells"
BENCH_FLAT   = "bench_flat"        # flat bench with press uprights
BENCH_ADJ    = "bench_adjustable"  # incline/decline capable
RACK         = "rack"              # squat rack or stands — unrack at shoulder height
CABLE        = "cable"
PULLUP_BAR   = "pullup_bar"
DIP_STATION  = "dip_station"
SMITH        = "smith_machine"
MACHINE      = "machine"           # any selectorized/plate-loaded machine
OVERHEAD     = "overhead_clearance"  # room to press standing
HYPER_BENCH  = "hyper_bench"       # 45° back-extension / GHD
SEAL_BENCH   = "seal_bench"        # bench raised enough for arms to hang
FOOT_ANCHOR  = "foot_anchor"       # something to hook the heels under

# name -> equipment it requires. Absent = requires nothing (see fail-open above).
_REQUIRES = {
    # ── Horizontal press ──────────────────────────────────────────────
    "Bench Press (Top Set)":        {BARBELL, BENCH_FLAT},
    "Bench Press (Back-off Vol)":   {BARBELL, BENCH_FLAT},
    "Bench Press (Back-off Int)":   {BARBELL, BENCH_FLAT},
    "Bench Press (Speed Work)":     {BARBELL, BENCH_FLAT},
    "Larsen Press":                 {BARBELL, BENCH_FLAT},
    "Incline Bench Press":          {BARBELL, BENCH_ADJ},
    "DB Bench Press":               {DUMBBELLS, BENCH_FLAT},
    "Incline DB Press":             {DUMBBELLS, BENCH_ADJ},
    "Reverse Grip Incline Smith Machine Press": {SMITH},

    # ── Squat ─────────────────────────────────────────────────────────
    # Back squat needs stands to unrack; front/Zercher are taken from the
    # floor, which is exactly why they're the no-rack substitutes.
    "Back Squat (Top Set)":         {BARBELL, RACK},
    "Back Squat (Back-off)":        {BARBELL, RACK},
    "Pin Squat":                    {BARBELL, RACK},
    "Paused Squat":                 {BARBELL, RACK},
    "Front Squat":                  {BARBELL},
    "Zercher Squat":                {BARBELL},
    "Bulgarian Split Squat":        {DUMBBELLS, BENCH_FLAT},
    "Leg Press":                    {MACHINE},
    "Leg Extension":                {MACHINE},

    # ── Hinge ─────────────────────────────────────────────────────────
    "Deadlift (Top Set)":           {BARBELL},
    "Deadlift (Volume)":            {BARBELL},
    "Deadlift (Speed/Light)":       {BARBELL},
    "Paused Deadlift":              {BARBELL},
    "Deficit Deadlift":             {BARBELL},
    "Sumo Deadlift":                {BARBELL},
    "Romanian Deadlift":            {BARBELL},
    "Hip Thrust":                   {BARBELL, BENCH_FLAT},
    "Hamstring Curl":               {MACHINE},
    "Nordic Curl":                  {FOOT_ANCHOR},
    "Back Extension":               {HYPER_BENCH},

    # ── Pull ──────────────────────────────────────────────────────────
    "Weighted Pull-up":             {PULLUP_BAR},
    "Pull-ups":                     {PULLUP_BAR},
    "Bodyweight Pull-ups":          {PULLUP_BAR},
    "Pull-up Pyramid":              {PULLUP_BAR},
    "Hanging Leg Raise":            {PULLUP_BAR},
    "Lat Pulldown":                 {MACHINE},
    "Cable Row":                    {CABLE},
    "Seal Row":                     {SEAL_BENCH},
    # Chest-supported row is doable lying prone on an incline bench with DBs.
    "Chest-Supported Row":          {DUMBBELLS, BENCH_ADJ},
    "Dumbbell Row":                 {DUMBBELLS},
    "Barbell Row":                  {BARBELL},

    # ── Dips ──────────────────────────────────────────────────────────
    "Weighted Dip":                 {DIP_STATION},
    "Dips":                         {DIP_STATION},
    "Dip Pyramid":                  {DIP_STATION},

    # ── Overhead press ────────────────────────────────────────────────
    # Standing needs ceiling height; the seated version is the whole reason
    # it's a separate catalog entry.
    "Overhead Press (BB)":          {BARBELL, OVERHEAD},
    "Overhead Press (DB)":          {DUMBBELLS, OVERHEAD},
    "Seated DB Overhead Press":     {DUMBBELLS, BENCH_ADJ},

    # ── Cable-only isolation ──────────────────────────────────────────
    "Triceps Pushdown":             {CABLE},
    "Cable Lateral Raise":          {CABLE},
    "Face Pull":                    {CABLE},
    "Low-to-High Cable Fly":        {CABLE},

    # ── Free-weight isolation ─────────────────────────────────────────
    "Triceps OH Extension":         {DUMBBELLS},
    "Skull Crushers":               {BARBELL, BENCH_FLAT},
    "Lateral Raise":                {DUMBBELLS},
    "Rear Delt Fly":                {DUMBBELLS},
    "Bicep Curl":                   {DUMBBELLS},
    "Hammer Curl":                  {DUMBBELLS},
    "Barbell Curl":                 {BARBELL},
    "Wrist Curl":                   {BARBELL},
    "Dumbbell Shrug":               {DUMBBELLS},
    "Barbell Shrug":                {BARBELL},
    "Barbell Hold":                 {BARBELL},
    "Seated Calf Raise":            {DUMBBELLS, BENCH_FLAT},
    "Weighted DB Sit-Up":           {DUMBBELLS},

    # Push-ups, plank, calf raise, neck work: bodyweight, no entry needed.
}

_REQUIRES_CANON = {canon(n): req for n, req in _REQUIRES.items()}

EQUIPMENT_PROFILES = {
    # None = unrestricted.
    "full_gym": None,
    "casper": {
        "available": {BARBELL, DUMBBELLS, BENCH_FLAT, BENCH_ADJ},
        # Zercher over front squat for the same slot: no clean-load ceiling.
        # Skull crushers over the DB overhead extension: Nolan performs them
        # with the upper arms angled back overhead, so the long head sits at
        # much the same length, and a loaded barbell out-loads one dumbbell.
        "preferred": {canon("Zercher Squat"), canon("Skull Crushers")},
    },
}


def equipment_blocked_and_preferred(profile_name: str, all_exercise_names):
    """(blocked, preferred) canon-name sets for the given equipment_profile.

    all_exercise_names: the full EXERCISES name list (session_generator._EX_BY_NAME).
    An exercise is blocked only when it REQUIRES equipment the profile doesn't
    list. No entry in _REQUIRES means no requirement, so it stays available."""
    prof = EQUIPMENT_PROFILES.get(profile_name or "full_gym")
    if not prof:
        return set(), set()
    available = prof["available"]
    blocked = set()
    for name in all_exercise_names:
        c = canon(name)
        needs = _REQUIRES_CANON.get(c)
        if needs and not needs <= available:
            blocked.add(c)
    return blocked, set(prof["preferred"])


# ── Substitutions ────────────────────────────────────────────────────────
# What to run INSTEAD when the profile blocks a movement. Hand-authored the
# same way "preferred" above is, and for the same reason: a computed ranking
# (nearest fatigue_cost, most shared muscles) invents a rule the training model
# doesn't have, and it picks badly at exactly the slots that matter. Every
# blockable catalog entry gets an ordered list; the first candidate the profile
# can actually run wins, so one list serves every profile.
#
# The pairs are the standard no-rack / no-machine answers: squats come off the
# floor instead of out of stands, vertical pulls become rows, cable isolation
# becomes the free-weight version of the same joint action.
_SUBSTITUTES = {
    # No rack: the bar is cleaned or picked up rather than unracked.
    "Back Squat (Top Set)":  ["Zercher Squat", "Front Squat"],
    "Back Squat (Back-off)": ["Zercher Squat", "Front Squat"],
    "Pin Squat":             ["Front Squat", "Zercher Squat"],
    "Paused Squat":          ["Front Squat", "Zercher Squat"],

    # No machines.
    "Leg Press":       ["Bulgarian Split Squat", "Front Squat"],
    "Leg Extension":   ["Bulgarian Split Squat", "Barbell Lunge"],
    "Hamstring Curl":  ["Romanian Deadlift", "Nordic Curl", "Good Morning"],
    "Lat Pulldown":    ["Barbell Row", "Dumbbell Row"],
    "Reverse Grip Incline Smith Machine Press": ["Incline DB Press", "Incline Bench Press"],

    # No hyper bench / foot anchor.
    "Back Extension":  ["Romanian Deadlift", "Good Morning"],
    "Nordic Curl":     ["Romanian Deadlift", "Good Morning"],

    # No pull-up bar: vertical pull falls back to horizontal pull, which is the
    # only lat option left with a bar and dumbbells.
    "Weighted Pull-up":    ["Barbell Row", "Dumbbell Row"],
    "Pull-ups":            ["Barbell Row", "Dumbbell Row"],
    "Bodyweight Pull-ups": ["Dumbbell Row", "Barbell Row"],
    "Pull-up Pyramid":     ["Dumbbell Row", "Barbell Row"],
    "Hanging Leg Raise":   ["Weighted DB Sit-Up", "Plank"],

    # No cable stack / seal bench.
    "Cable Row":           ["Chest-Supported Row", "Dumbbell Row"],
    "Seal Row":            ["Chest-Supported Row", "Dumbbell Row"],
    "Triceps Pushdown":    ["Skull Crushers", "Triceps OH Extension"],
    "Cable Lateral Raise": ["Lateral Raise"],
    "Face Pull":           ["Rear Delt Fly"],
    "Low-to-High Cable Fly": ["Incline DB Press", "Incline Dumbbell Flyes"],

    # No dip station.
    "Weighted Dip": ["DB Bench Press", "Bench Press (Back-off Vol)"],
    "Dips":         ["Push-ups", "DB Bench Press"],
    "Dip Pyramid":  ["Push-up Pyramid", "Diamond Push-ups"],

    # No ceiling clearance: press seated instead of standing.
    "Overhead Press (BB)": ["Seated DB Overhead Press", "Lateral Raise"],
    "Overhead Press (DB)": ["Seated DB Overhead Press", "Lateral Raise"],
}

# For exercises that aren't in the engine catalog at all — a hand-built library
# workout naming movements out of exerciseLibrary.json. There's no per-name pair
# to author for 873 entries, so the fallback is by muscle: the catalog movement
# that trains it and that a bar, dumbbells and two benches can run.
_MUSCLE_FALLBACK = {
    "chest":       ["DB Bench Press", "Push-ups"],
    "upper_chest": ["Incline DB Press", "Incline Dumbbell Flyes"],
    "triceps":     ["Skull Crushers", "Triceps OH Extension"],
    "biceps":      ["Bicep Curl", "Hammer Curl"],
    "brachialis":  ["Hammer Curl", "Alternate Hammer Curl"],
    "shoulders":   ["Seated DB Overhead Press", "Lateral Raise"],
    "front_delt":  ["Seated DB Overhead Press", "Front Raise"],
    "side_delts":  ["Lateral Raise", "Seated Side Lateral Raise"],
    "rear_delts":  ["Rear Delt Fly", "Dumbbell Lying Rear Lateral Raise"],
    "lats":        ["Dumbbell Row", "Barbell Row"],
    "upper_back":  ["Chest-Supported Row", "Barbell Row"],
    "back":        ["Barbell Row", "Dumbbell Row"],
    "middle back": ["Chest-Supported Row", "Barbell Row"],
    "lower back":  ["Romanian Deadlift", "Good Morning"],
    "erectors":    ["Romanian Deadlift", "Good Morning"],
    "traps":       ["Dumbbell Shrug", "Barbell Shrug"],
    "quads":       ["Front Squat", "Bulgarian Split Squat"],
    "quadriceps":  ["Front Squat", "Bulgarian Split Squat"],
    "hamstrings":  ["Romanian Deadlift", "Good Morning"],
    "glutes":      ["Hip Thrust", "Romanian Deadlift"],
    "adductors":   ["Bulgarian Split Squat", "Sumo Deadlift"],
    "abductors":   ["Bulgarian Split Squat", "Barbell Lunge"],
    "calves":      ["Seated Calf Raise", "Calf Raise"],
    "core":        ["Weighted DB Sit-Up", "Plank"],
    "abdominals":  ["Weighted DB Sit-Up", "Plank"],
    "hip_flexors": ["Weighted DB Sit-Up", "Jackknife Sit-Up"],
    "forearms":    ["Wrist Curl", "Barbell Hold"],
    "neck":        ["Neck Curl", "Neck Extension"],
    "rotator_cuff": ["Rear Delt Fly", "Dumbbell Lying Rear Lateral Raise"],
}

# exerciseLibrary.json's `equipment` string -> the tokens it needs. Anything not
# listed (bands, kettlebells, "other", null) maps to nothing required and stays
# available, which is the same fail-open the catalog gets.
LIBRARY_EQUIPMENT_TOKENS = {
    "barbell":     {BARBELL},
    "e-z curl bar": {BARBELL},
    "dumbbell":    {DUMBBELLS},
    "cable":       {CABLE},
    "machine":     {MACHINE},
    "body only":   set(),
}


def _profile_runs(profile_name: str, name: str) -> bool:
    """Can this profile run the named catalog exercise? Unknown names fail open."""
    prof = EQUIPMENT_PROFILES.get(profile_name or "full_gym")
    if not prof:
        return True
    needs = _REQUIRES_CANON.get(canon(name))
    return (not needs) or needs <= prof["available"]


def substitutes_for(profile_name: str, name: str, muscles=None):
    """Every replacement this profile can run instead of `name`, best first.

    Tries the hand-authored pair list first, then falls back by muscle for names
    the catalog doesn't carry. The profile's own `preferred` set jumps the queue.
    A ranked list rather than a single pick because two blocked lifts in one
    session can share a top substitute — the caller walks down the list so an
    Upper Pull day at Casper gets two rows back, not one row and a hole."""
    prof = EQUIPMENT_PROFILES.get(profile_name or "full_gym")
    if not prof:
        return []
    cands = list(_SUBSTITUTES.get(name, []))
    if not cands:
        for m in (muscles or []):
            for c in _MUSCLE_FALLBACK.get(m, []):
                if c not in cands:
                    cands.append(c)
    preferred = prof.get("preferred") or set()
    cands.sort(key=lambda c: 0 if canon(c) in preferred else 1)
    return [c for c in cands
            if _profile_runs(profile_name, c) and canon(c) != canon(name)]


def substitute_for(profile_name: str, name: str, muscles=None):
    """The single best replacement for `name` under this profile, or None."""
    out = substitutes_for(profile_name, name, muscles)
    return out[0] if out else None


# Shorthand Nolan actually types in hand-built workouts, mapped to the catalog
# entry it means. canon() deliberately doesn't guess these (it would collapse
# distinct lifts), but without them a row reading "Squat (Top Set)" fails open
# and a rack squat survives a no-rack day.
_SHORTHAND = {
    "squat":              "Back Squat (Top Set)",
    "back squat":         "Back Squat (Top Set)",
    "squat (top set)":    "Back Squat (Top Set)",
    "squat (back-off)":   "Back Squat (Back-off)",
    "squat (back off)":   "Back Squat (Back-off)",
    "bench press":        "Bench Press (Top Set)",
    "bench":              "Bench Press (Top Set)",
    "deadlift":           "Deadlift (Top Set)",
    "ohp":                "Overhead Press (BB)",
    "overhead press":     "Overhead Press (BB)",
    "pulldown":           "Lat Pulldown",
    "pushdown":           "Triceps Pushdown",
    "pull-up":            "Pull-ups",
    "pull up":            "Pull-ups",
    "pullup":             "Pull-ups",
    "chin-up":            "Pull-ups",
    "chinup":             "Pull-ups",
    "dip":                "Dips",
}
