/**
 * MetricTile — hue-coded glanceable metric (the og-inset cell). A tiny hue dot
 * keys the datum, the value is tabular Manrope, the delta carries the hue.
 */
export default function MetricTile({
  label,
  value,
  unit,
  delta,                 // e.g. "+0.4", colored by sign unless deltaColor given
  deltaColor,
  accent,                // the datum's hue, dot + delta color
  sub,                   // small caption under the value
  icon: Icon,
  onClick,
  className = "",
}) {
  const hue = accent || "var(--hue-teal)";
  const dc = deltaColor || (delta == null ? undefined :
    String(delta).trim().startsWith("-") ? "var(--bad)" : hue);
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`glass-inset ${onClick ? "text-left w-full hover:bg-white/[0.07] transition-colors" : ""} px-3 py-2.5 relative overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: hue }} />
        {Icon && <Icon className="w-3 h-3 text-muted-2" />}
        <span className="section-label !text-[9.5px]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-1.5">
        <span className="hero-metric text-ink text-[20px]">{value ?? "—"}</span>
        {unit && <span className="text-[10px] font-semibold text-muted-2">{unit}</span>}
        {delta != null && (
          <span className="font-technical text-[11px] font-bold ml-auto" style={{ color: dc }}>{delta}</span>
        )}
      </div>
      {sub && <div className="text-[10.5px] font-semibold text-muted-2 mt-0.5 truncate">{sub}</div>}
    </Comp>
  );
}
