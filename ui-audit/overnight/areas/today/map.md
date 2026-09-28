# Today / Coach / Mind / Athlete State / Brief History — map, round 1

Entry point: bottom nav → **Today** (`/today`, `src/pages/Today.jsx`), the app's
home screen. Coach (`/coach`), Mind (`/mind`), Athlete State (`/athlete-state`,
tucked behind a link, not bottom nav), Brief History (`/brief-history`, linked
from Today's Brief tab) are 1-2 taps away from Today.

**Todos live on `/today` only** — `src/components/dashboard/TodayActions.jsx`,
table `todos` (562 total / 324 last 90d, Nolan's 2nd most-used table). This is
the ONLY component in the app that reads or writes `todos` (grepped whole
`src/` tree — no other page references the table). There is no todos history
view, no way to see or manage a past day's todos, no filter/search — the
component always queries `date = todayStr` only.

## Today's Actions (todos) — `TodayActions.jsx`

| Feature | What it does | Tables |
|---|---|---|
| List today's todos | `.select("*").eq("created_by", user.id).eq("date", todayStr)` (`:33-40`) | read `todos` |
| Client-side de-dupe | Filters `rawTodos` to unique `text`, keeping earliest `created_at` (`:47-52`) | in-memory |
| AI-seed from brief | On mount, if `briefActions.length` and no `localStorage["todos_seeded_<uid>_<date>"]` flag, bulk-inserts one row per brief action (`:56-77`) | `todos` insert (batch) |
| Toggle complete | Checkbox → `toggleMutation` (`:80-90`) | `todos` update |
| Delete | X button → `deleteMutation` (`:92-98`), **no confirm, no undo** | `todos` delete |
| Add manual | + → inline input → Enter/Add → `addMutation` (`:100-116`) | `todos` insert |

### Risky code paths (todos)

- **Seed race, two tabs/reloads (`:56-77`)**: the guard is `localStorage.getItem(seedKey)`
  checked BEFORE the insert, but `localStorage.setItem(seedKey, "1")` only runs
  in the insert's `.then()` callback — there is no synchronous claim. Two tabs
  (or a fast reload right after the first paint) loading `/today` within the
  same round-trip window both pass the `!localStorage.getItem(seedKey)` check
  before either write lands, so both fire `supabase.from("todos").insert(rows)`
  — duplicate AI-seeded todos for the day. The de-dupe-by-text filter (`:47-52`)
  masks this in the UI (duplicates collapse to one visible row) but the DB now
  holds 2x rows, so `total`/`completed` counts and the progress bar (`completed / total * 100` at
  `:150`) can be wrong (denominator counts hidden duplicates).
- **De-dupe by `text`, not by content+domain (`:47-52`)**: two genuinely different
  AI-seeded todos that happen to render identical text (e.g. brief regenerated
  with a repeated action string) silently disappear — one is invisibly dropped
  from the list even though both rows exist and both can be toggled/deleted
  independently by ID. A user who deletes the *visible* one may still have a
  hidden duplicate that resurfaces on next reload's de-dupe pass (a different
  `created_at` becomes "earliest" after the delete).
- **Delete: no confirm, no undo, no `isPending` disable (`:187-193`)** — a fast
  double-tap on the X calls `deleteMutation.mutate(id)` twice; second call is a
  harmless no-op (already deleted), but there's zero recovery path for a
  mis-tapped delete (contrast: Mind's Reading/Study/Skills tabs all use
  `ConfirmDialog` before delete, `Mind.jsx:234-242` etc. — Today's todos are the
  one delete path in this whole area group with no confirm).
- **Toggle: no `isPending` disable (`:172-181`)** — same double-tap class as
  fuel-r1-07; low severity since update is idempotent, but no error toast wiring
  distinguishes a real failure from a no-op.
- **`date` is `getTodayString(profile?.timezone)`** computed once in `Today.jsx:55`
  on render, passed down as `today` prop — same "date never advances at local
  midnight while the tab stays open" pattern already flagged in `fuel/map.md`
  for `FoodTracker.jsx:202`. A session left open across midnight keeps adding/
  toggling/seeding todos against the stale date; a todo added right after
  midnight (session left open) lands on yesterday's date with no indicator.
- **Add: empty/whitespace guarded (`newText.trim()`) but no max length** — a
  todo `text` is free-form `TEXT` with no length constraint client or DB side;
  a huge paste is accepted and rendered inline (no truncation in the row,
  `:198`), which can push the row height arbitrarily tall.
- **AI-seed writes `domain` from brief content but manual add never sets `domain`**
  (`:104-110` insert omits `domain` — column is nullable, `todos_domain_check`
  CHECK only applies to non-null values, so this is NOT a bug, just means manual
  todos never show the `Bot`/domain-hue glyph, which is correct/intentional).

## Coach (`/coach`, `Coach.jsx`) — form-review upload, not daily-use

Usage: `form_reviews` 1 total / 0 last 90d — essentially unused (contrast todos'
324/90d). Upload video → `analyze-form` edge fn → `form_reviews` insert (via the
edge fn, not visible client-side other than the refetch at `:100`).

- **Upload → analyze is two network calls with no rollback (`:86-96`)**: storage
  upload succeeds, then the edge-fn call can fail (network, timeout, Gemini
  error) — the orphaned video blob in the `physique` bucket is never cleaned up
  since there's no `catch` that deletes the uploaded path. Low-severity (storage
  cost only, not user-visible), but repeated failed attempts accumulate orphans.
- **50MB clip cap enforced client-side only (`:23-24`, `:63-66`)** — a
  crafted/modified request could bypass it; low risk given this is a personal
  single-athlete app, not flagged as a case.
- **`reopenReview` (`:110-115`)**: sets `setOpenReview({ review, url: null })`
  immediately (shows loading spinner) then re-sets with signed URL — no
  try/catch around `createSignedUrl`; if it errors, `s` is undefined,
  `s?.signedUrl` becomes `undefined`, dialog is stuck on "Loading clip…"
  forever with no error message.
- Past-reviews list capped `.limit(30)` (`:50`) — fine at current usage (1 row).

## Mind (`/mind`, `Mind.jsx`, 4 sub-tabs) — Capture / Reading / Study / Skills

Usage grounding: `reading_log` 0/0, `study_log` 0/0 (last90d null), `skills` 0/0,
`capture_inbox` 8 total / 0 last 90d. **All of Mind is effectively unused** —
lowest-usage area in this whole audit group; todos (on Today, not Mind) is
what's actually driving "2nd most used table," not this page.

| Tab | Mutations | Tables | Guard notes |
|---|---|---|---|
| Capture | `captureMutation` (`QuickCapture.jsx:37-46`) | `CaptureInbox.create` | Cmd/Ctrl+Enter submit (`:56-59`), button disabled while pending |
| Reading | save/updateStatus/del (`Mind.jsx:118-166`) | `reading_log` CRUD | delete uses `ConfirmDialog` (`:234-242`); save disabled on `!title.trim() \|\| isPending` |
| Study | save/del (`:382-402`) | `study_log` CRUD | delete uses `ConfirmDialog` (`:484-491`); no edit path, only add+delete |
| Skills | save/practiced/updateLevel/del (`:516-553`) | `skills` CRUD | delete uses `ConfirmDialog` (`:643-650`); `updateLevel`/`practiced` have **no onError toast** (`:539-545`, `:530-536` has one, `:539` updateLevel doesn't) |

### Risky code paths (Mind)

- **`updateLevel` mutation has no `onError` (`Mind.jsx:539-545`)** — a failed
  level-dot tap silently does nothing, no toast, dot doesn't visually update
  since it reads from server state via `qc.invalidateQueries` which won't fire
  on error either. Contrast `practiced` mutation right above it, which does
  have `onError: () => toast.error(...)`.
- **`reading_log` rating CHECK constraint (1-5) vs `form.rating` default 0**
  (comment at `Mind.jsx:122-124` shows this was already fixed: `rating: form.rating || null`
  converts 0→null before insert) — confirms this was a known prior bug, now
  correctly guarded. Verify it stays guarded (regression risk if the form
  default ever changes).
- **`StudyTab` duration_min**: `parseInt(form.duration_min)` (`:384`) with no
  `isNaN` guard before insert — an empty/non-numeric string parses to `NaN`,
  which Postgres `integer` column would reject with a DB-level error (caught by
  `onError` → toast "Failed to save", so not silent, but the Save button's
  disable condition `!form.duration_min` (`:428`) only checks truthiness/empty
  string, not numeric validity — typing "abc" into a `type="number"` field is
  usually browser-blocked, low risk).
- **Skills level dots**: `updateLevel.mutate({ id, level: n })` fires on every
  tap with no debounce/isPending guard on the dot buttons (`:598-605`) — rapid
  taps across 1→5 fire 5 concurrent updates; last-write-wins is fine functionally
  but could show flicker/out-of-order settling.

## Athlete State (`/athlete-state`, `AthleteState.jsx`, 1138 lines) — read-only dashboard

No `useMutation`/`insert`/`update`/`delete` calls in `AthleteState.jsx` itself
(grepped, zero hits) — it's a pure read surface over `engine_params` (108/—),
`training_prescription` (107/—), `weekly_plans`, `controlled_tests`. The one
embedded interactive child is `PSTTracker.jsx` (`pst_tests` table, 1/0 —
unused).

- **PSTTracker save (`PSTTracker.jsx:171-191`)**: `upsert(row, { onConflict:
  "created_by,test_date" })` — idempotent by design (same-day re-log overwrites
  cleanly, no duplicate-row risk unlike fuel's delete-then-recreate pattern).
- **Gate on empty submit (`:206-211`)**: `hasAnyScore` correctly excludes bare
  date-only submits from writing an all-null row — a deliberate fix already in
  place (comment references "pst-test-logger-2").
- **`TimeField` clamp (`:100-160`)**: clamps to `max` on change AND blur,
  shows an inline "Max N" hint — no bug found, this is a solid pattern.
- No delete path for a logged PST test anywhere in the file — a bad entry (e.g.
  fat-fingered digits) can only be overwritten by re-logging the SAME date, not
  removed if the date itself was wrong.
- `AdaptiveEnginePanel` and `WeeklyPlanPanel` (`:42-260`+) are read-only
  displays of engine internals; no risky path, but several divide-by-target
  displays (`vdot`, `confidence * 100`) have no visible guard against
  engine-written NaN/Infinity beyond the `!= null` checks already shown —
  matches the "bad engine output" judge category if the engine ever writes
  a non-finite number, worth one probe case.

## Brief History (`/brief-history`, `BriefHistory.jsx`) — read-only list

`daily_briefs` 94 total, capped `.limit(30)` (`BRIEF_PAGE_SIZE`, `:16`, `:165`).
No mutations — pure read + client-side pagination (`visibleCount`, `PAGE_SIZE=7`,
`:151-155`, `:265`). Low risk area:

- **Count label already fixed** (comment `:230-235`): correctly distinguishes
  "last 30 briefs" (page cap) from "N briefs on file" (true count < page size) —
  a prior bug, now guarded. No live issue.
- **`differenceInCalendarDays(new Date(), parseISO(brief.date))` (`:42`)** — uses
  the browser's local "now", not `profile.timezone`; a brief dated near a
  timezone boundary could land in the wrong "This week"/"Earlier" bucket for an
  athlete traveling across zones. Cosmetic only (grouping label), not data loss.
- Retry button on error (`:205`) present and wired.

## UX candidates (this area group)

- **Todos have no history/management view** — 562 total rows, only the CURRENT
  day's are ever visible or editable. A todo added yesterday and left
  incomplete simply vanishes from view (still in the DB, `date` stuck on
  yesterday) with no "yesterday's leftover" surfacing, no way to bump it to
  today. Given todos is the 2nd-most-used table in the whole app, this is a
  meaningful buried/absent feature, not just a nice-to-have.
- **Coach and Mind are both near-zero usage** relative to their prominence in
  the nav (Coach: 1 form_review ever; Mind's four tables: 0 real rows across
  reading_log/study_log/skills, 8 capture_inbox rows all >90d old). Consider
  whether either belongs behind a "more" affordance rather than top-level nav
  real estate, or whether they're simply unfinished/abandoned features Nolan
  should be asked about directly (out of scope to change without his call).
