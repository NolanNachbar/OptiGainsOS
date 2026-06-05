#!/usr/bin/env python3
"""
backfill_workout_logs.py — Seed Supabase workout_logs from the historical
lifting_log.csv so the engine's strength registry has real history to rebuild
from (otherwise it starts from zero).

Design:
  - Reuses engine.log_ingest.load_sets_csv so canonical names + the RIR rule are
    IDENTICAL to what the audit and the live orchestrator use.
  - Groups sets by date → one workout_log per date (exercises[].sets[]), storing
    explicit `rir` so normalize_workout_logs reproduces the exact same e1RM.
  - Idempotent: each row's id = uuid5(user|date|source), so re-running UPSERTS
    the same rows and never duplicates. Rows are tagged notes="backfill:..." and
    use deterministic ids, so app-created logs (random uuids) are never touched.

Usage:
    python backfill_workout_logs.py [csv]            # dry-run (no writes)
    python backfill_workout_logs.py [csv] --commit   # write to Supabase
"""

import os
import sys
import json
import uuid
import urllib.request
import urllib.parse
import urllib.error
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(SCRIPT_DIR), ".env"))
except ImportError:
    pass

from engine.log_ingest import load_sets_csv

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
USER_ID      = os.environ.get("USER_ID", "")
SOURCE_TAG   = "backfill:lifting_log.csv"
_NS          = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000001")  # fixed namespace


def _headers(extra=None):
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
         "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def sb_get(table, params):
    qs  = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+*,')}" for k, v in params.items())
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?{qs}", headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def resolve_user_id():
    rows = sb_get("user_profiles", {"select": "created_by", "limit": "1"})
    if rows:
        return rows[0]["created_by"]
    print("ERROR: could not resolve USER_ID"); sys.exit(1)


def build_logs(rows, user_id):
    """rows → list of workout_logs upsert dicts (one per date)."""
    by_date = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by_date[r["date"]][r["exercise"]].append(r)
    logs = []
    for date in sorted(by_date):
        exercises = []
        for name, sets in by_date[date].items():
            exercises.append({
                "name": name,
                "sets": [{"set": i + 1, "weight": s["weight"], "reps": s["reps"],
                          "rir": s["rir"], "completed": True}
                         for i, s in enumerate(sets)],
            })
        logs.append({
            "id":         str(uuid.uuid5(_NS, f"{user_id}|{date}|{SOURCE_TAG}")),
            "created_by": user_id,
            "log_date":   date,
            "exercises":  exercises,
            "notes":      SOURCE_TAG,
        })
    return logs


def upsert(row):
    url  = f"{SUPABASE_URL}/rest/v1/workout_logs?on_conflict=id"
    data = json.dumps(row).encode()
    req  = urllib.request.Request(
        url, data=data, method="POST",
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}))
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code}: {e.read().decode()[:300]}")
        return False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    commit = "--commit" in sys.argv
    csv_path = args[0] if args else os.path.expanduser("~/Downloads/lifting_log.csv")
    if not os.path.exists(csv_path):
        print(f"CSV not found: {csv_path}"); sys.exit(1)
    if not all([SUPABASE_URL, SUPABASE_KEY]):
        print("ERROR: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); sys.exit(1)

    global USER_ID
    if not USER_ID:
        USER_ID = resolve_user_id()
    print(f"User: {USER_ID}")

    rows = load_sets_csv(csv_path)
    logs = build_logs(rows, USER_ID)
    dates = [l["log_date"] for l in logs]
    n_sets = sum(len(ex["sets"]) for l in logs for ex in l["exercises"])
    print(f"CSV: {len(rows)} sets → {len(logs)} daily logs "
          f"({dates[0]} → {dates[-1]}), {n_sets} sets total")

    # Inspect existing table state to flag any overlap with REAL app data.
    existing = sb_get("workout_logs", {
        "select": "log_date,notes", "created_by": f"eq.{USER_ID}",
        "order": "log_date.asc", "limit": "2000"})
    backfilled = {e["log_date"] for e in existing if e.get("notes") == SOURCE_TAG}
    app_made   = {e["log_date"] for e in existing if e.get("notes") != SOURCE_TAG}
    overlap_app = sorted(set(dates) & app_made)
    print(f"Existing workout_logs: {len(existing)} "
          f"(app={len(app_made)}, prior-backfill={len(backfilled)})")
    if overlap_app:
        print(f"  ⚠ skipping {len(overlap_app)} CSV date(s) already owned by an "
              f"app-made log (authoritative): {overlap_app[:10]}")
        logs = [l for l in logs if l["log_date"] not in app_made]

    print("\nSample log:")
    print(json.dumps({**logs[0], "exercises": logs[0]["exercises"][:2]}, indent=2)[:700])

    if not commit:
        print("\nDRY RUN — no writes. Re-run with --commit to upsert.")
        return

    print(f"\nWriting {len(logs)} logs (idempotent upsert on id)...")
    ok = sum(upsert(l) for l in logs)
    print(f"✓ {ok}/{len(logs)} workout_logs upserted")


if __name__ == "__main__":
    main()
