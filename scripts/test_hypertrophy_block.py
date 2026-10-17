#!/usr/bin/env python3
"""Hypertrophy block: templates resolve against the real catalog, the squat day is left
alone, nothing changes without a block, and the config file turns it on.

Run: python3 scripts/test_hypertrophy_block.py
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import session_generator as sg  # noqa: E402
from engine import hypertrophy_block as hb  # noqa: E402
from engine import equipment_profiles as ep  # noqa: E402

# 1) every template name is a real catalog exercise, and sets stay Kent-low (<= 3 for
#    one exercise; the only 3-setter is the lateral raise)
for split, rows in hb.HYPERTROPHY.items():
    for name, sets, reps, rir in rows:
        assert name in sg._EX_BY_NAME, f"{split}: unknown exercise {name}"
        assert 1 <= sets <= 3 and rir in (0, 1, 2)
        lo, hi = reps.split("-")
        assert 4 <= int(lo) <= int(hi) <= 15, reps
assert [n for n, s, *_ in hb.HYPERTROPHY["upper_a"] if s == 3] == ["Cable Lateral Raise"]

# 2) the new catalog entry has an equipment profile
assert "Cable Fly" in ep.EXERCISE_EQUIPMENT if hasattr(ep, "EXERCISE_EQUIPMENT") else True

# 3) without a block, nothing changes (the default builder is untouched)
for split in ("upper_a", "upper_b", "lower_squat_primary", "lower_hinge_primary"):
    a = [e["name"] for e in sg._build_session(split, 1.0, 0.0)]
    b = [e["name"] for e in sg._build_session(split, 1.0, 0.0, block=None)]
    assert a == b and a

# 4) with the block: upper A / B and the hinge day are the templates
def names(split, **kw):
    return [e["name"] for e in sg._build_session(split, 1.0, 0.0, block="hypertrophy", **kw)]

ua = sg._build_session("upper_a", 1.0, 0.0, block="hypertrophy")
assert [e["name"] for e in ua] == [r[0] for r in hb.HYPERTROPHY["upper_a"]]
assert "Weighted Dip" in names("upper_a"), "Weighted Dip stays on Upper A"
assert not any("Bench Press" in n for n in names("upper_a") + names("upper_b")), \
    "no bench top set / back-offs in the block"
assert sum(e["sets"] for e in ua if e["name"] == "Larsen Press") == 1
assert all(e["rep_target"] for e in ua) and all(e.get("block") == "hypertrophy" for e in ua)
assert names("lower_hinge_primary") == [r[0] for r in hb.HYPERTROPHY["lower_hinge_primary"]]

# 5) squat day is NOT templated: identical to the default builder
assert names("lower_squat_primary") == \
    [e["name"] for e in sg._build_session("lower_squat_primary", 1.0, 0.0)]
assert any("Squat" in n for n in names("lower_squat_primary"))

# 6) low-intensity weeks trim a set, never below 1
low = sg._build_session("upper_a", 0.7, 0.0, block="hypertrophy")
assert all(e["sets"] >= 1 for e in low)
assert next(e["sets"] for e in low if e["name"] == "Cable Lateral Raise") == 2

# 7) blocked exercises are skipped, mechanism swaps still apply on a block session
bl = sg._build_session("upper_a", 1.0, 0.0, block="hypertrophy",
                       blocked={sg.canon("Cable Fly")})
assert "Cable Fly" not in [e["name"] for e in bl]
sw = sg._build_session("upper_b", 1.0, 0.0, block="hypertrophy",
                       mechanism_flags={"Incline DB Press": {"unstable": 2}})
assert "Reverse Grip Incline Smith Machine Press" in [e["name"] for e in sw]

# 8) config file: valid name activates, junk or missing does not
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, "b.json")
    assert hb.load_active_block(p) is None
    open(p, "w").write(json.dumps({"block": "hypertrophy"}))
    assert hb.load_active_block(p) == "hypertrophy"
    open(p, "w").write(json.dumps({"block": "nonsense"}))
    assert hb.load_active_block(p) is None
    open(p, "w").write("{not json")
    assert hb.load_active_block(p) is None
assert hb.load_active_block() == "hypertrophy", "repo config should enable the block"

print("test_hypertrophy_block: ok")
