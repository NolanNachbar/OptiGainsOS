import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Scale, Utensils, Droplets, Pill, PenLine, Plus,
  ChevronRight, Mic, Camera, History, CheckCircle2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import QuickCapture from "@/components/QuickCapture";
import { useBodyWeightEntries, useProfile } from "@/hooks/useUserQueries";
import { invalidateBodyWeight } from "@/lib/queryKeys";

export default function LogHub() {
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
    <div className="px-4 py-6 md:px-8 bg-[#121212] min-h-screen">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Log Hub</h1>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="text-[#555]"><Mic className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" className="text-[#555]"><Camera className="w-5 h-5" /></Button>
          </div>
        </header>

        {/* Weight Log */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">Weight</h2>
          <Card className="glass glass-interactive">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-brand/10">
                  <Scale className="w-5 h-5 text-brand" />
                </div>
                {todayWeight ? (
                  <div>
                    <p className="text-lg font-bold text-white">{todayWeight.weight} {profile?.weight_unit || "lbs"}</p>
                    <p className="text-[10px] text-brand uppercase font-bold">Logged today</p>
                  </div>
                ) : (
                  <p className="text-sm text-[#a0a0a0]">Not logged yet</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="0.0"
                  className="w-20 h-9"
                />
                <Button variant="volt" size="sm" onClick={() => logWeightMutation.mutate()} disabled={!weight}>
                  Log
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Nutrition Link */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">Nutrition</h2>
          <Link to="/food-tracker">
            <Card className="glass glass-interactive hover:bg-[#222] transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Utensils className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Log Food</p>
                    <p className="text-xs text-[#555555]">Search or scan barcodes</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#333]" />
              </CardContent>
            </Card>
          </Link>
        </section>

        {/* Water Increments */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">Water</h2>
            <span className="text-xs font-bold text-blue-400">{totalWater}ml</span>
          </div>
          <div className="flex gap-2">
            {[250, 500, 750].map(ml => (
              <Button
                key={ml}
                variant="ghost"
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] h-12 text-xs font-bold text-[#a0a0a0] hover:bg-blue-500/10 hover:text-blue-400"
                onClick={() => addWater.mutate(ml)}
              >
                +{ml}ml
              </Button>
            ))}
          </div>
        </section>

        {/* Supplement Checklist */}
        {suppTypes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">Supplements</h2>
            <div className="grid grid-cols-2 gap-2">
              {suppTypes.map(type => {
                const taken = takenSuppNames.has(type.name);
                return (
                  <Button
                    key={type.id}
                    variant="ghost"
                    className={`h-auto py-3 px-4 justify-start border transition-all ${
                      taken ? "bg-brand/5 border-brand/20 text-brand" : "glass glass-interactive text-[#a0a0a0]"
                    }`}
                    onClick={() => logSupp.mutate(type)}
                  >
                    <div className="flex items-center gap-2">
                      {taken ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      <span className="text-xs font-semibold text-left">{type.name}</span>
                    </div>
                  </Button>
                );
              })}
            </div>
          </section>
        )}

        {/* Quick Capture */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">Stream to Second Brain</h2>
          <QuickCapture domain="general" placeholder="Stream a note..." />
        </section>

        {/* Recent History */}
        <section className="space-y-3 pt-4 pb-12">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#555555] flex items-center gap-2">
            <History className="w-3 h-3" /> Recent Activity
          </h2>
          <div className="space-y-2">
            {todaySupps.slice(0, 3).map(s => (
              <div key={s.id} className="flex items-center justify-between text-[11px] text-[#555] px-3 py-2 bg-[#161616] rounded-lg border border-[#222]">
                <span>Took {s.supplement_name}</span>
                <span>{format(parseISO(s.taken_at), "h:mm a")}</span>
              </div>
            ))}
            {todayWater.slice(-3).reverse().map(w => (
              <div key={w.id} className="flex items-center justify-between text-[11px] text-[#555] px-3 py-2 bg-[#161616] rounded-lg border border-[#222]">
                <span>Drank {w.amount_ml}ml water</span>
                <span>{format(parseISO(w.logged_at), "h:mm a")}</span>
              </div>
            ))}
            {todayWeight && (
              <div className="flex items-center justify-between text-[11px] text-[#555] px-3 py-2 bg-[#161616] rounded-lg border border-[#222]">
                <span>Logged Weight: {todayWeight.weight}</span>
                <span>{format(parseISO(todayWeight.recorded_date), "MMM d")}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
