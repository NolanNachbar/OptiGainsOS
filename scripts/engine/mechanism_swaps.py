"""
mechanism_swaps.py — turn a RECURRING failure mechanism into a different exercise.

failure_reasons.parse_set_failures reports `mechanism_flags`: {exercise: {mechanism: n}}
once the same mechanism has shown up on the same exercise more than once. This module
is the consumer: it swaps that exercise for a variation that removes the cause.

  unstable    → a more supported variation (machine / seated / chest-supported)
  asymmetric  → a unilateral or independent-arm variation
  grip        → a variation that takes the hands out of the limiting link
  strict_form → NO swap. The athlete is stronger than the cleaner standard allows yet;
                the right response is to keep the load and let progression catch up,
                not to change the exercise.
  form        → NO swap (cue problem, not an exercise problem).

Goal lifts (bench / squat / deadlift top sets) are never swapped: they are the strength
prescription, and their weak points are handled by the region path in session_generator.

The tables are authored judgement, not learned. Every target must exist in the catalog
(test_mechanism_swaps.py enforces it). Extend them as the catalog grows.
"""
from __future__ import annotations

import copy
from typing import Callable

# mechanism → {current exercise → replacement}
SWAPS: dict[str, dict[str, str]] = {
    "unstable": {
        "Incline DB Press":       "Reverse Grip Incline Smith Machine Press",
        "DB Bench Press":         "Bench Press (Back-off Vol)",
        "Overhead Press (BB)":    "Seated DB Overhead Press",
        "Overhead Press (DB)":    "Seated DB Overhead Press",
        "Dumbbell Row":           "Chest-Supported Row",
        "Barbell Row":            "Chest-Supported Row",
        "Bulgarian Split Squat":  "Leg Press",
        "Lateral Raise":          "Cable Lateral Raise",
    },
    "asymmetric": {
        "Incline Bench Press":    "Incline DB Press",
        "Bench Press (Back-off Vol)": "DB Bench Press",
        "Overhead Press (BB)":    "Overhead Press (DB)",
        "Barbell Row":            "Dumbbell Row",
        "Leg Press":              "Bulgarian Split Squat",
        "Lat Pulldown":           "Dumbbell Row",
    },
    "grip": {
        "Barbell Row":            "Chest-Supported Row",
        "Dumbbell Row":           "Chest-Supported Row",
        "Cable Row":              "Chest-Supported Row",
    },
}

# Order matters when one exercise carries several mechanisms: the first listed that has
# a swap for this exercise wins, so a single swap is made per exercise per session.
_PRIORITY = ("unstable", "asymmetric", "grip")


def swap_for(exercise: str, flags: dict) -> tuple[str, str] | None:
    """(mechanism, replacement) for this exercise, or None. `flags` is the
    `mechanism_flags` dict from parse_set_failures."""
    seen = (flags or {}).get(exercise)
    if not seen:
        return None
    for m in _PRIORITY:
        if m in seen and exercise in SWAPS.get(m, {}):
            return m, SWAPS[m][exercise]
    return None


def apply_mechanism_swaps(exercises: list, flags: dict, *, catalog: dict,
                          blocked: Callable[[str], bool],
                          build: Callable[[str], dict]) -> list[str]:
    """Swap flagged exercises in `exercises` in place. Returns human-readable notes.

    catalog: name → catalog entry (a replacement must exist here)
    blocked: True if the athlete has blocked that exercise
    build:   name → a fully scaled session row for the replacement
    """
    if not flags:
        return []
    notes: list[str] = []
    present = {e.get("name") for e in exercises}
    for i, ex in enumerate(exercises):
        name = ex.get("name")
        if ex.get("is_goal") or ex.get("is_backoff") or ex.get("is_assistance"):
            continue
        hit = swap_for(name, flags)
        if not hit:
            continue
        mech, repl = hit
        if repl not in catalog or repl in present or blocked(repl):
            continue
        row = build(repl)
        # Keep the slot's volume: the swap changes the movement, not the dose.
        if ex.get("sets"):
            row["sets"] = ex["sets"]
        row["swapped_for"] = mech
        row["swap_note"] = f"Swapped from {name}: repeated '{mech}' misses."
        exercises[i] = row
        present.discard(name)
        present.add(repl)
        notes.append(f"{name} -> {repl} ({mech})")
    return notes
