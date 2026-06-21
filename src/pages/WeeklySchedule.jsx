import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, addWeeks, subWeeks, startOfWeek, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronDown, Dumbbell, Timer, Moon, CheckCircle2 } from "lucide-react";
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
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDay, setSelectedDay] = useState(new Date());
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
          // Move the selected day with the week so the highlighted row, the
          // detail card, and the "today's session" CTA all stay inside the
          // visible week (they were independent state, so paging desynced them).
          onClick={() => { setWeekStart(w => subWeeks(w, 1)); setSelectedDay(d => subWeeks(d, 1)); setShowCompleted(false); }}
          aria-label="Previous week"
          className="w-11 h-11 rounded-full flex items-center justify-center glass-inset text-muted-2 hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-technical text-sm font-extrabold text-ink">
          {format(weekStart, "MMM d")}, {format(addDays(weekStart, 6), "MMM d")}
        </span>
        <button
          onClick={() => { setWeekStart(w => addWeeks(w, 1)); setSelectedDay(d => addWeeks(d, 1)); setShowCompleted(false); }}
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
            <p className="text-xs font-semibold text-muted-2">Could not load your schedule.</p>
            <button onClick={() => refetchLogs()} className="cta-ghost text-xs px-4 py-1.5 min-h-[44px]">
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
          // Non-logged, non-program days fall back to a designed muted 'Rest'
          // label rather than a bare em-dash, so an empty slot never reads as a
          // raw placeholder ambiguous between rest and missing data.
          const detail = log
            ? getWorkoutSplitTitle(log, entries[0]?.title)
            : entries[0]?.title || null;
          // Suppress the day-type pill when it repeats the prior row's type so
          // the dominant repeated value (e.g. TWO-A-DAY every day) stops reading
          // as noise; the workout title then carries the row's identity.
          const prevDay = i > 0 ? weekDays[i - 1] : null;
          const prevType = prevDay ? dayType(getEntriesForDay(prevDay), getLogForDay(prevDay)) : null;
          const showPill = type !== "REST" && type !== prevType;
          const isRest = type === "REST";

          // Rest days carry no session, so they get a compact single-line row
          // (date inline, no stacked DD numeral, no trailing slot). This stops
          // four empty "—" rows from eating the same tall height as the two real
          // sessions and weakening the first-paint scan toward what's actionable.
          if (isRest) {
            return (
              <button
                key={i}
                onClick={() => selectDay(day)}
                // Today reads as today even on a rest row: a neutral ink left-rule
                // plus the inset fill makes the current-day signal unambiguous
                // without spending the single teal action color on row state
                // (teal stays reserved for the one action; today is a neutral
                // emphasis, not a second teal accent).
                className={`data-row w-full min-h-[28px] items-center py-1 text-left transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-track ${isCurrentDay ? "glass-inset -mx-1.5 pl-2.5 pr-1.5 border-l-2 border-l-ink" : isSelected ? "glass-inset -mx-1.5 px-1.5" : ""}`}
              >
                <span className={`w-[38px] shrink-0 text-center font-technical text-xs font-bold tracking-[0.08em] ${isCurrentDay ? "text-ink" : "text-faint"}`}>
                  {format(day, "EEE").slice(0, 2).toUpperCase()} {format(day, "d")}
                </span>
                <span className={`flex-1 min-w-0 text-xs font-semibold ${isCurrentDay ? "text-ink" : "text-faint"}`}>Rest</span>
                {/* Empty trailing slot mirrors the session rows' w-[68px] status
                    column so the Rest row's content area, and thus its selected
                    highlight's right edge, aligns flush with the other rows
                    instead of stopping short. */}
                <span className="w-[68px] shrink-0" aria-hidden="true" />
              </button>
            );
          }

          return (
            <button
              key={i}
              onClick={() => selectDay(day)}
              className={`data-row w-full min-h-[44px] items-center py-2 text-left transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-track ${isCurrentDay ? "glass-inset -mx-1.5 pl-2.5 pr-1.5 border-l-2 border-l-ink" : isSelected ? "glass-inset -mx-1.5 px-1.5" : ""}`}
            >
              <div className="w-[38px] shrink-0 text-center font-technical">
                <span className={`block text-xs font-bold tracking-[0.08em] ${isCurrentDay ? "text-ink" : "text-muted-2"}`}>
                  {format(day, "EEE").slice(0, 2).toUpperCase()}
                </span>
                <span className={`block text-base font-extrabold text-ink`}>
                  {format(day, "d")}
                </span>
              </div>
              <div className={`flex-1 min-w-0 ${log ? "opacity-70" : ""}`}>
                {detail ? (
                  <div className="text-xs font-semibold text-ink truncate">
                    {detail}
                  </div>
                ) : (
                  <span className="section-label !text-faint">Rest</span>
                )}
                {showPill && (
                  <Chip bg={pill.bg} fg={pill.fg} className="mt-0.5">{pill.label}</Chip>
                )}
              </div>
              {/* Shared fixed-width trailing status slot so completed / up-next /
                  future rows align on one scan column instead of a ragged rail.
                  The high-contrast (ink) trailing slot is RESERVED for the one
                  actionable day, today's 'UP NEXT' + chevron, so the page still
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
                  // The expanded completed card below already shows a check for the
                  // selected day, so suppress the row check there — keep a single
                  // completion affordance per session so the two don't compete.
                  // Done state uses the leaf (success) token, not a near-invisible
                  // dark outline: a filled check at WCAG-passing contrast on the
                  // card, distinct from the empty/no-check not-done rows.
                  isSelected ? null : <CheckCircle2 className="w-4 h-4 text-leaf fill-leaf/15" />
                ) : type !== "REST" ? (
                  <ChevronRight className="w-4 h-4 text-faint" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day — each card's own section-label now carries the day echo
          ("FRI, COMPLETED" / "FRI, STRENGTH"), so the standalone day caption is
          dropped to avoid a redundant header above the card that repeats it. */}
      <div className="mb-6">
        {!hasAnything ? (
          // A rest day carries no session. The identity stays a compact strip
          // (icon + label), but the one meaningful rest-day move — logging
          // recovery — is promoted to a full-width brand action so today's single
          // relevant CTA owns the action color instead of losing to the FAB, and
          // sits low enough to fall in the thumb zone rather than floating
          // mid-screen above a dead gap.
          <div className="rise-in-2 flex flex-col">
            {/* A rest day owns the fold with a fuller recovery card (icon +
                headline + one-line prompt) rather than a thin strip above a
                void, so the upper area is intentional content. On a non-today
                rest day it stays a compact identity card; today it also carries
                the recovery CTA below. */}
            <div className="glass px-4 py-6 flex flex-col items-center text-center gap-2.5">
              {isToday && (
                // Neutral eyebrow: teal is reserved for the single action (the
                // "Log recovery" CTA below + app chrome), so the today label
                // reads as a muted caption rather than a second teal accent.
                <span className="section-label !text-muted-2">Today</span>
              )}
              <span className="grid place-items-center w-11 h-11 rounded-full glass-inset">
                <Moon className="w-5 h-5 text-faint" />
              </span>
              <h2 className="type-display text-[20px]">{dayEcho}, Rest Day</h2>
              <p className="text-[13px] font-semibold text-muted-2 max-w-[15rem]">
                {isToday
                  ? "No session on the plan today. Log how recovery is going so tomorrow's targets stay dialed in."
                  : "No session scheduled. A planned rest day is part of the program."}
              </p>
            </div>
            {isToday && (
              <>
                {/* Flexible spacer drops the one rest-day action into the lower
                    third so it lands in the thumb zone and the screen no longer
                    dead-ends in a tall empty charcoal frame. Caps so it never
                    over-pushes when the program analytics below fill the page. */}
                <div className="min-h-[12vh] max-h-[28vh] flex-1" aria-hidden="true" />
                {/* Demoted to ghost: the global FAB also renders coral on this
                    route, so a coral 'Log recovery' would put two primary coral
                    CTAs on one screen. Ghost keeps coral as the single
                    primary-action color (the FAB owns it here). */}
                <button
                  onClick={() => navigate("/recovery")}
                  className="cta-ghost w-full"
                >
                  Log recovery
                </button>
              </>
            )}
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
              // A thin/corrupt log (no real duration AND a lone exercise) would
              // print a misleading "2 min · 1 exercise" that reads as a real-but-
              // broken session. Suppress the numeric summary in that case — the
              // "— Logged" label already conveys completion gracefully.
              const durSecs = selectedLog.duration_seconds || 0;
              const summaryTrustworthy = !(durSecs < 180 && exCount <= 1);
              return (
                <div className="glass overflow-hidden rise-in-2">
                  {/* The highlighted week row directly above already names the
                      session ("Upper Body Session / STRENGTH / ✓"), so this card
                      doesn't restate that identity. It leads with what the row
                      can't show, the session summary (duration · count), and
                      acts purely as the toggle into the per-exercise breakdown. */}
                  <button
                    onClick={() => setShowCompleted(v => !v)}
                    aria-expanded={showCompleted}
                    className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-track"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-leaf fill-leaf/15 shrink-0" />
                      <span className="section-label">
                        {isTwoADay ? `${dayEcho} AM, Logged` : `${dayEcho}, Logged`}
                      </span>
                      <span className="font-technical text-xs font-semibold text-muted-2 tabular-nums truncate">
                        {summaryTrustworthy
                          ? `${dur ? `${dur} · ` : ""}${exCount} ${exCount === 1 ? "exercise" : "exercises"}`
                          : ""}
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-2 shrink-0 transition-transform duration-200 [transition-timing-function:var(--ease)] ${showCompleted ? "rotate-180" : ""}`} />
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
                                <span className="text-sm font-semibold text-ink truncate">{ex.name}</span>
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
                                <span className="text-sm font-semibold text-ink truncate">{ex.name}</span>
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
                      {isTwoADay ? `${dayEcho} AM, Strength` : `${dayEcho}, ${activeEnrollment?.program?.title || "Program"}`}
                    </p>
                    <h3 className="type-display text-base leading-tight">{entry.title}</h3>
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
                            <span className="text-sm font-semibold text-ink truncate">{ex.name}</span>
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
                      <span className="section-label !text-carb">{isTwoADay ? "PM, Run" : "Cardio"}</span>
                    </div>
                    {isTwoADay && (
                      <p className="text-xs font-semibold text-muted-2 mb-3">
                        ~6h separation from AM session
                      </p>
                    )}
                    <div className="space-y-3 mt-2">
                      {runs.map((ex, j) => {
                        const name = ex.title || `${ex.zone || 'Z2'} ${ex.activity_type || 'run'}`;
                        const done = isCardioDone(name);
                        return (
                          <div key={j} className="flex items-center justify-between gap-3">
                            <div className={`min-w-0 ${done ? "opacity-50" : ""}`}>
                              <span className={`text-sm font-semibold text-ink ${done ? "line-through text-muted-2" : ""}`}>{name}</span>
                              {ex.notes && <p className="text-xs text-muted-2 mt-0.5">{ex.notes}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="pill-value pill-value--sm text-muted-2 tabular-nums">{ex.duration_minutes} min</span>
                              <button
                                onClick={() => toggleCardio(name)}
                                aria-label={done ? `Mark ${name} not done` : `Mark ${name} done`}
                                aria-pressed={done}
                                className="shrink-0 p-2.5 -m-2.5 rounded-full transition-transform duration-200 [transition-timing-function:var(--ease)] active:scale-95"
                              >
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 [transition-timing-function:var(--ease)] ${
                                  done
                                    ? "glass-inset text-carb"
                                    : "bg-track"
                                }`}>
                                  {done && <CheckCircle2 className="w-4 h-4" />}
                                </span>
                              </button>
                            </div>
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
        {isToday && !hasInlineProgramCta && hasAnything && (
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

      {/* This Program — Weekly Volume + Program progress share one section label
          so the two teal viz-1 bars read as members of one group ("this program"
          analytics) rather than two instances of the same metric. */}
      {(muscleVolume.length > 0 || activeEnrollment?.program) && (
      <section aria-label="This program" className="rise-in-3">
        <p className="section-label mb-2 px-1">This Program</p>
        <div className="space-y-3">
      {/* Weekly volume — secondary analytics, collapsed by default so the
          selected-day session + action lead the page. Tap to expand the
          per-muscle set breakdown. */}
      {muscleVolume.length > 0 && (
        <div className="glass px-4 py-3.5">
          <button
            onClick={() => setShowVolume(v => !v)}
            aria-expanded={showVolume}
            className="w-full min-h-[44px] flex items-center justify-between rounded-xl transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-track"
          >
            <span className="section-label">Weekly Volume</span>
            <span className="flex items-center gap-2">
              <span className="font-technical text-xs font-extrabold text-muted-2 tabular-nums">
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
                      <span className="text-sm font-semibold text-ink capitalize truncate">
                        {muscle.replace(/_/g, " ")}
                      </span>
                      <span className="pill-value pill-value--sm text-muted-2 shrink-0">
                        {sets} <span className="text-xs font-semibold">sets</span>
                      </span>
                    </div>
                    <div className="h-1 bg-track rounded-full overflow-hidden">
                      <div
                        className="h-full bg-viz-1 rounded-full transition-[width] duration-200 ease-[var(--ease)]"
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
        <div className="glass px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="section-label truncate flex-1 mr-2">
              {activeEnrollment.program.title}
            </p>
            <span className="font-technical text-xs font-extrabold text-muted-2 shrink-0 tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-1 bg-track rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-viz-1 rounded-full transition-[width] duration-200 ease-[var(--ease)]" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="font-technical text-xs font-semibold text-muted-2">
            Week {activeEnrollment.current_week || 1} of {activeEnrollment.program.num_cycles || activeEnrollment.program.duration_weeks || "?"}
            {" · "}{completedCount} sessions logged
          </p>
        </div>
      )}
        </div>
      </section>
      )}
    </div>
  );
}
