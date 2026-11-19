import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEngineParams, useTodayPrescription } from "@/hooks/useEngineQueries";
import { Cpu } from "lucide-react";

// ── Adaptive engine internals (engine_params + training_prescription) ─────────
// Surfaces the engine's deepest learned state — VDOT, RLS personalization
// progress, Banister model confidence, concurrent-training interference — which
// the app computes daily but never previously displayed.
export default function AdaptiveEnginePanel({ date }) {
  const { engineParams, isLoading: engineLoading } = useEngineParams(date);
  const { prescription, isLoading: prescriptionLoading } = useTodayPrescription(date);
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
          <div className="pulse-loop rounded-lg bg-track h-4 w-3/4" />
          <div className="pulse-loop rounded-lg bg-track h-4 w-1/2" />
          <div className="pulse-loop rounded-lg bg-track h-4 w-2/3" />
          <div className="pulse-loop rounded-lg bg-track h-4 w-5/12" />
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
            <div className="section-label flex items-center justify-center gap-1.5 mb-1">
              <i className="w-[5px] h-[5px] rounded-full bg-teal" /> VDOT
            </div>
            <div className="font-technical text-xl font-extrabold text-ink">{vdot != null ? Number(vdot).toFixed(1) : "--"}</div>
            {vdotTrend != null && Math.abs(vdotTrend) >= 0.05 && (
              <div className={`font-technical text-caption font-bold ${vdotTrend >= 0 ? "text-teal" : "text-muted-2"}`}>
                {vdotTrend >= 0 ? "▲" : "▼"} {Math.abs(vdotTrend).toFixed(1)}
              </div>
            )}
          </div>
          <div className="glass-inset px-3 py-2.5 text-center">
            <div className="section-label mb-1">Personalization</div>
            <div className="text-sm font-bold text-ink mt-1.5">{personalization}</div>
          </div>
          <div className="glass-inset px-3 py-2.5 text-center">
            <div className="section-label mb-1">Model Confidence</div>
            <div className="font-technical text-xl font-extrabold text-ink">{confidence != null ? `${Math.round(confidence * 100)}%` : "--"}</div>
          </div>
          <div className="glass-inset px-3 py-2.5 text-center">
            <div className="section-label mb-1">Interference</div>
            <div className="text-sm font-bold text-ink mt-1.5">{prescription?.interference?.interference_level || "--"}</div>
          </div>
        </div>

        {/* What the engine has learned about you (RLS constants + volume probe) */}
        {(tauFat != null || probe) && (
          <div className="mt-4 pt-3 border-t hairline space-y-1.5">
            <div className="section-label">Learnings</div>
            {tauFat != null && (
              <p className="text-xs font-semibold text-secondary">
                Fatigue clears in <span className="font-technical font-extrabold text-ink">{tauFat.toFixed(0)}d</span>
                <span className="text-faint"> (pop. avg 15d)</span>
                {tauFit != null && <>, fitness decays over <span className="font-technical font-extrabold text-ink">{tauFit.toFixed(0)}d</span><span className="text-faint"> (pop. 45d)</span></>}
                {updates < 4 && <span className="text-faint">, still calibrating</span>}
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
