import { Card, CardContent } from "@/components/ui/card";
import { Activity, Shield, GitBranch, HeartPulse } from "lucide-react";
import { useTodayPrescription } from "@/hooks/useEngineQueries";

// Surfaces the adaptive engine's daily guardrail signals (training_prescription)
// that the app previously never read: ACWR, cellular interference, and the
// HRV/RHR overreaching detector. Renders nothing until the engine has computed
// today's row.
function acwrZone(acwr) {
  if (acwr == null) return { label: "—", color: "text-slate-500" };
  if (acwr > 1.5) return { label: "Overload", color: "text-red-400" };
  if (acwr > 1.3) return { label: "High", color: "text-orange-400" };
  if (acwr < 0.8) return { label: "Detraining", color: "text-sky-400" };
  return { label: "Optimal", color: "text-emerald-400" };
}

export default function EngineStatusCard({ today }) {
  const { prescription } = useTodayPrescription(today);
  if (!prescription) return null;

  const acwr = prescription.acwr;
  const zone = acwrZone(acwr);
  const interference = prescription.interference || {};
  const overreach = prescription.overreach || {};
  // The overreach detector needs HRV/RHR z-scores; null means the recovery
  // pipeline hasn't supplied autonomic data (e.g. Garmin sync not flowing).
  const overreachUnavailable = overreach.hrv_z_3d == null && overreach.rhr_z_3d == null;

  return (
    <Card className="glass-interactive">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-white">Engine Guardrails</span>
          {prescription.computed_at && (
            <span className="ml-auto text-[10px] text-slate-600 uppercase tracking-wider">
              {new Date(prescription.computed_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          {/* ACWR */}
          <div title="Acute:Chronic Workload Ratio — last 7 days of load vs your 28-day average. 0.8–1.3 is the sweet spot; above 1.5 spikes injury risk.">

            <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              <Shield className="w-3 h-3" /> Load (ACWR)
            </div>
            <div className="text-lg font-technical text-white leading-none">
              {acwr != null ? Number(acwr).toFixed(2) : "—"}
            </div>
            <div className={`text-[10px] font-semibold mt-0.5 ${zone.color}`}>{zone.label}</div>
          </div>

          {/* Interference */}
          <div title="Concurrent-training interference (mTORC1 vs AMPK). LOW means today's running won't blunt strength/hypertrophy adaptation; an open anabolic window favors lifting.">

            <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              <GitBranch className="w-3 h-3" /> Interference
            </div>
            <div className="text-lg font-technical text-white leading-none">
              {interference.interference_level || "—"}
            </div>
            <div className="text-[10px] font-semibold mt-0.5 text-slate-500">
              {interference.anabolic_window ? "Anabolic window" : " "}
            </div>
          </div>

          {/* Overreach */}
          <div title="Overreaching early-warning: fires when 3-day HRV drops and resting HR rises together. Needs wearable recovery data to compute.">

            <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              <HeartPulse className="w-3 h-3" /> Overreach
            </div>
            {overreachUnavailable ? (
              <>
                <div className="text-sm font-semibold text-slate-500 leading-none mt-1">No data</div>
                <div className="text-[10px] font-semibold mt-1 text-amber-500/80">Sync recovery</div>
              </>
            ) : (
              <>
                <div className={`text-lg font-technical leading-none ${overreach.overreaching ? "text-red-400" : "text-emerald-400"}`}>
                  {overreach.overreaching ? "Flag" : "Clear"}
                </div>
                <div className="text-[10px] font-semibold mt-0.5 text-slate-500">
                  {overreach.fatigue_state && overreach.fatigue_state !== "UNKNOWN" ? overreach.fatigue_state : " "}
                </div>
              </>
            )}
          </div>
        </div>

        {prescription.interference_warning && (
          <p className="text-[11px] text-amber-400/90 mt-3 leading-relaxed">
            {prescription.interference_warning}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
