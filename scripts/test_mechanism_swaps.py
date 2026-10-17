#!/usr/bin/env python3
"""Recurring failure mechanisms change the program: swap table sanity + end-to-end.

Run: python3 scripts/test_mechanism_swaps.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import session_generator as sg  # noqa: E402
from engine import mechanism_swaps as ms  # noqa: E402

# 1) every table entry points at real catalog exercises
for mech, table in ms.SWAPS.items():
    for src, dst in table.items():
        assert src in sg._EX_BY_NAME, f"{mech}: unknown source {src}"
        assert dst in sg._EX_BY_NAME, f"{mech}: unknown target {dst}"
        assert src != dst

# 2) swap_for: priority, and mechanisms with no swap stay put
assert ms.swap_for("Incline DB Press", {"Incline DB Press": {"unstable": 2}}) == \
    ("unstable", "Reverse Grip Incline Smith Machine Press")
assert ms.swap_for("Barbell Row", {"Barbell Row": {"asymmetric": 2, "unstable": 2}}) == \
    ("unstable", "Chest-Supported Row")
assert ms.swap_for("Incline DB Press", {"Incline DB Press": {"strict_form": 3}}) is None
assert ms.swap_for("Incline DB Press", {}) is None

# 3) end to end through the real session builder
base = [e["name"] for e in sg._build_session("upper_b", 1.0, 0.0)]
assert "Overhead Press (BB)" in base and "Incline DB Press" in base

flags = {"Overhead Press (BB)": {"unstable": 2}, "Incline DB Press": {"unstable": 3}}
swapped = sg._build_session("upper_b", 1.0, 0.0, mechanism_flags=flags)
names = [e["name"] for e in swapped]
assert "Overhead Press (BB)" not in names and "Seated DB Overhead Press" in names, names
assert "Incline DB Press" not in names and \
    "Reverse Grip Incline Smith Machine Press" in names, names
row = next(e for e in swapped if e["name"] == "Seated DB Overhead Press")
assert row["swapped_for"] == "unstable"
assert len(names) == len(base), "a swap changes the movement, not the session size"

# 4) goal lifts are never swapped, and a swap never duplicates an exercise
goal = sg._build_session("upper_b", 1.0, 0.0, mechanism_flags={"Bench Press": {"unstable": 5}})
assert [e["name"] for e in goal] == base
assert len(names) == len(set(names))

# 5) blocked replacement is respected
blocked = sg._build_session("upper_b", 1.0, 0.0, mechanism_flags=flags,
                            blocked={sg.canon("Seated DB Overhead Press")})
assert "Overhead Press (BB)" in [e["name"] for e in blocked]

print("test_mechanism_swaps: ok")
