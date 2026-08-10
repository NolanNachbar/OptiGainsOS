"""
equipment_profiles.py — exercise whitelists for `user_profiles.equipment_profile`.

'full_gym' is unrestricted (None → no filtering, current default behavior).
Every other profile lists the exact EXERCISES names (session_generator.py)
that are actually possible with that location's equipment. mpc_prescriber.py
and generate_weekly_program.py union this against the athlete's manual
exercise_preferences blocked/preferred sets — a profile can only ADD
restrictions/preferences on top of what's already there, never remove one
the athlete set by hand.

'casper': adjustable dumbbells, one barbell + plates, a flat bench, and a
second adjustable bench (incline/flat) — no rack, no pull-up bar, and a
ceiling too low for standing overhead press. Checked against
MANDATORY_ISOLATION_POOL (session_generator.py ~line 492) before finalizing:
side_delts, triceps and biceps each still resolve to a non-empty pool
("Lateral Raise", "Triceps OH Extension", "Bicep Curl"/"Hammer Curl" are all
Casper-doable), so the every-session isolation guarantee never silently
drops out.

Accepted gap, not a bug: ISOLATION_SUPPLEMENTS' lower-split entries
("Leg Extension", "Hamstring Curl") and upper_a's triceps entry
("Triceps Pushdown") are all machine-only and blocked under 'casper'. Those
specific supplement slots just won't fire — quads/hamstrings still get direct
compound coverage from squats/RDL/Bulgarian split squat, and triceps is still
covered every session by the mandatory-isolation pool above. Hanging Leg
Raise (needs a pull-up bar) and Cable Lateral Raise / Triceps Pushdown (need
a cable stack) are excluded for the same reason.
"""

from engine.log_ingest import canon

_CASPER_EXERCISES = [
    "Front Squat",                    # clean + front squat — load capped by the clean, not squat strength
    "Zercher Squat",                  # preferred over Front Squat for the same slot: no clean-load ceiling
    "Bulgarian Split Squat",
    "Romanian Deadlift",
    "Bench Press (Top Set)",
    "Bench Press (Back-off Vol)",
    "Bench Press (Back-off Int)",
    "Bench Press (Speed Work)",
    "DB Bench Press",
    "Incline DB Press",
    "Dumbbell Row",
    "Barbell Row",
    "Dumbbell Shrug",
    "Barbell Shrug",
    "Lateral Raise",
    "Seated DB Overhead Press",       # ceiling too low to stand
    "Triceps OH Extension",
    "Skull Crushers",
    "Bicep Curl",
    "Hammer Curl",
    "Barbell Curl",
    "Calf Raise",
    "Plank",
    "Weighted DB Sit-Up",
]

EQUIPMENT_PROFILES = {
    "full_gym": None,
    "casper": {
        "whitelist": {canon(n) for n in _CASPER_EXERCISES},
        "preferred": {canon("Zercher Squat")},
    },
}


def equipment_blocked_and_preferred(profile_name: str, all_exercise_names):
    """(blocked, preferred) canon-name sets for the given equipment_profile.
    all_exercise_names: the full EXERCISES name list (session_generator._EX_BY_NAME),
    so the block set is computed as "everything not on the whitelist", and stays
    correct as new exercises are added to the catalog without touching this file."""
    prof = EQUIPMENT_PROFILES.get(profile_name or "full_gym")
    if not prof:
        return set(), set()
    all_canon = {canon(n) for n in all_exercise_names}
    blocked = all_canon - prof["whitelist"]
    return blocked, set(prof["preferred"])
