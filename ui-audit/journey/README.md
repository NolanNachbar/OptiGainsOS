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

Day boundaries: backdate the rows in the DB (delete + reinsert with the same
id; the BEFORE UPDATE trigger re-stamps updated_at). Don't move the browser
clock: Supabase auth then refresh-loops into a 429.

## Journeys still to cover

- Food logged after local midnight lands on the new day on Today and Fuel.
- Weigh-in from Today updates the Body trend and the Today weight module.
- Two sessions in one day (twice-a-day prescription): both logged, neither
  swallowed by the duplicate guard.
- Offline set logging → reconnect → nothing lost.
