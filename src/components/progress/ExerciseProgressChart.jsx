import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

export default function ExerciseProgressChart({ data, exerciseName, weightUnit = 'lbs', className }) {
  if (!data || data.length === 0) {
    return (
      <div className={`w-full ${className || 'h-80'} flex items-center justify-center bg-slate-50 rounded-lg`}>
        <p className="text-slate-500">No data available for this exercise</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
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
    <div className={`w-full ${className || 'h-80'}`}>
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
            tickFormatter={(v) => `${v}`}
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
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
