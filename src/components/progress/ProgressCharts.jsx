import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { calculateEWMA } from "@/utils/coachingUtils";

export function ExerciseProgressChart({ data, exerciseName, weightUnit = 'lbs' }) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-[#1a1a1a] rounded-lg">
        <p className="text-[#555555]">No data available for this exercise</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#2a2a2a]">
          <p className="font-semibold text-sm">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.value} {weightUnit}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="0" stroke="#e5e5ea" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => format(parseISO(date), 'MMM d')}
            stroke="#94a3b8"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e5ea', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="maxWeight"
            stroke="#5d3cc7"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: '#5d3cc7', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeightProgressChart({ data, weightUnit = 'lbs' }) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-[#1a1a1a] rounded-lg ">
        <p className="text-[#555555]">No weight data available</p>
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
        <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#2a2a2a]">
          <p className="font-semibold text-sm">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {rawEntry && <p className="text-sm text-[#555555]">{rawEntry.value} {weightUnit}</p>}
          {trendEntry && <p className="text-sm font-medium text-[#5d3cc7]">Trend: {trendEntry.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[#1a1a1a] rounded-lg p-4">
          <div className="text-xs text-[#555555] mb-1">Starting</div>
          <div className="text-xl font-bold text-white">{startWeight} {weightUnit}</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-4">
          <div className="text-xs text-[#555555] mb-1">Current</div>
          <div className="text-xl font-bold text-white">{currentWeight} {weightUnit}</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-4">
          <div className="text-xs text-[#555555] mb-1">Trend</div>
          <div className="text-xl font-bold text-[#5d3cc7]">{currentTrend} {weightUnit}</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-4">
          <div className="text-xs text-[#555555] mb-1">Change</div>
          <div className={`text-xl font-bold ${weightChange > 0 ? 'text-[#fbbf24]' : weightChange < 0 ? 'text-[#4ade80]' : 'text-white'}`}>
            {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} {weightUnit}
          </div>
          <div className="text-xs text-[#555555] mt-0.5">{percentChange > 0 ? '+' : ''}{percentChange}%</div>
        </div>
      </div>

      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendedData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="#e5e5ea" strokeOpacity={0.5} />
            <XAxis
              dataKey="recorded_date"
              tickFormatter={(date) => format(parseISO(date), 'MMM d')}
              stroke="#94a3b8"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={36}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e5ea', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#94a3b8"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, fill: '#94a3b8', strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="trendWeight"
              stroke="#5d3cc7"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: '#5d3cc7', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-[#555555]">
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-px bg-[#333333]" />
          Raw
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-px bg-[#5d3cc7]" style={{ borderTop: '1.5px dashed #5d3cc7' }} />
          Trend (EWMA)
        </span>
      </div>
    </div>
  );
}
