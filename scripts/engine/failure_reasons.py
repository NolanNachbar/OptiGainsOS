"""
failure_reasons.py — structured "why did this set miss?" taxonomy.

Two distinct signals share one taxonomy:

  • failure_reason — tagged when a set MISSES the prior best. Splits two ways (below).
  • sticking_point — tagged on a MADE but near-failure set (RIR ≤ 1). PROGRAMMING ONLY:
    it feeds the same `weakness` dict so a grindy-but-completed bench lockout still
    biases triceps assistance, but it NEVER touches the nutrition signal (a set you
    actually completed is not a strength regression and must not ease the cut). If a
    set carries both fields it became a miss, so `failure_reason` wins and the stale
    `sticking_point` is ignored, so one physical set is counted once.

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
    Scan recent logs for set-level `failure_reason` and `sticking_point` tags.

    Returns:
      technical_miss_lifts {lift}              — exclude these from strength_min_slope
      systemic_miss_lifts  {lift}              — genuine strength dips (keep for nutrition)
      weakness {lift: {region, mentions, sticking_mentions, confidence}}
                                               — merge into the programming weakness

    `sticking_point` (made-set tag) only ever adds to `weakness`; it never touches the
    miss sets, so a completed grinder steers programming but cannot ease the cut.
    `sticking_mentions` records how many of a lift's mentions came from made grinders
    (vs real misses) — see format_sticking_summary for the per-run instrumentation.
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

    def _add_region(lift: str | None, region: str | None,
                    from_sticking: bool = False) -> None:
        if not lift or not region:
            return
        h = region_hits.setdefault(lift, {"region": region, "mentions": 0,
                                          "sticking_mentions": 0, "confidence": "high"})
        # most-recent region wins; count corroborating mentions
        h["region"] = region
        h["mentions"] += 1
        # how many of those came from MADE grinders vs real misses (instrumentation)
        if from_sticking:
            h["sticking_mentions"] += 1

    for log in workout_logs or []:
        d = str(log.get("log_date") or log.get("date") or "")
        if cutoff and d and d < cutoff:
            continue
        for ex in (log.get("exercises") or []):
            lift = infer_lift(ex.get("name"))
            for s in (ex.get("sets") or []):
                reason = s.get("failure_reason")
                if reason and reason in FAILURE_REASONS:
                    if reason == SYSTEMIC:
                        if lift:
                            systemic.add(lift)
                        continue
                    # technical miss → nutrition exclusion + programming weakness
                    if lift:
                        technical.add(lift)
                    _add_region(lift, reason_to_region(reason, lift))
                    continue  # failure_reason wins; ignore any stale sticking_point
                # made-set sticking point → programming weakness only, never nutrition
                sticking = s.get("sticking_point")
                if sticking and sticking in FAILURE_REASONS:
                    _add_region(lift, reason_to_region(sticking, lift), from_sticking=True)
    return {"technical_miss_lifts": technical, "systemic_miss_lifts": systemic,
            "weakness": region_hits}


def format_sticking_summary(weakness: dict) -> str | None:
    """
    One-line instrumentation: which lifts are being steered by MADE-set grinders
    (RIR ≤ 1) vs real misses. Returns None if no sticking-point mentions exist, so
    callers can `if (s := format_sticking_summary(w)): print(s)`.

    Watch for the made-set count dominating a lift — that's the over-steer risk for a
    high-intensity athlete (most working sets are near-failure), the cue to tighten
    the trigger (RIR=0) or down-weight sticking mentions.
    """
    parts = []
    for lift, w in sorted((weakness or {}).items()):
        sm = int(w.get("sticking_mentions", 0))
        if sm <= 0:
            continue
        parts.append(f"{lift}/{w.get('region')} {sm} of {int(w.get('mentions', 0))} "
                     f"from made grinders")
    if not parts:
        return None
    return "  Sticking points (made sets steering assistance): " + "; ".join(parts)
