import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Waves, Plus, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getTodayString } from "@/utils/dateUtils";

// BUD/S competitive PST targets
const PST_TARGETS = {
  swim:    { label: "500yd Swim", unit: "sec", target: 540,  lower_is_better: true,  competitive: 480 },
  pushups: { label: "Push-ups",   unit: "reps", target: 100, lower_is_better: false, competitive: 100 },
  situps:  { label: "Sit-ups",    unit: "reps", target: 100, lower_is_better: false, competitive: 100 },
  pullups: { label: "Pull-ups",   unit: "reps", target: 20,  lower_is_better: false, competitive: 20  },
  run:     { label: "1.5mi Run",  unit: "sec",  target: 570, lower_is_better: true,  competitive: 540 },
};

function fmtTime(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PSTBar({ event, value }) {
  const cfg = PST_TARGETS[event];
  if (!value) return (
    <div className="flex items-center justify-between text-sm mb-3">
      <span className="text-muted-2 font-semibold w-28">{cfg.label}</span>
      <span className="text-muted-2 font-semibold text-xs">Not logged</span>
    </div>
  );

  let pct;
  if (cfg.lower_is_better) {
    // Lower is better: pct = competitive/value (capped at 1)
    pct = Math.min((cfg.competitive / value) * 100, 100);
  } else {
    pct = Math.min((value / cfg.target) * 100, 100);
  }

  const display = (event === "swim" || event === "run") ? fmtTime(value) : `${value}`;
  const targetDisplay = (event === "swim" || event === "run") ? fmtTime(cfg.target) : `${cfg.target}`;
  const isGood = pct >= 100;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-secondary font-bold">{cfg.label}</span>
        <span className={`font-technical font-bold ${isGood ? "text-teal" : "text-muted-2"}`}>
          {display} <span className="text-muted-2 font-semibold">/ target {targetDisplay}</span>
        </span>
      </div>
      <div className="h-1.5 bg-charcoal-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isGood ? "bg-teal" : "bg-carb"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function PSTTracker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    test_date: getTodayString(),
    swim_min: "", swim_sec: "",
    pushups: "", situps: "", pullups: "",
    run_min: "", run_sec: "",
    notes: "",
  });

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["pst-tests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pst_tests")
        .select("*")
        .eq("created_by", user.id)
        .order("test_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const swim_seconds = form.swim_min ? parseInt(form.swim_min) * 60 + parseInt(form.swim_sec || 0) : null;
      const run_seconds  = form.run_min  ? parseInt(form.run_min)  * 60 + parseInt(form.run_sec  || 0) : null;
      const row = {
        created_by:   user.id,
        test_date:    form.test_date,
        swim_seconds: swim_seconds || null,
        pushups:      form.pushups  ? parseInt(form.pushups)  : null,
        situps:       form.situps   ? parseInt(form.situps)   : null,
        pullups:      form.pullups  ? parseInt(form.pullups)  : null,
        run_seconds:  run_seconds   || null,
        notes:        form.notes    || null,
      };
      const { error } = await supabase.from("pst_tests").upsert(row, { onConflict: "created_by,test_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pst-tests", user?.id] });
      setShowForm(false);
      toast.success("PST test logged");
    },
    onError: () => toast.error("Failed to save PST test"),
  });

  const latest = tests[0];
  const prev   = tests[1];

  return (
    <Card className="glass glass-interactive">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="section-label !text-ink flex items-center gap-2 normal-case">
            <Waves className="w-3.5 h-3.5 text-carb" />
            PST Performance
          </CardTitle>
          <Button variant="ghost" size="sm" className="min-h-[44px] gap-1 text-xs px-4" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5" /> Log Test
          </Button>
        </div>
        {latest?.test_date && (
          <p className="font-technical text-[10px] font-semibold text-muted-2 mt-1">Last tested: {latest.test_date}</p>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {isLoading ? (
          <p className="text-xs font-semibold text-muted-2">Loading…</p>
        ) : !latest ? (
          <div className="text-center py-4">
            <Trophy className="w-8 h-8 mx-auto text-faint mb-2" />
            <p className="text-sm font-semibold text-muted-2">No PST data yet.</p>
            <p className="text-xs font-semibold text-faint mt-1">Log your first test to track progress.</p>
          </div>
        ) : (
          <>
            <PSTBar event="swim"    value={latest.swim_seconds} />
            <PSTBar event="pushups" value={latest.pushups} />
            <PSTBar event="situps"  value={latest.situps} />
            <PSTBar event="pullups" value={latest.pullups} />
            <PSTBar event="run"     value={latest.run_seconds} />

            {/* Comparison with previous */}
            {prev && (
              <div className="mt-3 pt-3 border-t hairline">
                <p className="section-label mb-2">vs previous ({prev.test_date})</p>
                <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                  {[
                    { label: "Swim", cur: latest.swim_seconds, prv: prev.swim_seconds, lower: true },
                    { label: "Push", cur: latest.pushups,      prv: prev.pushups,      lower: false },
                    { label: "Sit",  cur: latest.situps,       prv: prev.situps,       lower: false },
                    { label: "Pull", cur: latest.pullups,      prv: prev.pullups,      lower: false },
                    { label: "Run",  cur: latest.run_seconds,  prv: prev.run_seconds,  lower: true },
                  ].map(({ label, cur, prv, lower }) => {
                    const delta = cur != null && prv != null ? cur - prv : null;
                    const improved = delta != null && (lower ? delta < 0 : delta > 0);
                    return (
                      <div key={label}>
                        <p className="text-muted-2 font-semibold">{label}</p>
                        {delta != null ? (
                          <p className={`font-technical font-bold ${improved ? "text-teal" : "text-muted-2"}`}>
                            {lower ? (delta < 0 ? "-" : "+") : (delta > 0 ? "+" : "")}{lower ? Math.abs(delta) + "s" : Math.abs(delta)}
                          </p>
                        ) : (
                          <p className="text-faint">—</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Log PST Test dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log PST Test</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="section-label mb-1 block">Date</label>
              <Input
                type="date"
                value={form.test_date}
                onChange={e => setForm(f => ({ ...f, test_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="section-label mb-1 block">500yd Swim (min:sec)</label>
              <div className="flex gap-2">
                <Input type="number" placeholder="min" min="0" value={form.swim_min} onChange={e => setForm(f => ({ ...f, swim_min: e.target.value }))} className="flex-1" />
                <Input type="number" placeholder="sec" min="0" max="59" value={form.swim_sec} onChange={e => setForm(f => ({ ...f, swim_sec: e.target.value }))} className="flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["pushups","Push-ups"],["situps","Sit-ups"],["pullups","Pull-ups"]].map(([field, label]) => (
                <div key={field}>
                  <label className="section-label mb-1 block">{label}</label>
                  <Input type="number" min="0" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div>
              <label className="section-label mb-1 block">1.5mi Run (min:sec)</label>
              <div className="flex gap-2">
                <Input type="number" placeholder="min" min="0" value={form.run_min} onChange={e => setForm(f => ({ ...f, run_min: e.target.value }))} className="flex-1" />
                <Input type="number" placeholder="sec" min="0" max="59" value={form.run_sec} onChange={e => setForm(f => ({ ...f, run_sec: e.target.value }))} className="flex-1" />
              </div>
            </div>
            <div>
              <label className="section-label mb-1 block">Notes</label>
              <Textarea rows={2} placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="volt" size="lg" className="flex-1" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                  </>
                ) : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
