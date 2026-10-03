#!/usr/bin/env python3
"""Offline test: the engine must not write program days into a 'no-engine' program.
Stubs every HTTP helper; touches no network. Run: python3 scripts/test_no_engine_guard.py"""
import os, sys, urllib.request
os.environ.update(SUPABASE_URL="http://offline.invalid", SUPABASE_SERVICE_KEY="x",
                  USER_ID="u1", SKIP_STATE_REFRESH="1")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

def _no_net(*a, **k):
    raise AssertionError("network call attempted")
urllib.request.urlopen = _no_net

import generate_weekly_program as g

PROG = "prog-1"
PROGRAM_TABLES = ("program_workouts", "program_workouts_pending")

def run(tags):
    calls = []
    def fake_get(table, params):
        if table == "program_enrollments" and params.get("status") == "eq.active":
            assert params.get("order", "").startswith("started_at.desc"), params
            return [{"program_id": PROG, "current_week": 1, "days_per_week": 7,
                     "started_at": "2026-10-02T00:00:00Z"}]
        if table == "programs":
            return [{"id": PROG, "tags": tags}]
        return []
    def rec(kind):
        def f(table, *a, **k):
            calls.append((kind, table)); return True
        return f
    g.sb_get = fake_get
    for k in ("upsert", "insert", "patch", "delete"):
        setattr(g, f"sb_{k}", rec(k))
    g.sb_insert_returning = lambda t, r: (calls.append(("insert", t)) or {"id": "x"})
    g.sb_upsert_engine = lambda r: (calls.append(("upsert", "engine_params")) or True)
    g.save_engine_state = lambda *a, **k: None
    g.resync_todays_prescription = lambda: None
    try:
        g.main()
        code = 0
    except SystemExit as e:
        code = e.code or 0
    return code, [c for c in calls if c[1] in PROGRAM_TABLES], calls

c1, pw1, all1 = run(["no-engine", "powerlifting"])
print("TAGGED: exit", c1, "program-table writes:", pw1, "| total calls:", len(all1))
assert c1 == 0 and pw1 == [], "tagged program must see zero program-table writes"
c2, pw2, all2 = run(["powerlifting"])
print("UNTAGGED: exit", c2, "program-table writes:", pw2[:3], "... n =", len(pw2))
assert c2 == 0 and any(c[1] == "program_workouts_pending" for c in pw2), "untagged must still write"
print("OK")
