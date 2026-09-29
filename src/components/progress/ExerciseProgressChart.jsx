import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";

/**
 * Ledger-style e1RM chart for a single lift (Body → Lifts detail).
 * DESIGN.md "Charts": gray history line/points, an off-white "now" dot on the
 * latest session, a dashed target line when one exists, small tabular axis
 * labels on the right. No brand hue — this is a plain data line, not an
 * action.
 *
 *   data:   [{date, e1rm}] oldest → newest (see getExerciseE1rmHistory)
 *   target: optional target e1RM to draw as a dashed reference line
 */
export default function ExerciseProgressChart({ data, exerciseName, weightUnit = "lbs", target, className }) {
  if (!data || data.length === 0) {
    return (
      <div className={`w-full ${className || "h-56"} flex items-center justify-center glass-inset`}>
        <p className="text-xs font-semibold text-muted-2">No logged sets for this lift yet</p>
      </div>
    );
  }

  const lastDate = data[data.length - 1]?.date;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-elevated p-3 rounded-xl">
          <p className="font-bold text-xs text-ink mb-1">{format(parseISO(label), "MMM d, yyyy")}</p>
          <p className="text-xs font-technical font-semibold text-ink">
            {payload[0].value} {weightUnit} e1RM
          </p>
        </div>
      );
    }
    return null;
  };

  // The line itself carries the trend in off-white; individual session
  // points render gray except the most recent one, which gets the larger
  // off-white "now" dot (DESIGN.md Charts convention, same one Today's
  // Spark/weight-trend module uses).
  const CustomDot = ({ cx, cy, payload }) => {
    const isNow = payload.date === lastDate;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={isNow ? 3.5 : 2}
        fill={isNow ? "var(--text-primary)" : "var(--text-faint)"}
      />
    );
  };

  return (
    <div className={`w-full ${className || "h-56"}`} aria-label={exerciseName ? `${exerciseName} e1RM chart` : "e1RM chart"}>
      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
        <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="0" stroke="var(--color-border-soft)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), "MMM d")}
            stroke="var(--color-border-soft)"
            tick={{ fontSize: 10, fill: "var(--text-faint)", fontFamily: "var(--font-ui)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            orientation="right"
            stroke="var(--color-border-soft)"
            tick={{ fontSize: 10, fill: "var(--text-faint)", fontFamily: "var(--font-ui)" }}
            axisLine={false}
            tickLine={false}
            width={38}
            domain={["dataMin - 5", "dataMax + 5"]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }} />
          {target ? (
            <ReferenceLine
              y={target}
              stroke="var(--text-faint)"
              strokeDasharray="4 4"
              label={{ value: `Target ${target}`, position: "insideTopRight", fill: "var(--text-faint)", fontSize: 10 }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke="var(--text-primary)"
            strokeWidth={1.5}
            dot={<CustomDot />}
            activeDot={{ r: 4, fill: "var(--text-primary)", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
