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

from engine.log_ingest import canon, canon_tokens
from engine.muscle_map import get_muscles


def _counts_toward_size(name: str) -> bool:
    """Does this exercise count against the session-size target?

    False for the mandatory bicep/tricep/side-delt isolations and for a goal
    lift's back-off row — both sit outside the target by design, so both sides of
    the prescribed-vs-logged comparison must ignore them. Matched on name because
    a workout LOG carries no is_* tags, only what was written down. Imported
    lazily so this module keeps its no-heavy-dependency import surface.
    """
    from engine.session_generator import MANDATORY_ISOLATION_POOL
    # canon() normalizes spacing/aliases but PRESERVES case, so match lowercased.
    c = canon(name or "").lower()
    if "back off" in c or "backoff" in c or "back-off" in c:
        return False
    exempt = {canon(n).lower() for pool in MANDATORY_ISOLATION_POOL.values() for n in pool}
    return c not in exempt


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


MOVEMENT_PATTERNS = ['press', 'curl', 'row', 'squat', 'deadlift', 'fly', 'raise', 'pull', 'push']


def _same_slot(a: str, b: str) -> bool:
    """Two exercises plausibly fill the same slot if they share a primary muscle."""
    ma, mb = set(get_muscles(a)), set(get_muscles(b))
    if ma and mb:
        return bool(ma & mb)
    # Fallback: if muscle map is missing an entry, treat exercises sharing a
    # common movement-pattern keyword as the same slot to avoid misclassifying
    # legitimate swaps as additions.
    for pat in MOVEMENT_PATTERNS:
        if pat in a.lower() and pat in b.lower():
            return True
    return False


def _same_exercise(a: str, b: str) -> bool:
    """Near-identical normalized token sets ⇒ name variant of the SAME exercise
    (not a swap)."""
    ta, tb = canon_tokens(a), canon_tokens(b)
    if not ta or not tb:
        return False
    return len(ta & tb) / len(ta | tb) >= 0.8


def track_deviations(program_workouts: list, workout_logs: list,
                     lookback_days: int = 14, today_iso: str | None = None) -> dict:
    """
    Diff prescribed vs logged for each date that has both.

    program_workouts: rows {scheduled_date, exercises:[{name, sets}]}.
    workout_logs:     rows {log_date, exercises:[{name, sets:[...]}]}.
    """
    out = {"chosen": {}, "dropped": {}, "set_delta": {}, "events": [],
           "session_size": {"logged_mean": None, "prescribed_mean": None, "n": 0}}
    _size_logged: list = []
    _size_prescribed: list = []

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

        # an exercise he bailed on entirely (0 completed sets) was not chosen
        logged = {n: c for n, c in _logged_names(log).items() if c > 0}
        prescribed = _prescribed_names(pw)

        # Session SIZE signal: how many exercises he actually ran vs how many were
        # on the card. Counts only, independent of WHICH movements — the exercise
        # -value learner already owns identity. Collected per matched date and
        # averaged over the window (a single day's skip is noise: pain, equipment,
        # a short session; a persistent gap is a preference).
        #
        # Both sides count only COUNTABLE rows (Nolan, 2026-08-04). The mandatory
        # bicep/tricep/side-delt isolations and a goal lift's back-off ride outside
        # the exercise target by design, so counting them here would let a skipped
        # lateral raise on a leg day read as "wanted fewer stations" and shrink the
        # COMPOUND budget — a lever he never pulled. Filtering both sides by the
        # same rule keeps the learner measuring the thing the target controls.
        _size_logged.append(sum(1 for n in logged if _counts_toward_size(n)))
        _size_prescribed.append(sum(1 for n in prescribed if _counts_toward_size(n)))

        # exact + near-identical name matches each consume their prescribed slot
        matched = {n: n for n in logged if n in prescribed}
        for name in logged:
            if name in matched:
                continue
            taken = set(matched.values())
            near = next((p for p in prescribed
                         if p not in taken and _same_exercise(p, name)), None)
            if near:
                matched[name] = near

        swap_sources: set[str] = set()
        for name, n_logged in logged.items():
            if name in matched:
                # ran the prescribed movement — record set delta only
                _delta_acc.setdefault(matched[name], []).append(
                    n_logged - prescribed[matched[name]])
                continue
            # he reached for something not on the card → a vote FOR it.
            out["chosen"][name] = out["chosen"].get(name, 0) + 1
            consumed = set(matched.values()) | swap_sources
            swapped_for = next((p for p in prescribed
                                if p not in logged and p not in consumed
                                and _same_slot(p, name)), None)
            if swapped_for:
                swap_sources.add(swapped_for)
                out["dropped"][swapped_for] = out["dropped"].get(swapped_for, 0) + 1
                out["events"].append(f"{d}: swapped {swapped_for} → {name}")
            else:
                out["events"].append(f"{d}: added {name}")

        for name in prescribed:
            if name not in set(matched.values()) and name not in swap_sources:
                # prescribed but skipped, and not THIS date's swap-source —
                # repeated skips across dates compound into the posterior
                out["dropped"][name] = out["dropped"].get(name, 0) + 1
                out["events"].append(f"{d}: skipped {name}")

    # informational only — not consumed by exercise_reward
    out["set_delta"] = {n: round(sum(v) / len(v), 2) for n, v in _delta_acc.items() if v}
    if _size_logged:
        out["session_size"] = {
            "logged_mean":     round(sum(_size_logged) / len(_size_logged), 2),
            "prescribed_mean": round(sum(_size_prescribed) / len(_size_prescribed), 2),
            "n":               len(_size_logged),
        }
    return out
