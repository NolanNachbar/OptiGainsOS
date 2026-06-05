#!/usr/bin/env python3
"""
audit_strength.py — Print a reality audit of historical lifting logs.

Ingestion (canonical names, the RIR assumption, the Epley rep cap, per-day best
e1RM) lives in engine/log_ingest.py — the SAME module the live orchestrator uses
to feed its progression registry, so this audit and the engine can't disagree.

RIR assumption (per the athlete): every set to failure (RIR 0) EXCEPT "Bench
Everyday" workouts, which carried reps in reserve (see log_ingest constants).

Usage:
    python audit_strength.py [path/to/lifting_log.csv]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.strength_progression import (  # noqa: E402
    compute_trend_slope,
    process_strength_progression,
)
from engine.log_ingest import (  # noqa: E402
    BENCH_EVERYDAY_RIR,
    EPLEY_REP_CAP,
    build_histories,
    load_sets_csv,
)

DEFAULT_CSV = os.path.expanduser("~/Downloads/lifting_log.csv")

GOALS = {"Bench": 315.0, "Squat": 450.0, "Deadlift": 500.0}

# Which canonical lifts count toward each big-three goal, split by competition
# vs training variant (mixing them blends two different movements). The engine's
# GOAL command tracks the competition variant only (see log_ingest.GOAL_LIFTS);
# this audit also reports the training proxies for context. Accessories that
# aren't a 1RM proxy (RDL, Zercher) are excluded entirely.
BIG_THREE = {
    "Bench": {
        "competition (paused)": {"Competition Bench Press - Paused",
                                 "Competition Bench Press - Paused (Top Set)",
                                 "Competition Bench Press - Paused (Back-off)"},
        "training (touch-and-go)": {"Bench Press"},
    },
    "Squat": {
        "competition": {"Competition Squat (Top Set)",
                        "Competition Squat (Back-off)", "Paused Squat (3-count)"},
        "training (barbell)": {"Barbell Squat"},
    },
    "Deadlift": {
        "competition": {"Competition Deadlift (Top Set)",
                        "Competition Deadlift (Back-off)"},
        "deficit (sub-max proxy)": {"Deficit Deadlift"},
    },
}


def variant_series(e1rm_hist, members):
    """Per-day best-e1RM series across the given canonical variant set."""
    per_day = {}
    for ex, series in e1rm_hist.items():
        if ex in members:
            for d, v in series:
                per_day[d] = max(per_day.get(d, 0.0), v)
    return [(d, per_day[d]) for d in sorted(per_day)]


def fmt_series_summary(series):
    vals = [v for _, v in series]
    start, latest, peak = vals[0], vals[-1], max(vals)
    slope = compute_trend_slope(vals)
    recent = compute_trend_slope(vals[-min(len(vals), 8):])
    return start, latest, peak, slope, recent


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(path):
        print(f"CSV not found: {path}")
        sys.exit(1)

    rows = load_sets_csv(path)
    e1rm_hist, rep_hist, _ = build_histories(rows)

    span = f"{rows[0]['date']} → {rows[-1]['date']}" if rows else "n/a"
    print(f"\n{'='*70}\nSTRENGTH AUDIT  ({len(rows)} sets, {span})")
    print(f"RIR: failure=0, Bench-Everyday sets={BENCH_EVERYDAY_RIR} | "
          f"e1RM from sets <={EPLEY_REP_CAP} reps\n{'='*70}")

    print("\n── BIG THREE vs GOALS ──")
    for lift, goal in GOALS.items():
        print(f"\n{lift}  goal {goal:.0f}")
        for label, members in BIG_THREE[lift].items():
            series = variant_series(e1rm_hist, members)
            if not series:
                print(f"   {label:24s} — no data logged")
                continue
            start, latest, peak, slope, recent = fmt_series_summary(series)
            cmd = process_strength_progression([v for _, v in series], 0.0)
            gap = goal - peak
            eta = (f"~{gap/recent:.0f} sessions" if recent > 0
                   else "flat/negative trend")
            print(f"   {label:24s} peak {peak:5.0f}  latest {latest:5.0f}  "
                  f"gap {gap:+5.0f}  {len(series):2d} sess  recent {recent:+6.2f}  "
                  f"{cmd:13s} {eta}")

    print("\n── ALL LOADED LIFTS (e1RM) ──")
    for ex in sorted(e1rm_hist, key=lambda e: -e1rm_hist[e][-1][1]):
        series = e1rm_hist[ex]
        start, latest, peak, slope, recent = fmt_series_summary(series)
        cmd = process_strength_progression([v for _, v in series], 0.0)
        print(f"   {ex:34s} {start:6.0f}→{latest:6.0f} (peak {peak:.0f}) "
              f"slope {slope:+.2f} {len(series):2d}d  {cmd}")

    print("\n── REP-TRACKED (no recorded load — bodyweight or logging gap) ──")
    for ex in sorted(rep_hist):
        series = rep_hist[ex]
        first, last = series[0][1], series[-1][1]
        print(f"   {ex:34s} top set {first:3d}→{last:3d} reps  ({len(series)} sessions)")
    print()


if __name__ == "__main__":
    main()
