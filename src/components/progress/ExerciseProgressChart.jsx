import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

export default function ExerciseProgressChart({ data, exerciseName, weightUnit = 'lbs', className }) {
  if (!data || data.length === 0) {
    return (
      <div className={`w-full ${className || 'h-80'} flex items-center justify-center bg-[#1a1a1a] rounded-[10px] border border-[#2a2a2a]`}>
        <p className="text-[13px] text-[#555555]">No data available for this exercise</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#202020] p-3 rounded-[10px] border border-[#2a2a2a]">
          <p className="font-semibold text-[13px] text-white">{format(parseISO(label), 'MMM d, yyyy')}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-[12px] font-mono text-[#ccff00]">
              {entry.value} {weightUnit}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full ${className || 'h-80'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
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
            stroke="#ccff00"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: '#ccff00', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
