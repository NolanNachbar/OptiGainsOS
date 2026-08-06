#!/usr/bin/env python3
"""
sync_vault_plan.py — push the recurring plan from the second brain (vault) into
OptiGains' task_templates. The vault is the source of truth; this sync is ONE-WAY
(vault -> Supabase). It is the single step that needs your computer on, and you
only run it when the plan changes — the daily loop (materialize + brief + push)
runs entirely in Supabase.

What it does:
  - Reads the YAML plan file from the vault.
  - Upserts every task by (created_by, source_key) — editing a task in the vault
    updates it; adding one creates it.
  - Deactivates (active=false) any template whose source_key is no longer in the
    plan, so removing it from the vault removes it from your daily list.

Your phone only ever edits TODAY'S instances (daily_tasks); it never touches
this. "Make it permanent" from the phone goes to capture_inbox for you to fold
back into this file later.

Run from the OptiGains repo:
    python scripts/sync_vault_plan.py

Env (loaded from ../.env or the environment):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    USER_ID            optional — resolved from user_profiles if unset
    VAULT_PLAN_PATH    optional — defaults to the BBrain skill-dev plan
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

# ── Load .env ───────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except Exception:
    pass  # python-dotenv not installed; env vars must be set externally

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed. Run: pip install pyyaml")
    sys.exit(1)

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
USER_ID = os.environ.get("USER_ID", "")

DEFAULT_PLAN = os.path.expanduser("~/Claude/BBrain/20-Areas/Skill-Development/recurring-plan.yaml")
PLAN_PATH = os.environ.get("VAULT_PLAN_PATH", DEFAULT_PLAN)
DEFAULT_GOALS = os.path.expanduser("~/Claude/BBrain/20-Areas/goals.yaml")
GOALS_PATH = os.environ.get("VAULT_GOALS_PATH", DEFAULT_GOALS)

VALID_DOMAINS = {"mind", "career", "training", "nutrition", "general"}
VALID_RECUR = {"daily", "weekdays", "weekly", "custom"}

if not all([SUPABASE_URL, SUPABASE_KEY]):
    print("ERROR: Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def _req(method, path, body=None, extra_headers=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = dict(HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        print(f"ERROR {e.code} on {method} {path}: {e.read().decode()[:500]}")
        sys.exit(1)


def _resolve_user_id():
    """Refuse to guess between the real athlete and the seeded dev/test profile —
    the service-role key bypasses RLS, so an unordered `limit=1` is a coin flip."""
    rows = _req("GET", "user_profiles?select=created_by")
    ids  = sorted({r["created_by"] for r in rows if r.get("created_by")})
    if len(ids) == 1:
        return ids[0]
    if not ids:
        print("ERROR: USER_ID not set and no user_profiles row found.")
    else:
        print(f"ERROR: {len(ids)} athletes in user_profiles; refusing to guess. "
              f"Set the USER_ID env var explicitly.")
    sys.exit(1)


def main():
    global USER_ID
    if not USER_ID:
        USER_ID = _resolve_user_id()
        print(f"  Resolved USER_ID from DB: {USER_ID}")

    if not os.path.exists(PLAN_PATH):
        print(f"ERROR: plan file not found: {PLAN_PATH}")
        sys.exit(1)

    with open(PLAN_PATH) as f:
        plan = yaml.safe_load(f) or {}

    tasks = plan.get("tasks", []) or []
    if not tasks:
        print(f"No tasks found in {PLAN_PATH}. Nothing to sync.")
        return

    rows = []
    seen_keys = []
    for t in tasks:
        key = t.get("source_key")
        title = t.get("title")
        if not key or not title:
            print(f"  SKIP (missing source_key/title): {t}")
            continue

        domain = t.get("domain", "general")
        if domain not in VALID_DOMAINS:
            print(f"  WARN: invalid domain '{domain}' for {key}, using 'general'")
            domain = "general"

        recur = t.get("recurrence", "daily")
        if recur not in VALID_RECUR:
            print(f"  WARN: invalid recurrence '{recur}' for {key}, using 'daily'")
            recur = "daily"

        rows.append({
            "created_by": USER_ID,
            "source_key": key,
            "title": title,
            "domain": domain,
            "goal": t.get("goal"),
            "recurrence": recur,
            "days_of_week": t.get("days_of_week"),
            "target": t.get("target"),
            "sort_order": t.get("sort_order", len(rows)),
            "active": True,
        })
        seen_keys.append(key)

    # Upsert by (created_by, source_key). merge-duplicates updates existing rows
    # and reactivates any that were previously deactivated.
    _req(
        "POST",
        "task_templates?on_conflict=created_by,source_key",
        rows,
        {"Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    print(f"  Upserted {len(rows)} template(s): {', '.join(seen_keys)}")

    # Deactivate templates no longer present in the plan (vault is source of truth).
    existing = _req(
        "GET",
        f"task_templates?created_by=eq.{USER_ID}&active=eq.true&select=source_key",
    )
    stale = [r["source_key"] for r in existing if r["source_key"] not in seen_keys]
    for key in stale:
        _req(
            "PATCH",
            f"task_templates?created_by=eq.{USER_ID}&source_key=eq.{urllib.parse.quote(key)}",
            {"active": False},
            {"Prefer": "return=minimal"},
        )
    if stale:
        print(f"  Deactivated {len(stale)} removed from the plan: {', '.join(stale)}")

    print("Done. The morning materialize will pick these up tomorrow.")
    sync_goals()


def sync_goals():
    """Sync ~/Claude/BBrain/20-Areas/goals.yaml → athlete_goals (read by the brief)."""
    if not os.path.exists(GOALS_PATH):
        print(f"  (no goals file at {GOALS_PATH} — skipping goals sync)")
        return
    with open(GOALS_PATH) as f:
        data = yaml.safe_load(f) or {}
    goals = data.get("goals", []) or []
    rows, seen = [], []
    for g in goals:
        key = g.get("source_key")
        goal = g.get("goal")
        if not key or not goal:
            print(f"  SKIP goal (missing source_key/goal): {g}")
            continue
        rows.append({
            "created_by": USER_ID, "source_key": key, "domain": g.get("domain"),
            "goal": goal, "target": g.get("target"), "status": g.get("status", "active"),
            "priority": int(g.get("priority", 0)), "notes": g.get("notes"), "active": True,
        })
        seen.append(key)
    if rows:
        _req("POST", "athlete_goals?on_conflict=created_by,source_key", rows,
             {"Prefer": "resolution=merge-duplicates,return=minimal"})
        print(f"  Upserted {len(rows)} goal(s): {', '.join(seen)}")
    existing = _req("GET", f"athlete_goals?created_by=eq.{USER_ID}&active=eq.true&select=source_key")
    stale = [r["source_key"] for r in existing if r["source_key"] not in seen]
    for key in stale:
        _req("PATCH",
             f"athlete_goals?created_by=eq.{USER_ID}&source_key=eq.{urllib.parse.quote(key)}",
             {"active": False}, {"Prefer": "return=minimal"})
    if stale:
        print(f"  Deactivated {len(stale)} removed goal(s): {', '.join(stale)}")


if __name__ == "__main__":
    main()
