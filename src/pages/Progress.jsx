import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useAllBodyWeightEntries, useProfile } from "@/hooks/useUserQueries";
import { useLogWeight } from "@/hooks/useWeighIn";
import { BOUNDS as WEIGHT_BOUNDS } from "@/components/dashboard/WeighInPrompt";
import {
  Button, Input, Label, Card, CardHeader, CardTitle, CardContent, Tabs, TabsList, TabsTrigger, TabsContent,
  ConfirmDialog, Skeleton, SegmentedControl, Stat, ReasonLine, EmptyState, ErrorState,
} from "@/components/ui";
import { calculateEWMA } from "@/utils/coachingUtils";
import { weeklyRate, signed } from "@/components/progress/trendMath";
import { Camera, Trash2, Plus, X, ArrowUpRight, ArrowDownRight, ChevronDown } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { db } from "@/api/supabaseClient";
import { invalidateBodyWeight } from "@/lib/queryKeys";
import { getTodayString } from "@/utils/dateUtils";
import { toast } from "sonner";

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d));
// The engine's weight_trend_lbs_per_week is always computed in lbs
// (Today.jsx's same convention) — convert it for a kg profile, never
// relabel it unconverted.
const LBS_PER_KG = 0.45359237;

const RANGES = [
  { value: "1W", label: "1W", days: 7 },
  { value: "1M", label: "1M", days: 30 },
  { value: "3M", label: "3M", days: 90 },
  { value: "6M", label: "6M", days: 180 },
  { value: "1Y", label: "1Y", days: 365 },
  { value: "All", label: "All", days: null },
];

// The deltas below the chart are fixed periods (mf-app-screens.md "Weight
// Changes" card), independent of whichever range the segmented control has
// selected — same as MacroFactor showing 3-day/7-day deltas regardless of
// the chart's own window.
const DELTA_PERIODS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
];

// Delta is read from the smoothed TREND, not the raw weigh-ins (task spec):
// latest trend value minus the trend value at the most recent entry on or
// before (anchor - days). If no entry reaches back that far, there's no
// honest delta to show — null, never a value computed from whatever the
// first in-window point happens to be.
function trendDelta(trended, days) {
  if (!trended || trended.length < 2) return null;
  const last = trended[trended.length - 1];
  const cutoff = new Date(`${last.recorded_date}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  let candidate = null;
  for (let i = trended.length - 1; i >= 0; i--) {
    if (trended[i].recorded_date <= cutoffStr) { candidate = trended[i]; break; }
  }
  if (!candidate) return null;
  return Math.round((last.trendWeight - candidate.trendWeight) * 10) / 10;
}

// Weight chart (system charts): logged weigh-ins as faint 3px dots, the smoothed
// trend as a 2px line on top, small tabular axis labels on the right. Same
// language as ExerciseProgressChart.
function WeightTrendChart({ trended }) {
  if (!trended || trended.length < 2) return null;
  const W = 396, H = 140, PAD_X = 4, PAD_Y = 14, LABEL_W = 32;
  const rawVals = trended.map((e) => Number(e.weight));
  const trendVals = trended.map((e) => Number(e.trendWeight));
  const allVals = [...rawVals, ...trendVals];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;
  const innerH = H - PAD_Y * 2;
  const yFor = (v) => PAD_Y + (1 - (v - min) / span) * innerH;
  // Positioned by actual elapsed days, not row index, so a gap between
  // weigh-ins reads as a visual gap instead of being silently compressed.
  const t0 = new Date(`${trended[0].recorded_date}T00:00:00`);
  const tN = new Date(`${trended[trended.length - 1].recorded_date}T00:00:00`);
  const totalDays = Math.max(1, Math.round((tN - t0) / 86400000));
  const dayOf = (e) => Math.round((new Date(`${e.recorded_date}T00:00:00`) - t0) / 86400000);
  const xFor = (e) => PAD_X + (dayOf(e) / totalDays) * (W - LABEL_W - PAD_X * 2);

  const rawPoints = trended.map((e) => ({ x: xFor(e), y: yFor(Number(e.weight)) }));
  const trendPoints = trended.map((e) => ({ x: xFor(e), y: yFor(Number(e.trendWeight)) }));
  const path = trendPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = trendPoints[trendPoints.length - 1];
  const ticks = [max, (max + min) / 2, min];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {ticks.map((t, i) => {
        const y = yFor(t);
        return (
          <g key={i}>
            <line x1={0} y1={y} x2={W - LABEL_W} y2={y} stroke="var(--color-border-soft)" />
            <text x={W} y={y + 3} textAnchor="end" fontFamily="var(--font-ui)" fill="var(--text-faint)" className="text-caption tabular-nums">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        );
      })}
      <g fill="var(--text-faint)" opacity="0.7">
        {rawPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.5" />)}
      </g>
      <path d={path} fill="none" stroke="var(--text-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="3.5" fill="var(--text-primary)" />
    </svg>
  );
}

function DeltaTriples({ trended, weightUnit }) {
  return (
    <div className="flex items-center gap-5 mt-3 flex-wrap">
      {DELTA_PERIODS.map(({ label, days }) => {
        const value = trendDelta(trended, days);
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="text-caption text-ink-muted">{label}</span>
            {value == null ? (
              <span className="text-caption font-semibold text-ink-faint tabular-nums">--</span>
            ) : (
              <span className="text-caption font-semibold text-ink tabular-nums flex items-center gap-1">
                {value > 0 ? "+" : ""}{value} {weightUnit}
                {value > 0 ? (
                  <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                ) : value < 0 ? (
                  <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
                ) : null}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const FIELD_LABEL = "mb-1 block text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted";

// ─── Weight module ─────────────────────────────────────────────────────────────
// The leading surface on Body: trend value with its weekly rate and basis, a
// range control over the dots-plus-trend chart, period deltas below it, then
// the logger and history. The logger's Log button is the screen's one primary
// action.
function WeightModule() {
  const qc = useQueryClient();
  const { profile, isLoading: profileLoading } = useProfile();
  const { weightEntries, isLoading, error, refetch } = useAllBodyWeightEntries();
  const weightUnit = profile?.weight_unit || "lbs";
  const [range, setRange] = useState("1M");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(getTodayString());
  const [notes, setNotes] = useState("");
  const [weightError, setWeightError] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const HISTORY_PAGE_SIZE = 7;
  const logWeight = useLogWeight();

  const allTrended = useMemo(() => calculateEWMA(weightEntries, 0.1), [weightEntries]);

  // Windowed relative to the most recent weigh-in, not the wall clock, so a
  // lapsed logger still sees their actual last N days instead of an empty
  // state (same anchor the deltas use).
  const windowed = useMemo(() => {
    if (allTrended.length === 0) return [];
    const rangeDef = RANGES.find((r) => r.value === range);
    if (!rangeDef?.days) return allTrended;
    const lastDate = allTrended[allTrended.length - 1].recorded_date;
    const cutoff = new Date(`${lastDate}T00:00:00`);
    cutoff.setDate(cutoff.getDate() - (rangeDef.days - 1));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return allTrended.filter((e) => e.recorded_date >= cutoffStr);
  }, [allTrended, range]);

  const rate = useMemo(
    () => weeklyRate(allTrended.map((r) => ({ date: r.recorded_date, value: r.trendWeight }))),
    [allTrended]
  );

  const latest = allTrended[allTrended.length - 1];
  const isStale = latest
    && differenceInCalendarDays(new Date(), parseISO(latest.recorded_date)) > 7;

  const add = useMutation({
    mutationFn: async () => {
      const parsed = Number.parseFloat(weight);
      const [min, max] = WEIGHT_BOUNDS[weightUnit] || WEIGHT_BOUNDS.lbs;
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw new Error(`That reads as ${weight} ${weightUnit}. Expected ${min}-${max}.`);
      }
      // Shared write path: re-logging a date that already has an entry updates
      // it instead of adding a second row for the same day.
      return await logWeight.mutateAsync({
        weight: parsed, date, notes: notes || null,
      });
    },
    onSuccess: () => {
      invalidateBodyWeight(qc);
      setWeight(""); setNotes(""); setWeightError(null);
      toast.success("Weight logged");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Weight not saved. Try again.";
      setWeightError(msg);
      toast.error(msg);
    },
  });

  const del = useMutation({
    mutationFn: async (id) => {
      await db.entities.BodyWeightEntry.delete(id);
    },
    onSuccess: () => invalidateBodyWeight(qc),
    onError: () => toast.error("Entry not deleted. Try again."),
  });

  const sorted = [...weightEntries].sort((a, b) => new Date(a.recorded_date) - new Date(b.recorded_date));
  const reversed = [...sorted].reverse();
  const visibleHistory = showAllHistory ? reversed : reversed.slice(0, HISTORY_PAGE_SIZE);
  const remainingHistory = reversed.length - visibleHistory.length;

  const trendReason = latest && (
    `${isStale ? `As of ${format(parseISO(latest.recorded_date), "MMM d")}. ` : ""}Smoothed trend of ${allTrended.length} weigh-ins, ${
      rate ? `rate over the last ${rate.spanDays} days` : "rate needs 7 days of data"
    }`
  );

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
          <CardTitle>Weight</CardTitle>
          {weightEntries.length >= 2 && (
            <SegmentedControl options={RANGES} value={range} onChange={setRange} size="sm" />
          )}
        </div>

        <div className="px-4 pb-3 pt-2">
          {isLoading || profileLoading ? (
            <div className="space-y-2 py-1" role="status" aria-label="Loading weight">
              <Skeleton className="h-7 w-32 rounded-control" />
              <Skeleton className="h-[140px] w-full rounded-control" />
            </div>
          ) : error ? (
            <ErrorState title="Could not load weigh-ins" onRetry={() => refetch()} className="px-0" />
          ) : weightEntries.length < 2 ? (
            <EmptyState
              className="px-0 py-3"
              title={weightEntries.length === 0 ? "No weigh-ins yet" : "One weigh-in logged"}
              progress={{ value: weightEntries.length, max: 7 }}
            >
              The trend firms up after about 7 days of weigh-ins. Day {weightEntries.length} of 7.
            </EmptyState>
          ) : (
            <>
              <Stat
                label="Trend weight"
                value={fmt(latest.trendWeight, 1)}
                unit={weightUnit}
                delta={rate ? `${signed(rate.perWeek)} ${weightUnit}/wk` : undefined}
                reason={trendReason}
              />
              {windowed.length >= 2 ? (
                <div className="mt-3">
                  <WeightTrendChart trended={windowed} />
                  <div className="mt-2 flex items-center gap-4 text-caption text-ink-muted">
                    <span className="flex items-center gap-2">
                      <span className="h-[3px] w-[3px] rounded-pill bg-ink-faint opacity-70 scale-[2]" aria-hidden="true" />
                      Logged
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-[2px] w-4 bg-ink" aria-hidden="true" />
                      Trend
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-caption text-ink-muted">Not enough weigh-ins in this range.</p>
              )}
              <DeltaTriples trended={allTrended} weightUnit={weightUnit} />
            </>
          )}
        </div>

        {/* Quick log: collapsed into a disclosure so the trend stays above the
            fold. Open by default for a brand-new account so the first thing
            offered is a way to add data. */}
        <details open={weightEntries.length === 0} className="border-t border-charcoal-borderSoft group/log [&[open]>summary_.log-chevron]:rotate-180">
          <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 min-h-tap">
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-ink-muted" aria-hidden="true" />
              <span className="text-emph font-semibold text-ink">Log Weight</span>
            </span>
            <ChevronDown aria-hidden="true" className="log-chevron w-4 h-4 text-ink-faint transition-transform duration-base ease-out" />
          </summary>
          <div className="px-4 pb-4 pt-1">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={FIELD_LABEL}>Date</Label>
                  <Input data-testid="weight-log-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className={FIELD_LABEL}>Weight ({weightUnit})</Label>
                  <Input data-testid="weight-log-value" type="number" inputMode="decimal" step="0.1" value={weight} onChange={e => { setWeight(e.target.value); setWeightError(null); }} placeholder="0.0" className="w-full" />
                </div>
              </div>
              {weightError && (
                <p className="text-caption text-bad" role="alert">{weightError}</p>
              )}
              <div>
                <Label className={FIELD_LABEL}>Notes (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Morning, fasted..." />
              </div>
              <Button variant="primary" size="lg" className="w-full" disabled={!weight || add.isPending} onClick={() => add.mutate()}>
                Log
              </Button>
            </div>
          </div>
        </details>
      </Card>

      {sorted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <div>
            {visibleHistory.map((entry, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? (entry.weight - prev.weight) : null;
              return (
                <div key={entry.id} className="group flex items-center gap-3 px-4 min-h-[56px] border-t border-charcoal-borderSoft">
                  <span className="w-24 shrink-0 text-caption text-ink-muted tabular-nums">{format(parseISO(entry.recorded_date), "MMM d, yyyy")}</span>
                  <span className="text-emph font-semibold text-ink tabular-nums">{entry.weight} {weightUnit}</span>
                  {diff !== null && diff !== 0 && (
                    <span className="flex items-center gap-1 text-caption font-semibold tabular-nums text-ink-secondary">
                      {diff > 0 ? <ArrowUpRight className="w-3 h-3" aria-hidden="true" /> : <ArrowDownRight className="w-3 h-3" aria-hidden="true" />}
                      {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                    </span>
                  )}
                  {entry.notes && <span className="flex-1 truncate text-caption text-ink-muted">{entry.notes}</span>}
                  <button aria-label="Delete entry" onClick={() => setConfirmId(entry.id)} className="ml-auto -mr-3 flex min-h-tap min-w-tap shrink-0 items-center justify-center text-ink-muted opacity-60 transition-opacity hover:text-bad md:opacity-0 md:group-hover:opacity-100">
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          {reversed.length > HISTORY_PAGE_SIZE && (
            <div className="border-t border-charcoal-borderSoft p-3">
              <Button variant="outline" size="sm" className="w-full min-h-tap" onClick={() => setShowAllHistory(v => !v)}>
                {showAllHistory ? "Show less" : `Show more (${remainingHistory})`}
              </Button>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => { if (!o) setConfirmId(null); }}
        title="Delete weight entry?"
        description="This weight entry will be permanently removed."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmId); setConfirmId(null); }}
      />
    </>
  );
}

// ─── Measurements Tab ──────────────────────────────────────────────────────────
const MEASUREMENT_FIELDS = [
  { key: "chest_cm",     label: "Chest" },
  { key: "waist_cm",     label: "Waist" },
  { key: "hips_cm",      label: "Hips" },
  { key: "left_arm_cm",  label: "L Arm" },
  { key: "right_arm_cm", label: "R Arm" },
  { key: "left_quad_cm", label: "L Quad" },
  { key: "right_quad_cm",label: "R Quad" },
  { key: "neck_cm",      label: "Neck" },
];

// Change vs the previous entry. Direction is neutral: a bigger arm and a
// smaller waist can both be the goal, so no good/bad hue.
function measurementDelta(curr, prev) {
  if (!curr || !prev) return undefined;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.1) return undefined;
  return signed(diff);
}

function MeasurementsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(getTodayString());
  const [form, setForm] = useState({});
  const [notes, setNotes] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const { data: history = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["measurements", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("measurements").select("*").eq("created_by", user.id).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { created_by: user.id, date, notes: notes || null };
      MEASUREMENT_FIELDS.forEach(f => { if (form[f.key]) payload[f.key] = parseFloat(form[f.key]); });

      // Re-saving the same date updates that row instead of adding a second
      // one (matches the weight log's select-then-update path in useLogWeight).
      const { data: existing, error: selErr } = await supabase.from("measurements")
        .select("id").eq("created_by", user.id).eq("date", date).limit(1);
      if (selErr) throw selErr;

      if (existing?.length) {
        // The form never prefills notes, so a blank notes box on a re-save
        // means "no change", not "erase the note logged earlier that day".
        const patch = { ...payload };
        if (!notes) delete patch.notes;
        const { error } = await supabase.from("measurements").update(patch).eq("id", existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("measurements").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["measurements"] });
      setForm({}); setNotes("");
      toast.success("Measurements saved");
    },
    onError: () => toast.error("Measurements not saved. Try again."),
  });

  const del = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("measurements").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["measurements"] }),
  });

  const hasData = MEASUREMENT_FIELDS.some(f => form[f.key]);
  const latest = history[0];
  const prev = history[1];

  return (
    <div className="flex flex-col gap-stack">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Log measurements (cm)</CardTitle>
          <Input data-testid="measurements-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {MEASUREMENT_FIELDS.map((f, i) => (
              <div key={f.key}>
                <Label className={FIELD_LABEL}>{f.label}</Label>
                <Input
                  data-testid={i === 0 ? "measurements-chest" : undefined}
                  type="number" inputMode="decimal"
                  step="0.1"
                  value={form[f.key] || ""}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={latest?.[f.key] ? String(latest[f.key]) : "--"}
                  className="px-2"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" />
            </div>
            <Button variant="secondary" size="lg" className="px-4 shrink-0" disabled={!hasData || save.isPending} onClick={() => save.mutate()}>
              Save Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading measurements">
          <Skeleton className="h-24 rounded-control" />
          <Skeleton className="h-40 rounded-control" />
        </div>
      )}

      {isError && <ErrorState title="Could not load measurements" onRetry={() => refetch()} />}

      {latest && (
        <Card>
          <CardHeader>
            <CardTitle>Latest</CardTitle>
            <ReasonLine>{format(parseISO(latest.date), "MMM d, yyyy")}, change vs the entry before it</ReasonLine>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-x-3 gap-y-4">
              {MEASUREMENT_FIELDS.filter(f => latest[f.key]).map(f => (
                <Stat
                  key={f.key}
                  size="sm"
                  label={f.label}
                  value={latest[f.key]}
                  delta={measurementDelta(latest[f.key], prev?.[f.key])}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-caption tabular-nums">
              <thead>
                <tr className="border-y border-charcoal-borderSoft">
                  <th className="px-4 py-2 text-left text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted whitespace-nowrap">Date</th>
                  {MEASUREMENT_FIELDS.map(f => (
                    <th key={f.key} className="px-3 py-2 text-right text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="group border-b border-charcoal-borderSoft last:border-0 hover:bg-charcoal-surface2">
                    <td className="px-4 py-2 text-ink-muted whitespace-nowrap">{format(parseISO(row.date), "MMM d, yyyy")}</td>
                    {MEASUREMENT_FIELDS.map(f => (
                      <td key={f.key} className="px-3 py-2 text-right font-semibold text-ink">{row[f.key] ?? "--"}</td>
                    ))}
                    <td className="px-2 py-2">
                      <button aria-label="Delete measurement" onClick={() => setConfirmId(row.id)} className="-my-2 -mx-2 flex min-h-tap min-w-tap items-center justify-center text-ink-muted opacity-60 transition-opacity hover:text-bad md:opacity-0 md:group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => { if (!o) setConfirmId(null); }}
        title="Delete measurement entry?"
        description="This measurement entry will be permanently removed."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmId); setConfirmId(null); }}
      />
    </div>
  );
}

// ─── Photos Tab ────────────────────────────────────────────────────────────────
// Progress photos live in the canonical Physique tracker (/physique). The old
// duplicate uploader here wrote to a separate `progress_photos` table that the
// Physique flow never populates, so it always read empty. Link out instead.
function PhotosLink() {
  return (
    <Card>
      <Link
        to="/physique"
        className="flex min-h-[56px] items-center gap-3 px-4 py-row transition-colors duration-fast hover:bg-charcoal-surface2"
      >
        <Camera className="h-5 w-5 shrink-0 text-ink-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-emph font-semibold text-ink">Progress photos</span>
          <span className="block text-caption text-ink-muted">
            Pose tracking, side-by-side compare and the body fat trend live in Physique.
          </span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
      </Link>
    </Card>
  );
}

function MetabolismTab() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const weightUnit = profile?.weight_unit || "lbs";
  const today = getTodayString();
  const { data: state } = useQuery({
    queryKey: ["athlete-state", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_state").select("*").eq("created_by", user.id).eq("date", today).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // weight_trend_lbs_per_week is always computed in lbs by the engine
  // (Today.jsx's same convention): convert the NUMBER for a kg profile,
  // don't just relabel an unconverted lbs value.
  const weightTrendLbs = state?.nutrition?.weight_trend_lbs_per_week;
  const weightTrend = weightTrendLbs == null ? null
    : weightUnit === "kg" ? Math.round(weightTrendLbs * LBS_PER_KG * 100) / 100
    : weightTrendLbs;

  // Net energy is derived from the measured weight trend: a sustained weight
  // change is the energy balance.
  const trend = Number(weightTrendLbs);
  const known = weightTrendLbs != null && !Number.isNaN(trend);
  const netLabel = !known ? null : trend > 0.15 ? "Surplus" : trend < -0.15 ? "Deficit" : "Balanced";

  // avg_calories_7d is what he ATE over the last 7 days. It is intake, not burn.
  const intake = state?.nutrition?.avg_calories_7d || state?.nutrition?.avg_daily_calories_7d;

  return (
    <div className="flex flex-col gap-stack">
      <Card>
        <CardContent className="pt-4">
          <Stat
            label="Intake, 7-day avg"
            size="md"
            value={intake || undefined}
            unit={intake ? "kcal" : undefined}
            reason={intake ? "Average logged calories over the last 7 days" : "Needs logged meals on several days"}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-stack">
        <Card className="p-4">
          <Stat
            label="Weight trend"
            size="sm"
            value={weightTrend != null ? `${weightTrend > 0 ? "+" : ""}${weightTrend}` : undefined}
            unit={weightTrend != null ? `${weightUnit}/wk` : undefined}
          />
        </Card>
        <Card className="p-4">
          <Stat
            label="Net energy"
            size="sm"
            value={netLabel ?? undefined}
            reason={known ? "From the weight trend, within 0.15 lb/wk is balanced" : undefined}
          />
        </Card>
      </div>

      <p className="text-caption text-ink-muted">
        The engine reads your daily intake against your weight change to estimate expenditure. Smoothing filters out
        water and glycogen swings.
      </p>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
// Rendered embedded inside Fuel, Body & Progress (the standalone /progress route
// was retired), so the Fuel page owns the PageHeader. The weight module leads;
// Metabolism, Measurements and Photos stay tabbed below it. A per-muscle map
// isn't duplicated here since AthleteState already renders one.
export default function Progress() {
  return (
    <div className="flex flex-col gap-stack">
      <WeightModule />
      <Tabs defaultValue="metabolism">
        <TabsList className="mb-3 h-auto gap-1 border-b-0 p-1 bg-charcoal-surface2 rounded-control justify-start">
          <TabsTrigger value="metabolism" variant="segment" className="!min-h-tap !py-1.5 rounded-control">Metabolism</TabsTrigger>
          <TabsTrigger value="measurements" variant="segment" className="!min-h-tap !py-1.5 rounded-control">Measurements</TabsTrigger>
          <TabsTrigger value="photos" variant="segment" className="!min-h-tap !py-1.5 rounded-control">Photos</TabsTrigger>
        </TabsList>
        <TabsContent value="metabolism"><MetabolismTab /></TabsContent>
        <TabsContent value="measurements"><MeasurementsTab /></TabsContent>
        <TabsContent value="photos"><PhotosLink /></TabsContent>
      </Tabs>
    </div>
  );
}
