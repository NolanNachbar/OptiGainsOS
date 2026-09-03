"""library_capture.py — turn a programmed day into a library template.

"If a workout is on my schedule or ever got programmed, it should be added to
the library." Engine strength days already were; two kinds weren't.

  - Cardio-only days. The weekly generator's save was guarded on a non-empty
    exercises list, and a CARDIO day carries its work in cardio_sessions, so
    every run day was skipped. The library has no cardio_sessions column, so the
    run is written as an exercise row whose name matches the app's run test
    (/run|sprint|cardio|zone ?2/) and therefore renders as conditioning.
  - Days programmed before the auto-save existed. sync_library.py sweeps
    program_workouts and fills those in.

Dedup is by title, so the library holds one template per session flavor rather
than seven new rows a week.
"""


def _rep_text(e):
    return str(e.get("reps") or e.get("rep_target") or "10")


def _notes(e):
    parts = [
        (f"RIR {e['rir_target']}" if e.get("rir_target") is not None else ""),
        str(e.get("notes") or ""),
    ]
    return " · ".join(p for p in parts if p)


def cardio_as_exercises(cardio_sessions):
    """Runs rendered as library exercise rows.

    Name carries the zone so it reads as conditioning in the app and in the
    library list; duration goes in the reps slot because that's the only free
    text field the manual-create shape has."""
    out = []
    for c in cardio_sessions or []:
        zone = (c.get("zone") or "").strip()
        kind = (c.get("run_type") or c.get("activity_type") or "run").replace("_", " ").strip()
        name = f"{zone} Run" if zone else f"{kind.title()} Run"
        mins = c.get("duration_minutes")
        out.append({
            "name": name,
            "sets": 1,
            "reps": f"{int(mins)} min" if mins else "steady",
            "rest_seconds": 0,
            "notes": str(c.get("notes") or ""),
        })
    return out


def library_payload(title, focus, exercises, cardio_sessions=None, description=None):
    """The `workouts` row for a programmed day, or None when there's nothing in it.

    focus is mapped into the library's own vocabulary: its Type filter only
    offers strength/cardio/hiit, so a row saved as "hypertrophy" (what
    program_workouts carries) is invisible under every pill except All."""
    rows = [{
        "name": e.get("name", ""),
        "sets": e.get("sets", 3),
        "reps": _rep_text(e),
        "rest_seconds": e.get("rest_seconds", 120),
        "notes": _notes(e),
    } for e in (exercises or [])]
    rows += cardio_as_exercises(cardio_sessions)
    if not rows:
        return None
    lifted = bool(exercises)
    return {
        "title":            title,
        "description":      description or "Engine-programmed session, auto-saved to the library.",
        "focus":            "strength" if lifted else "cardio",
        "duration_minutes": None,
        "exercises":        rows,
        "folder":           "Engine",
    }
