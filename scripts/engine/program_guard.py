"""
program_guard.py — opt-out for programs the engine does not own.

A program tagged "no-engine" (programs.tags text[]) is hand-authored: the daily
engine must not write, delete or restage its days (program_workouts,
program_workouts_pending) or rewrite its loads. Everything else the engine does
(athlete state, readiness, nutrition, learners) is unaffected.

Both generate_weekly_program.py and mpc_prescriber.py call
program_is_engine_owned(); the check lives here so there is one definition.
"""

NO_ENGINE_TAG = "no-engine"


def program_is_engine_owned(sb_get, program_id) -> bool:
    """False when the program's tags contain "no-engine".

    sb_get(table, params) is the caller's own read helper. A missing program id,
    a null tags column or a failed read all count as engine-owned (the existing
    behavior), so only an explicit tag turns the engine off.
    """
    if not program_id:
        return True
    rows = sb_get("programs", {"select": "id,tags", "id": f"eq.{program_id}", "limit": "1"})
    tags = (rows[0].get("tags") if rows else None) or []
    return NO_ENGINE_TAG not in tags
