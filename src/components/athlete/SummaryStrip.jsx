import { MetricTile } from "@/components/ui/system";
import FatigueSection from "./FatigueSection";
import { pstCountdown } from "./athleteUtils";

// ── Summary strip ─────────────────────────────────────────────────────────────
// The focal content: a compact, glanceable row of the screen's headline numbers
// so the answer is grokkable in <2s before any drill-down.
export function SummaryStrip({ state, vdot, today, stale = false }) {
  const pst = pstCountdown(state?.endurance, state?.date, today);
  const recovery = state?.recovery;
  const fatigue = state?.fatigue;

  const tiles = [
    recovery?.data_available && {
      label: "Recovery", value: recovery.score, unit: "/100",
      accent: "var(--hue-teal)",
      sub: recovery.hrv ? `HRV ${recovery.hrv}ms` : undefined,
    },
    fatigue?.tsb != null && {
      label: "TSB",
      value: `${fatigue.tsb > 0 ? "+" : ""}${fatigue.tsb.toFixed(1)}`,
      // TSB is a biometric, so key it on the physiological spectrum by threshold
      // (mirroring FatigueSection's tsbColor) rather than a fixed hue. Violet is
      // reserved for ATL elsewhere; using it here was a hue collision.
      accent: fatigue.tsb > 5 ? "var(--hue-teal)" : fatigue.tsb > -5 ? "var(--text-muted)" : "var(--bad)",
      sub: (fatigue.interpretation || "").replace(/_/g, " ") || undefined,
    },
    vdot != null && {
      label: "VDOT", value: Number(vdot).toFixed(1),
      accent: "var(--hue-teal)",
    },
    pst && (pst.passed
      ? { label: "PST deadline", value: "Passed", accent: "var(--text-muted)", sub: `${pst.label} deadline` }
      : { label: "Days to PST", value: pst.days, accent: "var(--hue-gold)", sub: `${pst.label} deadline` }),
  ].filter(Boolean).map((t) => (
    // Stale rows keep their numbers but drop their datum hue so they read as
    // last-known values, not live readings.
    stale ? { ...t, accent: "var(--text-muted)" } : t
  ));
  const dim = stale ? " opacity-60" : "";

  if (tiles.length === 0) return null;

  // With only 1–2 metrics the 4-up grid reads as a sparse, half-empty row. Lead
  // instead with a Recovery hero (the headline biometric) at hero-metric scale,
  // falling back to the first available tile when recovery isn't present, and
  // trail any remaining tile beside it. ≥3 tiles keep the dense glanceable grid.
  if (tiles.length < 3) {
    const heroIdx = Math.max(0, tiles.findIndex((t) => t.label === "Recovery"));
    const hero = tiles[heroIdx];
    const rest = tiles.filter((_, i) => i !== heroIdx);
    return (
      <div className={`mb-4 rise-in space-y-2${dim}`}>
        <div className="bg-charcoal-surface2 rounded-control px-4 py-4">
          <div className="text-micro text-ink-muted flex items-center gap-1.5">
            <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: hero.accent }} />
            {hero.label}
          </div>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className="hero-metric text-ink text-hero">{hero.value ?? "--"}</span>
            {hero.unit && <span className="text-sm font-semibold text-muted-2">{hero.unit}</span>}
          </div>
          {hero.sub && <div className="text-xs font-semibold text-muted-2 mt-1 capitalize">{hero.sub}</div>}
        </div>
        {rest.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {rest.map((t) => (
              <MetricTile key={t.label} label={t.label} value={t.value} unit={t.unit} accent={t.accent} sub={t.sub} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 rise-in${dim}`}>
      {tiles.map((t) => (
        <MetricTile key={t.label} label={t.label} value={t.value} unit={t.unit} accent={t.accent} sub={t.sub} />
      ))}
    </div>
  );
}

export function SummaryStripSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-charcoal-surface2 rounded-control px-3 py-2.5">
          <div className="pulse-loop rounded bg-track h-2.5 w-2/3" />
          <div className="pulse-loop rounded bg-track h-5 w-1/2 mt-2" />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
