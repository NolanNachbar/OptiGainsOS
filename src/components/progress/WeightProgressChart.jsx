import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { calculateEWMA } from "@/utils/coachingUtils";

export default function WeightProgressChart({ data, weightUnit = 'lbs', className }) {
  const sortedData = [...(data || [])].sort((a, b) =>
    new Date(a.recorded_date) - new Date(b.recorded_date)
  );

  const trendedData = useMemo(() => calculateEWMA(sortedData, 0.1), [sortedData]);

  // De-dupe X-axis ticks: one tick per distinct recorded_date, evenly sampled
  // down to ~6 so dense logs don't stack identical 'MMM d' labels on the axis.
  const xTicks = useMemo(() => {
    const distinct = [...new Set(sortedData.map((d) => d.recorded_date))];
    if (distinct.length <= 6) return distinct;
    const step = (distinct.length - 1) / 5;
    const sampled = Array.from({ length: 6 }, (_, i) => distinct[Math.round(i * step)]);
    return [...new Set(sampled)];
  }, [sortedData]);

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
          {trendEntry && <p className="text-[12px] font-technical font-bold text-ink">Trend: {trendEntry.value} {weightUnit}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      {/* items-stretch lets the three plain stat cards match the Change card's
          height without the old hard-coded &nbsp; spacer rows reclaiming ~16px each. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 items-stretch">
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Starting</div>
          <div className="font-technical text-[18px] font-extrabold text-ink">{startWeight} <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span></div>
          <div className="font-technical text-xs font-semibold text-muted-2 mt-0.5" aria-hidden="true">&nbsp;</div>
        </div>
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Current</div>
          <div className="font-technical text-[18px] font-extrabold text-ink">{currentWeight} <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span></div>
          <div className="font-technical text-xs font-semibold text-muted-2 mt-0.5" aria-hidden="true">&nbsp;</div>
        </div>
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Trend</div>
          <div className="font-technical text-[18px] font-extrabold text-ink">{currentTrend} <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span></div>
        </div>
        <div className="glass-inset p-3">
          <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Change</div>
          <div className="font-technical text-[18px] font-extrabold text-ink flex items-baseline gap-1">
            {weightChange !== 0 && <span className="text-[12px]" aria-hidden="true">{weightChange > 0 ? '▲' : '▼'}</span>}
            <span>{weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)}</span>
            <span className="text-[12px] text-muted-2 font-semibold">{weightUnit}</span>
          </div>
          <div className="font-technical text-[10px] text-muted-2 font-semibold">({percentChange > 0 ? '+' : ''}{percentChange}%)</div>
        </div>
      </div>

      <div className={`w-full ${className || 'h-80'}`}>
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <LineChart data={trendedData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="var(--color-track)" strokeOpacity={1} />
            <XAxis
              dataKey="recorded_date"
              ticks={xTicks}
              tickFormatter={(date) => format(parseISO(date), 'MMM d')}
              stroke="var(--color-track)"
              tick={{ fontSize: 11, fill: 'var(--text-faint)', fontFamily: 'Manrope' }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              stroke="var(--color-track)"
              tick={{ fontSize: 11, fill: 'var(--text-faint)', fontFamily: 'Manrope' }}
              axisLine={false}
              tickLine={false}
              width={36}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-track)', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="var(--text-muted)"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, fill: 'var(--text-muted)', strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="trendWeight"
              stroke="var(--viz-1)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--viz-1)', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-3 text-[9.5px] font-bold text-muted-2">
        <span className="flex items-center gap-1.5">
          <div className="w-3.5 h-[2.5px] rounded-full" style={{ background: 'var(--text-muted)' }} />
          Raw
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3.5 h-px" style={{ borderTop: '2px dashed var(--viz-1)' }} />
          Trend (EWMA)
        </span>
      </div>
    </div>
  );
}
