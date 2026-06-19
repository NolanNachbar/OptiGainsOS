import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Calories input + protein/carbs sliders, fat auto-fills the remainder.
 * values / onChange use the profile key shape:
 *   { daily_calorie_goal, daily_protein_goal, daily_carbs_goal, daily_fats_goal }
 */
export function MacroGoalsEditor({ values, onChange }) {
  const calories = Number(values.daily_calorie_goal) || 0;

  const proteinPct = calories > 0 ? Math.min(100, Math.round((Number(values.daily_protein_goal) * 4 / calories) * 100)) : 0;
  const carbsPct   = calories > 0 ? Math.min(100, Math.round((Number(values.daily_carbs_goal)   * 4 / calories) * 100)) : 0;
  const fatPct     = Math.max(0, 100 - proteinPct - carbsPct);

  const gramsFromPct = (pct, calsPerGram) => Math.round(calories * pct / 100 / calsPerGram);

  const handleCaloriesChange = (raw) => {
    const newCal = parseInt(raw) || 0;
    onChange({
      ...values,
      daily_calorie_goal:  newCal,
      daily_protein_goal:  gramsFromPctOf(newCal, proteinPct, 4),
      daily_carbs_goal:    gramsFromPctOf(newCal, carbsPct,   4),
      daily_fats_goal:     gramsFromPctOf(newCal, fatPct,     9),
    });
  };

  const handleProteinSlider = (newPct) => {
    const clamped = Math.min(newPct, 100 - carbsPct);
    const newFatPct = Math.max(0, 100 - clamped - carbsPct);
    onChange({
      ...values,
      daily_protein_goal: gramsFromPct(clamped,   4),
      daily_fats_goal:    gramsFromPct(newFatPct, 9),
    });
  };

  const handleCarbsSlider = (newPct) => {
    const clamped = Math.min(newPct, 100 - proteinPct);
    const newFatPct = Math.max(0, 100 - proteinPct - clamped);
    onChange({
      ...values,
      daily_carbs_goal: gramsFromPct(clamped,   4),
      daily_fats_goal:  gramsFromPct(newFatPct, 9),
    });
  };

  const macros = [
    {
      label: 'Protein',
      pct: proteinPct,
      g: values.daily_protein_goal,
      bar: 'bg-coral',
      text: 'text-coral',
      onSlide: handleProteinSlider,
      max: Math.max(proteinPct, 100 - carbsPct),
    },
    {
      label: 'Carbs',
      pct: carbsPct,
      g: values.daily_carbs_goal,
      bar: 'bg-carb',
      text: 'text-carb',
      onSlide: handleCarbsSlider,
      max: Math.max(carbsPct, 100 - proteinPct),
    },
    {
      label: 'Fat',
      pct: fatPct,
      g: values.daily_fats_goal,
      bar: 'bg-fat',
      text: 'text-fat',
      onSlide: null,
    },
  ];

  return (
    <div className="space-y-5">
      {/* System extension (genuine gap): native <input type=range> has no token
          for thumb sizing. Mobile law requires a >=44px touch zone with a
          finger-sized thumb. The range track stays 1.5px (visual), the wrapper
          above provides the 44px hit area, and these rules size the draggable
          thumb to 24px in the coral action hue. Scoped to .og-macro-range so it
          can't leak onto other ranges. */}
      <style>{`
        .og-macro-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 9999px;
          background: var(--color-brand);
          border: 2px solid var(--color-bg);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4);
          cursor: pointer;
        }
        .og-macro-range::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 9999px;
          background: var(--color-brand);
          border: 2px solid var(--color-bg);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4);
          cursor: pointer;
        }
      `}</style>
      {/* Calories */}
      <div>
        <Label>Daily Calories</Label>
        <Input
          type="number"
          value={values.daily_calorie_goal}
          onChange={(e) => handleCaloriesChange(e.target.value)}
          min="0"
          className="mt-1"
        />
      </div>

      {/* Stacked colour bar */}
      <div className="h-2.5 w-full rounded-full overflow-hidden flex">
        <div className="bg-coral h-full transition-all duration-150" style={{ width: `${proteinPct}%` }} />
        <div className="bg-carb h-full transition-all duration-150" style={{ width: `${carbsPct}%` }} />
        <div className="bg-fat h-full transition-all duration-150" style={{ width: `${fatPct}%` }} />
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        {macros.map(({ label, pct, g, bar, text, onSlide, max }) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-sm font-semibold ${text}`}>{label}</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted text-xs">{pct}%</span>
                <span className={`font-bold tabular-nums ${text}`}>{g}g</span>
                {!onSlide && <span className="text-[10px] text-ink-muted uppercase tracking-wider">auto</span>}
              </div>
            </div>
            {onSlide ? (
              <div className="flex items-center min-h-[44px]">
                <input
                  type="range"
                  min={0}
                  max={max}
                  value={pct}
                  onChange={(e) => onSlide(parseInt(e.target.value))}
                  className="og-macro-range w-full h-1.5 rounded-full appearance-none cursor-pointer accent-brand bg-charcoal-elevated"
                />
              </div>
            ) : (
              <div className="h-1.5 w-full rounded-full bg-charcoal-elevated overflow-hidden">
                <div className={`${bar} h-full rounded-full transition-all duration-150`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function gramsFromPctOf(cal, pct, calsPerGram) {
  return Math.round(cal * pct / 100 / calsPerGram);
}
