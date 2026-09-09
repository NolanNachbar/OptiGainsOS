#!/usr/bin/env python3
"""
smoke.py — the end-to-end assertions AUDIT_2026-07-30 P5 asked for.

The audit list kept regrowing because nothing in the repo could tell a fixed
finding from an open one: every sweep re-derived the same conclusions by
reading code. These six checks turn the recurring findings into detectors, so
the next regression fails a run instead of waiting for another cold read.

    python3 smoke.py            # from scripts/, like validate_convergence_fixes.py

Two tiers:

  PURE   — no network. Runs everywhere, including CI's placeholder-credential
           job. Covers the schema-contract and split-logic classes.
  LIVE   — needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY against the real
           project. SKIPS (does not fail) when they are absent or fake, so CI
           stays green without secrets and fork PRs still run the pure tier.

Exit 1 if any check fails. Skips never fail the run.
"""
import datetime
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "src"

PASS, FAIL, SKIP = "✓ PASS", "✗ FAIL", "– SKIP"
_results = []


def check(name, ok, detail=""):
    _results.append(bool(ok))
    print(f"  {PASS if ok else FAIL}  {name}" + (f"  — {detail}" if detail else ""))


def skip(name, why):
    print(f"  {SKIP}  {name}  — {why}")


def section(title):
    print(f"\n── {title} " + "─" * max(0, 60 - len(title)))


# ══════════════════════════════════════════════════════════════════════════════
# Credentials — LIVE tier gate
# ══════════════════════════════════════════════════════════════════════════════
# Without this a plain `python3 scripts/smoke.py` silently skips the entire
# live tier — the half that catches real data problems — and still prints
# "ALL CHECKS PASSED". load_dotenv does not override an already-set variable,
# so CI's placeholders still win and still force the skip path.
try:
    from dotenv import load_dotenv
    load_dotenv(REPO / ".env")
except ImportError:
    pass

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
# CI passes deliberate placeholders (see .github/workflows/test.yml) so the pure
# engine checks can run on fork PRs that never receive secrets. Treat those as
# "no credentials" rather than trying to reach a host that does not resolve.
LIVE = bool(SUPABASE_URL and SUPABASE_KEY
            and "placeholder" not in SUPABASE_URL
            and "placeholder" not in SUPABASE_KEY)
NO_CREDS = "no live Supabase credentials in env"

# The live account. The seeded test user athlete@local.test
# (5ec4eebf-ae62-4f3f-9c1d-f44f92716bc8) shares these tables and its rows are
# NOT defects — see KNOWN_NON_ISSUES.md. Every live query pins created_by so a
# seeded row can never be re-reported as a duplicate again.
USER_ID = os.environ.get("USER_ID") or "169d2f0b-cf5a-44fb-8551-845004725a26"


def sb_get(table: str, params: dict, pin_user=True) -> list:
    query = dict(params)
    if pin_user:
        query.setdefault("created_by", f"eq.{USER_ID}")
    qs = "&".join(f"{k}={urllib.parse.quote(str(v), safe='.-+*,()')}" for k, v in query.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


# ══════════════════════════════════════════════════════════════════════════════
# JS source parsing — for the schema-contract check
# ══════════════════════════════════════════════════════════════════════════════
def entity_table_map() -> dict:
    """EntityName -> table, read from src/api/supabaseClient.js."""
    text = (SRC / "api" / "supabaseClient.js").read_text()
    return dict(re.findall(r"(\w+):\s*this\.createEntity\(['\"]([\w]+)['\"]\)", text))


def _scan(text: str, i: int, want_depth_keys: bool):
    """Walk a JS object literal starting at text[i] == '{'.

    Returns (keys, end_index). Only depth-1 `name:` keys are collected, and a
    ternary's `:` is skipped — `tag: cond ? e.timing : null` writes `tag`, not
    `timing`. Computed and spread keys are ignored, which under-reports rather
    than inventing a column that was never written.
    """
    depth, j, keys = 0, i, []
    in_str, quote = False, ""
    in_line_c = in_block_c = False
    pending_ternary = 0
    while j < len(text):
        c = text[j]
        nxt = text[j + 1] if j + 1 < len(text) else ""
        if in_line_c:
            if c == "\n":
                in_line_c = False
        elif in_block_c:
            if c == "*" and nxt == "/":
                in_block_c, j = False, j + 1
        elif in_str:
            if c == "\\":
                j += 1
            elif c == quote:
                in_str = False
        elif c == "/" and nxt == "/":
            in_line_c, j = True, j + 1
        elif c == "/" and nxt == "*":
            in_block_c, j = True, j + 1
        elif c in "\"'`":
            in_str, quote = True, c
        elif c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
            if depth == 0:
                return keys, j
        elif depth == 1 and c == ",":
            pending_ternary = 0
        elif depth == 1 and c == "?" and nxt not in ".?":
            pending_ternary += 1
        elif depth == 1 and c == ":":
            if pending_ternary:
                pending_ternary -= 1
            elif want_depth_keys:
                m = re.search(r"([A-Za-z_$][\w$]*)\s*$", text[:j])
                if m:
                    keys.append(m.group(1))
        j += 1
    return keys, j


def _call_arg_object(text: str, after_paren: int, arg_index: int):
    """Keys of the object literal passed as argument `arg_index` of a call whose
    '(' ends at `after_paren`. Returns [] when that argument is a variable
    rather than a literal — `update(id, updateFields)` must yield nothing, not
    the keys of whatever object happens to appear later in the file.
    """
    j, depth, arg = after_paren, 0, 0
    while j < len(text):
        c = text[j]
        if c in "{[(":
            if depth == 0 and arg == arg_index and c == "{":
                return _scan(text, j, True)[0]
            depth += 1
            _, j = _scan(text, j, False)
        elif c in "}])":
            if depth == 0:
                return []
            depth -= 1
        elif c == "," and depth == 0:
            arg += 1
            if arg > arg_index:
                return []
        elif c in "\"'`":
            _, j = _scan(text, j, False) if False else (None, j)
            q = c
            j += 1
            while j < len(text) and text[j] != q:
                j += 2 if text[j] == "\\" else 1
        elif not c.isspace() and depth == 0 and arg == arg_index:
            # A non-literal argument (identifier, spread, call). Nothing to read.
            return []
        j += 1
    return []


def written_columns() -> dict:
    """table -> {column: [source sites]} for every db.entities.X.create/update
    call in the frontend. This is the P0-3 detector: ProgramBuilder wrote a
    `cycle_length` column that does not exist and every save 400'd silently."""
    ents = entity_table_map()
    out = defaultdict(lambda: defaultdict(list))
    for path in sorted(SRC.rglob("*.js")) + sorted(SRC.rglob("*.jsx")):
        text = path.read_text()
        rel = str(path.relative_to(REPO))
        for m in re.finditer(r"db\.entities\.(\w+)\.(create|update)\s*\(", text):
            ent, op = m.group(1), m.group(2)
            table = ents.get(ent)
            if not table:
                continue
            keys = _call_arg_object(text, m.end(), 0 if op == "create" else 1)
            line = text.count("\n", 0, m.start()) + 1
            for k in keys:
                out[table][k].append(f"{rel}:{line}")
    return {t: dict(c) for t, c in out.items()}


def written_enum_values(entity: str, column: str) -> dict:
    """Literal values the frontend writes into a CHECK-constrained column.
    P0-4: every Cancel Enrollment wrote status:"cancelled" against a constraint
    of active|completed|paused, so the button never once worked."""
    ents = entity_table_map()
    table = ents.get(entity)
    found = defaultdict(list)
    for path in sorted(SRC.rglob("*.js")) + sorted(SRC.rglob("*.jsx")):
        text = path.read_text()
        rel = str(path.relative_to(REPO))
        for m in re.finditer(rf"db\.entities\.{entity}\.(create|update)\s*\(", text):
            idx = 0 if m.group(1) == "create" else 1
            if column not in _call_arg_object(text, m.end(), idx):
                continue
            # Re-read the literal to capture the value written for that key.
            jj = text.index("{", m.end())
            _, end = _scan(text, jj, False)
            for vm in re.finditer(rf"\b{column}\s*:\s*[\"']([\w-]+)[\"']", text[jj:end + 1]):
                found[vm.group(1)].append(f"{rel}:{text.count(chr(10), 0, m.start()) + 1}")
    return table, dict(found)


# ══════════════════════════════════════════════════════════════════════════════
# PURE TIER
# ══════════════════════════════════════════════════════════════════════════════
section("PURE — split logic")

sys.path.insert(0, str(REPO / "scripts"))
try:
    from engine.session_generator import SPLIT_REGION, _converge_split
    from engine.learners import exercise_reward, SET_DELTA_GAIN, SET_DELTA_CLAMP
    _ENGINE_OK = True
except Exception as e:                                    # pragma: no cover
    _ENGINE_OK = False
    skip("engine import", f"{type(e).__name__}: {e}")

if _ENGINE_OK:
    # P1-2: nothing stopped the generator picking the same region two days
    # running, so upper-on-upper weeks shipped. Drive the real chooser and
    # assert it never repeats the previous day's region.
    _ft = {"chest": 2.0, "back": 2.0, "quads": 2.0, "hamstrings": 2.0,
           "shoulders": 2.0, "biceps": 2.0, "triceps": 2.0, "glutes": 2.0}
    _repeats = []
    for seed_type in sorted(SPLIT_REGION):
        got = _converge_split([seed_type], "upper_lower", _ft, {}, {})
        got_type = got[0] if isinstance(got, (tuple, list)) else got
        if SPLIT_REGION.get(got_type) == SPLIT_REGION.get(seed_type):
            _repeats.append(f"{seed_type} -> {got_type}")
    check("P1-2 consecutive days never repeat a body region",
          not _repeats, ", ".join(_repeats[:4]))

    # Simulate a full week the way the generator does, feeding each pick back in.
    _week, _recent = [], []
    for _ in range(6):
        got = _converge_split(_recent[-2:], "upper_lower", _ft, {}, {})
        got_type = got[0] if isinstance(got, (tuple, list)) else got
        _week.append(SPLIT_REGION.get(got_type, got_type))
        _recent.append(got_type)
    _back_to_back = [f"day{i+1}/{i+2}={_week[i]}" for i in range(len(_week) - 1)
                     if _week[i] == _week[i + 1]]
    check("P1-2 a simulated 6-day week has no back-to-back region",
          not _back_to_back, ", ".join(_back_to_back[:4]))

    # P1-1: the mean signed set delta was computed every run and discarded.
    # These pin the direction, the symmetry and the ceiling, so the term cannot
    # silently invert or start dominating the reward if the gain is retuned.
    _base = exercise_reward(None, 0, 0, 0.0, 0, pain=False)
    _short = exercise_reward(None, 0, 0, 0.0, 0, pain=False, set_delta=-2.0)
    _long = exercise_reward(None, 0, 0, 0.0, 0, pain=False, set_delta=2.0)
    check("P1-1 cutting sets short lowers an exercise's reward",
          _short < _base, f"{_short} < {_base}")
    check("P1-1 adding sets raises it",
          _long > _base, f"{_long} > {_base}")
    check("P1-1 the term is symmetric around no deviation",
          abs((_long - _base) + (_short - _base)) < 1e-9)
    check("P1-1 the term is clamped so it cannot dominate the reward",
          abs(exercise_reward(None, 0, 0, 0.0, 0, pain=False, set_delta=99.0)
              - _base) <= SET_DELTA_CLAMP + 1e-9,
          f"clamp {SET_DELTA_CLAMP}, gain {SET_DELTA_GAIN}")
    # A corroborated pain note is a hard veto; no amount of extra volume may
    # buy a flagged movement back into the program.
    check("P1-1 a set surplus cannot override a corroborated pain veto",
          exercise_reward(None, 0, 0, 0.0, 0, pain=True, pain_severity=2,
                          pain_mentions=2, set_delta=99.0) < 0)

section("PURE — frontend/schema contract")

# Static half of the P0-3 detector: the parser must actually find the writes.
# If a refactor changes the db.entities call shape this check goes red rather
# than the whole contract check silently passing on an empty set.
_written = written_columns()
_total_cols = sum(len(c) for c in _written.values())
check("schema-contract parser found frontend writes",
      len(_written) >= 5 and _total_cols >= 30,
      f"{_total_cols} columns across {len(_written)} tables")

_ENROLL_TABLE, _status_values = written_enum_values("ProgramEnrollment", "status")
# The live CHECK is program_enrollments_status_check: active|completed|paused.
_ALLOWED_STATUS = {"active", "completed", "paused"}
_bad_status = {v: s for v, s in _status_values.items() if v not in _ALLOWED_STATUS}
check("P0-4 enrollment status writes stay inside the CHECK constraint",
      not _bad_status,
      "; ".join(f"{v} at {s[0]}" for v, s in _bad_status.items()))

# P0-3 regression pin. `cycle_length` is a UI-only field; `days_per_week`
# carries it to the DB. Writing it back returns 400 and loses the whole save.
_prog_cols = _written.get("programs", {})
check("P0-3 no write of the nonexistent programs.cycle_length column",
      "cycle_length" not in _prog_cols,
      ", ".join(_prog_cols.get("cycle_length", [])))

# The launch redirect and the Resume?/Start Fresh dialog are coupled through
# two constants in different files. WorkoutDetail restores a session silently
# while it is younger than STALE_SESSION_MS and only shows the dialog past it,
# so the redirect window MUST stay strictly inside that. If someone widens the
# redirect to 48h, every cold launch lands on a modal whose left-hand button
# discards a live session — the exact harm the retracted P0-2 fix caused.
def _ms_const(path, name):
    m = re.search(rf"{name}\s*=\s*([0-9*\s]+);", (SRC / path).read_text())
    return eval(m.group(1)) if m else None

_redirect_ms = _ms_const("hooks/useActiveWorkoutSession.js", "ACTIVE_SESSION_MAX_AGE_MS")
_stale_ms = _ms_const("lib/workoutSessionFlag.js", "STALE_SESSION_MS")
_autofin_ms = _ms_const("lib/workoutSessionFlag.js", "AUTO_FINISH_STALE_MS")
check("launch redirect can never land on the Start Fresh dialog",
      bool(_redirect_ms and _stale_ms and _redirect_ms < _stale_ms),
      f"redirect {(_redirect_ms or 0)/3.6e6:.0f}h must stay < stale {(_stale_ms or 0)/3.6e6:.0f}h")

# Auto-finish measures silence (updated_at), the other two measure age
# (start_time) — different clocks, but the ordering still has to hold. If
# auto-finish ever exceeds STALE_SESSION_MS, a session reaches the dialog
# before anything has saved it, and the left-hand button discards logged sets.
check("auto-finish fires before a session can reach the Start Fresh dialog",
      bool(_autofin_ms and _stale_ms and _autofin_ms < _stale_ms),
      f"auto-finish {(_autofin_ms or 0)/3.6e6:.0f}h must stay < stale {(_stale_ms or 0)/3.6e6:.0f}h")

# The whole point of the rewritten auto-finish: it writes the log BEFORE it
# flips status. The removed 8h version flipped status alone, which is why three
# August sessions hold sets no learner can see. Guard the ordering in source.
_hook_src = (SRC / "hooks/useWorkoutSession.js").read_text()
_af_body = _hook_src.split("const autoFinishSession")[-1].split("const cancelSession")[0]
check("auto-finish's duplicate guard matches work, not just the date",
      "logMatchesSession" in _af_body,
      "a date-only guard swallows a real second workout on the same day")

check("auto-finish writes the workout_log before flipping status",
      "WorkoutLog.create" in _af_body
      and _af_body.index("WorkoutLog.create") < _af_body.index('status: "completed"'),
      "autoFinishSession must create the log first, or it silently destroys sets")


# ══════════════════════════════════════════════════════════════════════════════
# LIVE TIER
# ══════════════════════════════════════════════════════════════════════════════
section("LIVE — schema, coverage, templates, logs")

if not LIVE:
    for _n in ("every frontend-written column exists in live schema",
               "P3 no duplicate workout_logs for (created_by, log_date)",
               "logging round-trip: recent sessions have a matching log",
               "P0-1 schedule coverage ≥ 7 days with no gaps",
               "P0-1 no filler rows in any base template",
               "P0-1 no base template collapsed to a single session",
               "P1-6 exercise-count and set ceilings hold"):
        skip(_n, NO_CREDS)
else:
    # ── 6. every frontend-written column exists in live schema ────────────────
    # The generalised P0-3 check: ask the live table for zero rows, read the
    # column list off the response shape via an explicit select of one column
    # per candidate. A nonexistent column returns HTTP 400, which is exactly
    # the failure the frontend was swallowing.
    _missing = []
    _unchecked = []
    for _table, _cols in sorted(_written.items()):
        for _col in sorted(_cols):
            try:
                sb_get(_table, {"select": _col, "limit": 1}, pin_user=False)
            except urllib.error.HTTPError as e:
                if e.code == 400:
                    _missing.append(f"{_table}.{_col} ({_cols[_col][0]})")
                else:
                    _unchecked.append(f"{_table}.{_col} HTTP {e.code}")
            except Exception as e:
                _unchecked.append(f"{_table}.{_col} {type(e).__name__}")
    check("every frontend-written column exists in live schema",
          not _missing, "; ".join(_missing[:6]))
    if _unchecked:
        print(f"      note: {len(_unchecked)} column(s) not verifiable: {_unchecked[:3]}")

    _today = datetime.date.today()
    _since = (_today - datetime.timedelta(days=120)).isoformat()

    # ── 1a. no duplicate workout_logs for (created_by, log_date) ──────────────
    # Scoped to the live account on purpose. The 56 "duplicates" an earlier
    # sweep reported belonged to the seeded test user; the only genuine one was
    # a 2026-06-22 double-submit. This guard is what makes that distinction
    # permanent instead of re-litigated.
    _logs = sb_get("workout_logs", {"select": "id,log_date", "log_date": f"gte.{_since}"})
    _dups = [d for d, n in Counter(r["log_date"] for r in _logs).items() if n > 1]
    check("P3 no duplicate workout_logs for (created_by, log_date)",
          not _dups, f"{len(_dups)} date(s): {sorted(_dups)[:5]}")

    # ── 1b. logging round-trip ───────────────────────────────────────────────
    # A completed session with no workout_logs row on the same date means the
    # write silently failed and the work is gone from every downstream learner.
    # start_time is UTC; log_date is the athlete's LOCAL date. He trains in the
    # evening, so a session at 00:09Z belongs to the previous local day —
    # comparing the two raw would report every evening workout as lost.
    _tz_rows = sb_get("user_profiles", {"select": "timezone", "limit": 1})
    _tzname = (_tz_rows[0].get("timezone") if _tz_rows else None) or "America/Denver"
    try:
        from zoneinfo import ZoneInfo
        _tz = ZoneInfo(_tzname)
    except Exception:
        _tz = None
    _sessions = sb_get("workout_sessions", {
        "select": "id,status,start_time", "status": "eq.completed",
        "start_time": f"gte.{(_today - datetime.timedelta(days=45)).isoformat()}"})
    _log_dates = {r["log_date"] for r in _logs}

    def _local_date(iso):
        dt = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if _tz is not None and dt.tzinfo is not None:
            dt = dt.astimezone(_tz)
        return dt.date().isoformat()

    _orphans = [_local_date(s["start_time"]) for s in _sessions
                if s.get("start_time") and _local_date(s["start_time"]) not in _log_dates]
    check(f"logging round-trip: completed sessions have a log ({_tzname})",
          not _orphans, f"{len(_orphans)} orphan session(s): {sorted(set(_orphans))[:5]}")

    # ── 1c. stranded sessions ────────────────────────────────────────────────
    # The check above only sees status=completed, so a session that was trained
    # into and never finished is invisible to it — yet those carry real sets
    # that no learner will ever read. Anything older than the stale window with
    # logged sets and no log on its local date is stranded training history.
    _STRANDED_AFTER_H = 24
    _open = sb_get("workout_sessions", {
        "select": "id,start_time,exercises", "status": "eq.in_progress",
        "start_time": f"gte.{(_today - datetime.timedelta(days=120)).isoformat()}"})
    _stranded = []
    for _s in _open:
        if not _s.get("start_time"):
            continue
        _age_h = (datetime.datetime.now(datetime.timezone.utc)
                  - datetime.datetime.fromisoformat(_s["start_time"].replace("Z", "+00:00"))
                  ).total_seconds() / 3600
        if _age_h < _STRANDED_AFTER_H:
            continue  # still resumable; the launch redirect exists for exactly this
        _sets = sum(len(_e.get("sets") or []) for _e in (_s.get("exercises") or [])
                    if isinstance(_e, dict))
        if _sets and _local_date(_s["start_time"]) not in _log_dates:
            _stranded.append((_local_date(_s["start_time"]), _sets))
    check("no stranded in-progress sessions holding unlogged sets",
          not _stranded,
          "; ".join(f"{d} ({n} sets)" for d, n in sorted(_stranded)))

    # ── 4. date-pinned coverage >= 14 days with no gaps ──────────────────────
    # P0-1's real damage: the generator stopped at the week edge, the schedule
    # ran dry, and the UI fell back to a corrupt base template. Coverage is now
    # buffered (COVERAGE_BUFFER_DAYS), so assert the buffer is actually there.
    _pw = sb_get("program_workouts", {
        "select": "scheduled_date,title,exercises,day_index,program_id",
        "scheduled_date": f"gte.{_today.isoformat()}"})
    _dates = sorted({r["scheduled_date"] for r in _pw if r.get("scheduled_date")})
    # The weekly cron writes ~14 days each Monday (COVERAGE_BUFFER_DAYS = 7 on
    # top of the days left in the week), then coverage decays day by day until
    # the next run. The invariant that actually prevents P0-1 — the schedule
    # running dry and the UI falling back to a base template — is that a full
    # week is always already written, so that is what this asserts.
    MIN_COVERAGE_DAYS = 7
    if not _dates:
        check(f"P0-1 schedule coverage ≥ {MIN_COVERAGE_DAYS} days with no gaps",
              False, "no future rows at all")
    else:
        _last = datetime.date.fromisoformat(_dates[-1])
        _span = (_last - _today).days + 1
        _have = {datetime.date.fromisoformat(d) for d in _dates}
        _gaps = [(_today + datetime.timedelta(days=i)).isoformat()
                 for i in range(_span) if (_today + datetime.timedelta(days=i)) not in _have]
        check(f"P0-1 schedule coverage ≥ {MIN_COVERAGE_DAYS} days with no gaps",
              _span >= MIN_COVERAGE_DAYS and not _gaps,
              f"covers {_span}d, {len(_gaps)} gap(s): {_gaps[:4]}")

    # ── 5. no placeholder base-template rows ─────────────────────────────────
    # The base template is the fallback the UI renders when no dated row exists,
    # so corrupt rows there are invisible until they are the only thing left.
    # The rows P0-1 found were filler: Deadlift 3x5@67% / Squat 3x5@63% /
    # Bench 3x6@58% / Run 3.1mi, repeated byte-identically across day_index 4-7.
    #
    # Do NOT flag repeated content by itself — this program is a 3-day rotation
    # run twice a week, so days 1/4, 2/5 and 3/6 are identical BY DESIGN. Pin
    # the actual filler signature, and separately catch a template that has
    # collapsed to a single session.
    PLACEHOLDER_SIGNATURE = {"deadlift", "squat", "bench", "run"}
    _base_rows = sb_get("program_workouts",
                   {"select": "id,program_id,day_index,title,exercises",
                    "scheduled_date": "is.null"})
    _filler, _by_program = [], defaultdict(set)
    for _r in _base_rows:
        _ex = _r.get("exercises") or []
        if not isinstance(_ex, list):
            continue
        _names = {str(e.get("exercise_name") or e.get("name") or "").lower()
                  for e in _ex if isinstance(e, dict)}
        if _names and _names == PLACEHOLDER_SIGNATURE:
            _filler.append(f"{_r['id'][:8]} day{_r.get('day_index')}")
        _by_program[_r.get("program_id")].add(hashlib.sha256(
            json.dumps(_ex, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12])
    check("P0-1 no filler rows in any base template",
          not _filler, ", ".join(_filler[:6]))
    _collapsed = [f"{k[:8]} ({len(_base_rows)} rows, 1 unique)"
                  for k, v in _by_program.items() if len(v) == 1
                  and sum(1 for r in _base_rows if r.get("program_id") == k) > 1]
    check("P0-1 no base template collapsed to a single session",
          not _collapsed, ", ".join(_collapsed[:3]))

    # ── 3. exercise-count and set ceilings ───────────────────────────────────
    # P1-6: volume crept from 19 to 24 sets with nothing bounding it. These are
    # ceilings, not targets — they exist to catch runaway prescription.
    MAX_EXERCISES_PER_SESSION = 8
    MAX_SETS_PER_SESSION = 30
    _over_ex, _over_sets = [], []
    for _r in _pw:
        _ex = _r.get("exercises") or []
        if not isinstance(_ex, list):
            continue
        if len(_ex) > MAX_EXERCISES_PER_SESSION:
            _over_ex.append(f"{_r['scheduled_date']}={len(_ex)}")
        _sets = sum(int(e.get("sets") or 0) for e in _ex if isinstance(e, dict))
        if _sets > MAX_SETS_PER_SESSION:
            _over_sets.append(f"{_r['scheduled_date']}={_sets}")
    check(f"P1-6 exercise count ≤ {MAX_EXERCISES_PER_SESSION} per session",
          not _over_ex, ", ".join(_over_ex[:4]))
    check(f"P1-6 total sets ≤ {MAX_SETS_PER_SESSION} per session",
          not _over_sets, ", ".join(_over_sets[:4]))


print()
if not _results:
    print("NO CHECKS RAN")
    raise SystemExit(1)
if all(_results):
    print(f"ALL {len(_results)} CHECKS PASSED" + ("" if LIVE else "  (live tier skipped)"))
else:
    print(f"{_results.count(False)}/{len(_results)} CHECKS FAILED")
    raise SystemExit(1)
