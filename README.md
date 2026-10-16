# OptiGains

**The training instrument that shows its working.**

OptiGains is a private, single-user training app. A deterministic Python engine
computes athlete state and prescribes sessions, with no LLM in the loop. The
React app logs workouts, nutrition, body measurements and recovery, and shows
what the engine prescribed and why. Personal use only.

Voice, naming and visual rules: [`brand/BRAND_GUIDE.md`](brand/BRAND_GUIDE.md).

## Stack

- React + Vite frontend, installable PWA
- Supabase: Postgres, auth, edge functions in `supabase/functions/`
- Python engine in `scripts/`, run on a GitHub Actions cron

## Run locally

Requires Node.js 20 or higher.

```
npm install
npm run dev
```

## Engine checks

```
python3 scripts/smoke.py
```

## Accounts: which user owns the real data

There are two rows in `auth.users`, and mixing them up will send you on a long
debugging detour. Every table is scoped by a `created_by` UUID.

| account | UUID | what it is |
|---|---|---|
| `nvtnachbar@gmail.com` | `169d2f0b-cf5a-44fb-8551-845004725a26` | The real athlete. All live data. |
| `athlete@local.test` | `5ec4eebf-ae62-4f3f-9c1d-f44f92716bc8` | Test fixture. Local dev only. |
| `optigains-sim-test@example.invalid` | see `auth.users` | Hosted test clone for `ios-sim`. Created and refreshed by `ios-sim/clone-test-user.mjs`, which clones the real athlete's rows under this id. Profile is overwritten to `display_name: "TEST ACCOUNT (ios-sim clone)"` so it is never mistaken for real data. |

The engine (`scripts/*.py`, via the `USER_ID` GitHub secret) and the Garmin edge
functions (via the `USER_ID` Supabase secret) read and write only the real
athlete's UUID. The test account holds a frozen snapshot from late June 2026
and nothing writes to it.

`athlete@local.test` and `optigains-sim-test@example.invalid` both hold
byte-identical copies of the real account's rows. Query any user-scoped table
without a `created_by` filter and those rows look like duplicated workouts. They
are not. The engine filters by `created_by`, RLS keeps them out of the browser,
and there are no true duplicates within the real account (one double-submit on
2026-06-22 aside). Always filter by `created_by` before concluding the data is
corrupt. Closed findings are in `KNOWN_NON_ISSUES.md`.
