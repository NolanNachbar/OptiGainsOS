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

from engine.strength_progression import compute_e1rm

# ── Assumptions ───────────────────────────────────────────────────────────────
BENCH_EVERYDAY_PREFIX = "bench everyday"   # CSV workout_name → non-failure sets
BENCH_EVERYDAY_RIR    = 2                  # assumed reps-in-reserve for those
FAILURE_RIR           = 0                  # default: every set taken to failure
EPLEY_REP_CAP         = 12                 # Epley unreliable above this — sets
                                           # with more reps are volume work, not a
                                           # 1RM proxy, so they fall to rep-tracking

# Canonical exercise names (collapse case/plural/spacing dups).
ALIASES = {
    "bench press": "Bench Press",
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
    "db curls": "DB Curl",
    "lateral raises": "Lateral Raise",
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
        "Competition Bench Press - Paused",
        "Competition Bench Press - Paused (Top Set)",
        "Competition Bench Press - Paused (Back-off)",
    },
    "Squat (comp)": {
        "Competition Squat (Top Set)",
        "Competition Squat (Back-off)",
        "Paused Squat (3-count)",
    },
    "Deadlift (conventional comp)": {
        "Competition Deadlift (Top Set)",
        "Competition Deadlift (Back-off)",
    },
}
GOAL_TARGETS = {
    "Bench (paused comp)": 315.0,
    "Squat (comp)": 450.0,
    "Deadlift (conventional comp)": 500.0,
}


def canon(name: str) -> str:
    key = (name or "").strip().lower()
    return ALIASES.get(key, (name or "").strip())


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
                    reps = int(float(s.get("reps") or 0))
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
        per_day = {}  # date -> (e1rm, set)
        for ex, series in best_set.items():
            if ex not in members:
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
