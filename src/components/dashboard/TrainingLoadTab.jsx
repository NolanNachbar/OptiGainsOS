import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Lock, TrendingUp, BarChart3 } from "lucide-react";
import { getWeeklyTSSData, getCTLData, hasSufficientLoadData, getMaxHR } from "@/utils/trainingLoad";

function WeeklyTSSBars({ data }) {
  const maxTSS = Math.max(...data.map((d) => d.tss), 10);
  const W = 500, H = 170;
  const padL = 35, padR = 10, padT = 22, padB = 38;
  const chartH = H - padT - padB;
  const chartW = W - padL - padR;
  const barW = (chartW / data.length) * 0.6;
  const gap = chartW / data.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 0.5, 1].map((frac) => {
        const y = padT + chartH - chartH * frac;
        return (
          <g key={frac}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-faint)" className="font-mono">
              {Math.round(maxTSS * frac)}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const barH = Math.max((d.tss / maxTSS) * chartH, d.tss > 0 ? 2 : 0);
        const x = padL + i * gap + (gap - barW) / 2;
        const y = padT + chartH - barH;
        const isCurrent = i === data.length - 1;
        const labelY = y - 4;

        return (
          <g key={d.weekStart}>
            {d.tss > 0 && (
              <rect
                x={x} y={y} width={barW} height={barH} rx="3"
                fill={isCurrent ? "var(--hue-teal)" : "rgba(94, 220, 210, 0.40)"}
              />
            )}
            {d.tss > 5 && (
              <text
                x={x + barW / 2} y={labelY}
                textAnchor="middle" fontSize="9"
                fill={isCurrent ? "var(--hue-teal)" : "rgba(94, 220, 210, 0.70)"}
                fontWeight="700" className="font-mono"
              >
                {d.tss}
              </text>
            )}
            <text x={x + barW / 2} y={H - padB + 14} textAnchor="middle" fontSize="8.5" fill="var(--text-faint)" className="font-medium">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CTLLineChart({ data }) {
  if (data.length < 2) return null;

  const allVals = data.flatMap((d) => [d.ctl, d.atl, d.tsb]);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const range = rawMax - rawMin || 10;
  const minVal = rawMin - range * 0.1;
  const maxVal = rawMax + range * 0.1;

  const W = 500, H = 180;
  const padL = 35, padR = 10, padT = 14, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const toX = (i) => padL + (i / (data.length - 1)) * chartW;
  const toY = (val) => padT + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
  const line = (key) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(" ");

  const gridVals = [minVal, (minVal + maxVal) / 2, maxVal];
  const zeroY = toY(0);
  const labelIdxs = data.reduce((a, _, i) => {
    const prev = a[a.length - 1] ?? -99;
    const isRegular = i === 0 || i % 14 === 0;
    const isLast = i === data.length - 1 && i - prev >= 7;
    if (isRegular || isLast) a.push(i);
    return a;
  }, []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {gridVals.map((val, i) => {
        const y = toY(val);
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-faint)" className="font-mono">
              {Math.round(val)}
            </text>
          </g>
        );
      })}

      {zeroY > padT && zeroY < padT + chartH && (
        <line
          x1={padL} x2={W - padR} y1={zeroY} y2={zeroY}
          stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" strokeDasharray="4,3"
        />
      )}

      {/* CTL teal solid with subtle fill; ATL violet dashed (the locked chart language) */}
      <path
        d={`${line("ctl")} L${toX(data.length - 1).toFixed(1)},${(padT + chartH).toFixed(1)} L${padL},${(padT + chartH).toFixed(1)} Z`}
        fill="var(--hue-teal)" opacity="0.10" stroke="none"
      />
      <path d={line("atl")} fill="none" stroke="var(--hue-violet)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="3,4" />
      <path d={line("ctl")} fill="none" stroke="var(--hue-teal)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line("tsb")} fill="none" stroke="var(--viz-5)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5,3" />

      {labelIdxs.map((i) => (
        <text key={i} x={toX(i)} y={H - padB + 16} textAnchor="middle" fontSize="8.5" fill="var(--text-faint)" className="font-medium">
          {format(parseISO(data[i].date), "MMM d")}
        </text>
      ))}
    </svg>
  );
}

function TSBStatusBadge({ tsb }) {
  if (tsb > 10) return <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-ok/10 text-ok border-[0.5px] border-ok/20">Fresh, ready to peak</span>;
  if (tsb >= 0) return <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-info/10 text-info border-[0.5px] border-info/20">Balanced, good training state</span>;
  if (tsb >= -15) return <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-warn/10 text-warn border-[0.5px] border-warn/20">Fatigued, normal heavy block</span>;
  return <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-bad/10 text-bad border-[0.5px] border-bad/20">Deep fatigue, consider a deload</span>;
}

export default function TrainingLoadTab({ cardioSessions, workoutLogs, profile, banister }) {
  const maxHR = getMaxHR(profile);

  const weeklyData = useMemo(
    () => getWeeklyTSSData(cardioSessions, workoutLogs, maxHR, 10),
    [cardioSessions, workoutLogs, maxHR]
  );

  const sufficient = useMemo(
    () => hasSufficientLoadData(cardioSessions, workoutLogs, 28),
    [cardioSessions, workoutLogs]
  );

  const ctlData = useMemo(
    () => (sufficient ? getCTLData(cardioSessions, workoutLogs, maxHR, 60) : []),
    [sufficient, cardioSessions, workoutLogs, maxHR]
  );

  const hasAnyLoad = weeklyData.some((d) => d.tss > 0);
  const current = ctlData[ctlData.length - 1];

  return (
    <div className="space-y-4">
      {/* Weekly TSS */}
      <div className="glass-inset p-4">
        <div className="mb-2">
          <h3 className="text-sm font-extrabold text-ink flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal" />
            Weekly Training Load (TSS)
          </h3>
          <p className="text-xs font-semibold text-muted-2 mt-1 leading-relaxed">
            TSS (Training Stress Score) measures how hard you worked each week, combining workout duration and intensity.
            Higher bars = more total training stress that week.
          </p>
        </div>
        <div className="pb-2 pt-2">
          {hasAnyLoad ? (
            <WeeklyTSSBars data={weeklyData} />
          ) : (
            <div className="text-center py-8 text-sm text-ink-faint font-medium">
              Log workouts with RIR or sync a Garmin run to see training load
            </div>
          )}
        </div>
      </div>

      {/* CTL / ATL / TSB */}
      <div className="glass-inset p-4">
        <div className="mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-ink flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal" />
              Fitness · Fatigue · Form
            </h3>
            {sufficient && current && (
              <div className="flex items-center gap-3 font-technical text-xs font-bold">
                <span className="flex items-center gap-1.5 text-teal">
                  <span className="w-2 h-2 rounded-full bg-teal inline-block" />
                  CTL {current.ctl}
                </span>
                <span className="flex items-center gap-1.5 text-violet">
                  <span className="w-2 h-2 rounded-full bg-violet inline-block" />
                  ATL {current.atl}
                </span>
                <span className={`flex items-center gap-1.5 ${current.tsb >= 0 ? "text-ok" : "text-bad"}`}>
                  <span className={`w-2 h-2 rounded-full inline-block ${current.tsb >= 0 ? "bg-ok" : "bg-bad"}`} />
                  TSB {current.tsb >= 0 ? "+" : ""}{current.tsb}
                </span>
              </div>
            )}
          </div>
          {sufficient && current ? (
            <div className="flex items-center gap-2 mt-2">
              <TSBStatusBadge tsb={current.tsb} />
            </div>
          ) : (
            <p className="text-xs font-semibold text-muted-2 mt-1 leading-relaxed">
              Tracks your long-term fitness buildup, short-term fatigue, and whether you're ready to train hard or need recovery.
            </p>
          )}
        </div>
        <div className="pb-2 pt-2">
          {!sufficient ? (
            banister ? (
              /* Engine-computed Banister estimate — available before the local
                 28-day TSS history exists. Different units than the TSS chart,
                 so shown as a distinct snapshot rather than the line chart. */
              <div className="text-center py-6">
                <div className="flex items-center justify-center gap-6">
                  <div>
                    <div className="text-[9.5px] uppercase tracking-[0.08em] text-muted-2 font-bold">Fitness</div>
                    <div className="text-xl font-technical font-extrabold text-teal">{Math.round(banister.fitness)}</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] uppercase tracking-[0.08em] text-muted-2 font-bold">Fatigue</div>
                    <div className="text-xl font-technical font-extrabold text-violet">{Math.round(banister.fatigue)}</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] uppercase tracking-[0.08em] text-muted-2 font-bold">Form</div>
                    <div className={`text-xl font-technical font-extrabold ${banister.tsb_banister >= 0 ? "text-ok" : "text-bad"}`}>
                      {banister.tsb_banister >= 0 ? "+" : ""}{Number(banister.tsb_banister).toFixed(1)}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-muted-2 mt-3 leading-relaxed max-w-xs mx-auto">
                  Engine estimate{banister.confidence != null ? ` · ${Math.round(banister.confidence * 100)}% confidence` : ""}. The
                  full 28-day fitness/fatigue trend chart unlocks as you log more training.
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <Lock className="w-8 h-8 text-ink-faint mx-auto mb-2" />
                <p className="text-sm font-bold text-ink-muted mb-0.5">
                  Unlocks after 28 days of data
                </p>
                <p className="text-xs text-ink-faint">
                  Log workouts regularly to build your training history
                </p>
              </div>
            )
          ) : (
            <>
              <CTLLineChart data={ctlData} />
              <div className="flex items-center justify-center gap-6 mt-3 text-[9.5px] text-muted-2 font-bold">
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="3" viewBox="0 0 14 3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="var(--hue-teal)" strokeWidth="2.5" strokeLinecap="round" /></svg>
                  Fitness (CTL)
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="3" viewBox="0 0 14 3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="var(--hue-violet)" strokeWidth="2.5" strokeDasharray="3,3" strokeLinecap="round" /></svg>
                  Fatigue (ATL)
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="3" viewBox="0 0 14 3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="var(--viz-5)" strokeWidth="1.5" strokeDasharray="4,2" strokeLinecap="round" /></svg>
                  Form (TSB)
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-[10px] border-t hairline pt-4 text-center">
                <div>
                  <div className="w-1.5 h-1.5 rounded-full bg-teal mx-auto mb-1" />
                  <div className="font-bold text-muted-2">Fitness (CTL)</div>
                  <div className="text-faint mt-0.5 leading-snug font-semibold">42-day avg, consistent load capacity</div>
                </div>
                <div>
                  <div className="w-1.5 h-1.5 rounded-full bg-violet mx-auto mb-1" />
                  <div className="font-bold text-muted-2">Fatigue (ATL)</div>
                  <div className="text-faint mt-0.5 leading-snug font-semibold">7-day avg, recent stress buildup</div>
                </div>
                <div>
                  <div className="w-1.5 h-1.5 rounded-full mx-auto mb-1" style={{ background: "var(--viz-5)" }} />
                  <div className="font-bold text-muted-2">Form (TSB)</div>
                  <div className="text-faint mt-0.5 leading-snug font-semibold">CTL − ATL, positive means fresh</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
