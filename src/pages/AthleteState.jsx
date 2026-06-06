import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTodayString } from "@/utils/dateUtils";
import { useEngineParams, useTodayPrescription } from "@/hooks/useEngineQueries";
import PSTTracker from "@/components/PSTTracker";
import VdotZonesCard from "@/components/workouts/VdotZonesCard";
import {
  Dumbbell, Activity, BarChart3, Heart, Waves,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Utensils, Cpu,
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

  return (
    <Card className="glass-interactive mb-4">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-brand" /> Adaptive Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">VDOT</div>
            <div className="text-xl font-technical text-white">{vdot != null ? Number(vdot).toFixed(1) : "—"}</div>
            {vdotTrend != null && Math.abs(vdotTrend) >= 0.05 && (
              <div className={`text-[10px] font-semibold ${vdotTrend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {vdotTrend >= 0 ? "▲" : "▼"} {Math.abs(vdotTrend).toFixed(1)}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Personalization</div>
            <div className="text-sm font-semibold text-white mt-1.5">{personalization}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Model Confidence</div>
            <div className="text-xl font-technical text-white">{confidence != null ? `${Math.round(confidence * 100)}%` : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Interference</div>
            <div className="text-sm font-semibold text-white mt-1.5">{prescription?.interference?.interference_level || "—"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StallBadge({ risk }) {
  if (risk == null) return null;
  if (risk >= 0.75) return <Badge className="bg-red-500/20 text-red-400 border-none text-[10px]">Stalled</Badge>;
  if (risk >= 0.4)  return <Badge className="bg-yellow-500/20 text-yellow-400 border-none text-[10px]">Watch</Badge>;
  return <Badge className="bg-brand/20 text-brand border-none text-[10px]">Progressing</Badge>;
}

function ReadinessBadge({ readiness }) {
  const map = {
    high:     { label: "High — Push",      color: "bg-brand/20 text-brand" },
    moderate: { label: "Moderate — Train", color: "bg-blue-500/20 text-blue-400" },
    low:      { label: "Low — Easy",       color: "bg-yellow-500/20 text-yellow-400" },
    rest:     { label: "Rest Day",         color: "bg-red-500/20 text-red-400" },
    unknown:  { label: "Unknown",          color: "bg-[#333] text-[#555]" },
  };
  const cfg = map[readiness] || map.unknown;
  return <Badge className={`${cfg.color} border-none text-xs font-semibold`}>{cfg.label}</Badge>;
}

function FatigueColor({ score }) {
  const color = score >= 0.75 ? "text-red-400" : score >= 0.5 ? "text-yellow-400" : "text-brand";
  return <span className={`font-bold ${color}`}>{(score * 100).toFixed(0)}%</span>;
}

function SectionHeader({ icon: Icon, title, color = "text-brand" }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`w-4 h-4 ${color}`} />
      <h2 className="text-sm font-bold uppercase tracking-widest text-white">{title}</h2>
    </div>
  );
}

// ── Strength section ──────────────────────────────────────────────────────────

function StrengthSection({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-[#555555]">No strength data yet. Log workouts with key lifts to see estimates.</p>;
  }

  const LIFT_ORDER = ["squat", "bench", "deadlift", "rdl", "ohp"];
  const sorted = LIFT_ORDER.filter(k => data[k]).concat(Object.keys(data).filter(k => !LIFT_ORDER.includes(k)));

  return (
    <div className="space-y-4">
      {sorted.map(lift => {
        const d = data[lift];
        const pct = d.target ? Math.min((d.current_e1rm / d.target) * 100, 100) : null;
        return (
          <div key={lift}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white capitalize">{lift}</span>
                <StallBadge risk={d.stall_risk} />
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-brand">{d.current_e1rm} lbs</span>
                {d.target && <span className="text-xs text-[#555555] ml-1">/ {d.target}</span>}
              </div>
            </div>
            {pct != null && (
              <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden mb-1">
                <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-[#555555]">
              {d.progression_rate_lbs_per_week !== 0 && (
                <span className={d.progression_rate_lbs_per_week > 0 ? "text-brand" : "text-red-400"}>
                  {d.progression_rate_lbs_per_week > 0 ? "+" : ""}{d.progression_rate_lbs_per_week} lbs/wk
                </span>
              )}
              {d.eta_days != null && d.eta_days > 0 && (
                <span>ETA {d.eta_days}d to target</span>
              )}
              {d.eta_days === 0 && <span className="text-brand">Target reached!</span>}
              <span>{d.sessions} sessions</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Hypertrophy section ───────────────────────────────────────────────────────

function HypertrophySection({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-[#555555]">No volume data this week.</p>;
  }

  const sorted = Object.entries(data).sort((a, b) => b[1].fatigue_score - a[1].fatigue_score);

  return (
    <div className="space-y-2.5">
      {sorted.map(([muscle, d]) => {
        const pct = Math.min((d.weekly_sets / d.mav) * 100, 120);
        const overMrv = d.weekly_sets >= d.mrv;
        return (
          <div key={muscle}>
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[#a0a0a0] capitalize">{muscle.replace("_", " ")}</span>
                {overMrv && <AlertTriangle className="w-3 h-3 text-red-400" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#555555]">{d.weekly_sets} / {d.mav} sets</span>
                <FatigueColor score={d.fatigue_score} />
              </div>
            </div>
            <div className="h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${overMrv ? "bg-red-400" : d.fatigue_score >= 0.75 ? "bg-yellow-400" : "bg-brand"}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-[#555555] pt-1">Fatigue: green &lt;50%, yellow 50-75%, red &gt;75%. Bars fill to MAV target.</p>
    </div>
  );
}

// ── Recovery section ──────────────────────────────────────────────────────────

function RecoverySection({ data }) {
  if (!data || !data.data_available) {
    return <p className="text-xs text-[#555555]">No recovery data today. Sync Garmin to populate.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{data.score}</div>
          <div className="text-[10px] text-[#555555] uppercase tracking-wider">/ 100</div>
        </div>
        <ReadinessBadge readiness={data.push_readiness} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "HRV", value: data.hrv ? `${data.hrv}ms` : "—" },
          { label: "Sleep Score", value: data.sleep_score ? `${data.sleep_score}` : "—" },
          { label: "Body Battery", value: data.body_battery ? `${data.body_battery}` : "—" },
          { label: "Energy", value: data.energy ? `${data.energy}/10` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#202020] rounded-lg px-3 py-2">
            <div className="text-[10px] text-[#555555] uppercase tracking-wider">{label}</div>
            <div className="text-sm font-bold text-white mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fatigue section ───────────────────────────────────────────────────────────

function FatigueSection({ data }) {
  if (!data) return null;

  const tsbColor = data.tsb > 5 ? "text-brand" : data.tsb > -5 ? "text-[#a0a0a0]" : "text-red-400";
  const tsbIcon  = data.tsb > 5 ? TrendingUp : data.tsb > -5 ? CheckCircle2 : TrendingDown;
  const TSBIcon  = tsbIcon;

  return (
    <div className="space-y-4">
      {/* TSB visual */}
      <div className="flex items-center gap-4">
        <TSBIcon className={`w-6 h-6 ${tsbColor}`} />
        <div>
          <div className={`text-2xl font-bold ${tsbColor}`}>{data.tsb > 0 ? "+" : ""}{data.tsb?.toFixed(1)}</div>
          <div className="text-[10px] text-[#555555] uppercase tracking-wider">Training Stress Balance</div>
        </div>
        <Badge className="ml-auto bg-[#202020] text-[#a0a0a0] border-none capitalize text-xs">
          {(data.interpretation || "").replace("_", " ")}
        </Badge>
      </div>

      {/* ATL / CTL */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "ATL", value: data.atl?.toFixed(1), desc: "7d acute load", warn: data.atl > 80 },
          { label: "CTL", value: data.ctl?.toFixed(1), desc: "42d chronic load" },
          { label: "CNS", value: `${((data.cns_fatigue || 0) * 100).toFixed(0)}%`, desc: "CNS fatigue", warn: data.cns_fatigue > 0.7 },
        ].map(({ label, value, desc, warn }) => (
          <div key={label} className="bg-[#202020] rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] text-[#555555] uppercase tracking-wider">{label}</div>
            <div className={`text-sm font-bold mt-0.5 ${warn ? "text-yellow-400" : "text-white"}`}>{value}</div>
            <div className="text-[9px] text-[#444] mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[#555555]">
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
        <div className="text-3xl font-bold text-brand">{data.days_to_aug31}</div>
        <div>
          <div className="text-sm font-semibold text-white">Days to Aug 31</div>
          <div className="text-xs text-[#555555]">BUD/S PST deadline</div>
        </div>
      </div>
      {data.aerobic_fitness_proxy != null && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#a0a0a0]">Aerobic Fitness</span>
            <span className="text-brand font-bold">{(data.aerobic_fitness_proxy * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${data.aerobic_fitness_proxy * 100}%` }} />
          </div>
          <p className="text-[10px] text-[#555555] mt-1">
            Based on Garmin VO2max ({data.vo2max}). 0% = VO2max 30, 100% = VO2max 60.
          </p>
        </div>
      )}
      {data.running_fatigue_atl != null && (
        <div className="bg-[#202020] rounded-lg px-3 py-2">
          <div className="text-[10px] text-[#555555] uppercase tracking-wider">Running Fatigue (ATL)</div>
          <div className="text-sm font-bold text-white mt-0.5">{data.running_fatigue_atl}</div>
        </div>
      )}
    </div>
  );
}

// ── Nutrition section ─────────────────────────────────────────────────────────

function NutritionSection({ data }) {
  if (!data) return <p className="text-xs text-[#555555]">No nutrition data computed yet.</p>;

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

  const phaseColor = phase === "cut" ? "text-blue-400" : phase === "bulk" ? "text-yellow-400" : "text-[#a0a0a0]";

  const weightTrendColor =
    weight_trend_lbs_per_week == null ? "text-[#555555]"
    : phase === "cut"
      ? (weight_trend_lbs_per_week < -0.5 ? "text-brand" : weight_trend_lbs_per_week < 0 ? "text-yellow-400" : "text-red-400")
      : phase === "bulk"
        ? (weight_trend_lbs_per_week > 0.2 ? "text-brand" : "text-yellow-400")
        : "text-[#a0a0a0]";

  return (
    <div className="space-y-4">
      {/* Phase + on-track badge */}
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold uppercase tracking-wide ${phaseColor}`}>
          {phase ?? "—"}
        </span>
        {on_track != null && (
          <Badge className={`border-none text-[10px] ${on_track ? "bg-brand/20 text-brand" : "bg-red-500/20 text-red-400"}`}>
            {on_track ? "On Track" : "Off Track"}
          </Badge>
        )}
      </div>

      {/* Calorie adherence */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#a0a0a0]">Calories (7d avg)</span>
          <span className="text-white font-semibold">
            {avgCal ? Math.round(avgCal).toLocaleString() : "—"}
            {calorie_target ? <span className="text-[#555555] font-normal"> / {calorie_target.toLocaleString()}</span> : null}
            {adherencePct != null ? <span className={`ml-1.5 ${adherencePct >= 90 && adherencePct <= 110 ? "text-brand" : "text-yellow-400"}`}>({adherencePct}%)</span> : null}
          </span>
        </div>
        {calPct != null && (
          <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${calPct > 110 ? "bg-red-400" : calPct >= 90 ? "bg-brand" : "bg-yellow-400"}`}
              style={{ width: `${Math.min(calPct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Protein */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#a0a0a0]">Protein (7d avg)</span>
          <span className="text-white font-semibold">
            {avg_protein_7d != null ? `${Math.round(avg_protein_7d)}g` : "—"}
            {protein_target ? <span className="text-[#555555] font-normal"> / {protein_target}g</span> : null}
          </span>
        </div>
        {proteinPct != null && (
          <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${proteinPct >= 100 ? "bg-brand" : proteinPct >= 80 ? "bg-yellow-400" : "bg-red-400"}`}
              style={{ width: `${Math.min(proteinPct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Weight trend */}
      <div className="flex items-center justify-between bg-[#202020] rounded-lg px-3 py-2">
        <span className="text-[10px] text-[#555555] uppercase tracking-wider">Weight Trend</span>
        <span className={`text-sm font-bold ${weightTrendColor}`}>
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
          <div className="mb-6">
            <h1 className="text-[22px] font-bold text-white">Athlete State</h1>
            <p className="text-[13px] text-[#a0a0a0] mt-0.5">
              Computed daily · {today}
              {state?.computed_at && (
                <span className="ml-2 text-[#444]">
                  Last updated {new Date(state.computed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>
        )}

        {isLoading && (
          <p className="text-sm text-[#555555]">Loading athlete state…</p>
        )}

        {!isLoading && !state && (
          <Card className="glass-interactive mb-6">
            <CardContent className="py-8 text-center">
              <BarChart3 className="w-8 h-8 text-[#333] mx-auto mb-3" />
              <p className="text-sm text-white font-semibold">Today's analysis is being computed</p>
              <p className="text-xs text-[#555555] mt-1 max-w-xs mx-auto">
                Your athlete state refreshes automatically each morning. Check back shortly,
                or log a workout, weigh-in, or recovery metrics to give the engine more to work with.
              </p>
            </CardContent>
          </Card>
        )}

        <AdaptiveEnginePanel />

        <VdotZonesCard className="mb-4" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Strength */}
          <Card className="glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Dumbbell} title="Strength Goals" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <StrengthSection data={state?.strength} />
            </CardContent>
          </Card>

          {/* Recovery */}
          <Card className="glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Heart} title="Recovery" color="text-red-400" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <RecoverySection data={state?.recovery} />
            </CardContent>
          </Card>

          {/* Fatigue */}
          <Card className="glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Activity} title="Fatigue / Load" color="text-yellow-400" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <FatigueSection data={state?.fatigue} />
            </CardContent>
          </Card>

          {/* Muscle Volume */}
          <Card className="glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={BarChart3} title="Muscle Volume" color="text-blue-400" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <HypertrophySection data={state?.hypertrophy} />
            </CardContent>
          </Card>
        </div>

        {/* Endurance / BUD/S + PST */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Waves} title="Endurance / BUD/S Readiness" color="text-blue-400" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <EnduranceSection data={state?.endurance} />
            </CardContent>
          </Card>

          <PSTTracker />
        </div>

        {/* Nutrition */}
        <div className="mt-4">
          <Card className="glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Utensils} title="Nutrition" color="text-orange-400" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <NutritionSection data={state?.nutrition} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
