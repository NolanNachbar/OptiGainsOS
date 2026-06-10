import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTodayString } from "@/utils/dateUtils";
import { useEngineParams, useTodayPrescription } from "@/hooks/useEngineQueries";
import PSTTracker from "@/components/PSTTracker";
import VdotZonesCard from "@/components/workouts/VdotZonesCard";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import { Link } from "react-router-dom";
import {
  Dumbbell, Activity, BarChart3, Heart, Waves,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Utensils, Cpu,
  Camera, ChevronRight,
} from "lucide-react";

// ── Adaptive engine internals (engine_params + training_prescription) ─────────
// Surfaces the engine's deepest learned state — VDOT, RLS personalization
// progress, Banister model confidence, concurrent-training interference — which
// the app computes daily but never previously displayed.
function AdaptiveEnginePanel() {
  const { engineParams } = useEngineParams();
  const { prescription } = useTodayPrescription();
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

  const LIFT_ORDER = ["squat", "bench", "deadlift", "rdl", "ohp"];
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
                <span className="text-[12.5px] font-extrabold text-ink capitalize whitespace-nowrap">{lift}</span>
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
        {sorted.map(([muscle, d]) => {
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
                    <span className="text-[8px] uppercase tracking-[0.08em] text-teal/70 font-extrabold" title="Volume landmark learned by the engine from your response (MRV adapts when a muscle stalls while sore)">
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
        <p className="text-[10px] font-semibold text-muted-2 pt-1">
          Fatigue: teal &lt;50%, amber 50-75%, coral &gt;75%. Bars fill to MAV target.
          {anyLearned && <span className="text-teal/60"> · &ldquo;learned&rdquo; = engine-adapted landmark, not a template.</span>}
        </p>
      </div>
      {figureData.length > 0 && (
        <div className="shrink-0 flex justify-center sm:pt-1">
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

  const tsbColor = data.tsb > 5 ? "text-teal" : data.tsb > -5 ? "text-muted-2" : "text-bad";
  const tsbIcon  = data.tsb > 5 ? TrendingUp : data.tsb > -5 ? CheckCircle2 : TrendingDown;
  const TSBIcon  = tsbIcon;

  return (
    <div className="space-y-4">
      {/* TSB visual */}
      <div className="flex items-center gap-4">
        <TSBIcon className={`w-6 h-6 ${tsbColor}`} />
        <div>
          <div className={`font-technical text-2xl font-extrabold ${tsbColor}`}>{data.tsb > 0 ? "+" : ""}{data.tsb?.toFixed(1)}</div>
          <div className="text-[10px] font-bold text-muted-2 uppercase tracking-[0.08em]">Training Stress Balance</div>
        </div>
        <Badge className="ml-auto bg-white/[0.06] text-muted-2 border-none capitalize text-xs">
          {(data.interpretation || "").replace("_", " ")}
        </Badge>
      </div>

      {/* ATL / CTL */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "ATL", value: data.atl?.toFixed(1), desc: "7d acute load", hue: "var(--hue-violet)", warn: data.atl > 80 },
          { label: "CTL", value: data.ctl?.toFixed(1), desc: "42d chronic load", hue: "var(--hue-teal)" },
          { label: "CNS", value: `${((data.cns_fatigue || 0) * 100).toFixed(0)}%`, desc: "CNS fatigue", hue: "var(--hue-violet)", warn: data.cns_fatigue > 0.7 },
        ].map(({ label, value, desc, hue, warn }) => (
          <div key={label} className="glass-inset px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em]">
              <i className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: hue }} />
              {label}
            </div>
            <div className={`font-technical text-sm font-extrabold mt-0.5 ${warn ? "text-warn" : "text-ink"}`}>{value}</div>
            <div className="text-[9px] font-semibold text-faint mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <p className="text-[10px] font-semibold text-muted-2">
        TSB = CTL − ATL. Positive = fresh (deload/peak). Negative = fatigued (accumulated load). Target −5 to +10 for peak performance.
      </p>
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

function NutritionSection({ data }) {
  if (!data) return <p className="text-xs font-semibold text-muted-2">No nutrition data computed yet.</p>;

  const {
    phase,
    avg_calories_7d,
    avg_daily_calories_7d,
    calorie_target,
    avg_protein_7d,
    protein_target,
    calorie_adherence,
    weight_trend_lbs_per_week,
    on_track,
  } = data;

  // compute_athlete_state.py uses avg_daily_calories_7d; edge fn uses avg_calories_7d
  const avgCal = avg_calories_7d ?? avg_daily_calories_7d ?? 0;

  const adherencePct  = calorie_adherence != null ? Math.round(calorie_adherence * 100) : null;
  const proteinPct    = protein_target > 0 ? Math.min((avg_protein_7d / protein_target) * 100, 120) : null;
  const calPct        = calorie_target  > 0 ? Math.min((avgCal / calorie_target)  * 100, 120) : null;

  const phaseColor = phase === "cut" ? "text-carb" : phase === "bulk" ? "text-gold" : "text-muted-2";

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AthleteState({ hideHeader = false }) {
  const { user } = useAuth();
  const today = getTodayString();

  // The engine's learned volume landmarks live in engine_params, not athlete_state,
  // so pull them here to overlay onto the (otherwise template) volume bars.
  const { engineParams } = useEngineParams();

  const { data: state, isLoading } = useQuery({
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
          <p className="text-sm font-semibold text-muted-2">Loading athlete state…</p>
        )}

        {!isLoading && !state && (
          <Card className="glass glass-interactive mb-6">
            <CardContent className="py-8 text-center">
              <BarChart3 className="w-8 h-8 text-faint mx-auto mb-3" />
              <p className="text-sm text-ink font-bold">Today's analysis is being computed</p>
              <p className="text-xs font-semibold text-muted-2 mt-1 max-w-xs mx-auto">
                Your athlete state refreshes automatically each morning. Check back shortly,
                or log a workout, weigh-in, or recovery metrics to give the engine more to work with.
              </p>
            </CardContent>
          </Card>
        )}

        <AdaptiveEnginePanel />

        <VdotZonesCard className="mb-4" />

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

          {/* Recovery */}
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Heart} title="Recovery" color="text-teal" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <RecoverySection data={state?.recovery} />
            </CardContent>
          </Card>

          {/* Fatigue */}
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Activity} title="Fatigue / Load" color="text-violet" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <FatigueSection data={state?.fatigue} />
            </CardContent>
          </Card>

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
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Waves} title="Endurance / BUD/S Readiness" color="text-carb" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <EnduranceSection data={state?.endurance} />
            </CardContent>
          </Card>

          <PSTTracker />
        </div>

        {/* Nutrition */}
        <div className="mt-4 rise-in-3">
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Utensils} title="Nutrition" color="text-gold" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <NutritionSection data={state?.nutrition} />
            </CardContent>
          </Card>
        </div>

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
