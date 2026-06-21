/**
 * Shared layout primitives for the Vapor×Macro design system.
 *   SectionLabel     — the uppercase micro-header (og-cap) used above every group.
 *   GlassHero        — a frosted-glass hero card.
 *   Surface          — the standard frosted-glass data card.
 *   VerdictBanner    — the decision-first readiness verdict line.
 *   MiniRing         — small hue-coded progress ring (macros, sub-scores).
 *   SegmentedControl — two-or-more option toggle on a glass track (og-segment).
 *   PosePillRow      — horizontally-scrolling pill row with two roles
 *                      (solid selector vs quiet underline filter).
 *   ProfileStatsCard — avatar + name + 3-stat block (Profile hub card).
 *   TabCount         — neutral count badge for tab labels (data, never coral).
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
  recover:  { color: "var(--bad)",       word: "Recover",     tone: "rgba(var(--bad-rgb) / .10)" },
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

/**
 * SegmentedControl — the og-segment. A small two-or-more option toggle rendered
 * as a single glass track with solid pills for the active option. The Front/Back
 * muscle-view toggle and any other "pick one of N" inline switch share this so
 * the track/edge/active treatment never diverges.
 *
 *   options: [{ value, label }]
 *   value:   active value
 *   onChange(value)
 *   size:    "sm" | "md"  (md = roomier tap targets)
 */
export function SegmentedControl({ options, value, onChange, size = "sm", className = "" }) {
  // Every segment is a real tap target: min 44px tall so the control clears the
  // a11y floor even at size="sm". Padding only controls horizontal breathing room.
  const pad = size === "md" ? "px-4" : "px-3";
  return (
    <div
      className={`inline-flex rounded-full overflow-hidden bg-[var(--glass-bg)] border border-charcoal-border text-xs font-semibold shadow-[inset_0_1px_0_var(--glass-specular)] ${className}`}
    >
      {options.map(({ value: v, label }) => {
        const isActive = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={isActive}
            className={`${pad} min-h-[44px] inline-flex items-center justify-center transition-colors ${
              isActive
                ? "bg-track text-ink font-bold"
                : "text-ink-muted hover:bg-[var(--glass-bg)] hover:text-ink"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * PosePillRow — the og-pillrow. A horizontally-scrolling row of single-select
 * pills, with two DIFFERENTIATED roles driven by `variant`:
 *   variant="solid" — the upload selector. Filled glass pills; the active pill
 *                     reads as a solid track chip. (commits an action target)
 *   variant="chip"  — the history filter. Quieter text chips; the active chip is
 *                     a low-contrast track fill so a filter never competes with
 *                     the selector for emphasis.
 *
 *   options:  [{ value, label }]
 *   value:    active value (null is allowed and matches an option with value null)
 *   onChange(value)
 *   disabled: disables all pills (busy state)
 */
export function PosePillRow({ options, value, onChange, variant = "solid", disabled = false, className = "" }) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 ${className}`}>
      {options.map(({ value: v, label }) => {
        const isActive = value === v;
        const base =
          "shrink-0 whitespace-nowrap px-3 py-1.5 min-h-[44px] rounded-full text-[11px] font-bold border-[0.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
        // Active pill carries a clear brand accent (matching the design-system
        // segmented control) so the selected pose is unmistakable against the
        // near-equal-luminance inactive pills on charcoal. Same active treatment
        // for both variants — only the inactive rest differs (chip = quieter).
        const activeTone =
          "bg-brand/15 text-brand border-brand/40 shadow-[var(--shadow-1)]";
        const tone =
          variant === "chip"
            ? isActive
              ? activeTone
              : "bg-transparent text-ink-muted border-transparent hover:bg-[var(--glass-bg)] hover:text-ink"
            : isActive
              ? activeTone
              : "bg-[var(--glass-inset-bg)] text-ink-muted border-charcoal-border hover:bg-[var(--glass-bg)]";
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            disabled={disabled}
            className={`${base} ${tone}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ProfileStatsCard — the avatar + name + 3-stat hub card. Single source for the
 * Profile mobile hub and desktop sidebar so the two never drift.
 *
 *   initials: avatar initials
 *   name:     display name / email
 *   stats:    [{ value, label }] (rendered in a 3-col grid)
 */
export function ProfileStatsCard({ initials, name, stats, padding = "p-4", className = "" }) {
  return (
    <div className={`glass ${padding} text-center ${className}`}>
      {/* Neutral avatar disc — matches the chrome UserAvatar. Coral is the single
          ACTION color (the Sign Out CTA), so it must not be spent on a decorative
          avatar tint here. */}
      <div className="w-16 h-16 rounded-full bg-charcoal-elevated flex items-center justify-center mx-auto">
        <span className="text-ink text-2xl font-bold">{initials}</span>
      </div>
      <p className="text-ink font-semibold mt-3 text-sm leading-tight">{name}</p>
      {stats?.length > 0 && (
        <div className="grid grid-cols-3 gap-1 mt-4 pt-4 border-t border-charcoal-border">
          {stats.map(({ value, label }, i) => (
            <div key={i}>
              {/* Value in brand teal so 'numbers lead' holds wherever the card
                  renders (desktop sidebar); caption bumped to secondary for AA. */}
              <p className="text-brand font-bold text-lg leading-tight font-technical">{value}</p>
              <p className="text-ink-secondary text-[10px] uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * TabCount — the og-tabcount. A neutral count badge for tab labels. A count is
 * DATA, not an action, so it must never be coral: muted ink on the track fill,
 * tabular numerals.
 */
export function TabCount({ children, className = "" }) {
  return (
    <span
      className={`ml-1.5 bg-track text-ink-muted text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${className}`}
    >
      {children}
    </span>
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
