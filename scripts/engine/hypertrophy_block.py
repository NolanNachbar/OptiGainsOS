"""
hypertrophy_block.py — explicit session templates for a hypertrophy-focused block.

The default session builder is a knapsack seeded around the three goal lifts, so
bench carries a top set plus back-offs and most other slots are whatever the muscle
budget leaves. A block replaces that with a fixed list per split, so the program is
the same every time it comes round and the progression signal stays clean.

Design (Nolan, 2026-10-17): the existing 7-day upper/lower rotation stays; only the dose
and the emphasis change. Chest, shoulders, arms, lats and quads are the emphasis.

  • Kent (Upper Lower Without Rest): low volume, high frequency. 1-2 hard sets per
    exercise, never more than 2, because the next session is 24 hours away.
  • TNF: the bench press is optional for chest growth. Incline and fly cover it, and
    the bench slot shrinks to one set (Larsen press) instead of a top set + back-offs.
  • Squat day is NOT templated. Nolan: "keep squat as the default". It falls through
    to the normal builder, so lower_squat_primary is unchanged.
  • Weighted Dip stays on Upper A (Nolan, 2026-09-30).

Rep ranges and set counts are authored judgement, not learned, and are TUNABLE. Kent's
own range is 4-7; these run a little higher (6-10) because the block is for size.

Activation: scripts/training_block.json -> {"block": "hypertrophy"}. The entry points
read it and pass `block` down; _build_session called directly (tests, the validator)
never sees a block and behaves exactly as before.
"""
from __future__ import annotations

import copy
import json
import os
from typing import Callable

# (catalog name, sets, rep_target, rir_target)
HYPERTROPHY: dict[str, list[tuple[str, int, str, int]]] = {
    "upper_a": [   # chest + shoulders lead
        ("Reverse Grip Incline Smith Machine Press", 2, "6-8",  1),
        ("Larsen Press",              1, "5-8",   1),   # the whole bench slot now
        ("Weighted Dip",              1, "6-8",   1),
        ("Cable Fly",                 2, "10-12", 0),
        ("Seated DB Overhead Press",  2, "6-8",   1),
        ("Cable Lateral Raise",       3, "12-15", 0),
        ("Lat Pulldown",              1, "6-8",   1),
        ("Chest-Supported Row",       1, "6-8",   1),
        ("Bicep Curl",                1, "8-10",  0),
    ],
    "upper_b": [   # lats + arms lead
        ("Weighted Pull-up",          2, "6-8",   1),
        ("Lat Pulldown",              1, "8-10",  1),
        ("Chest-Supported Row",       1, "6-8",   1),
        ("Incline DB Press",          1, "6-8",   1),
        ("Cable Fly",                 1, "10-12", 0),
        ("Cable Lateral Raise",       2, "12-15", 0),
        ("Bicep Curl",                2, "8-10",  0),
        ("Hammer Curl",               1, "8-10",  0),
        ("Triceps OH Extension",      2, "8-10",  0),
        ("Face Pull",                 1, "12-15", 0),
    ],
    # lower_squat_primary: intentionally absent (squat stays the default).
    "lower_hinge_primary": [   # quad-biased hinge day: RDL stays, quads get a second hit
        ("Romanian Deadlift",         2, "6-8",   1),
        ("Bulgarian Split Squat",     2, "8-10",  1),
        ("Leg Extension",             1, "10-12", 0),
        ("Hamstring Curl",            2, "8-10",  0),
        ("Hip Thrust",                1, "8-10",  1),
        ("Calf Raise",                2, "10-15", 0),
    ],
}

_CONFIG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "training_block.json")


def load_active_block(path: str = _CONFIG) -> str | None:
    """The block named in training_block.json, or None. Missing/invalid file = no block."""
    try:
        with open(path) as f:
            name = (json.load(f) or {}).get("block")
    except (OSError, ValueError):
        return None
    return name if name in BLOCKS else None


BLOCKS = {"hypertrophy": HYPERTROPHY}


def build_block_session(block: str | None, split: str, intensity: float, *,
                        catalog: dict, scale: Callable[..., dict],
                        blocked: Callable[[str], bool],
                        readiness_z: float = 0.0) -> list | None:
    """Rows for this split under this block, or None to use the normal builder."""
    template = BLOCKS.get(block or "", {}).get(split)
    if not template:
        return None
    rows: list[dict] = []
    for name, sets, reps, rir in template:
        if name not in catalog or blocked(name):
            continue
        ex = copy.deepcopy(catalog[name])
        ex["rep_target"] = reps
        ex["rir_target"] = rir
        ex = scale(ex, intensity, False, readiness_z)
        # Low-intensity weeks trim a set the way the normal builder does; the template
        # sets the dose otherwise, so scaling must not re-derive it from the catalog.
        ex["sets"] = max(1, sets - 1) if intensity < 0.85 else sets
        ex["block"] = block
        rows.append(ex)
    return rows
