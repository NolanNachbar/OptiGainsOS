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
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayString, nowInTz } from "@/utils/dateUtils";
import { useProfile } from "@/hooks/useUserQueries";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useTodayPrescription, useAthleteState } from "@/hooks/useEngineQueries";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import PrescribedSessionCard from "@/components/dashboard/PrescribedSessionCard";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import WeighInModal from "@/components/WeighInModal";
import QuickCapture from "@/components/QuickCapture";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatRing, MetricTile, SectionLabel, MiniRing } from "@/components/ui/system";
import { bandFor } from "@/components/ui/system/helpers";
import { Activity, AlertTriangle, ChevronRight, ChevronDown, Scale, Apple, NotebookPen } from "lucide-react";
import { format } from "date-fns";

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d));
const sentence = (s) => {
  const t = String(s || "").replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

export default function Today() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);

  // Morning check-in surfaces (weigh-in + quick note) and the muscle-load
  // disclosure — kept local so the home stays the daily-ritual home without
  // depending on the global FAB.
  const [showWeighIn, setShowWeighIn] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const weightUnit = profile?.weight_unit || "lb";

  const { prescription, isLoading: prescriptionLoading, isError: prescriptionError } = useTodayPrescription(today);
  const { state, isLoading: stateLoading, isError: stateError } = useAthleteState(today);

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
  const endurance = state?.endurance || {};
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

  // The directive — one headline, one supporting sentence.
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
      return {
        headline: "Primed to train",
        detail: intensity != null
          ? `${line ? line + ". " : ""}Load is cleared for ${intensity.toFixed(2)}× intensity.`
          : line ? `${line}.` : "Markers nominal.",
      };
    }
    return {
      headline: "Calibrating",
      detail: line ? `${line}.` : "Log a session and a check-in to sharpen the read.",
    };
  }, [state, prescription, intensity]);

  // Hue-coded morning metrics — each datum owns one hue.
  const morningMetrics = [
    { k: "HRV", v: fmt(recovery?.hrv), u: "ms", hue: "var(--hue-teal-2)" },
    { k: "RHR", v: fmt(recovery?.resting_hr), u: "bpm", hue: "var(--hue-coral)" },
    { k: "Sleep", v: fmt(recovery?.sleep_score), u: "", hue: "var(--hue-violet)" },
    { k: "Batt", v: fmt(recovery?.body_battery), u: "%", hue: "var(--hue-green)" },
  ];

  const avgCal = nutrition?.avg_calories_7d ?? nutrition?.avg_daily_calories_7d;
  const { calories: calTarget, protein: proteinTarget } = useDailyTargets(today);

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

      {/* Mobile order: hero → fuel → state → session → brief → muscle.
          Desktop: hero/session/brief in the left column, rail on the right —
          DOM order stays mobile-first; lg placement is explicit. */}
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
                  <div className="w-[104px] h-[104px] rounded-full bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-white/10 rounded w-2/3" />
                    <div className="h-3 bg-white/10 rounded w-full" />
                    <div className="h-3 bg-white/10 rounded w-4/5" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-[7px]">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-white/10 rounded" />
                  ))}
                </div>
              </div>
            ) : (
            <><div className="flex items-center gap-4 sm:gap-6">
              <StatRing value={score} size={104} label="Readiness" />
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
                <div key={m.k} className="glass-inset py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1 text-[9.5px] font-bold tracking-[0.08em] uppercase text-muted-2">
                    <i className="w-[5px] h-[5px] rounded-full" style={{ background: m.hue }} />
                    {m.k}
                  </div>
                  <div className="font-technical text-[15px] font-extrabold mt-0.5 text-ink">
                    {m.v}
                    {m.u && <span className="text-[9.5px] font-semibold text-muted-2"> {m.u}</span>}
                  </div>
                </div>
              ))}
            </div>
            </>)}
          </div>

          {/* Morning check-in — the daily ritual lives on the home, not buried in the FAB */}
          <div className="glass px-4 pt-3 pb-3 mt-3 rise-in">
            <SectionLabel className="mb-2">Morning check-in</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
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
                onClick={() => setShowNote(true)}
                className="glass-inset tile-interactive flex flex-col items-center justify-center gap-1 py-2.5 min-h-[60px]"
              >
                <NotebookPen className="w-[18px] h-[18px]" style={{ color: "var(--hue-teal-2)" }} />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-2">Note</span>
                <span className="font-technical text-[13px] font-extrabold text-ink leading-none">Capture</span>
              </button>
            </div>
          </div>
        </div>

        {/* The day's CTA — above fuel/state on mobile so the next action is never buried */}
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-2 rise-in-2">
          <PrescribedSessionCard today={today} loggedToday={loggedToday} />
        </div>

        <aside className="lg:col-start-9 lg:col-span-4 lg:row-start-1 lg:row-span-2 space-y-3 rise-in-3">
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
                value={calTarget ? Math.round(calTarget).toLocaleString() : "—"}
                frac={calTarget && avgCal ? avgCal / calTarget : 0}
              />
              <MiniRing
                label="protein" hue="var(--hue-coral)"
                value={proteinTarget ? `${Math.round(proteinTarget)}` : "—"}
                frac={proteinTarget && nutrition?.avg_protein_7d ? nutrition.avg_protein_7d / proteinTarget : 0}
              />
              <MiniRing
                label="lb/wk" hue="var(--hue-violet)"
                value={fmt(nutrition?.weight_trend_lbs_per_week, 1)}
                frac={1}
              />
              <ChevronRight className="w-4 h-4 text-faint" />
            </div>
          </Link>

          <div>
            <SectionLabel className="mb-2 px-0.5">State</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
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
                label="To Aug 31"
                value={endurance?.days_to_aug31 ?? "—"} unit="d"
                accent="var(--hue-gold)"
                sub="PST deadline"
              />
            </div>
          </div>

        </aside>

        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-3 rise-in-2">
          <DailyBriefCard today={today} defaultCollapsed />
        </div>

        {heatmapError ? (
          <div className="surface px-4 py-4 lg:col-start-9 lg:col-span-4 lg:row-start-3 rise-in-3">
            <SectionLabel icon={Activity} className="mb-2">Muscle load · 10 days</SectionLabel>
            <p className="text-[12px] text-muted-2 font-semibold">Could not load muscle data</p>
          </div>
        ) : fatigueData.length > 0 && (
          <div className="surface px-4 py-3 lg:col-start-9 lg:col-span-4 lg:row-start-3 rise-in-3">
            <button
              type="button"
              onClick={() => setShowHeatmap((v) => !v)}
              aria-expanded={showHeatmap}
              className="w-full flex items-center justify-between min-h-[44px]"
            >
              <SectionLabel icon={Activity}>Muscle load · 10 days</SectionLabel>
              <ChevronDown className={`w-4 h-4 text-faint transition-transform ${showHeatmap ? "rotate-180" : ""}`} />
            </button>
            {showHeatmap && (
              <div className="flex justify-center mt-2">
                <MuscleHeatMap data={fatigueData} view="anterior" className="h-[190px]" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Morning check-in modals (local so the home owns the ritual) */}
      <WeighInModal open={showWeighIn} onOpenChange={setShowWeighIn} />
      <Dialog open={showNote} onOpenChange={setShowNote}>
        <DialogContent className="max-w-md glass-elevated text-ink">
          <DialogHeader>
            <DialogTitle className="text-ink">Quick note</DialogTitle>
          </DialogHeader>
          <div className="pt-2">
            <QuickCapture
              domain="general"
              placeholder="Stream a note to Second Brain..."
              onCapture={() => setShowNote(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
