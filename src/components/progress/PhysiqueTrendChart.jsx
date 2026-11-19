import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { calculateEWMA } from "@/utils/coachingUtils";
import { cn } from "@/components/ui";
import { ChartLegend } from "./WeightProgressChart";
import { dayStamp, buildBfTrend } from "./trendMath";

const AXIS_TICK = { fontSize: 11, fill: "var(--text-faint)", fontFamily: "var(--font-ui)" };
function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const raw = payload.find((p) => p.dataKey === "value" || p.dataKey === "weight");
  const trend = payload.find((p) => p.dataKey === "trend" || p.dataKey === "trendWeight");
  return (
    <div className="border border-charcoal-border bg-charcoal-elevated p-3 rounded-control shadow-elev-3">
      <p className="text-emph text-ink">{format(new Date(label), "MMM d, yyyy")}</p>
      {trend && <p className="text-caption text-ink tabular-nums">Trend {trend.value}{unit}</p>}
      {raw && <p className="text-caption text-ink-muted tabular-nums">Logged {raw.value}{unit}</p>}
    </div>
  );
}

function SeriesChart({ data, rawKey, trendKey, domain, unit, tickFormat, height, label }) {
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border-soft)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={domain}
            tickFormatter={(t) => format(new Date(t), "MMM d")}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            orientation="right"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={tickFormat}
          />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }} />
          <Line
            dataKey={rawKey}
            stroke="none"
            dot={{ r: 1.5, fill: "var(--text-faint)", fillOpacity: 0.7, strokeWidth: 0 }}
            activeDot={{ r: 3, fill: "var(--text-muted)", strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey={trendKey}
            stroke="var(--viz-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--viz-1)", stroke: "var(--color-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Estimated body fat (session-averaged photo estimates) as raw dots with a
// smoothed trend, and logged bodyweight under it as its own chart on the same
// date range. Two measures, two charts: never one chart with two scales.
// Photo BF is low-accuracy in absolute terms, so the trend is the datum.
export default function PhysiqueTrendChart({ sessions, weightEntries, weightUnit = "lbs", className }) {
  const bf = useMemo(() => buildBfTrend(sessions), [sessions]);

  const weight = useMemo(() => {
    const rows = (weightEntries || []).filter((w) => w.weight != null && w.recorded_date);
    return calculateEWMA(rows, 0.1).map((r) => ({ ...r, t: dayStamp(r.recorded_date) }));
  }, [weightEntries]);

  if (bf.length < 2) return null;

  const domain = [bf[0].t, bf[bf.length - 1].t];
  const inRange = weight.filter((w) => w.t >= domain[0] && w.t <= domain[1]);

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Body fat, est.</p>
      <SeriesChart
        data={bf}
        rawKey="value"
        trendKey="trend"
        domain={domain}
        unit="%"
        tickFormat={(v) => `${Math.round(v * 10) / 10}%`}
        height={160}
        label="Estimated body fat over time"
      />
      {inRange.length >= 2 && (
        <>
          <p className="mb-1 mt-4 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Bodyweight, {weightUnit}</p>
          <SeriesChart
            data={inRange}
            rawKey="weight"
            trendKey="trendWeight"
            domain={domain}
            unit={` ${weightUnit}`}
            tickFormat={(v) => Math.round(v)}
            height={120}
            label="Bodyweight over the same dates"
          />
        </>
      )}
      <ChartLegend items={[{ label: "Logged", dot: true }, { label: "Trend" }]} />
    </div>
  );
}
