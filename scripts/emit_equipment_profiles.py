#!/usr/bin/env python3
"""emit_equipment_profiles.py — bake equipment_profiles.py out for the browser.

The equipment whitelist, the substitution pairs and canon() all live in Python,
and canon() is intricate enough (alias table, abbreviation regexes, singularise,
case rules) that a hand-written JS copy would drift the first time either side
changed. So Python stays the single source of truth and this script emits a
lookup table the browser can use with nothing but lowercase-and-collapse:

  index   raw-name (lowercased, whitespace collapsed) -> canonical key
  blocked per profile, canonical key -> replacement display name, or null when
          there's nothing available to swap in

Names the index doesn't carry fail open in the browser exactly as they do in the
engine: no entry means no requirement, so the row runs unchanged.

Run after touching equipment_profiles.py or the EXERCISES catalog:
    python3 scripts/emit_equipment_profiles.py
validate_convergence_fixes.py re-runs it in memory and fails on any drift.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))

from engine.log_ingest import canon, ALIASES  # noqa: E402
from engine.session_generator import EXERCISES  # noqa: E402
from engine.equipment_profiles import (  # noqa: E402
    EQUIPMENT_PROFILES,
    LIBRARY_EQUIPMENT_TOKENS,
    _REQUIRES_CANON,
    _SHORTHAND,
    substitute_for,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "equipmentProfiles.json")
LIB = os.path.join(ROOT, "src", "data", "exerciseLibrary.json")

# free-exercise-db muscle names differ from the catalog's; _MUSCLE_FALLBACK
# carries both spellings so nothing needs translating here.


def _norm(s):
    return " ".join(str(s or "").lower().split())


def build():
    with open(LIB) as f:
        library = json.load(f)

    # canonical key -> a display name and the muscles it trains.
    meta = {}
    for e in EXERCISES:
        meta[canon(e["name"])] = {"name": e["name"], "muscles": list(e.get("muscles") or []),
                                  "lib_equipment": None}
    for e in library:
        c = canon(e.get("name") or "")
        if not c or c in meta:
            continue
        meta[c] = {"name": e["name"],
                   "muscles": list(e.get("primaryMuscles") or []),
                   "lib_equipment": e.get("equipment")}

    index = {}
    for c, m in meta.items():
        index[_norm(m["name"])] = c
        index[_norm(c)] = c
    for raw, target in ALIASES.items():
        c = canon(target)
        if c in meta:
            index[_norm(raw)] = c
    for raw, target in _SHORTHAND.items():
        c = canon(target)
        if c in meta:
            index[_norm(raw)] = c

    profiles = {}
    for pname, prof in EQUIPMENT_PROFILES.items():
        if not prof:
            profiles[pname] = {"available": None, "blocked": {}}
            continue
        available = prof["available"]
        blocked = {}
        for c, m in meta.items():
            needs = _REQUIRES_CANON.get(c)
            if needs is None and m["lib_equipment"] is not None:
                needs = LIBRARY_EQUIPMENT_TOKENS.get(m["lib_equipment"])
            if not needs or needs <= available:
                continue
            blocked[c] = substitute_for(pname, m["name"], m["muscles"])
        profiles[pname] = {"available": sorted(available), "blocked": blocked}

    return {
        "_generated_by": "scripts/emit_equipment_profiles.py",
        "_note": "Do not hand-edit. Regenerate from equipment_profiles.py.",
        "index": dict(sorted(index.items())),
        "profiles": profiles,
    }


def main():
    data = build()
    with open(OUT, "w") as f:
        json.dump(data, f, indent=2, sort_keys=False)
        f.write("\n")
    for p, v in data["profiles"].items():
        n = len(v["blocked"])
        gone = sum(1 for s in v["blocked"].values() if not s)
        print(f"{p}: {n} blocked, {gone} with no substitute")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
