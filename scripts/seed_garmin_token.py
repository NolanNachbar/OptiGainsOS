#!/usr/bin/env python3
"""
One-time Garmin auth seed.

Garmin's SSO host bot-blocks datacenter IPs (Supabase edge gets HTTP 403), so the
edge function can't log in headlessly. Instead we log in ONCE here — from your own
machine (a residential IP, which Garmin allows) — and store the long-lived OAuth1
token in the `garmin_tokens` table. The edge function then refreshes the short-lived
OAuth2 bearer from it on every run, only ever touching connectapi.garmin.com (the
API host, which is NOT bot-walled). No more 403.

Run it once (re-run only if sync starts failing with "expired/invalid", ~yearly):

    pip install garth
    python scripts/seed_garmin_token.py

Reads the same vars the engine already uses, from the project .env (or environment):
    GARMIN_EMAIL, GARMIN_PASSWORD, USER_ID,
    SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)

garth will interactively prompt for an MFA code if your account has 2FA enabled.
"""
import json
import os
from pathlib import Path
from urllib import request as _rq

import garth

# ── load project .env (without extra deps) ────────────────────────────────────
env: dict[str, str] = {}
envfile = Path(__file__).resolve().parent.parent / ".env"
if envfile.exists():
    for line in envfile.read_text().splitlines():
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, v = s.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")


def cfg(*names: str) -> str | None:
    for n in names:
        v = os.environ.get(n) or env.get(n)
        if v:
            return v
    return None


SUPABASE_URL = cfg("SUPABASE_URL", "VITE_SUPABASE_URL")
SERVICE_KEY = cfg("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY")
USER_ID = cfg("USER_ID")
EMAIL = cfg("GARMIN_EMAIL")
PASSWORD = cfg("GARMIN_PASSWORD")

missing = [n for n, v in {
    "SUPABASE_URL": SUPABASE_URL, "SUPABASE_SERVICE_KEY": SERVICE_KEY,
    "USER_ID": USER_ID, "GARMIN_EMAIL": EMAIL, "GARMIN_PASSWORD": PASSWORD,
}.items() if not v]
if missing:
    raise SystemExit(f"Missing required config: {', '.join(missing)}")

# ── log in (residential IP) and grab the long-lived OAuth1 token ──────────────
print("Logging in to Garmin via garth (may prompt for MFA)…")
garth.login(EMAIL, PASSWORD)
tok = garth.client.oauth1_token
row = {
    "created_by": USER_ID,
    "oauth_token": tok.oauth_token,
    "oauth_token_secret": tok.oauth_token_secret,
}

# ── upsert into garmin_tokens via PostgREST (service role) ────────────────────
req = _rq.Request(
    f"{SUPABASE_URL}/rest/v1/garmin_tokens?on_conflict=created_by",
    data=json.dumps(row).encode(),
    method="POST",
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    },
)
with _rq.urlopen(req) as resp:
    print(f"Seeded garmin_tokens (HTTP {resp.status}).")

print("Done. The garmin-sync edge function will now pull data on the 09:00 UTC cron")
print("(or trigger it manually). Verify with: select max(date), count(hrv) from recovery_metrics;")
