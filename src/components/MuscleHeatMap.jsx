import { useState, useEffect } from "react";
import Model from "react-body-highlighter";

function getBrandColors() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-brand-rgb').trim();
  const [r, g, b] = raw ? raw.split(' ').map(Number) : [204, 255, 0];
  return [
    `rgb(${Math.round(r * 0.3)} ${Math.round(g * 0.3)} ${Math.round(b * 0.3)})`,
    `rgb(${Math.round(r * 0.6)} ${Math.round(g * 0.6)} ${Math.round(b * 0.6)})`,
    `rgb(${r} ${g} ${b})`,
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
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] text-xs font-medium">
          <button
            onClick={() => setOwnView("anterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "anterior" ? "bg-brand text-black font-bold" : "bg-[#1a1a1a] text-[#a0a0a0] hover:bg-[#242424]"}`}
          >Front</button>
          <button
            onClick={() => setOwnView("posterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "posterior" ? "bg-brand text-black font-bold" : "bg-[#1a1a1a] text-[#a0a0a0] hover:bg-[#242424]"}`}
          >Back</button>
        </div>
      )}

      <div className="rounded-xl bg-[#1a1a1a] p-2 w-full flex-1 flex justify-center items-center min-h-0">
        <Model
          data={data}
          type={view}
          highlightedColors={colors}
          style={{ width: "100%", maxWidth }}
        />
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 text-xs text-[#a0a0a0] shrink-0">
        <span>Low</span>
        <div className="flex h-2 w-16 rounded-full overflow-hidden">
          <div className="flex-1" style={{ background: colors[0] }} />
          <div className="flex-1" style={{ background: colors[1] }} />
          <div className="flex-1" style={{ background: colors[2] }} />
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
