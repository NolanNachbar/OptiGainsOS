import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { cn } from "@/components/ui";

const AXIS_TICK = { fontSize: 11, fill: "var(--text-faint)", fontFamily: "var(--font-ui)" };

function ChartTooltip({ active, payload, label, weightUnit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-charcoal-border bg-charcoal-elevated p-3 rounded-control shadow-elev-3">
      <p className="text-emph text-ink">{format(parseISO(label), "MMM d, yyyy")}</p>
      <p className="text-caption text-ink tabular-nums">{payload[0].value} {weightUnit} e1RM</p>
    </div>
  );
}

/**
 * e1RM history for one lift. One series, so no legend: the row above names it.
 * Sessions are plain faint dots, the line is the progression, and the latest
 * session gets the one off-white "now" dot.
 *
 *   data:   [{date, e1rm}] oldest to newest (see getExerciseE1rmHistory)
 *   target: optional target e1RM, drawn as a dashed reference line
 */
export default function ExerciseProgressChart({ data, exerciseName, weightUnit = "lbs", target, className }) {
  if (!data || data.length === 0) {
    return (
      <div className={cn("w-full flex items-center justify-center border border-charcoal-borderSoft rounded-control", className || "h-56")}>
        <p className="text-caption text-ink-muted">No logged sets for this lift yet</p>
      </div>
    );
  }

  const lastDate = data[data.length - 1]?.date;

  const dot = ({ cx, cy, payload, index }) => {
    const isNow = payload.date === lastDate;
    return (
      <circle
        key={index}
        cx={cx}
        cy={cy}
        r={isNow ? 4 : 1.5}
        fill={isNow ? "var(--text-primary)" : "var(--text-faint)"}
        fillOpacity={isNow ? 1 : 0.7}
      />
    );
  };

  return (
    <div className={cn("w-full", className || "h-56")} aria-label={exerciseName ? `${exerciseName} e1RM chart` : "e1RM chart"}>
      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
        <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border-soft)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), "MMM d")}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            orientation="right"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={38}
            domain={["dataMin - 5", "dataMax + 5"]}
          />
          <Tooltip content={<ChartTooltip weightUnit={weightUnit} />} cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }} />
          {target ? (
            <ReferenceLine
              y={target}
              stroke="var(--text-faint)"
              strokeDasharray="4 4"
              label={{ value: `Target ${target}`, position: "insideTopRight", fill: "var(--text-faint)", fontSize: 11 }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke="var(--text-primary)"
            strokeWidth={2}
            dot={dot}
            activeDot={{ r: 4, fill: "var(--text-primary)", stroke: "var(--color-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
