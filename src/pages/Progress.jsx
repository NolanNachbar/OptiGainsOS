import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useAllBodyWeightEntries, useProfile } from "@/hooks/useUserQueries";
import { useLogWeight } from "@/hooks/useWeighIn";
import { BOUNDS as WEIGHT_BOUNDS } from "@/components/dashboard/WeighInPrompt";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Module, SegmentedControl } from "@/components/ui/system";
import { calculateEWMA } from "@/utils/coachingUtils";
import {
  TrendingUp, Ruler, Camera, Upload, Trash2, Plus, X,
  TrendingDown, ArrowUpRight, ArrowDownRight, Flame, Activity, ChevronDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

// Ledger-style weight chart (DESIGN.md Charts): pale raw weigh-in scatter,
// a bold trend line (EWMA) over them, small tabular axis labels on the
// right — same chart language as ExerciseProgressChart (gray history,
// off-white "now" dot, var(--text-faint) tick tokens).
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
  // weigh-ins reads as a visual gap instead of being silently compressed
  // (mf-app-screens.md Body pattern #1; same convention as Today's WeightSpark).
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
            <text x={W} y={y + 3} textAnchor="end" fontSize="10" fontFamily="var(--font-ui)" fill="var(--text-faint)" className="tabular-nums">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        );
      })}
      <g fill="var(--text-faint)" opacity="0.7">
        {rawPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" />)}
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
          <div key={label} className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-2">{label}</span>
            {value == null ? (
              <span className="font-technical text-xs font-bold text-faint tabular-nums">—</span>
            ) : (
              <span className="font-technical text-xs font-bold text-ink tabular-nums flex items-center gap-0.5">
                {value > 0 ? "+" : ""}{value} {weightUnit}
                {value > 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : value < 0 ? (
                  <ArrowDownRight className="w-3 h-3" />
                ) : null}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Weight module ─────────────────────────────────────────────────────────────
// The leading surface on Body (mf-app-screens.md "Weight Trend" widget):
// trend value, a 1W/1M/3M/6M/1Y/All range control over the scatter+trend
// chart, delta triples below it, then the logger + history. Replaces the old
// split between a fixed "30 days" summary module above the tabs and a
// second, separate chart inside a "Weight" tab — one chart, one place.
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
  // "log a few more" state (same anchor the deltas above use).
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
      const msg = err instanceof Error ? err.message : "Failed to log weight";
      setWeightError(msg);
      toast.error(msg);
    },
  });

  const del = useMutation({
    mutationFn: async (id) => {
      await db.entities.BodyWeightEntry.delete(id);
    },
    onSuccess: () => invalidateBodyWeight(qc),
    onError: () => toast.error("Failed to delete"),
  });

  const sorted = [...weightEntries].sort((a, b) => new Date(a.recorded_date) - new Date(b.recorded_date));
  const reversed = [...sorted].reverse();
  const visibleHistory = showAllHistory ? reversed : reversed.slice(0, HISTORY_PAGE_SIZE);
  const remainingHistory = reversed.length - visibleHistory.length;

  return (
    <>
      <Module>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[13px] font-semibold text-muted-2">Weight</span>
          {weightEntries.length >= 2 && (
            <SegmentedControl options={RANGES} value={range} onChange={setRange} size="sm" />
          )}
        </div>

        {isLoading || profileLoading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-7 w-32 rounded" />
            <Skeleton className="h-[140px] w-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-muted-2">Couldn&apos;t load weigh-ins.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : weightEntries.length < 2 ? (
          <p className="text-[12px] text-muted-2 font-semibold py-1">
            {weightEntries.length === 0
              ? "Log a weigh-in to start tracking your trend."
              : "Log one more weigh-in to see a trend."}
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="type-display text-2xl font-semibold tabular-nums">
                {fmt(latest.trendWeight, 1)}
              </span>
              <span className="text-[13px] font-semibold text-muted">{weightUnit}</span>
            </div>
            {isStale && (
              <p className="text-[11px] font-semibold text-muted-2 mt-0.5">
                as of {format(parseISO(latest.recorded_date), "MMM d")}
              </p>
            )}
            {windowed.length >= 2 ? (
              <div className="mt-2">
                <WeightTrendChart trended={windowed} />
              </div>
            ) : (
              <p className="text-[12px] text-muted-2 font-semibold mt-2">Not enough weigh-ins in this range.</p>
            )}
            <DeltaTriples trended={allTrended} weightUnit={weightUnit} />
          </>
        )}

        {/* Quick log — collapsed into a disclosure so the trend stays above the
            fold; expand to record a new entry. Defaults open for a brand-new
            account so the first thing offered is a way to add data, not a
            buried control. */}
        <details open={weightEntries.length === 0} className="mt-3 -mx-4 sm:-mx-5 lg:-mx-4 border-t hairline group/log [&[open]>summary_.log-chevron]:rotate-180">
          <summary className="flex items-center justify-between cursor-pointer list-none px-4 sm:px-5 lg:px-4 py-3 min-h-[44px]">
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-muted-2" />
              <span className="section-label !text-ink">Log Weight</span>
            </span>
            <ChevronDown className="log-chevron w-4 h-4 text-faint transition-transform duration-200 ease-[cubic-bezier(.2,.7,.3,1)]" />
          </summary>
          <div className="px-4 sm:px-5 lg:px-4 pb-4 pt-1">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-ink-muted mb-1.5 block">Date</Label>
                  <Input data-testid="weight-log-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 text-sm w-full font-technical" />
                </div>
                <div>
                  <Label className="text-xs text-ink-muted mb-1.5 block">Weight ({weightUnit})</Label>
                  <Input data-testid="weight-log-value" type="number" inputMode="decimal" step="0.1" value={weight} onChange={e => { setWeight(e.target.value); setWeightError(null); }} placeholder="0.0" className="h-11 w-full" />
                </div>
              </div>
              {weightError && (
                <p className="text-xs font-semibold text-bad">{weightError}</p>
              )}
              <div>
                <Label className="text-xs text-ink-muted mb-1.5 block">Notes (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Morning, fasted..." className="h-11" />
              </div>
              <Button variant="volt" size="lg" className="w-full" disabled={!weight || add.isPending} onClick={() => add.mutate()}>
                Log
              </Button>
            </div>
          </div>
        </details>
      </Module>

      {sorted.length > 0 && (
        <Module label="History">
          <div className="space-y-1.5">
            {visibleHistory.map((entry, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? (entry.weight - prev.weight) : null;
              return (
                <div key={entry.id} className="flex items-center gap-4 py-2 border-t hairline first:border-t-0 group">
                  <span className="font-technical text-xs font-semibold text-muted-2 w-20 shrink-0">{format(parseISO(entry.recorded_date), "MMM d, yyyy")}</span>
                  <span className="font-technical text-sm font-extrabold text-ink">{entry.weight} {weightUnit}</span>
                  {diff !== null && diff !== 0 && (
                    <span className="font-technical text-xs font-bold flex items-center gap-0.5 text-ink">
                      {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                    </span>
                  )}
                  {entry.notes && <span className="text-xs font-semibold text-muted-2 italic flex-1 truncate">{entry.notes}</span>}
                  <button aria-label="Delete entry" onClick={() => setConfirmId(entry.id)} className="ml-auto flex items-center justify-center min-h-[44px] min-w-[44px] -my-3 -mr-3 opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-2 hover:text-bad transition-all shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {reversed.length > HISTORY_PAGE_SIZE && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2.5 min-h-[44px] cta-ghost"
              onClick={() => setShowAllHistory(v => !v)}
            >
              {showAllHistory ? "Show less" : `Show more (${remainingHistory})`}
            </Button>
          )}
        </Module>
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

function TrendBadge({ curr, prev }) {
  if (!curr || !prev) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.1) return null;
  return (
    <span className={`font-technical text-[10px] font-bold ml-1 ${diff > 0 ? "text-warn" : "text-ok"}`}>
      {diff > 0 ? "▲" : "▼"}{Math.abs(diff).toFixed(1)}
    </span>
  );
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
    onError: () => toast.error("Failed to save"),
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
    <div className="space-y-6">
      <Card className="glass glass-interactive">
        <CardContent className="pt-4 pb-5 px-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-label">Log Measurements (cm)</h3>
            <Input data-testid="measurements-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="min-h-[44px] text-xs w-36 font-technical" />
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {MEASUREMENT_FIELDS.map((f, i) => (
              <div key={f.key}>
                <Label className="text-[10px] text-ink-muted mb-1 block uppercase tracking-wider">{f.label}</Label>
                <Input
                  data-testid={i === 0 ? "measurements-chest" : undefined}
                  type="number" inputMode="decimal"
                  step="0.1"
                  value={form[f.key] || ""}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={latest?.[f.key] ? String(latest[f.key]) : "—"}
                  className="min-h-[44px] text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className="min-h-[44px] text-xs" />
            </div>
            <Button variant="volt" size="lg" className="px-4 shrink-0" disabled={!hasData || save.isPending} onClick={() => save.mutate()}>
              Save Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}

      {isError && (
        <div className="py-8 text-center glass-inset">
          <p className="text-sm font-semibold text-muted-2">Couldn&apos;t load measurements.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {/* Latest vs previous */}
      {latest && (
        <div>
          <h3 className="section-label mb-3">Latest · {format(parseISO(latest.date), "MMM d, yyyy")}</h3>
          <div className="grid grid-cols-4 gap-2">
            {MEASUREMENT_FIELDS.filter(f => latest[f.key]).map(f => (
              <div key={f.key} className="p-3 glass-inset text-center">
                <p className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">{f.label}</p>
                <p className="font-technical text-sm font-extrabold text-ink">
                  {latest[f.key]}
                  <TrendBadge curr={latest[f.key]} prev={prev?.[f.key]} />
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History table */}
      {history.length > 0 && (
        <div>
          <h3 className="section-label mb-3">History</h3>
          <div className="overflow-x-auto rounded-lg hairline glass-inset">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b hairline">
                  <th className="text-left px-4 py-2.5 text-muted-2 font-bold uppercase tracking-[0.08em] whitespace-nowrap">Date</th>
                  {MEASUREMENT_FIELDS.map(f => (
                    <th key={f.key} className="text-right px-3 py-2.5 text-muted-2 font-bold uppercase tracking-[0.08em] whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b hairline last:border-0 group hover:bg-track">
                    <td className="font-technical px-4 py-2.5 text-muted-2 whitespace-nowrap">{format(parseISO(row.date), "MMM d, yyyy")}</td>
                    {MEASUREMENT_FIELDS.map(f => (
                      <td key={f.key} className="px-3 py-2.5 text-right font-technical font-bold text-ink">{row[f.key] ?? "—"}</td>
                    ))}
                    <td className="px-2 py-2.5">
                      <button aria-label="Delete measurement" onClick={() => setConfirmId(row.id)} className="flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -mx-2 opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-2 hover:text-bad transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
    <Link
      to="/physique"
      className="glass glass-interactive flex items-center gap-3 px-4 py-4"
    >
      <div className="p-2 rounded-full bg-teal/10 shrink-0">
        <Camera className="w-4 h-4 text-teal" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Progress photos</p>
        <p className="text-[11.5px] font-semibold text-muted-2">
          Open the Physique tracker, pose tracking, side-by-side compare, and body-fat trend.
        </p>
      </div>
      <ArrowUpRight className="w-4 h-4 text-faint shrink-0" />
    </Link>
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
  // (Today.jsx's same convention) — convert the NUMBER for a kg profile,
  // don't just relabel an unconverted lbs value "lbs/wk".
  const weightTrendLbs = state?.nutrition?.weight_trend_lbs_per_week;
  const weightTrend = weightTrendLbs == null ? null
    : weightUnit === "kg" ? Math.round(weightTrendLbs * LBS_PER_KG * 100) / 100
    : weightTrendLbs;

  return (
    <div className="space-y-6">
      <Card className="glass glass-interactive">
        <CardContent className="pt-6 pb-6 px-5">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-gold" />
                <h3 className="section-label !text-ink">Expenditure Engine</h3>
              </div>
              <Badge className={state?.nutrition ? "bg-teal/10 text-teal border-none" : "bg-track glass-inset text-muted-2 border-none"}>
                {state?.nutrition ? "Active" : "No data"}
              </Badge>
           </div>
           <div className="text-center py-4">
              <p className="hero-metric text-ink text-4xl">{state?.nutrition?.avg_calories_7d || state?.nutrition?.avg_daily_calories_7d || "—"}</p>
              {/* This is avg_calories_7d — what he ATE over the last 7 days.
                  Labelling logged intake as "Calculated Burn" made the one
                  number on the Expenditure card mean the opposite of what it
                  says, in the place he checks whether the cut is working. */}
              <p className="text-[10px] text-muted-2 mt-1.5 font-bold uppercase tracking-[0.08em]">Intake (7d Avg)</p>
           </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-2 gap-3">
         <Card className="glass glass-interactive p-4">
            <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] mb-1 flex items-center gap-1.5">
              <i className="w-[5px] h-[5px] rounded-full shrink-0 bg-violet" /> Weight Trend
            </p>
            <p className="font-technical text-lg font-extrabold text-ink">{weightTrend != null ? `${weightTrend > 0 ? "+" : ""}${weightTrend} ${weightUnit}/wk` : "—"}</p>
         </Card>
         {(() => {
            // Net energy derived from the measured weight trend rather than a
            // hardcoded label: a sustained weight change *is* the energy balance.
            const trend = Number(state?.nutrition?.weight_trend_lbs_per_week);
            const known = state?.nutrition?.weight_trend_lbs_per_week != null && !Number.isNaN(trend);
            // Net Energy is a derived NUTRITION label, not a biometric readout —
            // so it owns a single data hue (gold, carried by the dot below) and
            // the value renders as neutral ink rather than poaching the
            // physiological spectrum (warn/info/teal). See SYS-09(a) in index.css.
            const net = !known ? { label: "—" }
              : trend > 0.15 ? { label: "Surplus" }
              : trend < -0.15 ? { label: "Deficit" }
              : { label: "Balanced" };
            return (
              <Card className="glass glass-interactive p-4">
                <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] mb-1 flex items-center gap-1.5">
                  <i className="w-[5px] h-[5px] rounded-full shrink-0 bg-gold" /> Net Energy
                </p>
                <p className={`font-technical text-lg font-extrabold ${known ? "text-ink" : "text-muted-2"}`}>{net.label}</p>
              </Card>
            );
         })()}
      </div>

      <div className="p-4 glass-inset">
         <p className="text-xs font-semibold text-muted-2 leading-relaxed">
            The engine uses your daily intake and weight change to calculate your true expenditure.
            This filters out water retention and glycogen fluctuations to show your actual metabolic rate.
         </p>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
// Rendered embedded inside Fuel → Body & Progress (the standalone /progress route was retired).
// MacroFactor redesign (LAUNCH_PLAN phase 4): the weight module leads, full
// width, with its own range control and deltas — it's no longer one of four
// equal-weight tabs (that duplicated the trend across a "30 days" summary
// module AND a separate "Weight" tab chart). Metabolism/Measurements/Photos
// stay tabbed below it; a per-muscle map isn't duplicated here since
// AthleteState (the Body tab-root) already renders one.
export default function Progress() {
  return (
    <div className="space-y-2">
      <WeightModule />
      <Tabs defaultValue="metabolism">
      {/* Subordinate to the parent Fuel SubTabs: a lighter, contained segmented
          control (glass-inset, no full-width underline strip) so the two nav
          levels read as a clear hierarchy rather than two equal-weight strips. */}
      <TabsList className="mb-3 h-auto gap-1 border-b-0 p-1 glass-inset rounded-lg !justify-start">
        <TabsTrigger value="metabolism" variant="segment" className="!min-h-[44px] !py-1.5 rounded-md !text-xs">Metabolism</TabsTrigger>
        <TabsTrigger value="measurements" variant="segment" className="!min-h-[44px] !py-1.5 rounded-md !text-xs">Measurements</TabsTrigger>
        <TabsTrigger value="photos" variant="segment" className="!min-h-[44px] !py-1.5 rounded-md !text-xs">Photos</TabsTrigger>
      </TabsList>
      <TabsContent value="metabolism"><MetabolismTab /></TabsContent>
      <TabsContent value="measurements"><MeasurementsTab /></TabsContent>
      <TabsContent value="photos"><PhotosLink /></TabsContent>
      </Tabs>
    </div>
  );
}
