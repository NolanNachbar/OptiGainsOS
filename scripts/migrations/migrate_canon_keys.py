#!/usr/bin/env python3
"""
migrate_canon_keys.py — One-time key-merge after the canon() rework.

canon() now lowercases, expands abbreviation tokens (db/bb/ohp/kb...), and
applies a stable canonical casing, so keys it emitted BEFORE the rework
(original-cased unknowns, "DB Curl", etc.) no longer match what the engine
will look up. This script re-canons every persisted learned-state key and
merges collisions:

  - athlete_params.exercise_values  meta {name: {mean,var,n}}
        merge: n-weighted mean, min var, summed n
  - engine_params (latest row) guardrail_state.e1rm_registry history
        {name: [e1RM,...]} — merge: concatenate, keep the 90 most recent
        (cosmetic: the registry is rebuilt from workout_logs each weekly run)

athlete_state.strength and goal aggregates are recomputed from raw logs every
run, so they self-heal and are not touched here.

Idempotent: keys already canonical map to themselves and re-merging a merged
blob is a no-op. DRY-RUN by default — pass --apply to write.

Usage:
  python3 scripts/migrations/migrate_canon_keys.py            # dry run
  python3 scripts/migrations/migrate_canon_keys.py --apply    # write changes
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.dirname(SCRIPT_DIR)
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)
sys.path.insert(0, SCRIPTS_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_DIR, ".env"))
except ImportError:
    pass

from engine.log_ingest import canon  # noqa: E402

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
USER_ID      = os.environ.get("USER_ID", "")

MAX_HISTORY = 90  # mirrors strength_progression._MAX_HISTORY


def _headers(extra=None):
    h = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }
    if extra:
        h.update(extra)
    return h


def sb_get(table, params):
    qs  = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in params.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def sb_patch(table, filt, row):
    qs  = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+')}" for k, v in filt.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, data=json.dumps(row).encode(), method="PATCH",
                                 headers=_headers({"Prefer": "return=minimal"}))
    with urllib.request.urlopen(req, timeout=30):
        return True


def merge_exercise_values(meta: dict):
    """Re-canon every exercise_values key; merge colliding posteriors."""
    out, renames = {}, []
    for old_key, post in (meta or {}).items():
        new_key = canon(old_key) or old_key
        if new_key != old_key:
            renames.append((old_key, new_key))
        if new_key not in out:
            out[new_key] = dict(post)
            continue
        a, b = out[new_key], post
        na, nb = int(a.get("n", 0)), int(b.get("n", 0))
        n = na + nb
        if n > 0:
            mean = (float(a.get("mean", 0.0)) * na + float(b.get("mean", 0.0)) * nb) / n
        else:
            mean = (float(a.get("mean", 0.0)) + float(b.get("mean", 0.0))) / 2.0
        out[new_key] = {
            "mean": round(mean, 4),
            "var":  round(min(float(a.get("var", 1.0)), float(b.get("var", 1.0))), 4),
            "n":    n,
        }
    return out, renames


def merge_e1rm_history(history: dict):
    """Re-canon every e1rm_registry history key; merge colliding series."""
    out, renames = {}, []
    for old_key, series in (history or {}).items():
        new_key = canon(old_key) or old_key
        if new_key != old_key:
            renames.append((old_key, new_key))
        merged = out.get(new_key, []) + list(series or [])
        out[new_key] = merged[-MAX_HISTORY:]
    return out, renames


def main():
    apply = "--apply" in sys.argv[1:]
    if not all([SUPABASE_URL, SUPABASE_KEY, USER_ID]):
        print("ERROR: Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / USER_ID")
        sys.exit(1)
    print(f"Mode: {'APPLY' if apply else 'DRY RUN (pass --apply to write)'}")

    # ── athlete_params.exercise_values ────────────────────────────────────────
    ev_rows = sb_get("athlete_params", {
        "select": "*", "created_by": f"eq.{USER_ID}", "param_key": "eq.exercise_values"})
    ev_meta = ((ev_rows[0].get("meta") if ev_rows else None) or {})
    new_meta, ev_renames = merge_exercise_values(ev_meta)
    print(f"\nexercise_values: {len(ev_meta)} keys → {len(new_meta)} keys")
    targets: dict = {}
    for k in ev_meta:
        nk = canon(k) or k
        targets[nk] = targets.get(nk, 0) + 1
    for old, new in ev_renames:
        tag = " (merged)" if targets.get(new, 0) > 1 else ""
        print(f"  {old!r} → {new!r}{tag}")
    if not ev_renames:
        print("  (already canonical — nothing to do)")
    elif apply:
        sb_patch("athlete_params",
                 {"created_by": f"eq.{USER_ID}", "param_key": "eq.exercise_values"},
                 {"meta": new_meta,
                  "n_obs": sum(int(v.get("n", 0)) for v in new_meta.values())})
        print("  ✓ written")

    # ── engine_params (latest).guardrail_state.e1rm_registry ─────────────────
    eng_rows = sb_get("engine_params", {
        "select": "*", "created_by": f"eq.{USER_ID}",
        "order": "date.desc", "limit": "1"})
    if not eng_rows:
        print("\ne1rm_registry: no engine_params row — nothing to do")
        return
    eng = eng_rows[0]
    guardrail_state = eng.get("guardrail_state") or {}
    history = (guardrail_state.get("e1rm_registry") or {}).get("history") or {}
    new_history, reg_renames = merge_e1rm_history(history)
    print(f"\ne1rm_registry: {len(history)} keys → {len(new_history)} keys")
    for old, new in reg_renames:
        print(f"  {old!r} → {new!r}")
    if not reg_renames:
        print("  (already canonical — nothing to do)")
    elif apply:
        guardrail_state = dict(guardrail_state)
        guardrail_state["e1rm_registry"] = {"history": new_history}
        sb_patch("engine_params",
                 {"created_by": f"eq.{USER_ID}", "date": f"eq.{eng.get('date')}"},
                 {"guardrail_state": guardrail_state})
        print("  ✓ written")


if __name__ == "__main__":
    main()
