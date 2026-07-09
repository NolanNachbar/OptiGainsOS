"""
log_ingest.py — Single source of truth for turning logged sets into e1RM history.

Both the offline audit (audit_strength.py) and the live orchestrator
(generate_weekly_program.py) funnel raw logged sets through THIS module so they
can never disagree on canonical names, the RIR assumption, the Epley rep cap, or
how per-day best e1RM is aggregated.

Two front doors produce the same intermediate `rows` shape
(date, workout, exercise, weight, reps, rir):
  - load_sets_csv()          : historical lifting_log.csv (audit)
  - normalize_workout_logs() : Supabase workout_logs JSONB rows (orchestrator)

`build_histories()` then splits loaded (e1RM-tracked) vs rep-tracked lifts, and
`populate_registry()` feeds a StrengthProgressionRegistry — per individual lift
AND per big-three GOAL aggregate.
"""

import csv
import re

from engine.strength_progression import compute_e1rm

# ── Assumptions ───────────────────────────────────────────────────────────────
BENCH_EVERYDAY_PREFIX = "bench everyday"   # CSV workout_name → non-failure sets
BENCH_EVERYDAY_RIR    = 2                  # assumed reps-in-reserve for those
FAILURE_RIR           = 0                  # default: every set taken to failure
EPLEY_REP_CAP         = 12                 # Epley unreliable above this — sets
                                           # with more reps are volume work, not a
                                           # 1RM proxy, so they fall to rep-tracking

# ── E2: proximity-to-failure fatigue cost ─────────────────────────────────────
# Training to failure (0 RIR) is Nolan's chosen style and is KEPT. The engine does
# not push him off failure; instead it MODELS the extra fatigue that proximity to
# failure generates so the allocator can manage it by trimming VOLUME. Without this,
# a 0-RIR set and a 3-RIR set on the same lift produce identical Banister fatigue.
# Effective-reps reference is 5 (Core Volume Model: Reps_eff = max(0, 5 - RIR)); sets
# at/above this RIR add no extra fatigue beyond their raw volume.
EFFORT_REF_RIR    = 5.0    # [ENG] reps-in-reserve at which a set adds no extra fatigue
EFFORT_COST_PRIOR = 0.06   # [ENG] LEARNABLE wide prior: extra session-fatigue fraction
                           # per RIR-point below the reference (his real recoverability
                           # from failure work). Override per-athlete via engine params;
                           # not a fixed law. At RIR 0 → 1+0.06·5 = 1.30× fatigue.


def proximity_fatigue_factor(sets, coeff: float = EFFORT_COST_PRIOR,
                             ref_rir: float = EFFORT_REF_RIR) -> float:
    """Volume-weighted mean proximity-to-failure fatigue multiplier (>= 1.0) for a
    session's sets. Lower RIR (closer to failure) → higher fatigue; sets at RIR >=
    ref_rir add no extra fatigue. A set missing RIR defaults to failure (RIR 0),
    matching the rest of the ingest. `coeff` is a learnable per-person prior, not a
    constant. Returns 1.0 for a session with no countable volume."""
    total_vol, weighted = 0.0, 0.0
    for s in (sets or []):
        if s.get("completed") is False:                # skip uncompleted sets
            continue
        try:
            weight = float(s.get("weight") or 0)
        except (ValueError, TypeError):
            continue
        vol = weight * _parse_reps(s.get("reps"))      # tolerant of "8-12" ranges
        if vol <= 0:
            continue
        rir_raw = s.get("rir")
        try:
            rir = float(rir_raw) if rir_raw not in (None, "") else float(FAILURE_RIR)
        except (ValueError, TypeError):
            rir = float(FAILURE_RIR)                    # malformed RIR → failure default
        prox = max(0.0, ref_rir - rir)                 # effective-reps proximity
        factor = 1.0 + max(0.0, coeff) * prox          # >= 1.0, never discounts load
        total_vol += vol
        weighted += vol * factor
    if total_vol <= 0:
        return 1.0
    return weighted / total_vol

# Canonical exercise names (collapse case/plural/spacing dups).
ALIASES = {
    "bench": "Bench Press",
    "bench press": "Bench Press",
    "dumbbell bench": "Dumbbell Bench Press",
    "barbell squats": "Barbell Squat",
    "zercher squats": "Zercher Squat",
    "chest-supported row": "Chest-Supported Row",
    "chest-supported rows": "Chest-Supported Row",
    "chest-supported row (machine)": "Chest-Supported Row",
    "lat pulldowns": "Lat Pulldown",
    "rdl": "Romanian Deadlift",
    "calf raises": "Calf Raise",
    "hanging leg raises": "Hanging Leg Raise",
    "weighted pull-ups": "Weighted Pull-Up",
    "pull-up": "Weighted Pull-Up",
    "barbell curls": "Barbell Curl",
    "db curls": "Dumbbell Curl",
    "lateral raises": "Lateral Raise",
}

# Abbreviation tokens expanded before alias lookup so "DB Bench" and
# "Dumbbell Bench Press" collide to one identity instead of reading as a swap.
ABBREVIATIONS = {
    "db":  "dumbbell",
    "bb":  "barbell",
    "kb":  "kettlebell",
    "ohp": "overhead press",
    "rdl": "romanian deadlift",
    "dl":  "deadlift",
}

# Big-three GOAL lifts = COMPETITION variants only. Per Nolan (2026-06-05):
#   - Bench goal is the legit PAUSED competition bench, NOT the touch-and-go
#     "Bench Press" (the ~341 e1RM was a cheat — butt left the bench).
#   - Deadlift goal is CONVENTIONAL competition; deficit is sub-max assistance.
#   - Squat goal is the competition squat, not the higher-load barbell back squat.
# Touch-and-go bench, barbell squat, and deficit DL stay tracked as individual
# lifts (assistance/proxies) but do NOT drive the goal command.
GOAL_LIFTS = {
    "Bench (paused comp)": {
        # CSV-era names
        "Competition Bench Press - Paused",
        "Competition Bench Press - Paused (Top Set)",
        "Competition Bench Press - Paused (Back-off)",
        # App session-generator names
        "Bench Press (Daily Single)",   # legacy name (pre-2026-07-08); kept so history maps
        "Bench Press (Top Set)",
        "Bench Press (Back-off Vol)",
        "Bench Press (Back-off Int)",
    },
    "Squat (comp)": {
        # CSV-era names
        "Competition Squat (Top Set)",
        "Competition Squat (Back-off)",
        "Paused Squat (3-count)",
        # App session-generator names
        "Back Squat (Top Set)",
        "Back Squat (Back-off)",
    },
    "Deadlift (conventional comp)": {
        # CSV-era names
        "Competition Deadlift (Top Set)",
        "Competition Deadlift (Back-off)",
        # App session-generator name
        "Deadlift (Top Set)",
    },
}
GOAL_TARGETS = {
    "Bench (paused comp)": 315.0,
    "Squat (comp)": 450.0,
    "Deadlift (conventional comp)": 500.0,
}


def _singularize(key: str) -> str:
    words = key.split()
    if not words:
        return key
    last = words[-1]
    if last.endswith(("sses", "shes", "ches", "xes")):
        words[-1] = last[:-2]
    elif len(last) > 3 and last.endswith("s") and not last.endswith("ss"):
        words[-1] = last[:-1]
    return " ".join(words)


def _canon_case(key: str) -> str:
    """Stable canonical casing for names with no alias entry."""
    return re.sub(r"[a-z]+", lambda m: m.group()[0].upper() + m.group()[1:], key)


def canon(name: str) -> str:
    """Canonical exercise identity: lowercase + collapse whitespace, expand
    abbreviation tokens, alias lookup at each stage, then a stable canonical
    casing for unknown names — so case/abbreviation/plural variants of the
    same lift collide to one key instead of fragmenting learned state."""
    key = " ".join((name or "").split()).lower()
    if not key:
        return ""
    if key in ALIASES:
        return ALIASES[key]
    key = re.sub(r"[a-z0-9]+", lambda m: ABBREVIATIONS.get(m.group(), m.group()), key)
    if key in ALIASES:
        return ALIASES[key]
    key = _singularize(key)
    if key in ALIASES:
        return ALIASES[key]
    return _canon_case(key)


def canon_tokens(name: str) -> frozenset:
    """Normalized token set of the canonical name (for fuzzy same-exercise
    comparison in the deviation tracker)."""
    return frozenset(re.findall(r"[a-z0-9]+", canon(name).lower()))


def is_bench_everyday(workout_name: str) -> bool:
    return (workout_name or "").strip().lower().startswith(BENCH_EVERYDAY_PREFIX)


# ── Loaders → rows ────────────────────────────────────────────────────────────

def load_sets_csv(path: str) -> list:
    """Historical lifting_log.csv → rows. RIR assumed 0 except Bench-Everyday."""
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                weight = float(r["weight"] or 0)
                reps = int(float(r["reps"] or 0))
            except (ValueError, KeyError):
                continue
            if reps <= 0:
                continue
            # Bench-Everyday multi-rep back-offs carried reps in reserve (RIR 2);
            # their heavy TOP SINGLES (1 rep) were max-effort, so RIR 0 — applying
            # +2 to a 310x1 single wrongly inflated its e1RM to ~341 (Nolan's clean
            # max is ~275; those singles were touch-and-go, not a clean-bench proxy).
            if is_bench_everyday(r["workout_name"]) and reps >= 2:
                rir = BENCH_EVERYDAY_RIR
            else:
                rir = FAILURE_RIR
            rows.append({
                "date": r["date"].strip(),
                "workout": r["workout_name"].strip(),
                "exercise": canon(r["exercise"]),
                "weight": weight,
                "reps": reps,
                "rir": rir,
            })
    rows.sort(key=lambda x: x["date"])
    return rows


def _parse_reps(raw) -> int:
    """Reps may arrive as an int, a float, or a prescription range string like
    "6-8" (rep_target passed through the logger untouched). Take the first
    integer in the string — the range's lower bound — instead of dropping the
    set, which silently removed prescribed sessions from e1RM learning."""
    if raw in (None, ""):
        return 0
    try:
        return int(float(raw))
    except (ValueError, TypeError):
        m = re.search(r"\d+", str(raw))
        return int(m.group()) if m else 0


def normalize_workout_logs(logs: list) -> list:
    """
    Supabase workout_logs rows → rows.

    Each log: {log_date, exercises: [{name, sets: [{weight, reps, rir?, completed?}]}]}.
    Uses the set's explicit `rir` when present (the app SHOULD log it going
    forward); otherwise falls back to the failure=0 assumption. workout_logs
    carries no workout_name, so the Bench-Everyday CSV heuristic does not apply
    here — log real RIR instead.
    """
    rows = []
    for log in logs or []:
        date = (log.get("log_date") or "").strip()
        for ex in log.get("exercises", []) or []:
            name = canon(ex.get("name", ""))
            for s in ex.get("sets", []) or []:
                if s.get("completed") is False:
                    continue
                try:
                    weight = float(s.get("weight") or 0)
                    reps = _parse_reps(s.get("reps"))
                except (ValueError, TypeError):
                    continue
                if reps <= 0:
                    continue
                rir_raw = s.get("rir")
                rir = int(float(rir_raw)) if rir_raw not in (None, "") else FAILURE_RIR
                rows.append({
                    "date": date,
                    "workout": "",
                    "exercise": name,
                    "weight": weight,
                    "reps": reps,
                    "rir": rir,
                })
    rows.sort(key=lambda x: x["date"])
    return rows


# ── rows → histories ──────────────────────────────────────────────────────────

def build_histories(rows: list):
    """
    Returns:
      e1rm_hist: {exercise: [(date, best_e1rm), ...]}        loaded lifts
      rep_hist:  {exercise: [(date, top_set_reps), ...]}     rep-tracked moves
      best_set:  {exercise: [(date, best_set_dict), ...]}    the set behind each
                                                             per-day best e1RM
    A lift is e1RM-tracked when it has a real strength signal (loaded, low-rep
    sets); otherwise it falls through to rep-tracking (bodyweight / logging gaps).
    """
    by_ex = {}
    for s in rows:
        by_ex.setdefault(s["exercise"], []).append(s)

    e1rm_hist, rep_hist, best_set = {}, {}, {}
    for ex, sets in by_ex.items():
        loaded_in_cap = [s for s in sets if s["weight"] > 0 and s["reps"] <= EPLEY_REP_CAP]
        if len(loaded_in_cap) >= max(2, len(sets) // 3):
            per_day = {}  # date -> (e1rm, set)
            for s in loaded_in_cap:
                e = compute_e1rm(s["weight"], s["reps"], s["rir"])
                if e > per_day.get(s["date"], (0.0, None))[0]:
                    per_day[s["date"]] = (e, s)
            days = sorted(per_day)
            e1rm_hist[ex] = [(d, per_day[d][0]) for d in days]
            best_set[ex]  = [(d, per_day[d][1]) for d in days]
        else:
            per_day = {}
            for s in sets:
                per_day[s["date"]] = max(per_day.get(s["date"], 0), s["reps"])
            rep_hist[ex] = [(d, per_day[d]) for d in sorted(per_day)]
    return e1rm_hist, rep_hist, best_set


# ── rows → goal series ────────────────────────────────────────────────────────

def _goal_best_sets(rows: list, goal_lifts: dict) -> dict:
    """
    {goal: [(date, best_set_dict), ...]} — per training-day best member set for
    each GOAL aggregate. Single definition of the competition-variant rollup,
    shared by populate_registry (→ engine) and goal_histories (→ athlete_state).
    """
    _, _, best_set = build_histories(rows)
    out = {}
    for goal, members in goal_lifts.items():
        members_c = {canon(m) for m in members}
        per_day = {}  # date -> (e1rm, set)
        for ex, series in best_set.items():
            if ex not in members_c:
                continue
            for d, s in series:
                e = compute_e1rm(s["weight"], s["reps"], s["rir"])
                if e > per_day.get(d, (0.0, None))[0]:
                    per_day[d] = (e, s)
        out[goal] = [(d, per_day[d][1]) for d in sorted(per_day)]
    return out


def goal_histories(rows: list, goal_lifts: dict = None) -> dict:
    """
    {goal: [(date, best_e1rm), ...]} chronological per-day e1RM for each GOAL
    aggregate. Empty goals are dropped. Same RIR-aware, ≤12-rep-cap, canonical
    pipeline the orchestrator's registry uses — so any consumer (e.g.
    compute_athlete_state) lands on identical numbers.
    """
    if goal_lifts is None:
        goal_lifts = GOAL_LIFTS
    out = {}
    for goal, series in _goal_best_sets(rows, goal_lifts).items():
        if not series:
            continue
        out[goal] = [(d, compute_e1rm(s["weight"], s["reps"], s["rir"])) for d, s in series]
    return out


# ── rows → registry ───────────────────────────────────────────────────────────

def populate_registry(registry, rows: list, goal_lifts: dict = None):
    """
    Feed a StrengthProgressionRegistry from logged sets:
      - one entry per training-day per individual loaded lift (per-day best set)
      - one entry per training-day per GOAL aggregate (best across its members)
    Entries are pushed in chronological order so the registry's trend slope is
    a clean per-session signal. Idempotent: build a fresh registry and call once
    (rebuild-from-source, do not append across runs).
    """
    if goal_lifts is None:
        goal_lifts = GOAL_LIFTS
    _, _, best_set = build_histories(rows)

    for ex, series in best_set.items():
        for _d, s in series:
            registry.log_set(ex, s["weight"], s["reps"], s["rir"])

    for goal, series in _goal_best_sets(rows, goal_lifts).items():
        for _d, s in series:
            registry.log_set(goal, s["weight"], s["reps"], s["rir"])

    return registry
