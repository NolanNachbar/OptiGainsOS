import { useState } from "react";
import FoodTracker from "./FoodTracker";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Scale, Droplets, Pill, Plus, CheckCircle2, History, Bot, Apple, Utensils
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import QuickCapture from "@/components/QuickCapture";
import { useBodyWeightEntries, useProfile } from "@/hooks/useUserQueries";
import { invalidateBodyWeight } from "@/lib/queryKeys";

export default function Fuel() {
  const [activeTab, setActiveTab] = useState("nutrition");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);

  const [weight, setWeight] = useState("");

  const { weightEntries } = useBodyWeightEntries();
  const todayWeight = weightEntries.find(e => e.recorded_date === today);

  const logWeightMutation = useMutation({
    mutationFn: async () => {
      if (!weight) return;
      return await db.entities.BodyWeightEntry.create({
        weight: parseFloat(weight),
        recorded_date: today,
        created_by: user.id,
      });
    },
    onSuccess: () => {
      invalidateBodyWeight(queryClient);
      setWeight("");
      toast.success("Weight logged");
    },
  });

  const { data: todayWater = [] } = useQuery({
    queryKey: ["water-logs", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("water_logs")
        .select("*")
        .eq("created_by", user.id)
        .gte("logged_at", today + "T00:00:00")
        .lte("logged_at", today + "T23:59:59");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
  const totalWater = todayWater.reduce((s, e) => s + e.amount_ml, 0);

  const addWater = useMutation({
    mutationFn: async (ml) => {
      await supabase.from("water_logs").insert({ created_by: user.id, amount_ml: ml });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["water-logs", today] }),
  });

  const { data: suppTypes = [] } = useQuery({
    queryKey: ["supplement-types", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplement_types").select("*").eq("created_by", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: todaySupps = [] } = useQuery({
    queryKey: ["supplement-logs", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplement_logs")
        .select("*")
        .eq("created_by", user.id)
        .gte("taken_at", today + "T00:00:00")
        .lte("taken_at", today + "T23:59:59");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
  const takenSuppNames = new Set(todaySupps.map(s => s.supplement_name));

  const logSupp = useMutation({
    mutationFn: async (type) => {
      await supabase.from("supplement_logs").insert({
        created_by: user.id,
        supplement_type_id: type.id,
        supplement_name: type.name,
        dose: type.default_dose,
        unit: type.unit,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplement-logs", today] }),
  });

  return (
    <div className="bg-[#09090e] min-h-screen text-white">
      {/* Tab Switcher */}
      <div className="border-b border-charcoal-border bg-charcoal-surface/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("nutrition")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${
                activeTab === "nutrition"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5" /> Nutrition & Meals
              </div>
            </button>
            <button
              onClick={() => setActiveTab("wellness")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${
                activeTab === "wellness"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5" /> Hydration & Wellness
              </div>
            </button>
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest hidden sm:inline">
            Fuel System
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {activeTab === "nutrition" ? (
          <FoodTracker />
        ) : (
          <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
            
            {/* Weight Section */}
            <section className="space-y-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-sky-400" /> Weight Logger
              </h2>
              <Card className="bg-charcoal-surface border-charcoal-border shadow-dark-card">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {todayWeight ? (
                      <div>
                        <p className="text-lg font-bold text-white font-mono leading-none">{todayWeight.weight} <span className="text-xs text-slate-400 font-normal">{profile?.weight_unit || "lbs"}</span></p>
                        <p className="text-[9px] text-emerald-400 font-bold uppercase mt-1 leading-none">Logged today</p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 font-medium">No weight logged today</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={weight}
                      onChange={e => setWeight(e.target.value)}
                      placeholder="0.0"
                      className="w-20 h-9 text-sm font-semibold"
                    />
                    <Button variant="volt" size="sm" onClick={() => logWeightMutation.mutate()} disabled={!weight}>
                      Log
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Hydration Section */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-brand" /> Water Log
                </h2>
                <span className="text-sm font-bold text-brand font-mono">{totalWater} ml</span>
              </div>
              <div className="flex gap-2">
                {[250, 500, 750].map(ml => (
                  <Button
                    key={ml}
                    variant="ghost"
                    className="flex-1 bg-charcoal-surface border border-charcoal-border h-12 text-xs font-bold text-slate-400 hover:bg-brand/10 hover:text-brand transition-all"
                    onClick={() => addWater.mutate(ml)}
                  >
                    +{ml}ml
                  </Button>
                ))}
              </div>
            </section>

            {/* Supplement Section */}
            {suppTypes.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5 text-emerald-400" /> Supplement Checklist
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {suppTypes.map(type => {
                    const taken = takenSuppNames.has(type.name);
                    return (
                      <Button
                        key={type.id}
                        variant="ghost"
                        className={`h-auto py-3 px-4 justify-start border transition-all ${
                          taken 
                            ? "bg-brand/5 border-brand/20 text-brand font-bold" 
                            : "bg-charcoal-surface border-charcoal-border text-slate-400"
                        }`}
                        onClick={() => logSupp.mutate(type)}
                      >
                        <div className="flex items-center gap-2">
                          {taken ? <CheckCircle2 className="w-4 h-4 text-brand" /> : <Plus className="w-4 h-4 text-slate-500" />}
                          <span className="text-xs font-semibold text-left capitalize leading-tight">{type.name}</span>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Quick Capture */}
            <section className="space-y-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stream Note</h2>
              <QuickCapture domain="general" placeholder="Stream a note to Second Brain..." />
            </section>

            {/* Recent History */}
            <section className="space-y-2 pt-2 pb-12">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" /> Recent Activity
              </h2>
              <div className="space-y-1.5">
                {todaySupps.slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs text-slate-500 px-3.5 py-2.5 bg-charcoal-surface/60 rounded-xl border border-charcoal-border">
                    <span>Took {s.supplement_name}</span>
                    <span className="font-mono text-[10px]">{format(parseISO(s.taken_at), "h:mm a")}</span>
                  </div>
                ))}
                {todayWater.slice(-3).reverse().map(w => (
                  <div key={w.id} className="flex items-center justify-between text-xs text-slate-500 px-3.5 py-2.5 bg-charcoal-surface/60 rounded-xl border border-charcoal-border">
                    <span>Drank {w.amount_ml}ml water</span>
                    <span className="font-mono text-[10px]">{format(parseISO(w.logged_at), "h:mm a")}</span>
                  </div>
                ))}
                {todayWeight && (
                  <div className="flex items-center justify-between text-xs text-slate-500 px-3.5 py-2.5 bg-charcoal-surface/60 rounded-xl border border-charcoal-border">
                    <span>Logged Weight: {todayWeight.weight} {profile?.weight_unit || "lbs"}</span>
                    <span className="font-mono text-[10px]">{format(parseISO(todayWeight.recorded_date), "MMM d")}</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
