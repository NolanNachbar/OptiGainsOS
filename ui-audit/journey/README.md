# Journey harness

Why this exists: on 2026-09-30 Nolan found that today's workout wasn't on
Today, so he started from Train, never got the weigh-in prompt, and lost
weigh-ins. The cause was an unfinished session from the night before. The
visual probe and the single-screen e2e specs couldn't see it. smoke.py's live
"stranded sessions" check was already failing and nobody acted on it.

Rule: correctness and data loss come before visuals. A failing invariant
blocks a push the same way a failing e2e does.

## Every loop round, and before every push

1. `npm run gate`: build:pages, smoke.py pure tier, full e2e (including the
   journey specs below).
2. Run `invariants.sql` through the Supabase MCP `execute_sql` (read-only, on
   Nolan's real account; never the .env service key). Any `ok = false`:
   - caused by code → P0, fix before anything else ships;
   - real-world state the app should have prevented (missed weigh-ins,
     unfinished sessions) → find the code path that let it happen, and fix
     that, not just the data;
   - needs his decision (old sessions to Log/Discard) → tell him.
   Never edit his programming (program_workouts, enrollments, generator runs)
   to make a check pass.
3. Only then the visual probe and design passes.

## Journey specs (e2e/journey-*.spec.mjs)

Each one follows his real daily loop across screens and days, not one screen:

- `journey-next-day`: start a workout, log a set, no Finish → next day, open
  the app → logged under yesterday at last change + 3h, no banner, no review
  card → start the next workout from Train → weigh-in prompt. Verified to fail
  on the pre-fix 24h-cap sweep.
- `journey-finish-next-split-day`: seeded 3-day program, Today → Start (program
  card) → check-in sheet weigh-in → log a set → Finish → enrollment records
  cycle 1 / day 1, Today reads "Logged today" → next day (enrollment start, log
  and weigh-in moved back one day) → Today shows day 2, not day 1, and Start
  opens day 2's program logger. The app advances by schedule date, not by
  completion. Verified to fail when Today's lookup is pinned to day 1.
- `journey-food-after-midnight`: browser context in a timezone whose local date
  differs from the UTC date right now (picked at runtime; no clock moves) → log
  a food through the Fuel UI → row's `date` is the local date, Fuel's current day
  lists it, Today's Kcal consumed rises by the same amount. Verified to fail
  when FoodTracker derives its day from `toISOString()`.
- `journey-weighin-updates-body`: Today → Body (primes its cache) → back →
  weigh in from Today's weight row → `body_weight_entries` row (local today,
  typed value) and profile `current_weight` follow, Today's trend number moves
  and the row reads "Logged today", Body's history (Fuel → Body, not
  /athlete-state, whose weight trend is server-computed) lists it, all without
  a reload. Verified to fail when `useLogWeight` skips `invalidateBodyWeight`.
- `journey-program-start-local-date`: browser context in a timezone whose local
  date differs from the UTC date right now (runtime pick, no clock moves; the
  test profile's timezone is aligned to it for the run and restored) →
  Start Program from the real program page → `program_enrollments.started_at`
  is the local date, and Today shows Day 1. Verified to fail when the enroll
  default / hook stamp the date with `toISOString()`.

Day boundaries: backdate the rows in the DB (delete + reinsert with the same
id; the BEFORE UPDATE trigger re-stamps updated_at). Don't move the browser
clock: Supabase auth then refresh-loops into a 429.

## Journeys still to cover

- Two sessions in one day (twice-a-day prescription): both logged, neither
  swallowed by the duplicate guard.
- Offline set logging → reconnect → nothing lost.
