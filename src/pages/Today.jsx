/**
 * Today — the decision-first home of OptiGainsOS.
 *
 * A dashboard of dense modules, fixed order for now (r7 density pass —
 * nutrition must be visible without scrolling at 428x926):
 *   1. Nutrition — calorie + P/C/F bars, Consumed/Remaining toggle inline in
 *      the module header row
 *   2. Session — active-session banner or the prescribed/program session
 *   3. Weight trend — raw scale-weight scatter + smoothed EWMA trend line,
 *      with the weigh-in input folded into this module's header/row
 *   4. Weekly training — compact horizontal rings row, only rendered when
 *      the active enrollment's schedule has a nonzero target this week
 *   5. Readiness — compact one-line score + verdict
 *   6. To-do checklist — self-hides when empty
 *   Below the fold: carb timing, Vitals + Brief/State/Muscle detail card,
 *   quick actions.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { nowInTz } from "@/utils/dateUtils";
import { useProfile, useAllFoodEntries, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { calculateEWMA } from "@/utils/coachingUtils";
import { useNowDay } from "@/hooks/useNowDay";
import { useActiveWorkoutSession } from "@/hooks/useActiveWorkoutSession";
import { useStaleWorkoutSessions } from "@/hooks/useStaleWorkoutSessions";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { invalidateWorkoutLogs } from "@/lib/queryKeys";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useTodayPrescription, useAthleteState } from "@/hooks/useEngineQueries";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { useTodayBodyWeight, useLastBodyWeight, useLogWeight } from "@/hooks/useWeighIn";
import { BOUNDS } from "@/components/dashboard/WeighInPrompt";
import ProgramCompleteCard from "@/components/dashboard/ProgramCompleteCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { getTodayProgramWorkout, getProgramSchedule } from "@/utils/programSchedule";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import { getWeekStart } from "@/utils/dateUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import PrescribedSessionCard from "@/components/dashboard/PrescribedSessionCard";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import TodayActions from "@/components/dashboard/TodayActions";
import { MetricTile, SectionLabel, SegmentedControl, Module, MiniRing } from "@/components/ui/system";
import { Activity, AlertTriangle, ChevronRight, Apple, ChevronDown, Flame, Check } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d));
// Full thousands-separated integer — used for the kcal ring's TARGET caption so
// it reads non-lossy ("/2,800 · 7d"), distinct from the compact in-ring average
// value (which abbreviates to "2.8k" to fit the 50px ring).
const withThousands = (n) =>
  n == null || Number.isNaN(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("en-US");
const sentence = (s) => {
  const t = String(s || "").replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

// Weight-trend chart: pale raw scale-weight scatter dots underneath a bold
// smoothed EWMA trend polyline, same chart (mf-app-screens.md Body pattern
// #1: "Scale-weight scatter + smoothed trend line, same chart" — MacroFactor's
// most-praised pattern). Points are positioned by actual elapsed days, not row
// index, so a gap between weigh-ins reads as a visual gap instead of being
// silently compressed away.
function WeightSpark({ trendPoints, scatterPoints, W, H }) {
  if (!trendPoints || trendPoints.length < 2) return null;
  const path = trendPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = trendPoints[trendPoints.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none" aria-hidden="true">
      {scatterPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.5" fill="var(--text-faint)" opacity="0.6" />
      ))}
      <path d={path} fill="none" stroke="var(--text-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.85" />
      <circle cx={last.x} cy={last.y} r="2.75" fill="var(--text-primary)" />
    </svg>
  );
}

// Compact inline weigh-in field, folded into the Weight trend module's own
// header/row (r7 density pass) instead of owning a separate module above the
// to-do list. No "Weigh in · last N lb" leading text — the trend module
// already shows the current trend weight right above this row, so repeating
// the last raw reading here would just be a duplicate of that number. The
// full WeighInPrompt sheet (with the stale-days warning copy) is still used
// verbatim by the pre-session check-in gate in PrescribedSessionCard.
function WeighInRow({ today, weightUnit }) {
  const { todayWeight, isLoading, isFetching } = useTodayBodyWeight(today);
  const { lastWeight } = useLastBodyWeight(today);
  const logWeight = useLogWeight();
  const [typed, setTyped] = useState("");
  // A message, not a bare boolean — WeighInPrompt's own sheet distinguishes
  // "out of bounds" from "the save failed" with real copy, and this compact
  // row shouldn't regress to a silent red underline for either failure.
  const [error, setError] = useState(null);

  // Don't flash the ask for one frame before we know today is already logged.
  if (isLoading || isFetching) return null;

  const already = todayWeight?.weight != null;
  const reference = lastWeight?.weight ?? null;

  const submit = (e) => {
    e?.preventDefault?.();
    const raw = String(typed).trim().replace(/,/g, ".");
    const parsed = Number.parseFloat(raw);
    const [min, max] = BOUNDS[weightUnit] || BOUNDS.lbs;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter your weight");
      return;
    }
    if (parsed < min || parsed > max) {
      setError(`That reads as ${parsed} ${weightUnit}. Expected ${min}-${max}.`);
      return;
    }
    setError(null);
    logWeight.mutate(
      { weight: parsed, date: today },
      {
        onSuccess: () => { toast.success(`Logged ${parsed} ${weightUnit}`); setTyped(""); },
        // The typed value stays in the field on failure, same as WeighInPrompt
        // — a network blip shouldn't cost him the reading he just typed.
        onError: () => setError("Didn't save. Tap Log to retry."),
      }
    );
  };

  return (
    <div className="mt-2">
      {already ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted-2">Logged today</span>
          <Check className="w-4 h-4 text-leaf shrink-0" />
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold text-muted-2 shrink-0">Weigh in</span>
            <input
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              placeholder={reference != null ? String(reference) : "--"}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6));
                if (error) setError(null);
              }}
              onFocus={(e) => e.target.select()}
              aria-label={`Bodyweight in ${weightUnit}`}
              aria-invalid={!!error}
              className={`min-w-0 flex-1 min-h-[44px] bg-transparent border-b text-[15px] font-semibold tabular-nums text-ink outline-none px-1 ${error ? "border-warn" : "border-charcoal-border"}`}
            />
            <button
              type="submit"
              disabled={logWeight.isPending || !typed.trim()}
              className="cta-action shrink-0 px-4 min-h-[44px] text-[13px]"
            >
              {logWeight.isPending ? "…" : "Log"}
            </button>
          </div>
          {error && <p className="text-[11px] font-semibold text-warn mt-1">{error}</p>}
        </form>
      )}
    </div>
  );
}

export default function Today() {
  const { user } = useAuth();
  const { profile } = useProfile();
  // Re-derives on visibilitychange/focus/a 60s interval so a tab left open (or
  // an iOS home-screen app backgrounded) across local midnight doesn't keep
  // reading yesterday's date with no on-screen indication (today-r1-05).
  const today = useNowDay(profile?.timezone);

  // Morning check-in surfaces (weigh-in) and the muscle-load disclosure — kept
  // local so the home stays the daily-ritual home without depending on the
  // global FAB. (The Stream Note tile was retired — the mobile-strip Stream Note
  // utility is the single canonical entry, so the freed thumb slot now hosts the
  // subjective readiness check-in. Weigh-in is launched from the global FAB fan,
  // so Today no longer carries its own weigh-in tile or modal — dashboard-5.)
  // Subjective readiness check-in (ported from Dashboard) — collapsed to a
  // one-line prompt by default so the teal session CTA stays the single teal
  // primary in the first viewport; the form's "Check In" only materializes once
  // the athlete opens it.
  // One consolidated detail card with a 3-way segmented control (Brief /
  // State / Muscle) replaces three stacked disclosure drawers. Defaults to
  // "brief" so the Daily Brief headline is promoted highest (per IA) when the
  // detail card is opened.
  const [detailTab, setDetailTab] = useState("brief");
  // The whole detail card is collapsed behind a single disclosure on mobile
  // (default closed) so the primary surface ends near the 2-viewport mark; on
  // desktop the right rail has room, so it renders open. EXCEPTION (density):
  // when the detail card is the last surface AND Today's Actions is empty (no
  // brief-seeded actions), a closed disclosure leaves a tall empty charcoal band
  // above the dock at 390px — so in that case the disclosure defaults OPEN to
  // fill the hollow with the Brief/State/Muscle body. Auto-open fires once (ref-
  // guarded) so the user can still collapse it afterward.
  // null = the user hasn't toggled the detail card yet, so its open state falls
  // back to a data-driven default (see detailOpenResolved below). Once they
  // toggle, their choice sticks.
  const [detailOpen, setDetailOpen] = useState(null);

  // Consumed/Remaining view for the Nutrition module — a saved display
  // preference (localStorage, not the profile row), mirroring MacroFactor's
  // bar-fill toggle (mf-app-screens.md "Nutrition & Targets widget").
  const [nutritionView, setNutritionView] = useState(() => {
    try { return localStorage.getItem("todayNutritionView") === "consumed" ? "consumed" : "remaining"; }
    catch { return "remaining"; }
  });
  const setNutritionViewPersist = (v) => {
    setNutritionView(v);
    try { localStorage.setItem("todayNutritionView", v); } catch { /* private mode / blocked storage */ }
  };

  const { prescription, isLoading: prescriptionLoading, isError: prescriptionError } = useTodayPrescription(today);
  const { state, isLoading: stateLoading, isError: stateError } = useAthleteState(today);

  // Actual (not target) carbs eaten around today's session(s) — pulled straight
  // from the logged food_entries.eaten_at/carbs_grams, never the engine's static
  // carb-window target. If today's session hasn't actually been logged yet, the
  // AM/PM split falls back to the assumed pattern: lift in the morning, run/
  // cardio in the afternoon (a completed session's real start_time overrides it).
  const { allFoodEntries } = useAllFoodEntries();
  const { data: todaySessions = [] } = useQuery({
    queryKey: ["workoutSessionsToday", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        // No end_time column on workout_sessions (and nothing here reads one) —
        // selecting it 400'd the whole query, so todaySessions was always empty
        // and carb timing silently fell back to the assumed 8am/4pm split even
        // after a session was logged.
        .select("start_time, status")
        .eq("created_by", user.id)
        .eq("status", "completed")
        .gte("start_time", `${today}T00:00:00`)
        .lt("start_time", `${today}T23:59:59.999`)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!today,
  });

  const carbTimingToday = useMemo(() => {
    const hasLift = (prescription?.strength_block?.length > 0)
      || (prescription?.calisthenics_block && Object.keys(prescription.calisthenics_block).length > 0);
    const hasRun = !!(prescription?.run_block || prescription?.swim_block);
    if (!hasLift && !hasRun) return null;

    const atHour = (h) => { const d = new Date(`${today}T00:00:00`); d.setHours(h, 0, 0, 0); return d; };
    const sessions = [];
    if (hasLift) sessions.push({ label: "Lift", defaultHour: 8 });
    if (hasRun) sessions.push({ label: prescription?.run_block ? "Run" : "Swim", defaultHour: 16 });

    // Match logged completed sessions to slots in chronological order — the
    // earlier logged session fills the AM slot, the later one the PM slot,
    // mirroring the assumption used when nothing's logged yet.
    sessions.forEach((s, i) => {
      const logged = todaySessions[i];
      s.time = logged ? new Date(logged.start_time) : atHour(s.defaultHour);
    });
    sessions.sort((a, b) => a.time - b.time);

    const dayStart = new Date(`${today}T00:00:00`);
    const dayEnd = new Date(`${today}T23:59:59.999`);
    const todaysEntries = (allFoodEntries || []).filter((e) => e.date === today && e.eaten_at);
    const carbsBetween = (from, to) => todaysEntries
      .filter((e) => { const t = new Date(e.eaten_at); return t >= from && t < to; })
      .reduce((sum, e) => sum + (Number(e.carbs_grams) || 0), 0);

    return sessions.map((s, i) => ({
      label: s.label,
      pre: Math.round(carbsBetween(i === 0 ? dayStart : sessions[i - 1].time, s.time)),
      post: Math.round(carbsBetween(s.time, i === sessions.length - 1 ? dayEnd : sessions[i + 1].time)),
    }));
  }, [prescription, todaySessions, allFoodEntries, today]);

  // Today's scheduled program workout (if the athlete is enrolled in a program
  // and the schedule lands a workout on today). When present, the session CTA
  // routes to the program logger so the day completes the program and drives
  // progression instead of being logged as an ad-hoc quick workout.
  const { enrollments, isLoading: enrollmentsLoading, isError: enrollmentsError } = useEnrollments();
  const activeEnrollment = useMemo(
    () => enrollments.find((e) => e.status === "active") || null,
    [enrollments]
  );
  const todayProgramWorkout = useMemo(() => {
    // Only an ACTIVE enrollment surfaces a program CTA here. A paused program
    // must not be routed to the program logger, since logging it would silently
    // flip it back to active.
    const active = activeEnrollment;
    if (!active) return null;
    const entry = getTodayProgramWorkout(active, active.program?.workouts, profile?.timezone);
    return entry
      // `exercises` rides along so the prescription card can render the APPROVED
      // movement list rather than a second, independently-selected one. Today and
      // the Train tab then read the same source for "which lifts" (program_workouts);
      // the engine still owns sets/reps/RIR/load on top of it.
      ? { programWorkoutId: entry.programWorkoutId, enrollmentId: entry.enrollmentId,
          exercises: entry.exercises || [] }
      : null;
  }, [activeEnrollment, profile?.timezone]);

  // Weekly training progress rings — "only if a target exists". The target is
  // NOT program.days_per_week (that's the program's persisted cycle length —
  // see ProgramBuilder.jsx/ProgramCard.jsx/programSchedule.js, none of which
  // read it alone as a weekly workout count). Instead it's the number of the
  // active enrollment's SCHEDULED program workouts (training days with real
  // exercises/cardio, not rest days) that fall in the current calendar week,
  // built from the same getProgramSchedule() helper WeeklySchedule.jsx uses.
  const scheduleEntries = useMemo(() => {
    if (!activeEnrollment?.program?.workouts) return [];
    return getProgramSchedule(activeEnrollment, activeEnrollment.program.workouts, profile?.timezone);
  }, [activeEnrollment, profile?.timezone]);

  const weekStartStr = useMemo(
    () => format(getWeekStart(profile?.timezone), "yyyy-MM-dd"),
    [profile?.timezone]
  );
  const weekEndStr = useMemo(
    () => format(addDays(getWeekStart(profile?.timezone), 6), "yyyy-MM-dd"),
    [profile?.timezone]
  );

  const weeklyTarget = useMemo(() => {
    if (!activeEnrollment) return null;
    return scheduleEntries.filter((e) => e.date >= weekStartStr && e.date <= weekEndStr
      && ((e.exercises?.length > 0) || (e.cardio_sessions?.length > 0))).length;
  }, [scheduleEntries, activeEnrollment, weekStartStr, weekEndStr]);

  // Subjective readiness check-in for today (ported from Dashboard). When a
  // COMPLETED row exists (energy logged), MorningCheckin renders its read-only
  // summary; otherwise the collapsed one-line prompt is offered. A partial row
  // with no energy must NOT force the full editable form open on load — that is
  // what buried the prescribed session under the expanded check-in.
  const { data: todayCheckIn } = useQuery({
    queryKey: ["dailyReadiness", today, user?.id],
    queryFn: async () => {
      const rows = await db.entities.DailyReadiness.filter({ created_by: user.id, checkin_date: today });
      return rows[0] || null;
    },
    enabled: !!user,
  });

  // The AI daily brief — its today_actions seed the ported Today's Actions list.
  const { data: todayBrief, isError: briefError } = useQuery({
    queryKey: ["daily-brief", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_briefs")
        .select("brief_json")
        .eq("created_by", user.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  // Recent logs → muscle fatigue heatmap (same source the old dashboard used).
  // enrollment_id rides along so the weekly-rings completed-count below can
  // filter to sessions actually tied to the active enrollment, not just any
  // logged strength day (an ad hoc/quick workout must not advance a
  // program-specific weekly target it was never part of).
  const { data: recentLogs = [], isLoading: recentLogsLoading, isError: heatmapError } = useQuery({
    queryKey: ["todayHeatmapLogs_v3", user?.id],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 10);
      const { data, error } = await supabase
        .from("workout_logs")
        .select("log_date, exercises, enrollment_id")
        .eq("created_by", user.id)
        .gte("log_date", since.toISOString().slice(0, 10))
        .order("log_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const fatigueData = useMemo(() => getRecoveryHeatmapData(recentLogs), [recentLogs]);

  // Completed = distinct days this week with a logged workout tied to the
  // active enrollment (enrollment_id on workout_logs), not any logged day.
  const weeklyCompleted = useMemo(() => {
    if (!activeEnrollment || !weeklyTarget) return 0;
    const days = new Set(
      recentLogs
        .filter((l) => l.enrollment_id === activeEnrollment.id
          && l.log_date >= weekStartStr && l.log_date <= today
          && Array.isArray(l.exercises) && l.exercises.length > 0)
        .map((l) => l.log_date)
    );
    return days.size;
  }, [recentLogs, weeklyTarget, activeEnrollment, weekStartStr, today]);

  // Loading/error: never show a confident "0/N" while recentLogs or
  // enrollments are still resolving, or after either failed to load — hide
  // the rings module entirely in those cases instead (see render below).
  const weeklyRingsUnknown = enrollmentsLoading || enrollmentsError || (!!activeEnrollment && (recentLogsLoading || heatmapError));

  // Did the athlete already log a strength session today? Drives the
  // PrescribedSessionCard done-state instead of nagging "Begin Session".
  const loggedToday = useMemo(
    () => recentLogs.some(
      (l) => l.log_date === today && Array.isArray(l.exercises) && l.exercises.length > 0
    ),
    [recentLogs, today]
  );

  // Density guard: Today's Actions self-hides when there are no actions, which
  // would otherwise strand the detail card (mobile disclosure default-closed) as
  // the last surface with a tall empty band above the dock. So the detail card's
  // effective open state is DERIVED (no effect, no ref): use the user's explicit
  // toggle once they make one, otherwise fall back to a data-driven default that
  // auto-opens when the loaded brief seeds no actions, filling that hollow.
  const briefActions = todayBrief?.brief_json?.today_actions;
  const detailOpenResolved = detailOpen ?? (todayBrief !== undefined && !briefActions?.length);

  const recovery = state?.recovery || {};
  const fatigue = state?.fatigue || {};
  const nutrition = state?.nutrition || {};
  const vdot = state?.vdot_zones || {};
  const score = recovery?.score ?? null;

  const intensity = prescription?.mpc_intensity != null ? Number(prescription.mpc_intensity) : null;

  // Any in-progress workout session — surfaced as a banner so it can't be lost.
  // Shares its query and its URL builder with the launch redirect in App.jsx;
  // they must never disagree about where a given session lives.
  const { activeSession, path: activeSessionPath } = useActiveWorkoutSession();

  // Sessions past the 24h auto-finish cutoff — neither the global sweep nor
  // the page-level mount check will ever touch these (see
  // useStaleWorkoutSessions for why), so they need an explicit Log/Discard
  // review surface instead of sitting in_progress forever unseen.
  const queryClient = useQueryClient();
  const { data: staleSessions = [] } = useStaleWorkoutSessions();
  const { autoFinishSession, restoreSession, cancelSession } = useWorkoutSession();
  const [loggingStaleId, setLoggingStaleId] = useState(null);
  const [discardTarget, setDiscardTarget] = useState(null); // session pending discard confirmation
  const [discarding, setDiscarding] = useState(false);

  const invalidateStale = () => {
    queryClient.invalidateQueries({ queryKey: ["staleWorkoutSessions", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["activeWorkoutSession"] });
  };

  const handleLogStale = async (session) => {
    setLoggingStaleId(session.id);
    try {
      // Exactly the auto-finish log path (src/lib/autoFinishSession.js) —
      // writes the workout_log first, then flips status, same as the
      // silent 3h sweep does for a fresher session.
      const result = await autoFinishSession(session, profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (result === "logged") {
        toast.success(`Logged "${session.name}"`);
        invalidateWorkoutLogs(queryClient);
      } else if (result === "cancelled") {
        toast.info(`"${session.name}" had no sets logged — discarded instead`);
      } else {
        toast.error("Couldn't log that session — try again");
      }
      invalidateStale();
    } finally {
      setLoggingStaleId(null);
    }
  };

  const handleConfirmDiscardStale = async () => {
    if (!discardTarget) return;
    setDiscarding(true);
    try {
      // Exactly the "Start Fresh" cancel path (WorkoutDetail's
      // handleDismissResume): point the session hook at this row, then
      // cancel it through the same guarded update.
      restoreSession(discardTarget.id, discardTarget.exercises);
      await cancelSession();
      toast.info(`Discarded "${discardTarget.name}"`);
      invalidateStale();
    } finally {
      setDiscarding(false);
      setDiscardTarget(null);
    }
  };

  // ── The single teal-primary selector (dashboard-6) ──────────────────────
  // Teal is THE action color, so the page must show exactly ONE teal primary.
  // Rather than carry parallel coralCta / demoteCta flags that could drift out of
  // sync, ONE selector names which surface owns the teal CTA, and every per-
  // surface flag is derived from it:
  //   "session"  → the prescribed-session card paints teal "Begin Session"
  //                (train day: a prescription exists, not REST, nothing logged,
  //                 no active session demoting it to a ghost).
  //   "checkin"  → no session teal, so the check-in's "Check In" is the one teal
  //                primary (no prescription / rest / already logged).
  // The active-session "tap to continue" banner is deliberately neutral glass and
  // never the teal primary, so it doesn't enter this decision.
  const tealPrimary =
    ((!!prescription && prescription.mpc_action !== "REST") || !!todayProgramWorkout) &&
    !loggedToday &&
    !activeSession
      ? "session"
      : "checkin";
  // Derived per-surface flags — single source above.
  // PrescribedSessionCard: its Begin Session is the teal primary only when the
  // session owns it; otherwise it's demoted to a ghost.
  const demoteSessionCta = tealPrimary !== "session";

  // One plain-language verdict line — no engine jargon (ACWR/Form/HRV-trend)
  // on the first screen; that detail already lives one tap away in the
  // consolidated detail card's State tab (MetricTiles below). Today just
  // answers "what do I do": rest, train, or the engine doesn't know yet.
  const verdict = useMemo(() => {
    const action = prescription?.mpc_action;
    if (action === "REST") return "Rest today. The engine calls recovery, honor it.";
    if (action) {
      return intensity != null
        ? `Train as planned, cleared for ${intensity.toFixed(2)}× intensity.`
        : "Train as planned.";
    }
    return "Calibrating — needs a few more days of data for a verdict.";
  }, [prescription, intensity]);

  // The consolidated detail card's segmented control — Brief leads (the Daily
  // Brief headline is the IA priority). Muscle is offered even on error/empty so
  // the tab set stays stable (the body renders the reason). Rendered with the
  // lighter inset SegmentedControl, NOT the global glass-elevated coral SubTabs
  // strip, so this in-card switch doesn't mimic the page-level nav pills.
  const detailTabs = [
    { value: "brief", label: "Brief" },
    { value: "state", label: "State" },
    { value: "muscle", label: "Muscle" },
  ];

  // Hue-coded morning metrics — each datum owns one hue.
  const morningMetrics = [
    { k: "HRV", v: fmt(recovery?.hrv), u: "ms", hue: "var(--hue-teal-2)" },
    { k: "RHR", v: fmt(recovery?.resting_hr), u: "bpm", hue: "var(--hue-coral)" },
    { k: "Sleep", v: fmt(recovery?.sleep_score), u: "", hue: "var(--hue-violet)" },
    { k: "Batt", v: fmt(recovery?.body_battery), u: "%", hue: "var(--hue-green)" },
  ];

  const dailyTargets = useDailyTargets(today);

  // Nutrition-remaining module (Today, above the fold): the same
  // allFoodEntries source + useDailyTargets targets FoodTracker's own "Daily
  // log" ring/bars use — just today's totals in the B mockup's flat 4-column
  // layout instead of a ring, so it fits the module budget here.
  const todayTotals = useMemo(() => {
    const rows = (allFoodEntries || []).filter((e) => e.date === today);
    return rows.reduce((acc, e) => ({
      calories: acc.calories + (Number(e.calories) || 0),
      protein: acc.protein + (Number(e.protein_grams) || 0),
      carbs: acc.carbs + (Number(e.carbs_grams) || 0),
      fats: acc.fats + (Number(e.fats_grams) || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  }, [allFoodEntries, today]);
  const nutritionCols = [
    { label: "Kcal", consumed: todayTotals.calories, goal: dailyTargets.calories, hue: "var(--text-primary)", unit: "" },
    { label: "Protein", consumed: todayTotals.protein, goal: dailyTargets.protein, hue: "var(--hue-coral)", unit: "g" },
    { label: "Carbs", consumed: todayTotals.carbs, goal: dailyTargets.carbs, hue: "var(--hue-blue)", unit: "g" },
    { label: "Fat", consumed: todayTotals.fats, goal: dailyTargets.fats, hue: "var(--hue-yellow)", unit: "g" },
  ];

  const weightUnit = profile?.weight_unit || "lbs";
  const LBS_PER_KG = 0.45359237;

  // weight_trend_lbs_per_week is always computed in lbs by the engine
  // (confirmed against Progress.jsx/AthleteState.jsx, which render it
  // unconverted too), so a kg-unit profile needs the number itself
  // converted, not just the unit suffix swapped. On- vs off-goal is read
  // from trendAligned (the sign of the trend relative to the current
  // phase), not from a hard-coded hue — the render side colors it green
  // only when aligned, neutral text otherwise (DESIGN.md: no brand/
  // off-palette accent on a plain data line).
  const trendPerWkLbs = nutrition?.weight_trend_lbs_per_week;
  const trendPerWk = trendPerWkLbs == null ? null
    : weightUnit === "kg" ? trendPerWkLbs * LBS_PER_KG
    : trendPerWkLbs;
  const trendAligned = (() => {
    if (trendPerWkLbs == null) return null;
    const phase = nutrition?.phase;
    return phase === "cut" ? trendPerWkLbs < 0
      : phase === "bulk" ? trendPerWkLbs > 0
      : Math.abs(trendPerWkLbs) <= 0.5; // maintenance: holding is on-goal (lbs threshold)
  })();
  const trend = {
    value: trendPerWk == null ? "—"
      : `${trendPerWk > 0 ? "+" : ""}${fmt(trendPerWk, 1)}`,
    caption: trendAligned == null ? `${weightUnit}/wk` : trendAligned ? "on goal" : "off goal",
  };

  // Weight-trend module (Today, above the fold): reuses the same
  // useBodyWeightEntries hook + calculateEWMA util that Progress.jsx's full
  // WeightProgressChart uses — just a compact 30-day scatter+trend instead of
  // the full stat-trio + big chart, so it fits the module budget here. Tapping
  // "Detail ›" still routes to the full chart (Fuel → Body → Weight).
  const { weightEntries } = useBodyWeightEntries();
  // body_weight_entries records no per-entry unit (useWeighIn.js: "No unit
  // conversion: the value is stored exactly as entered, profile weight_unit
  // is display only"), so an athlete who switched lbs<->kg at some point has
  // raw numeric entries in two different units sitting in the same
  // weightEntries array with nothing to distinguish them. Since we can't
  // convert what isn't recorded, the EWMA input is instead RESTRICTED to the
  // display window plus a lead-in (60 days total, ending today) so a stale
  // unit switch further back can't bleed into the trend or the chart's
  // shared y-scale. The lead-in (vs. computing EWMA over just the 30-day
  // display window) still lets the smoothing warm up with real prior data
  // instead of starting cold on the window's first point.
  const EWMA_WINDOW_DAYS = 60;
  const boundedWeightEntries = useMemo(() => {
    const since = new Date(`${today}T00:00:00`);
    since.setDate(since.getDate() - (EWMA_WINDOW_DAYS - 1));
    const sinceStr = since.toISOString().slice(0, 10);
    return weightEntries.filter((e) => e.recorded_date >= sinceStr && e.recorded_date <= today);
  }, [weightEntries, today]);
  const trendedAll = useMemo(() => calculateEWMA(boundedWeightEntries, 0.1), [boundedWeightEntries]);
  const weight30d = useMemo(() => {
    const since = new Date(`${today}T00:00:00`);
    since.setDate(since.getDate() - 29);
    const sinceStr = since.toISOString().slice(0, 10);
    return trendedAll.filter((e) => e.recorded_date >= sinceStr && e.recorded_date <= today);
  }, [trendedAll, today]);
  const latestWeight = weight30d[weight30d.length - 1];
  // A weigh-in inside the last 30 days can still be a week+ stale (no new
  // entry since) — the trend number alone reads as "today's weight" unless
  // the module says otherwise.
  const isWeightStale = latestWeight
    && Math.round((new Date(`${today}T00:00:00`) - new Date(`${latestWeight.recorded_date}T00:00:00`)) / 86400000) > 7;
  // Scale-weight scatter + smoothed trend line, same chart (mf-app-screens.md
  // Body pattern #1). Points are x-positioned by actual elapsed days from a
  // FIXED 30-day frame ending today (t0 = today - 29), not from the first
  // logged entry inside the window — otherwise a leading/trailing gap (no
  // weigh-ins in the first or last few days of the window) silently stretches
  // the logged points across the full chart width instead of compressing them
  // into the true fraction of the frame they actually occupy.
  const weightSpark = useMemo(() => {
    if (weight30d.length < 2) return null;
    const W = 250, H = 48, PAD = 4;
    const t0 = new Date(`${today}T00:00:00`);
    t0.setDate(t0.getDate() - 29);
    const totalDays = 29;
    const dayOf = (e) => Math.round((new Date(`${e.recorded_date}T00:00:00`) - t0) / 86400000);
    const rawVals = weight30d.map((e) => Number(e.weight));
    const trendVals = weight30d.map((e) => Number(e.trendWeight));
    const min = Math.min(...rawVals, ...trendVals), max = Math.max(...rawVals, ...trendVals);
    const span = max - min || 1;
    const xOf = (e) => PAD + (dayOf(e) / totalDays) * (W - PAD * 2);
    const yOf = (v) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
    const trendPoints = weight30d.map((e) => ({ x: xOf(e), y: yOf(Number(e.trendWeight)) }));
    const scatterPoints = weight30d.map((e) => ({ x: xOf(e), y: yOf(Number(e.weight)) }));
    return { trendPoints, scatterPoints, W, H };
  }, [weight30d, today]);

  return (
    <div
      className="min-h-full px-4 sm:px-6 pt-2 lg:pt-6 max-w-[720px] mx-auto"
      style={{ paddingBottom: "calc(var(--floating-chrome-bottom) + 64px)" }}
    >
      {/* Desktop-only page header (mobile header already names the screen) */}
      <div className="hidden lg:flex items-baseline justify-between mb-5 rise-in">
        <div className="flex items-baseline gap-3.5">
          <h1 className="type-display text-[26px]">Today</h1>
          <span className="text-[13px] font-semibold text-muted-2">{format(nowInTz(profile?.timezone), "EEEE, MMMM d")}</span>
        </div>
      </div>

      {/* Load-failure is an app condition, not a biometric — render it as
          neutral glass (muted icon + brand-colored retry), not warn-amber,
          so the physiological spectrum stays reserved for body data. */}
      {(prescriptionError || stateError) && (
        <div className="glass-inset flex items-center gap-2 px-4 py-3 mb-3 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 text-muted-2" />
          <span className="font-semibold text-muted-2">Could not load today&apos;s data</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-auto font-semibold text-brand min-h-[44px] -my-2 px-1"
          >
            Retry
          </button>
        </div>
      )}

      {/* Ledger module stack (r7 density pass): a single flat column, 8px
          gaps, one order top → bottom for every breakpoint —
            1. Nutrition  2. Session  3. Weight trend (+ weigh-in)
            4. Weekly training  5. Readiness  6. To-do
          7. everything else (secondary / below the fold).
          Target: nutrition must be visible without scrolling at 428×926. */}
      <div className="space-y-2">
        {/* 1 — Nutrition: flat 4-column Kcal/Protein/Carbs/Fat, 8px bars,
            macro hues on the labels (DESIGN.md — calories own no hue), with
            the Consumed/Remaining toggle inline in the module's own header
            row (mf-app-screens.md "Nutrition & Targets widget" — a bar-fill
            toggle, never a ring), not on its own line above the grid. */}
        <Module>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[13px] font-semibold text-muted-2 truncate">Nutrition</span>
            <div className="flex items-center gap-2 shrink-0">
              <SegmentedControl
                options={[{ value: "remaining", label: "Remaining" }, { value: "consumed", label: "Consumed" }]}
                value={nutritionView}
                onChange={setNutritionViewPersist}
                size="sm"
                className="inline-flex [&_button]:min-h-[44px] [&_button]:px-3"
              />
              <Link to="/fuel" className="flex items-center gap-0.5 text-[13px] font-semibold text-muted-2 min-h-[44px] -my-3">
                Detail<ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {nutritionCols.map((c) => {
              const hasGoal = c.goal != null && c.goal > 0;
              const remainingRaw = hasGoal ? Math.round(c.goal - c.consumed) : null;
              // "over" is read from the ROUNDED delta, not the raw comparison
              // — otherwise a sub-0.5 overage (e.g. consumed = goal + 0.3)
              // rounds remainingRaw to -0 while `over` still says true,
              // rendering the self-contradictory "0g over".
              const over = hasGoal && remainingRaw < 0;
              const pct = hasGoal ? Math.min(100, (c.consumed / c.goal) * 100) : 0;
              // Overshoot previously clamped to "0 left", which reads as
              // "exactly at target" even when well over it. Remaining view now
              // says "N over"; Consumed view shows consumed/goal directly.
              const caption = !hasGoal
                ? "—"
                : nutritionView === "consumed"
                  ? `${withThousands(Math.round(c.consumed))}${c.unit}/${withThousands(c.goal)}${c.unit}`
                  : over
                    ? `${withThousands(Math.abs(remainingRaw))}${c.unit} over`
                    : `${withThousands(remainingRaw)}${c.unit} left`;
              return (
                <div key={c.label} className="min-w-0">
                  <div className="text-[11px] font-semibold mb-1.5 truncate" style={{ color: c.hue }}>{c.label}</div>
                  <div className="h-2 rounded-full bg-track overflow-hidden">
                    <div className="h-full rounded-full opacity-90" style={{ width: `${pct}%`, background: c.hue }} />
                  </div>
                  {/* 7d-avg captions were dropped from this module: at 4 narrow
                      columns the "N left" line and the caption underneath it
                      overlapped. The averages themselves aren't stranded —
                      AthleteState and Progress both still surface them. */}
                  <div className="font-technical text-[11px] text-secondary tabular-nums mt-1.5 truncate">
                    {caption}
                  </div>
                </div>
              );
            })}
          </div>
        </Module>

        {/* 2 — Start/Resume session (Ledger ".sess" row): workout name, an
            "N ex · N sets · ~N min" meta line, one off-white action. The
            in-progress "tap to continue" banner sits inside this same module
            when a session is live; otherwise the compact prescribed/program
            session row renders (PrescribedSessionCard's `compact` mode). */}
        <Module label="Session">
          {activeSession && (
            <Link
              to={activeSessionPath}
              // Neutral, not brand-colored: the FAB is the single teal action on
              // this screen, so this reads as a quiet "tap to continue" row.
              className="-mx-4 sm:-mx-5 px-4 sm:px-5 -mt-1 mb-3 pb-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 text-ink text-sm font-semibold"
            >
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 shrink-0 text-muted-2" />
                Workout in progress, tap to continue
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-2" />
            </Link>
          )}
          {/* PrescribedSessionCard owns ALL its fallbacks now: when the engine
              prescribes nothing it renders the neutral "Log a workout" ghost
              itself. One exception: when a workout is already in progress AND
              the engine has no prescription, that fallback ghost is redundant
              with the continue banner above, so it's suppressed here. */}
          {!(activeSession && !prescription) && (
            <>
              {/* A finished program is silent otherwise: the enrollment flips
                  itself to `completed` on the last logged workout. Renders
                  nothing while a block is active or paused. */}
              <ProgramCompleteCard className="mb-3" />
              {/* The subjective check-in + weigh-in gate still rides the Begin
                  Session flow (the sheet), unchanged — only the passive card
                  shrinks to the compact row here. */}
              <PrescribedSessionCard today={today} loggedToday={loggedToday} demoteCta={demoteSessionCta} programWorkout={todayProgramWorkout} todayCheckin={todayCheckIn} compact />
            </>
          )}
        </Module>

        {/* Unfinished-session review — sessions past the 24h auto-finish
            cutoff (useStaleWorkoutSessions). Never auto-resolved; each row
            gets an explicit Log (same path as the auto-finish sweep) or
            Discard (same path as "Start Fresh", confirmed via sheet, never
            a browser confirm()). Self-hides when the backlog is empty. */}
        {staleSessions.length > 0 && (
          <Module label="Unfinished sessions">
            <div className="flex flex-col gap-2">
              {staleSessions.map((session) => (
                <div
                  key={session.id}
                  data-testid={`stale-session-${session.id}`}
                  className="flex items-center justify-between gap-3 py-1"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">{session.name}</div>
                    <div className="text-[11px] font-semibold text-muted-2 tabular-nums">
                      Started {format(new Date(session.start_time || session.created_at), "MMM d")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => setDiscardTarget(session)}
                      disabled={loggingStaleId === session.id}
                    >
                      Discard
                    </Button>
                    <Button
                      variant="volt"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => handleLogStale(session)}
                      disabled={loggingStaleId === session.id}
                    >
                      {loggingStaleId === session.id ? "Logging…" : "Log"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Module>
        )}

        <ConfirmDialog
          open={!!discardTarget}
          onOpenChange={(open) => { if (!open) setDiscardTarget(null); }}
          title="Discard this session?"
          description={discardTarget ? `"${discardTarget.name}" will be closed with no workout log written. This can't be undone.` : ""}
          confirmText="Discard"
          cancelText="Cancel"
          variant="danger"
          loading={discarding}
          onConfirm={handleConfirmDiscardStale}
        />

        {/* 3 — Weight trend: EWMA trend value + compact 30-day sparkline,
            reusing the same useBodyWeightEntries/calculateEWMA the full
            WeightProgressChart (Fuel → Body) uses, with the weigh-in input
            folded into this module's own row (see WeighInRow) instead of
            owning a separate module — the duplicated "last N lb" text is
            dropped since the trend number right above it already says it. */}
        <Module label="Weight trend · 30 days" detail="Detail" detailHref="/fuel?tab=body">
          <div className="flex items-baseline gap-1.5">
            <span className="type-display text-2xl font-semibold tabular-nums">
              {latestWeight ? fmt(latestWeight.trendWeight, 1) : "—"}
            </span>
            <span className="text-[13px] font-semibold text-muted">{weightUnit}</span>
            {isWeightStale && (
              <span className="ml-auto text-[11px] font-semibold text-muted-2">
                as of {format(parseISO(latestWeight.recorded_date), "MMM d")}
              </span>
            )}
          </div>
          {/* With no trend value yet (latestWeight null — "— lbs" above), the
              rate line has nothing real to report: don't show a green
              "on goal" rate alongside a blank headline number. Show only the
              "log a few weigh-ins" hint instead. */}
          {latestWeight && trend.value !== "—" ? (
            <p
              className="text-[13px] font-semibold mt-1"
              style={{ color: trendAligned ? "var(--hue-green)" : "var(--text-secondary)" }}
            >
              {`${trend.value} ${weightUnit}/wk`}{" "}
              <span className={trendAligned ? "" : "text-muted"}>· {trend.caption}</span>
            </p>
          ) : null}
          {weightSpark ? (
            <div className="mt-2">
              <WeightSpark {...weightSpark} />
            </div>
          ) : (
            <p className="text-[12px] text-muted-2 font-semibold mt-2">Log a few weigh-ins to see a trend</p>
          )}
          <WeighInRow today={today} weightUnit={weightUnit} />
        </Module>

        {/* 4 — Weekly training progress rings: only rendered once we know an
            active enrollment has a nonzero scheduled-workouts-this-week
            target (never a default/invented target, never a zero ring, and
            never a confident "0/N" while still loading/erroring — see
            weeklyRingsUnknown above). A compact horizontal row, not a large
            centered single ring. mf-app-screens.md's "Weekly Workouts"
            pattern reserves rings specifically for progress-toward-a-
            weekly-target; a Sets ring (MacroFactor also shows Muscles/Sets/
            Exercises) is skipped since OptiGains doesn't store a weekly
            planned-sets target — Needs Nolan if that's wanted later. */}
        {!weeklyRingsUnknown && weeklyTarget > 0 && (
          <Module label="Weekly training">
            <div className="flex items-center justify-between gap-3 py-0.5">
              <span className="text-[13px] font-semibold text-muted-2">This week</span>
              <MiniRing
                label="Workouts"
                value={`${weeklyCompleted}/${weeklyTarget}`}
                frac={weeklyCompleted / weeklyTarget}
                hue="var(--hue-teal)"
                size={44}
              />
            </div>
          </Module>
        )}

        {/* 5 — Readiness: compact one line (score + short verdict), no big
            hero number/sparkline block — that detail still lives one tap
            away in the State detail tab below. */}
        <Module label="Readiness">
          {(prescriptionLoading || stateLoading) ? (
            <div className="pulse-loop h-5 bg-track rounded-lg w-2/3" />
          ) : (
            <p className="flex items-baseline gap-2 text-[13px] font-semibold">
              <span className="type-display text-lg tabular-nums leading-none text-ink">
                {score == null ? "—" : Math.round(score)}
              </span>
              <span className="font-technical text-secondary truncate">{verdict}</span>
            </p>
          )}
        </Module>

        {/* 6 — To-do checklist. Self-hides when empty. */}
        <div className="-mx-4 sm:-mx-6 lg:mx-0">
          <TodayActions today={today} briefActions={briefActions} isError={briefError} />
        </div>

        {/* Below the fold: everything else — secondary or collapsed.
            Carb timing chip → Vitals + Brief/State/Muscle detail disclosure. */}
        {carbTimingToday && carbTimingToday.length > 0 && (
          <div className="glass px-4 sm:px-5 py-3.5 -mx-4 sm:-mx-6 lg:mx-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Flame className="w-3.5 h-3.5 text-ink-muted shrink-0" />
              <span className="section-label">
                Carbs Around Today's Session{carbTimingToday.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {carbTimingToday.map((s) => (
                <div key={s.label} className="text-xs text-ink-secondary">
                  <span className="font-semibold text-ink">{s.label}:</span>{" "}
                  <span className="font-technical text-ink">{s.pre}g</span> pre ·{" "}
                  <span className="font-technical text-ink">{s.post}g</span> post
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Consolidated detail card — one header, one body. The three former
            disclosure drawers (Brief / State / Muscle) collapse into a single
            card switched by the lighter inset SegmentedControl, plus the Vitals
            row. Now demoted below the four primary modules; still behind a
            mobile disclosure so it doesn't add scroll weight when collapsed. */}
        <div className="surface overflow-hidden -mx-4 sm:-mx-6 lg:mx-0">
          <div className="px-4 pt-3 lg:pt-4">
            <SectionLabel>Vitals</SectionLabel>
            <div className="vit4 grid grid-cols-2 sm:grid-cols-4 gap-[7px] mt-2">
              {morningMetrics.map((m) => (
                <MetricTile
                  key={m.k}
                  label={m.k}
                  value={m.v}
                  unit={m.u || undefined}
                  accent={m.hue}
                  className="!py-2 !px-2.5"
                />
              ))}
            </div>
          </div>
          {/* Mobile-only disclosure trigger — ≥44px tap target. */}
          <button
            type="button"
            onClick={() => setDetailOpen(!detailOpenResolved)}
            aria-expanded={detailOpenResolved}
            className="lg:hidden w-full flex items-center justify-between gap-2 px-4 min-h-[48px] py-3 mt-1 text-left"
          >
            <SectionLabel>Today&apos;s detail</SectionLabel>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
              Brief · state · muscle
              <ChevronDown
                className={`w-4 h-4 text-secondary transition-transform duration-200 [transition-timing-function:var(--ease)] ${detailOpenResolved ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          <div className={`${detailOpenResolved ? "block" : "hidden"} lg:block`}>
            <div className="px-4 pt-3 lg:pt-4">
              <SegmentedControl
                options={detailTabs}
                value={detailTab}
                onChange={setDetailTab}
                size="md"
                className="inline-flex [&_button]:min-h-[44px] [&_button]:px-4"
              />
            </div>
            <div key={detailTab} className="rise-in pt-3 lg:pt-4 pb-4">
              {detailTab === "state" && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-4">
                  <MetricTile
                    label="Form · TSB"
                    value={fmt(fatigue?.tsb)}
                    accent={String(fatigue?.interpretation || "").includes("overreach") ? "var(--bad)" : "var(--hue-teal)"}
                    sub={sentence(fatigue?.interpretation) || "—"}
                  />
                  <MetricTile
                    label="ACWR"
                    value={fmt(fatigue?.acwr, 2)}
                    accent={fatigue?.acwr > 1.3 ? "var(--warn)" : "var(--hue-teal)"}
                    sub="acute : chronic"
                  />
                  <MetricTile
                    label="VDOT"
                    value={fmt(vdot?.current_vdot, 1)}
                    accent="var(--hue-blue)"
                    sub={vdot?.vdot_gap != null ? `${fmt(vdot.vdot_gap, 1)} to PST` : "aerobic"}
                  />
                  <MetricTile
                    label="Fitness · CTL"
                    value={fmt(fatigue?.ctl)}
                    accent="var(--hue-blue)"
                    sub="chronic load"
                  />
                </div>
              )}
              {detailTab === "brief" && (
                <div className="px-4">
                  <DailyBriefCard today={today} />
                </div>
              )}
              {detailTab === "muscle" && (
                heatmapError ? (
                  <p className="px-4 text-[12px] text-muted-2 font-semibold">Could not load muscle data</p>
                ) : fatigueData.length > 0 ? (
                  <div className="flex justify-center px-4">
                    <MuscleHeatMap data={fatigueData} view="anterior" className="h-[190px]" />
                  </div>
                ) : (
                  <p className="px-4 text-[12px] text-muted-2 font-semibold">No recent training load to map</p>
                )
              )}
            </div>
          </div>
        </div>

        {/* Old "Quick actions" Log-food tile — demoted here as a secondary
            shortcut now that Log Food is a primary FAB action and Nutrition ·
            remaining above already links to /fuel. */}
        <div className="glass px-4 pt-3 pb-3">
          <SectionLabel className="mb-2">Quick actions</SectionLabel>
          <Link
            to="/food-tracker?addFood=true"
            className="glass-inset tile-interactive flex items-center justify-center gap-2.5 min-h-[64px]"
          >
            <Apple className="w-[18px] h-[18px] text-muted-2" />
            <span className="text-[13px] font-extrabold text-ink leading-none">Log food</span>
            <span className="text-[10px] font-semibold text-secondary leading-none">Today&apos;s meals</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
