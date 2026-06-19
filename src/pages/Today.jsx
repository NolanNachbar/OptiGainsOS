/**
 * Today — the decision-first home of OptiGainsOS.
 *
 * Answers "what do I do today?" within 3 seconds (the Vapor×Macro hero):
 *   1. Readiness glass card — teal ring + verdict + hue-coded metric grid
 *   2. The engine's prescribed session (rows + load pills + coral CTA)
 *   3. Fuel today — hue-coded rings, one tap to the log
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayString, nowInTz } from "@/utils/dateUtils";
import { useProfile } from "@/hooks/useUserQueries";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useTodayPrescription, useAthleteState } from "@/hooks/useEngineQueries";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import PrescribedSessionCard from "@/components/dashboard/PrescribedSessionCard";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import MorningCheckin from "@/components/dashboard/MorningCheckin";
import TodayActions from "@/components/dashboard/TodayActions";
import WeighInModal from "@/components/WeighInModal";
import { StatRing, MetricTile, SectionLabel, MiniRing, SubTabs } from "@/components/ui/system";
import { bandFor } from "@/components/ui/system/helpers";
import { Activity, AlertTriangle, ChevronRight, Scale, Apple, ChevronDown } from "lucide-react";
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
  // subjective readiness check-in.)
  const [showWeighIn, setShowWeighIn] = useState(false);
  // Subjective readiness check-in (ported from Dashboard) — collapsed to a
  // one-line prompt by default so the coral session CTA stays the single coral
  // primary in the first viewport; the form's "Check In" only materializes once
  // the athlete opens it.
  const [checkinOpen, setCheckinOpen] = useState(false);
  // One consolidated detail card with a 3-way segmented control (State /
  // Brief / Muscle) replaces three stacked disclosure drawers.
  const [detailTab, setDetailTab] = useState("state");
  const weightUnit = profile?.weight_unit || "lb";

  const { prescription, isLoading: prescriptionLoading, isError: prescriptionError } = useTodayPrescription(today);
  const { state, isLoading: stateLoading, isError: stateError } = useAthleteState(today);

  // Subjective readiness check-in for today (ported from Dashboard). When a row
  // exists, MorningCheckin renders its read-only summary; otherwise the
  // collapsed one-line prompt is offered.
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

  const recovery = state?.recovery || {};
  const fatigue = state?.fatigue || {};
  const nutrition = state?.nutrition || {};
  const vdot = state?.vdot_zones || {};
  const score = recovery?.score ?? null;
  const band = bandFor(score);

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
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

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
        detail: line ? `${line}. The engine calls recovery — honor it.` : "The engine calls recovery. Honor it.",
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

  // The consolidated detail card's segmented control. Muscle is offered even
  // on error/empty so the tab set stays stable (the body renders the reason).
  const detailTabs = [
    { id: "state", label: "State" },
    { id: "brief", label: "Brief" },
    { id: "muscle", label: "Muscle" },
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

  // lb/wk trend, colored by goal-alignment: ok when the trend matches the
  // active phase goal (down on a cut, up on a bulk), warn when it opposes it.
  // The sign is preserved (a loss reads "-0.8", a gain "+1.2") with directional
  // hue so the datum keeps its meaning instead of a flat green abs() ring.
  const trendPerWk = nutrition?.weight_trend_lbs_per_week;
  const trend = {
    value: trendPerWk == null ? "—"
      : `${trendPerWk > 0 ? "+" : ""}${fmt(trendPerWk, 1)}`,
    frac: trendPerWk != null ? Math.min(1, Math.abs(Number(trendPerWk)) / 2) : 0,
    hue: (() => {
      if (trendPerWk == null) return "var(--text-faint)";
      const phase = nutrition?.phase;
      const aligned = phase === "cut" ? trendPerWk < 0
        : phase === "bulk" ? trendPerWk > 0
        : Math.abs(trendPerWk) <= 0.5; // maintenance: holding is on-goal
      return aligned ? "var(--hue-green)" : "var(--warn)";
    })(),
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
            ? `/workouts/detail?source=program&programWorkoutId=${activeSession.program_workout_id}${activeSession.enrollment_id ? `&enrollmentId=${activeSession.enrollment_id}` : ''}`
            : `/workouts/detail?id=${activeSession.workout_id}`}
          className="flex items-center justify-between gap-3 px-4 py-3 mb-3 rounded-lg bg-brand/10 border border-brand/20 text-brand text-sm font-semibold rise-in"
        >
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" />
            Workout in progress — tap to continue
          </span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </Link>
      )}

      {/* Mobile order (the canonical home order):
            readiness hero → subjective check-in → prescribed session (+ghost log)
            → Fuel rings → thumb-zone quick actions (Log food / Weigh in)
            → Today's Actions → Details disclosure (State / Brief / Muscle).
          Desktop: hero/check-in/session/actions in the left column, the Fuel rail
          on the right — DOM order stays mobile-first; lg placement is explicit. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:items-start gap-3 lg:gap-4">
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-1 rise-in-2">
          {(prescriptionError || stateError) && (
            <div className="flex items-center gap-2 px-4 py-3 mb-3 rounded-lg bg-warn/15 border border-warn/20 text-warn text-sm font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Could not load today&apos;s data
            </div>
          )}
          {/* The readiness hero — verdict in 3 seconds */}
          <div className="glass px-4 sm:px-5 py-4 rise-in relative overflow-hidden">
            {(prescriptionLoading || stateLoading) ? (
              <div className="animate-pulse space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-[104px] h-[104px] rounded-full glass-inset shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 glass-inset w-2/3" />
                    <div className="h-3 glass-inset w-full" />
                    <div className="h-3 glass-inset w-4/5" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-[7px]">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 glass-inset" />
                  ))}
                </div>
              </div>
            ) : (
            <><div className="flex items-center gap-4 sm:gap-6">
              <StatRing value={score} size={104} label="Readiness" color={band.color} />
              <div className="flex-1 min-w-0">
                <h2 className="text-[17px] sm:text-xl font-extrabold" style={{ color: band.color }}>
                  {headline}
                </h2>
                <p className="font-technical text-[12.5px] sm:text-[13px] font-semibold text-muted-2 leading-relaxed mt-1 max-w-[52ch]">
                  {detail}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-[7px] mt-3">
              {morningMetrics.map((m) => (
                <MetricTile
                  key={m.k}
                  label={m.k}
                  value={m.v}
                  unit={m.u || undefined}
                  accent={m.hue}
                  className="!px-2.5 !py-2"
                />
              ))}
            </div>
            </>)}
          </div>
        </div>

        {/* Subjective readiness check-in — directly under the readiness hero so
            it lives where the athlete already reads the verdict (resolves the
            "subjective check-in buried / 99 taps" IA gap). Collapsed to a
            one-line prompt; the coral "Check In" only fires once expanded, so the
            session CTA below stays the single coral primary. Once logged,
            MorningCheckin renders its own read-only summary. */}
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-2 rise-in-2">
          {todayCheckIn ? (
            <MorningCheckin today={today} existingCheckin={todayCheckIn} />
          ) : checkinOpen ? (
            <MorningCheckin today={today} existingCheckin={null} onComplete={() => setCheckinOpen(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setCheckinOpen(true)}
              className="cta-ghost w-full justify-start gap-2 px-4"
              aria-expanded={false}
            >
              <Activity className="w-3.5 h-3.5 text-teal shrink-0" />
              <span>Log today&apos;s readiness check-in</span>
              <ChevronDown className="w-4 h-4 ml-auto text-muted-2" />
            </button>
          )}
        </div>

        {/* The day's CTA — under the verdict + check-in so the next action is never buried.
            When the engine prescribes nothing, PrescribedSessionCard renders null;
            surface a neutral ad-hoc "Log a workout" ghost link so off-script
            training is never buried (mirrors the rest/logged ghost states). */}
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-3 rise-in-2">
          <PrescribedSessionCard today={today} loggedToday={loggedToday} />
          {!prescriptionLoading && !prescription && (
            <Link to="/quick-workout" className="cta-ghost w-full">
              Log a workout
            </Link>
          )}
        </div>

        {/* Thumb-zone quick actions — the two most-tapped daily logs (food + weigh-in),
            kept in the lower third near the dock. The retired Stream Note tile freed
            this slot; the readiness check-in took its thumb position above. */}
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-4 rise-in-2">
          <div className="glass px-4 pt-3 pb-3 rise-in">
            <SectionLabel className="mb-2">Quick actions</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/food-tracker?addFood=true"
                className="glass-inset tile-interactive flex flex-col items-center justify-center gap-1 py-2.5 min-h-[60px]"
              >
                <Apple className="w-[18px] h-[18px]" style={{ color: "var(--hue-gold)" }} />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-2">Log food</span>
                <span className="font-technical text-[13px] font-extrabold text-ink leading-none">Track</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowWeighIn(true)}
                className="glass-inset tile-interactive flex flex-col items-center justify-center gap-1 py-2.5 min-h-[60px]"
              >
                <Scale className="w-[18px] h-[18px]" style={{ color: "var(--hue-violet)" }} />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-2">Weigh in</span>
                <span className="font-technical text-[13px] font-extrabold text-ink leading-none">
                  {profile?.current_weight ? `${Math.round(profile.current_weight)} ${weightUnit}` : "Log"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Today's Actions — the coaching todo list ported from Dashboard. Self-hides
            when empty, so it only occupies the slot when there is something to do. */}
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-5 rise-in-3">
          <TodayActions today={today} briefActions={todayBrief?.brief_json?.today_actions} isError={briefError} />
        </div>

        <aside className="lg:col-start-9 lg:col-span-4 lg:row-start-1 lg:row-span-3 space-y-3 rise-in-3">
          {/* Fuel today — hue-coded rings, one tap to the log */}
          <Link to="/fuel" className="glass glass-interactive block px-4 py-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Fuel today</SectionLabel>
              <span className="text-[11px] font-semibold text-faint">
                {nutrition?.phase ? `${nutrition.phase} phase` : "targets"}
              </span>
            </div>
            <div className="flex items-center justify-around mt-2 px-1">
              <MiniRing
                label="kcal" hue="var(--hue-gold)" size={50}
                value={compactK(calTarget)}
                frac={calTarget && avgCal ? avgCal / calTarget : 0}
              />
              <MiniRing
                label="protein" hue="var(--hue-coral)"
                value={proteinTarget ? `${Math.round(proteinTarget)}` : "—"}
                frac={proteinTarget && nutrition?.avg_protein_7d ? nutrition.avg_protein_7d / proteinTarget : 0}
              />
              <MiniRing
                label="lb/wk" hue={trend.hue}
                value={trend.value}
                frac={trend.frac}
              />
              <ChevronRight className="w-4 h-4 text-faint" />
            </div>
          </Link>

        </aside>

        {/* Consolidated detail card — one header, one body. The three former
            disclosure drawers (State / Brief / Muscle) collapse into a single
            glass card switched by the SubTabs segmented control, so the page
            ends on one card instead of three stacked toggles. */}
        <div className="lg:col-start-1 lg:col-span-12 lg:row-start-6 rise-in-3">
          <div className="surface overflow-hidden">
            <SubTabs
              tabs={detailTabs}
              active={detailTab}
              onChange={setDetailTab}
              sticky={false}
              showOnDesktop
              className="!rounded-t-[inherit]"
            />
            <div key={detailTab} className="rise-in">
              {detailTab === "state" && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-4 py-3">
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
                <div className="px-4 py-3">
                  <DailyBriefCard today={today} />
                </div>
              )}
              {detailTab === "muscle" && (
                heatmapError ? (
                  <p className="px-4 py-4 text-[12px] text-muted-2 font-semibold">Could not load muscle data</p>
                ) : fatigueData.length > 0 ? (
                  <div className="flex justify-center px-4 py-3">
                    <MuscleHeatMap data={fatigueData} view="anterior" className="h-[190px]" />
                  </div>
                ) : (
                  <p className="px-4 py-4 text-[12px] text-muted-2 font-semibold">No recent training load to map</p>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Weigh-in surface (local so the home owns the daily ritual). The Stream
          Note modal was removed — the mobile-strip Stream Note utility is the
          single canonical entry. */}
      <WeighInModal open={showWeighIn} onOpenChange={setShowWeighIn} />
    </div>
  );
}
