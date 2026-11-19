import { Badge } from "@/components/ui/badge";

export default function NutritionSection({ data, targets }) {
  if (!data) return <p className="text-xs font-semibold text-muted-2">No nutrition data computed yet.</p>;

  const {
    phase,
    avg_calories_7d,
    avg_daily_calories_7d,
    avg_protein_7d,
    calorie_adherence,
    weight_trend_lbs_per_week,
    on_track,
  } = data;

  // Targets come from useDailyTargets — the single source of truth — so this
  // card can never disagree with the Fuel/Today rings for the same day.
  const calorie_target = targets?.calories ?? data.calorie_target ?? null;
  const protein_target = targets?.protein ?? data.protein_target ?? null;

  // compute_athlete_state.py uses avg_daily_calories_7d; edge fn uses avg_calories_7d
  const avgCal = avg_calories_7d ?? avg_daily_calories_7d ?? 0;

  const adherencePct  = calorie_adherence != null ? Math.round(calorie_adherence * 100) : null;
  const proteinPct    = protein_target > 0 ? Math.min((avg_protein_7d / protein_target) * 100, 120) : null;
  const calPct        = calorie_target  > 0 ? Math.min((avgCal / calorie_target)  * 100, 120) : null;

  const phaseColor = phase === "cut" ? "text-muted-2" : phase === "bulk" ? "text-gold" : "text-muted-2";

  const weightTrendColor =
    weight_trend_lbs_per_week == null ? "text-muted-2"
    : phase === "cut"
      ? (weight_trend_lbs_per_week < -0.5 ? "text-teal" : weight_trend_lbs_per_week < 0 ? "text-warn" : "text-bad")
      : phase === "bulk"
        ? (weight_trend_lbs_per_week > 0.2 ? "text-teal" : "text-warn")
        : "text-muted-2";

  return (
    <div className="space-y-4">
      {/* Phase + on-track badge */}
      <div className="flex items-center gap-3">
        <span className={`text-sm font-extrabold uppercase tracking-wide ${phaseColor}`}>
          {phase ?? "--"}
        </span>
        {on_track != null && (
          <Badge className={`border-none text-caption ${on_track ? "bg-teal/15 text-teal" : "bg-bad/15 text-bad"}`}>
            {on_track ? "On Track" : "Off Track"}
          </Badge>
        )}
      </div>

      {/* Calorie adherence */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-bold text-secondary">Calories (7d avg)</span>
          <span className="font-technical text-ink font-bold">
            {avgCal ? Math.round(avgCal).toLocaleString() : "--"}
            {calorie_target ? <span className="text-muted-2 font-semibold"> / {calorie_target.toLocaleString()}</span> : null}
            {adherencePct != null ? <span className="ml-1.5 text-muted-2">({adherencePct}%)</span> : null}
          </span>
        </div>
        {calPct != null && (
          <div className="h-1.5 bg-track rounded-full overflow-hidden">
            {/* Calories own GOLD (the macro's hue, SYS-09d). Adherence is read on
                the (xx%) figure, not by tinting the bar with the biometric
                spectrum, so the fill stays a single data hue regardless of over/
                under. */}
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-200 ease-[var(--ease)]"
              style={{ width: `${Math.min(calPct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Protein */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-bold text-secondary">Protein (7d avg)</span>
          <span className="font-technical text-ink font-bold">
            {avg_protein_7d != null ? `${Math.round(avg_protein_7d)}g` : "--"}
            {protein_target ? <span className="text-muted-2 font-semibold"> / {protein_target}g</span> : null}
          </span>
        </div>
        {proteinPct != null && (
          <div className="h-1.5 bg-track rounded-full overflow-hidden">
            {/* Protein owns CORAL (--hue-coral, SYS-09d) — the macro's fixed hue,
                not the biometric spectrum. Fill width reads the ratio to target. */}
            <div
              className="h-full rounded-full bg-coral transition-[width] duration-200 ease-[var(--ease)]"
              style={{ width: `${Math.min(proteinPct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Weight trend */}
      <div className="flex items-center justify-between bg-charcoal-surface2 rounded-control px-3 py-2">
        <span className="text-micro text-ink-muted flex items-center gap-1.5">
          <i className="w-[5px] h-[5px] rounded-full shrink-0 bg-violet" />
          Weight Trend
        </span>
        <span className={`font-technical text-sm font-extrabold ${weightTrendColor}`}>
          {weight_trend_lbs_per_week != null
            ? `${weight_trend_lbs_per_week > 0 ? "+" : ""}${weight_trend_lbs_per_week} lbs/wk`
            : "Not enough data"}
        </span>
      </div>
    </div>
  );
}
