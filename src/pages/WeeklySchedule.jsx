import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, addWeeks, subWeeks, startOfWeek, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Dumbbell, Timer, Moon, CheckCircle2, Circle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { getProgramSchedule } from "@/utils/programSchedule";
import { Button } from "@/components/ui/button";

const RUN_NAMES = ["zone 2 run", "zone2 run", "400m sprint", "sprint", "run", "cardio"];
const isRun = (ex) => RUN_NAMES.some(k => ex.name?.toLowerCase().includes(k));

function formatSets(exercise) {
  const sets = (exercise.sets || []).filter(s => s.completed !== false);
  if (!sets.length) return "";
  const w = sets[0]?.weight;
  const r = sets[0]?.reps;
  if (sets.length === 1) return w ? `${w} × ${r}` : `${r} reps`;
  const allSame = sets.every(s => s.weight === w && s.reps === r);
  if (allSame) return w ? `${sets.length}×${r} @ ${w}` : `${sets.length}×${r}`;
  return `${sets.length} sets`;
}

const getWorkoutSplitTitle = (log, scheduledTitle) => {
  if (!log || !log.exercises) return scheduledTitle || "Lifting Session";
  
  const upperKeywords = ["bench", "press", "pull-up", "pulldown", "row", "curl", "raise", "fly", "push-up", "dip", "extension", "bicep", "tricep", "delt", "lats", "chest", "shoulder"];
  const lowerKeywords = ["squat", "deadlift", "rdl", "lunges", "calf", "leg press", "leg extension", "hip thrust", "hamstring", "quad", "glute"];
  
  let upperCount = 0;
  let lowerCount = 0;
  
  log.exercises.forEach(ex => {
    const name = (ex.name || "").toLowerCase();
    if (upperKeywords.some(k => name.includes(k))) upperCount++;
    if (lowerKeywords.some(k => name.includes(k))) lowerCount++;
  });
  
  if (upperCount > lowerCount) {
    let suffix = "";
    if (scheduledTitle) {
      if (scheduledTitle.includes("Volume")) suffix = " — Volume";
      else if (scheduledTitle.includes("Intensity")) suffix = " — Intensity";
      else if (scheduledTitle.includes("Steady")) suffix = " — Steady";
      else if (scheduledTitle.includes("Push")) suffix = " — Push";
      else if (scheduledTitle.includes("Back Off")) suffix = " — Back Off";
    }
    return `Upper Body Session${suffix}`;
  } else if (lowerCount > upperCount) {
    let suffix = "";
    if (scheduledTitle) {
      if (scheduledTitle.includes("Squat")) suffix = " — Squat";
      else if (scheduledTitle.includes("Hinge")) suffix = " — Hinge";
      else if (scheduledTitle.includes("Steady")) suffix = " — Steady";
      else if (scheduledTitle.includes("Push")) suffix = " — Push";
      else if (scheduledTitle.includes("Back Off")) suffix = " — Back Off";
    }
    return `Lower Body Session${suffix}`;
  }
  
  return scheduledTitle || "Lifting Session";
};

export default function WeeklySchedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDay, setSelectedDay] = useState(new Date());
  const { enrollments } = useEnrollments();

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekDateStrs = weekDays.map(d => format(d, "yyyy-MM-dd"));

  const { data: weekLogs = [] } = useQuery({
    queryKey: ["weekLogs", user?.id, format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id, log_date, exercises, duration_seconds")
        .eq("created_by", user.id)
        .in("log_date", weekDateStrs)
        .order("duration_seconds", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const activeEnrollment = enrollments.find(e => e.status === "active");

  const cardioKey = useCallback((date, name) =>
    `cardio_done_${user?.id}_${format(date, "yyyy-MM-dd")}_${name}`, [user?.id]);

  const isCardioDone = (date, name) => {
    try { return !!localStorage.getItem(cardioKey(date, name)); } catch { return false; }
  };
  const toggleCardio = (date, name) => {
    const key = cardioKey(date, name);
    try {
      if (localStorage.getItem(key)) localStorage.removeItem(key);
      else localStorage.setItem(key, '1');
    } catch {}
    // force re-render
    setSelectedDay(d => new Date(d));
  };

  const programEntries = useMemo(() => {
    if (!activeEnrollment?.program?.workouts) return [];
    return getProgramSchedule(activeEnrollment, activeEnrollment.program.workouts);
  }, [activeEnrollment]);

  const getEntriesForDay = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return programEntries.filter(e => e.date === dateStr);
  };

  // Best log for a day = longest duration (most complete session)
  const getLogForDay = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const logs = weekLogs.filter(l => l.log_date === dateStr);
    if (!logs.length) return null;
    return logs.reduce((a, b) => (b.duration_seconds || 0) > (a.duration_seconds || 0) ? b : a);
  };

  const selectedEntries = getEntriesForDay(selectedDay);
  const selectedLog = getLogForDay(selectedDay);
  const isToday = isSameDay(selectedDay, new Date());

  const totalWorkouts = activeEnrollment
    ? (activeEnrollment.program?.days_per_week || 1) * (activeEnrollment.program?.num_cycles || activeEnrollment.program?.duration_weeks || 4)
    : 0;
  const completedCount = activeEnrollment?.completed_workouts?.length || 0;
  const progressPct = totalWorkouts > 0 ? Math.min(100, Math.round((completedCount / totalWorkouts) * 100)) : 0;

  const hasAnything = selectedEntries.length > 0 || !!selectedLog;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Week nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="p-2 text-slate-500 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
          {format(weekStart, "MMM d")} — {format(addDays(weekStart, 6), "MMM d")}
        </span>
        <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="p-2 text-slate-500 hover:text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Day strip */}
      <div className="grid grid-cols-7 gap-1 mb-6">
        {weekDays.map((day, i) => {
          const hasLog = weekLogs.some(l => l.log_date === format(day, "yyyy-MM-dd"));
          const entries = getEntriesForDay(day);
          const isSelected = isSameDay(day, selectedDay);
          const isCurrentDay = isSameDay(day, new Date());
          const hasWorkout = entries.length > 0 || hasLog;

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(day)}
              className={`flex flex-col items-center py-2.5 rounded-xl border transition-all ${
                isSelected ? "bg-brand border-brand" :
                isCurrentDay ? "border-brand bg-transparent" :
                "border-charcoal-border bg-charcoal-surface"
              }`}
            >
              <span className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${isSelected ? "text-black" : "text-slate-400"}`}>
                {format(day, "EEE").slice(0, 2)}
              </span>
              <span className={`text-sm font-bold ${isSelected ? "text-black" : isCurrentDay ? "text-brand" : "text-white"}`}>
                {format(day, "d")}
              </span>
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                hasLog ? "bg-green-400" :
                hasWorkout ? (isSelected ? "bg-black/40" : "bg-slate-500") :
                "bg-transparent"
              }`} />
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white mb-3">
          {format(selectedDay, "EEEE")}
          <span className="text-slate-500 font-normal text-sm ml-2">{format(selectedDay, "MMMM d")}</span>
        </h2>

        {!hasAnything ? (
          <div className="bg-charcoal-surface border border-charcoal-border rounded-xl py-10 flex flex-col items-center gap-2">
            <Moon className="w-6 h-6 text-slate-600" />
            <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">Rest Day</span>
          </div>
        ) : (
          <div className="space-y-3">

            {/* ── Completed lift from log ── */}
            {selectedLog && (() => {
              const logLifts = (selectedLog.exercises || []).filter(ex => !isRun(ex));
              const mins = selectedLog.duration_seconds ? Math.round(selectedLog.duration_seconds / 60) : null;
              return (
                <div className="bg-charcoal-surface border border-green-500/30 rounded-xl overflow-hidden">
                  <div className="h-0.5 bg-green-500" />
                  <div className="px-4 pt-3 pb-2 flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-green-400/70 mb-1">Completed</p>
                      <h3 className="text-xl font-bold text-white">
                        {getWorkoutSplitTitle(selectedLog, selectedEntries[0]?.title)}
                      </h3>
                      {mins && <p className="text-xs text-slate-500 mt-0.5">{mins} min</p>}
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-1" />
                  </div>
                  <div className="px-4 pb-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Dumbbell className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Exercises</span>
                    </div>
                    <div className="space-y-1.5">
                      {logLifts.map((ex, j) => (
                        <div key={j} className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-white">{ex.name}</span>
                          <span className="text-xs text-slate-500 tabular-nums shrink-0">{formatSets(ex)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Upcoming program workout (no log yet) ── */}
            {!selectedLog && selectedEntries.map((entry, idx) => {
              const lifts = (entry.exercises || []).filter(ex => !isRun(ex));
              const runs = entry.cardio_sessions || [];
              return (
                <div key={idx} className="bg-charcoal-surface border border-charcoal-border rounded-xl overflow-hidden">
                  <div className="h-0.5 bg-brand" />
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand/70 mb-1">
                      {activeEnrollment?.program?.title || "Program"}
                    </p>
                    <h3 className="text-xl font-bold text-white">{entry.title}</h3>
                  </div>
                  {lifts.length > 0 && (
                    <div className="px-4 py-2">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Dumbbell className="w-3 h-3 text-slate-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Lifting</span>
                      </div>
                      <div className="space-y-1">
                        {lifts.map((ex, j) => (
                          <div key={j} className="flex items-center justify-between">
                            <span className="text-sm text-white">{ex.name}</span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              {ex.sets > 1 ? `${ex.sets}×` : ""}{ex.rep_target || ex.reps}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {runs.length > 0 && (
                    <div className="px-4 py-2 border-t border-charcoal-border bg-charcoal-surface2">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Timer className="w-3 h-3 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Cardio</span>
                      </div>
                      {runs.map((ex, j) => {
                        const title = ex.title || `${ex.zone || "Z2"} ${ex.activity_type || "run"}`;
                        return (
                          <div key={j} className="mb-2 last:mb-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-white font-medium">{title}</span>
                              <span className="text-xs text-slate-500">{ex.duration_minutes} min</span>
                            </div>
                            {ex.notes && <p className="text-xs text-slate-500 mt-0.5">{ex.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="px-4 pb-4 pt-2">
                    <Button
                      className="w-full bg-brand hover:bg-brand/90 text-black font-bold"
                      onClick={() => navigate(`/workout-detail?source=program&enrollmentId=${entry.enrollmentId}&programWorkoutId=${entry.programWorkoutId}`)}
                    >
                      {isToday ? "Start Session" : "View Workout"}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* ── Pending cardio for today when lift is already logged ── */}
            {selectedEntries.map((entry, idx) => {
              const runs = entry.cardio_sessions || [];
              if (!runs.length) return null;
              return (
                <div key={idx} className="bg-charcoal-surface border border-blue-500/20 rounded-xl overflow-hidden">
                  <div className="h-0.5 bg-blue-500" />
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Timer className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Cardio</span>
                    </div>
                    <div className="space-y-3">
                      {runs.map((ex, j) => {
                        const name = ex.title || `${ex.zone || 'Z2'} ${ex.activity_type || 'run'}`;
                        const done = isCardioDone(selectedDay, name);
                        return (
                          <div key={j} className="flex items-start justify-between gap-3">
                            <div className={done ? "opacity-50" : ""}>
                              <div className="flex items-baseline gap-2">
                                <span className={`text-base font-bold ${done ? "line-through text-slate-500" : "text-white"}`}>{name}</span>
                                <span className="text-sm text-slate-500">{ex.duration_minutes} min</span>
                              </div>
                              {ex.notes && <p className="text-xs text-slate-500 mt-0.5">{ex.notes}</p>}
                            </div>
                            <button
                              onClick={() => toggleCardio(selectedDay, name)}
                              className={`shrink-0 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                done ? "bg-green-500 border-green-500" : "border-charcoal-border hover:border-blue-400"
                              }`}
                            >
                              {done && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

      {/* Program progress */}
      {activeEnrollment?.program && (
        <div className="bg-charcoal-surface border border-charcoal-border rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate flex-1 mr-2">
              {activeEnrollment.program.title}
            </p>
            <span className="text-xs font-bold text-brand shrink-0">{progressPct}%</span>
          </div>
          <div className="h-1 bg-charcoal-border rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-slate-500">
            Week {activeEnrollment.current_week || 1} of {activeEnrollment.program.num_cycles || activeEnrollment.program.duration_weeks || "?"}
            {" · "}{completedCount} sessions logged
          </p>
        </div>
      )}
    </div>
  );
}
