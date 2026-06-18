import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTodayString } from "@/utils/dateUtils";
import { useEngineParams, useTodayPrescription } from "@/hooks/useEngineQueries";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import PSTTracker from "@/components/PSTTracker";
import VdotZonesCard from "@/components/workouts/VdotZonesCard";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import { MetricTile } from "@/components/ui/system";
import { Link } from "react-router-dom";
import { useState } from "react";
import {
  Dumbbell, Activity, BarChart3, Heart, Waves,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Utensils, Cpu,
  Camera, ChevronRight, CalendarDays, FlaskConical, Info, ChevronDown,
} from "lucide-react";

// ── InfoNote — a tap-to-reveal legend (Info popover via native details) ─────────
// Moves verbose chart-legend paragraphs out of the default view so cards stay
// scannable; tapping the Info dot discloses the explanation in place.
function InfoNote({ children, label = "What do these mean?" }) {
  return (
    <details className="group mt-1">
      <summary className="list-none flex items-center gap-1 cursor-pointer text-[10px] font-bold uppercase tracking-[0.08em] text-faint hover:text-muted-2 transition-colors">
        <Info className="w-3 h-3" />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
      </summary>
      <p className="text-[10px] font-semibold text-muted-2 mt-1.5 leading-relaxed">{children}</p>
    </details>
  );
}

// ── Adaptive engine internals (engine_params + training_prescription) ─────────
// Surfaces the engine's deepest learned state — VDOT, RLS personalization
// progress, Banister model confidence, concurrent-training interference — which
// the app computes daily but never previously displayed.
function AdaptiveEnginePanel() {
  const { engineParams, isLoading: engineLoading } = useEngineParams();
  const { prescription, isLoading: prescriptionLoading } = useTodayPrescription();
  const isLoading = engineLoading || prescriptionLoading;

  if (isLoading) {
    return (
      <Card className="glass glass-interactive mb-4">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="section-label flex items-center gap-2 normal-case">
            <Cpu className="w-3.5 h-3.5 text-teal" /> Adaptive Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-3/4" />
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-1/2" />
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-2/3" />
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-5/12" />
        </CardContent>
      </Card>
    );
  }

  if (!engineParams && !prescription) return null;

  const vdot = engineParams?.vdot_state?.vdot;
  const vdotHist = engineParams?.vdot_state?.vdot_history || [];
  const vdotTrend = vdotHist.length >= 2 ? vdot - vdotHist[vdotHist.length - 2] : null;
  const updates = engineParams?.rls_params?.update_count ?? 0;
  const personalization = updates >= 4 ? "Personalized" : updates >= 1 ? `Calibrating ${updates}/4` : "Population defaults";
  const confidence = prescription?.banister_state?.confidence;

  // RLS-learned physiological constants vs population defaults — the literal
  // "it converges to you" signal that previously lived only in a JSON column.
  const kalman = engineParams?.kalman_state || {};
  const tauFat = kalman.tau_fat != null ? Number(kalman.tau_fat) : null;   // default 15d
  const tauFit = kalman.tau_fit != null ? Number(kalman.tau_fit) : null;   // default 45d

  // UCB1 volume-tolerance bandit — what the engine is currently probing /
  // what it has learned tolerates the most volume.
  const expl = engineParams?.guardrail_state?.exploration_state;
  let probe = null;
  if (expl?.parameters?.length && Array.isArray(expl.counts)) {
    let bi = -1, bc = 0;
    expl.counts.forEach((c, i) => { if (c > bc) { bc = c; bi = i; } });
    if (bi >= 0) {
      const reward = Array.isArray(expl.values) ? expl.values[bi] : null;
      probe = { muscle: expl.parameters[bi], pulls: bc, reward };
    }
  }

  return (
    <Card className="glass glass-interactive mb-4 rise-in">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="section-label flex items-center gap-2 normal-case">
          <Cpu className="w-3.5 h-3.5 text-teal" /> Adaptive Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="glass-inset px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[9.5px] font-bold tracking-[0.08em] uppercase text-muted-2 mb-1">
              <i className="w-[5px] h-[5px] rounded-full bg-carb" /> VDOT
            </div>
            <div className="font-technical text-xl font-extrabold text-ink">{vdot != null ? Number(vdot).toFixed(1) : "—"}</div>
            {vdotTrend != null && Math.abs(vdotTrend) >= 0.05 && (
              <div className={`font-technical text-[10px] font-bold ${vdotTrend >= 0 ? "text-teal" : "text-bad"}`}>
                {vdotTrend >= 0 ? "▲" : "▼"} {Math.abs(vdotTrend).toFixed(1)}
              </div>
            )}
          </div>
          <div className="glass-inset px-3 py-2.5 text-center">
            <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-muted-2 mb-1">Personalization</div>
            <div className="text-sm font-bold text-ink mt-1.5">{personalization}</div>
          </div>
          <div className="glass-inset px-3 py-2.5 text-center">
            <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-muted-2 mb-1">Model Confidence</div>
            <div className="font-technical text-xl font-extrabold text-ink">{confidence != null ? `${Math.round(confidence * 100)}%` : "—"}</div>
          </div>
          <div className="glass-inset px-3 py-2.5 text-center">
            <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-muted-2 mb-1">Interference</div>
            <div className="text-sm font-bold text-ink mt-1.5">{prescription?.interference?.interference_level || "—"}</div>
          </div>
        </div>

        {/* What the engine has learned about you (RLS constants + volume probe) */}
        {(tauFat != null || probe) && (
          <div className="mt-4 pt-3 border-t hairline space-y-1.5">
            <div className="section-label !text-[9.5px]">Learnings</div>
            {tauFat != null && (
              <p className="text-xs font-semibold text-secondary">
                Fatigue clears in <span className="font-technical font-extrabold text-ink">{tauFat.toFixed(0)}d</span>
                <span className="text-faint"> (pop. avg 15d)</span>
                {tauFit != null && <>, fitness decays over <span className="font-technical font-extrabold text-ink">{tauFit.toFixed(0)}d</span><span className="text-faint"> (pop. 45d)</span></>}
                {updates < 4 && <span className="text-faint"> — still calibrating</span>}
              </p>
            )}
            {probe && (
              <p className="text-xs font-semibold text-secondary">
                Volume probe: <span className="text-ink font-bold">{String(probe.muscle).replace(/_/g, " ")}</span>
                <span className="text-faint"> · {probe.pulls} test{probe.pulls === 1 ? "" : "s"}</span>
                {probe.reward != null && Number.isFinite(probe.reward) && (
                  <span className={probe.reward >= 0 ? "text-teal" : "text-bad"}> · responds {probe.reward >= 0 ? "well" : "poorly"}</span>
                )}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Weekly plan + controlled tests ────────────────────────────────────────────
// The engine writes weekly_plans (set targets + human-readable rationale) and
// controlled_tests (volume-tolerance ramps, PST diagnostics) that previously
// had no readers in the UI — surface them read-only here.
function WeeklyPlanPanel() {
  const { user } = useAuth();

  const { data: plan, isLoading: planLoading, isError: planError, refetch: refetchPlan } = useQuery({
    queryKey: ["weekly-plan", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_plans")
        .select("week_start,set_targets,frequency_targets,rationale,run_plan")
        .eq("created_by", user.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tests = [], isLoading: testsLoading, isError: testsError, refetch: refetchTests } = useQuery({
    queryKey: ["controlled-tests-active", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("controlled_tests")
        .select("*")
        .eq("created_by", user.id)
        .eq("status", "active");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = planLoading || testsLoading;
  const isError = planError || testsError;

  if (isError) {
    return (
      <Card className="glass glass-interactive mb-4">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="section-label flex items-center gap-2 normal-case">
            <CalendarDays className="w-3.5 h-3.5 text-gold" /> This Week&apos;s Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 text-center">
          <div className="pt-8">
            <AlertTriangle className="w-6 h-6 text-warn mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-2">Couldn&apos;t load weekly plan.</p>
            <Button variant="outline" className="mt-4 h-11" onClick={() => { refetchPlan(); refetchTests(); }}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="glass glass-interactive mb-4">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="section-label flex items-center gap-2 normal-case">
            <CalendarDays className="w-3.5 h-3.5 text-gold" /> This Week&apos;s Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-3/4" />
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-1/2" />
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-2/3" />
          <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-5/12" />
        </CardContent>
      </Card>
    );
  }

  if (!plan && tests.length === 0) return null;

  const setTargets = plan?.set_targets || {};

  return (
    <Card className="glass glass-interactive mb-4 rise-in">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="section-label flex items-center gap-2 normal-case">
          <CalendarDays className="w-3.5 h-3.5 text-gold" /> This Week&apos;s Plan
          {plan?.week_start && <span className="font-technical text-[10px] font-bold text-faint normal-case">wk of {plan.week_start}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-3">
        {tests.map(t => {
          const b = t.baseline || {};
          const label = t.test_type === "pst_diagnostic"
            ? "PST diagnostic scheduled — run a benchmark PST and log it so the engine can recalibrate your targets."
            : t.test_type === "volume_tolerance"
              ? `Volume-tolerance test: ramping ${String(b.muscle || "").replace(/_/g, " ")} (week ${b.week ?? 1}) to probe your MRV.`
              : `${String(t.test_type).replace(/_/g, " ")} test active.`;
          return (
            <div key={t.id} className="flex items-start gap-1.5 rounded-lg bg-gold/10 border border-gold/20 px-2.5 py-1.5">
              <FlaskConical className="w-3 h-3 text-gold shrink-0 mt-0.5" />
              <span className="text-[11px] font-semibold text-gold/90 leading-snug">{label}</span>
            </div>
          );
        })}
        {Object.keys(setTargets).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(setTargets).map(([muscle, sets]) => (
              <span key={muscle} className="glass-inset px-2 py-1 text-[10px] font-bold text-secondary capitalize">
                {muscle.replace(/_/g, " ")} <span className="font-technical font-extrabold text-ink">{sets}</span>
              </span>
            ))}
          </div>
        )}
        {plan?.run_plan && Array.isArray(plan.run_plan) && plan.run_plan.length > 0 && (
          <p className="text-[10px] font-semibold text-muted-2">
            Runs: {plan.run_plan.map(r => `${r.count} ${r.type}`).join(" · ")}
          </p>
        )}
        {plan?.rationale && (
          <p className="text-xs font-semibold text-muted-2 leading-relaxed">{plan.rationale}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function StallBadge({ risk }) {
  if (risk == null) return null;
  if (risk >= 0.75) return <Badge className="bg-bad/15 text-bad border-none text-[10px]">Stalled</Badge>;
  if (risk >= 0.4)  return <Badge className="bg-warn/15 text-warn border-none text-[10px]">Watch</Badge>;
  return <Badge className="bg-teal/15 text-teal border-none text-[10px]">Progressing</Badge>;
}

function ReadinessBadge({ readiness }) {
  const map = {
    high:     { label: "High — Push",      color: "bg-teal/15 text-teal" },
    moderate: { label: "Moderate — Train", color: "bg-leaf/15 text-leaf" },
    low:      { label: "Low — Easy",       color: "bg-warn/15 text-warn" },
    rest:     { label: "Rest Day",         color: "bg-bad/15 text-bad" },
    unknown:  { label: "Unknown",          color: "bg-white/[0.06] text-muted-2" },
  };
  const cfg = map[readiness] || map.unknown;
  return <Badge className={`${cfg.color} border-none text-xs font-bold`}>{cfg.label}</Badge>;
}

function FatigueColor({ score }) {
  const color = score >= 0.75 ? "text-bad" : score >= 0.5 ? "text-warn" : "text-teal";
  return <span className={`font-technical font-extrabold ${color}`}>{(score * 100).toFixed(0)}%</span>;
}

function SectionHeader({ icon: Icon, title, color = "text-teal" }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <h2 className="section-label !text-ink">{title}</h2>
    </div>
  );
}

// ── Strength section ──────────────────────────────────────────────────────────

function StrengthSection({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs font-semibold text-muted-2">No strength data yet. Log workouts with key lifts to see estimates.</p>;
  }

  const LIFT_ORDER = ["Bench (paused comp)", "Squat (comp)", "Deadlift (conventional comp)"];
  const LIFT_LABEL = {
    "Bench (paused comp)": "bench",
    "Squat (comp)": "squat",
    "Deadlift (conventional comp)": "deadlift",
  };
  const sorted = LIFT_ORDER.filter(k => data[k]).concat(Object.keys(data).filter(k => !LIFT_ORDER.includes(k)));

  return (
    <div>
      {sorted.map(lift => {
        const d = data[lift];
        const pct = d.target ? Math.min((d.current_e1rm / d.target) * 100, 100) : null;
        return (
          <div key={lift} className="py-2 border-t hairline first:border-t-0 first:pt-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[12.5px] font-extrabold text-ink capitalize whitespace-nowrap">{LIFT_LABEL[lift] ?? lift}</span>
                <StallBadge risk={d.stall_risk} />
              </div>
              <span className="font-technical text-[10.5px] font-bold text-muted-2 whitespace-nowrap">
                {d.current_e1rm}{d.target ? ` / ${d.target}` : ""} lb
                {d.eta_days != null && d.eta_days > 0 && ` · ETA ${d.eta_days}d`}
                {d.eta_days === 0 && " · target reached"}
              </span>
            </div>
            {pct != null && (
              <div className="h-[5px] bg-white/[0.08] rounded-full overflow-hidden mt-1.5">
                <div className="h-full bg-teal rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="flex items-center gap-3 font-technical text-[10px] font-semibold text-muted-2 mt-1">
              {d.progression_rate_lbs_per_week !== 0 && (
                <span className={d.progression_rate_lbs_per_week > 0 ? "text-teal" : "text-bad"}>
                  {d.progression_rate_lbs_per_week > 0 ? "+" : ""}{d.progression_rate_lbs_per_week} lbs/wk
                </span>
              )}
              {d.eta_days === 0 && <span className="text-teal">Target reached!</span>}
              <span>{d.sessions} sessions</span>
              {d.progression_command && d.progression_command !== "HOLD" && (
                <span className={
                  d.progression_command === "INCREASE_LOAD" ? "text-teal" :
                  d.progression_command === "DELOAD" ? "text-warn" :
                  d.progression_command === "SWAP_EXERCISE" ? "text-bad" : "text-muted-2"
                }>
                  {{
                    INCREASE_LOAD: "Add load",
                    DELOAD: "Deload",
                    SWAP_EXERCISE: "Swap exercise",
                  }[d.progression_command] ?? d.progression_command}
                </span>
              )}
            </div>
            {d.swap_suggestion && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-warn/10 border border-warn/20 px-2.5 py-1.5">
                <AlertTriangle className="w-3 h-3 text-warn shrink-0 mt-0.5" />
                <span className="text-[10px] font-semibold text-warn/90 leading-snug">
                  <span className="font-extrabold uppercase tracking-wider">Stalled</span> — {d.swap_suggestion}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Hypertrophy section ───────────────────────────────────────────────────────

// Maps the display muscle names (athlete_state.hypertrophy) onto the engine's
// learned-landmark taxonomy (guardrail_state.mrv_state.landmarks) where they
// differ. The other 8 muscles share the same name in both.
const LEARNED_LANDMARK_KEY = { abs: "core", back: "upper_back" };

// Maps the display muscle names onto react-body-highlighter slugs so the
// anatomy figure can render the same fatigue data.
const HEAT_FIGURE_KEY = {
  chest: ["chest"], back: ["upper-back"], lats: ["upper-back"],
  shoulders: ["front-deltoids"], side_delts: ["front-deltoids"], rear_delts: ["back-deltoids"],
  biceps: ["biceps"], triceps: ["triceps"], forearms: ["forearm"],
  abs: ["abs"], core: ["abs"], obliques: ["obliques"],
  quads: ["quadriceps"], hamstrings: ["hamstring"], glutes: ["gluteal"],
  calves: ["calves"], traps: ["trapezius"], neck: ["neck"],
};

function HypertrophySection({ data, landmarks }) {
  const [showAll, setShowAll] = useState(false);
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs font-semibold text-muted-2">No volume data this week.</p>;
  }

  // Prefer the engine's *learned* MEV/MAV/MRV for a muscle over the static
  // template baked into athlete_state.hypertrophy. Returns null when the engine
  // hasn't learned a landmark for that muscle yet (→ fall back to the template).
  const learnedFor = (muscle) => {
    const lm = landmarks?.[LEARNED_LANDMARK_KEY[muscle] || muscle];
    if (!lm) return null;
    const mav = lm.MAV ?? lm.mav, mrv = lm.MRV ?? lm.mrv;
    if (mav == null || mrv == null) return null;
    return { mav: Math.round(mav), mrv: Math.round(mrv) };
  };

  const sorted = Object.entries(data).sort((a, b) => b[1].fatigue_score - a[1].fatigue_score);
  const anyLearned = sorted.some(([m]) => learnedFor(m));
  // Cap the bar wall to the most-fatigued 8 by default so the section never
  // becomes an endless mid-page scroll; the rest is one tap away.
  const MUSCLE_CAP = 8;
  const visible = showAll ? sorted : sorted.slice(0, MUSCLE_CAP);
  const hiddenCount = sorted.length - visible.length;

  // Same fatigue data on the anatomy figure (teal opacity scale).
  const figureData = sorted
    .filter(([muscle, d]) => HEAT_FIGURE_KEY[muscle] && d.fatigue_score > 0)
    .map(([muscle, d]) => ({
      name: muscle,
      muscles: HEAT_FIGURE_KEY[muscle],
      frequency: Math.max(1, Math.round(d.fatigue_score * 3)),
    }));

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 min-w-0 space-y-2.5">
        {visible.map(([muscle, d]) => {
          const learned = learnedFor(muscle);
          const mav = learned?.mav ?? d.mav;
          const mrv = learned?.mrv ?? d.mrv;
          const pct = Math.min((d.weekly_sets / mav) * 100, 120);
          const overMrv = d.weekly_sets >= mrv;
          return (
            <div key={muscle}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-secondary capitalize">{muscle.replace("_", " ")}</span>
                  {learned && (
                    <span className="text-[10px] uppercase tracking-[0.08em] text-teal/70 font-extrabold" title="Volume landmark learned by the engine from your response (MRV adapts when a muscle stalls while sore)">
                      learned
                    </span>
                  )}
                  {overMrv && <AlertTriangle className="w-3 h-3 text-bad" />}
                </div>
                <div className="flex items-center gap-2 font-technical text-[11px]">
                  <span className="font-semibold text-muted-2">{d.weekly_sets} / {mav} sets</span>
                  <FatigueColor score={d.fatigue_score} />
                </div>
              </div>
              <div className="h-[5px] bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${overMrv ? "bg-bad" : d.fatigue_score >= 0.75 ? "bg-warn" : "bg-teal"}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {(hiddenCount > 0 || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2 hover:text-ink transition-colors py-1.5"
          >
            {showAll ? "Show less" : `Show all ${sorted.length} muscles`}
          </button>
        )}
        <InfoNote label="Reading these bars">
          Fatigue: teal &lt;50%, amber 50-75%, coral &gt;75%. Bars fill to MAV target.
          {anyLearned && <span className="text-teal/60"> · &ldquo;learned&rdquo; = engine-adapted landmark, not a template.</span>}
        </InfoNote>
      </div>
      {figureData.length > 0 && (
        <div className="shrink-0 hidden lg:flex justify-center sm:pt-1">
          <MuscleHeatMap data={figureData} className="h-[200px]" />
        </div>
      )}
    </div>
  );
}

// ── Recovery section ──────────────────────────────────────────────────────────

const RECOVERY_HUES = {
  HRV: "var(--hue-teal-2)",
  "Sleep Score": "var(--hue-violet)",
  "Body Battery": "var(--hue-green)",
  Energy: "var(--hue-gold)",
};

function RecoverySection({ data }) {
  if (!data || !data.data_available) {
    return <p className="text-xs font-semibold text-muted-2">No recovery data today. Sync Garmin to populate.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="hero-metric text-ink text-3xl">{data.score}</div>
          <div className="text-[10px] font-bold text-muted-2 uppercase tracking-[0.08em]">/ 100</div>
        </div>
        <ReadinessBadge readiness={data.push_readiness} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "HRV", value: data.hrv ? `${data.hrv}ms` : "—" },
          { label: "Sleep Score", value: data.sleep_score ? `${data.sleep_score}` : "—" },
          { label: "Body Battery", value: data.body_battery ? `${data.body_battery}` : "—" },
          { label: "Energy", value: data.energy ? `${data.energy}/10` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="glass-inset px-3 py-2">
            <div className="flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.08em] uppercase text-muted-2">
              <i className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: RECOVERY_HUES[label] }} />
              {label}
            </div>
            <div className="font-technical text-sm font-extrabold text-ink mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fatigue section ───────────────────────────────────────────────────────────

function FatigueSection({ data }) {
  if (!data) return null;

  let tsbColor = data.tsb > 5 ? "text-teal" : data.tsb > -5 ? "text-muted-2" : "text-bad";
  let tsbIcon  = data.tsb > 5 ? TrendingUp : data.tsb > -5 ? CheckCircle2 : TrendingDown;
  if (data.tsb == null) { tsbColor = "text-ink-muted"; tsbIcon = null; }
  const TSBIcon  = tsbIcon;

  return (
    <div className="space-y-4">
      {/* TSB visual */}
      <div className="flex items-center gap-4">
        {TSBIcon && <TSBIcon className={`w-6 h-6 ${tsbColor}`} />}
        <div>
          <div className={`font-technical text-2xl font-extrabold ${tsbColor}`}>{data.tsb > 0 ? "+" : ""}{data.tsb?.toFixed(1)}</div>
          <div className="text-[10px] font-bold text-muted-2 uppercase tracking-[0.08em]">Training Stress Balance</div>
        </div>
        <Badge className="ml-auto bg-white/[0.06] text-muted-2 border-none capitalize text-xs">
          {(data.interpretation || "").replace("_", " ")}
        </Badge>
      </div>

      {/* ATL / CTL / ACWR */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "ATL", value: data.atl?.toFixed(1), desc: "7d acute load", hue: "var(--hue-violet)", warn: data.atl > 80 },
          { label: "CTL", value: data.ctl?.toFixed(1), desc: "42d chronic load", hue: "var(--hue-teal)" },
          { label: "CNS", value: `${((data.cns_fatigue || 0) * 100).toFixed(0)}%`, desc: "CNS fatigue", hue: "var(--hue-violet)", warn: data.cns_fatigue > 0.7 },
          { label: "ACWR", value: data.acwr?.toFixed(2) ?? "—", desc: "acute:chronic", hue: "var(--hue-teal)", warn: data.acwr > 1.5 },
        ].map(({ label, value, desc, hue, warn }) => (
          <div key={label} className="glass-inset px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em]">
              <i className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: hue }} />
              {label}
            </div>
            <div className={`font-technical text-sm font-extrabold mt-0.5 ${warn ? "text-warn" : "text-ink"}`}>{value}</div>
            <div className="text-[10px] font-semibold text-muted-2 mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <InfoNote label="What is TSB?">
        TSB = CTL − ATL. Positive = fresh (deload/peak). Negative = fatigued (accumulated load). Target −5 to +10 for peak performance.
      </InfoNote>
    </div>
  );
}

// ── Endurance section ─────────────────────────────────────────────────────────

function EnduranceSection({ data }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="font-technical text-3xl font-extrabold text-gold">{data.days_to_aug31}</div>
        <div>
          <div className="text-sm font-bold text-ink">Days to Aug 31</div>
          <div className="text-xs font-semibold text-muted-2">BUD/S PST deadline</div>
        </div>
      </div>
      {data.aerobic_fitness_proxy != null && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-secondary">Aerobic Fitness</span>
            <span className="font-technical text-carb font-extrabold">{(data.aerobic_fitness_proxy * 100).toFixed(0)}%</span>
          </div>
          <div className="h-[5px] bg-white/[0.08] rounded-full overflow-hidden">
            <div className="h-full bg-carb rounded-full transition-all" style={{ width: `${data.aerobic_fitness_proxy * 100}%` }} />
          </div>
          <p className="text-[10px] font-semibold text-muted-2 mt-1">
            Based on Garmin VO2max ({data.vo2max}). 0% = VO2max 30, 100% = VO2max 60.
          </p>
        </div>
      )}
      {data.running_fatigue_atl != null && (
        <div className="glass-inset px-3 py-2">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em]">Running Fatigue (ATL)</div>
          <div className="font-technical text-sm font-extrabold text-ink mt-0.5">{data.running_fatigue_atl}</div>
        </div>
      )}
    </div>
  );
}

// ── Nutrition section ─────────────────────────────────────────────────────────

function NutritionSection({ data, targets }) {
  if (!data) return <p className="text-xs font-semibold text-muted-2">No nutrition data computed yet.</p>;

  const {
    phase,
    avg_calories_7d,
    avg_daily_calories_7d,
    avg_protein_7d,
    calorie_adherence,
    weight_trend_lbs_per_week,
    on_track,
  } = data;

  // Targets come from useDailyTargets — the single source of truth — so this
  // card can never disagree with the Fuel/Today rings for the same day.
  const calorie_target = targets?.calories ?? data.calorie_target ?? null;
  const protein_target = targets?.protein ?? data.protein_target ?? null;

  // compute_athlete_state.py uses avg_daily_calories_7d; edge fn uses avg_calories_7d
  const avgCal = avg_calories_7d ?? avg_daily_calories_7d ?? 0;

  const adherencePct  = calorie_adherence != null ? Math.round(calorie_adherence * 100) : null;
  const proteinPct    = protein_target > 0 ? Math.min((avg_protein_7d / protein_target) * 100, 120) : null;
  const calPct        = calorie_target  > 0 ? Math.min((avgCal / calorie_target)  * 100, 120) : null;

  const phaseColor = phase === "cut" ? "text-muted-2" : phase === "bulk" ? "text-gold" : "text-muted-2";

  const weightTrendColor =
    weight_trend_lbs_per_week == null ? "text-muted-2"
    : phase === "cut"
      ? (weight_trend_lbs_per_week < -0.5 ? "text-teal" : weight_trend_lbs_per_week < 0 ? "text-warn" : "text-bad")
      : phase === "bulk"
        ? (weight_trend_lbs_per_week > 0.2 ? "text-teal" : "text-warn")
        : "text-muted-2";

  return (
    <div className="space-y-4">
      {/* Phase + on-track badge */}
      <div className="flex items-center gap-3">
        <span className={`text-sm font-extrabold uppercase tracking-wide ${phaseColor}`}>
          {phase ?? "—"}
        </span>
        {on_track != null && (
          <Badge className={`border-none text-[10px] ${on_track ? "bg-teal/15 text-teal" : "bg-bad/15 text-bad"}`}>
            {on_track ? "On Track" : "Off Track"}
          </Badge>
        )}
      </div>

      {/* Calorie adherence */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-bold text-secondary">Calories (7d avg)</span>
          <span className="font-technical text-ink font-bold">
            {avgCal ? Math.round(avgCal).toLocaleString() : "—"}
            {calorie_target ? <span className="text-muted-2 font-semibold"> / {calorie_target.toLocaleString()}</span> : null}
            {adherencePct != null ? <span className={`ml-1.5 ${adherencePct >= 90 && adherencePct <= 110 ? "text-teal" : "text-warn"}`}>({adherencePct}%)</span> : null}
          </span>
        </div>
        {calPct != null && (
          <div className="h-[5px] bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${calPct > 110 ? "bg-bad" : calPct >= 90 ? "bg-gold" : "bg-warn"}`}
              style={{ width: `${Math.min(calPct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Protein */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-bold text-secondary">Protein (7d avg)</span>
          <span className="font-technical text-ink font-bold">
            {avg_protein_7d != null ? `${Math.round(avg_protein_7d)}g` : "—"}
            {protein_target ? <span className="text-muted-2 font-semibold"> / {protein_target}g</span> : null}
          </span>
        </div>
        {proteinPct != null && (
          <div className="h-[5px] bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${proteinPct >= 100 ? "bg-coral" : proteinPct >= 80 ? "bg-warn" : "bg-bad"}`}
              style={{ width: `${Math.min(proteinPct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Weight trend */}
      <div className="flex items-center justify-between glass-inset px-3 py-2">
        <span className="flex items-center gap-1.5 text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em]">
          <i className="w-[5px] h-[5px] rounded-full shrink-0 bg-violet" />
          Weight Trend
        </span>
        <span className={`font-technical text-sm font-extrabold ${weightTrendColor}`}>
          {weight_trend_lbs_per_week != null
            ? `${weight_trend_lbs_per_week > 0 ? "+" : ""}${weight_trend_lbs_per_week} lbs/wk`
            : "Not enough data"}
        </span>
      </div>
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────
// The focal content: a compact, glanceable row of the screen's headline numbers
// so the answer is grokkable in <2s before any drill-down.
function SummaryStrip({ state, vdot }) {
  const recovery = state?.recovery;
  const fatigue = state?.fatigue;
  const endurance = state?.endurance;

  const tiles = [
    recovery?.data_available && {
      label: "Recovery", value: recovery.score, unit: "/100",
      accent: "var(--hue-teal)",
      sub: recovery.hrv ? `HRV ${recovery.hrv}ms` : undefined,
    },
    fatigue?.tsb != null && {
      label: "TSB",
      value: `${fatigue.tsb > 0 ? "+" : ""}${fatigue.tsb.toFixed(1)}`,
      accent: "var(--hue-violet)",
      sub: (fatigue.interpretation || "").replace("_", " ") || undefined,
    },
    vdot != null && {
      label: "VDOT", value: Number(vdot).toFixed(1),
      accent: "var(--hue-carb)",
    },
    endurance?.days_to_aug31 != null && {
      label: "Days to PST", value: endurance.days_to_aug31,
      accent: "var(--hue-gold)", sub: "Aug 31 deadline",
    },
  ].filter(Boolean);

  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 rise-in">
      {tiles.map((t) => (
        <MetricTile key={t.label} label={t.label} value={t.value} unit={t.unit} accent={t.accent} sub={t.sub} />
      ))}
    </div>
  );
}

function SummaryStripSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="glass-inset px-3 py-2.5">
          <div className="animate-pulse rounded bg-charcoal-elevated h-2.5 w-2/3" />
          <div className="animate-pulse rounded bg-charcoal-elevated h-5 w-1/2 mt-2" />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AthleteState({ hideHeader = false }) {
  const { user } = useAuth();
  const today = getTodayString();
  const [engineOpen, setEngineOpen] = useState(false);

  // The engine's learned volume landmarks live in engine_params, not athlete_state,
  // so pull them here to overlay onto the (otherwise template) volume bars.
  const { engineParams } = useEngineParams();
  const dailyTargets = useDailyTargets(today);

  const { data: state, isLoading, isError, refetch } = useQuery({
    queryKey: ["athlete-state", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_state")
        .select("*")
        .eq("created_by", user.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className={`px-3 py-4 md:px-6 md:py-8 min-h-screen ${hideHeader ? 'pt-0 px-0 md:px-0 min-h-0' : ''}`}>
      <div className="max-w-4xl mx-auto">
        {!hideHeader && (
          <div className="mb-6 rise-in">
            <h1 className="type-display text-[22px]">Athlete State</h1>
            <p className="font-technical text-[13px] font-semibold text-muted-2 mt-0.5">
              Computed daily · {today}
              {state?.computed_at && (
                <span className="ml-2 text-faint">
                  Last updated {new Date(state.computed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>
        )}

        {isLoading && (
          <>
            <SummaryStripSkeleton />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} className="glass glass-interactive">
                  <CardContent className="px-5 py-5 space-y-2">
                    <div className="animate-pulse rounded-lg bg-charcoal-elevated h-3.5 w-2/5" />
                    <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-3/4" />
                    <div className="animate-pulse rounded-lg bg-charcoal-elevated h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {!isLoading && isError && (
          <Card className="glass glass-interactive mb-6">
            <CardContent className="pb-8 text-center">
              <div className="pt-8">
                <AlertTriangle className="w-8 h-8 text-warn mx-auto mb-3" />
                <p className="text-sm text-ink font-bold">Couldn&apos;t load athlete state</p>
                <p className="text-xs font-semibold text-muted-2 mt-1 max-w-xs mx-auto">
                  Something went wrong fetching today&apos;s analysis.
                </p>
                <Button variant="outline" className="mt-4 h-11" onClick={() => refetch()}>Retry</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && !state && (
          <Card className="glass glass-interactive mb-6">
            <CardContent className="pb-8 text-center">
              <div className="pt-8">
                <BarChart3 className="w-8 h-8 text-faint mx-auto mb-3" />
                <p className="text-sm text-ink font-bold">Today's analysis is being computed</p>
                <p className="text-xs font-semibold text-muted-2 mt-1 max-w-xs mx-auto">
                  Your athlete state refreshes automatically each morning. Check back shortly,
                  or log a workout, weigh-in, or recovery metrics to give the engine more to work with.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && state && (
          <SummaryStrip state={state} vdot={engineParams?.vdot_state?.vdot} />
        )}

        {/* Engine internals — disclosed on mobile (height budget), inline on desktop */}
        <button
          type="button"
          onClick={() => setEngineOpen((v) => !v)}
          aria-expanded={engineOpen}
          className="lg:hidden w-full glass glass-interactive px-4 py-3 mb-4 flex items-center gap-2.5 rise-in"
        >
          <Cpu className="w-3.5 h-3.5 text-teal shrink-0" />
          <span className="section-label !text-ink flex-1 text-left">Engine, Plan &amp; Pace Zones</span>
          <ChevronDown className={`w-4 h-4 text-muted-2 transition-transform ${engineOpen ? "rotate-180" : ""}`} />
        </button>
        <div className={`${engineOpen ? "block" : "hidden"} lg:block`}>
          <AdaptiveEnginePanel />
          <WeeklyPlanPanel />
          <VdotZonesCard className="mb-4" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rise-in-2">
          {/* Strength */}
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Dumbbell} title="Strength Goals" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <StrengthSection data={state?.strength} />
            </CardContent>
          </Card>

          {/* Recovery — only when synced data exists */}
          {state?.recovery?.data_available && (
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Heart} title="Recovery" color="text-teal" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <RecoverySection data={state?.recovery} />
            </CardContent>
          </Card>
          )}

          {/* Fatigue */}
          {state?.fatigue && (
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Activity} title="Fatigue / Load" color="text-violet" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <FatigueSection data={state?.fatigue} />
            </CardContent>
          </Card>
          )}

          {/* Muscle Volume */}
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={BarChart3} title="Muscle Volume" color="text-teal" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <HypertrophySection
                data={state?.hypertrophy}
                landmarks={engineParams?.guardrail_state?.mrv_state?.landmarks}
              />
            </CardContent>
          </Card>
        </div>

        {/* Endurance / BUD/S + PST */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 rise-in-3">
          {state?.endurance && (
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Waves} title="Endurance / BUD/S Readiness" color="text-carb" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <EnduranceSection data={state?.endurance} />
            </CardContent>
          </Card>
          )}

          <PSTTracker />
        </div>

        {/* Nutrition */}
        {state?.nutrition && (
        <div className="mt-4 rise-in-3">
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Utensils} title="Nutrition" color="text-gold" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <NutritionSection data={state?.nutrition} targets={dailyTargets} />
            </CardContent>
          </Card>
        </div>
        )}

        {/* Drill-downs — physique photos + recovery trends */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 rise-in-3 pb-2">
          <Link to="/physique" className="glass glass-interactive px-4 py-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-violet/[0.13] text-violet">
              <Camera className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-extrabold text-ink">Physique photos</span>
              <span className="block text-[11px] font-semibold text-ink-muted truncate">upload · AI body-comp estimate · trend</span>
            </span>
            <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
          </Link>
          <Link to="/recovery" className="glass glass-interactive px-4 py-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-teal/[0.13] text-teal">
              <Heart className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-extrabold text-ink">Recovery detail</span>
              <span className="block text-[11px] font-semibold text-ink-muted truncate">HRV · RHR · sleep · ACWR trends</span>
            </span>
            <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  );
}
