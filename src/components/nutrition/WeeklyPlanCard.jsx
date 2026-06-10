import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useEnrollments, useProgram } from "@/hooks/useProgramQueries";
import { getProgramSchedule } from "@/utils/programSchedule";
import { getTodayString } from "@/utils/dateUtils";
import { invalidateFood } from "@/lib/queryKeys";
import {
  DIET_PLANS, selectPlanForPhase, planToFoodEntries, planTotals, buildShoppingList,
} from "@/config/dietPlans";
import { Cpu, Dumbbell, Moon, ShoppingCart, Check, ChevronDown, ChevronUp, Sparkles, Flame } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { toast } from "sonner";

const GATE_LABEL = {
  overreaching: "Overreaching", hrv_suppressed: "HRV low", rhr_elevated: "RHR high",
  poor_sleep: "Poor sleep",
};

// A compact P / C / F micro-bar (MacroFactor style — protein-anchored).
function MacroBar({ p, c, f }) {
  const pc = p * 4, cc = c * 4, fc = f * 9;
  const tot = Math.max(1, pc + cc + fc);
  const seg = (v, cls) => <span className={cls} style={{ width: `${(v / tot) * 100}%` }} />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-charcoal-elevated">
      {seg(pc, "bg-viz-2")}{seg(cc, "bg-viz-3")}{seg(fc, "bg-viz-4")}
    </div>
  );
}

// `bare` drops the card's own glass chrome — used when it renders inside an
// already-glass container (the Fuel page's week-plan modal).
export default function WeeklyPlanCard({ bare = false }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const qc = useQueryClient();
  const { activePhase } = useDietPhase();
  const { enrollments } = useEnrollments();
  const activeEnrollment = (enrollments || []).find((e) => e.status === "active");
  const { program } = useProgram(activeEnrollment?.program_id);

  const today = getTodayString(profile?.timezone);
  const [showShopping, setShowShopping] = useState(false);

  // ONE source of truth for the day's calories — the same hook the daily log
  // rings use (engine recovery-gated target → profile goal). The plan scales
  // to this number, so the plan you approve always matches today's target.
  const { calories: calTarget, engineSet, recommended: rec } = useDailyTargets(today);

  const phaseRaw = (activePhase?.phase || "").toLowerCase();
  const isBulk = phaseRaw.includes("bulk") || phaseRaw.includes("surplus");
  const isCut = phaseRaw.includes("cut") || phaseRaw.includes("deficit");
  const planKey = selectPlanForPhase(isBulk ? "bulk" : isCut ? "cut" : "maintain", calTarget);
  const plan = DIET_PLANS[planKey];

  // Next 7 days, carb-cycled by the program schedule (training vs rest).
  const week = (() => {
    const dates = Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(today), i), "yyyy-MM-dd"));
    const sched = activeEnrollment && program
      ? getProgramSchedule(activeEnrollment, program.workouts || [])
      : [];
    const trainSet = new Set(sched.filter((e) => (e.exercises || []).length > 0).map((e) => e.date));
    const haveSched = trainSet.size > 0;
    return dates.map((d) => ({
      date: d,
      // Without a program we can't know rest days; default to training (full fuel).
      trainingDay: haveSched ? trainSet.has(d) : true,
    }));
  })();

  const shopping = buildShoppingList(week.map((d) => ({ planKey, trainingDay: d.trainingDay, calorieTarget: calTarget })));
  const trainCount = week.filter((d) => d.trainingDay).length;

  const approve = useMutation({
    mutationFn: async () => {
      const dates = week.map((d) => d.date);
      // Idempotent: clear any prior planned rows for these dates, then load fresh.
      await supabase.from("food_entries").delete()
        .eq("created_by", user.id).eq("planned", true).in("date", dates);
      const rows = week.flatMap((d) =>
        planToFoodEntries(planKey, { date: d.date, trainingDay: d.trainingDay, calorieTarget: calTarget }).map((e) => ({
          food_name: e.food_name, meal_type: e.meal_type,
          serving_size: e.serving_size, serving_unit: e.serving_unit,
          calories: e.calories, protein_grams: e.protein_grams,
          carbs_grams: e.carbs_grams, fats_grams: e.fats_grams,
          date: e.date, planned: true, created_by: user.id,
          // Carry the workout-timing window so the log can badge pre/post meals.
          tag: e.timing && e.timing !== "anytime" ? e.timing : null,
        }))
      );
      await Promise.all(rows.map((r) => db.entities.FoodEntry.create(r)));
      return rows.length;
    },
    onSuccess: (n) => {
      invalidateFood(qc);
      toast.success(`Loaded ${n} planned items across the week — check them off as you eat.`);
    },
    onError: () => toast.error("Couldn't load the plan"),
  });

  if (!plan) return null;

  const isSunday = parseISO(today).getDay() === 0;
  const tt = planTotals(planKey, { trainingDay: true, calorieTarget: calTarget });
  const rt = planTotals(planKey, { trainingDay: false, calorieTarget: calTarget });

  return (
    <div className={`${bare ? "" : "glass rounded-2xl"} overflow-hidden`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-brand" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-brand font-bold">This Week's Plan</span>
            {isSunday && (
              <span className="text-[9px] uppercase tracking-wider text-ok bg-ok/10 px-1.5 py-0.5 rounded-full font-bold">Sunday — plan ready</span>
            )}
          </div>
          <h3 className="text-lg font-bold text-ink leading-tight mt-1">{plan.label}</h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-technical text-ink leading-none">
            {calTarget ? Math.round(calTarget).toLocaleString() : "—"}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-ink-muted font-bold mt-1">
            kcal / day{engineSet ? " · engine-set" : ""}
          </div>
        </div>
      </div>

      {/* Recovery-gated rationale */}
      {engineSet && rec && (
        <div className="mx-5 mb-3 surface-2 px-3.5 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">Recovery-Gated Deficit</span>
            <span className="ml-auto font-technical text-sm text-brand">{Math.round((rec.deficit_ratio || 0) * 100)}%</span>
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed">{rec.rationale}</p>
          {(rec.gates || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rec.gates.map((g) => (
                <span key={g} className="text-[9px] uppercase tracking-wider text-warn bg-warn/10 border border-warn/20 px-1.5 py-0.5 rounded font-bold">
                  {GATE_LABEL[g] || g}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Day-by-day carb-cycle strip */}
      <div className="px-5">
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d) => {
            const t = planTotals(planKey, { trainingDay: d.trainingDay, calorieTarget: calTarget });
            const isToday = d.date === today;
            return (
              <div key={d.date} className={`rounded-lg px-1.5 py-2 text-center border ${isToday ? "border-brand/40 bg-brand/[6%]" : "border-charcoal-border bg-charcoal-surface/40"}`}>
                <div className="text-[9px] uppercase tracking-wider text-ink-muted font-bold">{format(parseISO(d.date), "EEEEE")}</div>
                <div className="flex justify-center my-1">
                  {d.trainingDay
                    ? <Dumbbell className="w-3 h-3 text-brand" />
                    : <Moon className="w-3 h-3 text-ink-faint" />}
                </div>
                <div className="font-technical text-[11px] text-ink leading-none">{t.calories}</div>
                <div className="text-[8px] text-ink-faint font-technical leading-none mt-0.5">{t.carbs}c</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-ink-muted">
          <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3 text-brand" /> {trainCount} lift · <Moon className="w-3 h-3" /> {7 - trainCount} rest</span>
          <span className="font-technical">carb cycle {rt.carbs}–{tt.carbs}g</span>
        </div>
      </div>

      {/* Training-day macro split */}
      <div className="px-5 pt-3">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-ink-muted font-semibold">Training day</span>
          <span className="font-technical text-ink-muted">
            <span className="text-viz-2">{tt.protein}p</span> · <span className="text-viz-3">{tt.carbs}c</span> · <span className="text-viz-4">{tt.fats}f</span>
          </span>
        </div>
        <MacroBar p={tt.protein} c={tt.carbs} f={tt.fats} />
      </div>

      {/* Shopping list — inline expander */}
      <button
        onClick={() => setShowShopping((s) => !s)}
        className="w-full px-5 py-3 mt-3 flex items-center gap-2 text-xs text-ink-secondary hover:text-ink transition-colors border-t hairline"
      >
        <ShoppingCart className="w-3.5 h-3.5 text-gold" />
        <span className="font-bold">Shopping list</span>
        <span className="font-technical text-ink-muted">~${shopping.totalCost.toFixed(0)} / wk</span>
        {showShopping ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>
      {showShopping && (
        <div className="px-5 pb-3 -mt-1">
          <div className="glass-inset divide-y divide-[var(--color-border-soft)]">
            {shopping.items.map((it) => (
              <div key={it.food} className="flex items-center gap-3 px-3.5 py-2 text-xs">
                <span className="text-ink font-semibold flex-1 truncate">{it.food}</span>
                <span className="font-technical text-ink-muted whitespace-nowrap">
                  {it.units != null ? `${it.units} × ${it.unitLabel}` : `${it.grams} g`}
                </span>
                {it.cost != null && <span className="font-technical text-ink-muted w-12 text-right">${it.cost.toFixed(2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approve — primary action of the week view */}
      <div className="px-5 pb-4 pt-1">
        <button
          onClick={() => approve.mutate()}
          disabled={approve.isPending}
          className="cta-coral w-full disabled:opacity-60"
        >
          {approve.isPending ? "Loading week…" : <><Check className="w-4 h-4" /> Approve &amp; load the week</>}
        </button>
        <p className="text-[10px] text-ink-muted text-center mt-2 flex items-center justify-center gap-1">
          <Flame className="w-3 h-3" /> Pre-fills your log as check-off items · deviate anytime by editing
        </p>
      </div>
    </div>
  );
}
