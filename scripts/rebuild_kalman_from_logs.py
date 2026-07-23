#!/usr/bin/env python3
"""
rebuild_kalman_from_logs.py — replay the Banister/Kalman state from real training history.

WHY THIS EXISTS
---------------
compute_athlete_state.compute_training_stress used to read `log_date == TODAY`. The daily
cron fires at 10:00 UTC (4am Mountain), BEFORE the athlete trains, so that matched nothing
and the filter's load input u_t was 0.0 every single day. The Garmin branch never rescued
it either (zero recovery_metrics rows carry training_load_acute). So the Banister model was
driven with ZERO training load for its entire life: fitness and fatigue never accumulated,
fatigue never crossed FATIGUE_THRESHOLD, and the MPC saw a permanently fresh athlete.

Fixing the code does not retroactively fix the persisted state — the filter is recursive, so
the corruption is baked into engine_params.kalman_state. This script rebuilds it by stepping
the filter forward over the athlete's ACTUAL logged sessions, one calendar day at a time,
using the same TSS formula the fixed engine now uses.

    python3 rebuild_kalman_from_logs.py            # DRY RUN — prints the trajectory, writes nothing
    python3 rebuild_kalman_from_logs.py --commit   # writes the rebuilt state to engine_params

Idempotent: re-running recomputes from the same logs and lands on the same state.
"""
import os
import sys
import json
import datetime
import urllib.request
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from engine.banister_kalman import BanisterKalman
from engine.log_ingest import proximity_fatigue_factor, EFFORT_COST_PRIOR

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
USER_ID      = os.environ.get("USER_ID", "")
COMMIT       = "--commit" in sys.argv

if not all([SUPABASE_URL, SUPABASE_KEY, USER_ID]):
    sys.exit("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY / USER_ID must be set.")


def _headers(extra=None):
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
         "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def sb_get(table, params):
    query = {"created_by": f"eq.{USER_ID}", **params}
    qs = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in query.items())
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?{qs}", headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def session_tss(log, effort_coeff=EFFORT_COST_PRIOR):
    """Identical to compute_athlete_state.compute_training_stress's fallback branch."""
    sets = [s for ex in (log.get("exercises") or []) for s in (ex.get("sets") or [])]
    vol = sum(float(s.get("weight") or 0) * int(s.get("reps") or 0) for s in sets)
    return min(vol / 100.0, 150.0) * proximity_fatigue_factor(sets, effort_coeff)


def main():
    logs = sb_get("workout_logs", {"select": "log_date,exercises", "order": "log_date.asc"})
    if not logs:
        sys.exit("No workout logs — nothing to replay.")

    # Sum per calendar day, so a genuine two-a-day contributes BOTH sessions.
    by_day: dict = {}
    for log in logs:
        d = str(log.get("log_date") or "")
        if d:
            by_day[d] = by_day.get(d, 0.0) + session_tss(log)

    first = datetime.date.fromisoformat(min(by_day))
    today = datetime.date.today()

    # Replay from a cold filter over every calendar day, training or not — rest days are
    # load 0.0 and are what let fatigue decay. y_t is None throughout: this reconstructs
    # fitness/fatigue from the LOAD history alone. The daily measurement update resumes
    # from the next real engine run.
    k = BanisterKalman()
    trained = 0
    traj = []
    day = first
    while day <= today:
        u = round(by_day.get(day.isoformat(), 0.0), 1)
        if u > 0:
            trained += 1
        k.step(u, None)
        s = k.to_dict()["x"]
        traj.append((day.isoformat(), u, s[0], s[1]))
        day += datetime.timedelta(days=1)

    fit, fat = traj[-1][2], traj[-1][3]
    print(f"Replayed {len(traj)} days ({first} → {today}), {trained} with training.")
    print(f"Total load replayed: {sum(by_day.values()):.0f} TSS across {len(by_day)} sessions-days.\n")
    print(f"{'date':<12}{'load':>8}{'fitness':>10}{'fatigue':>10}{'TSB':>9}")
    for d, u, f, g in traj[-14:]:
        print(f"{d:<12}{u:>8.1f}{f:>10.2f}{g:>10.2f}{f-g:>9.2f}")

    cur = sb_get("engine_params", {"select": "date,kalman_state", "order": "date.desc", "limit": "1"})
    if cur:
        cx = (cur[0].get("kalman_state") or {}).get("x") or [None, None]
        print(f"\nCURRENT (stored, built on zero load): fitness={cx[0]}, fatigue={cx[1]}")
    print(f"REBUILT (from real logs):             fitness={fit:.3f}, fatigue={fat:.3f}, TSB={fit-fat:.3f}")

    if not COMMIT:
        print("\nDRY RUN — nothing written. Re-run with --commit to persist.")
        return

    row = {"created_by": USER_ID, "date": today.isoformat(), "kalman_state": k.to_dict()}
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/engine_params?on_conflict=created_by,date",
        data=json.dumps(row).encode(),
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30):
        pass
    print(f"\nCOMMITTED kalman_state for {today}.")


if __name__ == "__main__":
    main()
