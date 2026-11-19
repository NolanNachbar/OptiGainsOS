export const GOALS = [
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "fat_loss", label: "Fat Loss" },
  { value: "strength", label: "Strength" },
  { value: "endurance", label: "Endurance" },
  { value: "general", label: "General Fitness" },
];

export const STEPS = ["Details", "Cycle Days", "Progression", "Confirm"];

export function makeEmptyExercise() {
  return {
    name: "",
    focus: "hypertrophy",
    sets: 3,
    rep_target: "10",
    rir_target: 2,
    rest_seconds: 90,
    progression: { weight_increment: 5, daily_min_pct: 0.85 },
  };
}

export function makeEmptyWorkout(dayIndex) {
  return {
    day_index: dayIndex,
    title: `Day ${dayIndex}`,
    focus: "strength",
    exercises: [],
    cardio_sessions: [],
    notes: "",
  };
}


