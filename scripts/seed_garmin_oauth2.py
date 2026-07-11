#!/usr/bin/env python3
"""Exchange the stored Garmin OAuth1 token for an OAuth2 bearer and cache it.

WHY THIS EXISTS
---------------
The edge functions (garmin-sync, garmin-activities-sync) normally do this
exchange themselves and cache the bearer in garmin_tokens.oauth2_token. But
Garmin throttles its OAuth2 exchange endpoint per source IP, and Supabase's
egress is a datacenter IP. Exchange too often from there and it starts
answering 429. With an empty cache there is nothing to fall back to, so both
syncs hard-fail and Garmin data silently goes stale.

This script runs the same exchange from THIS machine (a residential IP, which
Garmin does not throttle) and writes the bearer into the cache, so the edge
functions read it instead of touching the exchange endpoint at all.

Run it when a sync reports "OAuth2 exchange failed: 429".

    set -a; source .env; set +a
    python3 scripts/seed_garmin_oauth2.py

This does NOT need your Garmin password — it reuses the long-lived OAuth1 token
already in garmin_tokens. If it reports 401, that OAuth1 token has expired
(~1yr) and you need the full garth re-seed: see scripts/seed_garmin_token.py.

The signing below mirrors supabase/functions/garmin-sync/index.ts exactly.
"""
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import uuid

import requests

CONNECTAPI = "https://connectapi.garmin.com"
UA = "GCM-iOS-5.7.2.1"
CK_FALLBACK = "fc3e99d2-118c-44b8-8ae3-03370dde24c0"
CS_FALLBACK = "E08WAR897WEy2knn7aFBrvegVAf0AFdWBBF"

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ["VITE_SUPABASE_URL"]).rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
USER_ID = os.environ["USER_ID"]

SB = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def pe(s) -> str:
    return urllib.parse.quote(str(s), safe="-._~")


def oauth1_header(method, url, ck, cs, token, token_secret):
    u = urllib.parse.urlsplit(url)
    oauth = {
        "oauth_consumer_key": ck,
        "oauth_nonce": uuid.uuid4().hex,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_version": "1.0",
        "oauth_token": token,
    }
    params = list(urllib.parse.parse_qsl(u.query)) + list(oauth.items())
    param_str = "&".join(f"{k}={v}" for k, v in sorted((pe(k), pe(v)) for k, v in params))
    base = f"{method.upper()}&{pe(u.scheme + '://' + u.netloc + u.path)}&{pe(param_str)}"
    key = f"{pe(cs)}&{pe(token_secret or '')}"
    sig = hmac.new(key.encode(), base.encode(), hashlib.sha1).digest()
    oauth["oauth_signature"] = base64.b64encode(sig).decode()
    return "OAuth " + ", ".join(f'{pe(k)}="{pe(v)}"' for k, v in oauth.items())


def get_consumer():
    try:
        r = requests.get("https://thegarth.s3.amazonaws.com/oauth_consumer.json", timeout=10)
        if r.ok:
            j = r.json()
            if j.get("consumer_key") and j.get("consumer_secret"):
                return j["consumer_key"], j["consumer_secret"]
    except requests.RequestException:
        pass
    return CK_FALLBACK, CS_FALLBACK


def main() -> None:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/garmin_tokens",
        headers=SB,
        params={"created_by": f"eq.{USER_ID}", "select": "oauth_token,oauth_token_secret"},
        timeout=20,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows or not rows[0].get("oauth_token"):
        sys.exit("No OAuth1 token stored — run the one-time garth seed first.")
    o1_token = rows[0]["oauth_token"]
    o1_secret = rows[0]["oauth_token_secret"]
    print(f"OAuth1 token loaded (…{o1_token[-6:]})")

    ck, cs = get_consumer()
    url = f"{CONNECTAPI}/oauth-service/oauth/exchange/user/2.0"
    resp = requests.post(
        url,
        headers={
            "User-Agent": UA,
            "Authorization": oauth1_header("POST", url, ck, cs, o1_token, o1_secret),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data="",
        timeout=30,
    )
    print(f"exchange HTTP {resp.status_code}")
    if resp.status_code == 429:
        sys.exit("429 even from a residential IP — the throttle is account-wide. Wait a few hours.")
    if resp.status_code == 401:
        sys.exit("401 — the OAuth1 token expired. Re-seed it with garth (scripts/seed_garmin_token.py).")
    resp.raise_for_status()

    j = resp.json()
    access = j["access_token"]
    expires_in = int(j.get("expires_in") or 3600)

    # Shave 60s off the lifetime as a clock-skew buffer, same as the edge function.
    expires_at = time.strftime(
        "%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() + max(60, expires_in - 60))
    )
    u = requests.patch(
        f"{SUPABASE_URL}/rest/v1/garmin_tokens",
        headers=SB,
        params={"created_by": f"eq.{USER_ID}"},
        data=json.dumps({"oauth2_token": access, "oauth2_expires_at": expires_at}),
        timeout=20,
    )
    u.raise_for_status()
    print(f"cached bearer in garmin_tokens, valid until {expires_at}")


if __name__ == "__main__":
    main()
