import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { Stat, EmptyState, cn } from "@/components/ui";
import { calculateEWMA } from "@/utils/coachingUtils";
import { dayStamp, signed, weightTrendState } from "./trendMath";

const AXIS_TICK = { fontSize: 11, fill: "var(--text-faint)", fontFamily: "var(--font-ui)" };

function ChartTooltip({ active, payload, label, weightUnit }) {
  if (!active || !payload?.length) return null;
  const raw = payload.find((p) => p.dataKey === "weight");
  const trend = payload.find((p) => p.dataKey === "trendWeight");
  return (
    <div className="border border-charcoal-border bg-charcoal-elevated p-3 rounded-control shadow-elev-3">
      <p className="text-emph text-ink">{format(new Date(label), "MMM d, yyyy")}</p>
      {trend && <p className="text-caption text-ink tabular-nums">Trend {trend.value} {weightUnit}</p>}
      {raw && <p className="text-caption text-ink-muted tabular-nums">Logged {raw.value} {weightUnit}</p>}
    </div>
  );
}

export function ChartLegend({ items }) {
  return (
    <div className="mt-3 flex items-center gap-4 text-caption text-ink-muted">
      {items.map(({ label, dot }) => (
        <span key={label} className="flex items-center gap-2">
          {dot ? (
            <span className="h-[3px] w-[3px] rounded-pill bg-ink-faint opacity-70 scale-[2]" aria-hidden="true" />
          ) : (
            <span className="h-[2px] w-4 bg-ink" aria-hidden="true" />
          )}
          {label}
        </span>
      ))}
    </div>
  );
}

// Weight over time: raw weigh-ins as faint dots, the smoothed trend on top.
// The headline is the trend value with its weekly rate and basis.
export default function WeightProgressChart({ data, weightUnit = "lbs", className }) {
  const trended = useMemo(() => {
    const rows = calculateEWMA(data || [], 0.1);
    return rows.map((r) => ({ ...r, t: dayStamp(r.recorded_date) }));
  }, [data]);

  // Same trend state as the Body weight card, so the basis copy matches.
  const trendState = useMemo(() => weightTrendState(trended), [trended]);
  const { rate } = trendState;

  if (trended.length === 0) {
    return (
      <EmptyState title="No weigh-ins yet">
        The trend firms up after about 7 days of weigh-ins.
      </EmptyState>
    );
  }

  const last = trended[trended.length - 1];
  const rateLabel = rate ? `${signed(rate.perWeek)} ${weightUnit}/wk` : null;

  return (
    <div className="w-full">
      <Stat
        label="Trend weight"
        size="md"
        value={last.trendWeight}
        unit={weightUnit}
        delta={rateLabel}
        className={trendState.isStale ? "opacity-60" : ""}
      />
      {trendState.basis && (
        <p className="mt-1 text-caption text-ink-muted tabular-nums">{trendState.basis}</p>
      )}

      <div className={cn("mt-3", className || "h-64")}>
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <LineChart data={trended} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal vertical={false} stroke="var(--color-border-soft)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
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
              width={36}
              domain={["dataMin - 2", "dataMax + 2"]}
              tickFormatter={(v) => Math.round(v)}
            />
            <Tooltip content={<ChartTooltip weightUnit={weightUnit} />} cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }} />
            <Line
              dataKey="weight"
              stroke="none"
              dot={{ r: 1.5, fill: "var(--text-faint)", fillOpacity: 0.7, strokeWidth: 0 }}
              activeDot={{ r: 3, fill: "var(--text-muted)", strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="trendWeight"
              stroke="var(--text-primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--text-primary)", stroke: "var(--color-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend items={[{ label: "Logged", dot: true }, { label: "Trend" }]} />
    </div>
  );
}
