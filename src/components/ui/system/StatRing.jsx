/**
 * StatRing — the signature readiness ring. Teal gradient arc over a hairline
 * track, score centered, micro-label etched beneath it (the OGRing).
 */
import { useId } from "react";
import { bandFor } from "./helpers";

export default function StatRing({
  value,                 // 0-100 (or null)
  size = 168,
  stroke,                // defaults to proportional (og spec: 8.5% of size)
  label = "Readiness",
  sublabel,
  color,                 // override arc color (teal gradient when omitted)
  unit,
}) {
  const gradId = useId();
  const sw = stroke || Math.max(6, size * 0.085);
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const band = bandFor(value);
  const offset = circ * (1 - pct);
  const arcStroke = color || `url(#${gradId})`;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7FE9DD" />
            <stop offset="100%" stopColor="#3DB8AE" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.09)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={arcStroke} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ "--ring-circ": `${circ}px`, animation: "ringFill .9s cubic-bezier(.2,.7,.3,1) both" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="hero-metric text-ink" style={{ fontSize: size * 0.27 }}>
          {value == null ? "—" : Math.round(value)}
          {unit && <span className="text-base text-muted-2 ml-0.5 font-semibold">{unit}</span>}
        </div>
        {sublabel && (
          <div className="text-[11px] font-bold mt-0.5" style={{ color: band.color }}>
            {sublabel}
          </div>
        )}
        <div
          className="mt-0.5 uppercase font-bold text-muted-2"
          style={{ fontSize: Math.max(8, size * 0.085), letterSpacing: "0.08em" }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
