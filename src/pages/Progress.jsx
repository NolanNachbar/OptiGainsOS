import { useState, useRef } from "react";
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
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#555555] mb-4">Log Weight</h3>
          <div className="flex gap-3 items-end">
            <div>
              <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm w-36" />
            </div>
            <div>
              <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Weight ({weightUnit})</Label>
              <Input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.0" className="h-9 w-28" />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Morning, fasted..." className="h-9" />
            </div>
            <Button variant="volt" size="sm" className="h-9 px-4 shrink-0" disabled={!weight || add.isPending} onClick={() => add.mutate()}>
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
      {sorted.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#555555] mb-3">History</h3>
          <div className="space-y-1.5">
            {[...sorted].reverse().slice(0, 20).map((entry, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? (entry.weight - prev.weight) : null;
              return (
                <div key={entry.id} className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] group">
                  <span className="text-xs text-[#555555] w-20 shrink-0">{format(parseISO(entry.recorded_date), "MMM d, yyyy")}</span>
                  <span className="text-sm font-semibold text-white font-mono">{entry.weight} {weightUnit}</span>
                  {diff !== null && (
                    <span className={`text-xs font-mono flex items-center gap-0.5 ${diff > 0 ? "text-yellow-400" : diff < 0 ? "text-green-400" : "text-[#555555]"}`}>
                      {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                    </span>
                  )}
                  {entry.notes && <span className="text-xs text-[#555555] italic flex-1 truncate">{entry.notes}</span>}
                  <button onClick={() => del.mutate(entry.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-[#555555] hover:text-red-400 transition-all shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
    <span className={`text-[10px] font-mono ml-1 ${diff > 0 ? "text-yellow-400" : "text-green-400"}`}>
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

  const { data: history = [] } = useQuery({
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
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#555555]">Log Measurements (cm)</h3>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {MEASUREMENT_FIELDS.map(f => (
              <div key={f.key}>
                <Label className="text-[10px] text-[#555555] mb-1 block uppercase tracking-wider">{f.label}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form[f.key] || ""}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={latest?.[f.key] ? String(latest[f.key]) : "—"}
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className="h-8 text-xs" />
            </div>
            <Button variant="volt" size="sm" className="h-8 px-4 shrink-0" disabled={!hasData || save.isPending} onClick={() => save.mutate()}>
              Save Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Latest vs previous */}
      {latest && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#555555] mb-3">Latest · {format(parseISO(latest.date), "MMM d, yyyy")}</h3>
          <div className="grid grid-cols-4 gap-2">
            {MEASUREMENT_FIELDS.filter(f => latest[f.key]).map(f => (
              <div key={f.key} className="p-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-center">
                <p className="text-[10px] text-[#555555] uppercase tracking-wider mb-1">{f.label}</p>
                <p className="text-sm font-bold text-white font-mono">
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
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#555555] mb-3">History</h3>
          <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="text-left px-4 py-2.5 text-[#555555] font-bold uppercase tracking-wider whitespace-nowrap">Date</th>
                  {MEASUREMENT_FIELDS.map(f => (
                    <th key={f.key} className="text-right px-3 py-2.5 text-[#555555] font-bold uppercase tracking-wider whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => (
                  <tr key={row.id} className="border-b border-[#2a2a2a] last:border-0 group hover:bg-[#1f1f1f]">
                    <td className="px-4 py-2.5 text-[#a0a0a0] whitespace-nowrap">{format(parseISO(row.date), "MMM d, yyyy")}</td>
                    {MEASUREMENT_FIELDS.map(f => (
                      <td key={f.key} className="px-3 py-2.5 text-right font-mono text-white">{row[f.key] ?? "—"}</td>
                    ))}
                    <td className="px-2 py-2.5">
                      <button onClick={() => del.mutate(row.id)} className="opacity-0 group-hover:opacity-100 text-[#555555] hover:text-red-400 transition-all">
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
    </div>
  );
}

// ─── Photos Tab ────────────────────────────────────────────────────────────────
function PhotosTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [angle, setAngle] = useState("front");
  const [photoDate, setPhotoDate] = useState(getTodayString());
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  const [signedUrls, setSignedUrls] = useState({});

  const { data: photos = [] } = useQuery({
    queryKey: ["progress-photos", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("progress_photos").select("*").eq("created_by", user.id).order("date", { ascending: false });
      if (error) throw error;
      // Fetch signed URLs for all photos
      const urls = {};
      await Promise.all((data || []).map(async p => {
        const { data: urlData } = await supabase.storage.from("progress-photos").createSignedUrl(p.storage_path, 3600);
        if (urlData?.signedUrl) urls[p.id] = urlData.signedUrl;
      }));
      setSignedUrls(urls);
      return data || [];
    },
    enabled: !!user,
    staleTime: 30 * 60 * 1000,
  });

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${photoDate}/${angle}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("progress-photos").upload(path, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("progress_photos").insert({
        created_by: user.id, date: photoDate, storage_path: path, angle,
      });
      if (dbErr) throw dbErr;
      qc.invalidateQueries({ queryKey: ["progress-photos"] });
      toast.success("Photo saved");
    } catch (e) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const del = useMutation({
    mutationFn: async ({ id, storage_path }) => {
      await supabase.storage.from("progress-photos").remove([storage_path]);
      const { error } = await supabase.from("progress_photos").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["progress-photos"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const ANGLE_COLORS = { front: "text-brand border-brand/20 bg-brand/10", side: "text-blue-400 border-blue-400/20 bg-blue-400/10", back: "text-purple-400 border-purple-400/20 bg-purple-400/10" };

  // Group photos by date
  const grouped = photos.reduce((acc, p) => {
    const d = p.date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Upload */}
      <Card className="glass glass-interactive">
        <CardContent className="pt-4 pb-5 px-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#555555] mb-4">Add Photo</h3>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Date</Label>
              <Input type="date" value={photoDate} onChange={e => setPhotoDate(e.target.value)} className="h-9 text-sm w-36" />
            </div>
            <div>
              <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Angle</Label>
              <Select value={angle} onValueChange={setAngle}>
                <SelectTrigger className="h-9 text-sm w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="front">Front</SelectItem>
                  <SelectItem value="side">Side</SelectItem>
                  <SelectItem value="back">Back</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files[0])} />
            <Button variant="volt" size="sm" className="h-9 gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />{uploading ? "Uploading…" : "Choose Photo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side comparison */}
      {photos.length >= 2 && (
        <Card className="glass glass-interactive">
          <CardContent className="pt-4 pb-5 px-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#555555] mb-4">Compare</h3>
            <div className="grid grid-cols-2 gap-4">
              {[compareA, compareB].map((selected, idx) => (
                <div key={idx}>
                  <Select
                    value={selected?.id || ""}
                    onValueChange={v => {
                      const p = photos.find(x => x.id === v);
                      if (idx === 0) setCompareA(p);
                      else setCompareB(p);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs mb-2"><SelectValue placeholder={`Pick photo ${idx + 1}`} /></SelectTrigger>
                    <SelectContent>
                      {photos.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {format(parseISO(p.date), "MMM d, yyyy")} · {p.angle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selected && signedUrls[selected.id] ? (
                    <img src={signedUrls[selected.id]} alt={selected.angle} className="w-full rounded-xl object-cover aspect-[3/4] bg-[#111]" />
                  ) : (
                    <div className="w-full aspect-[3/4] rounded-xl bg-[#111] border border-[#2a2a2a] flex items-center justify-center">
                      <Camera className="w-6 h-6 text-[#333]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo grid */}
      {Object.keys(grouped).length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-[#2a2a2a] rounded-2xl">
          <Camera className="w-8 h-8 text-[#2a2a2a] mx-auto mb-2" />
          <p className="text-sm text-[#555555]">No progress photos yet.</p>
          <p className="text-xs text-[#333] mt-1">Photos are stored privately in Supabase — only you can see them.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([date, datePhotos]) => (
          <div key={date}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#555555] mb-3">
              {format(parseISO(date), "EEEE, MMMM d, yyyy")}
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {datePhotos.map(photo => (
                <div key={photo.id} className="relative group">
                  {signedUrls[photo.id] ? (
                    <img src={signedUrls[photo.id]} alt={photo.angle} className="w-full rounded-xl object-cover aspect-[3/4] bg-[#111]" />
                  ) : (
                    <div className="w-full aspect-[3/4] rounded-xl bg-[#111] border border-[#2a2a2a] flex items-center justify-center">
                      <Camera className="w-5 h-5 text-[#333]" />
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ANGLE_COLORS[photo.angle] || ""}`}>{photo.angle}</span>
                  </div>
                  <button
                    onClick={() => del.mutate({ id: photo.id, storage_path: photo.storage_path })}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/80"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function MetabolismTab() {
  const { user } = useAuth();
  const today = getTodayString();
  const { data: state } = useQuery({
    queryKey: ["athlete-state", today, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("athlete_state").select("*").eq("created_by", user.id).eq("date", today).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <Card className="glass glass-interactive">
        <CardContent className="pt-6 pb-6 px-5">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">Expenditure Engine</h3>
              </div>
              <Badge className="bg-brand/10 text-brand border-none">Active</Badge>
           </div>
           <div className="text-center py-4">
              <p className="text-4xl font-bold text-white tabular-nums">{state?.nutrition?.avg_calories_7d || state?.nutrition?.avg_daily_calories_7d || "—"}</p>
              <p className="text-xs text-[#555] mt-1 font-bold uppercase tracking-widest">Calculated Burn (7d Avg)</p>
           </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-2 gap-3">
         <Card className="glass glass-interactive p-4">
            <p className="text-[10px] text-[#555] uppercase font-bold tracking-widest mb-1">Weight Trend</p>
            <p className="text-lg font-bold text-white">{state?.nutrition?.weight_trend_lbs_per_week || "—"} lbs/wk</p>
         </Card>
         {(() => {
            // Net energy derived from the measured weight trend rather than a
            // hardcoded label: a sustained weight change *is* the energy balance.
            const trend = Number(state?.nutrition?.weight_trend_lbs_per_week);
            const known = state?.nutrition?.weight_trend_lbs_per_week != null && !Number.isNaN(trend);
            const net = !known ? { label: "—", cls: "text-slate-500" }
              : trend > 0.15 ? { label: "Surplus", cls: "text-amber-400" }
              : trend < -0.15 ? { label: "Deficit", cls: "text-sky-400" }
              : { label: "Balanced", cls: "text-brand" };
            return (
              <Card className="glass glass-interactive p-4">
                <p className="text-[10px] text-[#555] uppercase font-bold tracking-widest mb-1">Net Energy</p>
                <p className={`text-lg font-bold ${net.cls}`}>{net.label}</p>
              </Card>
            );
         })()}
      </div>

      <div className="p-4 rounded-xl bg-brand/[5%] border border-brand/20">
         <p className="text-xs text-[#a0a0a0] leading-relaxed">
            The engine uses your daily intake and weight change to calculate your true expenditure. 
            This filters out water retention and glycogen fluctuations to show your actual metabolic rate.
         </p>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Progress() {
  return (
    <div className="px-4 py-6 md:px-8 bg-[#121212] min-h-screen">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-brand/10">
              <TrendingUp className="w-5 h-5 text-brand" />
            </div>
            <h1 className="text-2xl font-bold text-white">Progress</h1>
          </div>
          <p className="text-[#a0a0a0] text-sm pl-12">Body weight, measurements, and progress photos.</p>
        </header>

        <Tabs defaultValue="metabolism">
          <TabsList className="mb-6">
            <TabsTrigger value="metabolism">Metabolism</TabsTrigger>
            <TabsTrigger value="weight">Weight</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
          </TabsList>
          <TabsContent value="metabolism"><MetabolismTab /></TabsContent>
          <TabsContent value="weight"><WeightTab /></TabsContent>
          <TabsContent value="measurements"><MeasurementsTab /></TabsContent>
          <TabsContent value="photos"><PhotosTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
