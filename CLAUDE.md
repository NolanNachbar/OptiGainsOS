# OptiGains — repo guide for Claude

Private, single-user training engine. React + Vite + Supabase, deterministic
Python engine on GitHub Actions cron. Personal use only.

## Read this before auditing anything

**`KNOWN_NON_ISSUES.md` first.** It lists findings that have already been
investigated and closed. The recurring one:

> `5ec4eebf-ae62-4f3f-9c1d-f44f92716bc8` is `athlete@local.test`, a **seeded test
> user** — a frozen byte-identical copy of the live account's data through
> 2026-06-21. It is NOT duplicate rows, NOT corruption, and cannot reach the
> engine (`sb_get` injects `created_by`) or the frontend (RLS). The live account
> is `169d2f0b-cf5a-44fb-8551-845004725a26`.

Any query against a user-scoped table must filter `created_by` before you draw a
conclusion from row counts. Unfiltered counts look like duplication and are not.

Do not re-report closed findings. If you believe one is wrong, verify against
the live database and say what specifically contradicts the record.

## Verifying claims

- Never trust `[DONE]` markers in `SCIENCE_ALIGNMENT.md` or the conclusions of
  previous `AUDIT_*.md` files. Verify against source, live schema, and DB rows.
- Code that exists but is unreachable from the three engine entry points
  (`compute_athlete_state.py`, `mpc_prescriber.py`, `generate_weekly_program.py`)
  is dead, not working.
- Read helper definitions before judging their call sites. Inferring from call
  sites alone has produced two separate false positives in this repo.

## Hard behavioral constraints

**A workout must never restart or stop once anything has been logged** — even
before it is saved. Phone locks mid-set, tab reloads, service worker updates: an
in-progress session always restores silently into logging mode. Never add a
timeout that clears `optigains-workout-active`, never auto-finish or cancel a
session on age, and never let a workout-scoped query clear that global flag. See
`src/lib/workoutSessionFlag.js` and `src/hooks/useWorkoutSession.js`.

## Engine

Deterministic Python grounded in the vault's Training-Science concepts. No
LLM-in-the-loop. Prefer learned priors over fixed rules and templates. Do not
invent thresholds or constants and present them as principles — ground them in a
source or mark them explicitly as tunable.

Source-of-truth spec is `Science-Unified.md`; the build backlog is
`SCIENCE_ALIGNMENT.md`.

## Migrations

Two folders exist: `supabase/migrations/` (CLI-tracked) and a legacy
`migrations/`. Changes applied directly to production land in neither, which is
how columns like `programs.cycle_length` end up referenced in code but absent
from the live schema. Check the live schema before trusting either folder.

## Git

Nolan pushes manually. Commit locally; do not push without his review. Never add
Co-Authored-By or "Generated with Claude" lines.
