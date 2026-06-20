# Spec: Exercise set types (beyond straight sets)

## Problem
Logging assumes every set is `weight × reps`. Real training has more: timed holds
(planks, dead hangs, L-sits), carries, and grip-dependent work (hook grip, straps,
false grip). A barbell hold is `time + weight + grip`, not reps. Today there is no
way to log these faithfully.

## Model
Add a `type` discriminator to each set object (today: `{set_number, weight, reps,
rir, completed, set_type}` where `set_type` is working/daily_min). Introduce a new
field `kind` so we don't overload the existing `set_type`:

```
kind: "straight" | "timed" | "hold" | "carry"   // default "straight"
```

Per-kind fields (additive; unused fields stay null so old rows are valid):
- straight  → weight, reps                          (today's behavior)
- timed     → reps over a target time (e.g. AMRAP 60s) → weight, reps, duration_s
- hold      → weight, duration_s, grip              (no reps)
- carry     → weight, distance_m OR duration_s, grip

```
grip: "standard" | "hook" | "straps" | "mixed" | "false" | "pronated" | "supinated" | null
```

Back-compat: every existing set has no `kind` → treated as `straight`. No migration
of historical rows required; the renderer defaults `kind ?? "straight"`.

## Where kind comes from
The exercise catalog should carry a default kind. This is where the **free exercise
DB** (below) pays off: `category`/`mechanic` maps to a default kind
(`category: "static"`/name matches `plank|hold|hang|carry|l-sit` → `hold`/`carry`),
so adding "Plank" auto-logs as a hold without the user configuring it. User can
override per-set.

## UI (ExerciseCard)
- The set-row grid is kind-aware. straight keeps `LOAD | REPS`. hold swaps the REPS
  column for `TIME` (mm:ss stepper) and adds a compact grip chip. carry shows
  `DIST | TIME`.
- A small kind toggle in the exercise header (or via the existing "Replace/Edit"
  menu) sets the kind for the whole exercise; per-set override is rare, keep it out
  of the hot path.
- The "last time" prefill (just shipped) already generalizes: copy last weight +
  (reps | duration_s) for the kind.

## Engine impact
The volume allocator counts hard sets; timed/hold sets count as sets (1 hold = 1
set) for volume, but should NOT feed e1RM/strength estimators (no reps → no Epley).
Guard `getExercisePR`/`scaleWeightToReps` to skip non-`straight` kinds (they already
need `reps`, so a null-reps guard is enough).

## Scope / sequencing
1. Schema: sets gain `kind`, `duration_s`, `distance_m`, `grip` (jsonb columns
   already store sets as an array, so this is a shape change, no DDL — just write
   the new fields). Default-render `kind ?? "straight"`.
2. ExerciseCard kind-aware row + header toggle.
3. Catalog default-kind mapping (depends on the free-exercise-db adoption).
4. Engine guards (skip e1RM for non-straight).

Ship 1+2 first (covers manual logging of holds); 3+4 follow with the catalog work.
```
