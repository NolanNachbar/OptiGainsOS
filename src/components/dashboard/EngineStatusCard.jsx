import { Activity, Shield, GitBranch, HeartPulse } from "lucide-react";
import { useTodayPrescription } from "@/hooks/useEngineQueries";

// Surfaces the adaptive engine's daily guardrail signals (training_prescription)
// that the app previously never read: ACWR, cellular interference, and the
// HRV/RHR overreaching detector. Renders nothing until the engine has computed
// today's row.
// Relative "last computed" so a failed/stale nightly engine run is visible
// rather than silently leaving the card frozen on old data.
function computedAgo(computedAt) {
  if (!computedAt) return null;
  const days = Math.floor((Date.now() - new Date(computedAt).getTime()) / 86400000);
  if (days <= 0) return { label: "Today", stale: false };
  if (days === 1) return { label: "1d ago", stale: true };
  return { label: `${days}d ago`, stale: true };
}

function acwrZone(acwr) {
  if (acwr == null) return { label: "—", color: "text-muted-2" };
  if (acwr > 1.5) return { label: "Overload", color: "text-bad" };
  if (acwr > 1.3) return { label: "High", color: "text-warn" };
  if (acwr < 0.8) return { label: "Detraining", color: "text-info" };
  return { label: "Optimal", color: "text-ok" };
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
    <div className="glass glass-interactive px-4 pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-3.5 h-3.5 text-teal" />
          <span className="section-label !text-ink">Engine Guardrails</span>
          {(() => {
            const ago = computedAgo(prescription.computed_at);
            if (!ago) return null;
            return (
              <span className={`ml-auto font-technical text-[10px] font-bold uppercase tracking-wider ${ago.stale ? "text-warn/80" : "text-faint"}`}>
                {ago.stale ? "⚠ " : ""}Computed {ago.label}
              </span>
            );
          })()}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {/* ACWR */}
          <div className="glass-inset px-2 py-2.5" title="Acute:Chronic Workload Ratio — last 7 days of load vs your 28-day average. 0.8–1.3 is the sweet spot; above 1.5 spikes injury risk.">

            <div className="flex items-center justify-center gap-1 text-[9.5px] uppercase tracking-[0.08em] text-muted-2 font-bold mb-1">
              <Shield className="w-3 h-3" /> Load (ACWR)
            </div>
            <div className="text-lg font-technical font-extrabold text-ink leading-none">
              {acwr != null ? Number(acwr).toFixed(2) : "—"}
            </div>
            <div className={`text-[10px] font-bold mt-0.5 ${zone.color}`}>{zone.label}</div>
          </div>

          {/* Interference */}
          <div className="glass-inset px-2 py-2.5" title="Concurrent-training interference (mTORC1 vs AMPK). LOW means today's running won't blunt strength/hypertrophy adaptation; an open anabolic window favors lifting.">

            <div className="flex items-center justify-center gap-1 text-[9.5px] uppercase tracking-[0.08em] text-muted-2 font-bold mb-1">
              <GitBranch className="w-3 h-3" /> Interference
            </div>
            <div className="text-lg font-technical font-extrabold text-ink leading-none">
              {interference.interference_level || "—"}
            </div>
            <div className="text-[10px] font-semibold mt-0.5 text-muted-2">
              {interference.anabolic_window ? "Anabolic window" : " "}
            </div>
          </div>

          {/* Overreach */}
          <div className="glass-inset px-2 py-2.5" title="Overreaching early-warning: fires when 3-day HRV drops and resting HR rises together. Needs wearable recovery data to compute.">

            <div className="flex items-center justify-center gap-1 text-[9.5px] uppercase tracking-[0.08em] text-muted-2 font-bold mb-1">
              <HeartPulse className="w-3 h-3" /> Overreach
            </div>
            {overreachUnavailable ? (
              <>
                <div className="text-sm font-bold text-muted-2 leading-none mt-1">No data</div>
                <div className="text-[10px] font-semibold mt-1 text-warn/80">Sync recovery</div>
              </>
            ) : (
              <>
                <div className={`text-lg font-technical font-extrabold leading-none ${overreach.overreaching ? "text-bad" : "text-ok"}`}>
                  {overreach.overreaching ? "Flag" : "Clear"}
                </div>
                <div className="text-[10px] font-semibold mt-0.5 text-muted-2">
                  {overreach.fatigue_state && overreach.fatigue_state !== "UNKNOWN" ? overreach.fatigue_state : " "}
                </div>
              </>
            )}
          </div>
        </div>

        {prescription.interference_warning && (
          <p className="text-[11px] font-semibold text-warn/90 mt-3 leading-relaxed">
            {prescription.interference_warning}
          </p>
        )}
    </div>
  );
}
