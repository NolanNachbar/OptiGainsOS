#!/usr/bin/env python3
"""sync_library.py — every day that was ever programmed shows up in the library.

The weekly generator saves each day it writes, but that only covers days written
since the save existed, and it never covered cardio-only days at all. This sweeps
program_workouts and upserts a `workouts` template for every distinct title,
so the library is the full catalogue of what the engine has ever programmed
rather than a partial one.

Idempotent: dedup is by lowercased title against the existing library, and an
existing template is refreshed in place rather than duplicated. Only rows in the
"Engine" folder are ever written; a hand-built library workout is never touched.

Usage:
    python3 scripts/sync_library.py           # dry-run, prints what it would do
    python3 scripts/sync_library.py --commit
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(SCRIPT_DIR), ".env"))
except ImportError:
    pass

from engine.library_capture import library_payload  # noqa: E402

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
USER_ID = os.environ.get("USER_ID", "")
COMMIT = "--commit" in sys.argv


def _headers(extra=None):
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
         "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def sb_get(table, params):
    qs = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+*,')}" for k, v in params.items())
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?{qs}", headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def sb_write(method, table, params, row, want_row=False):
    qs = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+*,')}" for k, v in (params or {}).items())
    url = f"{SUPABASE_URL}/rest/v1/{table}" + (f"?{qs}" if qs else "")
    extra = {"Prefer": "return=representation"} if want_row else {"Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=json.dumps(row).encode(),
                                 headers=_headers(extra), method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            return json.loads(body) if want_row and body else True
    except urllib.error.HTTPError as e:
        print(f"  ! {method} {table} failed: {e.code} {e.read().decode()[:200]}")
        return None


def main():
    if not (SUPABASE_URL and SUPABASE_KEY and USER_ID):
        print("missing SUPABASE_URL / service key / USER_ID")
        return 1

    programmed = sb_get("program_workouts", {
        "created_by": f"eq.{USER_ID}",
        "select": "title,focus,exercises,cardio_sessions,scheduled_date",
        "order": "scheduled_date.desc",
    })
    library = sb_get("workouts", {
        "created_by": f"eq.{USER_ID}",
        "select": "id,title,folder",
    })
    by_title = {(w.get("title") or "").strip().lower(): w for w in library}

    # Newest first, so a title that has been programmed many times lands in the
    # library as its most recent version rather than a year-old one.
    seen = set()
    added = refreshed = skipped = 0
    for pw in programmed:
        title = (pw.get("title") or "").strip()
        key = title.lower()
        if not title or key in seen:
            continue
        seen.add(key)
        payload = library_payload(title, pw.get("focus"), pw.get("exercises"),
                                  pw.get("cardio_sessions"))
        if not payload:
            skipped += 1
            continue
        existing = by_title.get(key)
        if existing and (existing.get("folder") or "") != "Engine":
            # A hand-built workout owns that name. Leave it alone.
            skipped += 1
            continue
        if existing:
            print(f"  ~ refresh '{title}' ({len(payload['exercises'])} rows)")
            refreshed += 1
            if COMMIT:
                sb_write("PATCH", "workouts",
                         {"id": f"eq.{existing['id']}", "created_by": f"eq.{USER_ID}"}, payload)
        else:
            print(f"  + add     '{title}' ({len(payload['exercises'])} rows)")
            added += 1
            if COMMIT:
                sb_write("POST", "workouts", None, {"created_by": USER_ID, **payload})

    verb = "wrote" if COMMIT else "would write"
    print(f"\n{verb}: {added} added, {refreshed} refreshed, {skipped} skipped "
          f"(of {len(seen)} distinct programmed titles)")
    if not COMMIT:
        print("dry run — re-run with --commit")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
