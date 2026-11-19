import { useState, useMemo } from "react";
import Model from "react-body-highlighter";
import { SegmentedControl, cn } from "@/components/ui";

// Muscle load is teal in this identity (readiness hue) — low→high opacity,
// matching the Body screen's muscle-load scale. Coral stays reserved for action.
function getBodyColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-surface-2").trim() || "currentColor";
}

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
  // Read once from the CSS tokens; the identity is dark-only, so no theme re-read.
  const colors = useMemo(() => getHeatColors(), []);
  const bodyColor = useMemo(() => getBodyColor(), []);
  const isControlled = controlledView !== undefined;
  const view = isControlled ? controlledView : ownView;

  if (!data.length) return null;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {!isControlled && (
        <SegmentedControl
          options={[{ value: "anterior", label: "Front" }, { value: "posterior", label: "Back" }]}
          value={view}
          onChange={setOwnView}
        />
      )}

      <div className="w-full flex-1 flex justify-center items-center min-h-0 overflow-hidden">
        <Model
          data={data}
          type={view}
          highlightedColors={colors}
          bodyColor={bodyColor}
          style={{ width: "100%", height: "100%", maxHeight: "100%", maxWidth }}
        />
      </div>

      {/* Load legend */}
      <div className="flex items-center gap-2 text-caption text-ink-muted shrink-0">
        <span>Low</span>
        <div className="flex h-2 w-16 rounded-pill overflow-hidden bg-track">
          <div className="flex-1" style={{ background: colors[0] }} />
          <div className="flex-1" style={{ background: colors[1] }} />
          <div className="flex-1" style={{ background: colors[2] }} />
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
