import { useState, useEffect } from "react";
import Model from "react-body-highlighter";

// Muscle load is teal in this identity (readiness hue) — low→high opacity,
// matching the Body screen's muscle-load scale. Coral stays reserved for action.
function getHeatColors() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--hue-teal-rgb').trim();
  const rgbStr = raw || "94 220 210";
  const formattedRgb = rgbStr.replace(/\s+/g, ',');
  return [
    `rgba(${formattedRgb}, 0.28)`,
    `rgba(${formattedRgb}, 0.62)`,
    `rgba(${formattedRgb}, 1)`,
  ];
}

export default function MuscleHeatMap({ data = [], className = "", view: controlledView, maxWidth = 130 }) {
  const [ownView, setOwnView] = useState("anterior");
  const [colors, setColors] = useState(getHeatColors);
  const isControlled = controlledView !== undefined;
  const view = isControlled ? controlledView : ownView;

  // Re-derive colors if the CSS var changes (theme switch)
  useEffect(() => {
    setColors(getHeatColors());
  }, []);

  if (!data.length) return null;

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      {/* Toggle only shown when not controlled externally */}
      {!isControlled && (
        <div className="flex rounded-full overflow-hidden border border-white/10 text-xs font-bold bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
          <button
            onClick={() => setOwnView("anterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "anterior" ? "bg-[rgba(var(--hue-teal-rgb)/0.18)] text-[var(--hue-teal)]" : "text-ink-muted hover:text-ink"}`}
          >Front</button>
          <button
            onClick={() => setOwnView("posterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "posterior" ? "bg-[rgba(var(--hue-teal-rgb)/0.18)] text-[var(--hue-teal)]" : "text-ink-muted hover:text-ink"}`}
          >Back</button>
        </div>
      )}

      <div className="bg-transparent w-full flex-1 flex justify-center items-center min-h-0 overflow-hidden">
        <Model
          data={data}
          type={view}
          highlightedColors={colors}
          bodyColor="#252C37"
          style={{ width: "100%", height: "100%", maxHeight: "100%", maxWidth }}
        />
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-ink-muted shrink-0">
        <span>Low</span>
        <div className="flex h-2 w-16 rounded-full overflow-hidden bg-white/[0.08]">
          <div className="flex-1" style={{ background: colors[0] }} />
          <div className="flex-1" style={{ background: colors[1] }} />
          <div className="flex-1" style={{ background: colors[2] }} />
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
