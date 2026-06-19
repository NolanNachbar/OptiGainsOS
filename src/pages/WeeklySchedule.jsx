import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, addWeeks, subWeeks, startOfWeek, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronDown, Dumbbell, Timer, Moon, Check, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { useCardioCompletions } from "@/hooks/useCardioCompletions";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { getProgramSchedule } from "@/utils/programSchedule";
import { getWorkoutMuscleGroups } from "@/utils/fatigueManagement";

const RUN_NAMES = ["zone 2 run", "zone2 run", "400m sprint", "sprint", "run", "cardio"];
const isRun = (ex) => RUN_NAMES.some(k => ex.name?.toLowerCase().includes(k));

// Vapor × Macro day-type pills — neutral by default; only CARDIO owns its
// on-semantic blue (carbs/cardio). Strength/mixed/two-a-day stay neutral so
// the strict hue grammar isn't borrowed as a categorical palette.
const TYPE_PILLS = {
  STRENGTH:  { bg: "var(--color-border-soft)",         fg: "var(--text-muted)", label: "STRENGTH" },
  CARDIO:    { bg: "rgba(var(--hue-blue-rgb) / 0.14)", fg: "var(--hue-blue)",   label: "CARDIO" },
  MIXED:     { bg: "var(--color-border-soft)",         fg: "var(--text-muted)", label: "MIXED" },
  TWO_A_DAY: { bg: "var(--color-border-soft)",         fg: "var(--text-muted)", label: "TWO-A-DAY" },
  REST:      { bg: "var(--color-border-soft)",         fg: "var(--text-muted)", label: "REST" },
};

function dayType(entries, log) {
  const entry = entries[0];
  const lifts = entry ? (entry.exercises || []).filter(ex => !isRun(ex)) : [];
  const runs = entry ? (entry.cardio_sessions || []) : [];
  const hasLift = lifts.length > 0 || (log && (log.exercises || []).some(ex => !isRun(ex)));
  const hasRun = runs.length > 0 || (log && (log.exercises || []).some(isRun));
  if (hasLift && hasRun) {
    const split = runs.some(r => r.time_of_day === "am" || r.time_of_day === "pm");
    return split ? "TWO_A_DAY" : "MIXED";
  }
  if (hasLift) return "STRENGTH";
  if (hasRun) return "CARDIO";
  return "REST";
}

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
  const [showAllMuscles, setShowAllMuscles] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const { enrollments, isLoading: enrollmentsLoading, isError: enrollmentsError } = useEnrollments();

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekDateStrs = weekDays.map(d => format(d, "yyyy-MM-dd"));

  const { data: weekLogs = [], isLoading: logsLoading, isError: logsError, refetch: refetchLogs } = useQuery({
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

  const { isDone: isCardioDone, toggle: toggleCardio } = useCardioCompletions(format(selectedDay, "yyyy-MM-dd"));

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
  const selectedDayType = dayType(selectedEntries, selectedLog);
  const isTwoADay = selectedDayType === "TWO_A_DAY";

  const totalWorkouts = activeEnrollment
    ? (activeEnrollment.program?.days_per_week || 1) * (activeEnrollment.program?.num_cycles || activeEnrollment.program?.duration_weeks || 4)
    : 0;
  const completedCount = activeEnrollment?.completed_workouts?.length || 0;
  const progressPct = totalWorkouts > 0 ? Math.min(100, Math.round((completedCount / totalWorkouts) * 100)) : 0;

  const hasAnything = selectedEntries.length > 0 || !!selectedLog;

  // The upcoming-program card renders its own (coral when today) CTA. We only
  // add a persistent thumb-zone action when that inline CTA isn't shown, so the
  // selected day always has a clear next action without nesting it three deep.
  const hasInlineProgramCta = !selectedLog && selectedEntries.length > 0;

  // Weekly per-muscle SET volume — aggregate prescribed hard sets across the
  // displayed week (Mon–Sun) per muscle group. Surfaces the Program Synthesis
  // engine's volume allocation that the page already holds in programEntries.
  const muscleVolume = useMemo(() => {
    const totals = {};
    const weekSet = new Set(
      Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"))
    );
    for (const entry of programEntries) {
      if (!weekSet.has(entry.date)) continue;
      for (const ex of entry.exercises || []) {
        if (isRun(ex)) continue;
        const sets = Number(ex.sets) || 0;
        if (!sets) continue;
        for (const m of getWorkoutMuscleGroups([ex])) {
          totals[m] = (totals[m] || 0) + sets;
        }
      }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [programEntries, weekStart]);

  const totalWeeklySets = muscleVolume.reduce((sum, [, n]) => sum + n, 0);
  const maxMuscleSets = muscleVolume.length ? muscleVolume[0][1] : 0;
  const MUSCLE_PREVIEW = 7;
  const visibleMuscleVolume = showAllMuscles ? muscleVolume : muscleVolume.slice(0, MUSCLE_PREVIEW);
  const hiddenMuscleCount = muscleVolume.length - MUSCLE_PREVIEW;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Week nav */}
      <div className="flex items-center justify-between mb-3 px-1 rise-in">
        <button
          onClick={() => setWeekStart(w => subWeeks(w, 1))}
          aria-label="Previous week"
          className="w-11 h-11 rounded-full flex items-center justify-center glass-inset text-muted-2 hover:text-ink transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-technical text-[13px] font-extrabold text-ink">
          {format(weekStart, "MMM d")} — {format(addDays(weekStart, 6), "MMM d")}
        </span>
        <button
          onClick={() => setWeekStart(w => addWeeks(w, 1))}
          aria-label="Next week"
          className="w-11 h-11 rounded-full flex items-center justify-center glass-inset text-muted-2 hover:text-ink transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Week rows — date · type pill · detail · status */}
      <div className="glass px-3.5 pt-3 pb-2.5 mb-4 rise-in">
        {logsLoading || enrollmentsLoading ? (
          weekDays.map((_, i) => (
            <div key={i} className="data-row">
              <div className="w-[38px] h-9 rounded bg-charcoal-borderSoft animate-pulse shrink-0" />
              <div className="flex-1 h-4 rounded-full bg-charcoal-borderSoft animate-pulse" />
            </div>
          ))
        ) : logsError || enrollmentsError ? (
          <div className="py-4 flex flex-col items-center gap-2">
            <p className="text-[12px] font-semibold text-muted-2">Could not load your schedule.</p>
            <button onClick={() => refetchLogs()} className="cta-ghost text-[12px] px-4 py-1.5 min-h-[44px]">
              Retry
            </button>
          </div>
        ) : weekDays.map((day, i) => {
          const log = getLogForDay(day);
          const entries = getEntriesForDay(day);
          const isSelected = isSameDay(day, selectedDay);
          const isCurrentDay = isSameDay(day, new Date());
          const type = dayType(entries, log);
          const pill = TYPE_PILLS[type];
          const mins = log?.duration_seconds ? Math.round(log.duration_seconds / 60) : null;
          const detail = log
            ? getWorkoutSplitTitle(log, entries[0]?.title)
            : entries[0]?.title || "—";

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(day)}
              className={`data-row w-full text-left transition-colors ${isSelected ? "bg-white/[0.04] rounded-xl -mx-1.5 px-1.5" : ""}`}
            >
              <div className={`w-[38px] shrink-0 text-center font-technical ${isCurrentDay ? "bg-brand/15 rounded py-1" : ""}`}>
                <span className={`block text-[9.5px] font-bold tracking-[0.1em] ${isCurrentDay ? "text-brandTint" : "text-muted-2"}`}>
                  {format(day, "EEE").slice(0, 2).toUpperCase()}
                </span>
                <span className={`block text-[15px] font-extrabold ${isCurrentDay ? "text-brandTint" : "text-ink"}`}>
                  {format(day, "d")}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className="inline-block rounded-full px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-wide whitespace-nowrap"
                  style={{ background: pill.bg, color: pill.fg }}
                >
                  {pill.label}
                </span>
                <div className="text-[11px] font-semibold text-muted-2 mt-0.5 truncate">
                  {detail}
                </div>
              </div>
              {log ? (
                <div className="text-right shrink-0">
                  <Check className="w-3.5 h-3.5 inline-block text-leaf" />
                  <div className="font-technical text-[10.5px] font-bold text-leaf whitespace-nowrap">
                    {mins ? `${mins} min` : `${(log.exercises || []).length} ex`}
                  </div>
                </div>
              ) : isCurrentDay && type !== "REST" ? (
                <span className="text-[10.5px] font-extrabold text-brand whitespace-nowrap shrink-0">UP NEXT</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      <div className="mb-6">
        <h2 className="type-display text-[17px] mb-3">
          {format(selectedDay, "EEEE")}
          <span className="text-muted-2 font-semibold text-[13px] ml-2">{format(selectedDay, "MMMM d")}</span>
        </h2>

        {!hasAnything ? (
          <div className="glass py-10 flex flex-col items-center gap-2 rise-in-2">
            <Moon className="w-6 h-6 text-faint" />
            <span className="section-label !text-faint">Rest Day</span>
          </div>
        ) : (
          <div className="space-y-3">

            {/* ── Completed lift from log ── */}
            {selectedLog && (() => {
              const logLifts = (selectedLog.exercises || []).filter(ex => !isRun(ex));
              const logRuns = (selectedLog.exercises || []).filter(isRun);
              const mins = selectedLog.duration_seconds ? Math.round(selectedLog.duration_seconds / 60) : null;
              return (
                <div className="glass overflow-hidden rise-in-2">
                  <div className="px-4 pt-3.5 pb-2 flex items-start justify-between">
                    <div>
                      <p className="section-label !text-leaf mb-1">
                        {isTwoADay ? "AM — Completed" : "Completed"}
                      </p>
                      <h3 className="text-[15px] font-extrabold text-ink leading-tight">
                        {getWorkoutSplitTitle(selectedLog, selectedEntries[0]?.title)}
                      </h3>
                      {mins && <p className="font-technical text-[11px] font-semibold text-muted-2 mt-0.5">{mins} min</p>}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-leaf/15 flex items-center justify-center shrink-0 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-leaf" />
                    </div>
                  </div>
                  {logLifts.length > 0 && (
                    <div className="px-4 pb-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Dumbbell className="w-3 h-3 text-muted-2" />
                        <span className="section-label">Exercises</span>
                      </div>
                      <div>
                        {logLifts.map((ex, j) => (
                          <div key={j} className="data-row justify-between gap-2">
                            <span className="text-[13px] font-semibold text-ink truncate">{ex.name}</span>
                            <span className="pill-value text-[11.5px] text-muted-2 shrink-0">{formatSets(ex)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {logRuns.length > 0 && (
                    <div className="px-4 pb-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Timer className="w-3 h-3 text-carb" />
                        <span className="section-label !text-carb">Cardio</span>
                      </div>
                      <div>
                        {logRuns.map((ex, j) => (
                          <div key={j} className="data-row justify-between gap-2">
                            <span className="text-[13px] font-semibold text-ink truncate">{ex.name}</span>
                            <span className="pill-value text-[11.5px] text-muted-2 shrink-0">{formatSets(ex)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Upcoming program workout (no log yet) ── */}
            {!selectedLog && selectedEntries.map((entry, idx) => {
              const lifts = (entry.exercises || []).filter(ex => !isRun(ex));
              return (
                <div key={idx} className="glass overflow-hidden rise-in-2">
                  <div className="px-4 pt-3.5 pb-1">
                    <p className="section-label mb-1">
                      {isTwoADay ? "AM — Strength" : activeEnrollment?.program?.title || "Program"}
                    </p>
                    <h3 className="text-[15px] font-extrabold text-ink leading-tight">{entry.title}</h3>
                  </div>
                  {lifts.length > 0 && (
                    <div className="px-4 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Dumbbell className="w-3 h-3 text-muted-2" />
                        <span className="section-label">Lifting</span>
                      </div>
                      <div>
                        {lifts.map((ex, j) => (
                          <div key={j} className="data-row justify-between">
                            <span className="text-[13px] font-semibold text-ink truncate">{ex.name}</span>
                            <span className="pill-value text-[11.5px] text-muted-2 shrink-0">
                              {ex.sets > 1 ? `${ex.sets} × ` : ""}{ex.rep_target || ex.reps || "—"} <span className="text-[9.5px] font-semibold">reps</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="px-4 pb-4 pt-2">
                    {isToday ? (
                      <button
                        className="cta-coral w-full"
                        onClick={() => navigate(`/workout-detail?source=program&enrollmentId=${entry.enrollmentId}&programWorkoutId=${entry.programWorkoutId}`)}
                      >
                        Start Session
                      </button>
                    ) : (
                      <button
                        className="cta-ghost w-full"
                        onClick={() => navigate(`/workout-detail?source=program&enrollmentId=${entry.enrollmentId}&programWorkoutId=${entry.programWorkoutId}`)}
                      >
                        View Workout
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Prescribed cardio with check-off ── */}
            {selectedEntries.map((entry, idx) => {
              const runs = entry.cardio_sessions || [];
              if (!runs.length) return null;
              return (
                <div key={idx} className="glass overflow-hidden rise-in-3">
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Timer className="w-3.5 h-3.5 text-carb" />
                      <span className="section-label !text-carb">{isTwoADay ? "PM — Run" : "Cardio"}</span>
                    </div>
                    {isTwoADay && (
                      <p className="text-[11px] font-semibold text-muted-2 mb-3">
                        ~6h separation from AM session
                      </p>
                    )}
                    {!isTwoADay && <div className="mb-2" />}
                    <div className="space-y-3">
                      {runs.map((ex, j) => {
                        const name = ex.title || `${ex.zone || 'Z2'} ${ex.activity_type || 'run'}`;
                        const done = isCardioDone(name);
                        return (
                          <div key={j} className="flex items-start justify-between gap-3">
                            <div className={done ? "opacity-50" : ""}>
                              <div className="flex items-baseline gap-2">
                                <span className={`text-[15px] font-extrabold ${done ? "line-through text-muted-2" : "text-ink"}`}>{name}</span>
                                <span className="font-technical text-[12px] font-semibold text-muted-2">{ex.duration_minutes} min</span>
                              </div>
                              {ex.notes && <p className="text-[11px] text-muted-2 mt-0.5">{ex.notes}</p>}
                            </div>
                            <button
                              onClick={() => toggleCardio(name)}
                              aria-label={done ? `Mark ${name} not done` : `Mark ${name} done`}
                              aria-pressed={done}
                              className="shrink-0 p-2.5 -m-2.5 mt-[-8px] rounded-full"
                            >
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                done
                                  ? "bg-leaf/15 text-leaf"
                                  : "border-[1.5px] border-white/[0.18] hover:border-carb"
                              }`}>
                                {done && <CheckCircle2 className="w-4 h-4" />}
                              </span>
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

        {/* Persistent primary action — the selected day always has a clear next
            step even when the inline program card doesn't render its own CTA. */}
        {isToday && !hasInlineProgramCta && (
          selectedLog ? (
            <button
              className="cta-ghost w-full mt-3 rise-in-3"
              onClick={() => navigate("/quick-workout")}
            >
              Log another session
            </button>
          ) : (
            <button
              className="cta-coral w-full mt-3 rise-in-3"
              onClick={() => navigate("/quick-workout")}
            >
              Start today's session
            </button>
          )
        )}
      </div>

      {/* Weekly volume — secondary analytics, collapsed by default so the
          selected-day session + action lead the page. Tap to expand the
          per-muscle set breakdown. */}
      {muscleVolume.length > 0 && (
        <div className="glass px-4 py-3.5 mb-4 rise-in-3">
          <button
            onClick={() => setShowVolume(v => !v)}
            aria-expanded={showVolume}
            className="w-full min-h-[44px] flex items-center justify-between"
          >
            <span className="section-label">Weekly Volume</span>
            <span className="flex items-center gap-2">
              <span className="font-technical text-[11px] font-extrabold text-muted-2">
                {totalWeeklySets} sets · {muscleVolume.length} muscles
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-2 transition-transform ${showVolume ? "rotate-180" : ""}`} />
            </span>
          </button>
          {showVolume && (
            <>
              <div className="space-y-1.5 mt-2.5">
                {visibleMuscleVolume.map(([muscle, sets]) => (
                  <div key={muscle} className="data-row gap-2 flex-col !items-stretch">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink capitalize truncate">
                        {muscle.replace(/_/g, " ")}
                      </span>
                      <span className="pill-value text-[11.5px] text-muted-2 shrink-0">
                        {sets} <span className="text-[9.5px] font-semibold">sets</span>
                      </span>
                    </div>
                    <div className="h-1 bg-charcoal-borderSoft rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal rounded-full transition-all"
                        style={{ width: `${maxMuscleSets > 0 ? Math.round((sets / maxMuscleSets) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {hiddenMuscleCount > 0 && (
                <button
                  onClick={() => setShowAllMuscles(v => !v)}
                  aria-expanded={showAllMuscles}
                  className="w-full mt-2.5 py-2 min-h-[44px] text-[11px] font-extrabold uppercase tracking-wide text-muted-2 hover:text-ink transition-colors"
                >
                  {showAllMuscles ? "Show less" : `Show all ${muscleVolume.length}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Program progress */}
      {activeEnrollment?.program && (
        <div className="glass px-4 py-3 rise-in-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="section-label truncate flex-1 mr-2">
              {activeEnrollment.program.title}
            </p>
            <span className="font-technical text-xs font-extrabold text-teal shrink-0">{progressPct}%</span>
          </div>
          <div className="h-1 bg-charcoal-borderSoft rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-teal rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="font-technical text-[11px] font-semibold text-muted-2">
            Week {activeEnrollment.current_week || 1} of {activeEnrollment.program.num_cycles || activeEnrollment.program.duration_weeks || "?"}
            {" · "}{completedCount} sessions logged
          </p>
        </div>
      )}
    </div>
  );
}
