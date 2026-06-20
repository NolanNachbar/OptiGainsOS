import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { getTodayString } from "@/utils/dateUtils";
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
  Activity, Moon, Zap,
  Info, Calendar
} from "lucide-react";
import { format, parseISO } from "date-fns";

// One shared tick/label style for every recharts axis, tooltip, and reference
// label so numerals stay Manrope + tabular and the framing reads identically
// across the HRV / Steps / Sleep tabs.
const CHART_TICK = {
  fill: 'var(--text-muted)',
  fontSize: 10,
  fontFamily: 'Manrope',
  fontVariantNumeric: 'tabular-nums',
};
const CHART_TOOLTIP_CONTENT = {
  backgroundColor: 'var(--color-elevated)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 12,
  fontFamily: 'Manrope',
  fontVariantNumeric: 'tabular-nums',
};
const CHART_TOOLTIP_ITEM = {
  color: 'var(--text-primary)',
  fontVariantNumeric: 'tabular-nums',
};
// One height for every chart-tab body — plotted OR empty — so the card holds a
// fixed footprint and never jumps when you switch HRV / Steps / Sleep tabs.
const CHART_BODY_H = "h-[170px]";

export default function RecoveryDetail() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { recoveryMetrics, isLoading, error } = useRecoveryMetrics(60); // Get 60 days for chronic load

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

  // ACWR is a biometric, so the physiological spectrum is the correct hue here:
  // ok in the 0.8–1.3 lowest-risk zone, warn while elevated (1.3–1.5), bad once
  // it crosses the 1.5 overtraining ceiling. Drives both the number and the
  // gauge pin so color stays a single source of truth.
  const acwrSpectrum =
    acwr == null ? null
    : acwr > 1.5 ? "bad"
    : acwr > 1.3 ? "warn"
    : "ok";
  const acwrColor =
    acwrSpectrum == null ? "text-ink-muted"
    : acwrSpectrum === "bad" ? "text-bad"
    : acwrSpectrum === "warn" ? "text-warn"
    : "text-ok";
  const acwrPinVar =
    acwrSpectrum == null ? "var(--text-faint)"
    : acwrSpectrum === "bad" ? "var(--bad)"
    : acwrSpectrum === "warn" ? "var(--warn)"
    : "var(--ok)";

  // Prefer the engine's readiness score (athlete_state.recovery.score) so this
  // page matches AthleteState; fall back to the local formula only when the
  // engine hasn't computed today's state yet.
  const today = getTodayString();
  const { data: athleteState, isError: athleteStateError } = useQuery({
    queryKey: ["athlete-state", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_state")
        .select("*")
        .eq("created_by", user.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const score = useMemo(() => {
    const engineScore = athleteState?.recovery?.score;
    return engineScore != null ? engineScore : calculateReadinessScore(latest, null);
  }, [athleteState, latest]);
  const category = getReadinessCategory(score);
  // Keep readiness in its owned hue (teal) for the healthy tiers so it doesn't
  // collide with body-battery green; only degrade to warn/bad on low scores.
  const readinessColor =
    score == null ? "text-ink-muted"
    : score >= 70 ? "text-teal"
    : score >= 50 ? "text-warn"
    : "text-bad";
  const readinessBg =
    score == null ? "bg-track"
    : score >= 70 ? "bg-teal/10"
    : score >= 50 ? "bg-warn/10"
    : "bg-bad/10";

  // Which series actually have data — used to collapse empty chart shells
  // instead of reserving ~250px of void per chart.
  const hasHrv = chartData.some((d) => d.displayHrv != null);
  const hasSteps = chartData.some((d) => d.displaySteps != null);
  const hasSleep = chartData.some((d) => d.displaySleep > 0);

  // One chart at a time inside a sub-tab strip to keep the page short.
  const chartTabs = [
    { id: "hrv", label: "HRV", icon: Activity },
    { id: "steps", label: "Steps", icon: Zap },
    { id: "sleep", label: "Sleep", icon: Moon },
  ];
  const firstWithData = hasHrv ? "hrv" : hasSteps ? "steps" : "sleep";
  // `activeChart` is null until the user explicitly picks a tab. While it's
  // null we follow firstWithData, so once metrics finish loading the card lands
  // on the first tab that actually has data (HRV) instead of being frozen on
  // whatever firstWithData resolved to during the empty initial render.
  const [activeChart, setActiveChart] = useState(null);
  const hasData = { hrv: hasHrv, steps: hasSteps, sleep: hasSleep };
  const resolvedChart =
    activeChart && hasData[activeChart] ? activeChart : firstWithData;

  if (isLoading) return (
    <div className="p-4 space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 rounded-xl pulse-loop bg-track" />
      ))}
    </div>
  );

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 min-h-screen text-ink">
      <div className="max-w-4xl xl:max-w-5xl mx-auto">
        {/* Readiness Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Card className="md:col-span-1 glass-interactive">
            <CardHeader className="pb-1 md:pb-2">
              <CardTitle className="section-label">Today's Readiness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center py-1 md:py-3">
                <div className={`hero-metric ${readinessColor} text-6xl mb-2`}>{score ?? "—"}</div>
                <Badge className={`${readinessBg} ${readinessColor} text-sm px-4 py-1 rounded-full mb-3 md:mb-4`}>
                  {category.label}
                </Badge>
                {athleteStateError && (
                  <p className="text-xs text-warn mb-2">Recovery scores estimated (engine unavailable)</p>
                )}
                <div className="grid grid-cols-2 gap-4 w-full border-t hairline pt-3 md:pt-4 mt-1 md:mt-2">
                  <div className="text-center">
                    <div className="section-label mb-1 flex items-center justify-center gap-1.5">
                      <i className="w-[5px] h-[5px] rounded-full bg-leaf" /> Body Battery
                    </div>
                    <div className="font-technical text-xl text-ink">{latest?.body_battery ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="section-label mb-1 flex items-center justify-center gap-1.5">
                      <i className="w-[5px] h-[5px] rounded-full bg-violet" /> Sleep Score
                    </div>
                    <div className="font-technical text-xl text-ink">{latest?.sleep_score ?? "—"}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 glass-interactive">
            <CardHeader className="pb-1 md:pb-2">
              <CardTitle className="section-label">Training Load (ACWR)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center md:flex-row md:items-center gap-3 md:gap-6 py-0.5 md:py-2">
                <div className="text-center">
                  {/* Readiness is the single page hero (hero-metric text-6xl), so
                      ACWR drops hero-metric on mobile and reads as a font-technical
                      stat (text-3xl); only at md+ does it scale back up. Color is
                      the physiological spectrum since ACWR is a biometric. */}
                  <div className={`font-technical text-3xl font-bold md:text-5xl md:font-extrabold tabular-nums ${acwrColor} mb-1`}>{acwr != null ? acwr.toFixed(2) : "—"}</div>
                  <div className="section-label">Current Ratio</div>
                </div>
                <div className="w-full md:flex-1">
                  {/* ACWR band gauge — neutral track, the 0.8–1.3 lowest-risk
                      zone is a filled ink reference region. The pin is the datum,
                      so it carries the physiological spectrum (ok/warn/bad) — ACWR
                      is a biometric, matching the number's color and the row below. */}
                  <div className="relative h-[10px] rounded-full bg-track">
                    <span
                      className="absolute inset-y-0 rounded-sm bg-ink/[0.10]"
                      style={{ left: `${((0.8 - 0.5) / 1.1) * 100}%`, width: `${((1.3 - 0.8) / 1.1) * 100}%` }}
                    />
                    {acwr != null && (
                      <span
                        className="absolute -top-[5px] w-[6px] h-[20px] rounded-full transition-[left] duration-300 ease-[var(--ease)]"
                        style={{
                          left: `calc(${Math.max(0, Math.min(100, ((acwr - 0.5) / 1.1) * 100))}% - 3px)`,
                          backgroundColor: acwrPinVar,
                          boxShadow: "0 0 0 2px var(--color-elevated), 0 0 0 3px var(--color-border)",
                        }}
                      />
                    )}
                  </div>
                  <div className="relative h-[12px] mt-2 font-technical text-xs font-bold text-ink-faint">
                    <span className="absolute left-0">0.5</span>
                    <span className="absolute -translate-x-1/2" style={{ left: `${((0.8 - 0.5) / 1.1) * 100}%` }}>0.8</span>
                    <span className="absolute -translate-x-1/2" style={{ left: `${((1.3 - 0.5) / 1.1) * 100}%` }}>1.3</span>
                    <span className="absolute right-0">1.6</span>
                  </div>
                </div>
              </div>
              <p
                className="text-xs text-ink-muted mt-3 leading-relaxed"
                title={`Source: ${acwrSource}`}
              >
                7-day load vs your 28-day average; the shaded zone is lowest-risk.
              </p>
              {acwr != null && acwr > 1.3 && (
                <div
                  className={`mt-2 px-3 py-2 rounded-lg text-xs ${
                    acwrSpectrum === "bad"
                      ? "bg-bad/10 border border-bad/20 text-bad"
                      : "bg-warn/10 border border-warn/20 text-warn"
                  }`}
                >
                  {acwrSpectrum === "bad"
                    ? `High ACWR (${acwr.toFixed(2)}) — overtraining risk. Reduce volume.`
                    : `Elevated ACWR (${acwr.toFixed(2)}) — load climbing above the lowest-risk zone.`}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {error ? (
          <Card className="mb-6 glass">
            <CardContent className="pb-6">
              <div className="pt-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-warn shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-ink">Couldn't load recovery data</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Check your connection and try again.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="shrink-0 text-ink-muted hover:text-ink"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["recoveryMetrics"] })}
                >
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (!hasHrv && !hasSteps && !hasSleep) ? (
          <Card className="mb-6 glass">
            <CardContent className="pb-6">
              <div className="pt-6 flex items-center gap-3">
                <Info className="w-5 h-5 text-ink-muted shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink">No biometric trends yet</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Connect your wearable to populate HRV, step, and sleep charts.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
        <div className="mb-6">
          <Card className="glass-interactive overflow-hidden">
            {/* In-card segmented control, deliberately NOT the coral SubTabs
                pill. Coral-pill is reserved for top-level section navigation;
                this is a lighter neutral-track segmented control so the chart
                toggle reads as an in-card filter, not a destination. */}
            <div className="px-3 pt-3">
              <div
                role="tablist"
                aria-label="Biometric trend"
                className="inline-flex w-full gap-1 rounded-full bg-track p-1"
              >
                {chartTabs.map(({ id, label, icon: Icon }) => {
                  const isActive = resolvedChart === id;
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveChart(id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 h-9 rounded-full text-[11px] font-bold uppercase tracking-[0.06em] transition-colors duration-200 [transition-timing-function:var(--ease)] ${
                        isActive
                          ? "bg-elevated text-ink shadow-[inset_0_1px_0_var(--glass-specular)]"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {Icon && <Icon className="hidden sm:block w-3.5 h-3.5 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* HRV Trend */}
            {resolvedChart === "hrv" && (
              <CardContent className={`${CHART_BODY_H} pt-4`}>
                {!hasHrv ? (
                  <div className="flex h-full items-center gap-2 text-xs font-semibold text-ink-muted">
                    <Info className="w-4 h-4 shrink-0" /> No HRV data yet. Sync your wearable.
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.slice(-14)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" vertical={false} />
                    <XAxis
                      dataKey="formattedDate"
                      axisLine={false}
                      tickLine={false}
                      tick={CHART_TICK}
                    />
                    <YAxis
                      hide
                      domain={['dataMin - 10', 'dataMax + 10']}
                    />
                    <Tooltip
                      formatter={(v) => [`${Math.round(v)} ms`, 'HRV']}
                      contentStyle={CHART_TOOLTIP_CONTENT}
                      itemStyle={CHART_TOOLTIP_ITEM}
                    />
                    <Line
                      type="monotone"
                      dataKey="displayHrv"
                      stroke="var(--hue-teal-2)"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: 'var(--hue-teal-2)', strokeWidth: 0 }}
                      activeDot={{ r: 5.5, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </CardContent>
            )}

            {/* Step Count */}
            {resolvedChart === "steps" && (
              <CardContent className={`${CHART_BODY_H} pt-4`}>
                {!hasSteps ? (
                  <div className="flex h-full items-center gap-2 text-xs font-semibold text-ink-muted">
                    <Info className="w-4 h-4 shrink-0" /> No step data yet. Sync your wearable.
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.slice(-14)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" vertical={false} />
                    <XAxis
                      dataKey="formattedDate"
                      axisLine={false}
                      tickLine={false}
                      tick={CHART_TICK}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'var(--color-border-soft)' }}
                      formatter={(v) => [`${Math.round(v).toLocaleString()}`, 'Steps']}
                      contentStyle={CHART_TOOLTIP_CONTENT}
                      itemStyle={CHART_TOOLTIP_ITEM}
                    />
                    <Bar dataKey="displaySteps" radius={[4, 4, 0, 0]}>
                      {chartData.slice(-14).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.displaySteps >= 10000 ? 'var(--hue-green)' : 'rgba(var(--hue-green-rgb) / 0.30)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </CardContent>
            )}

            {/* Sleep Duration */}
            {resolvedChart === "sleep" && (
              <CardContent className={`${CHART_BODY_H} pt-4`}>
                {!hasSleep ? (
                  <div className="flex h-full items-center gap-2 text-xs font-semibold text-ink-muted">
                    <Info className="w-4 h-4 shrink-0" /> No sleep duration data yet. Sync your wearable to chart nightly hours.
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.slice(-14)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" vertical={false} />
                    <XAxis
                      dataKey="formattedDate"
                      axisLine={false}
                      tickLine={false}
                      tick={CHART_TICK}
                    />
                    {/* Hidden Y everywhere (same framing as HRV/Steps) so the
                        plot doesn't jump on tab switch; the Goal line stays as
                        the single in-plot reference. */}
                    <YAxis hide domain={[0, 12]} />
                    <Tooltip
                      cursor={{ fill: 'var(--color-border-soft)' }}
                      formatter={(v) => [`${v.toFixed(1)} h`, 'Sleep']}
                      contentStyle={CHART_TOOLTIP_CONTENT}
                      itemStyle={CHART_TOOLTIP_ITEM}
                    />
                    <ReferenceLine y={7.5} stroke="var(--text-faint)" strokeDasharray="3 3" label={{ position: 'right', value: 'Goal', ...CHART_TICK }} />
                    <Bar dataKey="displaySleep" radius={[4, 4, 0, 0]}>
                      {chartData.slice(-14).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.displaySleep >= 7.5 ? 'var(--hue-violet)' : 'rgba(var(--hue-violet-rgb) / 0.30)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </CardContent>
            )}
          </Card>
        </div>
        )}

        {/* Endurance TSS — only rendered once the pipeline actually populates
            tss_run/tss_cycling/tss_swim. Previously this showed a permanent
            row of zeros because garmin-sync never writes these fields. */}
        {['swim', 'cycling', 'run'].some((s) => Number(latest?.[`tss_${s}`]) > 0) && (
          <Card className="mb-6 glass">
            <CardHeader className="pb-1 md:pb-2">
              <CardTitle className="section-label flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-carb" />
                Endurance Stress (TSS)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center">
                {['Swim', 'Cycling', 'Run'].map(sport => {
                  const field = `tss_${sport.toLowerCase()}`;
                  const val = latest?.[field] ?? 0;
                  return (
                    <div key={sport} className="flex flex-col items-center">
                      <div className="section-label mb-1 flex items-center justify-center gap-1.5">
                        <i className="w-[5px] h-[5px] rounded-full shrink-0 bg-carb" />
                        {sport}
                      </div>
                      <div className="font-technical text-2xl font-extrabold text-ink">{val}</div>
                      <div className="section-label mt-1">Today's Load</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
