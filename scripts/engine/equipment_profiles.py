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
