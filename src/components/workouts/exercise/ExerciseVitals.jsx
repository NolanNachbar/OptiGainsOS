// Extracted from ExerciseCard.jsx (no behavior change).

export default function ExerciseVitals({ vitals, weightUnit }) {
  return (
    <>
        {(vitals?.volume || vitals?.best) && (
          <div
            className="grid gap-2.5 border-t border-charcoal-border pt-2.5 mt-3 font-technical"
            style={{ gridTemplateColumns: `repeat(${[vitals.volume, vitals.best].filter(Boolean).length}, 1fr)` }}
          >
            {vitals.volume && (
              <div className="border-l border-charcoal-border first:border-l-0 pl-2.5 first:pl-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted">Volume</div>
                <div className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">
                  {vitals.volume.current.toLocaleString()}<span className="text-[11px] text-ink-muted font-semibold ml-0.5">{weightUnit}</span>
                </div>
                <div className="text-[11px] mt-0.5">
                  {vitals.volume.deltaPct != null ? (
                    <span className={vitals.volume.deltaPct > 0 ? 'text-leaf font-bold' : 'text-ink-muted'}>
                      {vitals.volume.deltaPct > 0 ? '+' : ''}{vitals.volume.deltaPct}%
                    </span>
                  ) : (
                    <span className="text-ink-muted">–</span>
                  )}
                  <span className="text-ink-muted"> vs last</span>
                </div>
              </div>
            )}
            {vitals.best && (
              <div className="border-l border-charcoal-border first:border-l-0 pl-2.5 first:pl-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted">Best set</div>
                <div className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">
                  {vitals.best.weight}×{vitals.best.reps}
                </div>
                {vitals.best.e1rm != null && (
                  <div className="text-[11px] text-ink-muted mt-0.5">{vitals.best.e1rm} e1RM</div>
                )}
              </div>
            )}
          </div>
        )}
    </>
  );
}
