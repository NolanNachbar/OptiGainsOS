#!/usr/bin/env python3
"""Mechanism failure reasons (unstable / asymmetric / strict_form): tracked per
exercise, surfaced only once they recur, never treated as under-fuelling.

Run: python3 scripts/test_failure_mechanisms.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import failure_reasons as fr  # noqa: E402


def log(date, name, *reasons, note=None):
    sets = [{"weight": 100, "reps": 8, "completed": True, "failure_reason": r,
             **({"failure_note": note} if note else {})} for r in reasons]
    return {"log_date": date, "exercises": [{"name": name, "sets": sets}]}


T = "2026-10-17"

# one sighting is a one-off, not a flag
out = fr.parse_set_failures([log("2026-10-15", "Incline DB Press", "unstable")], today_iso=T)
assert out["mechanism_flags"] == {}, out["mechanism_flags"]

# two sightings on the same exercise recur, across sessions
out = fr.parse_set_failures([log("2026-10-12", "Incline DB Press", "unstable"),
                             log("2026-10-15", "Incline DB Press", "unstable")], today_iso=T)
assert out["mechanism_flags"] == {"Incline DB Press": {"unstable": 2}}, out["mechanism_flags"]

# different exercises do not pool
out = fr.parse_set_failures([log("2026-10-12", "Incline DB Press", "asymmetric"),
                             log("2026-10-15", "Cable Fly", "asymmetric")], today_iso=T)
assert out["mechanism_flags"] == {}

# mechanisms never read as systemic (must not ease the cut), and are technical
out = fr.parse_set_failures([log("2026-10-12", "Bench Press", "strict_form"),
                             log("2026-10-15", "Bench Press", "strict_form")], today_iso=T)
assert out["systemic_miss_lifts"] == set()
assert out["technical_miss_lifts"] == {"bench"}
assert fr.is_technical("strict_form") and fr.is_technical("unstable") and fr.is_technical("asymmetric")
assert not fr.is_technical("other")

# stale sightings outside the lookback window are ignored
out = fr.parse_set_failures([log("2026-09-01", "Cable Fly", "unstable"),
                             log("2026-10-15", "Cable Fly", "unstable")], today_iso=T)
assert out["mechanism_flags"] == {}

# "other" with a typed note is kept for review, without a note it is dropped
out = fr.parse_set_failures([log("2026-10-15", "Leg Press", "other", note="knee pinched")],
                            today_iso=T)
assert out["unexplained_notes"] == [{"exercise": "Leg Press", "date": "2026-10-15",
                                     "note": "knee pinched"}]
assert fr.parse_set_failures([log("2026-10-15", "Leg Press", "other")],
                             today_iso=T)["unexplained_notes"] == []

print("test_failure_mechanisms: ok")
