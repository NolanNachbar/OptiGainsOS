import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Pill, Droplets, Trash2, CheckCircle2, Clock, X, Pencil,
} from "lucide-react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { getTodayString } from "@/utils/dateUtils";
import { useProfile } from "@/hooks/useUserQueries";
import { toast } from "sonner";

const DEFAULT_WATER_GOAL_ML = 3000;
const WATER_INCREMENTS = [100, 250, 500];

// Personalized hydration target: ~35 ml per kg bodyweight, rounded to 50 ml.
function waterGoalMl(profile) {
  const w = profile?.current_weight;
  if (!w) return DEFAULT_WATER_GOAL_ML;
  const kg = profile.weight_unit === "kg" ? w : w / 2.205;
  return Math.round((kg * 35) / 50) * 50;
}

// ─── Water Card ────────────────────────────────────────────────────────────────
function WaterCard({ today }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const WATER_GOAL_ML = waterGoalMl(profile);

  const { data: todayWater = [] } = useQuery({
    queryKey: ["water-logs", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("water_logs")
        .select("*")
        .eq("created_by", user.id)
        .gte("logged_at", today + "T00:00:00")
        .lte("logged_at", today + "T23:59:59")
        .order("logged_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const totalMl = todayWater.reduce((s, e) => s + e.amount_ml, 0);
  const pct = Math.min(100, (totalMl / WATER_GOAL_ML) * 100);

  const addWater = useMutation({
    mutationFn: async (ml) => {
      const { error } = await supabase.from("water_logs").insert({
        created_by: user.id,
        amount_ml: ml,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["water-logs", today] }),
    onError: () => toast.error("Failed to log water"),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("water_logs").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["water-logs", today] }),
  });

  return (
    <Card className="glass glass-interactive">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-400" />
          Water
          <span className="text-slate-500 font-normal text-xs ml-auto">{totalMl} / {WATER_GOAL_ML} ml</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="h-2 bg-charcoal-elevated rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-2 mb-4">
          {WATER_INCREMENTS.map(ml => (
            <Button
              key={ml}
              variant="ghost"
              size="sm"
              onClick={() => addWater.mutate(ml)}
              disabled={addWater.isPending}
              className="flex-1 h-9 bg-charcoal-elevated hover:bg-blue-500/10 hover:text-blue-400 border border-charcoal-border text-slate-400 text-xs font-bold"
            >
              +{ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`}
            </Button>
          ))}
        </div>
        {todayWater.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {[...todayWater].reverse().map(entry => (
              <div key={entry.id} className="flex items-center justify-between group text-xs text-slate-500">
                <span>{format(parseISO(entry.logged_at), "h:mm a")} · {entry.amount_ml}ml</span>
                <button
                  onClick={() => deleteEntry.mutate(entry.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Supplement Type Form ──────────────────────────────────────────────────────
function SupplementForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [dose, setDose] = useState(initial?.default_dose || "");
  const [unit, setUnit] = useState(initial?.unit || "mg");
  const [timing, setTiming] = useState(initial?.timing_note || "");

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-slate-400 mb-1.5 block">Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Creatine" className="h-9" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-400 mb-1.5 block">Default Dose</Label>
          <Input type="number" value={dose} onChange={e => setDose(e.target.value)} placeholder="5" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-slate-400 mb-1.5 block">Unit</Label>
          <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="mg, g, IU, cap" className="h-9" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-slate-400 mb-1.5 block">Timing note (optional)</Label>
        <Input value={timing} onChange={e => setTiming(e.target.value)} placeholder="e.g. With breakfast" className="h-9" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
        <Button
          variant="volt"
          size="sm"
          onClick={() => onSave({ name, default_dose: dose ? parseFloat(dose) : null, unit, timing_note: timing })}
          disabled={!name.trim()}
          className="flex-1"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Supplements({ embedded = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getTodayString();

  const [showAddType, setShowAddType] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [logDoses, setLogDoses] = useState({});

  const { data: suppTypes = [] } = useQuery({
    queryKey: ["supplement-types", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplement_types")
        .select("*")
        .eq("created_by", user.id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: todayLogs = [] } = useQuery({
    queryKey: ["supplement-logs", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplement_logs")
        .select("*")
        .eq("created_by", user.id)
        .gte("taken_at", today + "T00:00:00")
        .lte("taken_at", today + "T23:59:59")
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const addType = useMutation({
    mutationFn: async (fields) => {
      const { error } = await supabase.from("supplement_types").insert({ ...fields, created_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplement-types"] });
      setShowAddType(false);
      toast.success("Supplement added");
    },
    onError: () => toast.error("Failed to save"),
  });

  const updateType = useMutation({
    mutationFn: async ({ id, fields }) => {
      const { error } = await supabase.from("supplement_types").update(fields).eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplement-types"] });
      setEditingType(null);
      toast.success("Updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteType = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("supplement_types").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplement-types"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const logSupp = useMutation({
    mutationFn: async ({ type, dose }) => {
      const { error } = await supabase.from("supplement_logs").insert({
        created_by: user.id,
        supplement_type_id: type.id,
        supplement_name: type.name,
        dose: parseFloat(dose) || type.default_dose,
        unit: type.unit,
      });
      if (error) throw error;
    },
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: ["supplement-logs", today] });
      setLogDoses(prev => ({ ...prev, [type.id]: "" }));
      toast.success(`${_.supplement_name || "Supplement"} logged`);
    },
    onError: () => toast.error("Failed to log"),
  });

  const deleteLog = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("supplement_logs").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplement-logs", today] }),
  });

  const takenNames = new Set(todayLogs.map(l => l.supplement_name));

  return (
    <div className={embedded ? "" : "px-4 py-6 md:px-8 min-h-screen"}>
      <div className={embedded ? "" : "max-w-2xl mx-auto"}>
        <header className={embedded ? "mb-4" : "mb-8"}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand/10">
                <Pill className="w-5 h-5 text-brand" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Supplements & Water</h1>
                <p className="text-xs text-slate-500 mt-0.5">{format(new Date(), "EEEE, MMMM d")}</p>
              </div>
            </div>
            <Button variant="volt" size="sm" onClick={() => setShowAddType(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Supplement
            </Button>
          </div>
        </header>

        {/* Water */}
        <div className="mb-6">
          <WaterCard today={today} />
        </div>

        {/* Today's supplement status */}
        {suppTypes.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Today's Log</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suppTypes.map(type => {
                const taken = takenNames.has(type.name);
                const dose = logDoses[type.id] ?? "";
                return (
                  <div
                    key={type.id}
                    className={`p-4 rounded-xl border ${taken ? "bg-brand/[5%] border-brand/20" : "glass glass-interactive"}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          {taken && <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />}
                          <span className="text-sm font-semibold text-white">{type.name}</span>
                        </div>
                        {type.timing_note && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px] text-slate-500">{type.timing_note}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingType(type)}
                          className="p-1 text-slate-500 hover:text-brand transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteType.mutate(type.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={dose}
                        onChange={e => setLogDoses(prev => ({ ...prev, [type.id]: e.target.value }))}
                        placeholder={type.default_dose ? `${type.default_dose} ${type.unit || ""}` : "dose"}
                        className="h-7 text-xs flex-1 bg-charcoal border-charcoal-border"
                      />
                      <Button
                        size="sm"
                        variant={taken ? "ghost" : "volt"}
                        className="h-7 px-3 text-xs shrink-0"
                        onClick={() => logSupp.mutate({ type, dose: dose || type.default_dose })}
                        disabled={logSupp.isPending}
                      >
                        {taken ? "Log Again" : "Log"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Today's log entries */}
        {todayLogs.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Taken Today</h2>
            <div className="space-y-2">
              {todayLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-charcoal-surface border border-charcoal-border group">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span className="text-sm text-white font-medium">{log.supplement_name}</span>
                    {log.dose && (
                      <Badge variant="outline" className="text-[10px] text-slate-500 border-charcoal-border bg-transparent">
                        {log.dose}{log.unit || ""}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{format(parseISO(log.taken_at), "h:mm a")}</span>
                    <button
                      onClick={() => deleteLog.mutate(log.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {suppTypes.length === 0 && (
          <div className="py-16 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
            <Pill className="w-8 h-8 text-slate-800 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No supplements configured.</p>
            <p className="text-xs text-slate-700 mt-1">Add your stack to enable one-tap daily logging.</p>
            <Button variant="volt" size="sm" className="mt-4" onClick={() => setShowAddType(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Supplement
            </Button>
          </div>
        )}
      </div>

      {/* Add supplement type dialog */}
      <Dialog open={showAddType} onOpenChange={setShowAddType}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Add Supplement</DialogTitle>
          </DialogHeader>
          <SupplementForm onSave={(fields) => addType.mutate(fields)} onClose={() => setShowAddType(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit supplement type dialog */}
      <Dialog open={!!editingType} onOpenChange={() => setEditingType(null)}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Supplement</DialogTitle>
          </DialogHeader>
          {editingType && (
            <SupplementForm
              initial={editingType}
              onSave={(fields) => updateType.mutate({ id: editingType.id, fields })}
              onClose={() => setEditingType(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
