import MuscleHeatMap from "@/components/MuscleHeatMap";
import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import InfoNote from "./InfoNote";
import { FatigueColor } from "./athleteShared";
import StrengthSection from "./StrengthSection";

// Maps the display muscle names (athlete_state.hypertrophy) onto the engine's
// learned-landmark taxonomy (guardrail_state.mrv_state.landmarks) where they
// differ. The other 8 muscles share the same name in both.
const LEARNED_LANDMARK_KEY = { abs: "core", back: "upper_back" };

// Maps the display muscle names onto react-body-highlighter slugs so the
// anatomy figure can render the same fatigue data.
const HEAT_FIGURE_KEY = {
  chest: ["chest"], back: ["upper-back"], lats: ["upper-back"],
  shoulders: ["front-deltoids"], side_delts: ["front-deltoids"], rear_delts: ["back-deltoids"],
  biceps: ["biceps"], triceps: ["triceps"], forearms: ["forearm"],
  abs: ["abs"], core: ["abs"], obliques: ["obliques"],
  quads: ["quadriceps"], hamstrings: ["hamstring"], glutes: ["gluteal"],
  calves: ["calves"], traps: ["trapezius"], neck: ["neck"],
};

export default function HypertrophySection({ data, landmarks }) {
  const [showAll, setShowAll] = useState(false);

  // Mirror StrengthSection's guard: only entries carrying real per-muscle volume
  // ({weekly_sets, fatigue_score, mav, ...}) are renderable. A flat/legacy shape
  // (weekly_sets == null) would divide into NaN% bars and empty labels, so treat
  // anything without weekly_sets as "no data".
  const entries = data
    ? Object.entries(data).filter(([, d]) => d && typeof d === "object" && d.weekly_sets != null)
    : [];
  if (entries.length === 0) {
    return <p className="text-xs font-semibold text-muted-2">No volume data this week.</p>;
  }

  // Prefer the engine's *learned* MEV/MAV/MRV for a muscle over the static
  // template baked into athlete_state.hypertrophy. Returns null when the engine
  // hasn't learned a landmark for that muscle yet (→ fall back to the template).
  const learnedFor = (muscle) => {
    const lm = landmarks?.[LEARNED_LANDMARK_KEY[muscle] || muscle];
    if (!lm) return null;
    const mav = lm.MAV ?? lm.mav, mrv = lm.MRV ?? lm.mrv;
    if (mav == null || mrv == null) return null;
    return { mav: Math.round(mav), mrv: Math.round(mrv) };
  };

  const sorted = entries.sort((a, b) => b[1].fatigue_score - a[1].fatigue_score);
  const anyLearned = sorted.some(([m]) => learnedFor(m));
  // Cap the bar wall to the most-fatigued 8 by default so the section never
  // becomes an endless mid-page scroll; the rest is one tap away.
  const MUSCLE_CAP = 8;
  const visible = showAll ? sorted : sorted.slice(0, MUSCLE_CAP);
  const hiddenCount = sorted.length - visible.length;

  // Same fatigue data on the anatomy figure (teal opacity scale).
  const figureData = sorted
    .filter(([muscle, d]) => HEAT_FIGURE_KEY[muscle] && d.fatigue_score > 0)
    .map(([muscle, d]) => ({
      name: muscle,
      muscles: HEAT_FIGURE_KEY[muscle],
      frequency: Math.max(1, Math.round(d.fatigue_score * 3)),
    }));

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 min-w-0 space-y-2.5">
        {visible.map(([muscle, d]) => {
          const learned = learnedFor(muscle);
          const mav = learned?.mav ?? d.mav;
          const mrv = learned?.mrv ?? d.mrv;
          // Guard the ratio so a missing/zero MAV can't render a NaN% bar.
          const rawPct = Number.isFinite(d.weekly_sets) && mav > 0
            ? (d.weekly_sets / mav) * 100 : null;
          const pct = rawPct != null ? Math.min(rawPct, 120) : null;
          const overMrv = mrv > 0 && d.weekly_sets >= mrv;
          return (
            <div key={muscle}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-secondary capitalize">{muscle.replace(/_/g, " ")}</span>
                  {learned && (
                    <span className="text-micro uppercase tracking-[0.08em] text-muted-2 font-extrabold" title="Volume landmark learned by the engine from your response (MRV adapts when a muscle stalls while sore)">
                      learned
                    </span>
                  )}
                  {overMrv && <AlertTriangle className="w-3 h-3 text-bad" />}
                </div>
                <div className="flex items-center gap-2 font-technical text-caption">
                  <span className="font-semibold text-muted-2">{d.weekly_sets} / {mav} sets</span>
                  <FatigueColor score={d.fatigue_score} />
                </div>
              </div>
              {pct != null && (
                <div className="h-1.5 bg-track rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ease-[var(--ease)] ${d.fatigue_score >= 0.75 ? "bg-bad" : d.fatigue_score >= 0.5 ? "bg-warn" : "bg-teal"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {(hiddenCount > 0 || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="cta-ghost !h-11 !text-micro !font-bold uppercase tracking-[0.08em] !text-muted-2 hover:!text-ink active:scale-[0.98] transition-transform duration-200 ease-[var(--ease)] w-full"
          >
            {showAll ? "Show less" : `Show all ${sorted.length} muscles`}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ease-[var(--ease)] ${showAll ? "rotate-180" : ""}`} />
          </button>
        )}
        <InfoNote label="Reading these bars">
          Fatigue: teal &lt;50%, amber 50-75%, red &gt;75%. Bars fill to MAV target.
          {anyLearned && <span className="text-muted-2"> · &ldquo;learned&rdquo; = engine-adapted landmark, not a template.</span>}
        </InfoNote>
      </div>
      {figureData.length > 0 && (
        <>
          {/* Mobile: compact, full-width heat-map so the section keeps its
              namesake visualization instead of hiding it below lg. */}
          <div className="flex sm:hidden justify-center pt-1">
            <MuscleHeatMap data={figureData} className="h-[140px] w-full" />
          </div>
          {/* Desktop/tablet: taller figure beside the bars. */}
          <div className="shrink-0 hidden sm:flex justify-center sm:pt-1">
            <MuscleHeatMap data={figureData} className="h-[200px]" />
          </div>
        </>
      )}
    </div>
  );
}

// ── Fatigue section ───────────────────────────────────────────────────────────
