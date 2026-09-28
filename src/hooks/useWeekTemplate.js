// useWeekTemplate: run a saved folder of workouts (a PPL, the FBEOD split, ...)
// for one week instead of the engine's plan (Nolan's call, 2026-09-27).
//
// The folder's workouts run in title order ("Day 1", "Day 2", ... or "1 Push",
// "2 Pull") and cycle across every day left in the week, so a 4-day split on a
// 7-day week runs Day 1-4 then Day 1-3 (Nolan's call: lift all 7, repeat the
// split). Every day is written the way a single-day override is
// (useOverrideProgramWorkout): replaced and locked, so the regeneration that
// follows, and the weekly cron, leave it alone. Only that week's dates are
// locked, so the next week the engine plans as normal again.
//
// Days already trained or in progress are never rewritten; the log is ground
// truth. The engine's cardio stays on its days: the template replaces the
// lifting, not the running.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";

export const TEMPLATE_SOURCE_PREFIX = "template:";

const byTitle = (a, b) =>
  (a.title || "").localeCompare(b.title || "", undefined, { numeric: true, sensitivity: "base" });

// Saved folders usable as a week: two or more workouts that have exercises. The
// Engine folder is the engine's own captured sessions, not a template of his.
export function templateFolders(library) {
  const groups = {};
  for (const w of library || []) {
    if (!w.folder || w.folder === "Engine" || !(w.exercises || []).length) continue;
    (groups[w.folder] ||= []).push(w);
  }
  return Object.entries(groups)
    .filter(([, ws]) => ws.length >= 2)
    .map(([folder, ws]) => ({ folder, workouts: [...ws].sort(byTitle) }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

// The dates a template can still decide: planned, today or later, untrained.
export function templateDates(weekRows, touched, today) {
  return (weekRows || [])
    .filter((r) => r.scheduled_date >= today && !touched.has(r.scheduled_date))
    .map((r) => r.scheduled_date)
    .sort();
}

// Every decidable day paired with the next template workout, cycling.
export function planTemplateWeek(weekRows, workouts, touched, today) {
  if (!workouts?.length) return [];
  const byDate = Object.fromEntries((weekRows || []).map((r) => [r.scheduled_date, r]));
  return templateDates(weekRows, touched, today).map((date, i) => ({
    row: byDate[date],
    workout: workouts[i % workouts.length],
  }));
}

async function dispatchRegenerate(reason) {
  // Best-effort, same as the single-day override: the rows are already saved,
  // a failed dispatch only means the rest of the week reflows on the next cron.
  try {
    const { error } = await supabase.functions.invoke("replan-day", {
      body: { event_type: "regenerate-week", reason },
    });
    if (error) throw error;
  } catch (e) {
    console.error("week regeneration dispatch failed; the template is saved", e);
  }
}

export function useApplyWeekTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ plan, folder }) => {
      if (!plan?.length) throw new Error("No days left in that week");
      for (const { row, workout } of plan) {
        await db.entities.ProgramWorkout.update(row.id, {
          title: workout.title,
          focus: workout.focus || row.focus || "strength",
          exercises: workout.exercises,
          duration_minutes: workout.duration_minutes ?? row.duration_minutes ?? null,
          locked: true,
          override_source: `${TEMPLATE_SOURCE_PREFIX}${folder}`,
        });
      }
      // One dispatch for the whole week: the regenerate workflow cancels an
      // in-flight run, so one per day would just cancel each other.
      await dispatchRegenerate(`template ${folder} for ${plan[0].row.scheduled_date}..${plan[plan.length - 1].row.scheduled_date}`);
      return plan.length;
    },
    onSuccess: () => invalidate(qc),
  });
}

// Hand the week back to the engine: unlock the template days (untrained ones
// only) and regenerate, which writes the engine's plan over them.
export function useClearWeekTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, touched }) => {
      const mine = (rows || []).filter((r) =>
        (r.override_source || "").startsWith(TEMPLATE_SOURCE_PREFIX) && !touched.has(r.scheduled_date));
      for (const r of mine) {
        await db.entities.ProgramWorkout.update(r.id, { locked: false, override_source: null });
      }
      if (mine.length) await dispatchRegenerate("template cleared");
      return mine.length;
    },
    onSuccess: () => invalidate(qc),
  });
}

function invalidate(qc) {
  qc.invalidateQueries({ queryKey: ["programWorkout"] });
  qc.invalidateQueries({ queryKey: ["programWorkouts"] });
  qc.invalidateQueries({ queryKey: ["todayPrescription"] });
  qc.invalidateQueries({ queryKey: ["weekTemplateRows"] });
  // The Schedule tab and Today read the week off enrollments (prefix match).
  qc.invalidateQueries({ queryKey: ["enrollments"] });
}
