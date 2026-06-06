import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRecoveryMetrics } from "@/hooks/useUserQueries";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import { calculateReadinessScore, getReadinessCategory, calculateACWR } from "@/utils/recoveryUtils";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Activity, Moon, Zap, Brain, 
  TrendingUp, TrendingDown, Info, Calendar
} from "lucide-react";
import { format, parseISO } from "date-fns";

export default function RecoveryDetail() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { recoveryMetrics, isLoading } = useRecoveryMetrics(60); // Get 60 days for chronic load

  const chartData = useMemo(() => {
    return [...recoveryMetrics].reverse().map(m => ({
      ...m,
      formattedDate: format(parseISO(m.date), "MMM d"),
      displayHrv: m.hrv || m.ah_hrv,
      displaySteps: m.steps || m.ah_steps,
      displaySleep: (m.sleep_duration_min || m.ah_sleep_min || 0) / 60,
    }));
  }, [recoveryMetrics]);

  const latest = recoveryMetrics[0];

  // Prefer the engine's integrated-TSS ACWR (training_prescription) over the
  // local steps-only proxy — single source of truth.
  const { prescription } = useTodayPrescription();
  const acwr = useMemo(() => {
    const engineAcwr = prescription?.acwr;
    return engineAcwr != null ? Number(Number(engineAcwr).toFixed(2)) : calculateACWR(recoveryMetrics);
  }, [prescription, recoveryMetrics]);
  const acwrSource = prescription?.acwr != null ? "engine load model" : "step proxy";

  const score = useMemo(() => calculateReadinessScore(latest, null), [latest]);
  const category = getReadinessCategory(score);

  // Which series actually have data — used to collapse empty chart shells
  // instead of reserving ~250px of void per chart.
  const hasHrv = chartData.some((d) => d.displayHrv != null);
  const hasSteps = chartData.some((d) => d.displaySteps != null);
  const hasSleep = chartData.some((d) => d.displaySleep > 0);

  if (isLoading) return <div className="p-8 text-white">Loading recovery data...</div>;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 min-h-screen text-white">
      <div className="max-w-6xl mx-auto">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)} 
          className="mb-6 -ml-2 text-[#a0a0a0] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Recovery & Readiness</h1>
          <p className="text-[#a0a0a0]">Biological data flow and training load analysis.</p>
        </header>

        {/* Readiness Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="md:col-span-1 glass-interactive">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider">Today's Readiness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center py-4">
                <div className="text-6xl font-bold text-white mb-2">{score ?? "—"}</div>
                <Badge className={`${category.bg} ${category.color} text-sm px-4 py-1 rounded-full mb-4`}>
                  {category.label}
                </Badge>
                <div className="grid grid-cols-2 gap-4 w-full border-t border-[#2a2a2a] pt-4 mt-2">
                  <div className="text-center">
                    <div className="text-[10px] text-[#555555] uppercase font-bold mb-1">Body Battery</div>
                    <div className="text-xl font-semibold">{latest?.body_battery ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-[#555555] uppercase font-bold mb-1">Sleep Score</div>
                    <div className="text-xl font-semibold">{latest?.sleep_score ?? "—"}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 glass-interactive">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider">Training Load (ACWR)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 py-2">
                <div className="text-center">
                  <div className="text-4xl font-bold text-white mb-1">{acwr ?? "—"}</div>
                  <div className="text-[10px] text-[#555555] uppercase font-bold">Current Ratio</div>
                  <div className="text-[9px] text-slate-600 mt-0.5">{acwrSource}</div>
                </div>
                <div className="flex-1">
                  <div className="h-2 w-full bg-[#2a2a2a] rounded-full relative mb-2">
                    <div 
                      className={`absolute top-0 h-full rounded-full transition-all duration-1000 ${
                        acwr >= 0.8 && acwr <= 1.3 ? 'bg-brand' : 'bg-red-500'
                      }`}
                      style={{ left: '0%', width: `${Math.min(100, (acwr / 2) * 100)}%` }}
                    />
                    {/* Optimal Zone marker */}
                    <div className="absolute top-0 left-[40%] w-[25%] h-full bg-brand/20 border-x border-brand/30" />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#555555] font-bold">
                    <span>LOW</span>
                    <span className="text-brand">OPTIMAL (0.8 - 1.3)</span>
                    <span>OVERLOAD</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[#555555] mt-4 leading-relaxed">
                Acute:Chronic Workload Ratio compares your last 7 days of activity to your 28-day average. 
                Staying in the optimal zone minimizes injury risk while maximizing fitness gains.
              </p>
            </CardContent>
          </Card>
        </div>

        {(!hasHrv && !hasSteps && !hasSleep) ? (
          <Card className="mb-8 glass">
            <CardContent className="py-6 flex items-center gap-3">
              <Info className="w-5 h-5 text-slate-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">No biometric trends yet</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect your wearable to populate HRV, step, and sleep charts.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
        <>
        {/* HRV Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="glass-interactive">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider">HRV Trend (ms)</CardTitle>
              <Activity className="w-4 h-4 text-brand" />
            </CardHeader>
            <CardContent className={hasHrv ? "h-[250px] pt-4" : "py-5"}>
              {!hasHrv ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Info className="w-4 h-4 shrink-0" /> No HRV data yet — sync your wearable.
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis 
                    dataKey="formattedDate" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#555', fontSize: 10 }} 
                  />
                  <YAxis 
                    hide 
                    domain={['dataMin - 10', 'dataMax + 10']}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="displayHrv" 
                    stroke="var(--color-brand)" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: 'var(--color-brand)', strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass-interactive">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider">Step Count</CardTitle>
              <Zap className="w-4 h-4 text-brand" />
            </CardHeader>
            <CardContent className="h-[250px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis 
                    dataKey="formattedDate" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#555', fontSize: 10 }} 
                  />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: '#222' }}
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  />
                  <Bar dataKey="displaySteps" radius={[4, 4, 0, 0]}>
                    {chartData.slice(-14).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.displaySteps >= 10000 ? 'var(--color-brand)' : '#333'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Sleep Detail */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <Card className="glass-interactive">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider">Sleep Duration (Hours)</CardTitle>
              <Moon className="w-4 h-4 text-indigo-400" />
            </CardHeader>
            <CardContent className="h-[250px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis 
                    dataKey="formattedDate" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#555', fontSize: 10 }} 
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#555', fontSize: 10 }}
                    domain={[0, 12]}
                  />
                  <Tooltip 
                    cursor={{ fill: '#222' }}
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  />
                  <ReferenceLine y={7.5} stroke="#555" strokeDasharray="3 3" label={{ position: 'right', value: 'Goal', fill: '#555', fontSize: 10 }} />
                  <Bar dataKey="displaySleep" radius={[4, 4, 0, 0]}>
                    {chartData.slice(-14).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.displaySleep >= 7.5 ? '#818cf8' : '#4f46e5'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        </>
        )}

        {/* Endurance TSS — only rendered once the pipeline actually populates
            tss_run/tss_cycling/tss_swim. Previously this showed a permanent
            row of zeros because garmin-sync never writes these fields. */}
        {['swim', 'cycling', 'run'].some((s) => Number(latest?.[`tss_${s}`]) > 0) && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand" />
              Endurance Stress (TSS)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              {['Swim', 'Cycling', 'Run'].map(sport => {
                const field = `tss_${sport.toLowerCase()}`;
                const val = latest?.[field] ?? 0;
                return (
                  <Card key={sport} className="glass-interactive p-4">
                    <div className="text-[10px] text-[#555555] uppercase font-bold mb-1">{sport}</div>
                    <div className="text-2xl font-bold">{val}</div>
                    <div className="text-[10px] text-[#555555] mt-1">Today's Load</div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
