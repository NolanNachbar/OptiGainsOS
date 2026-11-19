// Extracted from ExerciseCard.jsx (no behavior change).

export default function E1rmSparkModule({ e1rmSpark, weightUnit }) {
  return (
    <>
        {e1rmSpark && (
          <div className="border-t border-charcoal-border pt-2.5 mb-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted">
                e1RM · last {e1rmSpark.count} sessions
              </span>
              {e1rmSpark.delta !== 0 && (
                // Real minus sign (U+2212, not a hyphen) + a space before the
                // unit (coordinator, r4f: was "-6lbs" jammed together with a
                // plain hyphen). weightUnit is the one unit label this whole
                // card already uses everywhere else (column header, Volume,
                // the e1RM figure itself) — kept here rather than inventing a
                // second "lb" spelling, so the screen stays on one label.
                <span className={`text-[11px] font-bold ${e1rmSpark.delta > 0 ? "text-leaf" : "text-ink-muted"}`}>
                  {e1rmSpark.delta > 0 ? "+" : "−"}{Math.abs(e1rmSpark.delta)} {weightUnit}
                </span>
              )}
            </div>
            <div className="flex items-end gap-3">
              <div className="font-technical font-extrabold text-ink tabular-nums flex-shrink-0" style={{ fontSize: 28, lineHeight: 1 }}>
                {e1rmSpark.current}
                <span className="text-[12px] text-ink-muted font-semibold ml-0.5">{weightUnit}</span>
              </div>
              <svg
                viewBox={`0 0 ${e1rmSpark.w} ${e1rmSpark.h}`}
                className="flex-1 min-w-0"
                style={{ height: e1rmSpark.h }}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d={e1rmSpark.path} fill="none" className="stroke-ink-faint" strokeWidth="1.5" />
                {e1rmSpark.coords.slice(0, -1).map((c, i) => (
                  <circle key={i} cx={c.x} cy={c.y} r="1.75" className="fill-ink-faint" />
                ))}
                {e1rmSpark.coords.length > 0 && (
                  <circle
                    cx={e1rmSpark.coords[e1rmSpark.coords.length - 1].x}
                    cy={e1rmSpark.coords[e1rmSpark.coords.length - 1].y}
                    r="2.75"
                    className="fill-ink"
                  />
                )}
              </svg>
            </div>
          </div>
        )}
    </>
  );
}
