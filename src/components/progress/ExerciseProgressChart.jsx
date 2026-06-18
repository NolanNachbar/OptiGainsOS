import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

function computeTrend(data) {
  if (!data || data.length < 3) return data.map(d => ({ ...d, trend: null }));
  let trend = data[0].maxWeight;
  return data.map((entry, i) => {
    if (i === 0) return { ...entry, trend: Math.round(trend * 10) / 10 };
    trend = 0.25 * entry.maxWeight + 0.75 * trend;
    return { ...entry, trend: Math.round(trend * 10) / 10 };
  });
}

export default function ExerciseProgressChart({ data, exerciseName, weightUnit = 'lbs', className }) {
  const chartData = useMemo(() => computeTrend(data || []), [data]);
  const hasTrend = chartData.length >= 3;

  if (!data || data.length === 0) {
    return (
      <div className={`w-full ${className || 'h-80'} flex items-center justify-center glass-inset`}>
        <p className="text-xs font-semibold text-muted-2">No data available for this exercise</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const raw = payload.find(p => p.dataKey === 'maxWeight');
      const trend = payload.find(p => p.dataKey === 'trend');
      return (
        <div className="glass-elevated p-3 rounded-xl">
          <p className="font-bold text-xs text-ink mb-1">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {raw && <p className="text-xs font-technical font-semibold text-muted-2">{raw.value} {weightUnit}</p>}
          {trend && <p className="text-xs font-technical font-bold text-teal">Trend: {trend.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full ${className || 'h-80'}`}>
      <ResponsiveContainer width="100%" height="100%" minHeight={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.05)" strokeOpacity={1} />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => format(parseISO(date), 'MMM d')}
            stroke="rgba(255,255,255,0.05)"
            tick={{ fontSize: 11, fill: 'rgba(242,244,247,0.4)', fontFamily: 'Manrope' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}`}
            stroke="rgba(255,255,255,0.05)"
            tick={{ fontSize: 11, fill: 'rgba(242,244,247,0.4)', fontFamily: 'Manrope' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="maxWeight"
            stroke="rgba(242,244,247,0.18)"
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 3, fill: 'rgba(242,244,247,0.4)', strokeWidth: 0 }}
          />
          {hasTrend && (
            <Line
              type="monotone"
              dataKey="trend"
              stroke="var(--hue-teal)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--hue-teal)', strokeWidth: 0 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {hasTrend && (
        <div className="flex items-center gap-5 mt-2 text-[9.5px] font-bold text-muted-2">
          <span className="flex items-center gap-1.5">
            <div className="w-3.5 h-[2.5px] rounded-full bg-white/20" />
            Raw
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3.5 h-px" style={{ borderTop: '2px dashed var(--hue-teal)' }} />
            Trend
          </span>
        </div>
      )}
    </div>
  );
}
