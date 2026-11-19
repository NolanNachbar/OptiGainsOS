/* eslint-disable react-refresh/only-export-components */
import { Star, ArrowUpRight, Calculator } from "lucide-react";
import { calculatePhaseCalories, calculateMacroSplit } from "@/utils/coachingUtils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MacroGoalsEditor } from "@/components/nutrition/MacroGoalsEditor";

// Shared helpers extracted from FoodTracker.jsx (no behavior change).
// Label for an entry logged with calories only and no food name.
export const QUICK_ADD_NAME = "Quick add";

export const getDefaultMealType = () => {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 17) return "snack";
  return "dinner";
};

// Retroactive-log fallback clock times (Nolan's call, 2026-07-27): "logging it
// earlier" needs SOME time to stamp eaten_at with, and a manual time picker is
// one more tap he doesn't want — so a logged-earlier entry gets its meal
// type's default clock time instead. [ENG]
export const MEAL_DEFAULT_TIME = { breakfast: "08:00", lunch: "12:30", snack: "15:30", dinner: "19:00" };

// eaten_at for a new food_entries row: "now" stamps the actual moment; "earlier"
// (he's logging something he ate a while ago) falls back to the meal type's
// default clock time on the entry's date, since MealFactor-style retroactive
// logging happens with no reliable actual-time input.
export const getEatenAt = (loggingMode, mealType, dateStr) => {
  if (loggingMode !== "earlier") return new Date().toISOString();
  const time = MEAL_DEFAULT_TIME[mealType] || MEAL_DEFAULT_TIME.snack;
  return new Date(`${dateStr}T${time}:00`).toISOString();
};

// "Eating it right now" vs "logging it earlier" segmented toggle — governs
// eaten_at on the entries this dialog creates.
export const LoggingModeToggle = ({ value, onChange }) => (
  <div className="inline-flex rounded-lg surface-2 p-0.5 text-caption">
    {[["now", "Eating now"], ["earlier", "Logging earlier"]].map(([id, label]) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
          value === id ? "bg-gold/15 text-ink" : "text-ink-muted"
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

// Hue-coded macro line for search-result rows. Each macro owns its system hue
// (kcal=gold, P=coral, C=carb, F=fat) so the result list reads with the same
// color grammar as the summary tiles. Dot separators stay faint ink.
export const MacroResultLine = ({ cal, p, c, f, per100g = false }) => (
  <div className="flex flex-wrap gap-x-1.5 mt-0.5 text-caption font-technical tabular-nums">
    <span className="text-ink">{Math.round(cal)} kcal{per100g ? ' / 100g' : ''}</span>
    <span className="text-ink-faint">·</span>
    <span className="text-coral">P {Math.round(p)}g</span>
    <span className="text-ink-faint">·</span>
    <span className="text-carb">C {Math.round(c)}g</span>
    <span className="text-ink-faint">·</span>
    <span className="text-fat">F {Math.round(f)}g</span>
  </div>
);

// Shared dashed-ghost button primitive (fuel-nutrition-8). The CLEAN system ships
// a solid `.cta-ghost` but no DASHED ghost — a genuine gap for these low-emphasis
// "secondary setup" affordances (Save day as template, Edit goals, Set up TDEE)
// that were each re-declaring the same dashed border + uppercase micro-label +
// neutral-ink hover. One base string, tokened transition; callers append width /
// radius / hover-accent overrides. Documented here rather than in index.css since
// this surface owns only FoodTracker.jsx.
export const GHOST_DASHED =
  "flex items-center justify-center gap-1.5 min-h-[44px] border border-dashed border-charcoal-border text-caption font-semibold uppercase tracking-widest text-ink-muted transition-all duration-200 [transition-timing-function:var(--ease)]";

// Default neutral hover for the dashed ghost; the desktop "Set up TDEE / Edit
// goals" affordance swaps this for a teal action-hover instead.
export const GHOST_DASHED_HOVER = "hover:text-ink hover:border-charcoal-borderSoft";

// The units every food gets for free. A food that defines its own portion under
// one of these names (a cup of flour is 120 g, not the 240 g water constant)
// replaces the entry rather than sitting beside it.
// Star a saved food to float it to the top of My Foods. Sits beside the row's
// select button rather than inside it — nesting buttons is invalid HTML and the
// star would swallow the click that picks the food.
export const FavoriteToggle = ({ food, onToggle }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onToggle({ id: food.id, is_favorite: !food.is_favorite }); }}
    aria-label={food.is_favorite ? `Unfavorite ${food.food_name}` : `Favorite ${food.food_name}`}
    aria-pressed={!!food.is_favorite}
    className="min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center text-ink-faint hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
  >
    <Star className={`w-4 h-4 ${food.is_favorite ? "fill-gold text-ink" : ""}`} />
  </button>
);

export const GENERIC_UNITS = [
  { value: "g", label: "grams" },
  { value: "oz", label: "oz" },
  { value: "cup", label: "cup(s)" },
  { value: "tbsp", label: "tbsp" },
  { value: "tsp", label: "tsp" },
  { value: "ml", label: "ml" },
];

// Downscale a captured photo before upload. Phones shoot multi-MB full-res
// images that blow the edge function's ~10MB cap and crawl on weak connections,
// so cap the long edge and re-encode as JPEG. Falls back to the raw data URL if
// the image can't be decoded.
export async function downscaleToDataUrl(file, maxEdge = 1568, quality = 0.8) {
  const rawUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the photo"));
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = rawUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    if (scale >= 1) return rawUrl; // already small enough
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return rawUrl; // decode failed — send the original and let the server decide
  }
}

// supabase functions.invoke throws a generic "non-2xx" FunctionsHttpError whose
// message hides the real server reason (that lives in error.context, a Response).
// Surface the actual message so the user knows what to fix (shrink the photo,
// retake the label, retry), instead of a misleading "isn't deployed yet".
export async function fnErrorMessage(error) {
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    const body = await ctx.json().catch(() => null);
    if (body?.error) return body.error;
  }
  if (/Failed to send/i.test(error?.message || "")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return error?.message || "Request failed";
}

// Quiet "119P 0C 16F" line used under food names and meal headers.
// `fields` tags each number with data-field (protein/carbs/fats) so a food
// row's numeric columns stay addressable (e2e fuel-null-macros-render-zero).
export const MacroInline = ({ p, c, f, fields = false }) => {
  const n = (v, key) => (fields ? <span data-field={key}>{Math.round(v)}</span> : Math.round(v));
  return (
    <span className="font-technical text-caption font-semibold tabular-nums whitespace-nowrap">
      <span className="text-coral">{n(p, "protein")}P</span>{" "}
      <span className="text-carb">{n(c, "carbs")}C</span>{" "}
      <span className="text-fat">{n(f, "fats")}F</span>
    </span>
  );
};

export function GoalsFormContent({
  activePhase, tdee, profile, latestWeight,
  proteinPerLb, setProteinPerLb,
  goalForm, setGoalForm,
  fiberGoal, setFiberGoal, fiberDefault,
  navigate, setShowGoalsModal, setShowStatsModal,
}) {


  return (
    <div className="space-y-6">
      {activePhase && tdee.tdee && (() => {
        const phaseCalories = activePhase.phase_type === 'reverse'
          ? (profile?.daily_calorie_goal || tdee.tdee)
          : calculatePhaseCalories(tdee.tdee, activePhase.weekly_rate);
        const goalsOutOfSync = Math.abs((profile?.daily_calorie_goal || 0) - phaseCalories) > 50;
        return (
          <div className="rounded-xl border border-charcoal-border glass-inset p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {/* Phase is a category label, not a biometric — neutral glass
                      treatment so the ok/info physiological spectrum stays
                      reserved for biometrics. */}
                  <span className="pill-value pill-value--sm text-ink-secondary">
                    {activePhase.phase_type === 'cut' ? 'Cut' : activePhase.phase_type === 'bulk' ? 'Bulk' : activePhase.phase_type === 'reverse' ? 'Reverse' : 'Maintain'}
                  </span>
                  <span className="text-body text-ink-muted">
                    {activePhase.phase_type === 'reverse'
                      ? `+${activePhase.weekly_rate} cal/wk`
                      : `${activePhase.weekly_rate > 0 ? '+' : ''}${activePhase.weekly_rate} ${profile?.weight_unit || 'lbs'}/wk`}
                  </span>
                </div>
                {/* One hero number: the saved Daily Calories goal (kcal owns
                    gold). The phase target demotes to a muted reference line. */}
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="type-display text-ink text-display tabular-nums">
                    {(profile?.daily_calorie_goal || goalForm?.calories || phaseCalories).toLocaleString()}
                  </span>
                  <span className="text-caption font-semibold text-ink-muted">cal/day</span>
                </div>
                <div className="text-caption text-ink-muted mt-0.5 tabular-nums">
                  Phase target {phaseCalories.toLocaleString()} cal/day
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" className="min-h-[44px] text-ink-muted hover:text-ink shrink-0 gap-1"
                onClick={() => { setShowGoalsModal(false); navigate('/dashboard?tab=coach'); }}>
                Manage <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            {/* Out-of-sync is form attention, not a biometric — neutral ink with
                coral reserved for the Sync Goals action (SYS-09c). */}
            {goalsOutOfSync && (
              <div className="flex items-center justify-between gap-3 pt-1 border-t hairline">
                <p className="text-caption text-ink-secondary">
                  Your saved goals ({(profile?.daily_calorie_goal || 0).toLocaleString()} cal) don't match your phase target.
                </p>
                <Button type="button" variant="volt" size="sm" className="min-h-[44px] shrink-0"
                  onClick={() => {
                    const weightLbs = profile?.weight_unit === 'kg' ? (latestWeight || 0) * 2.205 : (latestWeight || 0);
                    const protein = weightLbs ? Math.round(weightLbs * proteinPerLb) : profile?.daily_protein_goal || 150;
                    setGoalForm(calculateMacroSplit(phaseCalories, protein));
                    toast.info('Goals updated to match your phase, save to apply.');
                  }}
                >
                  Sync Goals
                </Button>
              </div>
            )}
          </div>
        );
      })()}

      {!tdee.tdee && (
        <div className="rounded-xl border border-dashed border-charcoal-border p-4 text-center space-y-2">
          <p className="text-body text-ink-muted">Set up your stats to auto-calculate daily calorie and macro targets.</p>
          <Button type="button" variant="outline" size="lg" className="w-full min-h-[44px]" onClick={() => { setShowGoalsModal(false); setShowStatsModal(true); }}>
            <Calculator className="w-4 h-4 mr-2" />Set up TDEE calculation
          </Button>
        </div>
      )}

      {tdee.tdee && latestWeight && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Label className="whitespace-nowrap text-body sm:shrink-0">Protein target</Label>
            <div className="flex items-center gap-2 flex-1">
              <Input type="number" inputMode="decimal" step="0.05" min="0.5" max="2.5" value={proteinPerLb}
                onChange={(e) => setProteinPerLb(e.target.value)} className="flex-1 min-w-0" />
              <span className="text-body text-ink-muted whitespace-nowrap">g / lb</span>
              {latestWeight && (
                <span className="pill-value pill-value--sm text-ink ml-auto sm:ml-0">
                  = {Math.round(proteinPerLb * (profile?.weight_unit === 'kg' ? latestWeight * 2.205 : latestWeight))}g/day
                </span>
              )}
            </div>
          </div>
          <Button type="button" variant="outline" className="w-full border-dashed"
            onClick={() => {
              const weightLbs = profile?.weight_unit === 'kg' ? latestWeight * 2.205 : latestWeight;
              const protein = Math.round(weightLbs * (parseFloat(proteinPerLb) || 0.8));
              const targetCalories = activePhase
                ? (activePhase.phase_type === 'reverse' ? (profile?.daily_calorie_goal || tdee.tdee) : calculatePhaseCalories(tdee.tdee, activePhase.weekly_rate))
                : tdee.tdee;
              setGoalForm(calculateMacroSplit(targetCalories, protein));
              const label = activePhase ? `${activePhase.phase_type} phase (${targetCalories} cal)` : `maintenance (${tdee.tdee} cal)`;
              toast.info(`Set to ${label}. Adjust as needed.`);
            }}
          >
            <Calculator className="w-4 h-4 mr-2" />Auto-calculate from TDEE ({tdee.tdee.toLocaleString()} cal)
          </Button>
        </div>
      )}

      {/* Save Goals lives in the dialog's pinned non-scrolling footer (parent),
          so the primary action stays reachable without scrolling the form. */}
      <MacroGoalsEditor values={goalForm} onChange={setGoalForm} />

      {/* Fiber is deliberately not part of the macro split above — it's already
          counted inside carbs, so giving it a slider there would double-count
          the calories. Left blank it follows the DRI's 14 g per 1000 kcal
          (Institute of Medicine, 2005), which scales with the calorie target
          instead of sitting at a fixed number through a cut. */}
      <div className="glass-inset rounded-xl p-4 space-y-2">
        <Label htmlFor="fiber-goal">Fiber goal (g/day)</Label>
        <Input
          id="fiber-goal"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={fiberGoal}
          onChange={(e) => setFiberGoal(e.target.value)}
          placeholder={String(fiberDefault)}
        />
        <p className="text-caption text-ink-faint">
          Leave blank to track 14 g per 1,000 kcal (
          {fiberDefault} g at your current calorie target).
        </p>
      </div>
    </div>
  );
}
