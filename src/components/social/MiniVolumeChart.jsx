/**
 * Pure CSS/SVG horizontal bar chart showing relative volume per exercise.
 * Volume = weight × reps × sets (total work done).
 * Designed to be compact and performant in feed cards (no charting library).
 */
export function MiniVolumeChart({ exercises }) {
  if (!exercises || exercises.length === 0) return null;

  // Calculate volume per exercise
  const volumes = exercises.map((ex) => {
    const sets = Array.isArray(ex.sets) ? ex.sets : [];
    const totalVolume = sets.reduce((sum, s) => {
      return sum + (s.weight || 0) * (s.reps || 0);
    }, 0);
    return { name: ex.name, volume: totalVolume, setCount: sets.length };
  }).filter((v) => v.volume > 0);

  if (volumes.length === 0) return null;

  const maxVolume = Math.max(...volumes.map((v) => v.volume));

  return (
    <div className="space-y-1.5">
      {volumes.slice(0, 5).map((v, i) => {
        const pct = maxVolume > 0 ? (v.volume / maxVolume) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 w-24 truncate flex-shrink-0">
              {v.name}
            </span>
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 w-14 text-right flex-shrink-0">
              {v.volume >= 1000
                ? `${(v.volume / 1000).toFixed(1)}k`
                : v.volume}{' '}
              lbs
            </span>
          </div>
        );
      })}
      {volumes.length > 5 && (
        <p className="text-xs text-slate-400 pl-26">+{volumes.length - 5} more</p>
      )}
    </div>
  );
}
