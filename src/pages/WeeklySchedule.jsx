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

// The week query orders logs by duration_seconds DESC and the row picks the
// longest log per day, so a single runaway duration_seconds (a session left
// "open" for hours, a clock skew) renders as e.g. "398 min" and dominates the
// scan column. Guard: anything past a plausible single-session ceiling is
// treated as corrupt and falls back to the exercise count instead of a number
// that lies. Below the ceiling, format > ~90 min as h:mm so a long-but-real
// session reads as "1:48" rather than a bare three-digit minute count.
const MAX_PLAUSIBLE_SESSION_MIN = 240; // 4h hard ceiling for one logged session
function formatDuration(seconds) {
  if (!seconds) return null;
  const mins = Math.round(seconds / 60);
  if (mins <= 0 || mins > MAX_PLAUSIBLE_SESSION_MIN) return null; // implausible → caller falls back
  if (mins <= 90) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

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

// Shared chip primitive for this page: the day-type pill and the "Show all /
// Show less" micro-label both render through the SAME chip so the page has one
// chip voice instead of two hand-rolled ones. Typography rides .section-label
// (the og-cap: Manrope 700, 0.06em, uppercase) so casing/tracking/weight match
// every other label on the page; only the fill/ink tint varies per call.
function Chip({ children, bg = "var(--color-border-soft)", fg, className = "" }) {
  return (
    <span
      className={`section-label inline-block rounded-full px-2 py-[3px] whitespace-nowrap ${className}`}
      style={{ background: bg, ...(fg ? { color: fg } : null) }}
    >
      {children}
    </span>
  );
}

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

// THE one set/rep grammar for the whole page. Both the logged-session branch
// (formatSets) and the upcoming-program branch (formatPrescribed) funnel through
// this so a completed row and a prescribed row read identically:
//   "N×R" (reps known) · "N×W lb" (load only) · "N sets"/"1 set" (count only).
// `repToken`, when present, may carry trailing units ("8 reps") or a load
// suffix ("8 @ 210"); a missing/zero rep figure degrades, never emitting a
// "290 × 0".
function formatSetRep(count, repToken) {
  const n = Number(count) || 1;
  if (repToken) return `${n}×${repToken}`;
  return n === 1 ? "1 set" : `${n} sets`;
}

// Logged session: derive the rep token from completed sets, never zero-reps.
function formatSets(exercise) {
  const sets = (exercise.sets || []).filter(s => s.completed !== false);
  if (!sets.length) return "";
  const w = sets[0]?.weight;
  const r = sets[0]?.reps;
  const hasReps = Number(r) > 0;
  const allSame = sets.every(s => s.weight === w && s.reps === r);
  if (allSame && hasReps) {
    return formatSetRep(sets.length, w ? `${r} @ ${w}` : `${r}`);
  }
  // No usable rep figure — show the load alone, else just the set count.
  if (w) return formatSetRep(sets.length, `${w} lb`);
  return formatSetRep(sets.length, null);
}

// Prescribed program exercise: rep target known -> "N×R reps", else set count.
function formatPrescribed(exercise) {
  const reps = exercise.rep_target || exercise.reps;
  const sets = Number(exercise.sets) || 1;
  return formatSetRep(sets, reps ? `${reps} reps` : null);
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
  // The completed-session card starts expanded when the selected day is today,
  // so the day the user lands on immediately shows its logged exercises rather
  // than a collapsed summary. Selecting another day re-derives this from
  // whether THAT day is today (see selectDay below).
  // selectedDay defaults to today, so the completed card opens on mount.
  const [showCompleted, setShowCompleted] = useState(true);

  // One entry point for picking a day so the completed-card default-expand stays
  // tied to "is the tapped day today" without an effect chasing selectedDay.
  const selectDay = (day) => {
    setSelectedDay(day);
    setShowCompleted(isSameDay(day, new Date()));
  };
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
  // Day echo folded into each card's section-label so identity survives without
  // a redundant standalone caption above the card (e.g. "Fri — Completed").
  // ONE casing convention: source strings stay title-case ("Fri — Completed");
  // .section-label owns the uppercase transform so every echo renders the same
  // way without each call-site pre-uppercasing (which fought the title-cased
  // words after the em-dash).
  const dayEcho = format(selectedDay, "EEE");

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
    <div className="max-w-2xl mx-auto px-4 py-6 pb-6">
      {/* Week nav */}
      <div className="flex items-center justify-between mb-3 px-1 rise-in">
        <button
          onClick={() => setWeekStart(w => subWeeks(w, 1))}
          aria-label="Previous week"
          className="w-11 h-11 rounded-full flex items-center justify-center glass-inset text-muted-2 hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-technical text-[13px] font-extrabold text-ink">
          {format(weekStart, "MMM d")} — {format(addDays(weekStart, 6), "MMM d")}
        </span>
        <button
          onClick={() => setWeekStart(w => addWeeks(w, 1))}
          aria-label="Next week"
          className="w-11 h-11 rounded-full flex items-center justify-center glass-inset text-muted-2 hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Week rows — date · type pill · detail · status */}
      <div className="glass px-3.5 pt-2.5 pb-2 mb-4 rise-in">
        {logsLoading || enrollmentsLoading ? (
          weekDays.map((_, i) => (
            <div key={i} className="data-row">
              <div className="w-[38px] h-9 rounded bg-track pulse-loop shrink-0" />
              <div className="flex-1 h-4 rounded-full bg-track pulse-loop" />
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
          const detail = log
            ? getWorkoutSplitTitle(log, entries[0]?.title)
            : entries[0]?.title || "—";

          return (
            <button
              key={i}
              onClick={() => selectDay(day)}
              className={`data-row w-full min-h-[44px] items-center py-2 text-left transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-track ${isSelected ? "glass-inset -mx-1.5 px-1.5" : ""}`}
            >
              <div className={`w-[38px] shrink-0 text-center font-technical ${isCurrentDay ? "glass-inset py-1" : ""}`}>
                <span className={`block text-[11px] font-bold tracking-[0.08em] ${isCurrentDay ? "text-ink" : "text-muted-2"}`}>
                  {format(day, "EEE").slice(0, 2).toUpperCase()}
                </span>
                <span className={`block text-[15px] font-extrabold text-ink`}>
                  {format(day, "d")}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <Chip bg={pill.bg} fg={pill.fg}>{pill.label}</Chip>
                <div className="text-[11px] font-semibold text-muted-2 mt-0.5 truncate">
                  {detail}
                </div>
              </div>
              {/* Shared fixed-width trailing status slot so completed / up-next /
                  future rows align on one scan column instead of a ragged rail.
                  The high-contrast (ink) trailing slot is RESERVED for the one
                  actionable day — today's 'UP NEXT' + chevron — so the page still
                  answers "what's next" even when today is fully logged. A logged
                  day reads as a quiet neutral check; its minute count is demoted
                  into the expandable detail card below (it was poaching the
                  attention the next action needs). */}
              <div className="w-[68px] shrink-0 flex items-center justify-end text-right">
                {isCurrentDay && type !== "REST" && !log ? (
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    <span className="section-label !text-ink">UP NEXT</span>
                    <ChevronRight className="w-3.5 h-3.5 text-ink" />
                  </span>
                ) : log ? (
                  <Check className="w-4 h-4 text-muted-2" />
                ) : type !== "REST" ? (
                  <ChevronRight className="w-4 h-4 text-faint" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day — each card's own section-label now carries the day echo
          ("FRI — COMPLETED" / "FRI — STRENGTH"), so the standalone day caption is
          dropped to avoid a redundant header above the card that repeats it. */}
      <div className="mb-6">
        {!hasAnything ? (
          <div className="glass py-10 flex flex-col items-center gap-2 rise-in-2">
            <Moon className="w-6 h-6 text-faint" />
            <span className="section-label !text-faint">Rest Day</span>
          </div>
        ) : (
          <div className="space-y-3">

            {/* ── Completed lift from log — collapsed by default so it doesn't
                dominate the fold and bury the 'Log another session' CTA. ── */}
            {selectedLog && (() => {
              const logLifts = (selectedLog.exercises || []).filter(ex => !isRun(ex));
              const logRuns = (selectedLog.exercises || []).filter(isRun);
              const dur = formatDuration(selectedLog.duration_seconds);
              const exCount = logLifts.length + logRuns.length;
              return (
                <div className="glass overflow-hidden rise-in-2">
                  <button
                    onClick={() => setShowCompleted(v => !v)}
                    aria-expanded={showCompleted}
                    className="w-full min-h-[44px] px-4 pt-3.5 pb-3 flex items-start justify-between gap-3 text-left transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-track"
                  >
                    <div className="min-w-0">
                      <p className="section-label mb-1">
                        {isTwoADay ? `${dayEcho} AM — Completed` : `${dayEcho} — Completed`}
                      </p>
                      <h3 className="type-display text-[15px] leading-tight truncate">
                        {getWorkoutSplitTitle(selectedLog, selectedEntries[0]?.title)}
                      </h3>
                      <p className="font-technical text-[11px] font-semibold text-muted-2 mt-0.5 tabular-nums">
                        {dur ? `${dur} · ` : ""}{exCount} {exCount === 1 ? "exercise" : "exercises"}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="w-6 h-6 rounded-full glass-inset flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-ink" />
                      </span>
                      <ChevronDown className={`w-4 h-4 text-muted-2 transition-transform duration-200 [transition-timing-function:var(--ease)] ${showCompleted ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  {showCompleted && (
                    <div className="rise-in">
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
                                <span className="pill-value pill-value--sm text-muted-2 shrink-0">{formatSets(ex)}</span>
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
                                <span className="pill-value pill-value--sm text-muted-2 shrink-0">{formatSets(ex)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
                      {isTwoADay ? `${dayEcho} AM — Strength` : `${dayEcho} — ${activeEnrollment?.program?.title || "Program"}`}
                    </p>
                    <h3 className="type-display text-[15px] leading-tight">{entry.title}</h3>
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
                            <span className="pill-value pill-value--sm text-muted-2 shrink-0">{formatPrescribed(ex)}</span>
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
                          <div key={j} className="flex items-center justify-between gap-3">
                            <div className={done ? "opacity-50" : ""}>
                              <div className="flex items-baseline gap-2">
                                <span className={`text-[13px] font-semibold text-ink ${done ? "line-through text-muted-2" : ""}`}>{name}</span>
                                <span className="font-technical text-[12px] font-semibold text-muted-2 tabular-nums">{ex.duration_minutes} min</span>
                              </div>
                              {ex.notes && <p className="text-[11px] text-muted-2 mt-0.5">{ex.notes}</p>}
                            </div>
                            <button
                              onClick={() => toggleCardio(name)}
                              aria-label={done ? `Mark ${name} not done` : `Mark ${name} done`}
                              aria-pressed={done}
                              className="shrink-0 p-2.5 -m-2.5 rounded-full transition-transform duration-200 [transition-timing-function:var(--ease)] active:scale-95"
                            >
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 [transition-timing-function:var(--ease)] ${
                                done
                                  ? "glass-inset text-ink"
                                  : "border border-carb/40"
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
            className="w-full min-h-[44px] flex items-center justify-between rounded-xl transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-track"
          >
            <span className="section-label">Weekly Volume</span>
            <span className="flex items-center gap-2">
              <span className="font-technical text-[11px] font-extrabold text-muted-2 tabular-nums">
                {totalWeeklySets} sets · {muscleVolume.length} muscles
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-2 transition-transform duration-200 [transition-timing-function:var(--ease)] ${showVolume ? "rotate-180" : ""}`} />
            </span>
          </button>
          {showVolume && (
            <div className="rise-in">
              <div className="space-y-1.5 mt-2.5">
                {visibleMuscleVolume.map(([muscle, sets]) => (
                  <div key={muscle} className="data-row gap-2 flex-col !items-stretch">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink capitalize truncate">
                        {muscle.replace(/_/g, " ")}
                      </span>
                      <span className="pill-value pill-value--sm text-muted-2 shrink-0">
                        {sets} <span className="text-[11px] font-semibold">sets</span>
                      </span>
                    </div>
                    <div className="h-1 bg-track rounded-full overflow-hidden">
                      <div
                        className="h-full bg-viz-1 rounded-full transition-all duration-200 [transition-timing-function:var(--ease)]"
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
                  className="w-full mt-2.5 py-2 min-h-[44px] flex items-center justify-center transition-colors duration-200 [transition-timing-function:var(--ease)]"
                >
                  <Chip>{showAllMuscles ? "Show less" : `Show all ${muscleVolume.length}`}</Chip>
                </button>
              )}
            </div>
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
            <span className="font-technical text-xs font-extrabold text-muted-2 shrink-0 tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-1 bg-track rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-viz-1 rounded-full transition-all duration-200 [transition-timing-function:var(--ease)]" style={{ width: `${progressPct}%` }} />
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
