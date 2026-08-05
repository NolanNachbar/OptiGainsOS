"""
athlete_profile.py — Nolan's training philosophy as a first-class config.

The research-derived priors (Israetel MEV/MAV/MRV, RIR autoregulation) assume a
"normal" trainee. Nolan trains the opposite of the soft internet average:

    HIGH intensity · HIGH frequency · LOW volume per exercise.

Concretely (his call, 2026-06-09):
  - Accessories get 1-2 sets, taken to TRUE FAILURE (RIR 0). One or two all-out
    sets per movement, not 3-4 cushioned ones.
  - Weekly volume is hit by training a muscle MORE OFTEN, not by piling sets onto
    a single session — so per-muscle per-session set counts stay low and frequency
    is pushed up.
  - Strength movements (the goal lifts + their back-offs/assistance + primary
    compounds) are the exception: they keep their multi-set structure and a
    submaximal RIR (1-2) — you don't grind heavy singles to failure.
  - Cutting stays on the TNF rules (see nutrition_modulator.recommend_deficit) —
    this module never softens the diet.

Everything is a tunable [ENG] knob in ONE place so the philosophy can't drift
across the allocator, the session generator, and the prescriber.
"""
from __future__ import annotations

# ── Volume / intensity philosophy ─────────────────────────────────────────────
MAX_ACCESSORY_SETS_PER_EXERCISE   = 2    # [ENG] low volume: 1-2 sets per accessory
MIN_ACCESSORY_SETS_PER_EXERCISE   = 1    # [ENG] never drop an included accessory below 1
ACCESSORY_RIR_TARGET              = 0    # [ENG] high intensity: accessories to failure
MAX_ACCESSORY_SETS_PER_MUSCLE_PER_SESSION = 3   # [ENG] keep per-session muscle volume low → forces frequency up
HIGH_FREQUENCY_FLOOR              = 3    # [ENG] a muscle with real weekly volume is hit ≥3x/wk

# Fast-recovering, high-frequency-tolerant muscles. Their priors carry high MRV
# (e.g. calves/side_delts MRV 24) that the standard per-session cap × days-available
# can't deliver (~18), so a learned high MRV is silently clipped before it reaches
# the schedule (CONVERGENCE_AUDIT F5). These muscles recover fast and Nolan trains
# them often, so they get a higher per-session ceiling — the "explore when tolerated"
# widening, applied only to the muscles that have empirically earned it. [ENG]
FAST_RECOVERY_MUSCLES = {"calves", "side_delts", "neck", "traps", "rear_delts", "forearms"}
MAX_SETS_PER_MUSCLE_PER_SESSION_FAST = 4   # [ENG]


def per_session_muscle_cap(muscle: str) -> int:
    """Per-session set ceiling for a muscle — higher for fast-recovery muscles so
    their learned high MRV stays deliverable across the training week (F5)."""
    return (MAX_SETS_PER_MUSCLE_PER_SESSION_FAST if muscle in FAST_RECOVERY_MUSCLES
            else MAX_ACCESSORY_SETS_PER_MUSCLE_PER_SESSION)
STRENGTH_RIR_FLOOR                = 1    # [ENG] strength work stays submaximal (don't grind singles)

# ── Session SIZE (exercise count) ─────────────────────────────────────────────
# The knobs above bound sets PER EXERCISE. Nothing bounded exercises PER SESSION,
# and the two constraints do not imply each other. `_build_session` created one
# slot per muscle in the split's domain unconditionally, and UPPER_A/B_MUSCLES has
# 11 entries — so an upper day was 11 slots before the isolation supplement and the
# goal lift's back-off + assistance stack, landing at 13-15. That is the "14
# exercises" Nolan flagged (2026-08-04); the earlier fix for the same complaint
# (2026-07-29) deleted forearms from the muscle list, which treats the symptom.
#
# Volume reduction could not shrink it either: a low weekly target scales the
# chosen exercise's SETS down (floor 1) but the slot survives, so a cut turned a
# 14-exercise session into a 14-exercise session with fewer sets each. Nolan's
# call (2026-08-04): 1 set per exercise is often exactly right — the count of
# STATIONS is what gasses him, not the sets on any one of them. So the cut lever
# is the exercise count, and sets-per-exercise stays where it is.
#
# The target is a TOTAL exercise count for the session (the number
# generate_weekly_program prints as "N exercises"), and it is a learnable prior,
# not a fixed rule: deviation_tracker measures how many exercises he actually runs
# vs how many were prescribed and learners.update_session_size walks the target
# toward his revealed preference, bounded by the floor/ceiling below. The SEED
# value is a starting point, not a claim about optimal session size. [ENG]
#
# The seeds come from TBJP's own template, not from a guess. Episode 03 states the
# session shape directly ([[TBJP EDUCATION SERIES - EPISODE.03]], vault line 34-35):
#
#   Upper: chest compound, shoulder compound, tricep compound, lat compound,
#          upper-back thickness, side-delt isolation, tricep isolation,
#          bicep isolation                                         → 8 exercises
#   Lower: hamstring curl, quad compound, quad isolation, calf raise → 4 exercises
#
# so the target is per split TYPE, not one number for the whole week (Nolan,
# 2026-08-04). A single number made lower days run as long as upper days, which
# TBJP's template never does. Lower is seeded at 5 rather than 4 because his
# lower days also carry a deadlift or squat goal lift the template doesn't.
TARGET_EXERCISES_PER_SESSION      = 8     # [ENG] default when the split is unknown
TARGET_EXERCISES_BY_SPLIT_TYPE    = {     # [ENG] seeds; the learner moves these
    "upper":     8,
    "lower":     5,
    "full_body": 8,
}
MIN_EXERCISES_PER_SESSION         = 4     # [ENG] floor the learner may not cross
MAX_EXERCISES_PER_SESSION         = 12    # [ENG] ceiling the learner may not cross
TARGET_EXERCISES_CUT_MULT         = 0.75  # [ENG] a cut shrinks the session, not the sets

# ── Mandatory isolations ──────────────────────────────────────────────────────
# Nolan's call (2026-08-04): every session carries at least one bicep, one tricep
# and one side-delt isolation, and they do NOT count against the exercise target —
# they go on top. That is not padding, it is the TBJP template: the last three
# slots of his upper day are exactly side-delt iso, tricep iso, bicep iso, at one
# working set each. One set of curls is not what gasses him; a fifth compound is.
#
# Exempting them from the count is what makes the two rules compatible. Counted,
# a 5-exercise lower day would be three-fifths arm work; uncounted, it is the leg
# template plus the arm/delt tail TBJP puts at the end of the session anyway.
MANDATORY_ISOLATION_MUSCLES       = ("side_delts", "triceps", "biceps")  # [COACH]

# A goal lift's top set and its back-off are ONE exercise for counting purposes
# (Nolan, 2026-08-04) — and TBJP agrees: "load and back off" is his term for two
# sets of one movement, not two movements (Episode 04). Only the back-off row is
# exempt; the top set still counts.


def split_type(split: str | None) -> str:
    """Coarse split family ('upper' / 'lower' / 'full_body') for a split name.
    Public because session_generator needs the same classification to decide which
    sessions owe a calf raise."""
    s = (split or "").lower()
    if s.startswith("full_body"):
        return "full_body"
    if s.startswith("lower") or s in ("legs", "lower_body"):
        return "lower"
    return "upper"


_split_type = split_type  # internal alias, pre-existing call sites


def target_exercises_per_session(split: str | None = None,
                                 phase: str | None = None,
                                 learned: float | None = None) -> int:
    """Countable exercises to program in one session. Mandatory isolations and a
    goal lift's back-off row sit outside this count. `learned` (from
    learners.update_session_size) is a whole-week scalar: it shifts every split
    type by the same delta off its seed, so the learner converges on how big
    Nolan's sessions want to be without flattening upper and lower into each
    other. A cut scales the result down — that is the phase lever, in place of
    trimming sets."""
    seed = TARGET_EXERCISES_BY_SPLIT_TYPE.get(_split_type(split),
                                              TARGET_EXERCISES_PER_SESSION)
    base = float(seed)
    if learned:
        base += float(learned) - float(TARGET_EXERCISES_PER_SESSION)
    if (phase or "").lower() == "cut":
        base *= TARGET_EXERCISES_CUT_MULT
    return int(max(MIN_EXERCISES_PER_SESSION,
                   min(MAX_EXERCISES_PER_SESSION, round(base))))

# ── Rep-range philosophy ──────────────────────────────────────────────────────
# Nolan trains EVERYTHING — including isolation (traps, side delts, neck, calves)
# — in a heavy, sub-10-rep band; he only goes higher when a machine is literally
# maxed out. So we clamp the UPPER bound of every LOADED movement's rep target to
# this ceiling (low-rep strength targets like 3-5 are below it and pass through
# untouched). Bodyweight capacity work (push-up/pull-up pyramids, dips) is exempt.
# Side benefit: keeping loaded isolation ≤ the Epley rep cap (12) means it stays
# e1RM-trackable, so these focus muscles actually generate a strength signal
# instead of falling to rep-tracking (CONVERGENCE_AUDIT F2). [COACH]
PREFERRED_REP_CEILING             = 10   # [COACH] hard upper bound for loaded work
PREFERRED_REP_SPREAD              = 2    # [ENG] width of the clamped band (e.g. 8-10)

# Soreness still trims sets (his own morning input), but the FLOOR is 1 — a sore
# accessory becomes a single hard set, it isn't deleted.
SORENESS_TRIM_FLOOR               = 1    # [ENG]

# ── Per-muscle emphasis ───────────────────────────────────────────────────────
# Multiplies the allocator's goal weight for a muscle (1.0 = neutral). His call
# (2026-06): the muscles SBD training leaves behind are top hypertrophy focuses —
# neck, traps, lateral delts, upper chest, calves; rear delts a notch below
# (rows feed them indirectly). A `muscle_emphasis` jsonb on user_profiles
# overrides this default. [COACH]
MUSCLE_EMPHASIS: dict[str, float] = {
    "neck":        1.5,
    "traps":       1.5,
    "side_delts":  1.5,
    "upper_chest": 1.5,
    "calves":      1.5,
    "rear_delts":  1.25,
    "biceps":      1.25,   # compounds under-stimulate biceps; add dedicated isolation
    "triceps":     1.25,   # same gap as biceps: pressing fatigues triceps without isolating them
    "forearms":    1.25,   # Nolan's call (2026-07-08): hit forearms directly, not just via grip holds
    "hamstrings":  1.15,   # hinge-dominant training can under-serve hamstring isolation
}


# Clark Kent's stated weekly cadence per JOINT ACTION (not muscle) — 4-6 hard
# sets/week of e.g. horizontal_push, independent of how many OTHER joint
# actions also hit chest as a synergist that week. A LEARNABLE wide prior from
# his coaching source, not a fixed law — [COACH] range, [ENG] would be a single
# tunable number if/when this needs to feed the allocator directly.
CLARK_KENT_JOINT_ACTION_TARGET = (4, 6)   # [COACH] (low, high) hard sets/joint-action/week


def is_strength_movement(ex: dict) -> bool:
    """
    True for movements that keep their multi-set, submaximal structure:
    the goal lifts and their back-offs/assistance only.
    Primary compounds (is_primary=True but not is_goal) follow the same
    1-2-sets-to-failure rule as accessories — the user trains high-intensity
    but LOW volume per session, hitting muscles more often instead.
    """
    return bool(
        ex.get("is_goal")
        or ex.get("is_backoff")
        or ex.get("is_assistance")
    )


def accessory_set_cap(weekly_target: int, session_target: int = None) -> int:
    """
    Per-session set cap for an accessory given the muscle's weekly target.

    `session_target` (weekly_target / expected frequency, from session_generator's
    `_session_sets`) is the real per-session share of the weekly allocation — use
    it directly so a muscle's cap actually tracks week-to-week changes in its
    weekly target instead of collapsing every target below 8 to the same 1 set
    and every target at/above 8 to the same 2 sets. Volume above the 1-2 range is
    still delivered by training the muscle again later in the week (frequency),
    not by adding more sets here — this only restores the variation the binary
    cutoff was throwing away.
    """
    if session_target is not None:
        return max(MIN_ACCESSORY_SETS_PER_EXERCISE,
                    min(session_target, MAX_ACCESSORY_SETS_PER_EXERCISE))
    if weekly_target and weekly_target >= 8:
        return MAX_ACCESSORY_SETS_PER_EXERCISE
    return MIN_ACCESSORY_SETS_PER_EXERCISE


def clamp_rep_range(rep_target, ceiling: int = PREFERRED_REP_CEILING,
                    spread: int = PREFERRED_REP_SPREAD) -> str:
    """
    Clamp the UPPER bound of a rep target to `ceiling` (Nolan's sub-10 preference).

    "12-15" → "8-10", "10-12" → "8-10", single "12" → "8-10", but low-rep strength
    targets ("3-5", "5") pass through unchanged (already below the ceiling). Complex
    pyramid strings ("1-2-3-4-5-...") and non-numeric targets are returned as-is.
    """
    s = str(rep_target or "").strip()
    if not s:
        return s
    parts = s.split("-")
    # Only simple "n" or "a-b" forms; leave pyramids / odd formats alone.
    if len(parts) > 2 or not all(p.strip().isdigit() for p in parts):
        return s
    nums = [int(p) for p in parts]
    lo, hi = (nums[0], nums[-1])
    if hi <= ceiling:
        return s
    hi = ceiling
    lo = max(1, min(lo, ceiling - spread))
    return f"{lo}-{hi}" if lo != hi else str(hi)


def apply_philosophy(ex: dict, weekly_target: int = 0, session_target: int = None) -> dict:
    """
    Enforce the low-volume / high-intensity rule on a fully-built exercise dict
    (called AFTER intensity/readiness scaling so it has the final say).

    - Rep range: every LOADED movement is clamped to the sub-10 ceiling (his pref).
    - Accessories: clamp sets to 1-2 and drive RIR to 0 (true failure).
    - Strength movements: untouched except a hard RIR floor so a fresh-day
      adjustment can't push a heavy lift past RIR 1.
    Mutates and returns `ex`.
    """
    # Rep-range clamp applies to loaded work only — bodyweight capacity movements
    # (pyramids, push-ups, dips) legitimately live above the ceiling.
    if not ex.get("is_bodyweight") and ex.get("rep_target") is not None:
        ex["rep_target"] = clamp_rep_range(ex["rep_target"])

    if is_strength_movement(ex):
        rir = ex.get("rir_target")
        if rir is not None:
            ex["rir_target"] = max(STRENGTH_RIR_FLOOR, int(rir))
        return ex

    # Accessory: 1-2 sets, to failure.
    cap = accessory_set_cap(weekly_target, session_target)
    if ex.get("sets"):
        ex["sets"] = max(MIN_ACCESSORY_SETS_PER_EXERCISE, min(int(ex["sets"]), cap))
    if ex.get("rir_target") is not None:
        ex["rir_target"] = ACCESSORY_RIR_TARGET
    ex.setdefault("notes", "")
    tag = "1-2 sets to failure"
    if tag not in (ex.get("notes") or ""):
        ex["notes"] = ((ex["notes"] + " · ") if ex.get("notes") else "") + tag
    return ex
