import { nowInTz, getTodayString } from '@/utils/dateUtils';
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, addWeeks, subWeeks, startOfWeek, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronDown, Moon, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { useCardioCompletions } from "@/hooks/useCardioCompletions";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { useProfile } from "@/hooks/useUserQueries";
import { getProgramSchedule } from "@/utils/programSchedule";
import WeekTemplateSwap from "@/components/program/WeekTemplateSwap";
import { getWorkoutMuscleGroups } from "@/utils/fatigueManagement";
import { workSets } from "@/utils/setTypes";
import {
  Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, IconButton,
  ListRow, LoadingState, PageHeader, SectionLabel, Stat, cn,
} from "@/components/ui";

const RUN_NAMES = ["zone 2 run", "zone2 run", "400m sprint", "sprint", "run", "cardio"];
const isRun = (ex) => RUN_NAMES.some(k => ex.name?.toLowerCase().includes(k));

// The week query orders logs by duration_seconds DESC and the row picks the
// longest log per day, so a single runaway duration_seconds (a session left
// "open" for hours, a clock skew) renders as e.g. "398 min" and dominates the
// scan column. Guard: anything past a plausible single-session ceiling is
// treated as corrupt and falls back to the exercise count instead of a number
// that lies. The floor catches the other end — a sub-5-min "session" (a log
// opened and abandoned, or leftover seed data) is just as implausible as a
// 4-hour one, and surfacing "2 min" makes a real workout read as broken/test
// data; below the floor we drop the duration and let the exercise count carry
// the card. Below the ceiling, format > ~90 min as h:mm so a long-but-real
// session reads as "1:48" rather than a bare three-digit minute count.
const MIN_PLAUSIBLE_SESSION_MIN = 5;   // sub-5-min log reads as abandoned/seed
const MAX_PLAUSIBLE_SESSION_MIN = 240; // 4h hard ceiling for one logged session
function formatDuration(seconds) {
  if (!seconds) return null;
  const mins = Math.round(seconds / 60);
  if (mins < MIN_PLAUSIBLE_SESSION_MIN || mins > MAX_PLAUSIBLE_SESSION_MIN) return null; // implausible → caller falls back
  if (mins <= 90) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const TYPE_LABELS = {
  STRENGTH: "Strength",
  CARDIO: "Cardio",
  MIXED: "Mixed",
  TWO_A_DAY: "Two-a-day",
  REST: "Rest",
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
  const sets = workSets(exercise.sets).filter(s => s.completed !== false);
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
      if (scheduledTitle.includes("Volume")) suffix = ", Volume";
      else if (scheduledTitle.includes("Intensity")) suffix = ", Intensity";
      else if (scheduledTitle.includes("Steady")) suffix = ", Steady";
      else if (scheduledTitle.includes("Push")) suffix = ", Push";
      else if (scheduledTitle.includes("Back Off")) suffix = ", Back Off";
    }
    return `Upper Body Session${suffix}`;
  } else if (lowerCount > upperCount) {
    let suffix = "";
    if (scheduledTitle) {
      if (scheduledTitle.includes("Squat")) suffix = ", Squat";
      else if (scheduledTitle.includes("Hinge")) suffix = ", Hinge";
      else if (scheduledTitle.includes("Steady")) suffix = ", Steady";
      else if (scheduledTitle.includes("Push")) suffix = ", Push";
      else if (scheduledTitle.includes("Back Off")) suffix = ", Back Off";
    }
    return `Lower Body Session${suffix}`;
  }
  
  return scheduledTitle || "Lifting Session";
};

export default function WeeklySchedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Read the profile before the day state: every "today" on this screen is the
  // athlete's local day, not the browser's. They agree most of the time and
  // disagree exactly when it matters — near midnight, and when he logs from a
  // device in another timezone, which is when the wrong day gets highlighted
  // and the wrong day's session gets opened.
  const { profile } = useProfile();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(nowInTz(profile?.timezone), { weekStartsOn: 1 })
  );
  const [selectedDay, setSelectedDay] = useState(() => nowInTz(profile?.timezone));
  const [showAllMuscles, setShowAllMuscles] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  // The completed-session card starts COLLAPSED on every day (today included):
  // a 13-exercise log expanded by default buried the 'Log another session' CTA
  // below the fold. The summary header (title + duration + count) leads; tap to
  // expand the per-exercise breakdown. Selecting another day keeps it collapsed.
  const [showCompleted, setShowCompleted] = useState(false);

  // One entry point for picking a day. The completed card stays collapsed on
  // day change so the next-action CTA stays reachable without scrolling past a
  // long exercise list.
  const selectDay = (day) => {
    setSelectedDay(day);
    setShowCompleted(false);
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
    return getProgramSchedule(activeEnrollment, activeEnrollment.program.workouts, profile?.timezone);
  }, [activeEnrollment, profile?.timezone]);

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
  const isToday = isSameDay(selectedDay, nowInTz(profile?.timezone));
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

  // The upcoming-program card renders its own (teal when today) CTA. We only
  // add a persistent thumb-zone action when that inline CTA isn't shown, so the
  // selected day always has a clear next action without nesting it three deep.
  const hasInlineProgramCta = !selectedLog && selectedEntries.length > 0;

  // ── Hero block for the selected day ──────────────────────────────────────
  // The selected day's session is the page's protagonist, so it leads with ONE
  // headline figure (the largest text element on the page): the exercise
  // count. The week-row list + program stat tiles below are subordinate to it.
  // Title + eyebrow live HERE so the cards below don't restate the day echo —
  // the day name appears in exactly one band.
  const heroLifts = selectedLog
    ? (selectedLog.exercises || []).filter(ex => !isRun(ex))
    : (selectedEntries[0]?.exercises || []).filter(ex => !isRun(ex));
  const heroRuns = selectedLog
    ? (selectedLog.exercises || []).filter(isRun)
    : (selectedEntries[0]?.cardio_sessions || []);
  const heroCount = heroLifts.length + heroRuns.length;
  const heroDur = selectedLog ? formatDuration(selectedLog.duration_seconds) : null;
  const heroTitle = selectedLog
    ? getWorkoutSplitTitle(selectedLog, selectedEntries[0]?.title)
    : (selectedEntries[0]?.title || "Session");
  const heroEyebrow = `${isToday ? "Today" : dayEcho}, ${selectedLog ? "Logged" : (activeEnrollment?.program?.title || "Planned")}`;

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

  // Week tally from logged sessions — used to fill the band above the dock in
  // the logged state when there's no program ("This Program" section absent).
  // Counts the week's logged sessions and the exercises across them so an
  // ad-hoc (no-program) week still answers "where is my training week at".
  const loggedSessionsThisWeek = weekLogs.length;
  const loggedExercisesThisWeek = weekLogs.reduce(
    (sum, l) => sum + (l.exercises || []).length, 0
  );
  const hasProgramSection = muscleVolume.length > 0 || !!activeEnrollment?.program;

  const MUSCLE_PREVIEW = 7;
  const visibleMuscleVolume = showAllMuscles ? muscleVolume : muscleVolume.slice(0, MUSCLE_PREVIEW);
  const hiddenMuscleCount = muscleVolume.length - MUSCLE_PREVIEW;

  const openEntry = (entry) =>
    navigate(`/workout-detail?source=program&enrollmentId=${entry.enrollmentId}&programWorkoutId=${entry.programWorkoutId}`);
  const weekRange = `${format(weekStart, "MMM d")} to ${format(addDays(weekStart, 6), "MMM d")}`;

  return (
    <div className="max-w-2xl mx-auto pb-[var(--dock-clearance)]">
      <PageHeader
        eyebrow={activeEnrollment?.program?.title}
        title="Schedule"
        meta={weekRange}
        action={
          <div className="flex items-center gap-1">
            <IconButton
              icon={ChevronLeft}
              label="Previous week"
              variant="plain"
              // Move the selected day with the week so the highlighted row and
              // the detail card stay inside the visible week.
              onClick={() => { setWeekStart(w => subWeeks(w, 1)); setSelectedDay(d => subWeeks(d, 1)); setShowCompleted(false); }}
            />
            <IconButton
              icon={ChevronRight}
              label="Next week"
              variant="plain"
              onClick={() => { setWeekStart(w => addWeeks(w, 1)); setSelectedDay(d => addWeeks(d, 1)); setShowCompleted(false); }}
            />
          </div>
        }
      />

      <div className="flex flex-col gap-stack">
        <div className="px-gutter">
          <WeekTemplateSwap
            programId={activeEnrollment?.program_id}
            weekDates={weekDays.map((d) => format(d, "yyyy-MM-dd"))}
            today={getTodayString(profile?.timezone)}
          />
        </div>

        {/* Week rows: date, workout, day type, status */}
        <Card>
          {logsLoading || enrollmentsLoading ? (
            <LoadingState rows={7} label="Loading schedule" />
          ) : logsError || enrollmentsError ? (
            <ErrorState title="Could not load your schedule" onRetry={() => refetchLogs()}>
              Check your connection and retry.
            </ErrorState>
          ) : weekDays.map((day, i) => {
            const log = getLogForDay(day);
            const entries = getEntriesForDay(day);
            const isSelected = isSameDay(day, selectedDay);
            const isCurrentDay = isSameDay(day, nowInTz(profile?.timezone));
            const type = dayType(entries, log);
            const isRest = type === "REST";
            const detail = log
              ? getWorkoutSplitTitle(log, entries[0]?.title)
              : entries[0]?.title || null;
            // The day type shows only when it differs from the prior row.
            const prevDay = i > 0 ? weekDays[i - 1] : null;
            const prevType = prevDay ? dayType(getEntriesForDay(prevDay), getLogForDay(prevDay)) : null;
            const showType = !isRest && type !== prevType;
            return (
              <ListRow
                key={i}
                selected={isSelected}
                onClick={() => selectDay(day)}
                chevron={!isRest && !log && !isCurrentDay}
                leading={
                  <span className={cn("w-[38px] text-center tabular-nums", isCurrentDay ? "text-ink" : "text-ink-muted")}>
                    <span className="block text-micro font-semibold uppercase tracking-[0.08em]">{format(day, "EEE").slice(0, 2)}</span>
                    <span className="block text-emph font-semibold">{format(day, "d")}</span>
                  </span>
                }
                title={<span className={cn(isRest && "text-ink-muted font-normal", log && "text-ink-secondary")}>{isRest ? "Rest" : detail || "Session"}</span>}
                detail={showType ? TYPE_LABELS[type] : undefined}
                trailing={
                  isCurrentDay && !isRest && !log ? (
                    <span className="text-micro font-semibold uppercase tracking-[0.08em] text-ink">Up next</span>
                  ) : log && !isSelected ? (
                    <CheckCircle2 aria-label="Logged" className="w-4 h-4 text-leaf" />
                  ) : null
                }
              />
            );
          })}
        </Card>

        {/* Selected day */}
        {!hasAnything ? (
          <Card>
            <EmptyState
              icon={Moon}
              title="Rest day"
              action={isToday ? (
                <Button variant="primary" size="lg" onClick={() => navigate("/recovery")}>
                  Log recovery
                </Button>
              ) : null}
            >
              {isToday
                ? "No session on the plan today. Log how recovery is going. Tomorrow's targets use it."
                : "No session scheduled. A planned rest day is part of the program."}
            </EmptyState>
            {(totalWeeklySets > 0 || activeEnrollment?.program) && (
              <div className="flex gap-4 px-gutter pb-4">
                {totalWeeklySets > 0 && <Stat size="sm" label="Sets this week" value={totalWeeklySets} />}
                {activeEnrollment?.program && <Stat size="sm" label="Program done" value={`${progressPct}%`} />}
              </div>
            )}
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <SectionLabel>{heroEyebrow}</SectionLabel>
                <CardTitle>{heroTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <Stat
                  size="md"
                  value={heroCount}
                  unit={heroCount === 1 ? "exercise" : "exercises"}
                  delta={heroDur || undefined}
                />
              </CardContent>
            </Card>

            {selectedLog && (() => {
              const logLifts = (selectedLog.exercises || []).filter(ex => !isRun(ex));
              const logRuns = (selectedLog.exercises || []).filter(isRun);
              return (
                <Card>
                  <button
                    onClick={() => setShowCompleted(v => !v)}
                    aria-expanded={showCompleted}
                    className="w-full min-h-tap px-gutter py-3 flex items-center justify-between gap-3 text-left transition-colors duration-base active:bg-charcoal-surface2"
                  >
                    <span className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">
                      {showCompleted ? "Hide exercises" : "View exercises"}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-ink-muted shrink-0 transition-transform duration-base", showCompleted && "rotate-180")} />
                  </button>
                  {showCompleted && (
                    <div>
                      {logLifts.map((ex, j) => (
                        <ListRow key={`l${j}`} title={ex.name} value={formatSets(ex)} />
                      ))}
                      {logRuns.length > 0 && <SectionLabel className="px-gutter pt-3 pb-1">Cardio</SectionLabel>}
                      {logRuns.map((ex, j) => (
                        <ListRow key={`r${j}`} title={ex.name} value={formatSets(ex)} />
                      ))}
                    </div>
                  )}
                </Card>
              );
            })()}

            {!selectedLog && selectedEntries.map((entry, idx) => {
              const lifts = (entry.exercises || []).filter(ex => !isRun(ex));
              return (
                <Card key={idx}>
                  {lifts.length > 0 && (
                    <>
                      <CardHeader className="pb-1">
                        <SectionLabel>{isTwoADay ? "AM, Lifting" : "Lifting"}</SectionLabel>
                      </CardHeader>
                      {lifts.map((ex, j) => (
                        <ListRow key={j} title={ex.name} value={formatPrescribed(ex)} />
                      ))}
                    </>
                  )}
                  <div className="px-gutter py-4">
                    {isToday ? (
                      <Button variant="primary" size="lg" className="w-full" onClick={() => openEntry(entry)}>
                        Start Session
                      </Button>
                    ) : (
                      <Button variant="secondary" size="lg" className="w-full" onClick={() => openEntry(entry)}>
                        View Workout
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}

            {selectedEntries.map((entry, idx) => {
              const runs = entry.cardio_sessions || [];
              if (!runs.length) return null;
              return (
                <Card key={`c${idx}`}>
                  <CardHeader className="pb-1">
                    <SectionLabel>{isTwoADay ? "PM, Run" : "Cardio"}</SectionLabel>
                    {isTwoADay && <p className="text-caption text-ink-muted">About 6 h after the AM session</p>}
                  </CardHeader>
                  {runs.map((ex, j) => {
                    const name = ex.title || `${ex.zone || 'Z2'} ${ex.activity_type || 'run'}`;
                    const done = isCardioDone(name);
                    return (
                      <ListRow
                        key={j}
                        title={<span className={cn(done && "line-through text-ink-muted")}>{name}</span>}
                        detail={ex.notes || undefined}
                        value={ex.duration_minutes}
                        unit="min"
                        trailing={
                          <IconButton
                            icon={CheckCircle2}
                            label={done ? `Mark ${name} not done` : `Mark ${name} done`}
                            aria-pressed={done}
                            onClick={() => toggleCardio(name)}
                            className={cn("-mr-3", done ? "text-leaf" : "text-ink-faint")}
                          />
                        }
                      />
                    );
                  })}
                </Card>
              );
            })}
          </>
        )}

        {isToday && !hasInlineProgramCta && hasAnything && (
          <div className="px-gutter">
            <Button variant="primary" size="lg" className="w-full" onClick={() => navigate("/quick-workout")}>
              {selectedLog ? "Log another session" : "Start today's session"}
            </Button>
          </div>
        )}

        {selectedLog && !hasProgramSection && loggedSessionsThisWeek > 0 && (
          <div className="flex gap-4 px-gutter">
            <Stat size="sm" label="This week" value={loggedSessionsThisWeek} unit={loggedSessionsThisWeek === 1 ? "session" : "sessions"} />
            {loggedExercisesThisWeek > 0 && (
              <Stat size="sm" label="Logged" value={loggedExercisesThisWeek} unit={loggedExercisesThisWeek === 1 ? "exercise" : "exercises"} />
            )}
          </div>
        )}

        {(muscleVolume.length > 0 || activeEnrollment?.program) && (
          <section aria-label="This program" className="flex flex-col gap-stack">
            {muscleVolume.length > 0 && (
              <Card>
                <button
                  onClick={() => setShowVolume(v => !v)}
                  aria-expanded={showVolume}
                  className="w-full min-h-tap px-gutter py-3 flex items-center justify-between transition-colors duration-base active:bg-charcoal-surface2"
                >
                  <span className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Weekly volume</span>
                  <span className="flex items-center gap-2">
                    <span className="text-caption text-ink-muted tabular-nums">
                      {totalWeeklySets} sets · {muscleVolume.length} muscles
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-ink-muted transition-transform duration-base", showVolume && "rotate-180")} />
                  </span>
                </button>
                {showVolume && (
                  <div>
                    {visibleMuscleVolume.map(([muscle, sets]) => (
                      <div key={muscle} className="px-gutter py-2 border-t border-charcoal-borderSoft">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-body text-ink capitalize truncate">{muscle.replace(/_/g, " ")}</span>
                          <span className="text-emph tabular-nums text-ink shrink-0">
                            {sets} <span className="text-caption font-normal text-ink-muted">sets</span>
                          </span>
                        </div>
                        <div className="h-1 bg-track rounded-pill overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-pill transition-[width] duration-slow ease-out"
                            style={{ width: `${maxMuscleSets > 0 ? Math.round((sets / maxMuscleSets) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {hiddenMuscleCount > 0 && (
                      <button
                        onClick={() => setShowAllMuscles(v => !v)}
                        aria-expanded={showAllMuscles}
                        className="w-full min-h-tap flex items-center justify-center text-caption text-ink-muted hover:text-ink border-t border-charcoal-borderSoft transition-colors duration-base"
                      >
                        {showAllMuscles ? "Show less" : `Show all ${muscleVolume.length}`}
                      </button>
                    )}
                  </div>
                )}
              </Card>
            )}

            {activeEnrollment?.program && (
              <Card>
                <CardContent className="pt-4 flex flex-col gap-2">
                  <Stat
                    size="sm"
                    label={activeEnrollment.program.title}
                    value={`${progressPct}%`}
                    reason={`Week ${activeEnrollment.current_week || 1} of ${activeEnrollment.program.num_cycles || activeEnrollment.program.duration_weeks || "?"} · ${completedCount} sessions logged`}
                  />
                  <div className="h-1 bg-track rounded-pill overflow-hidden">
                    <div className="h-full bg-brand rounded-pill transition-[width] duration-slow ease-out" style={{ width: `${progressPct}%` }} />
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
