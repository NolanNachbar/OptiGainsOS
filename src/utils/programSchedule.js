import { addDays, differenceInCalendarDays, format, isBefore, isEqual, parseISO, parse } from "date-fns";

const CARDIO_ACTIVITY_LABELS = { run: "Run", bike: "Ride", swim: "Swim", row: "Row" };

export function normalizeCardioSession(s) {
  if (s.title) return s;
  const activity = CARDIO_ACTIVITY_LABELS[s.activity_type] || "Cardio";
  const zone = s.zone || "Z2";
  return { ...s, title: `${zone} ${activity}` };
}

/**
 * Spread N training days across a 7-day week with balanced rest days.
 *
 *   1 day  → Mon                      [0]
 *   2 days → Mon / Thu                [0, 3]
 *   3 days → Mon / Wed / Fri          [0, 2, 4]
 *   4 days → Mon / Tue / Thu / Fri    [0, 1, 3, 4]
 *   5 days → Mon / Tue / Wed / Fri / Sat  [0, 1, 2, 4, 5]
 *   6 days → Mon–Sat                  [0, 1, 2, 3, 4, 5]
 *   7 days → every day                [0, 1, 2, 3, 4, 5, 6]
 */
const WEEKLY_OFFSETS = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Given a 1-based day_index and the number of training days in a cycle,
 * return the 0-based calendar offset from the week/cycle start date.
 */
function getDayOffset(dayIndex, cycleLength) {
  const n = Math.min(Math.max(Math.round(cycleLength), 1), 7);
  const offsets = WEEKLY_OFFSETS[n] ?? WEEKLY_OFFSETS[7];
  return offsets[Math.min(dayIndex - 1, offsets.length - 1)] ?? (dayIndex - 1);
}

/**
 * Build the full calendar schedule for an enrolled program.
 *
 * Each cycle occupies ceil(trainingDaysInCycle / 7) full calendar weeks so
 * that cycle boundaries always land on clean week starts.
 *
 * Returns an array of schedule entries shaped:
 * {
 *   date:              "yyyy-MM-dd",
 *   title:             string,
 *   programWorkoutId:  string,
 *   enrollmentId:      string,
 *   cycle:             number,   // 1-based
 *   dayIndex:          number,   // 1-based
 *   exercises:         array,
 *   programName:       string,
 *   isCurrent:         boolean,  // next workout to perform
 *   completed:         boolean,
 * }
 */
export function getProgramSchedule(enrollment, workouts) {
  if (!enrollment || !workouts?.length) return [];

  const startDate = enrollment.start_date || enrollment.started_at;
  if (!startDate) return [];

  // Slice to YYYY-MM-DD and parse as local midnight to avoid UTC→local timezone shifts
  const anchor = parse(
    (typeof startDate === 'string' ? startDate : format(new Date(startDate), 'yyyy-MM-dd')).slice(0, 10),
    'yyyy-MM-dd',
    new Date()
  );

  // MPC-generated overrides: keyed by scheduled_date (yyyy-MM-dd)
  const dateOverrideMap = new Map();
  workouts.forEach((w) => {
    if (w.scheduled_date) {
      const d = typeof w.scheduled_date === 'string'
        ? w.scheduled_date.slice(0, 10)
        : format(new Date(w.scheduled_date), 'yyyy-MM-dd');
      dateOverrideMap.set(d, w);
    }
  });

  // Base templates: no scheduled_date, used as fallback for any cycle
  const trainingDays = workouts
    .filter((w) => !w.scheduled_date && (w.exercises?.length > 0 || w.cardio_sessions?.length > 0))
    .sort((a, b) => (a.day_index || 0) - (b.day_index || 0));
  if (!trainingDays.length && dateOverrideMap.size === 0) return [];

  // Get cycle settings from enrollment or fallback to program
  const cycleLength = enrollment.program?.days_per_week
    || enrollment.days_per_week
    || trainingDays.length;

  const numCycles = enrollment.program?.num_cycles
    || enrollment.num_cycles
    || enrollment.program?.duration_weeks
    || enrollment.duration_weeks
    || 4;

  const programName = enrollment.program?.title || enrollment.program?.name || "";

  // Build set of completed workout keys: "cycle-dayIndex"
  // completed_workouts is an array of objects: [{program_workout_id, cycle, day_index, completed_at, skipped?, session_index?}, ...]
  const sessionCompletions = new Map(); // "cycle-dayIndex" -> Set<sessionIndex>
  const completedWorkouts = new Set(
    (enrollment.completed_workouts || [])
      .filter(cw => {
        if (typeof cw === 'string') return true;
        if (!cw) return false;
        if (cw.skipped) return false;
        // Track per-session entries separately
        if (cw.session_index != null) {
          const key = `${cw.cycle}-${cw.day_index}`;
          if (!sessionCompletions.has(key)) sessionCompletions.set(key, new Set());
          sessionCompletions.get(key).add(cw.session_index);
          return false; // don't count as whole-workout completion
        }
        return (cw.cycle && cw.day_index) || cw.program_workout_id;
      })
      .map(cw => {
        if (typeof cw === 'string') return cw;
        if (cw.cycle && cw.day_index) return `${cw.cycle}-${cw.day_index}`;
        return cw.program_workout_id;
      })
  );

  // Each cycle is exactly cycleLength days (no week alignment needed)
  const calDaysPerCycle = cycleLength;

  const currentCycle = enrollment.current_cycle || 1;
  const currentDayIndex = enrollment.current_day_index || enrollment.current_day || 1;

  const entries = [];
  const today = format(new Date(), "yyyy-MM-dd");

  const pushEntry = (date, activeWorkout, cycle, dayIndex) => {
    // Check if this specific workout (cycle + day_index) is completed
    const completedKey = `${cycle}-${dayIndex}`;
    const completedSessions = sessionCompletions.get(completedKey) || new Set();
    const cardioCount = (activeWorkout.cardio_sessions || []).length;
    const hasExercises = (activeWorkout.exercises || []).length > 0;
    // Whole-workout complete if: legacy whole-workout entry exists, OR all individual sessions done
    const isCompleted = completedWorkouts.has(completedKey)
      || (!hasExercises && cardioCount > 0 && completedSessions.size >= cardioCount);

    entries.push({
      date,
      title: activeWorkout.title,
      programWorkoutId: activeWorkout.id,
      enrollmentId: enrollment.id,
      cycle,
      dayIndex,
      exercises: activeWorkout.exercises || [],
      cardio_sessions: (activeWorkout.cardio_sessions || []).map(normalizeCardioSession),
      programName,
      // isCurrent means "this is today's workout" (for highlighting in UI)
      // It's the workout scheduled for today, whether completed or not
      isCurrent: date === today,
      completed: isCompleted,
      completedSessions,
    });
  };

  // MPC-generated rows are first-class entries regardless of the cycle window,
  // with cycle/dayIndex derived from their actual date so completion keying
  // stays consistent with useLogProgramWorkout.
  for (const [date, workout] of dateOverrideMap) {
    const dayDiff = differenceInCalendarDays(parse(date, "yyyy-MM-dd", new Date()), anchor);
    const cycle = calDaysPerCycle > 0
      ? Math.max(1, Math.floor(dayDiff / calDaysPerCycle) + 1)
      : 1;
    const dayIndex = workout.day_index
      || (calDaysPerCycle > 0 ? ((dayDiff % calDaysPerCycle) + calDaysPerCycle) % calDaysPerCycle + 1 : 1);
    pushEntry(date, workout, cycle, dayIndex);
  }

  // Engine-generated dates own their range — suppress base-template ghosts inside it
  const overrideDates = [...dateOverrideMap.keys()].sort();
  const overrideMin = overrideDates[0];
  const overrideMax = overrideDates[overrideDates.length - 1];

  for (let cycle = 1; cycle <= numCycles; cycle++) {
    const cycleStartOffset = (cycle - 1) * calDaysPerCycle;

    for (const workout of trainingDays) {
      // day_index represents the day within the cycle (1-based)
      // Convert to 0-based offset for calendar calculation
      const dayOffset = workout.day_index - 1;
      const date = format(
        addDays(anchor, cycleStartOffset + dayOffset),
        "yyyy-MM-dd"
      );

      if (overrideMin && date >= overrideMin && date <= overrideMax) continue;

      pushEntry(date, workout, cycle, workout.day_index);
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  return entries;
}

/**
 * Return today's program workout if one is scheduled for today.
 */
export function getTodayProgramWorkout(enrollment, workouts) {
  if (!enrollment || !workouts?.length) return null;

  const today = format(new Date(), "yyyy-MM-dd");
  const entries = getProgramSchedule(enrollment, workouts);

  // Return today's workout only (whether complete or incomplete)
  const todayEntry = entries.find((e) => e.date === today);
  return todayEntry ?? null;
}
