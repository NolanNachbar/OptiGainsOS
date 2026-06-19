import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useDailyTargets, clampCutProtein, profileWeightLb, CUT_PROTEIN_HARD_FLOOR_PER_LB } from "@/hooks/useDailyTargets";
import { useEnrollments, useProgram } from "@/hooks/useProgramQueries";
import { getProgramSchedule } from "@/utils/programSchedule";
import { getTodayString } from "@/utils/dateUtils";
import { invalidateFood } from "@/lib/queryKeys";
import { buildDayEntries, buildShoppingList, entriesCost } from "@/config/dietPlans";
import { Cpu, Dumbbell, Moon, ShoppingCart, Check, ChevronDown, ChevronUp, Sparkles, Flame, Snowflake } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { toast } from "sonner";

const GATE_LABEL = {
  overreaching: "Overreaching", hrv_suppressed: "HRV low", rhr_elevated: "RHR high",
  poor_sleep: "Poor sleep",
};

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

// A day needs at least this much un-eaten budget before we bother planning food
// into it — below this, portions would shrink past edible.
const MIN_DAY_BUDGET = 150;

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

const sumRows = (rows) =>
  rows.reduce(
    (t, e) => ({
      calories: t.calories + (e.calories || 0),
      protein: t.protein + (e.protein_grams || 0),
      carbs: t.carbs + (e.carbs_grams || 0),
      fats: t.fats + (e.fats_grams || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

const groceryStorageKey = (weekStart) => `optigains.grocery.${weekStart}`;

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
  const [openDay, setOpenDay] = useState(null);
  const [showRationale, setShowRationale] = useState(false);

  // ONE source of truth for today's targets — the same hook the daily log rings
  // use (engine recovery-gated target → profile goal). Days the engine hasn't
  // scored yet fall back to these numbers.
  const { calories: calTarget, protein: proteinTarget, fats: fatTarget, engineSet, recommended: rec, isCut, aggressiveCut } = useDailyTargets(today);

  const phaseRaw = (activePhase?.phase_type || "").toLowerCase();
  const isBulk = phaseRaw.includes("bulk") || phaseRaw.includes("surplus");
  const planLabel = isBulk ? "Cost-Optimized Bulk"
    : aggressiveCut ? "Cost-Optimized Aggressive Cut"
    : isCut ? "Cost-Optimized Cut"
    : "Cost-Optimized Maintenance";

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(today), i), "yyyy-MM-dd")),
    [today]
  );

  // Per-date context, batched: the engine's target where it has scored the day,
  // plus whatever has ALREADY been eaten on each day. Both feed the per-day
  // budget so the plan never stacks on top of food that's already logged.
  const { data: dayContext } = useQuery({
    queryKey: ["week-plan-day-context", today, user?.id],
    queryFn: async () => {
      const [statesRes, eatenRes] = await Promise.all([
        supabase.from("athlete_state").select("date, nutrition")
          .eq("created_by", user.id).in("date", dates),
        supabase.from("food_entries").select("date, calories, protein_grams, fats_grams")
          .eq("created_by", user.id).in("date", dates).eq("planned", false),
      ]);
      if (statesRes.error) throw statesRes.error;
      if (eatenRes.error) throw eatenRes.error;
      const targets = {};
      for (const s of statesRes.data || []) {
        const cal = s.nutrition?.recommended_intake?.calorie_target;
        const pro = s.nutrition?.recommended_intake?.protein_g ?? s.nutrition?.protein_target;
        if (cal) targets[s.date] = { calories: Math.round(cal), protein: pro ? Math.round(pro) : null };
      }
      const eaten = {};
      for (const e of eatenRes.data || []) {
        const d = (eaten[e.date] ||= { calories: 0, protein: 0, fats: 0 });
        d.calories += e.calories || 0;
        d.protein += e.protein_grams || 0;
        d.fats += e.fats_grams || 0;
      }
      return { targets, eaten };
    },
    enabled: !!user && !!calTarget,
    staleTime: 60 * 1000,
  });

  // The week: each day carb-cycled by the program schedule and fitted to ITS OWN
  // remaining budget (that day's engine target minus what's already eaten).
  const week = useMemo(() => {
    const sched = activeEnrollment && program
      ? getProgramSchedule(activeEnrollment, program.workouts || [])
      : [];
    const trainSet = new Set(sched.filter((e) => (e.exercises || []).length > 0).map((e) => e.date));
    const haveSched = trainSet.size > 0;

    return dates.map((d) => {
      // Without a program we can't know rest days; default to training (full fuel).
      const trainingDay = haveSched ? trainSet.has(d) : true;
      const dayTarget = dayContext?.targets?.[d]?.calories || calTarget;
      // Per-day engine protein is raw athlete_state — clamp it through the same
      // cut rule (1.3–1.5 g/lb) as useDailyTargets so no path bypasses the floor.
      let dayProtein = dayContext?.targets?.[d]?.protein || proteinTarget;
      const weightLb = profileWeightLb(profile);
      if (isCut && dayProtein) dayProtein = clampCutProtein(dayProtein, weightLb);
      // Hard floor the optimizer may ease down to when the calorie wall binds.
      const dayProteinFloor = isCut && weightLb ? Math.round(CUT_PROTEIN_HARD_FLOOR_PER_LB * weightLb) : null;
      const eatenCal = dayContext?.eaten?.[d]?.calories || 0;
      const eatenProtein = dayContext?.eaten?.[d]?.protein || 0;
      const eatenFats = dayContext?.eaten?.[d]?.fats || 0;
      const budget = Math.max(0, (dayTarget || 0) - eatenCal);
      const rows = budget >= MIN_DAY_BUDGET
        ? buildDayEntries({
            date: d,
            trainingDay,
            calorieTarget: budget,
            proteinTarget: dayProtein ? Math.max(0, dayProtein - eatenProtein) : null,
            proteinFloor: dayProteinFloor ? Math.max(0, dayProteinFloor - eatenProtein) : null,
            fatTarget: fatTarget ? Math.max(0, fatTarget - eatenFats) : null,
            aggressiveCut,
          })
        : [];
      return { date: d, trainingDay, target: dayTarget, eatenCal, budget, rows, totals: sumRows(rows), cost: entriesCost(rows) };
    });
  }, [dates, dayContext, calTarget, proteinTarget, fatTarget, isCut, profile, aggressiveCut, activeEnrollment, program]);

  const allRows = useMemo(() => week.flatMap((d) => d.rows), [week]);
  const shopping = useMemo(() => buildShoppingList(allRows), [allRows]);
  const trainCount = week.filter((d) => d.trainingDay).length;
  const trainDay = week.find((d) => d.trainingDay && d.rows.length) || week.find((d) => d.rows.length);
  const restDay = week.find((d) => !d.trainingDay && d.rows.length);

  // Grocery check-offs persist per week so the list survives leaving the store
  // and coming back. Old weeks' keys are pruned on write.
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(groceryStorageKey(dates[0]))) || {}; }
    catch { return {}; }
  });
  const toggleChecked = (food) => {
    setChecked((prev) => {
      const next = { ...prev, [food]: !prev[food] };
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith("optigains.grocery.") && k !== groceryStorageKey(dates[0])) localStorage.removeItem(k);
        }
        localStorage.setItem(groceryStorageKey(dates[0]), JSON.stringify(next));
      } catch { /* storage full/unavailable — checks just won't persist */ }
      return next;
    });
  };
  const checkedCount = shopping.items.filter((it) => checked[it.food]).length;

  const approve = useMutation({
    mutationFn: async () => {
      // Idempotent: clear any prior planned rows for these dates, then load fresh.
      // Eaten (checked-off) rows are untouched — the per-day budgets above already
      // subtracted them, so re-approving mid-week can't double-count a day.
      await supabase.from("food_entries").delete()
        .eq("created_by", user.id).eq("planned", true).in("date", dates);
      const rows = allRows.map((e) => ({
        food_name: e.food_name, meal_type: e.meal_type,
        serving_size: e.serving_size, serving_unit: e.serving_unit,
        calories: e.calories, protein_grams: e.protein_grams,
        carbs_grams: e.carbs_grams, fats_grams: e.fats_grams,
        date: e.date, planned: true, created_by: user.id,
        // Carry the workout-timing window so the log can badge pre/post meals.
        tag: e.timing && e.timing !== "anytime" ? e.timing : null,
      }));
      await Promise.all(rows.map((r) => db.entities.FoodEntry.create(r)));
      return rows.length;
    },
    onSuccess: (n) => {
      invalidateFood(qc);
      qc.invalidateQueries({ queryKey: ["week-plan-day-context"] });
      toast.success(`Loaded ${n} planned items across the week — check them off as you eat.`);
    },
    onError: () => toast.error("Couldn't load the plan"),
  });

  if (!calTarget) return null;

  const isSunday = parseISO(today).getDay() === 0;
  const openDayData = openDay ? week.find((d) => d.date === openDay) : null;
  const creamiFoods = openDayData ? openDayData.rows.filter((r) => r.creami).map((r) => r.food_name) : [];

  // In `bare` (sheet) mode we drop overflow-hidden so the Approve CTA's sticky
  // footer can pin to the scrolling DialogContent. The rounded-corner clip it
  // provides is only needed for the standalone glass card.
  return (
    <div className={bare ? "" : "glass rounded-2xl overflow-hidden"}>
      {/* ── Header: what plan, what target ── */}
      {/* pr-14 clears the DialogContent close X (absolute right-2 top-2, 44px)
          so the calorie figure never sits under it when rendered as a sheet. */}
      <div className="px-5 pt-4 pb-3 pr-14 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-ink-muted" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">This Week's Plan</span>
            {isSunday && (
              <span className="text-[9px] uppercase tracking-wider text-ink-muted bg-charcoal-surface px-1.5 py-0.5 rounded-full font-bold">Sunday — plan ready</span>
            )}
          </div>
          <h3 className="text-lg font-bold text-ink leading-tight mt-1">{planLabel}</h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-technical text-gold leading-none">
            {calTarget ? Math.round(calTarget).toLocaleString() : "—"}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-ink-muted font-bold mt-1">
            kcal / day{engineSet ? " · engine-set" : ""}
          </div>
        </div>
      </div>

      {/* ── Recovery-gated rationale ── */}
      {engineSet && rec && (
        <div className="mx-5 mb-3 surface-2 px-3.5 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">Recovery-Gated Deficit</span>
            <span className="ml-auto font-technical text-sm text-warn">{Math.round((rec.deficit_ratio || 0) * 100)}%</span>
          </div>
          <p className={`text-xs text-ink-secondary leading-relaxed ${showRationale ? "" : "line-clamp-2"}`}>{rec.rationale}</p>
          {rec.rationale && rec.rationale.length > 90 && (
            <button
              onClick={() => setShowRationale((s) => !s)}
              className="glass-interactive mt-1 text-[10px] uppercase tracking-wider text-ink-muted font-bold active:scale-[0.97]"
            >
              {showRationale ? "Less" : "Why?"}
            </button>
          )}
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

      {/* ── Week strip: tap a day to see exactly what's planned for it ── */}
      <div className="px-5">
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d) => {
            const isToday = d.date === today;
            const isOpen = openDay === d.date;
            return (
              <button
                key={d.date}
                onClick={() => setOpenDay(isOpen ? null : d.date)}
                className={`glass-interactive rounded-lg px-1.5 py-2.5 text-center border active:scale-[0.97] active:bg-brand/15 ${
                  isOpen ? "border-brand bg-brand/10"
                  : isToday ? "border-brand/40 bg-brand/5"
                  : "border-charcoal-border bg-charcoal-surface/40"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">{format(parseISO(d.date), "EEEEE")}</div>
                <div className="flex justify-center my-1">
                  {d.trainingDay
                    ? <Dumbbell className="w-3 h-3 text-viz-1" />
                    : <Moon className="w-3 h-3 text-ink-faint" />}
                </div>
                <div className="font-technical text-[11px] text-gold leading-none">{d.totals.calories || "—"}</div>
                <div className="text-[10px] font-technical leading-none mt-0.5">
                  {d.rows.length
                    ? <span className="text-viz-3">{Math.round(d.totals.carbs)}c</span>
                    : <span className="text-ink-faint">eaten</span>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-ink-muted">
          <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3 text-viz-1" /> {trainCount} lift · <Moon className="w-3 h-3 text-ink-faint" /> {7 - trainCount} rest</span>
          <span className="font-technical">
            carb cycle {restDay && trainDay ? `${Math.round(restDay.totals.carbs)}–${Math.round(trainDay.totals.carbs)}g` : trainDay ? `${Math.round(trainDay.totals.carbs)}g` : "—"}
          </span>
        </div>
      </div>

      {/* ── Day detail: the actual foods, portions, and budget math for one day ── */}
      {openDayData && (
        <div className="mx-5 mt-3 glass-inset rise-in">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b hairline">
            <span className="text-xs font-bold text-ink">
              {format(parseISO(openDayData.date), "EEEE, MMM d")}
              <span className="ml-1.5 text-[10px] font-semibold text-ink-muted">{openDayData.trainingDay ? "lift day" : "rest day"}</span>
            </span>
            <span className="font-technical text-[10px] text-ink-muted">
              target {Math.round(openDayData.target).toLocaleString()}
              {openDayData.eatenCal > 0 && ` · eaten ${Math.round(openDayData.eatenCal).toLocaleString()}`}
              {` · plan fills ${openDayData.totals.calories.toLocaleString()}`}
              {openDayData.cost > 0 && ` · ≈ $${openDayData.cost.toFixed(2)}`}
            </span>
          </div>
          {openDayData.rows.length === 0 ? (
            <p className="px-3.5 py-3 text-xs text-ink-muted">
              This day's budget is already used up by logged food — nothing left to plan.
            </p>
          ) : (
            <>
              {MEAL_ORDER.filter((m) => openDayData.rows.some((r) => r.meal_type === m)).map((m) => (
                <div key={m} className="px-3.5 py-2 border-b hairline last:border-b-0">
                  <div className="text-[10px] uppercase tracking-widest text-ink-faint font-bold mb-1">{MEAL_LABEL[m]}</div>
                  {openDayData.rows.filter((r) => r.meal_type === m).map((r) => (
                    <div key={r.food_name} className="flex items-center gap-2 py-0.5 text-xs">
                      <span className="text-ink font-semibold flex-1 truncate">{r.food_name}</span>
                      {r.timing && r.timing !== "anytime" && (
                        <span className={`shrink-0 text-[8px] uppercase tracking-wider font-bold px-1 py-0.5 rounded ${r.timing === "pre" ? "text-carb bg-carb/15" : "text-leaf bg-leaf/15"}`}>
                          {r.timing === "pre" ? "Pre-WO" : "Post-WO"}
                        </span>
                      )}
                      <span className="font-technical text-ink-muted w-12 text-right">{r.serving_size} g</span>
                      <span className="font-technical text-gold w-12 text-right">{r.calories}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="px-3.5 py-2.5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-ink-muted font-semibold">Day macros</span>
                  <span className="font-technical text-ink-muted">
                    <span className="text-viz-2">{Math.round(openDayData.totals.protein)}p</span> · <span className="text-viz-3">{Math.round(openDayData.totals.carbs)}c</span> · <span className="text-viz-4">{Math.round(openDayData.totals.fats)}f</span>
                  </span>
                </div>
                <MacroBar p={openDayData.totals.protein} c={openDayData.totals.carbs} f={openDayData.totals.fats} />
                {openDayData.rows.proteinShortfall > 0 && (
                  <p className="mt-2 text-[10px] text-warn">
                    Protein lands {openDayData.rows.proteinShortfall} g under target — the food list's lean
                    sources are maxed out. Add a lean protein to the catalog or cover it manually.
                  </p>
                )}
                {openDayData.rows.proteinEased > 0 && (
                  <p className="mt-2 text-[10px] text-ink-muted">
                    Protein eased {openDayData.rows.proteinEased} g below the 1.3 g/lb anchor (still ≥ the
                    1.2 g/lb floor) to hold this day's calorie wall — protein drops last, calories don't bend.
                  </p>
                )}
                {openDayData.rows.calorieOverage > 0 && (
                  <p className="mt-2 text-[10px] text-warn">
                    Even at the 1.2 g/lb protein floor this day runs {openDayData.rows.calorieOverage} kcal
                    over target — the calorie wall bends before the hard protein floor does.
                  </p>
                )}
                {creamiFoods.length > 0 && (
                  <p className="flex items-center gap-1.5 mt-2 text-[10px] text-ink-muted">
                    <Snowflake className="w-3 h-3 text-carb shrink-0" />
                    Creami option: {creamiFoods.length > 1
                      ? `blend the ${creamiFoods.slice(0, 3).join(" + ")} into protein ice cream`
                      : `spin the whey scoop with water/ice into protein ice cream`} — same macros, same cost.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Grocery list: checkable while shopping, persists for the week ── */}
      <button
        onClick={() => setShowShopping((s) => !s)}
        className="glass-interactive w-full px-5 py-3 mt-3 flex items-center gap-2 text-xs text-ink-secondary hover:text-ink active:scale-[0.99] border-t hairline"
      >
        <ShoppingCart className="w-3.5 h-3.5 text-ink-muted" />
        <span className="font-bold">Grocery list</span>
        <span className="font-technical text-ink-muted">
          {checkedCount > 0 ? `${checkedCount}/${shopping.items.length} · ` : ""}~${shopping.totalCost.toFixed(0)} / wk
        </span>
        {showShopping ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>
      {showShopping && (
        <div className="px-5 pb-3 -mt-1 rise-in">
          <div className="glass-inset divide-y divide-charcoal-borderSoft">
            {shopping.items.map((it) => {
              const done = !!checked[it.food];
              return (
                <button
                  key={it.food}
                  onClick={() => toggleChecked(it.food)}
                  className="glass-interactive w-full flex items-center gap-3 min-h-[44px] px-3.5 py-3 text-xs text-left hover:bg-charcoal-surface active:scale-[0.99]"
                >
                  <span className={`shrink-0 w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${done ? "border-leaf/60 bg-leaf/15 text-leaf" : "border-track text-transparent"}`}>
                    <Check className="w-3 h-3" />
                  </span>
                  <span className={`font-semibold flex-1 truncate ${done ? "text-ink-faint line-through" : "text-ink"}`}>{it.food}</span>
                  <span className={`font-technical whitespace-nowrap ${done ? "text-ink-faint" : "text-ink-muted"}`}>
                    {it.units != null ? `${it.units} × ${it.unitLabel}` : `${it.grams} g`}
                  </span>
                  {it.cost != null && <span className={`font-technical w-12 text-right ${done ? "text-ink-faint" : "text-ink-muted"}`}>${it.cost.toFixed(2)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Approve — primary action of the week view ──
          Pinned to a sticky footer so it stays in the thumb zone instead of
          living ~2000px down the scroll. Backed by the field colour + a hairline
          top edge so scrolled content can't bleed through behind the CTA. */}
      <div className="sticky bottom-0 px-5 pb-4 pt-3 bg-[var(--color-bg)]/95 backdrop-blur border-t hairline">
        <button
          onClick={() => approve.mutate()}
          disabled={approve.isPending || allRows.length === 0}
          className="cta-coral w-full disabled:opacity-60"
        >
          {approve.isPending ? "Loading week…" : <><Check className="w-4 h-4" /> Approve &amp; load the week</>}
        </button>
        <p className="text-[10px] text-ink-muted text-center mt-2 flex items-center justify-center gap-1">
          <Flame className="w-3 h-3" /> Pre-fills your log as check-off items · portions auto-adjust to each day's target
        </p>
      </div>
    </div>
  );
}
