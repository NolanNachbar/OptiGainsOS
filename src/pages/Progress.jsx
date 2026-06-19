import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useBodyWeightEntries, useProfile } from "@/hooks/useUserQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import WeightProgressChart from "@/components/progress/WeightProgressChart";
import {
  TrendingUp, Ruler, Camera, Upload, Trash2, Plus, X,
  TrendingDown, Minus, ArrowUpRight, ArrowDownRight, Flame, Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { db } from "@/api/supabaseClient";
import { invalidateBodyWeight } from "@/lib/queryKeys";
import { getTodayString } from "@/utils/dateUtils";
import { toast } from "sonner";

// ─── Weight Tab ────────────────────────────────────────────────────────────────
function WeightTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { profile } = useProfile();
  const { weightEntries } = useBodyWeightEntries();
  const weightUnit = profile?.weight_unit || "lbs";
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(getTodayString());
  const [notes, setNotes] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const HISTORY_PAGE_SIZE = 7;

  const add = useMutation({
    mutationFn: async () => {
      return await db.entities.BodyWeightEntry.create({
        weight: parseFloat(weight), recorded_date: date,
        notes: notes || null, created_by: user.id,
      });
    },
    onSuccess: () => {
      invalidateBodyWeight(qc);
      setWeight(""); setNotes("");
      toast.success("Weight logged");
    },
    onError: () => toast.error("Failed to log weight"),
  });

  const del = useMutation({
    mutationFn: async (id) => {
      await db.entities.BodyWeightEntry.delete(id);
    },
    onSuccess: () => invalidateBodyWeight(qc),
    onError: () => toast.error("Failed to delete"),
  });

  const sorted = [...weightEntries].sort((a, b) => new Date(a.recorded_date) - new Date(b.recorded_date));

  return (
    <div className="space-y-6">
      {/* Quick log */}
      <Card className="glass glass-interactive">
        <CardContent className="pt-4 pb-5 px-5">
          <h3 className="section-label mb-4">Log Weight</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-ink-muted mb-1.5 block">Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 text-sm w-full font-technical" />
              </div>
              <div>
                <Label className="text-xs text-ink-muted mb-1.5 block">Weight ({weightUnit})</Label>
                <Input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.0" className="h-11 w-full" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Morning, fasted..." className="h-11" />
            </div>
            <Button variant="volt" size="lg" className="w-full" disabled={!weight || add.isPending} onClick={() => add.mutate()}>
              Log
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="glass glass-interactive">
        <CardContent className="pt-5 pb-5 px-5">
          <WeightProgressChart data={sorted} weightUnit={weightUnit} className="h-72" />
        </CardContent>
      </Card>

      {/* History */}
      {sorted.length > 0 && (() => {
        const reversed = [...sorted].reverse();
        const visible = showAllHistory ? reversed : reversed.slice(0, HISTORY_PAGE_SIZE);
        const remaining = reversed.length - visible.length;
        return (
        <div>
          <h3 className="section-label mb-3">History</h3>
          <div className="space-y-1.5">
            {visible.map((entry, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? (entry.weight - prev.weight) : null;
              return (
                <div key={entry.id} className="flex items-center gap-4 px-4 py-2.5 glass-inset group">
                  <span className="font-technical text-xs font-semibold text-muted-2 w-20 shrink-0">{format(parseISO(entry.recorded_date), "MMM d, yyyy")}</span>
                  <span className="font-technical text-sm font-extrabold text-ink">{entry.weight} {weightUnit}</span>
                  {diff !== null && (
                    <span className={`font-technical text-xs font-bold flex items-center gap-0.5 ${diff > 0 ? "text-warn" : diff < 0 ? "text-ok" : "text-muted-2"}`}>
                      {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
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
              {showAllHistory ? "Show less" : `Show more (${remaining})`}
            </Button>
          )}
        </div>
        );
      })()}

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => { if (!o) setConfirmId(null); }}
        title="Delete weight entry?"
        description="This weight entry will be permanently removed."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmId); setConfirmId(null); }}
      />
    </div>
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
      const { data, error } = await supabase.from("measurements").select("*").eq("created_by", user.id).order("date", { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { created_by: user.id, date, notes: notes || null };
      MEASUREMENT_FIELDS.forEach(f => { if (form[f.key]) payload[f.key] = parseFloat(form[f.key]); });
      const { error } = await supabase.from("measurements").insert(payload);
      if (error) throw error;
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
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="min-h-[44px] text-xs w-36 font-technical" />
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {MEASUREMENT_FIELDS.map(f => (
              <div key={f.key}>
                <Label className="text-[10px] text-ink-muted mb-1 block uppercase tracking-wider">{f.label}</Label>
                <Input
                  type="number"
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
                  <tr key={row.id} className="border-b hairline last:border-0 group hover:bg-white/[0.08]">
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
          Open the Physique tracker — pose tracking, side-by-side compare, and body-fat trend.
        </p>
      </div>
      <ArrowUpRight className="w-4 h-4 text-faint shrink-0" />
    </Link>
  );
}

function MetabolismTab() {
  const { user } = useAuth();
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

  const weightTrend = state?.nutrition?.weight_trend_lbs_per_week;

  return (
    <div className="space-y-6">
      <Card className="glass glass-interactive">
        <CardContent className="pt-6 pb-6 px-5">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-gold" />
                <h3 className="section-label !text-ink">Expenditure Engine</h3>
              </div>
              <Badge className={state?.nutrition ? "bg-teal/10 text-teal border-none" : "bg-white/[0.06] text-muted-2 border-none"}>
                {state?.nutrition ? "Active" : "No data"}
              </Badge>
           </div>
           <div className="text-center py-4">
              <p className="hero-metric text-ink text-4xl">{state?.nutrition?.avg_calories_7d || state?.nutrition?.avg_daily_calories_7d || "—"}</p>
              <p className="text-[10px] text-muted-2 mt-1.5 font-bold uppercase tracking-[0.08em]">Calculated Burn (7d Avg)</p>
           </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-2 gap-3">
         <Card className="glass glass-interactive p-4">
            <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] mb-1 flex items-center gap-1.5">
              <i className="w-[5px] h-[5px] rounded-full shrink-0 bg-violet" /> Weight Trend
            </p>
            <p className="font-technical text-lg font-extrabold text-ink">{weightTrend != null ? `${weightTrend > 0 ? "+" : ""}${weightTrend} lbs/wk` : "—"}</p>
         </Card>
         {(() => {
            // Net energy derived from the measured weight trend rather than a
            // hardcoded label: a sustained weight change *is* the energy balance.
            const trend = Number(state?.nutrition?.weight_trend_lbs_per_week);
            const known = state?.nutrition?.weight_trend_lbs_per_week != null && !Number.isNaN(trend);
            const net = !known ? { label: "—", cls: "text-muted-2" }
              : trend > 0.15 ? { label: "Surplus", cls: "text-warn" }
              : trend < -0.15 ? { label: "Deficit", cls: "text-carb" }
              : { label: "Balanced", cls: "text-teal" };
            return (
              <Card className="glass glass-interactive p-4">
                <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] mb-1 flex items-center gap-1.5">
                  <i className="w-[5px] h-[5px] rounded-full shrink-0 bg-gold" /> Net Energy
                </p>
                <p className={`font-technical text-lg font-extrabold ${net.cls}`}>{net.label}</p>
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
export default function Progress() {
  return (
    <Tabs defaultValue="weight">
      {/* Subordinate to the parent Fuel SubTabs: a lighter, contained segmented
          control (glass-inset, no full-width underline strip) so the two nav
          levels read as a clear hierarchy rather than two equal-weight strips. */}
      <TabsList className="mb-4 h-auto gap-1 border-b-0 p-1 glass-inset rounded-lg !justify-start">
        <TabsTrigger value="metabolism" className="!min-h-[44px] !py-1.5 rounded-md !text-xs">Metabolism</TabsTrigger>
        <TabsTrigger value="weight" className="!min-h-[44px] !py-1.5 rounded-md !text-xs">Weight</TabsTrigger>
        <TabsTrigger value="measurements" className="!min-h-[44px] !py-1.5 rounded-md !text-xs">Measurements</TabsTrigger>
        <TabsTrigger value="photos" className="!min-h-[44px] !py-1.5 rounded-md !text-xs">Photos</TabsTrigger>
      </TabsList>
      <TabsContent value="metabolism"><MetabolismTab /></TabsContent>
      <TabsContent value="weight"><WeightTab /></TabsContent>
      <TabsContent value="measurements"><MeasurementsTab /></TabsContent>
      <TabsContent value="photos"><PhotosLink /></TabsContent>
    </Tabs>
  );
}
