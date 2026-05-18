import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { calculateEWMA } from "@/utils/coachingUtils";

export default function WeightProgressChart({ data, weightUnit = 'lbs', className }) {
  if (!data || data.length === 0) {
    return (
      <div className={`w-full ${className || 'h-80'} flex items-center justify-center bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]`}>
        <p className="text-[#555555] text-[13px]">No weight data available</p>
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
        <div className="bg-[#202020] p-3 rounded-xl border border-[#2a2a2a]">
          <p className="font-semibold text-[13px] text-white">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {rawEntry && <p className="text-[12px] text-[#a0a0a0] font-mono">{rawEntry.value} {weightUnit}</p>}
          {trendEntry && <p className="text-[12px] font-mono text-[#ccff00]">Trend: {trendEntry.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
          <div className="text-xs text-[#555555] uppercase tracking-wide mb-1">Starting</div>
          <div className="text-[18px] font-bold font-mono text-white">{startWeight} <span className="text-[12px] text-[#555555] font-sans font-normal">{weightUnit}</span></div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
          <div className="text-xs text-[#555555] uppercase tracking-wide mb-1">Current</div>
          <div className="text-[18px] font-bold font-mono text-white">{currentWeight} <span className="text-[12px] text-[#555555] font-sans font-normal">{weightUnit}</span></div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
          <div className="text-xs text-[#555555] uppercase tracking-wide mb-1">Trend</div>
          <div className="text-[18px] font-bold font-mono text-[#ccff00]">{currentTrend} <span className="text-[12px] text-[#555555] font-sans font-normal">{weightUnit}</span></div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
          <div className="text-xs text-[#555555] uppercase tracking-wide mb-1">Change</div>
          <div className={`text-[18px] font-bold font-mono ${weightChange > 0 ? 'text-[#fbbf24]' : weightChange < 0 ? 'text-[#4ade80]' : 'text-white'}`}>
            {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} <span className="text-[12px] text-[#555555] font-sans font-normal">{weightUnit}</span>
          </div>
          <div className="text-xs text-[#555555] font-mono mt-0.5">{percentChange > 0 ? '+' : ''}{percentChange}%</div>
        </div>
      </div>

      <div className={`w-full ${className || 'h-80'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendedData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="#2a2a2a" strokeOpacity={1} />
            <XAxis
              dataKey="recorded_date"
              tickFormatter={(date) => format(parseISO(date), 'MMM d')}
              stroke="#333333"
              tick={{ fontSize: 11, fill: '#555555', fontFamily: 'IBM Plex Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="#333333"
              tick={{ fontSize: 11, fill: '#555555', fontFamily: 'IBM Plex Mono' }}
              axisLine={false}
              tickLine={false}
              width={36}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2a2a2a', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#333333"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, fill: '#555555', strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="trendWeight"
              stroke="#ccff00"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: '#ccff00', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-[#555555] font-mono">
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-px bg-[#333333]" />
          Raw
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-px" style={{ borderTop: '1.5px dashed #ccff00' }} />
          Trend (EWMA)
        </span>
      </div>
    </div>
  );
}
