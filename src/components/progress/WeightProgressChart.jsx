import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { calculateEWMA } from "@/utils/coachingUtils";

export default function WeightProgressChart({ data, weightUnit = 'lbs', className }) {
  const sortedData = [...(data || [])].sort((a, b) =>
    new Date(a.recorded_date) - new Date(b.recorded_date)
  );

  const trendedData = useMemo(() => calculateEWMA(sortedData, 0.1), [sortedData]);

  if (!data || data.length === 0) {
    return (
      <div className={`w-full ${className || 'h-80'} flex items-center justify-center glass-inset`}>
        <p className="text-muted-2 font-semibold text-[13px]">No weight data available</p>
      </div>
    );
  }

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
          <p className="font-bold text-[13px] text-ink">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {rawEntry && <p className="text-[12px] text-muted-2 font-technical font-semibold">{rawEntry.value} {weightUnit}</p>}
          {trendEntry && <p className="text-[12px] font-technical font-bold text-violet">Trend: {trendEntry.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Starting</div>
          <div className="font-technical text-[18px] font-extrabold text-ink">{startWeight} <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span></div>
        </div>
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Current</div>
          <div className="font-technical text-[18px] font-extrabold text-ink">{currentWeight} <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span></div>
        </div>
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Trend</div>
          <div className="font-technical text-[18px] font-extrabold text-violet">{currentTrend} <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span></div>
        </div>
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Change</div>
          <div className={`font-technical text-[18px] font-extrabold ${weightChange > 0 ? 'text-warn' : weightChange < 0 ? 'text-teal' : 'text-ink'}`}>
            {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span>
          </div>
          <div className="font-technical text-xs font-semibold text-muted-2 mt-0.5">{percentChange > 0 ? '+' : ''}{percentChange}%</div>
        </div>
      </div>

      <div className={`w-full ${className || 'h-80'}`}>
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
              stroke="rgba(242,244,247,0.18)"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, fill: 'rgba(242,244,247,0.4)', strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="trendWeight"
              stroke="var(--hue-violet)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--hue-violet)', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-3 text-[9.5px] font-bold text-muted-2">
        <span className="flex items-center gap-1.5">
          <div className="w-3.5 h-[2.5px] rounded-full bg-white/20" />
          Raw
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3.5 h-px" style={{ borderTop: '2px dashed var(--hue-violet)' }} />
          Trend (EWMA)
        </span>
      </div>
    </div>
  );
}
