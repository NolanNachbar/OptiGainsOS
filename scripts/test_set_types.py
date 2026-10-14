#!/usr/bin/env python3
"""Regression test: warm-up / drop sets must not count as work in the engine.

Covers the two consumers the audit flagged:
  * compute_athlete_state.compute_joint_action_volume (weekly joint-action
    hard-set counter) — extracted by AST so the module's top-level env check
    never runs and no .env is read.
  * engine.failure_reasons.parse_set_failures — a failure_reason/sticking tag on
    a warm-up or drop set is never a miss (mirrors JS isMissedSet).

Run: python3 scripts/test_set_types.py
"""
import ast
import datetime
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

from engine.log_ingest import work_sets  # noqa: E402
from engine import failure_reasons as fr  # noqa: E402


def load_joint_action_fn(get_joint_action):
    src = os.path.join(_HERE, "compute_athlete_state.py")
    with open(src) as f:
        tree = ast.parse(f.read(), filename=src)
    node = next(n for n in tree.body
                if isinstance(n, ast.FunctionDef) and n.name == "compute_joint_action_volume")
    ns = {
        "datetime": datetime,
        "work_sets": work_sets,
        "get_joint_action": get_joint_action,
        "CLARK_KENT_JOINT_ACTION_TARGET": (10, 20),
    }
    exec(compile(ast.Module(body=[node], type_ignores=[]), src, "exec"), ns)
    return ns["compute_joint_action_volume"]


def main():
    fn = load_joint_action_fn(lambda name: "horizontal_push" if "bench" in name.lower() else None)
    today = datetime.date.today().isoformat()
    sets = [
        {"weight": 45, "reps": 10, "set_type": "warmup"},
        {"weight": 135, "reps": 8, "set_type": "warmup"},
        {"weight": 200, "reps": 5, "set_type": "working"},
        {"weight": 200, "reps": 5},
        {"weight": 150, "reps": 8, "set_type": "drop"},
    ]
    out = fn([{"log_date": today, "exercises": [{"name": "Bench Press", "sets": sets}]}])
    assert out["horizontal_push"]["weekly_sets"] == 3, out  # 2 working + 1 drop; warm-ups out
    only_warm = fn([{"log_date": today, "exercises": [
        {"name": "Bench Press", "sets": [{"weight": 45, "reps": 10, "set_type": "warmup"}]}]}])
    assert only_warm == {}, only_warm

    # failure_reasons: a tagged warm-up/drop is ignored, the same tag on a working set counts.
    reason = fr.SYSTEMIC
    def logs(set_type):
        return [{"log_date": today, "exercises": [{"name": "Bench Press", "sets": [
            {"weight": 200, "reps": 3, "failure_reason": reason, **({"set_type": set_type} if set_type else {})}]}]}]
    assert fr.parse_set_failures(logs("warmup"), today_iso=today)["systemic_miss_lifts"] == set()
    assert fr.parse_set_failures(logs("drop"), today_iso=today)["systemic_miss_lifts"] == set()
    assert fr.parse_set_failures(logs(None), today_iso=today)["systemic_miss_lifts"], "working set must still count"
    assert fr.parse_set_failures(logs("failure"), today_iso=today)["systemic_miss_lifts"], "failure set must still count"
    print("test_set_types: ok")


if __name__ == "__main__":
    main()
