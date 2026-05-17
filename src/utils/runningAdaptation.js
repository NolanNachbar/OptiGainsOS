import { addDays, format, parseISO, startOfWeek, subWeeks } from "date-fns";

/**
 * Returns the start (Monday 00:00) of the calendar week that just ended.
 */
export function getLastWeekStart() {
  return subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);
}

/**
 * Compare last week's scheduled cardio sessions against actual Strava activities.
 *
 * @param {Array}  scheduleEntries  - from getProgramSchedule(); each has { date, cardio_sessions }
 * @param {Array}  allActivities    - cardio DB rows: { activity_type, start_date, moving_time_seconds }
 * @param {Date}   lastWeekStart    - Monday 00:00 of the week being evaluated
 * @returns {number} completionRate - 0..∞ (>1 means more sessions than planned)
 */
export function analyzeWeekCompletion(scheduleEntries, allActivities, lastWeekStart) {
  const weekStartStr = format(lastWeekStart, "yyyy-MM-dd");
  const weekEndStr   = format(addDays(lastWeekStart, 7), "yyyy-MM-dd");

  // Planned: schedule entries with at least one cardio session in last week's window
  const plannedEntries = (scheduleEntries || []).filter(
    (e) => e.date >= weekStartStr && e.date < weekEndStr && (e.cardio_sessions || []).length > 0
  );
  const planned = plannedEntries.length;
  if (planned === 0) return 1.0; // nothing scheduled → no adjustment needed

  // Actual: Strava runs (or any cardio) whose start_date falls in the same window
  const RUNNING_TYPES = new Set(["run", "virtualrun", "trailrun", "treadmill"]);
  const actual = (allActivities || []).filter((a) => {
    if (!a.start_date) return false;
    const d = a.start_date.slice(0, 10); // yyyy-MM-dd
    if (d < weekStartStr || d >= weekEndStr) return false;
    // Count runs and generic cardio; skip strength-only sessions
    const t = (a.activity_type || "").toLowerCase();
    return RUNNING_TYPES.has(t) || t === "workout" || t === "cardio";
  }).length;

  return actual / planned;
}

/**
 * Decide how to adjust upcoming training load based on last week's completion.
 *
 * @param {number} completionRate  - output of analyzeWeekCompletion
 * @param {number} weeksToRace     - weeks remaining in the program
 * @returns {{ scale: number, message: string|null, affectedWeeks: number }}
 */
export function computeAdaptation(completionRate, weeksToRace) {
  const weeks = Math.max(0, weeksToRace || 0);

  // Too close to race day — don't change anything
  if (weeks <= 1) return { scale: 1.0, message: null, affectedWeeks: 0 };

  // Overachieved: ran more than planned — modest bump, 1 week out
  if (completionRate >= 1.2) {
    return {
      scale: 1.05,
      message: "Great week! Bumped next week's sessions up slightly to keep progressing.",
      affectedWeeks: 1,
    };
  }

  // On track (≥ 80%) — no change
  if (completionRate >= 0.8) return { scale: 1.0, message: null, affectedWeeks: 0 };

  // Slightly under (65–80%) — light reduction, 1 week
  if (completionRate >= 0.65) {
    return {
      scale: 0.9,
      message: "Missed a few runs last week — eased next week's load to help you recover.",
      affectedWeeks: Math.min(1, weeks - 1),
    };
  }

  // Significantly under (<65%) — larger reduction, up to 2 weeks
  return {
    scale: 0.8,
    message: "Tough week — reduced the next couple weeks to get back on track without overloading.",
    affectedWeeks: Math.min(2, weeks - 1),
  };
}

/**
 * Scale duration_minutes for cardio sessions in upcoming workouts.
 *
 * @param {Array}  workouts         - raw ProgramWorkout rows from the DB
 * @param {number} currentDayIndex  - current position in the cycle (1-based)
 * @param {number} scale            - multiplier (e.g. 0.9 = 10% less)
 * @param {number} affectedWeeks    - how many calendar weeks ahead to touch
 * @returns {Array} deep-copied workout array with scaled cardio sessions
 */
export function applyAdaptation(workouts, currentDayIndex, scale, affectedWeeks) {
  const rangeEnd = currentDayIndex + affectedWeeks * 7;

  return workouts.map((w) => {
    if ((w.day_index || 0) <= currentDayIndex || (w.day_index || 0) > rangeEnd) return w;
    if (!(w.cardio_sessions || []).length) return w;

    return {
      ...w,
      cardio_sessions: w.cardio_sessions.map((c) => ({
        ...c,
        duration_minutes: Math.max(10, Math.round((c.duration_minutes || 30) * scale)),
      })),
    };
  });
}

/**
 * Write adapted workouts back to the database; skip unchanged ones.
 *
 * @param {Object} db               - supabaseClient db helper
 * @param {string} _programId       - program ID (unused — updates go by workout ID)
 * @param {Array}  originalWorkouts - unmodified workout list
 * @param {Array}  adaptedWorkouts  - output of applyAdaptation
 * @returns {Promise<number>}       - count of rows actually updated
 */
export async function persistAdaptation(db, _programId, originalWorkouts, adaptedWorkouts) {
  let updatedCount = 0;

  for (let i = 0; i < adaptedWorkouts.length; i++) {
    const original = originalWorkouts[i];
    const adapted  = adaptedWorkouts[i];
    if (!adapted.id || adapted === original) continue;

    // Cheap structural diff: compare serialised cardio_sessions
    const origSessions = JSON.stringify(original.cardio_sessions || []);
    const adapSessions = JSON.stringify(adapted.cardio_sessions  || []);
    if (origSessions === adapSessions) continue;

    try {
      await db.entities.ProgramWorkout.update(adapted.id, {
        cardio_sessions: adapted.cardio_sessions,
      });
      updatedCount++;
    } catch {
      // Best-effort — a single failed update shouldn't abort the rest
    }
  }

  return updatedCount;
}
