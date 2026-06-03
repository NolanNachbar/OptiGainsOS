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
      bar: 'bg-[#60a5fa]',
      text: 'text-[#60a5fa]',
      onSlide: handleProteinSlider,
      max: Math.max(proteinPct, 100 - carbsPct),
    },
    {
      label: 'Carbs',
      pct: carbsPct,
      g: values.daily_carbs_goal,
      bar: 'bg-[#fbbf24]',
      text: 'text-[#fbbf24]',
      onSlide: handleCarbsSlider,
      max: Math.max(carbsPct, 100 - proteinPct),
    },
    {
      label: 'Fat',
      pct: fatPct,
      g: values.daily_fats_goal,
      bar: 'bg-[#f87171]',
      text: 'text-[#f87171]',
      onSlide: null,
    },
  ];

  return (
    <div className="space-y-5">
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
        <div className="bg-[#60a5fa] h-full transition-all duration-150" style={{ width: `${proteinPct}%` }} />
        <div className="bg-[#fbbf24] h-full transition-all duration-150" style={{ width: `${carbsPct}%` }} />
        <div className="bg-[#f87171] h-full transition-all duration-150" style={{ width: `${fatPct}%` }} />
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        {macros.map(({ label, pct, g, bar, text, onSlide, max }) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-sm font-semibold ${text}`}>{label}</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#555555] text-xs">{pct}%</span>
                <span className={`font-bold tabular-nums ${text}`}>{g}g</span>
                {!onSlide && <span className="text-[10px] text-[#555555] uppercase tracking-wider">auto</span>}
              </div>
            </div>
            {onSlide ? (
              <input
                type="range"
                min={0}
                max={max}
                value={pct}
                onChange={(e) => onSlide(parseInt(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-brand bg-[#2a2a2a]"
              />
            ) : (
              <div className="h-1.5 w-full rounded-full bg-[#2a2a2a] overflow-hidden">
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
