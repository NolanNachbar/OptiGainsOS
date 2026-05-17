const ACTIVITY_LABELS = { run: "Run", bike: "Ride", swim: "Swim", row: "Row" };
const ZONE_NUMBER = { Z1: "1", Z2: "2", Z3: "3", Z4: "4", Z5: "5" };

function migrateCardioSession(s) {
  const activity = ACTIVITY_LABELS[s.activity_type] || "Cardio";
  const zone = s.zone || "Z2";
  return {
    workout_id: null,
    title: `${zone} ${activity}`,
    duration_minutes: Math.max(1, parseInt(s.duration_minutes) || 30),
    time_of_day: ["am", "pm", "anytime"].includes(s.time_of_day) ? s.time_of_day : "anytime",
    exercises: [{
      step_type: "active",
      name: s.notes || activity,
      duration_type: "time",
      duration_value: Math.max(1, parseInt(s.duration_minutes) || 30),
      target_type: "heart_rate_zone",
      target_low: ZONE_NUMBER[zone] || "2",
      target_high: null,
      notes: "",
    }],
  };
}

const VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const VALID_GOALS = ["muscle_gain", "fat_loss", "strength", "endurance", "general"];
const FORMAT_VERSION = "1.0";

export function exportProgramAsJson(program) {
  const payload = {
    sisyphus_version: FORMAT_VERSION,
    type: "program",
    exported_at: new Date().toISOString(),
    program: {
      name: program.name,
      description: program.description || "",
      cycle_length: program.cycle_length || program.days_per_week || 7,
      num_cycles: program.num_cycles || program.duration_weeks || 4,
      difficulty: program.difficulty || "intermediate",
      goal: program.goal || "general",
      tags: program.tags || [],
      workouts: (program.workouts || []).map((w) => ({
        day_index: w.day_index ?? w.day_number,
        title: w.title || `Day ${w.day_index}`,
        type: w.type || "strength",
        exercises: (w.exercises || []).map((ex) => ({
          name: ex.name,
          sets: ex.sets,
          rep_target: ex.rep_target,
          rir_target: ex.rir_target,
          rest_seconds: ex.rest_seconds,
          notes: ex.notes,
          focus: ex.focus,
          progression: ex.progression,
        })),
        cardio_sessions: (w.cardio_sessions || []).map((c) => ({
          workout_id: c.workout_id,
          title: c.title,
          exercises: c.exercises || [],
          duration_minutes: c.duration_minutes || 30,
          time_of_day: c.time_of_day || "anytime",
        })),
        notes: w.notes || "",
      })),
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${program.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseProgramJson(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid JSON file");
  }

  if (!parsed.program) throw new Error("Missing 'program' key — expected { program: { ... } }");
  const p = parsed.program;
  if (!p.name || typeof p.name !== "string") throw new Error("Program must have a name");

  const cycleLength = Math.max(1, Math.min(30, parseInt(p.cycle_length) || 7));
  const numCycles = Math.max(1, Math.min(20, parseInt(p.num_cycles) || 4));

  const programMeta = {
    name: String(p.name).slice(0, 100),
    description: String(p.description || "").slice(0, 1000),
    cycle_length: cycleLength,
    num_cycles: numCycles,
    difficulty: VALID_DIFFICULTIES.includes(p.difficulty) ? p.difficulty : "intermediate",
    goal: VALID_GOALS.includes(p.goal) ? p.goal : "general",
    tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string").slice(0, 10) : [],
  };

  const importedWorkouts = (Array.isArray(p.workouts) ? p.workouts : []).map((w, i) => ({
    day_index: parseInt(w.day_index) || i + 1,
    title: String(w.title || `Day ${w.day_index || i + 1}`).slice(0, 100),
    type: w.type || "strength",
    exercises: Array.isArray(w.exercises) ? w.exercises : [],
    cardio_sessions: Array.isArray(w.cardio_sessions)
      ? w.cardio_sessions.map((c) => ({
          workout_id: c.workout_id || null,
          title: String(c.title || "Cardio").slice(0, 100),
          exercises: Array.isArray(c.exercises) ? c.exercises : [],
          duration_minutes: Math.max(1, parseInt(c.duration_minutes) || 30),
          time_of_day: ["am", "pm", "anytime"].includes(c.time_of_day) ? c.time_of_day : "anytime",
        }))
      : [],
    notes: String(w.notes || "").slice(0, 500),
  }));

  // Fill any missing days up to cycle_length with empty slots
  const daySet = new Set(importedWorkouts.map((w) => w.day_index));
  for (let d = 1; d <= cycleLength; d++) {
    if (!daySet.has(d)) {
      importedWorkouts.push({
        day_index: d,
        title: `Day ${d}`,
        type: "strength",
        exercises: [],
        cardio_sessions: [],
        notes: "",
      });
    }
  }
  importedWorkouts.sort((a, b) => a.day_index - b.day_index);

  return { programMeta, workouts: importedWorkouts };
}
