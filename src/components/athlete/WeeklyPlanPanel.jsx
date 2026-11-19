import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarDays, FlaskConical } from "lucide-react";

// ── Weekly plan + controlled tests ────────────────────────────────────────────
// The engine writes weekly_plans (set targets + human-readable rationale) and
// controlled_tests (volume-tolerance ramps, PST diagnostics) that previously
// had no readers in the UI — surface them read-only here.
export default function WeeklyPlanPanel() {
  const { user } = useAuth();

  const { data: plan, isLoading: planLoading, isError: planError, refetch: refetchPlan } = useQuery({
    queryKey: ["weekly-plan", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_plans")
        .select("week_start,set_targets,frequency_targets,rationale,run_plan")
        .eq("created_by", user.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tests = [], isLoading: testsLoading, isError: testsError, refetch: refetchTests } = useQuery({
    queryKey: ["controlled-tests-active", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("controlled_tests")
        .select("*")
        .eq("created_by", user.id)
        .eq("status", "active");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = planLoading || testsLoading;
  const isError = planError || testsError;

  if (isError) {
    return (
      <Card className="glass glass-interactive mb-4">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="section-label flex items-center gap-2 normal-case">
            <CalendarDays className="w-3.5 h-3.5 text-gold" /> This Week&apos;s Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 text-center">
          <div className="pt-8">
            <AlertTriangle className="w-6 h-6 text-warn mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-2">Couldn&apos;t load weekly plan.</p>
            <Button variant="outline" className="mt-4 h-11" onClick={() => { refetchPlan(); refetchTests(); }}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="glass glass-interactive mb-4">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="section-label flex items-center gap-2 normal-case">
            <CalendarDays className="w-3.5 h-3.5 text-gold" /> This Week&apos;s Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          <div className="pulse-loop rounded-lg bg-track h-4 w-3/4" />
          <div className="pulse-loop rounded-lg bg-track h-4 w-1/2" />
          <div className="pulse-loop rounded-lg bg-track h-4 w-2/3" />
          <div className="pulse-loop rounded-lg bg-track h-4 w-5/12" />
        </CardContent>
      </Card>
    );
  }

  if (!plan && tests.length === 0) return null;

  const setTargets = plan?.set_targets || {};

  return (
    <Card className="glass glass-interactive mb-4 rise-in">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="section-label flex items-center gap-2 normal-case">
          <CalendarDays className="w-3.5 h-3.5 text-gold" /> This Week&apos;s Plan
          {plan?.week_start && <span className="font-technical text-caption font-bold text-faint normal-case">wk of {plan.week_start}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-3">
        {tests.map(t => {
          const b = t.baseline || {};
          const label = t.test_type === "pst_diagnostic"
            ? "PST diagnostic scheduled, run a benchmark PST and log it so the engine can recalibrate your targets."
            : t.test_type === "volume_tolerance"
              ? `Volume-tolerance test: ramping ${String(b.muscle || "").replace(/_/g, " ")} (week ${b.week ?? 1}) to probe your MRV.`
              : `${String(t.test_type).replace(/_/g, " ")} test active.`;
          return (
            <div key={t.id} className="flex items-start gap-1.5 rounded-lg bg-gold/10 border border-gold/20 px-2.5 py-2">
              <FlaskConical className="w-3 h-3 text-gold shrink-0 mt-0.5" />
              <span className="text-xs font-semibold text-gold/90 leading-snug">{label}</span>
            </div>
          );
        })}
        {Object.keys(setTargets).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(setTargets).map(([muscle, sets]) => (
              <span key={muscle} className="glass-inset px-2 py-1 text-caption font-bold text-secondary capitalize">
                {muscle.replace(/_/g, " ")} <span className="font-technical font-extrabold text-ink">{sets}</span>
              </span>
            ))}
          </div>
        )}
        {plan?.run_plan && Array.isArray(plan.run_plan) && plan.run_plan.length > 0 && (
          <p className="text-caption font-semibold text-muted-2">
            Runs: {plan.run_plan.map(r => `${r.count} ${r.type}`).join(" · ")}
          </p>
        )}
        {plan?.rationale && (
          <p className="text-xs font-semibold text-muted-2 leading-relaxed">{plan.rationale}</p>
        )}
      </CardContent>
    </Card>
  );
}
