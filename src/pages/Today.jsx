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
import { toast } from "sonner";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { nowInTz } from "@/utils/dateUtils";
import { useProfile, useAllFoodEntries, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { calculateEWMA } from "@/utils/coachingUtils";
import { useNowDay } from "@/hooks/useNowDay";
import { useActiveWorkoutSession } from "@/hooks/useActiveWorkoutSession";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useTodayPrescription, useAthleteState } from "@/hooks/useEngineQueries";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { useTodayBodyWeight, useLastBodyWeight, useLogWeight } from "@/hooks/useWeighIn";
import { BOUNDS } from "@/components/dashboard/WeighInPrompt";
import ProgramCompleteCard from "@/components/dashboard/ProgramCompleteCard";
import { getTodayProgramWorkout } from "@/utils/programSchedule";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import PrescribedSessionCard from "@/components/dashboard/PrescribedSessionCard";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import TodayActions from "@/components/dashboard/TodayActions";
import { MetricTile, SectionLabel, SegmentedControl, Module } from "@/components/ui/system";
import { Activity, AlertTriangle, ChevronRight, Apple, ChevronDown, Flame, Check } from "lucide-react";
import { format } from "date-fns";

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

// Shared Ledger chart convention (DESIGN.md "Charts"): a gray history polyline
// with a single off-white "now" dot on the last point. Used by both the
// Readiness and Weight-trend modules on Today, each feeding it a normalized
// {points, W, H} built from its own data.
function Spark({ points, W, H }) {
  if (!points || points.length < 2) return null;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="2.75" fill="var(--text-primary)" />
    </svg>
  );
}

// Compact weigh-in row (B mockup): an unweighed morning is the NORMAL case (he
// weighs in every day), so this is its own ~56px module above the to-do list,
// not a rare-state card buried inside Session. One inline field + one button;
// the full WeighInPrompt sheet (with the stale-days warning copy) is still
// used verbatim by the pre-session check-in gate in PrescribedSessionCard.
function WeighInRow({ today, weightUnit }) {
  const { todayWeight, isLoading, isFetching } = useTodayBodyWeight(today);
  const { lastWeight } = useLastBodyWeight(today);
  const logWeight = useLogWeight();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState(false);

  // Don't flash the ask for one frame before we know today is already logged.
  if (isLoading || isFetching) return null;

  const already = todayWeight?.weight != null;
  const reference = lastWeight?.weight ?? null;

  const submit = (e) => {
    e?.preventDefault?.();
    const raw = String(typed).trim().replace(/,/g, ".");
    const parsed = Number.parseFloat(raw);
    const [min, max] = BOUNDS[weightUnit] || BOUNDS.lbs;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed < min || parsed > max) {
      setError(true);
      return;
    }
    setError(false);
    logWeight.mutate(
      { weight: parsed, date: today },
      {
        onSuccess: () => { toast.success(`Logged ${parsed} ${weightUnit}`); setTyped(""); },
        onError: () => setError(true),
      }
    );
  };

  // One row, no separate module label — the row's own leading text carries
  // "Weigh in" (coordinator: "Weigh in · last 184 lb"). Both the input and the
  // Log button are 44px tall (the tap-target floor), so the row is closer to
  // 56px than a purely visual 56px chip would be — that's the accessibility
  // floor, not a miss on the "about 56px" target.
  return (
    <div className="surface px-4 sm:px-5 lg:px-4 py-3 -mx-4 sm:-mx-6 lg:mx-0">
      {already ? (
        <div className="flex items-center justify-between gap-3 min-h-[26px]">
          <span className="text-[13px] font-semibold text-muted-2">
            Logged today <span className="tabular-nums text-ink font-semibold">· {fmt(todayWeight.weight, 1)} {weightUnit}</span>
          </span>
          <Check className="w-4 h-4 text-leaf shrink-0" />
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-muted-2 shrink-0 truncate">
            {reference != null ? `Weigh in · last ${fmt(reference, 1)} ${weightUnit}` : "Weigh in"}
          </span>
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            placeholder={reference != null ? String(reference) : "--"}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6));
              if (error) setError(false);
            }}
            onFocus={(e) => e.target.select()}
            aria-label={`Bodyweight in ${weightUnit}`}
            aria-invalid={error}
            className={`min-w-0 flex-1 min-h-[44px] bg-transparent border-b text-[15px] font-semibold tabular-nums text-ink outline-none px-1 ${error ? "border-warn" : "border-charcoal-border"}`}
          />
          <button
            type="submit"
            disabled={logWeight.isPending || !typed.trim()}
            className="cta-action shrink-0 px-4 min-h-[44px] text-[13px]"
          >
            {logWeight.isPending ? "…" : "Log"}
          </button>
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

  const { prescription, isLoading: prescriptionLoading, isError: prescriptionError } = useTodayPrescription(today);
  const { state, isLoading: stateLoading, isError: stateError } = useAthleteState(today);

  // 14-day readiness-score history for the hero sparkline (B mockup: "Readiness
  // · 14 days" with a gray history line + off-white "now" dot). No existing
  // hook returns a score history (useAthleteState only reads the single latest
  // row), so this queries the same athlete_state table directly — same source
  // Today's own readiness ring already reads, just a date range instead of one row.
  const { data: readinessHistory = [] } = useQuery({
    queryKey: ["readinessHistory14d", today, user?.id],
    queryFn: async () => {
      const since = new Date(`${today}T00:00:00`);
      since.setDate(since.getDate() - 13);
      const { data, error } = await supabase
        .from("athlete_state")
        .select("date, recovery")
        .eq("created_by", user.id)
        .gte("date", since.toISOString().slice(0, 10))
        .lte("date", today)
        .order("date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!today,
    staleTime: 5 * 60 * 1000,
  });

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
  const { enrollments } = useEnrollments();
  const todayProgramWorkout = useMemo(() => {
    // Only an ACTIVE enrollment surfaces a program CTA here. A paused program
    // must not be routed to the program logger, since logging it would silently
    // flip it back to active.
    const active = enrollments.find((e) => e.status === "active");
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

  const intensity = prescription?.mpc_intensity != null ? Number(prescription.mpc_intensity) : null;

  // Any in-progress workout session — surfaced as a banner so it can't be lost.
  // Shares its query and its URL builder with the launch redirect in App.jsx;
  // they must never disagree about where a given session lives.
  const { activeSession, path: activeSessionPath } = useActiveWorkoutSession();

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
  // Readiness sparkline points — normalized into a 250×48 viewBox matching the
  // B mockup's hero chart. Gray history polyline + an off-white "now" dot on
  // the last point (DESIGN.md Charts: "gray history, off-white 'now' dot").
  const readinessSpark = useMemo(() => {
    const scores = readinessHistory
      .map((r) => ({ date: r.date, score: r.recovery?.score }))
      .filter((r) => r.score != null);
    if (scores.length < 2) return null;
    const W = 250, H = 48, PAD = 4;
    const vals = scores.map((s) => Number(s.score));
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const step = (W - PAD * 2) / (scores.length - 1);
    const points = vals.map((v, i) => {
      const x = PAD + i * step;
      const y = PAD + (1 - (v - min) / span) * (H - PAD * 2);
      return { x, y };
    });
    return { points, W, H };
  }, [readinessHistory]);

  const nutritionCols = [
    { label: "Kcal", consumed: todayTotals.calories, goal: dailyTargets.calories, hue: "var(--text-primary)", unit: "" },
    { label: "Protein", consumed: todayTotals.protein, goal: dailyTargets.protein, hue: "var(--hue-coral)", unit: "g" },
    { label: "Carbs", consumed: todayTotals.carbs, goal: dailyTargets.carbs, hue: "var(--hue-blue)", unit: "g" },
    { label: "Fat", consumed: todayTotals.fats, goal: dailyTargets.fats, hue: "var(--hue-yellow)", unit: "g" },
  ];

  // lb/wk trend. On- vs off-goal is read from trendAligned (the sign of the
  // trend relative to the current phase), not from a hard-coded hue — the
  // render side colors it green only when aligned, neutral text otherwise
  // (DESIGN.md: no brand/off-palette accent on a plain data line).
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
    caption: trendAligned == null ? "lb/wk" : trendAligned ? "on goal" : "off goal",
  };

  // Weight-trend module (Today, above the fold): reuses the same
  // useBodyWeightEntries hook + calculateEWMA util that Progress.jsx's full
  // WeightProgressChart uses — just a compact 30-day sparkline instead of the
  // full stat-trio + big chart, so it fits the module budget here. Tapping
  // "Detail ›" still routes to the full chart (Fuel → Body → Weight).
  const { weightEntries } = useBodyWeightEntries();
  const weightUnit = profile?.weight_unit || "lbs";
  const weight30d = useMemo(() => {
    const since = new Date(`${today}T00:00:00`);
    since.setDate(since.getDate() - 29);
    const sorted = [...weightEntries]
      .filter((e) => e.recorded_date >= since.toISOString().slice(0, 10))
      .sort((a, b) => new Date(a.recorded_date) - new Date(b.recorded_date));
    return calculateEWMA(sorted, 0.1);
  }, [weightEntries, today]);
  const latestWeight = weight30d[weight30d.length - 1];
  // Same gray-history/off-white-now-dot sparkline convention as readinessSpark,
  // built from the EWMA trend line (not the raw noisy daily weigh-ins).
  const weightSpark = useMemo(() => {
    if (weight30d.length < 2) return null;
    const W = 250, H = 48, PAD = 4;
    const vals = weight30d.map((e) => Number(e.trendWeight));
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const step = (W - PAD * 2) / (weight30d.length - 1);
    const points = vals.map((v, i) => {
      const x = PAD + i * step;
      const y = PAD + (1 - (v - min) / span) * (H - PAD * 2);
      return { x, y };
    });
    return { points, W, H };
  }, [weight30d]);

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

      {/* Ledger module stack (DESIGN.md / directions "B"): a single flat column,
          8px gaps, one order top → bottom for every breakpoint —
            1. Readiness  2. Weigh in  3. Session  4. To-do  5. Nutrition
            6. Weight trend  7. everything else (secondary / below the fold).
          Target: modules 1-4 visible without scrolling at 428×926, including
          the ordinary unweighed-morning state (weigh-in row not yet logged). */}
      <div className="space-y-2">
        {/* 1 — Readiness: a big tabular number + one plain-language verdict
            line (no ACWR/Form/HRV jargon — that lives one tap away in the
            State detail tab below) + the 14-day sparkline alongside it. No
            ring: a band-colored arc read as an off-palette accent color. */}
        <Module label="Readiness · 14 days">
          {(prescriptionLoading || stateLoading) ? (
            <div className="pulse-loop space-y-3">
              <div className="h-9 bg-track rounded-lg w-16" />
              <div className="h-3 bg-track rounded-lg w-2/3" />
            </div>
          ) : (
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="shrink-0 max-w-[55%]">
                <div className="type-display text-[34px] font-semibold tabular-nums leading-none text-ink">
                  {score == null ? "—" : Math.round(score)}
                </div>
                <p className="font-technical text-[13px] font-semibold text-secondary leading-snug mt-1.5">
                  {verdict}
                </p>
              </div>
              {readinessSpark && (
                <div className="flex-1 min-w-0">
                  <Spark {...readinessSpark} />
                </div>
              )}
            </div>
          )}
        </Module>

        {/* 2 — Weigh in: a daily ritual, not a rare state — its own compact
            module, not folded inside Session (see WeighInRow above). */}
        <WeighInRow today={today} weightUnit={weightUnit} />

        {/* 3 — Start/Resume session (Ledger ".sess" row): workout name, an
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

        {/* 4 — To-do checklist. Self-hides when empty. */}
        <TodayActions today={today} briefActions={briefActions} isError={briefError} />

        {/* 5 — Nutrition remaining: flat 4-column Kcal/Protein/Carbs/Fat, 8px
            bars, macro hues on the labels (DESIGN.md — calories own no hue). */}
        <Module label="Nutrition · remaining" detail="Detail" detailHref="/fuel">
          <div className="grid grid-cols-4 gap-3">
            {nutritionCols.map((c) => {
              const remaining = c.goal ? Math.max(0, Math.round(c.goal - c.consumed)) : null;
              const pct = c.goal ? Math.min(100, (c.consumed / c.goal) * 100) : 0;
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
                    {remaining != null ? `${withThousands(remaining)}${c.unit} left` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </Module>

        {/* 6 — Weight trend: EWMA trend value + compact 30-day sparkline,
            reusing the same useBodyWeightEntries/calculateEWMA the full
            WeightProgressChart (Fuel → Body) uses. Two separate lines (number+
            unit, then trend+caption) rather than one wrapping flex row, so the
            unit label can't collide with the line above it on a narrow phone. */}
        <Module label="Weight trend · 30 days" detail="Detail" detailHref="/fuel?tab=body">
          <div className="flex items-baseline gap-1.5">
            <span className="type-display text-2xl font-semibold tabular-nums">
              {latestWeight ? fmt(latestWeight.trendWeight, 1) : "—"}
            </span>
            <span className="text-[13px] font-semibold text-muted">{weightUnit}</span>
          </div>
          {/* Purple was an off-palette accent for this line. Neutral text by
              default; green only signals an actual positive-vs-goal delta
              (trendAligned), never the raw sign of the trend. */}
          <p
            className="text-[13px] font-semibold mt-1"
            style={{ color: trendAligned ? "var(--hue-green)" : "var(--text-secondary)" }}
          >
            {trend.value !== "—" ? `${trend.value} lb/wk` : "—"}{" "}
            <span className={trendAligned ? "" : "text-muted"}>· {trend.caption}</span>
          </p>
          {weightSpark ? (
            <div className="mt-2">
              <Spark {...weightSpark} />
            </div>
          ) : (
            <p className="text-[12px] text-muted-2 font-semibold mt-2">Log a few weigh-ins to see a trend</p>
          )}
        </Module>

        {/* Below the fold: everything else — secondary or collapsed.
            Carb timing chip → Vitals + Brief/State/Muscle detail disclosure. */}
        {carbTimingToday && carbTimingToday.length > 0 && (
          <div className="glass px-4 sm:px-5 py-3.5">
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
        <div className="surface overflow-hidden">
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
