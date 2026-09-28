#!/usr/bin/env python3
"""Focused regression test for the cbum-nutrition-body critique #4:
calorie_adherence was `round(min(avg_cal / calorie_target, 1.0), 2)`, so
eating 3,000 kcal on a 2,000 target scored a dishonest 100%, identical to
hitting the target exactly.

compute_athlete_state.py can't be imported directly: importing the module
runs its top-level env-var check and pulls in numpy/engine submodules, and
(per the audit ground rules) this must never read/exercise `.env`. Instead
this extracts just the `compute_nutrition` function's source out of the file
via AST and execs *that*, in an isolated namespace — the real, shipped
implementation of the function under test, nothing re-derived or
reimplemented, with zero Supabase/`.env` involvement.

Run: python3 scripts/test_adherence_honest.py
"""
import ast
import datetime
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_HERE, "compute_athlete_state.py")


def load_compute_nutrition():
    with open(_SRC) as f:
        tree = ast.parse(f.read(), filename=_SRC)
    fn_node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "compute_nutrition")
    mod = ast.Module(body=[fn_node], type_ignores=[])
    ns = {"datetime": datetime, "Optional": None, "TODAY": datetime.date.today().isoformat()}
    code = compile(mod, filename=_SRC, mode="exec")
    exec(code, ns)
    return ns["compute_nutrition"]


def main():
    compute_nutrition = load_compute_nutrition()
    today = datetime.date.today()
    yesterday = (today - datetime.timedelta(days=1)).isoformat()

    profile = {"daily_calorie_goal": 2000, "daily_protein_goal": 150}
    # 3,000 kcal logged against a 2,000 target: overeating by 50%.
    food_entries = [{"date": yesterday, "calories": 3000, "protein_grams": 150}]
    weight_entries = []

    result = compute_nutrition(food_entries, weight_entries, profile)
    adherence = result["calorie_adherence"]

    assert adherence is not None, "expected a calorie_adherence value"
    assert adherence > 1.0, (
        f"calorie_adherence capped at {adherence} — overeating must read honestly above 100%, "
        "not clamp to 1.0"
    )
    assert adherence == 1.5, f"expected 1.5 (150%) for 3000/2000, got {adherence}"

    # Under target still behaves as before (no regression on the normal case).
    food_entries_under = [{"date": yesterday, "calories": 1500, "protein_grams": 150}]
    result_under = compute_nutrition(food_entries_under, weight_entries, profile)
    assert result_under["calorie_adherence"] == 0.75, result_under["calorie_adherence"]

    print("PASS: calorie_adherence reports 150% honestly instead of clamping to 100%")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"FAIL: {e}")
        sys.exit(1)
