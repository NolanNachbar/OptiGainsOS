/**
 * Shared layout primitives for the Vapor×Macro design system.
 *   SectionLabel  — the uppercase micro-header (og-cap) used above every group.
 *   GlassHero     — a frosted-glass hero card.
 *   Surface       — the standard frosted-glass data card.
 *   VerdictBanner — the decision-first readiness verdict line.
 *   MiniRing      — small hue-coded progress ring (macros, sub-scores).
 */
import { verdictKey } from "./helpers";

export function SectionLabel({ icon: Icon, children, right, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-2" />}
      <span className="section-label">{children}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

export function Surface({ children, className = "", glass = false, ...props }) {
  return (
    <div className={`${glass ? "glass" : "surface"} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function GlassHero({ children, accent, className = "", ...props }) {
  return (
    <div
      className={`glass glass-interactive relative overflow-hidden ${className}`}
      {...props}
    >
      {accent && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />}
      {children}
    </div>
  );
}

const VERDICT = {
  primed:   { color: "var(--hue-teal)",  word: "Primed",      tone: "rgba(94,220,210,.10)" },
  ready:    { color: "var(--hue-green)", word: "Ready",       tone: "rgba(123,201,111,.09)" },
  moderate: { color: "var(--warn)",      word: "Moderate",    tone: "rgba(226,162,60,.09)" },
  recover:  { color: "var(--bad)",       word: "Recover",     tone: "rgba(239,115,104,.10)" },
  unknown:  { color: "var(--text-faint)", word: "Calibrating", tone: "rgba(255,255,255,.04)" },
};

/** The decision-first line: a color-keyed verdict word + one plain-language sentence. */
export function VerdictBanner({ score, headline, detail, className = "" }) {
  const v = VERDICT[verdictKey(score)];
  return (
    <div
      className={`glass px-4 sm:px-5 py-3.5 flex items-center gap-4 relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(120deg, ${v.tone}, transparent 60%)` }}
    >
      <div className="flex items-baseline gap-2.5 shrink-0">
        {score != null && <span className="hero-metric text-ink text-3xl sm:text-4xl">{Math.round(score)}</span>}
        <span className="text-base sm:text-lg font-extrabold" style={{ color: v.color }}>
          {headline || v.word}
        </span>
      </div>
      {detail && <p className="text-[13px] sm:text-sm text-secondary leading-snug">{detail}</p>}
    </div>
  );
}

/** Small hue-coded progress ring — the OGMiniRing (kcal/protein/carbs/fat…). */
export function MiniRing({ label, value, frac = 1, hue = "var(--hue-teal)", size = 42 }) {
  const r = size * 0.405, cx = size / 2, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, frac ?? 0));
  return (
    <div className="flex flex-col items-center gap-[3px]">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} stroke="var(--color-border-soft)" strokeWidth={size * 0.107} fill="none" />
        <circle cx={cx} cy={cx} r={r} stroke={hue} strokeWidth={size * 0.107} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - clamped)} transform={`rotate(-90 ${cx} ${cx})`} />
        <text x={cx} y={cx + size * 0.095} textAnchor="middle" fill="var(--text-primary)"
          fontSize={size * 0.25} fontWeight="800" style={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
        </text>
      </svg>
      <span className="text-[9.5px] font-bold text-muted-2">{label}</span>
    </div>
  );
}
