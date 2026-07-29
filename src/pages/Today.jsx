/**
 * Today — the decision-first home of OptiGainsOS.
 *
 * Answers "what do I do today?" within 3 seconds (the Vapor×Macro hero):
 *   1. Readiness glass card — teal ring + verdict + hue-coded metric grid
 *   2. The engine's prescribed session (rows + load pills + teal CTA)
 *   3. Fuel today — hue-coded rings, one tap to the log
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayString, nowInTz } from "@/utils/dateUtils";
import { useProfile, useAllFoodEntries } from "@/hooks/useUserQueries";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useTodayPrescription, useAthleteState } from "@/hooks/useEngineQueries";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { getTodayProgramWorkout } from "@/utils/programSchedule";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import PrescribedSessionCard from "@/components/dashboard/PrescribedSessionCard";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import TodayActions from "@/components/dashboard/TodayActions";
import { StatRing, MetricTile, SectionLabel, MiniRing, SegmentedControl } from "@/components/ui/system";
import { bandFor } from "@/components/ui/system/helpers";
import { Activity, AlertTriangle, ChevronRight, Apple, ChevronDown, Flame } from "lucide-react";
import { format } from "date-fns";

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d));
// Compact kcal for the 50px MiniRing — "2,043" overruns the ring, so values
// ≥1,000 collapse to a single-decimal "k" form (2043 → "2.0k"). MiniRing is a
// shared primitive (no in-ring autosizing), so the abbreviation happens at the
// call site to keep the digit count ≤4 glyphs.
const compactK = (n) =>
  n == null || Number.isNaN(Number(n)) ? "—"
    : Number(n) >= 1000 ? `${(Number(n) / 1000).toFixed(1)}k`
    : String(Math.round(Number(n)));
// Full thousands-separated integer — used for the kcal ring's TARGET caption so
// it reads non-lossy ("/2,800 · 7d"), distinct from the compact in-ring average
// value (which abbreviates to "2.8k" to fit the 50px ring).
const withThousands = (n) =>
  n == null || Number.isNaN(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("en-US");
const sentence = (s) => {
  const t = String(s || "").replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

export default function Today() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);

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
        .select("start_time, end_time, status")
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
  const { enrollments } = useEnrollments();
  const todayProgramWorkout = useMemo(() => {
    // Only an ACTIVE enrollment surfaces a program CTA here. A paused program
    // must not be routed to the program logger, since logging it would silently
    // flip it back to active.
    const active = enrollments.find((e) => e.status === "active");
    if (!active) return null;
    const entry = getTodayProgramWorkout(active, active.program?.workouts, profile?.timezone);
    return entry
      ? { programWorkoutId: entry.programWorkoutId, enrollmentId: entry.enrollmentId }
      : null;
  }, [enrollments, profile?.timezone]);

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
  const { data: recentLogs = [], isError: heatmapError } = useQuery({
    queryKey: ["todayHeatmapLogs_v2", user?.id],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 10);
      const { data, error } = await supabase
        .from("workout_logs")
        .select("log_date, exercises")
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
  const band = bandFor(score);
  // "Calibrating" — no engine action yet (no prescription). In this state the
  // hero must NOT signal a confident verdict: the arc + headline word are not
  // brand teal regardless of the raw recovery score, since the engine hasn't
  // cleared anything to train.
  const calibrating = prescription?.mpc_action == null;
  // Readiness owns TEAL in the hue map (readiness · intensity), so the hero ring
  // and verdict word stay teal whenever the read is positive (>=70). bandFor
  // hands the 70-84 "Ready" band a body-battery GREEN, which both wears the
  // wrong family for the single most prominent datum and competes with the teal
  // FAB/dock as a second action-adjacent color. We keep warn/bad for the
  // genuinely cautionary bands (Moderate/Recover) so the verdict still signals.
  //
  // CALIBRATING (today-2 / dashboard-1): the engine hasn't cleared a session, so
  // the hero must NOT signal a confident teal verdict. But a flat-grey arc read
  // as broken/disabled, hiding the biometric the athlete DID log. So while
  // calibrating we still paint the arc its raw BAND hue (a measured biometric
  // readout — never brand teal: bandFor's teal stop is --hue-teal #5EDCD2, a data
  // hue, not the rgb(25,200,166) action teal), and the verdict WORD stays
  // non-teal by lifting to --text-primary. When a real read exists, the ring uses
  // the readiness-teal for the positive band and the band hue otherwise.
  const readinessHue = score == null
    ? "var(--text-faint)"
    : calibrating
      ? band.color
      : score >= 70 ? "var(--hue-teal)" : band.color;
  // The headline word never reads brand teal. While calibrating it lifts to
  // --text-primary (the strongest non-teal ink) so the directive leads cleanly;
  // a null score keeps it at --text-secondary; otherwise it tracks the verdict
  // arc hue (which is the data --hue-teal, not the action teal, on a positive
  // read).
  const headlineColor = score == null
    ? "var(--text-secondary)"
    : calibrating
      ? "var(--text-primary)"
      : readinessHue;

  const intensity = prescription?.mpc_intensity != null ? Number(prescription.mpc_intensity) : null;

  // Any in-progress workout session — surfaced as a banner so it can't be lost
  const { data: activeSession } = useQuery({
    queryKey: ["activeWorkoutSession", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, program_workout_id, enrollment_id")
        .eq("created_by", user.id)
        .eq("status", "in_progress")
        // Skip orphan sessions with no navigable target, else the banner dead-ends.
        .or("workout_id.not.is.null,program_workout_id.not.is.null")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

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

  // The directive — one headline, one supporting sentence. The lead word is
  // derived from the readiness band (bandFor), so the WORD never contradicts the
  // ring/verdict hue: "Primed" is gated to the ≥85 primed band, and a 72 reads
  // "Ready" (its band) rather than overstating "Primed". The engine action
  // (rest vs train, cleared intensity) is carried as the supporting detail.
  const { headline, detail } = useMemo(() => {
    const rec = state?.recovery || {};
    const fat = state?.fatigue || {};
    const action = prescription?.mpc_action;
    const bits = [];
    if (fat.acwr != null) bits.push(`ACWR ${Number(fat.acwr).toFixed(2)}`);
    if (fat.tsb != null) bits.push(`Form ${Number(fat.tsb).toFixed(0)}`);
    if (rec.hrv_trend && rec.hrv_trend !== "stable") bits.push(`HRV ${rec.hrv_trend}`);
    const line = bits.join(" · ");
    if (action === "REST") {
      return {
        headline: "Rest today",
        detail: line ? `${line}. The engine calls recovery, honor it.` : "The engine calls recovery. Honor it.",
      };
    }
    if (action) {
      // Lead word from the band scale so it tracks the verdict hue; "Primed"
      // only fires in the primed band. Below "Ready" the score itself says
      // caution, so fall back to the band label as the directive word.
      const word = band.label === "—" ? "Cleared to train" : `${band.label} to train`;
      return {
        headline: word,
        detail: intensity != null
          ? `${line ? line + ". " : ""}Load is cleared for ${intensity.toFixed(2)}× intensity.`
          : line ? `${line}.` : "Markers nominal.",
      };
    }
    return {
      headline: "Calibrating",
      detail: line ? `${line}.` : "Log a session and a check-in to sharpen the read.",
    };
  }, [state, prescription, intensity, band.label]);

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

  const avgCal = nutrition?.avg_calories_7d ?? nutrition?.avg_daily_calories_7d;
  const { calories: calTarget, protein: proteinTarget } = useDailyTargets(today);

  // lb/wk trend. Gold is the documented owner of kcal, so the trend ring must
  // NOT also ride gold — two gold rings flanking the coral protein ring flatten
  // the per-datum encoding (kcal and the trend read as the same datum). Trend is
  // a body-comp readout, so it carries violet (the body-state family, distinct
  // from gold kcal and coral protein) while staying off the ok/warn
  // physiological spectrum. On- vs off-goal is still read from the SIGN (a loss
  // reads "-0.8", a gain "+1.2") plus the caption, not from recoloring the ring.
  const trendPerWk = nutrition?.weight_trend_lbs_per_week;
  const trendAligned = (() => {
    if (trendPerWk == null) return null;
    const phase = nutrition?.phase;
    return phase === "cut" ? trendPerWk < 0
      : phase === "bulk" ? trendPerWk > 0
      : Math.abs(trendPerWk) <= 0.5; // maintenance: holding is on-goal
  })();
  const trend = {
    value: trendPerWk == null ? "—"
      : `${trendPerWk > 0 ? "+" : ""}${fmt(trendPerWk, 1)}`,
    frac: trendPerWk != null ? Math.min(1, Math.abs(Number(trendPerWk)) / 2) : 0,
    hue: trendPerWk == null ? "var(--text-faint)" : "var(--hue-violet)",
    caption: trendAligned == null ? "lb/wk" : trendAligned ? "on goal" : "off goal",
  };

  return (
    <div className="min-h-full px-4 sm:px-6 pt-2 lg:pt-6 pb-6 max-w-[1240px] mx-auto">
      {/* Desktop-only page header (mobile header already names the screen) */}
      <div className="hidden lg:flex items-baseline justify-between mb-5 rise-in">
        <div className="flex items-baseline gap-3.5">
          <h1 className="type-display text-[26px]">Today</h1>
          <span className="text-[13px] font-semibold text-muted-2">{format(nowInTz(profile?.timezone), "EEEE, MMMM d")}</span>
        </div>
      </div>

      {activeSession && (
        <Link
          to={activeSession.program_workout_id
            ? `/workout-detail?source=program&programWorkoutId=${activeSession.program_workout_id}${activeSession.enrollment_id ? `&enrollmentId=${activeSession.enrollment_id}` : ''}`
            : `/workout-detail?id=${activeSession.workout_id}`}
          // Neutral glass, not glass-brand/text-brand: the FAB is the single
          // teal action on this screen, so the in-progress banner reads as a
          // quiet "tap to continue" disclosure row (muted ink + chevron) rather
          // than a second competing teal CTA.
          className="surface flex items-center justify-between gap-3 px-4 py-3 mb-3 rounded-2xl text-ink text-sm font-semibold rise-in"
        >
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0 text-muted-2" />
            Workout in progress, tap to continue
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-2" />
        </Link>
      )}

      {/* Mobile order (the canonical home order):
            readiness hero → subjective check-in → prescribed session (+ghost log)
            → Fuel rings → thumb-zone quick actions (Log food / Weigh in)
            → Today's Actions → Details disclosure (State / Brief / Muscle).
          Desktop: hero/check-in/session/actions in the left column, the Fuel rail
          on the right, DOM order stays mobile-first; lg placement is explicit. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:items-start gap-3 lg:gap-4">
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-1 rise-in-2">
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
          {/* The readiness hero — verdict in 3 seconds */}
          <div className="glass px-4 sm:px-5 py-4 rise-in">
            {(prescriptionLoading || stateLoading) ? (
              <div className="pulse-loop space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-[104px] h-[104px] rounded-full bg-track shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-track rounded-lg w-2/3" />
                    <div className="h-3 bg-track rounded-lg w-full" />
                    <div className="h-3 bg-track rounded-lg w-4/5" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-[7px]">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-track rounded-lg" />
                  ))}
                </div>
              </div>
            ) : (
            <><div className="flex items-center gap-4 sm:gap-6">
              {/* StatRing rule: the readiness ring is BAND-colored (the verdict
                  hue), so the arc tracks the score/headline, the component's
                  teal gradient is the default only for non-verdict rings. The
                  micro-label below the score stays 'READINESS'. */}
              <StatRing value={score} size={104} label="Readiness" color={readinessHue} />
              <div className="flex-1 min-w-0">
                <h2 className="type-display text-lg sm:text-xl" style={{ color: headlineColor }}>
                  {headline}
                </h2>
                <p className="font-technical text-[13px] font-semibold text-secondary leading-relaxed mt-1 max-w-[52ch]">
                  {detail}
                </p>
              </div>
            </div>
            </>)}
          </div>
        </div>

        {/* The day's CTA — under the verdict so the next action is never
            buried. PrescribedSessionCard owns ALL its fallbacks now: when the
            engine prescribes nothing it renders the neutral "Log a workout" ghost
            itself (the duplicate ghost that used to live here was removed).

            One exception: when a workout is already in progress AND the engine has
            no prescription, the card's ONLY content would be that "Log a workout"
            fallback ghost, which is redundant with (and competes against) the
            teal "tap to continue" banner above. In that single case we suppress
            the card so the continue banner is the sole workout entry. On train
            days (a prescription exists) the card still renders, and demoteCta
            keeps its Begin Session a ghost so there's never a second teal. */}
        {!(activeSession && !prescription) && (
          <div className="lg:col-start-1 lg:col-span-8 lg:row-start-2 rise-in-2">
            {/* The subjective check-in now rides the Begin Session flow: the card
                gates its CTA on todayCheckin (no check-in yet → check-in sheet
                first, then straight into the logger). */}
            <PrescribedSessionCard today={today} loggedToday={loggedToday} demoteCta={demoteSessionCta} programWorkout={todayProgramWorkout} todayCheckin={todayCheckIn} />
          </div>
        )}

        {/* Actual carbs eaten pre/post each session, from the real food log —
            not the engine's target. Empty on a rest day (carbTimingToday null). */}
        {carbTimingToday && carbTimingToday.length > 0 && (
          <div className="lg:col-start-1 lg:col-span-8 rise-in-2 glass px-4 sm:px-5 py-3.5 mt-3">
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

        {/* Thumb-zone quick actions — the two most-tapped daily logs (food +
            weigh-in). Lifted directly under the session CTA (ABOVE the Fuel
            rings) so food logging lands in the thumb zone of the first viewport
            and never requires a scroll. On desktop it stays in the left column
            (lg:row-start-4) below the session; the Fuel rail keeps the right
            rail, so this DOM move is mobile-only. */}
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-3 rise-in-2">
          <div className="glass px-4 pt-3 pb-3 rise-in">
            <SectionLabel className="mb-2">Quick actions</SectionLabel>
            {/* One tile: weigh-in was dropped here as a redundant entry — the
                global FAB fan already owns "Weigh In" (dashboard-5), so a second
                weigh-in launcher on Today duplicated it. "Log food" is the one
                most-tapped daily log, so it takes the full row. */}
            <Link
              to="/food-tracker?addFood=true"
              className="glass-inset tile-interactive flex items-center justify-center gap-2.5 min-h-[64px]"
            >
              {/* Action tile, not a datum: the icon carries no value, so it
                  rides neutral muted ink. Data hues (gold/coral/violet) are
                  reserved for actual readouts, never tile decoration. */}
              <Apple className="w-[18px] h-[18px] text-muted-2" />
              <span className="text-[13px] font-extrabold text-ink leading-none">Log food</span>
              <span className="text-[10px] font-semibold text-secondary leading-none">Today&apos;s meals</span>
            </Link>
          </div>
        </div>

        {/* Fuel today — the detail of the #3 priority. On MOBILE it renders after
            the thumb-zone quick actions (DOM order) so the food-log tap lands
            first. On desktop it jumps to the right rail via explicit
            lg:col/row-start, so this DOM move is mobile-only. */}
        <aside className="lg:col-start-9 lg:col-span-4 lg:row-start-1 space-y-3 rise-in-3">
          {/* Fuel today — hue-coded rings, one tap to the log */}
          {/* active:press — tap feedback on the whole Fuel card so a thumb tap
              reads as a pressed control, not an inert panel (today-7). On the
              single system easing; the scale settles back on release. */}
          <Link
            to="/fuel"
            className="glass glass-interactive block px-4 py-3 transition-transform duration-200 [transition-timing-function:var(--ease)] active:scale-[0.98]"
          >
            {/* Chevron lives in the header row (the link affordance) so the
                three rings below own a clean, centered row to themselves. */}
            <div className="flex items-center justify-between">
              <SectionLabel>Fuel today</SectionLabel>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                {nutrition?.phase ? `${nutrition.phase} phase` : "targets"}
                <ChevronRight className="w-4 h-4 text-secondary" />
              </span>
            </div>
            <div className="flex items-center justify-around mt-2 px-1">
              {/* Center value is the LIVE 7-day average (what the arc measures),
                  with the target moved to the caption so the digit and the arc
                  agree. Labels say "/ target · 7d avg" so the number is never
                  mistaken for today's intake or for the goal itself. */}
              <MiniRing
                label={calTarget ? `/${withThousands(calTarget)} · 7d` : "kcal · 7d"} hue="var(--hue-gold)" size={50}
                value={compactK(avgCal)}
                frac={calTarget && avgCal ? avgCal / calTarget : 0}
              />
              {/* Protein owns coral. When the 7d average is genuinely absent the
                  ring drops to the faint track hue (not full coral at frac 0) so
                  a bare "—" reads as an intentional "no data yet" state rather
                  than a broken/colorless circle flanked by the two filled
                  rings. */}
              <MiniRing
                label={proteinTarget ? `/${Math.round(proteinTarget)}g · 7d` : "protein · 7d"}
                hue={nutrition?.avg_protein_7d != null ? "var(--hue-coral)" : "var(--text-faint)"}
                value={nutrition?.avg_protein_7d != null ? `${Math.round(nutrition.avg_protein_7d)}` : "—"}
                frac={proteinTarget && nutrition?.avg_protein_7d ? nutrition.avg_protein_7d / proteinTarget : 0}
              />
              {/* lb/wk rides the body-comp violet hue (distinct from gold kcal
                  and coral protein so the three rings read as three datums); the
                  SIGN (+/−) carries direction and the label flips to on/off goal
                  so alignment is read from sign + caption, not a ring color. */}
              <MiniRing
                label={trend.caption} hue={trend.hue}
                value={trend.value}
                frac={trend.frac}
              />
            </div>
          </Link>
        </aside>

        {/* Consolidated detail card — one header, one body. The three former
            disclosure drawers (Brief / State / Muscle) collapse into a single
            glass card switched by the lighter inset SegmentedControl. On MOBILE
            the whole card sits behind a single disclosure (default closed) so the
            primary surface ends near the 2-viewport mark; on desktop the body is
            always shown. */}
        <div className="lg:col-start-1 lg:col-span-12 lg:row-start-4 rise-in-3">
          <div className="surface overflow-hidden">
            {/* Vitals sub-row — the 4 biometric tiles (HRV/RHR/Sleep/Batt) moved
                off the readiness hero so the hero stays StatRing + verdict and the
                session CTA lands in viewport 1. Now rendered ALWAYS (not behind
                the mobile disclosure): at 390px the collapsed stack ended well
                above the fold and left a tall dead band between this card and the
                dock. Promoting these 4 glanceable markers fills that hollow with
                real data instead of an empty gap, while the fuller Brief / State /
                Muscle context still lives behind the disclosure below.
                2-up at 390px, 4-up at sm+ so the values are never cramped. */}
            <div className="px-4 pt-3 lg:pt-4">
              <SectionLabel>Vitals</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-[7px] mt-2">
                {morningMetrics.map((m) => (
                  <MetricTile
                    key={m.k}
                    label={m.k}
                    value={m.v}
                    unit={m.u || undefined}
                    accent={m.hue}
                    // Uniform L+R padding on every Vitals cell so the four tiles
                    // compute identical insets at 390px. FAB overlap is handled by
                    // the page's --fab-clearance bottom budget (Layout's <main>
                    // reserves the FAB's full footprint), so the bottom-right BATT
                    // tile no longer needs a bespoke right-edge inset to clear the
                    // floating '+'.
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
            {/* Body: toggleable on mobile via detailOpenResolved, always shown on desktop. */}
            <div className={`${detailOpenResolved ? "block" : "hidden"} lg:block`}>
            {/* In-card switch uses the lighter inset SegmentedControl (NOT the
                global glass-elevated coral SubTabs strip) so it doesn't mimic the
                page-level nav pills. */}
            <div className="px-4 pt-3 lg:pt-4">
              <SegmentedControl
                options={detailTabs}
                value={detailTab}
                onChange={setDetailTab}
                size="md"
                // Arbitrary child variant lifts each segment button to a ≥44px
                // tap target without touching the shared primitive (used at its
                // compact default elsewhere).
                className="inline-flex [&_button]:min-h-[44px] [&_button]:px-4"
              />
            </div>
            {/* Even vertical rhythm (today-5): the tab body opens one shared
                step (pt-3 / lg:pt-4) below the SegmentedControl — the SAME gap
                that sits above the control and above the Vitals grid — so
                Vitals → control → brief read as evenly spaced bands rather than
                three different gaps. Each tab carries only its bottom padding
                (pb-4); the top gap lives here once. */}
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
                  {/* Fitness (chronic training load) replaces the former
                      "To Aug 31 · PST" deadline tile, which duplicated the gold
                      "days · PST" chip in the mobile header (Layout.jsx). CTL is
                      a distinct training-state datum and shares the aerobic blue
                      hue family with the load metrics around it. */}
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
        </div>

        {/* Today's Actions — the coaching todo list ported from Dashboard. Moved
            BELOW the collapsed detail disclosure so the primary surface (verdict +
            session CTA + fuel + quick actions) ends near the 2-viewport mark and
            the coaching todo region no longer pushes the detail disclosure off
            screen. Self-hides when empty, so it only occupies a slot when there is
            something to do. */}
        <div className="lg:col-start-1 lg:col-span-12 lg:row-start-5 rise-in-3">
          <TodayActions today={today} briefActions={briefActions} isError={briefError} />
        </div>
      </div>
    </div>
  );
}
