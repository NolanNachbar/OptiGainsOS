import { useState, useEffect } from "react";
import Model from "react-body-highlighter";

function getBrandColors() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-brand-rgb').trim();
  const rgbStr = raw || "255 107 59";
  // Convert spaces to commas if necessary
  const formattedRgb = rgbStr.replace(/\s+/g, ',');
  return [
    `rgba(${formattedRgb}, 0.25)`,
    `rgba(${formattedRgb}, 0.6)`,
    `rgba(${formattedRgb}, 1)`,
  ];
}

export default function MuscleHeatMap({ data = [], className = "", view: controlledView, maxWidth = 130 }) {
  const [ownView, setOwnView] = useState("anterior");
  const [colors, setColors] = useState(getBrandColors);
  const isControlled = controlledView !== undefined;
  const view = isControlled ? controlledView : ownView;

  // Re-derive colors if the CSS var changes (tenant branding switch)
  useEffect(() => {
    setColors(getBrandColors());
  }, []);

  if (!data.length) return null;

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      {/* Toggle only shown when not controlled externally */}
      {!isControlled && (
        <div className="flex rounded-full overflow-hidden border border-charcoal-border text-xs font-medium bg-charcoal-surface">
          <button
            onClick={() => setOwnView("anterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "anterior" ? "bg-brand text-black font-bold" : "text-slate-400 hover:text-white"}`}
          >Front</button>
          <button
            onClick={() => setOwnView("posterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "posterior" ? "bg-brand text-black font-bold" : "text-slate-400 hover:text-white"}`}
          >Back</button>
        </div>
      )}

      <div className="bg-transparent w-full flex-1 flex justify-center items-center min-h-0 overflow-hidden">
        <Model
          data={data}
          type={view}
          highlightedColors={colors}
          bodyColor="#3a3a4c"
          style={{ width: "100%", height: "100%", maxHeight: "100%", maxWidth }}
        />
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
        <span>Low</span>
        <div className="flex h-2 w-16 rounded-full overflow-hidden bg-charcoal-border">
          <div className="flex-1" style={{ background: colors[0] }} />
          <div className="flex-1" style={{ background: colors[1] }} />
          <div className="flex-1" style={{ background: colors[2] }} />
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
