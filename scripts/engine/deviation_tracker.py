"""
deviation_tracker.py — Learn from what Nolan actually did vs what was prescribed.

The program proposes a session; Nolan often changes it — swaps an exercise, drops
one, adds one, runs different set counts. Those deviations are PREFERENCE DATA:
the movements he reaches for and the ones he skips. This module diffs the
prescribed `program_workouts` against the logged `workout_logs` per date and turns
the differences into exercise-value votes.

Per his call (2026-06-09) a swap is a ONE-OFF VOTE: it nudges value, it doesn't
instantly rewrite the slot. Repeated swaps compound into a real preference via the
exercise-value learner (learners.update_exercise_value).

Output:
  {
    "chosen":   {canon_name: votes},   # logged but not prescribed (or swapped in)
    "dropped":  {canon_name: votes},   # prescribed but not logged
    "set_delta":{canon_name: mean signed Δ sets vs prescribed},
    "events":   [human-readable strings for the brief / rationale],
  }
"""
from __future__ import annotations

from engine.log_ingest import canon
from engine.muscle_map import get_muscles


def _logged_names(log: dict) -> dict:
    """canon name → completed working-set count for one logged workout."""
    out: dict[str, int] = {}
    for ex in (log.get("exercises") or []):
        name = canon(ex.get("name") or "")
        if not name:
            continue
        sets = [s for s in (ex.get("sets") or [])
                if s.get("completed") is not False and (s.get("weight") or s.get("reps"))]
        out[name] = out.get(name, 0) + (len(sets) or 0)
    return out


def _prescribed_names(pw: dict) -> dict:
    """canon name → prescribed set count for one program_workouts row."""
    out: dict[str, int] = {}
    for ex in (pw.get("exercises") or []):
        name = canon(ex.get("name") or "")
        if not name:
            continue
        try:
            out[name] = int(ex.get("sets") or 0)
        except (TypeError, ValueError):
            out[name] = 0
    return out


def _same_slot(a: str, b: str) -> bool:
    """Two exercises plausibly fill the same slot if they share a primary muscle."""
    ma, mb = set(get_muscles(a)), set(get_muscles(b))
    return bool(ma and mb and (ma & mb))


def track_deviations(program_workouts: list, workout_logs: list,
                     lookback_days: int = 14, today_iso: str | None = None) -> dict:
    """
    Diff prescribed vs logged for each date that has both.

    program_workouts: rows {scheduled_date, exercises:[{name, sets}]}.
    workout_logs:     rows {log_date, exercises:[{name, sets:[...]}]}.
    """
    out = {"chosen": {}, "dropped": {}, "set_delta": {}, "events": []}

    cutoff = None
    if today_iso:
        import datetime as _dt
        try:
            cutoff = (_dt.date.fromisoformat(today_iso[:10])
                      - _dt.timedelta(days=lookback_days)).isoformat()
        except (ValueError, TypeError):
            cutoff = None

    pw_by_date: dict[str, dict] = {}
    for pw in program_workouts or []:
        d = str(pw.get("scheduled_date") or "")[:10]
        if d:
            pw_by_date[d] = pw

    _delta_acc: dict[str, list] = {}

    for log in workout_logs or []:
        d = (log.get("log_date") or "")
        if cutoff and d < cutoff:
            continue
        pw = pw_by_date.get(d)
        if not pw:
            continue  # unscheduled / quick workout — nothing prescribed to compare

        logged = _logged_names(log)
        prescribed = _prescribed_names(pw)

        for name, n_logged in logged.items():
            if name in prescribed:
                # ran the prescribed movement — record set delta only
                _delta_acc.setdefault(name, []).append(n_logged - prescribed[name])
            else:
                # he reached for something not on the card → a vote FOR it.
                out["chosen"][name] = out["chosen"].get(name, 0) + 1
                swapped_for = next((p for p in prescribed
                                    if p not in logged and _same_slot(p, name)), None)
                if swapped_for:
                    out["dropped"][swapped_for] = out["dropped"].get(swapped_for, 0) + 1
                    out["events"].append(f"{d}: swapped {swapped_for} → {name}")
                else:
                    out["events"].append(f"{d}: added {name}")

        for name in prescribed:
            if name not in logged and name not in out["dropped"]:
                # prescribed but skipped, and not already counted as a swap-source
                out["dropped"][name] = out["dropped"].get(name, 0) + 1
                out["events"].append(f"{d}: skipped {name}")

    out["set_delta"] = {n: round(sum(v) / len(v), 2) for n, v in _delta_acc.items() if v}
    return out
