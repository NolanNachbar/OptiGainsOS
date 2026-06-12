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
STRENGTH_RIR_FLOOR                = 1    # [ENG] strength work stays submaximal (don't grind singles)

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
    "hamstrings":  1.15,   # hinge-dominant training can under-serve hamstring isolation
}


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


def accessory_set_cap(weekly_target: int) -> int:
    """
    Per-session set cap for an accessory given the muscle's weekly target.

    Low weekly target → 1 set; otherwise the 2-set cap. Volume above that is
    delivered by training the muscle again later in the week (frequency), not by
    adding sets here.
    """
    if weekly_target and weekly_target >= 8:
        return MAX_ACCESSORY_SETS_PER_EXERCISE
    return MIN_ACCESSORY_SETS_PER_EXERCISE


def apply_philosophy(ex: dict, weekly_target: int = 0) -> dict:
    """
    Enforce the low-volume / high-intensity rule on a fully-built exercise dict
    (called AFTER intensity/readiness scaling so it has the final say).

    - Accessories: clamp sets to 1-2 and drive RIR to 0 (true failure).
    - Strength movements: untouched except a hard RIR floor so a fresh-day
      adjustment can't push a heavy lift past RIR 1.
    Mutates and returns `ex`.
    """
    if is_strength_movement(ex):
        rir = ex.get("rir_target")
        if rir is not None:
            ex["rir_target"] = max(STRENGTH_RIR_FLOOR, int(rir))
        return ex

    # Accessory: 1-2 sets, to failure.
    cap = accessory_set_cap(weekly_target)
    if ex.get("sets"):
        ex["sets"] = max(MIN_ACCESSORY_SETS_PER_EXERCISE, min(int(ex["sets"]), cap))
    if ex.get("rir_target") is not None:
        ex["rir_target"] = ACCESSORY_RIR_TARGET
    ex.setdefault("notes", "")
    tag = "1-2 sets to failure"
    if tag not in (ex.get("notes") or ""):
        ex["notes"] = ((ex["notes"] + " · ") if ex.get("notes") else "") + tag
    return ex
