

export default function EnduranceSection({ data }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.days_to_aug31 != null && (
        <div className="flex items-center gap-3">
          <div className="hero-metric text-3xl text-gold">{data.days_to_aug31}</div>
          <div>
            <div className="text-sm font-bold text-ink">Days to Aug 31</div>
            <div className="text-xs font-semibold text-muted-2">BUD/S PST target</div>
          </div>
        </div>
      )}
      {data.aerobic_fitness_proxy != null && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-secondary">Aerobic Fitness</span>
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
