import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useCustomFoods } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useSetDietPhase } from "@/hooks/useSetDietPhase";
import { useDayPlanContext } from "@/hooks/useDayPlanContext";
import { resolveDayPlan } from "@/utils/dayPlan";
import { getTodayString } from "@/utils/dateUtils";
import { invalidateFood } from "@/lib/queryKeys";
import { buildShoppingList, FOOD_CATALOG } from "@/config/dietPlans";
import { Cpu, Dumbbell, Moon, ShoppingCart, Check, ChevronDown, ChevronUp, Sparkles, Flame, Snowflake, SlidersHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, parseISO, addDays } from "date-fns";
import { toast } from "sonner";

const GATE_LABEL = {
  overreaching: "Overreaching", hrv_suppressed: "HRV low", rhr_elevated: "RHR high",
  poor_sleep: "Poor sleep", manual_override: "Manual",
};

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

// A compact P / C / F micro-bar (MacroFactor style — protein-anchored).
function MacroBar({ p, c, f }) {
  const pc = p * 4, cc = c * 4, fc = f * 9;
  const tot = Math.max(1, pc + cc + fc);
  const seg = (v, cls) => <span className={cls} style={{ width: `${(v / tot) * 100}%` }} />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-track">
      {seg(pc, "bg-coral")}{seg(cc, "bg-carb")}{seg(fc, "bg-fat")}
    </div>
  );
}

const groceryStorageKey = (weekStart) => `optigains.grocery.${weekStart}`;

// Manual "force this day" dropdown is scoped to the creami-tagged dairy foods —
// the concrete case this exists for. The underlying foodMins mechanism (dietPlans.js)
// isn't limited to these, but a wide-open food picker isn't needed yet.
const FORCEABLE_FOODS = FOOD_CATALOG.filter((f) => f.creami && f.role === "dairy").map((f) => f.food);

// ── Diet-target slider (Nolan's call, 2026-09-30) ──────────────────────────
// One horizontal slider replaces the four-way Cut/Maintain/Bulk/Custom picker.
// Both ends are anchored to what he's actually done or is willing to commit to:
//  - Peak cut is his real deepest engine-set cut this year, not a formula —
//    athlete_state shows 1646 kcal on 2026-07-06, 1705 on 2026-06-08, and
//    1640 on 2026-07-13 (the deepest of the three). That's the permanent
//    floor: below it the engine's protein/fat floors start fighting the
//    calorie wall harder than he's ever actually asked them to.
const PEAK_CUT_KCAL = 1640;
// He has no bulk history to anchor a "peak bulk" the same way — it's a policy
// multiplier on maintenance instead, until a real aggressive bulk gives it one.
const PEAK_BULK_SURPLUS = 0.25;
const SLIDER_STEP = 50;
// Standard rounding to the nearest 50 kcal, anchored at zero. Used for every
// landmark EXCEPT the three protected ones (Peak cut is the fixed constant
// above; Maintain is the engine's own TDEE, kept exact) — a single anchor
// point (like "round from 1640") would silently drag Maintain and Peak bulk
// off their real numbers just to sit on the same 50 kcal grid as Peak cut,
// which is wrong: 1640 isn't a multiple of 50, so no single uniform grid can
// hit all three exactly. Each protected landmark is exact; the grid is only
// for the filler stops between them (see buildStops).
const round50 = (n) => Math.round(n / SLIDER_STEP) * SLIDER_STEP;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Landmarks as a fraction of maintenance (Peak cut is the fixed constant
// above, not a fraction — his real number doesn't move when maintenance does).
const LANDMARK_DEFS = [
  { key: "peak_cut", label: "Peak cut" },
  { key: "cut", label: "Cut", frac: -0.20 },
  { key: "mini_cut", label: "Mini cut", frac: -0.10 },
  { key: "maintain", label: "Maintain", frac: 0 },
  { key: "lean_bulk", label: "Lean bulk", frac: 0.10 },
  { key: "bulk", label: "Bulk", frac: 0.175 },
  { key: "peak_bulk", label: "Peak bulk", frac: PEAK_BULK_SURPLUS },
];
// Peak cut / Maintain / Peak bulk are the three anchors the slider's ends and
// center are built from — they never get dropped for crowding. The rest
// (Cut/Mini cut/Lean bulk/Bulk) drop out if they'd land within 150 kcal of a
// neighbour, which happens whenever maintenance sits close to a multiple of
// one of these fractions.
const PROTECTED_LANDMARKS = new Set(["peak_cut", "maintain", "peak_bulk"]);
const MIN_LANDMARK_GAP = 150;
// Plain 50 kcal filler stops (see buildStops) within this many kcal of a
// landmark are dropped, so dragging never produces two stops close enough to
// read as the same number.
const STOP_MERGE_RADIUS = 25;
// Guard against a degenerate range (maintenance unknown and falling back to
// a target that's at or barely above Peak cut, e.g. a fresh account): Peak
// cut, Maintain and Peak bulk must always exist and be strictly ordered, so
// Maintain's *slider-range* value is floored this far above Peak cut even
// when the real/fallback maintenance sits right on top of it. This never
// changes what's shown as the real maintenance number elsewhere (delta text
// etc.) — it only keeps the slider itself from collapsing to a point.
const MIN_MAINTAIN_ABOVE_CUT = 200;

function buildLandmarks(rawMaintenance) {
  const maintenance = Number.isFinite(rawMaintenance)
    ? Math.max(rawMaintenance, PEAK_CUT_KCAL + MIN_MAINTAIN_ABOVE_CUT)
    : PEAK_CUT_KCAL + MIN_MAINTAIN_ABOVE_CUT;
  // Peak bulk is maintenance x 1.25; the maintenance floor above already
  // keeps this comfortably above Peak cut, but clamp anyway as a second
  // guard against a negative- or zero-width slider.
  const sliderTop = Math.max(round50(maintenance * (1 + PEAK_BULK_SURPLUS)), PEAK_CUT_KCAL + SLIDER_STEP);
  // Clamp every landmark into [Peak cut, sliderTop] before sorting, not
  // after, so the "smallest is always Peak cut" assumption below and true
  // numeric ordering both hold even for a fractional landmark (Cut, sized
  // off maintenance) that would otherwise land at or below Peak cut.
  let kept = LANDMARK_DEFS.map((d) => {
    const raw = d.key === "peak_cut" ? PEAK_CUT_KCAL : d.key === "maintain" ? maintenance : maintenance * (1 + d.frac);
    // Maintain is kept exact (the engine's real TDEE, not nudged to a grid);
    // Peak cut is already exact; everything else rounds to the nearest 50.
    const exact = d.key === "peak_cut" || d.key === "maintain";
    const kcal = clamp(exact ? Math.round(raw) : round50(raw), PEAK_CUT_KCAL, sliderTop);
    return { key: d.key, label: d.label, kcal };
  });
  // clamp/round can collapse several landmarks to the same value in that
  // degenerate case; the LANDMARK_DEFS array is otherwise NOT sorted by kcal
  // (Cut/Mini cut sit below Maintain, which sits before them in the
  // definition order), so sort before the neighbour-gap dedupe below runs.
  kept.sort((a, b) => a.kcal - b.kcal);
  // Peak cut / Maintain / Peak bulk must never be dropped, even if two of
  // them end up crowded together — only a non-protected landmark (Cut, Mini
  // cut, Lean bulk, Bulk) can be dropped for crowding a neighbour.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < kept.length; i++) {
      if (kept[i].kcal - kept[i - 1].kcal < MIN_LANDMARK_GAP) {
        const prevProtected = PROTECTED_LANDMARKS.has(kept[i - 1].key);
        const curProtected = PROTECTED_LANDMARKS.has(kept[i].key);
        if (prevProtected && curProtected) continue; // both fixed — leave the narrow gap as-is
        const dropIdx = curProtected ? i - 1 : i;
        kept.splice(dropIdx, 1);
        changed = true;
        break;
      }
    }
  }
  return kept;
}

// The slider snaps to this full stop list: every landmark (exact — Peak cut,
// Maintain and Peak bulk are always reachable on the nose) plus plain 50 kcal
// steps filling the gaps between them, for the "50 kcal apart" in-between
// feel the design calls for. A native <input type="range" step="50"> can't
// do this on its own — its steps are uniform from `min`, which is exactly the
// bug that used to silently round Peak cut and Maintain onto the wrong grid
// (1640 isn't a multiple of 50) — so the slider uses step="1" and snaps to
// the nearest entry here on every change instead.
function buildStops(landmarks) {
  const stops = landmarks.map((l) => ({ kcal: l.kcal, label: l.label }));
  const min = landmarks[0].kcal;
  const max = landmarks[landmarks.length - 1].kcal;
  for (let k = Math.ceil(min / SLIDER_STEP) * SLIDER_STEP; k <= max; k += SLIDER_STEP) {
    if (stops.some((s) => Math.abs(s.kcal - k) < STOP_MERGE_RADIUS)) continue;
    stops.push({ kcal: k, label: null });
  }
  stops.sort((a, b) => a.kcal - b.kcal);
  return stops;
}

function nearestStop(value, stops) {
  return stops.reduce((best, s) => (Math.abs(s.kcal - value) < Math.abs(best.kcal - value) ? s : best), stops[0]).kcal;
}

// Index form of the above — this is what the native range input's value is
// driven by (see the slider render), since an index-based input is what
// makes each arrow-key press land on the adjacent stop instead of re-snapping
// back to the same one.
function nearestStopIndex(value, stops) {
  let bestIdx = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i].kcal - value) < Math.abs(stops[bestIdx].kcal - value)) bestIdx = i;
  }
  return bestIdx;
}

// Large-figure label under the kcal readout: the landmark it's sitting on, or
// the pair it's between.
function landmarkText(value, landmarks) {
  const exact = landmarks.find((l) => Math.abs(l.kcal - value) < 1);
  if (exact) return exact.label;
  for (let i = 0; i < landmarks.length - 1; i++) {
    if (value > landmarks[i].kcal && value < landmarks[i + 1].kcal) {
      return `between ${landmarks[i].label} and ${landmarks[i + 1].label}`;
    }
  }
  return "";
}

function deltaText(value, maintenance) {
  if (!maintenance) return "";
  const delta = Math.round(value - maintenance);
  // The slider snaps to a 50 kcal grid anchored at PEAK_CUT_KCAL, so the
  // "Maintain" landmark itself can sit a handful of kcal off the engine's
  // literal TDEE (e.g. 2,940 vs. 2,960). Treat anything inside half a step
  // as "at maintenance" rather than surfacing quantization noise like
  // "Maintain / −20 / day".
  if (Math.abs(delta) < SLIDER_STEP / 2) return "at maintenance";
  const pct = Math.round((delta / maintenance) * 100);
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)} / day, ${sign}${Math.abs(pct)}%`;
}

// `bare` drops the card's own glass chrome — used when it renders inside an
// already-glass container (the Fuel page's week-plan modal).
export default function WeeklyPlanCard({ bare = false }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const qc = useQueryClient();
  const { activePhase } = useDietPhase();
  const { customFoods } = useCustomFoods();

  const today = getTodayString(profile?.timezone);
  const [showShopping, setShowShopping] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const [showRationale, setShowRationale] = useState(false);

  // ONE source of truth for today's targets — the same hook the daily log rings
  // use (engine recovery-gated target → profile goal). Days the engine hasn't
  // scored yet fall back to these numbers.
  const { calories: calTarget, protein: proteinTarget, fats: fatTarget, engineSet, recommended: rec, isCut, aggressiveCut, manualOverride, carbWindows, nutrition, dietPhase, phasePending } = useDailyTargets(today);

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
  const { dayContext, isTrainingDay } = useDayPlanContext(dates, { enabled: !!calTarget });

  // The week: each day carb-cycled by the program schedule and fitted to ITS OWN
  // remaining budget (that day's engine target minus what's already eaten).
  const week = useMemo(
    () => dates.map((d) => resolveDayPlan({
      date: d,
      trainingDay: isTrainingDay(d),
      dayContext,
      calTarget,
      proteinTarget,
      fatTarget,
      isCut,
      profile,
      aggressiveCut,
      customFoods,
    })),
    [dates, dayContext, isTrainingDay, calTarget, proteinTarget, fatTarget, isCut, profile, aggressiveCut, customFoods]
  );

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
      } catch { /* storage full/unavailable, checks just won't persist */ }
      return next;
    });
  };
  const checkedCount = shopping.items.filter((it) => checked[it.food]).length;

  // Manual override (MacroFactor-style "Algorithm" vs "Manual"): the slider
  // below picks his own calorie/protein target for the week, it beats the
  // engine everywhere (this card, the daily rings) instantly. Backed by the
  // same nutrition_overrides row the daily ease/push escape valves use — one
  // more `action` value.
  const [showOverride, setShowOverride] = useState(false);
  const [overrideCal, setOverrideCal] = useState("");
  const [overrideProtein, setOverrideProtein] = useState("");
  // Snapshot of the kcal value the sheet opened with, so an untouched save
  // (see saveSlider) can tell "he never moved it" apart from "he moved it
  // back to where it started" — both must skip the phase move, not just the
  // former, so this is compared by value, not by a dirty flag.
  const [openValue, setOpenValue] = useState(null);

  // The engine's real TDEE — the slider's "Maintain" center and the anchor
  // every other landmark and the delta readout are computed from. Two places
  // carry it (see compute_athlete_state.py): recommended_intake is the live
  // phase's number, phase_options.maintenance is the same TDEE run through
  // the "maintenance" phase explicitly — either works, they agree, but the
  // explicit one is preferred since it can't be shadowed by a manual override
  // baked into recommended_intake.
  const maintenanceRaw = nutrition?.phase_options?.maintenance?.maintenance_kcal
    ?? nutrition?.recommended_intake?.maintenance_kcal
    ?? null;
  const maintenanceKnown = Number.isFinite(maintenanceRaw) && maintenanceRaw > 0;
  // Guard: no known TDEE yet (before the engine's first run) — anchor the
  // slider's midpoint on today's actual target instead of guessing one.
  const maintenance = maintenanceKnown ? maintenanceRaw : (calTarget || 2000);
  const landmarks = useMemo(() => buildLandmarks(maintenance), [maintenance]);
  const stops = useMemo(() => buildStops(landmarks), [landmarks]);
  const sliderMin = landmarks[0].kcal; // always Peak cut, protected
  const sliderMax = landmarks[landmarks.length - 1].kcal; // always Peak bulk, protected
  // The native <input> is INDEX-based (min=0, max=stops.length-1, step=1) so
  // that native keyboard/screen-reader increment behavior lands on the next
  // distinct stop every press — a value-based input with step=1 re-snaps via
  // nearestStop on every change, which pulls a 1 kcal keyboard nudge right
  // back to the SAME stop and makes arrow keys dead. aria-valuemin/max/now
  // stay in kcal terms (see the input below) so screen readers still hear
  // calories, not a raw index.
  const sliderIndex = nearestStopIndex(Number(overrideCal) || maintenance, stops);
  const sliderValue = stops[sliderIndex]?.kcal ?? maintenance;
  const sliderPct = (kcal) => ((kcal - sliderMin) / (sliderMax - sliderMin)) * 100;
  // Cool (cut) → off-white (maintain) → warm (bulk), the existing macro hues
  // (Ledger's carbs-blue / fat-gold) instead of a new brand color.
  const trackGradient = "linear-gradient(90deg, rgba(var(--hue-blue-rgb) / 0.55), rgba(var(--color-brand-rgb) / 0.35) 50%, rgba(var(--hue-yellow-rgb) / 0.55))";

  const openOverride = () => {
    const startVal = nearestStop(calTarget || maintenance, stops);
    setOverrideCal(String(startVal));
    setOpenValue(startVal);
    setOverrideProtein(proteinTarget ? String(Math.round(proteinTarget)) : "");
    setShowOverride(true);
  };

  // Diet phase picker (Nolan's call, 2026-09-27, superseded 2026-09-30 by the
  // slider below): the phase itself is still tracked (diet_phases / the cut's
  // 4-6 week clock, the cut macro rules) — it's just no longer a picker of its
  // own, it's derived from where the slider landed.
  const setPhase = useSetDietPhase(today);
  const currentChoice = manualOverride ? "custom" : (dietPhase || (isCut ? "cut" : "maintain"));
  const choiceLabel = { cut: "Cut", maintain: "Maintain", bulk: "Bulk", custom: "Custom" }[currentChoice];

  const setOverride = useMutation({
    mutationFn: async ({ clear }) => {
      if (clear) {
        await supabase.from("nutrition_overrides").delete()
          .eq("created_by", user.id).in("date", dates).eq("action", "manual");
        return { cleared: true };
      }
      const cal = parseInt(overrideCal, 10);
      if (!cal || cal <= 0) throw new Error("Enter a calorie target");
      const protein = overrideProtein ? parseInt(overrideProtein, 10) : null;
      const rows = dates.map((date) => ({
        created_by: user.id, date, action: "manual",
        manual_calorie_target: cal, manual_protein_g: protein,
      }));
      const { error } = await supabase.from("nutrition_overrides")
        .upsert(rows, { onConflict: "created_by,date" });
      if (error) throw error;
      return { cleared: false, cal };
    },
    onSuccess: ({ cleared, cal }) => {
      qc.invalidateQueries({ queryKey: ["day-plan-context"] });
      qc.invalidateQueries({ queryKey: ["nutrition-override"] });
      qc.invalidateQueries({ queryKey: ["athlete-state-nutrition"] });
      setShowOverride(false);
      toast.success(cleared ? "Back to the engine's target" : `Week set to ${cal} kcal/day manually`);
    },
    onError: (e) => toast.error(e.message || "Couldn't save the override"),
  });

  // Save the slider: the phase move (if any) has to land FIRST, since
  // useSetDietPhase clears any manual override row from today on as part of
  // switching phases — running it after the override write would silently
  // erase the number just saved. Below maintenance-100 -> cut, above
  // maintenance+100 -> bulk, else maintain; skipped entirely if the phase
  // he's already in already matches (re-picking a phase you're already in
  // would otherwise reset the cut's 4-6 week clock for nothing).
  //
  // Two more cases must ALSO skip the phase move, not just "already matches":
  //  - Maintenance unknown: there's no real TDEE to judge cut/bulk against
  //    (maintenance here is a calTarget fallback, not a phase signal), so
  //    deriving a phase from it is meaningless and would silently flip the
  //    tracked phase to "maintain" on a plain untouched save.
  //  - The slider wasn't actually moved from where the sheet opened: even
  //    with a real maintenance, quantization/landmark snapping could pick a
  //    different phase bucket than the currently-tracked one for the exact
  //    value the sheet opened on, which would wrongly re-trigger a phase
  //    change (and reset the cut clock) on a save that changed nothing.
  const saveSlider = async () => {
    const untouched = sliderValue === openValue;
    const currentPhase = dietPhase || (isCut ? "cut" : "maintain");
    try {
      if (maintenanceKnown && !untouched) {
        const targetPhase = sliderValue < maintenance - 100 ? "cut" : sliderValue > maintenance + 100 ? "bulk" : "maintain";
        if (targetPhase !== currentPhase) await setPhase.mutateAsync(targetPhase);
      }
      await setOverride.mutateAsync({ clear: false });
    } catch (e) {
      toast.error(e.message || "Couldn't save the target");
    }
  };

  // Manual per-day "force this food" override (e.g. force a Creami-sized
  // Cottage Cheese portion) — plan stays cost-driven everywhere else.
  const [forceFood, setForceFood] = useState("");
  const [forceGrams, setForceGrams] = useState("250");
  const setFoodMin = useMutation({
    mutationFn: async ({ date, food, grams }) => {
      const food_mins = food ? { [food]: grams } : null;
      const { error } = await supabase.from("nutrition_overrides")
        .upsert({ created_by: user.id, date, food_mins }, { onConflict: "created_by,date" });
      if (error) throw error;
      return { cleared: !food };
    },
    onSuccess: ({ cleared }) => {
      qc.invalidateQueries({ queryKey: ["day-plan-context"] });
      toast.success(cleared ? "Force-food cleared" : "This day will force that food in");
    },
    onError: (e) => toast.error(e.message || "Couldn't save the override"),
  });

  const approve = useMutation({
    mutationFn: async () => {
      // Idempotent: clear any prior planned rows for these dates, then load fresh.
      // Eaten (checked-off) rows are untouched — the per-day budgets above already
      // subtracted them, so re-approving mid-week can't double-count a day.
      const { error: deleteError } = await supabase.from("food_entries").delete()
        .eq("created_by", user.id).eq("planned", true).in("date", dates);
      if (deleteError) throw deleteError;
      const rows = allRows.map((e) => ({
        food_name: e.food_name, meal_type: e.meal_type,
        serving_size: e.serving_size, serving_unit: e.serving_unit,
        calories: e.calories, protein_grams: e.protein_grams,
        carbs_grams: e.carbs_grams, fats_grams: e.fats_grams,
        date: e.date, planned: true, created_by: user.id,
        // Carry the workout-timing window so the log can badge pre/post meals.
        tag: e.timing && e.timing !== "anytime" ? e.timing : null,
        cost_usd: e.cost_usd ?? null,
      }));
      // One insert instead of one request per row: a single PostgREST insert
      // is atomic, so a flaky network can't leave the week partially loaded.
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from("food_entries").insert(rows);
        if (insertError) throw insertError;
      }
      return rows.length;
    },
    onSuccess: (n) => {
      invalidateFood(qc);
      qc.invalidateQueries({ queryKey: ["day-plan-context"] });
      toast.success(`Loaded ${n} planned items across the week, check them off as you eat.`);
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
              <span className="text-[9px] uppercase tracking-wider text-ink-muted bg-charcoal-surface px-1.5 py-0.5 rounded-full font-bold">Sunday, plan ready</span>
            )}
          </div>
          <h3 className="text-lg font-bold text-ink leading-tight mt-1">{planLabel}</h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-technical text-gold leading-none">
            {calTarget ? Math.round(calTarget).toLocaleString() : "—"}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-ink-muted font-bold mt-1">
            kcal / day{manualOverride ? " · manual" : engineSet ? " · engine-set" : ""}
          </div>
        </div>
      </div>

      {phasePending && !manualOverride && (
        <p className="mx-5 mb-3 text-xs text-ink-muted">
          The engine computes your {choiceLabel.toLowerCase()} numbers tonight. Until then this shows last night&apos;s target.
        </p>
      )}

      {/* ── Manual-override banner — stands in for the recovery-gated block
          below, since that rationale describes the ENGINE's number, which the
          header is no longer showing. ── */}
      {manualOverride && (
        <div className="mx-5 mb-3 surface-2 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">Manual target</span>
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed mt-1">
            You set this week's target by hand — the engine's recovery-gated number is
            overridden until you clear it.
          </p>
        </div>
      )}

      {/* ── Recovery-gated rationale ── */}
      {!manualOverride && engineSet && rec && (
        <div className="mx-5 mb-3 surface-2 px-3.5 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">{currentChoice === "bulk" ? "Surplus" : currentChoice === "maintain" ? "Maintenance" : "Recovery-Gated Deficit"}</span>
            {/* This % is the PLANNED deficit magnitude — a derived ratio, not a
                kcal figure, so it must NOT borrow the gold kcal hue (that hue is
                owned by the calorie datum). Render it neutral (font-technical +
                secondary ink). text-warn stays reserved for the gate chips below,
                which are the actual recovery alarms. */}
            <span className="ml-auto font-technical text-sm text-ink-secondary">{currentChoice === "cut" ? `${Math.round((rec.deficit_ratio || 0) * 100)}%` : `${Math.round(rec.maintenance_kcal || 0).toLocaleString()} TDEE`}</span>
          </div>
          <p className={`text-xs text-ink-secondary leading-relaxed ${showRationale ? "" : "line-clamp-2"}`}>{rec.rationale}</p>
          {rec.rationale && rec.rationale.length > 90 && (
            <button
              onClick={() => setShowRationale((s) => !s)}
              className="glass-interactive mt-1 min-h-[44px] inline-flex items-center px-2 -mx-2 text-[10px] uppercase tracking-wider text-ink-muted font-bold active:scale-[0.98]"
            >
              {showRationale ? "Less" : "Why?"}
            </button>
          )}
          {(rec.gates || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rec.gates.map((g) => (
                <span key={g} className="text-[9px] uppercase tracking-wider text-warn bg-warn/10 border border-warn/20 px-1.5 py-0.5 rounded-full font-bold">
                  {GATE_LABEL[g] || g}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Carb timing: today's carb target split around session(s) — empty
          on a rest day, so nothing renders. ── */}
      {(carbWindows || []).length > 0 && (
        <div className="mx-5 mb-3 surface-2 px-3.5 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Flame className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">Carb Timing</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {carbWindows.map((w) => (
              <div key={w.label} className="text-xs text-ink-secondary">
                <span className="font-technical text-ink">{w.grams}g</span> {w.label}
              </div>
            ))}
          </div>
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
                className={`glass-interactive rounded-lg px-1.5 py-3 text-center border active:scale-[0.97] active:bg-brand/15 ${
                  isOpen ? "border-brand bg-brand/10"
                  : isToday ? "border-brand/40 bg-brand/5"
                  : "border-charcoal-border bg-charcoal-surface/40"
                }`}
              >
                <div className="text-[11px] uppercase tracking-wider text-ink-muted font-bold leading-none">{format(parseISO(d.date), "EEEEE")}</div>
                <div className="flex justify-center my-1.5">
                  {d.trainingDay
                    ? <Dumbbell className="w-3 h-3 text-viz-1" />
                    : <Moon className="w-3 h-3 text-ink-faint" />}
                </div>
                {/* One datum per cell: the gold kcal figure (carb grams live in the
                    day-detail panel). Eaten-out days keep the gold figure and swap
                    only the sub-line to a muted tag, so the gold/viz-3 hue mapping
                    stays uniform across all 7 cells. */}
                <div className="font-technical text-xs text-gold leading-none">{d.totals.calories ? d.totals.calories.toLocaleString() : "—"}</div>
                {!d.rows.length && (
                  <div className="text-[9px] uppercase tracking-wider font-bold text-ink-faint leading-none mt-1">logged</div>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px]">
          <span className="flex items-center gap-1 text-ink-muted"><Dumbbell className="w-3 h-3 text-viz-1" /> {trainCount} lift · <Moon className="w-3 h-3 text-ink-faint" /> {7 - trainCount} rest</span>
          {/* Carb-cycle range is the headline datum of the strip — promote it to
              font-technical + secondary ink; the lift/rest tally stays muted. */}
          <span className="font-technical text-ink-secondary">
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
          {/* ── Force a food into this day (e.g. a Creami-sized cottage cheese
              portion) — cost-driven everywhere else, this is the manual override. ── */}
          <div className="flex items-center gap-1.5 px-3.5 py-2 border-b hairline text-[11px]">
            <Snowflake className="w-3 h-3 text-carb shrink-0" />
            <select
              value={forceFood}
              onChange={(e) => setForceFood(e.target.value)}
              className="glass-inset rounded px-1.5 py-1 text-ink bg-transparent"
            >
              <option value="">Force a food…</option>
              {FORCEABLE_FOODS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <input
              type="number" inputMode="decimal"
              value={forceGrams}
              onChange={(e) => setForceGrams(e.target.value)}
              className="glass-inset rounded px-1.5 py-1 w-14 text-ink bg-transparent font-technical"
            />
            <span className="text-ink-muted">g</span>
            <button
              onClick={() => forceFood && setFoodMin.mutate({ date: openDayData.date, food: forceFood, grams: parseInt(forceGrams, 10) || 250 })}
              disabled={!forceFood || setFoodMin.isPending}
              className="glass-interactive min-h-[28px] px-2 rounded text-[10px] uppercase tracking-wider font-bold text-brand active:scale-[0.97] disabled:opacity-40"
            >
              Set
            </button>
            {dayContext?.foodMins?.[openDayData.date] && (
              <button
                onClick={() => setFoodMin.mutate({ date: openDayData.date, food: null, grams: null })}
                disabled={setFoodMin.isPending}
                className="glass-interactive min-h-[28px] px-2 rounded text-[10px] uppercase tracking-wider font-bold text-ink-muted active:scale-[0.97]"
              >
                Clear
              </button>
            )}
          </div>
          {openDayData.rows.length === 0 ? (
            <p className="px-3.5 py-3 text-xs text-ink-muted">
              This day's budget is already used up by logged food, nothing left to plan.
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
                        <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full text-ink-muted bg-charcoal-surface">
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
                    <span className="text-coral">{Math.round(openDayData.totals.protein)}p</span> · <span className="text-carb">{Math.round(openDayData.totals.carbs)}c</span> · <span className="text-fat">{Math.round(openDayData.totals.fats)}f</span>
                  </span>
                </div>
                <MacroBar p={openDayData.totals.protein} c={openDayData.totals.carbs} f={openDayData.totals.fats} />
                {openDayData.rows.proteinShortfall > 0 && (
                  <p className="mt-2 text-[10px] text-ink-secondary">
                    Protein lands {openDayData.rows.proteinShortfall} g under target, the food list's lean
                    sources are maxed out. Add a lean protein to the catalog or cover it manually.
                  </p>
                )}
                {openDayData.rows.proteinEased > 0 && (
                  <p className="mt-2 text-[10px] text-ink-muted">
                    Protein eased {openDayData.rows.proteinEased} g below the 1.3 g/lb anchor (still ≥ the
                    1.2 g/lb floor) to hold this day's calorie wall, protein drops last, calories don't bend.
                  </p>
                )}
                {openDayData.rows.calorieOverage > 0 && (
                  <p className="mt-2 text-[10px] text-ink-secondary">
                    Even at the 1.2 g/lb protein floor this day runs {openDayData.rows.calorieOverage} kcal
                    over target, the calorie wall bends before the hard protein floor does.
                  </p>
                )}
                {creamiFoods.length > 0 && (
                  <p className="flex items-center gap-1.5 mt-2 text-[10px] text-ink-muted">
                    <Snowflake className="w-3 h-3 text-carb shrink-0" />
                    Creami option: {creamiFoods.length > 1
                      ? `blend the ${creamiFoods.slice(0, 3).join(" + ")} into protein ice cream`
                      : `spin the whey scoop with water/ice into protein ice cream`}, same macros, same cost.
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
        className="glass-interactive w-full min-h-[44px] px-5 py-3 mt-3 flex items-center gap-2 text-xs text-ink-secondary hover:text-ink active:scale-[0.99] border-t hairline"
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
                  {/* Done is a neutral checklist state, NOT a biometric reading —
                      the ok/warn/bad/info spectrum (and leaf) is reserved for
                      physiological data. A neutral ink check on the empty-track
                      ring + the label's existing strikethrough carries "done"
                      without borrowing a data hue. (ink-* tokens carry baked
                      alpha, so /xx modifiers don't apply, use the solid token.) */}
                  <span className={`shrink-0 w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-colors duration-200 [transition-timing-function:var(--ease)] ${done ? "border-track bg-track text-ink-faint" : "border-track text-transparent"}`}>
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
          living ~2000px down the scroll. Backed by the glass-sheet recipe (the
          near-opaque --sheet-bg + blur) so scrolled content can't bleed through
          behind the CTA, bg-[var(--color-bg)]/95 silently dropped its alpha
          (Tailwind can't inject /95 into a raw var()), leaving no real backing. */}
      <div className="sticky bottom-0 px-5 pb-4 pt-3 glass-sheet border-t hairline">
        <div className="flex gap-2">
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending || allRows.length === 0}
            className="cta-action flex-1 disabled:opacity-60 active:scale-[0.98]"
          >
            {approve.isPending ? "Loading week…" : <><Check className="w-4 h-4" /> Approve &amp; load the week</>}
          </button>
          <button
            onClick={openOverride}
            className="glass-interactive shrink-0 min-h-[44px] px-4 rounded-xl border border-charcoal-border flex items-center gap-1.5 text-xs font-bold text-ink-secondary active:scale-[0.98]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {choiceLabel}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-ink-muted text-center mt-2 flex items-center justify-center gap-1">
          <Flame className="w-3 h-3" /> Pre-fills your log as check-off items · portions auto-adjust to each day's target
        </p>
      </div>

      {/* ── Diet target slider: one horizontal control from Peak cut to Peak
          bulk, Maintain in the middle, snapping to named landmarks and
          stepping 50 kcal between them. Replaces the old four-way Cut /
          Maintain / Bulk / Custom picker (Nolan's call, 2026-09-30) — the
          slider always writes a manual override row (same nutrition_overrides
          path as before), and moves the diet phase to match where it lands.
          The day plan above rebuilds around wherever it's set. ── */}
      <Dialog open={showOverride} onOpenChange={setShowOverride}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diet target</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-5">
            {!maintenanceKnown && (
              <p className="text-[11px] text-ink-muted">
                Maintenance estimate pending — using today&apos;s target as the midpoint until the engine has one.
              </p>
            )}

            <div className="text-center">
              <div className="text-3xl font-technical text-gold leading-none [font-variant-numeric:tabular-nums]">
                {sliderValue.toLocaleString()} <span className="text-base text-ink-muted">kcal</span>
              </div>
              <div className="text-xs text-ink-secondary mt-1.5">
                {landmarkText(sliderValue, landmarks)}
              </div>
              {maintenanceKnown && (
                <div className="text-[11px] text-ink-muted mt-0.5 font-technical">
                  {deltaText(sliderValue, maintenance)}
                </div>
              )}
            </div>

            <div className="pt-1">
              <div className="relative h-11 flex items-center">
                <div
                  className="absolute inset-x-0 h-1.5 rounded-full pointer-events-none"
                  style={{ background: trackGradient }}
                />
                <input
                  type="range"
                  className="diet-slider relative w-full"
                  // INDEX-based on purpose: the visible stops (landmarks +
                  // 50 kcal fillers, see buildStops) aren't evenly spaced in
                  // kcal, so a kcal-valued input with a uniform step can't
                  // represent them without re-snapping in JS on every change
                  // — and that re-snap is what made arrow keys dead (a 1
                  // kcal keyboard nudge almost always re-snaps back to the
                  // SAME stop). Indexing the stop list instead means every
                  // native value IS a distinct stop, so each arrow press
                  // moves exactly one. Home/End land on index 0 / last,
                  // which are always Peak cut / Peak bulk (buildLandmarks
                  // never drops either).
                  min={0}
                  max={stops.length - 1}
                  step={1}
                  value={sliderIndex}
                  onChange={(e) => setOverrideCal(String(stops[Number(e.target.value)]?.kcal ?? maintenance))}
                  aria-label="Daily calorie target"
                  aria-valuemin={sliderMin}
                  aria-valuemax={sliderMax}
                  aria-valuenow={sliderValue}
                  aria-valuetext={`${sliderValue.toLocaleString()} kcal, ${landmarkText(sliderValue, landmarks)}`}
                />
              </div>
              <div className="relative h-8 mt-0.5">
                {landmarks.map((l) => {
                  // Only the three protected landmarks get visible text —
                  // at 390px width, labeling all 7 landmarks collides. The
                  // rest are bare ticks; their names still surface in the
                  // big readout above when the thumb is on/near them (see
                  // landmarkText). Peak cut/Peak bulk are pinned to the
                  // track ends with edge alignment instead of the centered
                  // translate used for everything else, so their text can
                  // never overflow the dialog.
                  const edge = l.key === "peak_cut" ? "left" : l.key === "peak_bulk" ? "right" : null;
                  const showLabel = PROTECTED_LANDMARKS.has(l.key);
                  return (
                    <div
                      key={l.key}
                      className={edge ? "absolute text-center w-16" : "absolute -translate-x-1/2 text-center w-16"}
                      style={edge ? { [edge]: 0 } : { left: `${sliderPct(l.kcal)}%` }}
                    >
                      <div className={edge === "left" ? "w-px h-1.5 bg-charcoal-border" : edge === "right" ? "w-px h-1.5 bg-charcoal-border ml-auto" : "w-px h-1.5 bg-charcoal-border mx-auto"} />
                      {showLabel && (
                        <div
                          className={`text-[9px] uppercase tracking-wider text-ink-faint font-bold mt-0.5 leading-tight ${edge === "left" ? "text-left" : edge === "right" ? "text-right" : "text-center"}`}
                        >
                          {l.label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">Protein g / day</span>
              <input
                type="number" inputMode="numeric" value={overrideProtein}
                placeholder={proteinTarget ? String(Math.round(proteinTarget)) : ""}
                onChange={(e) => setOverrideProtein(e.target.value)}
                className="mt-1 w-full rounded-lg bg-charcoal-surface border border-charcoal-border px-3 py-2.5 text-lg font-technical text-coral"
              />
            </label>

            <button
              onClick={saveSlider}
              disabled={setOverride.isPending || setPhase.isPending}
              className="cta-action w-full disabled:opacity-60"
            >
              {setOverride.isPending || setPhase.isPending ? "Saving…" : "Set target"}
            </button>
            {manualOverride && (
              <button
                type="button"
                onClick={() => setOverride.mutate({ clear: true })}
                disabled={setOverride.isPending}
                className="glass-interactive w-full min-h-[44px] rounded-xl border border-charcoal-border text-xs font-bold text-ink-secondary active:scale-[0.98] disabled:opacity-60"
              >
                Back to the engine&apos;s target
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
