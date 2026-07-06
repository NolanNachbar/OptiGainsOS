import { useMemo } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";

// Recharts injects active/payload/label into the content element's props;
// weightUnit rides in from the chart. Defined at module scope so the tooltip
// component identity is stable across renders.
function CustomTooltip({ active, payload, label, weightUnit }) {
  if (!active || !payload?.length) return null;
  const bf = payload.find((p) => p.dataKey === "bf");
  const wt = payload.find((p) => p.dataKey === "weight");
  return (
    <div className="glass-elevated p-3 rounded-xl">
      <p className="font-bold text-[13px] text-ink">{format(parseISO(label), "MMM d, yyyy")}</p>
      {bf && <p className="text-[12px] font-technical font-bold text-ink">{bf.value}% est. BF</p>}
      {wt && <p className="text-[12px] font-technical font-semibold text-muted-2">{wt.value} {weightUnit}</p>}
    </div>
  );
}

// Estimated body fat (session-averaged photo estimates) over time, with the
// logged bodyweight trend on a second axis so composition and scale weight read
// together. Photo BF is low-accuracy in absolute terms — the TREND is the datum
// this chart exists for, same caveat the analyzer itself carries.
export default function PhysiqueTrendChart({ sessions, weightEntries, weightUnit = "lbs", className }) {
  const data = useMemo(() => {
    const byDate = new Map();
    for (const s of sessions || []) {
      if (s.bf == null) continue;
      byDate.set(s.date, { date: s.date, bf: Math.round(s.bf * 10) / 10 });
    }
    for (const w of weightEntries || []) {
      if (w.weight == null || !w.recorded_date) continue;
      const row = byDate.get(w.recorded_date) || { date: w.recorded_date };
      row.weight = w.weight;
      byDate.set(w.recorded_date, row);
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [sessions, weightEntries]);

  const bfPoints = data.filter((d) => d.bf != null);
  if (bfPoints.length < 2) return null;

  return (
    <div className={`w-full ${className || "h-56"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid horizontal vertical={false} strokeDasharray="0" stroke="var(--color-track)" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), "MMM d")}
            stroke="var(--color-track)"
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickLine={false}
          />
          {/* BF owns the left axis; weight rides a hidden right axis so the two
              scales never fight over one domain. */}
          <YAxis
            yAxisId="bf"
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={(v) => `${v}%`}
            stroke="var(--color-track)"
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickLine={false}
            width={44}
          />
          <YAxis yAxisId="wt" orientation="right" domain={["dataMin - 2", "dataMax + 2"]} hide />
          <Tooltip content={<CustomTooltip weightUnit={weightUnit} />} cursor={{ stroke: "var(--color-track)", strokeWidth: 1 }} />
          {/* Weight = quiet context line; BF = the hero datum in the teal data hue. */}
          <Line
            yAxisId="wt"
            type="monotone"
            dataKey="weight"
            stroke="var(--text-muted)"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="bf"
            type="monotone"
            dataKey="bf"
            stroke="var(--hue-teal)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--hue-teal)", strokeWidth: 0 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
