"""
notes_parser.py — Turn free-text workout notes into structured programming signals.

Nolan writes notes on sessions ("POST: left shoulder cranky on press") and on
individual exercises ("felt light, add weight"). The weekly generator reads these
so next week's program actually responds to what he wrote — pain steers exercise
selection away, "too easy" bumps load, sentiment feeds the exercise-value learner.

Deterministic keyword matching (no LLM) so it runs in the offline daily/weekly
cron with the rest of compute. Per his call (2026-06-09) it ACTS FAST: a single
note is enough to move next week, surfaced as a low-confidence signal he can
override. Confidence rises when a signal repeats across sessions.

Output shape (all keyed by canonical exercise name and/or landmark muscle):
  {
    "caution":   {exercise_or_muscle: {"reason","severity","mentions","confidence"}},
    "too_easy":  {exercise: mentions},          # → bump load / it's earning volume
    "too_hard":  {exercise: mentions},          # → hold / back off
    "sentiment": {exercise: signed_score},      # + liked, - disliked (exercise-value prior)
    "weakness":  {lift: {"region","mentions","confidence"}},  # sticking point → aim assistance
    "flags":     [human-readable strings for the brief],
  }
"""
from __future__ import annotations
import re

from engine.log_ingest import canon
from engine.muscle_map import get_muscles, hypertrophy_muscles

# ── Keyword lexicons ([ENG], extend freely) ───────────────────────────────────
_PAIN_WORDS   = ("pain", "hurt", "hurts", "tweak", "tweaked", "strain", "strained",
                 "pull", "pulled", "ache", "achy", "cranky", "pinch", "pinched",
                 "impinge", "sharp", "injur", "inflam", "tendon", "stiff")
_JOINT_WORDS  = ("shoulder", "elbow", "wrist", "knee", "hip", "lower back", "low back",
                 "back", "neck", "ankle", "bicep tendon", "lat")
_EASY_WORDS   = ("too easy", "too light", "felt easy", "felt light", "easy", "light",
                 "could do more", "had more", "left reps", "sandbag", "flew up",
                 "snappy", "fast bar", "felt strong", "felt great", "smooth")
_HARD_WORDS   = ("too hard", "too heavy", "brutal", "grind", "grindy", "ground out",
                 "missed", "failed", "couldn't", "could not", "barely", "death",
                 "smoked", "gassed", "rough", "struggled", "slow bar", "grinder")
_LIKE_WORDS   = ("love", "loved", "favorite", "favourite", "great exercise",
                 "felt it", "good pump", "keep this", "this one")
_DISLIKE_WORDS = ("hate", "hated", "dislike", "awkward", "useless", "no pump",
                  "don't feel", "dont feel", "can't feel", "cant feel", "drop this",
                  "boring", "tweaky")

# ── Sticking-point diagnosis ──────────────────────────────────────────────────
# "failed on bench lockout" → {lift: bench, region: lockout}. The session
# generator aims assistance (close-grip, deficit pulls, paused squats…) at the
# flagged region instead of rotating blindly. [COACH]
_LIFT_KW = {"bench": "bench", "squat": "squat", "deadlift": "deadlift",
            "dead lift": "deadlift"}

# Phrases that are INHERENTLY a sticking point (count even without a struggle word).
_STICKING_PHRASES = ("lockout", "lock out", "lock-out", "off the chest", "off chest",
                     "out of the hole", "off the floor", "break the floor",
                     "sticking point")
_STRUGGLE_WORDS = ("fail", "failed", "miss", "missed", "stuck", "stall", "stalled",
                   "grind", "grindy", "ground", "couldn't", "could not", "barely",
                   "weak", "slow bar", "tough", "death")

# Region phrases per lift (first match wins, longest/most-specific first).
_REGION_KW = {
    "bench": [(("lockout", "lock out", "lock-out", "top end", "top half", "top half",
                "triceps"), "lockout"),
              (("off the chest", "off chest", "stuck at chest", "at the chest",
                "bottom", "start"), "chest"),
              (("upper chest", "incline"), "upper")],
    "squat": [(("out of the hole", "in the hole", "the hole", "bottom", "depth",
                "at the bottom"), "bottom"),
              (("midpoint", "mid point", "halfway", "sticking point", "grind",
                "grinder"), "mid"),
              (("back rounded", "rounded", "caved", "tipped", "good morning",
                "upper back", "chest dropped", "folded"), "back")],
    "deadlift": [(("off the floor", "off floor", "break the floor", "the floor",
                   "bottom", "start"), "floor"),
                 (("lockout", "lock out", "lock-out", "at the top", "hips", "hitch",
                   "top"), "lockout"),
                 (("back rounded", "rounded", "upper back"), "back")],
}

# Negations that flip an "easy/pain" read ("no pain", "not easy").
_NEGATORS = ("no ", "not ", "n't ", "never ", "without ")


def _has(text: str, words) -> list[str]:
    """Return the matched words present in text, skipping negated mentions."""
    hits = []
    for w in words:
        idx = text.find(w)
        if idx < 0:
            continue
        prefix = text[max(0, idx - 8):idx]
        if any(neg in prefix for neg in _NEGATORS):
            continue
        hits.append(w)
    return hits


def _strip_markers(note: str) -> str:
    """Drop the PRE:/POST: prefixes the app prepends and lowercase."""
    return re.sub(r"\b(pre|post)\s*:", " ", (note or "").lower())


def _muscle_from_text(text: str) -> list[str]:
    """Landmark muscles implied by a free-text body part / exercise mention."""
    out: set[str] = set()
    for lm in hypertrophy_muscles(text):
        out.add(lm)
    # Direct joint/region words → nearest landmark(s).
    region_map = {
        "shoulder": ["shoulders"], "press": ["shoulders", "chest"],
        "elbow": ["triceps", "biceps"], "wrist": ["biceps", "triceps"],
        "knee": ["quads"], "hip": ["glutes", "hamstrings"],
        "low back": ["lower_back"], "lower back": ["lower_back"], "back": ["upper_back", "lats"],
        "lat": ["lats"], "quad": ["quads"], "hamstring": ["hamstrings"], "calf": ["calves"],
        "neck": ["neck"], "trap": ["traps"],
    }
    for kw, lms in region_map.items():
        if kw in text:
            out.update(lms)
    return list(out)


def _scan_weakness(t: str, exercise: str | None, out: dict) -> None:
    """Detect a lift sticking-point in one note and record it under out['weakness']."""
    # Which lift? From the note text, or inferred from the exercise the note is on.
    lifts = {lift for kw, lift in _LIFT_KW.items() if kw in t}
    if not lifts and exercise:
        ex_l = exercise.lower()
        for kw, lift in _LIFT_KW.items():
            if kw in ex_l:
                lifts.add(lift)
    if not lifts:
        return

    has_struggle = any(w in t for w in _STRUGGLE_WORDS)
    for lift in lifts:
        region = None
        for phrases, reg in _REGION_KW.get(lift, []):
            if any(p in t for p in phrases):
                region = reg
                break
        if region is None:
            continue
        # Only a weakness if it's struggle-framed OR an inherent sticking phrase.
        if not (has_struggle or any(p in t for p in _STICKING_PHRASES)):
            continue
        w = out["weakness"].setdefault(
            lift, {"region": region, "mentions": 0, "confidence": "low", "reason": ""})
        # Most-recent region wins; mentions accumulate confidence.
        w["region"] = region
        w["mentions"] += 1
        w["confidence"] = "moderate" if w["mentions"] >= 2 else "low"
        w["reason"] = f"note: {lift} {region}"
        out["flags"].append(f"🎯 {lift} weak point: {region} → targeting assistance")


def _scan_one(text: str, exercise: str | None, out: dict) -> None:
    """Accumulate signals from a single note string into `out`."""
    t = _strip_markers(text)
    if not t.strip():
        return

    _scan_weakness(t, exercise, out)

    pain = _has(t, _PAIN_WORDS)
    if pain:
        # Attribute to the exercise (if exercise-level note) and to muscles/joints named.
        targets = set()
        if exercise:
            targets.add(canon(exercise))
        for lm in _muscle_from_text(t):
            targets.add(lm)
        if not targets:
            targets.add("_global")
        sev = 2 if any(w in t for w in ("sharp", "injur", "strain", "pull", "pinch")) else 1
        for tgt in targets:
            c = out["caution"].setdefault(tgt, {"reason": "", "severity": 0, "mentions": 0, "confidence": "low"})
            c["mentions"] += 1
            c["severity"] = max(c["severity"], sev)
            c["reason"] = f"note: '{pain[0]}'" + (f" ({exercise})" if exercise else "")
            c["confidence"] = "moderate" if c["mentions"] >= 2 else "low"
        out["flags"].append(
            f"⚠ {'/'.join(sorted(targets))}: {pain[0]}"
            + (f" on {exercise}" if exercise else "")
        )

    if exercise:
        ex = canon(exercise)
        if _has(t, _HARD_WORDS):
            out["too_hard"][ex] = out["too_hard"].get(ex, 0) + 1
        elif _has(t, _EASY_WORDS):
            out["too_easy"][ex] = out["too_easy"].get(ex, 0) + 1
        if _has(t, _LIKE_WORDS):
            out["sentiment"][ex] = out["sentiment"].get(ex, 0.0) + 1.0
        if _has(t, _DISLIKE_WORDS):
            out["sentiment"][ex] = out["sentiment"].get(ex, 0.0) - 1.0
    else:
        # Session-level easy/hard with no exercise → mild global signal in flags only.
        if _has(t, _HARD_WORDS):
            out["flags"].append("session noted as hard")
        elif _has(t, _EASY_WORDS):
            out["flags"].append("session noted as easy")


def parse_workout_notes(workout_logs: list, lookback_days: int = 14,
                        today_iso: str | None = None) -> dict:
    """
    Parse session + per-exercise notes across recent logs.

    workout_logs: Supabase rows {log_date, notes, exercises:[{name, notes, sets}]}.
    Returns the structured signal dict documented in the module header.
    """
    out = {"caution": {}, "too_easy": {}, "too_hard": {}, "sentiment": {},
           "weakness": {}, "flags": []}
    cutoff = None
    if today_iso:
        import datetime as _dt
        try:
            cutoff = (_dt.date.fromisoformat(today_iso[:10])
                      - _dt.timedelta(days=lookback_days)).isoformat()
        except (ValueError, TypeError):
            cutoff = None

    for log in workout_logs or []:
        d = (log.get("log_date") or "")
        if cutoff and d < cutoff:
            continue
        _scan_one(log.get("notes") or "", None, out)
        for ex in (log.get("exercises") or []):
            _scan_one(ex.get("notes") or "", ex.get("name"), out)

    return out
