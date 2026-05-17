import { useState } from "react";
import Model from "react-body-highlighter";

const COLORS = ["#ddd6fe", "#a78bfa", "#7c3aed"];

export default function MuscleHeatMap({ data = [], className = "", view: controlledView, maxWidth = 130 }) {
  const [ownView, setOwnView] = useState("anterior");
  const isControlled = controlledView !== undefined;
  const view = isControlled ? controlledView : ownView;

  if (!data.length) return null;

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      {/* Toggle only shown when not controlled externally */}
      {!isControlled && (
        <div className="flex rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 text-xs font-medium shadow-sm">
          <button
            onClick={() => setOwnView("anterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "anterior" ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
          >Front</button>
          <button
            onClick={() => setOwnView("posterior")}
            className={`px-2.5 py-0.5 transition-colors ${view === "posterior" ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
          >Back</button>
        </div>
      )}

      <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-2 w-full flex-1 flex justify-center items-center min-h-0">
        <Model
          data={data}
          type={view}
          highlightedColors={COLORS}
          style={{ width: "100%", maxWidth }}
        />
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 shrink-0">
        <span>Low</span>
        <div className="flex h-2 w-16 rounded-full overflow-hidden">
          <div className="flex-1" style={{ background: COLORS[0] }} />
          <div className="flex-1" style={{ background: COLORS[1] }} />
          <div className="flex-1" style={{ background: COLORS[2] }} />
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
