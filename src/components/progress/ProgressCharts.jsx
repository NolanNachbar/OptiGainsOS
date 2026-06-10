import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { calculateEWMA } from "@/utils/coachingUtils";

function computeExerciseTrend(data) {
  if (!data || data.length < 3) return data.map(d => ({ ...d, trend: null }));
  let trend = data[0].maxWeight;
  return data.map((entry, i) => {
    if (i === 0) return { ...entry, trend: Math.round(trend * 10) / 10 };
    trend = 0.25 * entry.maxWeight + 0.75 * trend;
    return { ...entry, trend: Math.round(trend * 10) / 10 };
  });
}

export function ExerciseProgressChart({ data, exerciseName, weightUnit = 'lbs' }) {
  const chartData = useMemo(() => computeExerciseTrend(data || []), [data]);
  const hasTrend = chartData.length >= 3;

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center glass-inset">
        <p className="text-muted-2 font-semibold">No data available for this exercise</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const raw = payload.find(p => p.dataKey === 'maxWeight');
      const trend = payload.find(p => p.dataKey === 'trend');
      return (
        <div className="glass-elevated p-3 rounded-xl">
          <p className="font-semibold text-xs">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {raw && <p className="text-xs text-ink-muted">{raw.value} {weightUnit}</p>}
          {trend && <p className="text-xs text-teal">Trend: {trend.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
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
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--hue-teal)', strokeWidth: 0 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {hasTrend && (
        <div className="flex items-center gap-5 mt-2 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <div className="w-4 h-px bg-white/20" />
            Raw
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-4 h-px" style={{ borderTop: '2px dashed var(--hue-teal)' }} />
            Trend
          </span>
        </div>
      )}
    </div>
  );
}

export function WeightProgressChart({ data, weightUnit = 'lbs' }) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center glass-inset ">
        <p className="text-muted-2 font-semibold">No weight data available</p>
      </div>
    );
  }

  const sortedData = [...data].sort((a, b) =>
    new Date(a.recorded_date) - new Date(b.recorded_date)
  );

  const trendedData = useMemo(() => calculateEWMA(sortedData, 0.1), [sortedData]);

  const startWeight = sortedData[0]?.weight || 0;
  const currentWeight = sortedData[sortedData.length - 1]?.weight || 0;
  const currentTrend = trendedData.length > 0 ? trendedData[trendedData.length - 1].trendWeight : currentWeight;
  const weightChange = currentWeight - startWeight;
  const percentChange = startWeight > 0 ? ((weightChange / startWeight) * 100).toFixed(1) : 0;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const rawEntry = payload.find(p => p.dataKey === 'weight');
      const trendEntry = payload.find(p => p.dataKey === 'trendWeight');
      return (
        <div className="glass-elevated p-3 rounded-xl">
          <p className="font-semibold text-sm">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {rawEntry && <p className="text-sm text-ink-muted">{rawEntry.value} {weightUnit}</p>}
          {trendEntry && <p className="text-sm font-medium text-violet">Trend: {trendEntry.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass-inset p-4">
          <div className="text-xs text-ink-muted mb-1">Starting</div>
          <div className="text-xl font-bold text-ink">{startWeight} {weightUnit}</div>
        </div>
        <div className="glass-inset p-4">
          <div className="text-xs text-ink-muted mb-1">Current</div>
          <div className="text-xl font-bold text-ink">{currentWeight} {weightUnit}</div>
        </div>
        <div className="glass-inset p-4">
          <div className="text-xs text-ink-muted mb-1">Trend</div>
          <div className="text-xl font-bold text-violet">{currentTrend} {weightUnit}</div>
        </div>
        <div className="glass-inset p-4">
          <div className="text-xs text-ink-muted mb-1">Change</div>
          <div className={`text-xl font-bold ${weightChange > 0 ? 'text-warn' : weightChange < 0 ? 'text-teal' : 'text-ink'}`}>
            {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} {weightUnit}
          </div>
          <div className="text-xs text-ink-muted mt-0.5">{percentChange > 0 ? '+' : ''}{percentChange}%</div>
        </div>
      </div>

      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendedData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.05)" strokeOpacity={1} />
            <XAxis
              dataKey="recorded_date"
              tickFormatter={(date) => format(parseISO(date), 'MMM d')}
              stroke="rgba(255,255,255,0.05)"
              tick={{ fontSize: 11, fill: 'rgba(242,244,247,0.4)', fontFamily: 'Manrope' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.05)"
              tick={{ fontSize: 11, fill: 'rgba(242,244,247,0.4)', fontFamily: 'Manrope' }}
              axisLine={false}
              tickLine={false}
              width={36}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, fill: 'rgba(242,244,247,0.4)', strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="trendWeight"
              stroke="var(--hue-violet)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--hue-violet)', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-px bg-white/20" />
          Raw
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-px bg-violet" style={{ borderTop: '1.5px dashed var(--hue-violet)' }} />
          Trend (EWMA)
        </span>
      </div>
    </div>
  );
}
