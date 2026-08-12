"""Reading user_profiles.exercise_preferences without failing silently.

A preference is a free-text string typed into a JSONB column, and the engines only
ever ask whether `canon(name)` is in the blocked or preferred set. A name that
matches no catalog exercise therefore does exactly nothing, forever, while looking
set in the database — the column shows what was asked for, the sessions ignore it,
and nothing anywhere says why.

That is not hypothetical: `"Decline DB skull crusher"` sat in `preferred` for
months. It canonicalizes to `Decline Dumbbell Skull Crusher`, the catalog name is
`Skull Crushers`, so it never matched and the athlete kept getting the movement he
had asked to stop getting (2026-08-12).

Warn, never raise. A typo in a preference must not take down the daily cron — a
wrong-but-running session beats no session.
"""

from engine.log_ingest import canon


def canon_prefs(ex_prefs, catalog_names, label=""):
    """Return (blocked, preferred) as canon-name sets, warning on names that
    match nothing in the catalog.

    `catalog_names` is the exercise-name iterable the engines select from
    (session_generator._EX_BY_NAME). Matching is canon-to-canon because that is
    what the selection code does — comparing raw preference strings against raw
    catalog keys would flag legitimate preferences (`Skull Crushers` canonicalizes
    to the singular `Skull Crusher`).
    """
    ex_prefs = ex_prefs or {}
    known = {canon(n) for n in catalog_names}
    out = []
    for key in ("blocked", "preferred"):
        names = ex_prefs.get(key) or []
        resolved = set()
        for raw in names:
            c = canon(raw)
            if c in known:
                resolved.add(c)
            else:
                where = f" ({label})" if label else ""
                print(f"WARN: exercise_preferences.{key}{where}: {raw!r} matches no "
                      f"catalog exercise (canon {c!r}) — this preference does nothing. "
                      f"Fix the name in user_profiles.exercise_preferences.", flush=True)
        out.append(resolved)
    return out[0], out[1]
