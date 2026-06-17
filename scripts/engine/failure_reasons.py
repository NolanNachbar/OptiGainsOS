"""
failure_reasons.py — structured "why did this set miss?" taxonomy.

When a logged set misses the prior best for its rep range, the athlete tags WHY.
That tag splits two ways:

  • NUTRITION — only a SYSTEMIC miss ("out of gas" / under-fuelled) should count as a
    strength regression that eases the cut deficit. A TECHNICAL miss (lockout, off the
    chest, form, grip) is a skill/leverage issue, not a fuelling signal, so it is
    EXCLUDED from strength_min_slope (compute_athlete_state).

  • PROGRAMMING — a technical miss IS a sticking point: it feeds the same `weakness`
    dict the session generator already consumes (`_pick_assistance` /
    `_WEAKNESS_ACCESSORY`), so e.g. a flagged bench lockout adds triceps-biased
    assistance automatically.

The region strings here match notes_parser / session_generator vocab so structured
tags and free-text notes flow through one path.
"""
from __future__ import annotations

# Canonical reason value (stored on the set as `failure_reason`) → metadata.
#   technical: excluded from the nutrition strength signal (skill/leverage, not fuel)
#   region:    per-lift sticking-point region in the engine vocab (None = no target)
SYSTEMIC = "out_of_gas"

FAILURE_REASONS: dict[str, dict] = {
    "out_of_gas":  {"label": "Out of gas / weak", "technical": False, "region": {}},
    "lockout":     {"label": "Lockout / top end",  "technical": True,
                    "region": {"bench": "lockout", "deadlift": "lockout"}},
    "off_chest":   {"label": "Off the chest",      "technical": True,
                    "region": {"bench": "chest"}},
    "out_of_hole": {"label": "Out of the hole",    "technical": True,
                    "region": {"squat": "bottom"}},
    "off_floor":   {"label": "Off the floor",      "technical": True,
                    "region": {"deadlift": "floor"}},
    "grip":        {"label": "Grip failed",        "technical": True, "region": {}},
    "form":        {"label": "Form broke down",    "technical": True, "region": {}},
}


def is_technical(reason: str) -> bool:
    """True for skill/leverage failures that must NOT ease the cut."""
    return bool(FAILURE_REASONS.get(reason or "", {}).get("technical"))


def infer_lift(exercise_name: str) -> str | None:
    """Map an exercise name to one of the goal lifts (bench/squat/deadlift)."""
    n = (exercise_name or "").lower()
    if "bench" in n:
        return "bench"
    if "deadlift" in n or "rdl" in n:
        return "deadlift"
    if "squat" in n:
        return "squat"
    return None


def reason_to_region(reason: str, lift: str | None) -> str | None:
    """Engine-vocab sticking-point region for this reason on this lift, if any."""
    if not lift:
        return None
    return FAILURE_REASONS.get(reason or "", {}).get("region", {}).get(lift)


def parse_set_failures(workout_logs: list, lookback_days: int = 14,
                       today_iso: str | None = None) -> dict:
    """
    Scan recent logs for set-level `failure_reason` tags.

    Returns:
      technical_miss_lifts {lift}              — exclude these from strength_min_slope
      systemic_miss_lifts  {lift}              — genuine strength dips (keep for nutrition)
      weakness {lift: {region, mentions, confidence}} — merge into the programming weakness
    """
    import datetime as _dt
    cutoff = None
    if today_iso:
        try:
            cutoff = (_dt.date.fromisoformat(str(today_iso)[:10])
                      - _dt.timedelta(days=lookback_days)).isoformat()
        except ValueError:
            cutoff = None

    technical: set[str] = set()
    systemic: set[str] = set()
    region_hits: dict[str, dict] = {}

    for log in workout_logs or []:
        d = str(log.get("log_date") or log.get("date") or "")
        if cutoff and d and d < cutoff:
            continue
        for ex in (log.get("exercises") or []):
            lift = infer_lift(ex.get("name"))
            for s in (ex.get("sets") or []):
                reason = s.get("failure_reason")
                if not reason or reason not in FAILURE_REASONS:
                    continue
                if reason == SYSTEMIC:
                    if lift:
                        systemic.add(lift)
                    continue
                # technical
                if lift:
                    technical.add(lift)
                region = reason_to_region(reason, lift)
                if lift and region:
                    h = region_hits.setdefault(lift, {"region": region, "mentions": 0,
                                                       "confidence": "high"})
                    # most-recent region wins; count corroborating mentions
                    h["region"] = region
                    h["mentions"] += 1
    return {"technical_miss_lifts": technical, "systemic_miss_lifts": systemic,
            "weakness": region_hits}
