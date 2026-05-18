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
      <div className={`w-full ${className || 'h-80'} flex items-center justify-center bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]`}>
        <p className="text-xs text-[#555555]">No data available for this exercise</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const raw = payload.find(p => p.dataKey === 'maxWeight');
      const trend = payload.find(p => p.dataKey === 'trend');
      return (
        <div className="bg-[#202020] p-3 rounded-xl border border-[#2a2a2a]">
          <p className="font-semibold text-xs text-white mb-1">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {raw && <p className="text-xs font-mono text-[#555555]">{raw.value} {weightUnit}</p>}
          {trend && <p className="text-xs font-mono text-[#ccff00]">Trend: {trend.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full ${className || 'h-80'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="0" stroke="#2a2a2a" strokeOpacity={1} />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => format(parseISO(date), 'MMM d')}
            stroke="#333333"
            tick={{ fontSize: 11, fill: '#555555', fontFamily: 'IBM Plex Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}`}
            stroke="#333333"
            tick={{ fontSize: 11, fill: '#555555', fontFamily: 'IBM Plex Mono' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2a2a2a', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="maxWeight"
            stroke="#333333"
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 3, fill: '#555555', strokeWidth: 0 }}
          />
          {hasTrend && (
            <Line
              type="monotone"
              dataKey="trend"
              stroke="#ccff00"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: '#ccff00', strokeWidth: 0 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {hasTrend && (
        <div className="flex items-center gap-5 mt-2 text-xs text-[#555555] font-mono">
          <span className="flex items-center gap-1.5">
            <div className="w-4 h-px bg-[#333333]" />
            Raw
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-4 h-px" style={{ borderTop: '1.5px dashed #ccff00' }} />
            Trend
          </span>
        </div>
      )}
    </div>
  );
}
