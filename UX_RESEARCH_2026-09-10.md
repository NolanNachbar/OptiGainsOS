# UX research, second pass

2026-09-10

Redone from scratch. The spine of this document is what I can prove from your
own install: your code, your Supabase rows, your logged sets. External review
mining sits underneath the findings as corroboration, never as the source of
one. Where a generic complaint from the corpus does not reproduce against your
code, it is not in here.

External corpus: 642 reviews and threads across 9 lifting apps (Strong, Hevy,
Jefit, Fitbod, Boostcamp, FitNotes, Progression, wger, Liftosaur), pulled from
the App Store RSS endpoints, HN Algolia, and public issue trackers.

The "hundred million dollar app" bar is read here as a quality bar, not a
business one. Nothing below is about acquisition, sharing, streaks, or
monetization. It is about input latency, thumb reach mid-set, and never losing
a number you already typed.

---

## 1. A failed write during a workout is silent, and the loss window is reopening the app

This is the largest one and it is fully traceable.

Every link in the chain, in order:

- `/home/nolan/projects/OptiGains/public/sw.js:31` returns immediately on any
  non-GET request, and `:35` returns on any hostname containing `supabase.co`.
  Every write in the app therefore goes straight to the network with no service
  worker involvement at all.
- There is no offline queue anywhere in `/home/nolan/projects/OptiGains/src/`.
  No `persistQueryClient`, no `onlineManager`, no `navigator.onLine`.
- `/home/nolan/projects/OptiGains/src/App.jsx:58` is a bare `new QueryClient()`.
  React Query v5 retries queries three times by default and mutations zero
  times.
- `/home/nolan/projects/OptiGains/src/hooks/useWorkoutSession.js:127-159`,
  `saveProgress`, is fire and forget. The failure branch is `console.error`.

So on gym wifi, a dropped write produces no toast, no retry, no queue, and no
mark on the screen.

### The precise mechanism, which is narrower than it first looks

`lastSavedRef.current` is assigned *before* the Supabase call is issued. A
failed write is therefore never retried. What saves you most of the time is that
the next autosave carries a superset of the same payload: log one more set, the
fingerprint changes, the write goes out again and carries the set that was lost
along with it. Mid-workout drops heal themselves for free.

The tail does not heal. The last run of failed writes before you stop logging
has nothing behind it to carry it.

### What the tail actually costs, by path

Three paths read that session row, and they do not cost the same thing:

| Path | Cost of a dropped tail write |
|---|---|
| Finish the workout in place | Nothing |
| Close the app, come back, resume | The tail sets are gone |
| Stale-session auto-finish | The tail sets are gone, and it fires sooner |

Finishing in place is safe because
`/home/nolan/projects/OptiGains/src/pages/WorkoutDetail.jsx:831` sends
`exercises: exerciseLogs`, which is live React state. Even if every single
autosave failed, the Finish button writes a complete `workout_logs` row.

Resuming is not safe, because both restore call sites hydrate the UI from the
row: `WorkoutDetail.jsx:334` and `:1039` are each
`setExerciseLogs(session.exercises || [])`.

Auto-finish is not safe for the same reason, and it has a second-order problem.
`updated_at` on `workout_sessions` advances via a BEFORE UPDATE trigger
(`/home/nolan/projects/OptiGains/supabase/migrations/20260909000000_workout_sessions_updated_at.sql`).
A write that never lands never advances the clock. A session whose tail writes
failed therefore reads as stale *earlier* than it truly is, so the three-hour
auto-finisher can fire on exactly the row that is missing sets.

### Corroboration

The single closest match in 642 reviews, verbatim:

> I have had repeated issues with syncing. My gym has poor WiFi. When I am
> finished the workout it is supposed to sync. That fails.

Sync and data loss is the fourth largest complaint cluster in the corpus, 58 of
642. It ranks lower than it matters, because most apps lose a set and you notice;
here you would not.

### Fix

1. Mirror `exerciseLogs` to `localStorage` on every set completion, and prefer
   it over the row on restore when it is newer. This is the only fix on this
   list that closes the loss window, and it does not need a service worker or a
   network. You already keep an active-workout flag in `localStorage`
   (`/home/nolan/projects/OptiGains/src/lib/workoutSessionFlag.js:52`), so the storage pattern and its
   try/catch discipline are established; this extends it to carry the sets.
2. Surface the failure. A persistent, non-blocking "not saved" marker in
   `WorkoutLoggingHeader` beats a toast, because it stays true until it is not.
   Right now a dropped write is visible only in a console you are not reading
   at the squat rack.
3. Move the `lastSavedRef.current` assignment into the success branch. Worth
   doing, but be clear about what it buys: **not** the tail. The autosave
   effect is keyed on `[exerciseLogs, preWorkoutNotes]`
   (`/home/nolan/projects/OptiGains/src/pages/WorkoutDetail.jsx:373`), so when the last write of a workout
   fails and you stop logging, there is no next fire to carry the payload. It
   only helps the narrow case where state returns to a fingerprint that already
   failed once (complete a set, the write drops, un-complete it, re-complete
   it) and the echo guard currently skips the retry.

### It opens in a dead-signal gym; it just cannot save there

The loudest version of this in the corpus is a Jefit one-star: "The app now
reloads every time I try to open it, requiring an internet connection... My gym
doesn't have service in it, meaning I can only use the app in airplane mode."
Half of that does not reproduce here. `APP_SHELL` is precached at install
(`/home/nolan/projects/OptiGains/public/sw.js:11-18`) and navigations fall back to that cache, so OptiGains
cold-opens with no signal where Jefit does not.

The other half reproduces exactly. `sw.js:35` passes every `supabase.co`
request straight through to the network, and nothing in `src/` queues a write
for later. So in a basement gym the app opens, looks correct, accepts every set
you log, and lands none of them.

---

## 2. The rest-over notification cannot fire unless you are already looking at the screen

The timer math is correct, and worth saying so first.
`/home/nolan/projects/OptiGains/src/pages/WorkoutDetail.jsx:692-703` recomputes
from an absolute end timestamp (`restTimerEndRef.current - Date.now()`), so the
countdown is accurate across a backgrounded tab. That is better than several of
the apps in the corpus.

The delivery is what breaks. `:699` calls `showLocalNotification` from inside a
page `setInterval`. Browsers throttle and eventually suspend page timers in
backgrounded tabs. Lock the phone, or switch to Spotify between sets, and the
interval stops ticking, so nothing ever asks for the notification. It fires when
you return to the app, which is the one moment you did not need it.

The capability is already installed and unused:

- `/home/nolan/projects/OptiGains/public/sw.js:83` has a working `push` handler
  and `:98` calls `self.registration.showNotification`.
- `push_subscriptions` has one registered row, yours.
- Nothing in `/home/nolan/projects/OptiGains/src/` or
  `/home/nolan/projects/OptiGains/scripts/` ever sends a push. The table is
  written at `usePushNotifications.js:50`, deleted at `:75`, and touched
  nowhere else.

### Corroboration

Rest timers were the single largest complaint category in the corpus: 114 of 642
reviews. The dominant sub-complaint is not timer accuracy, it is that the alert
does not arrive when the phone is in your pocket, which is the only place a phone
is between sets.

### Fix

Schedule the notification at rest *start* rather than firing it at rest end.
Either hand the service worker the end timestamp and let it own the alert, or
use the Notification `showTrigger` path where available. Keep the existing page
timer for the visible countdown.

---

## 3. The weight and reps fields cannot be cleared

`/home/nolan/projects/OptiGains/src/components/workouts/ExerciseCard.jsx`:

- `:601` weight: `onUpdateSet(..., 'weight', parseFloat(e.target.value) || 0)`
- `:620` reps: `onUpdateSet(..., isHold ? 'duration_s' : 'reps', parseInt(e.target.value) || 0)`

`|| 0` maps every falsy parse to zero, including the `NaN` you get from an empty
string. Backspace a weight to empty and the field stores `0`. Then `:599`
renders it back as `value={set.weight || ""}`, which displays `0` as blank. The
field looks cleared and is not. Complete the set and you have written a real
zero-weight set into your training history.

The fix already exists three lines below it. The RIR input at `:628-639` does it
correctly:

```js
const val = e.target.value;
const rir = val === "" ? null : parseFloat(val);
```

Make the two neighbours match that one.

Also at `:598-626`: both inputs carry `min="0"` and neither carries a `max`. A
fat-fingered `2255` is accepted and stored. A `max` of something like 1500 on
weight and 200 on reps costs nothing and catches the typo at the point of entry.

Not claiming: whether `type="number"` rejects an intermediate `2.5` on your
phone. That depends on browser sanitization I cannot verify from here, and
`step="2.5"` suggests you have been entering those fine. Worth ten seconds of
checking on the actual device rather than treating as a finding.

### Corroboration

The clearest external match is the wger decimal bug, verbatim:

> please enter a valid value. The two nearest valid values are 1 and 2.

Input friction is a small cluster in the corpus, 19 of 642, and I am including
this finding on the strength of your code rather than on that number.

---

## 4. A wrong number in a finished workout can only be fixed by deleting the workout

The second largest complaint cluster in the whole corpus is editing and fixing,
105 of 642: cannot correct a set after logging, cannot undo, cannot edit notes
later. Half of it does not reproduce here and half of it reproduces exactly.

Mid-workout, you are fine. Completed sets stay editable. Nothing in
`/home/nolan/projects/OptiGains/src/components/workouts/ExerciseCard.jsx`
disables the weight or reps inputs once a set is marked done, and `:648-649`
gives the checkbox an explicit `aria-label` of "Mark set N incomplete", so you
can un-complete and re-enter. The loudest single complaint in the category, the
Hevy one about a mid-workout edit being silently discarded, does not apply.

After you hit Finish, there is no edit path at all. The only mutation the app
offers on a `workout_logs` row is delete:
`/home/nolan/projects/OptiGains/src/components/workouts/ProgressContent.jsx:55`,
surfaced as a `Trash2` icon at `:463-467`. There is no pencil anywhere. The only
other `WorkoutLog.update` in `src/` is
`/home/nolan/projects/OptiGains/src/pages/Workouts.jsx:134` setting
`workout_id: null`, which is internal cleanup.

So a single mistyped weight in a finished session leaves you two options: keep
the wrong number in your training history and let the engine learn from it, or
delete the entire workout and lose every correct set in it along with the
duration and the notes.

That compounds directly with finding 3. The `|| 0` handler writes a real
zero-weight set whenever you clear a field. The moment you press Finish, that
zero is only removable by deleting the whole workout.

Worth noting the contrast while you are in that file: `deleteLogMutation` at
`:53-64` has a proper `onError` that raises a toast. That is exactly the
treatment `saveProgress` does not get.

### Fix

An edit sheet on a past log is real work. The cheap version that removes most of
the pain is to make a finished workout re-openable into the same logging UI it
was created in, write back through the existing `WorkoutLog.update`, and leave
delete where it is.

---

## 5. Your stored history is split across two spellings for five exercises

Five exercises exist in `workout_logs` under two spellings each:

| Exercise | Logged occurrences, split |
|---|---|
| Chest-supported row | 51 |
| Weighted pull-up | 27 |
| Incline DB press | 14 |
| Pull-up pyramid | 7 |
| Push-up pyramid | 4 |

`/home/nolan/projects/OptiGains/src/utils/exerciseStats.js` matches strictly and
case-sensitively at four sites (`:21`, `:116`, `:118`, `:211`), all of the form
`ex.name === exerciseName`. So PR detection, the progression charts, and the
volume-by-date series all treat the two spellings as two different exercises.
Your 51 chest-supported rows read as two shorter, separate histories.

`exerciseStats.js` is the lone outlier on this.
`/home/nolan/projects/OptiGains/src/utils/coachingEngine.js:65` normalizes
(`(ex.name || '').toLowerCase().trim()`), and the Python engine normalizes case,
hyphens, and underscores in `_norm` at
`/home/nolan/projects/OptiGains/scripts/engine/muscle_map.py:175-176`.

### What this is not

It is not broken autofill, and I want that on the record because I believed it
was and tested it. I ran every program-prescribed exercise name against your
logged names looking for case-variant misses. The query returned empty. Every
name the program prescribes has an exact match in your logs, so the tap-to-fill
"last time" button resolves correctly on program days.

Severity is therefore latent rather than currently firing: it has already
corrupted your stored analytics, and it will bite the moment a name variant
reaches a program day, but nothing is failing in front of you right now.

### Fix

Normalize at the four comparison sites in `exerciseStats.js` to match what
`coachingEngine.js` already does. Do not rename the underlying rows.

---

## 6. One genuinely orphaned session, and a third of starts go nowhere

Session `c1cd41bd`, 2026-08-31, status `in_progress`, 8 exercises, 4 completed
sets, and no `workout_log` within plus or minus one day. That work is stranded.
I checked the other ten cancelled or in-progress sessions holding exercises and
every one of them has a nearby log, so this is the only real orphan in the
dataset.

Separately: 42 of 122 started sessions were cancelled, and 34 of those were
empty. A third of all workout starts go nowhere, and most of those are opened
and immediately backed out of. That points at the start button or the workout
picker, not at logging.

I would not read too much into the empty ones without knowing whether you were
browsing rather than starting, but 34 is a large enough number to be worth one
question: when you tap into a workout and leave, what were you usually trying to
do?

---

## 7. Seven tables have a UI surface and zero rows

Each of these renders something in the app and has never been written to:

| Table | Surface |
|---|---|
| `measurements` | `/home/nolan/projects/OptiGains/src/pages/Progress.jsx` |
| `progress_photos` | `/home/nolan/projects/OptiGains/src/pages/Progress.jsx` |
| `recipes` | `RecipeBuilder.jsx`, a full builder |
| `food_portions` | FoodTracker |
| `exercise_reactions` | `/home/nolan/projects/OptiGains/src/pages/Workouts.jsx` |
| `weekly_checkins` | Defined in `api/supabaseClient.js`, no page at all |
| `cardio_sessions` | Read by 9 files |

These are exact `count(*)` results, not `reltuples` estimates.

This is a question, not a defect. Seven dead surfaces is a lot of screen you
scroll past. Some of them are features you would use if they were in the right
place, and some are features you will never use and should delete so the app
stops implying you should. I am not going to guess which is which.

---

## 8. What survived from the old audit documents: nothing

I swept `UI_AUDIT.md`, `LAUNCH_READINESS.md`, `PRODUCT_GAPS.md`,
`SURFACE_INVENTORY.md`, `AUDIT_2026-07-30.md`, `AUDIT_REPORT.md`, and
`CONVERGENCE_AUDIT.md` for UI/UX items not already closed, filtering against
`KNOWN_NON_ISSUES.md`, and verified each surviving candidate against current
source rather than trusting the doc's own status line.

No unaddressed UI/UX finding survived. Ten-plus specific fixes were confirmed
present in code, including `Profile.jsx:256`, the `ResetPassword`
`onAuthStateChange` race, `Login.jsx:90` and `:104` labels,
`ProgramBuilder.jsx:93-194`, and the `Today.jsx` loading and error states. The
AUDIT_2026-07-30 P3 duplicate-logs item stays retracted. One item, toast
occlusion behind a dialog, is resolved by z-index inspection rather than by an
explicit fix, and is the only one I would call "probably fine" rather than
"verified fixed".

---

## The rest of the corpus, and what it did not turn up

All eight complaint clusters in the corpus were read, not just the ones that
produced findings. Two of the larger ones produced almost nothing, which is
worth stating rather than leaving as silence.

**Other, 79 complaints, the second-largest cluster.** Effectively inapplicable
by construction. It is dominated by paywalls ("charge a subscription for
features that used to be free"), forced AI coaching ("Recommend set and reps by
AI is not great... give the option to opt out"), thin program libraries, and
redesign grief. OptiGains has no monetization to resent, no LLM in the loop by
design, and its programming is yours. Nothing here reproduces.

**Speed and jank, 48 complaints.** Mostly crash-on-launch and
broken-since-update reports against shipped commercial apps, which is not a
class of finding I can assert from source. What it did produce is corroboration
rather than new defects: the offline-gym complaint quoted in section 1, and two
separate reports that a backgrounded app kills the rest timer, which is section
2 from the user's side. One adjacent note, a Liftin two-star: "I can't edit the
notes... only part of it edits and then it doesn't save." `notes` is on the
`workout_logs` row and is equally unreachable once a session is finished, so it
rides along with section 4.

---

## Where OptiGains is already ahead of the apps in the corpus

Worth stating, because it changes what is worth building next.

- The tap-to-fill "last time" button at `ExerciseCard.jsx:583-597` is, exactly,
  the top open feature request on wger: *"Show previous (last) weight/distance
  /uom when entering new exercise log."* You already have it.
- It fills on tap rather than pre-filling the field, which sidesteps the
  opposing complaint that shows up against Strong and Hevy: *"Hate that it
  preloads the weight and reps."* Having both behaviours available and the
  non-destructive one as default is the correct call.
- Completed sets remain fully editable mid-workout, with an explicit "Mark set N
  incomplete" toggle. The single loudest complaint in the corpus's second largest
  category, *"You can't modify the workout... otherwise it silently discards your
  changes,"* does not reproduce here.
- `handleInputFocus` at `:74-84` does `select()` plus a `visualViewport`-aware
  `scrollIntoView({block: "center"})` with a 400ms fallback. Keyboard occlusion
  of the field you are typing into is a recurring complaint across the corpus.
- The elapsed-workout timer at
  `/home/nolan/projects/OptiGains/src/components/workouts/WorkoutLoggingHeader.jsx:90-125`
  uses a phase-aligned `setTimeout` chain recomputing from `Date.now()` plus a
  `visibilitychange` resync. That is more careful than the implementations being
  complained about.
- The app shell is precached at install, so OptiGains cold-opens with no signal.
  Several apps in the corpus do not, and it is the specific thing that ends the
  relationship: *"My gym doesn't have service in it, meaning I can only use the
  app in airplane mode."* Half of that complaint is already solved here. The
  other half is finding 1.
- Your `Bench Press (Top Set)` / `(Back-off Vol)` / `(Daily Single)` naming
  already solves a complaint the corpus raises repeatedly: *"if you're doing the
  same exercise twice a week heavy and light you only see the last workout."*

---

## Ranked

1. Mirror in-progress sets to `localStorage`. The only item here that closes the
   loss window, and the only one that makes the app usable in a gym with no
   signal.
2. Fix the two `|| 0` handlers in `ExerciseCard.jsx`. Three lines, copied from
   the RIR handler directly below them.
3. Surface save failures in the logging header, so a drop is visible while you
   can still do something about it.
4. Schedule the rest notification at rest start so it survives a locked phone.
5. Normalize the four comparison sites in `exerciseStats.js`.
6. Move `lastSavedRef` into the success branch. Two lines. Closes the
   failed-fingerprint retry gap, not the tail.
7. Add `max` bounds to weight and reps.
8. Make a finished workout re-openable into the logging UI, so fixing one number
   does not mean deleting the session.

One through three are small enough to do in one sitting and cover the two
findings that can actually cost you data. Eight is the largest piece of work on
the list and the one that most changes how the app feels to live with.

## Needs your call

- Session `c1cd41bd` (2026-08-31, 4 completed sets, no log). Recover it into
  `workout_logs`, or leave it. It is real training history either way and I am
  not writing to that table without you saying so.
- The seven dead tables: which are features you want surfaced properly, and
  which should be removed.
- The 34 empty cancelled starts: what you were doing when you backed out.
