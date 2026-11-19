

import { pstCountdown } from "./athleteUtils";

export default function EnduranceSection({ data, asOfDate, today }) {
  if (!data) return null;
  const pst = pstCountdown(data, asOfDate, today);

  return (
    <div className="space-y-4">
      {pst && (
        <div className="flex items-center gap-3">
          <div className={`hero-metric text-3xl ${pst.passed ? "text-muted-2" : "text-gold"}`}>{pst.passed ? "Passed" : pst.days}</div>
          <div>
            <div className="text-sm font-bold text-ink">{pst.passed ? `${pst.label} deadline passed` : `Days to ${pst.label}`}</div>
            <div className="text-xs font-semibold text-muted-2">BUD/S PST target</div>
          </div>
        </div>
      )}
      {data.aerobic_fitness_proxy != null && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-secondary">Aerobic fitness</span>
            <span className="font-technical text-teal font-extrabold">{(data.aerobic_fitness_proxy * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-track rounded-full overflow-hidden">
            <div className="h-full bg-teal rounded-full transition-[width] duration-200 ease-[var(--ease)]" style={{ width: `${data.aerobic_fitness_proxy * 100}%` }} />
          </div>
          <p className="text-caption font-semibold text-muted-2 mt-1">
            Based on Garmin VO2max ({data.vo2max}). 0% = VO2max 30, 100% = VO2max 60.
          </p>
        </div>
      )}
      {data.running_fatigue_atl != null && (
        <div className="bg-charcoal-surface2 rounded-control px-3 py-2">
          <div className="text-micro text-ink-muted">Running Fatigue (ATL)</div>
          <div className="font-technical text-sm font-extrabold text-ink mt-0.5">{data.running_fatigue_atl}</div>
        </div>
      )}
    </div>
  );
}

// ── Nutrition section ─────────────────────────────────────────────────────────
