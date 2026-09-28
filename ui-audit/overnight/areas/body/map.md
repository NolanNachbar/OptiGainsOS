# Body map — round 1

Entry points: bottom nav → **Fuel** → "Body" sub-tab (`/fuel?tab=body`,
`Fuel.jsx:31-33,73-79`) renders `Progress.jsx` (weight/measurements/photos-link/
metabolism); "Hydration" sub-tab (`/fuel?tab=hydration`, `Fuel.jsx:80-84`) renders
`Supplements.jsx embedded` (water + supplement stack). Standalone routes
`/physique` (`PhysiqueTracker.jsx`) and `/recovery` (`RecoveryDetail.jsx`,
**read-only**, no mutations at all — confirmed by grep, no `mutate`/`insert(`/
`supabase.from(...).update|delete` anywhere in the file). A legacy `?tab=wellness`
alias 301s to `?tab=body` (`Fuel.jsx:15-19`).

Usage grounding (`usage.json`): `body_weight_entries` 49/24, `physique_entries`
39/21, `recovery_metrics` 129/89 (**Nolan's most-used body-area table**, but it's
synced from Garmin/Apple Health, not hand-entered — no UI mutation path found),
`daily_readiness` (not in usage.json by that name but written by MorningCheckin,
see below), `soreness_logs` 13/7, `water_logs` 2/2 (barely used), `supplement_logs`
1/1, `supplement_types` 1/0, `measurements` 0/0 (**never used**).

## Weight tab (`Progress.jsx` `WeightTab`, default Body sub-tab view)

| Control | Label | File:line | Mutation |
|---|---|---|---|
| Date input | "Date" | `Progress.jsx:93` | — |
| Weight input | "Weight (lbs/kg)" | `:97` | — |
| Notes input | "Notes (optional)" | `:102` | — |
| Log button | "Log" | `:104`, disabled `!weight \|\| add.isPending` | `useLogWeight()` → `body_weight_entries` create/update |
| Delete (per row) | `aria-label="Delete entry"` (X icon) | `:134` | `db.entities.BodyWeightEntry.delete(id)` — **behind `ConfirmDialog`** (`:155-163`, "Delete weight entry?") |

**Shared write path, 7 call sites.** `useLogWeight()` (`src/hooks/useWeighIn.js:95-135`)
is called from **Progress.jsx:40**, `WeighInModal.jsx:22`, `WeighInPrompt.jsx:48`
(dashboard prompt + pre-session sheet gate), `MorningCheckin.jsx:101,178`, `ProgressContent.jsx:40`,
`StatsSetupModal.jsx:28`, `Profile.jsx:237`. Every one of these can be the entry
point for "log today's weight."

**Race condition (real, code-acknowledged): duplicate same-day weigh-ins.**
`body_weight_entries` has **no unique constraint** on `(created_by, recorded_date)`
(confirmed in `supabase/migrations/00000000000000_remote_schema.sql:210-220` — only
a bare `id` pkey). `useLogWeight` (`useWeighIn.js:105-121`) does client-side
select-then-branch, not a DB upsert:
```
const existing = await db.entities.BodyWeightEntry.filter({ created_by, recorded_date: dateStr });
... existing?.length ? BodyWeightEntry.update(existing[0].id, patch) : BodyWeightEntry.create(...)
```
The code comment at `useWeighIn.js:99-104` explicitly says this exists *because*
there's no unique constraint, and that duplicate same-day rows "would skew the
engine's weight trend / adaptive TDEE" — i.e. the author already knows this is the
failure mode, just not the concurrent-tab case. `WeighInPrompt.jsx:64-67` even
has a comment acknowledging the **sequential** stale-query version of this ("a
second reading typed here silently replaces the real one") and works around it by
showing "Already logged today" once the query resolves — but nothing guards two
**near-simultaneous** submits from two different weigh-in surfaces (e.g.
MorningCheckin's inline weight field firing at the same moment as the Progress
page's Log button, or two browser tabs), which both read zero existing rows and
both `create`, producing two rows for one date.
`WeighInPrompt` submit button (`WeighInPrompt.jsx:200-206`) does have
`disabled={logWeight.isPending}`, but that only guards repeat taps on the *same*
component instance, not two different call sites racing.

**Weight bounds validation exists on the dashboard prompt, not on Progress.**
`WeighInPrompt.jsx:14,96-100`: `BOUNDS = { lbs: [50,700], kg: [25,320] }`, rejects
(doesn't clamp) out-of-range values with a message showing the parsed number back.
Progress.jsx's own weight input (`:97`) has **no min/max at all** — `type="number"
step="0.1"`, so a typo like `1710` lbs saves silently with no bounds check, unlike
the dashboard's own weigh-in gate.

**Timezone:** `date` initializes from `getTodayString()` (no timezone arg) at
`Progress.jsx:35`; `recorded_date` is a plain DATE column so there's no UTC/local
ambiguity once written, but "today" as computed by the browser's local clock can
disagree with `profile.timezone` (contrast with Hydration below, which is
timezone-aware).

## Measurements tab (`Progress.jsx` `MeasurementsTab`, `:191-348`)

| Control | Label | File:line | Mutation |
|---|---|---|---|
| Date input | (no label, date picker) | `:242` | — |
| 8 measurement fields | "Chest","Waist","Hips","L Arm","R Arm","L Quad","R Quad","Neck" | `:245-256` | — |
| Notes | "Notes (optional)" | `:261` | — |
| Save button | "Save Entry" | `:263`, disabled `!hasData \|\| save.isPending` | `supabase.from("measurements").insert(payload)` |
| Delete (per row) | `aria-label="Delete measurement"` (Trash2 icon) | `:325` | `supabase.from("measurements").delete()` — **behind `ConfirmDialog`** (`:337-345`) |

**Different mutation shape than Weight: pure append, no upsert-by-date.**
`save` (`:209-222`) always `insert()`s a **new** row — there is no `existing`
lookup like `useLogWeight` has, and `measurements` carries no unique constraint
either (`remote_schema.sql:507-519`, bare `id` pkey). Logging measurements twice
on the same date (e.g. morning + evening, or two accidental taps of "Save Entry")
creates **two separate rows for the same date** rather than updating one — the
opposite behavior from the Weight tab for what looks like the same "log for
today" gesture. History query (`:202`) is `order("date", desc).limit(10)` with no
secondary sort key, so which of two same-date rows displays as "Latest"
(`:233`, `latest = history[0]`) is whatever order Postgres returns ties in —
not guaranteed to be the most recently saved one. `measurements` usage.json
shows **0 total / 0 last 90 days** — this whole tab has never been used.

## Photos tab (`Progress.jsx` `PhotosLink`, `:350-372`)

Pure link-out card to `/physique` (`:357`), no mutation. Explicit comment
(`:351-353`) that an old in-page uploader wrote to a dead `progress_photos` table
the Physique flow never reads — that duplicate uploader is gone, this is just a
nav card now.

## Metabolism tab (`Progress.jsx` `:374-452`, not in the runbook's named list but part of Body)

Read-only card, `supabase.from("athlete_state").select(...).eq("date", today)`
(`:380`). No mutation.

## Hydration sub-tab — Water (`Supplements.jsx` `WaterCard`, `:33-141`)

| Control | Label | File:line | Mutation |
|---|---|---|---|
| +100/+250/+500 ml buttons | "+100ml","+250ml","+500ml" (auto-formats to "1L" at ≥1000) | `:100-111`, disabled `addWater.isPending` | `water_logs` insert `{created_by, amount_ml}` |
| Delete (per row) | `aria-label="Delete water entry"` (X icon) | `:127-133` | `water_logs` delete — **no confirm dialog, no `isPending` guard on the button** |

Timezone-aware: `dayWindowUtc(today, profile?.timezone)` (`:39`) computes the
UTC window for the user's local day and both the read query (`:44-50`) and the
day label use it — this is the pattern Weight/Measurements above lack.
`WATER_GOAL_ML` is personalized off `profile.current_weight` (`:24-30`,
~35ml/kg) — if `current_weight` is null it silently falls back to 3000ml
(`DEFAULT_WATER_GOAL_ML`, `:21`) with no indication the goal is a generic
default rather than personalized.

## Hydration sub-tab — Supplements (`Supplements.jsx` `:186-494`)

| Control | Label | File:line | Mutation |
|---|---|---|---|
| Add Supplement | "Add Supplement" / empty-state "Add First Supplement" | `:315-317`, `:448-450` | dialog → `SupplementForm` |
| Save (in form) | "Save" | `:172-180`, disabled `!name.trim()` | `supplement_types` insert |
| Edit (pencil, per type) | `aria-label="Edit supplement"` | `:354-360` | `supplement_types` update |
| Delete (trash, per type) | `aria-label="Delete supplement"` | `:361-367` | `supplement_types` delete — **behind `ConfirmDialog`** (`:466-475`, "Delete supplement?", shows `loading={deleteType.isPending}`) |
| Log / Log Again (per type) | "Log" / "Log Again" (conditional, `:385`) | `:378-386`, disabled `logSupp.isPending` | `supplement_logs` insert `{supplement_type_id, supplement_name, dose, unit}` |
| Delete log (per entry) | `aria-label="Delete supplement log"` (X icon) | `:413-419` | `supplement_logs` delete — **no confirm dialog, no `isPending` guard** |

Dose field (`:371-376`) has no min/max; typed dose falls back to
`type.default_dose` if blank (`:270`: `parseFloat(dose) || type.default_dose`) —
note `parseFloat(dose) || ...` means a typed **0** also falls back to the
default rather than logging 0, which is probably unintended (0 is a falsy
number). "Log Again" is intentional (design allows multiple doses/day), so
duplicate supplement_logs rows for one day are correct behavior, not a bug.
Timezone-aware via `dayWindowUtc` same as Water (`:191-192`).

## `/physique` — PhysiqueTracker.jsx (895 lines)

**Upload/analyze flow** (`:163-267`): tap a pose chip or "Guided session"
(`:359-361`, walks all 7 poses in order) → hidden file input (`:315-316`,
`accept="image/*,video/*"`, `multiple`) → review sheet stages one shot at a time
from a queue (`:136-141`) → **"Analyze" button** (`:867`, `disabled={busy}`) →
`supabase.storage.from("physique").upload(path, file, {upsert:true})` (`:222-223`)
then `supabase.functions.invoke("analyze-physique", {...})` (`:227-232`, edge fn
presumably inserts the `physique_entries` row — not visible client-side).
No confirm step before "Analyze" beyond the preview itself.

**Groq rate limit (8000 TPM shared across the whole account) is a real,
documented collision risk for parallel testing.** Comment at `:31-37`: one
analysis call burns ~5800 TPM, so two uploads back-to-back trip Groq's 429; the
edge function forwards it as a 502, and `invokeAnalyzePhysique` (`:39-60`)
retries up to `RATE_LIMIT_MAX_RETRIES=3` with the wait time Groq reports. If a
body-area attacker uploads a physique photo at the same time as any other
overnight agent doing physique/food-photo AI analysis on the shared test
account, both calls compete for the same 8000 TPM budget — **this must be
serialized against any other AI-vision case running in parallel** (fuel's AI
photo meal estimator also calls a vision model and could collide).

**No delete UI for physique entries at all.** Grepped the whole file — only
`updatePoseMutation` (`:90-103`, "Fix pose" dialog, `:800-819`) mutates an
existing row (pose field only). A wrong/duplicate/embarrassing upload has no
in-app way to remove it — an athlete's only recourse is manual DB deletion.
Worth a wish-list entry, not necessarily a bug to fix tonight.

**`taken_at` uses raw local date, not `profile.timezone`.**
`taken_at: format(new Date(), "yyyy-MM-dd")` (`:230`) — deliberate per the
comment at `:228-229` (keeps one evening's shots on one day rather than
splitting across a UTC boundary), but it's the device clock's local date, not
`profile.timezone` like Supplements/WeeklyPlanCard use elsewhere in the app.
Consistent with Weight/Measurements tabs' same gap, inconsistent with Hydration.

**Session-average BF is date-keyed, not upload-batch-keyed.** `sessions`
(`:273-289`) groups `physique_entries` by `taken_at` and averages
`bodyfat_estimate` across every entry sharing that date — so a second,
unrelated photo uploaded later the same calendar day (e.g. a random progress
photo taken at night after a morning check-in session) gets folded into the
same "session" average, silently shifting the headline BF% number.

**Photos never delete their storage objects either** — upload path is
`${user.id}/${now}_${i}.${ext}` (`:185`), `upsert:true` only protects a *retry*
of the same stable path within one staged item; there's no cleanup path at all
since there's no delete UI.

## `/recovery` — RecoveryDetail.jsx (599 lines)

**Read-only.** No `mutate`, `insert(`, `.update(`, or `.delete(` anywhere in the
file (confirmed by grep). Renders `recovery_metrics` (via `useRecoveryMetrics`
hook, Garmin/Apple Health sync only — no manual-entry path exists anywhere in
the app for this table despite it being the single most-used body-area table by
row count), `athlete_state`, and `training_prescription` (read-only). The one
button that reaches toward data entry, "Sync wearable"-style (`goToSync`,
`:333`), just navigates to `/profile` — no mutation happens in this component.
**Nothing to attack here for round 1**; it's pure presentation of data written
elsewhere.

## `daily_readiness` + `soreness_logs` — written outside these 4 screens, worth covering anyway

Not reachable from `/fuel?tab=body`, `/physique`, or `/recovery` directly, but
these are the two body-adjacent tables with real write paths and they're the
kind of "most-used" surface the runbook wants covered — **`MorningCheckin.jsx`**
(dashboard component, shown pre-session) is the only place that writes them:

- `daily_readiness` **upsert** on `onConflict: "created_by,date"`
  (`MorningCheckin.jsx:126-137`) — a real DB-level upsert, not the client
  select-then-branch pattern Weight uses, so no duplicate-row race here.
  CHECK constraints: `energy` 1-10, `mood` 1-10 (not directly relevant since the
  UI only offers in-range values); `soreness_snapshot` is a jsonb blob, not the
  legacy integer `soreness` column (which this write path never touches).
- `soreness_logs` **upsert** on `onConflict: "created_by,date,muscle_group"`
  (`:158-163`), rows only for groups with `soreness[g] > 0` (`:149-150`). Region
  labels expand to the engine's muscle vocabulary (`REGION_TO_MUSCLES`, `:143-148`)
  before writing — e.g. UI group "Arms" writes two rows (`biceps`,`triceps`).
  `level` CHECK is 0-3 in the DB; UI cycles 0-3 via `(prev[group]+1)%4` (`:118`) so
  can't produce an out-of-range value from this screen.
- Weight write (`:165-183`) is folded into the same check-in mutation and
  **deliberately swallows its own failure** — if `logWeight.mutateAsync` throws,
  the function still returns `{weightFailed:true}` rather than rejecting, so the
  already-committed readiness/soreness upserts are never reported as failed
  (`onSuccess` shows `"Check-in saved, weight didn't log"` vs a hard error). This
  is intentional per the code comment (`:165-167`) but means "check-in complete"
  and "weight actually saved" are two different truths the UI has to get right —
  a case worth verifying labels-match-reality on.

## No-confirm / no-undo inventory (body area)

- Water log delete (`Supplements.jsx:127-133`) — no confirm, no isPending guard.
- Supplement log delete (`Supplements.jsx:413-419`) — no confirm, no isPending guard.
- By contrast: weight entry delete, measurement delete, and supplement **type**
  delete all go through `ConfirmDialog`. The inconsistency mirrors fuel's
  food-entry-delete finding from round 1 — the append-only daily logs (water,
  supplement doses, and fuel's food entries) are the ones missing the safety net;
  the "configuration" records (measurements, weight, supplement types) all have it.
- Physique entries: no delete path exists at all (see above) — not a "missing
  confirm", a missing feature entirely.

## UX candidates

- Water/supplement log delete should get the same `ConfirmDialog` (or an undo
  toast) that weight/measurement/supplement-type delete already have — same
  gap pattern flagged in fuel's food-entry delete.
- Weight tab has no bounds check on the input itself, even though the exact
  same "reading = typo" guard already exists and is well-designed one component
  away (`WeighInPrompt.jsx` `BOUNDS`) — reuse it in Progress.jsx's Weight tab.
- Measurements tab logs a brand-new row per save instead of upserting like
  Weight does, and the tab has literally never been used (0/0). Worth asking
  whether it needs the same upsert-by-date fix as weight, or whether the
  append-many-per-day model is intentional (e.g. AM/PM measurements) and it's
  simply undiscovered.
- No manual entry path anywhere for `recovery_metrics` (the most-used
  body-area table, all Garmin/Apple Health sync) — not necessarily a bug, but
  worth flagging since RecoveryDetail is pure read and has no "log manually"
  fallback if a sync gap happens.
- Physique entries have no delete — flag as a wish, not a round-1 fix (would
  need to also clean up the storage object and re-run the session-average math).
