import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO, isValid, subDays } from "date-fns";
import { Module, SegmentedControl } from "@/components/ui/system";
import { Flame, AlertTriangle, Bookmark, ArrowLeftRight, Pencil, Trash2, Plus, BookOpen, UtensilsCrossed, Calculator, ChevronUp, ChevronDown, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eatenOnly, formatEntryServing } from "@/utils/nutritionUtils";
import { MacroInline, MacroResultLine, GHOST_DASHED } from "@/components/nutrition/tracker/shared";
import { ResponsiveContainer, LineChart, XAxis, YAxis, Tooltip, Line } from "recharts";
import MealTemplates from "@/components/nutrition/MealTemplates";
import RecipeBuilder from "@/components/nutrition/RecipeBuilder";
import MealPlanIdeas from "@/components/nutrition/MealPlanIdeas";
import { ReasonLine } from "@/components/ui";
import { targetBasis } from "@/components/nutrition/tracker/targetBasis";

// Extracted from FoodTracker.jsx (no behavior change).
export default function TrackerBody({ activePhase, addFoodMutation, allFoodEntries, calorieTrend, deleteFoodMutation, entriesError, entriesLoading, foodEntries, fuelNutritionView, intakeStats, mealGroups, openActionsId, planFit, plannedCount, profile, quickRelogFood, recentFoods, refetchEntries, selectedDate, setCopyFromDate, setCopySelection, setFuelNutritionViewPersist, setNewFood, setOpenActionsId, setSelectedDate, setShowAddDialog, setShowCopyDayDialog, setShowGoalsModal, setShowIntakeStats, setShowMoreSheet, setShowNewRecipe, setShowSaveTemplateDialog, setShowStatsModal, setSidebarTab, setStatsWindow, setSwapEntry, setTemplateEntries, setTemplateMealType, showIntakeStats, showNewRecipe, sidebarTab, startEditEntry, statsWindow, targets, tdee, togglePlannedMutation, totals }) {
  return (
    <>
      {/* Two-column body */}
      <div className="flex items-start">

        {/* ── Main scrollable content ── */}
        <div className="flex-1 min-w-0">
          {/* This container is NOT the final scroll surface inside Fuel — the
              Week-plan row sits below it and owns the dock/FAB clearance. So this
              block carries only a single ~14px section gutter (pb-3.5); reserving
              the full FAB footprint here would open a >100px dead band before the
              Week-plan row. The final container (Fuel's Week-plan wrapper) carries
              --dock-clearance. */}
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 pb-3.5 space-y-2">

            {/* Recent/go-to foods rail (mf-app-screens.md Fuel pattern #2,
                "Hourly Go-Tos"): the page's most-recently-eaten foods as a
                horizontally-scrolling one-tap rail, positioned above the
                page's search entry point (the header's Search icon) rather
                than buried inside the Add Food dialog's own Recent list —
                reuses quickRelogFood exactly, same mutation/toast/invalidate
                path as the dialog's "+" button. Logs to selectedDate, so it
                works the same whether viewing today or a past day. */}
            {/* While the 90-day history loads, hold the Recent card's height (~122px)
                so it popping in doesn't shove the log and the Templates button down
                mid-tap. */}

            {/* 7-day strip (DESIGN.md/directions "B · Fuel" .wk): a kcal bar per
                day against a dashed goal tick, today highlighted, tap to select —
                reuses the same selectedDate state the date-nav pill above drives. */}
            <div className="grid grid-cols-7 gap-1.5">
              {calorieTrend.map((day) => {
                const isSelected = day.date === selectedDate;
                const isTodayCol = day.date === getTodayString();
                // One shared scale across all 7 days (goal × ~1.2 headroom, or the
                // tallest day if someone blew way past goal) so an over-target day
                // visibly crosses its own dashed tick instead of clipping flat, and
                // the tick itself sits a few px clear of the track's top edge
                // instead of getting clipped by the track's overflow-hidden.
                const scaleMax = Math.max(
                  ...calorieTrend.map((d) => Math.max(d.calories, d.goal || 0)),
                  1
                ) * 1.22;
                const barPct = Math.min(100, (day.calories / scaleMax) * 100);
                const tickPct = day.goal > 0 ? Math.min(100, (day.goal / scaleMax) * 100) : null;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    aria-pressed={isSelected}
                    aria-label={`${format(parseISO(day.date), 'EEEE, MMM d')} · ${Math.round(day.calories)} kcal`}
                    className={`min-h-[44px] flex flex-col items-center gap-1 py-1 rounded-lg transition-colors duration-200 [transition-timing-function:var(--ease)] ${
                      isSelected ? 'glass-inset' : 'hover:bg-charcoal-surface2/60'
                    }`}
                  >
                    <span className={`text-micro font-semibold uppercase ${isSelected || isTodayCol ? 'text-ink' : 'text-ink-muted'}`}>
                      {day.label[0]}
                    </span>
                    {/* Track uses the shared `track` material (same token as the
                        macro bars below) so an empty day reads as a subtle rail,
                        not a heavy filled box. Selection is carried by a visible
                        ring on the track itself — independent of whether that
                        day has any bar fill — so a 0-kcal selected day still
                        reads as selected. */}
                    <div
                      className="relative w-full h-11 rounded-sm bg-track overflow-hidden"
                      style={isSelected ? { boxShadow: 'inset 0 0 0 1px var(--text-secondary)' } : undefined}
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-sm"
                        style={{
                          height: `${barPct}%`,
                          background: isSelected ? 'var(--text-primary)' : 'var(--text-faint)',
                        }}
                      />
                      {tickPct != null && (
                        <span
                          className="absolute inset-x-0 z-10 border-t-2 border-dashed pointer-events-none"
                          style={{
                            bottom: `${tickPct}%`,
                            // On a selected day at/over goal the bright
                            // (--text-primary) bar fill reaches the same
                            // color as a --text-primary tick and swallows
                            // it. Flip the tick to the page background at
                            // that point so it still reads as a notch cut
                            // into the fill, in both themes.
                            borderColor: isSelected && barPct >= tickPct ? 'var(--color-bg)' : 'var(--text-primary)',
                          }}
                        />
                      )}
                    </div>
                    <span className="font-technical text-caption font-semibold tabular-nums text-ink-secondary">
                      {Math.round(day.calories) || 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Intake vs pace (DESIGN.md/directions "B · Fuel" .mod/.cols): kcal
                left leads the module header, then flat 8px eaten/target bars for
                Kcal/Protein/Carbs/Fat. Macro hues live on the LABEL only —
                numbers stay neutral ink, matching Today.jsx's "Nutrition ·
                remaining" module. No cumulative pace curve: food_entries'
                eaten_at is defaulted per logging-mode/meal-slot (getEatenAt),
                not a real intraday timeline, so a "now" line would plot
                partly-invented times — skipped rather than faked. */}
            {(() => {
              const isToday = selectedDate === getTodayString();
              const calsConsumed = totals.calories;
              const calsGoal = targets.calories;
              const showRemaining = isToday && fuelNutritionView === "remaining";
              const kcalLeft = calsGoal > 0 ? Math.round(calsGoal - calsConsumed) : null;
              const kcalPct = calsGoal > 0 ? Math.min(100, (calsConsumed / calsGoal) * 100) : 0;
              const headNum = showRemaining && kcalLeft != null ? Math.abs(kcalLeft) : Math.round(calsConsumed);
              const headCaption = showRemaining && kcalLeft != null
                ? `kcal ${kcalLeft < 0 ? 'over' : 'left'} · goal ${Math.round(calsGoal).toLocaleString()}`
                : `kcal eaten${calsGoal > 0 ? ` · goal ${Math.round(calsGoal).toLocaleString()}` : ''}`;
              const basis = targetBasis(targets);
              const macroCols = [
                { label: 'Protein', consumed: totals.protein, goal: targets.protein, hue: 'var(--hue-coral)' },
                { label: 'Carbs', consumed: totals.carbs, goal: targets.carbs, hue: 'var(--hue-blue)' },
                { label: 'Fat', consumed: totals.fats, goal: targets.fats, hue: 'var(--hue-yellow)' },
              ];
              return (
                <Module bleed className="rise-in" data-tutorial="nutrition-rings">
                  <div className="flex items-end justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="section-label mb-1.5">Kcal</div>
                      {/* Consumed view reads "eaten/goal" (goal quieter), the
                          same N/goal shape as the macro captions and Today. */}
                      <div className="font-technical text-display leading-none font-bold tabular-nums text-ink">
                        {headNum.toLocaleString()}
                        {!showRemaining && calsGoal > 0 && (
                          <span className="text-body font-semibold text-ink-muted">/{Math.round(calsGoal).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="text-caption text-ink-muted mt-1.5 truncate">{headCaption}</div>
                      {basis && <ReasonLine className="mt-1" detail={basis.detail}>{basis.line}</ReasonLine>}
                    </div>
                    {isToday && (
                      <SegmentedControl
                        options={[{ value: "remaining", label: "Remaining" }, { value: "consumed", label: "Consumed" }]}
                        value={fuelNutritionView}
                        onChange={setFuelNutritionViewPersist}
                        size="sm"
                        className="inline-flex shrink-0 [&_button]:min-h-[44px] [&_button]:px-3"
                      />
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-track overflow-hidden mb-4">
                    <div className="h-full rounded-full opacity-90" style={{ width: `${kcalPct}%`, background: 'var(--text-primary)' }} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {macroCols.map((c) => {
                      const hasGoal = c.goal != null && c.goal > 0;
                      const remainingRaw = hasGoal ? Math.round(c.goal - c.consumed) : null;
                      const over = hasGoal && remainingRaw < 0;
                      const pct = hasGoal ? Math.min(100, (c.consumed / c.goal) * 100) : 0;
                      const caption = !hasGoal
                        ? "--"
                        : showRemaining
                          ? (over ? `${Math.abs(remainingRaw).toLocaleString()}g over` : `${remainingRaw.toLocaleString()}g left`)
                          : `${Math.round(c.consumed).toLocaleString()}/${Math.round(c.goal).toLocaleString()}g`;
                      return (
                        <div key={c.label} className="min-w-0">
                          <div className="flex items-baseline justify-between gap-1 mb-1.5">
                            <span className="text-caption font-semibold" style={{ color: c.hue }}>{c.label}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-track overflow-hidden">
                            <div className="h-full rounded-full opacity-90" style={{ width: `${pct}%`, background: c.hue }} />
                          </div>
                          <div className="font-technical text-caption text-secondary tabular-nums mt-1.5 whitespace-nowrap">
                            {caption}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2.5 border-t hairline font-technical text-caption text-ink-muted tabular-nums">
                    <span>
                      Fiber {Math.round(totals.fiber || 0)}/{targets.fiber}g{!totals.fiberKnown && ' + unknown'}
                    </span>
                    {totals.cost > 0 && <span>${totals.cost.toFixed(2)}</span>}
                    {isToday && calsConsumed === 0 && plannedCount > 0 && <span>{Math.round(planFit.plannedCal)} kcal planned</span>}
                  </div>
                </Module>
              );
            })()}


            {/* Carb timing: today's carb target split around session(s) — same
                data WeeklyPlanCard surfaces, mirrored here since this is the
                page people actually check while eating. Empty on a rest day. */}
            {(targets.carbWindows || []).length > 0 && (
              <div className="glass px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Flame className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                  <span className="section-label">Carb Timing</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {targets.carbWindows.map((w) => (
                    <div key={w.label} className="text-caption text-ink-secondary">
                      <span className="font-technical text-ink">{w.grams}g</span> {w.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick-action grid removed: Barcode lives in the Add dialog (Scan)
                and Recipes in the More sheet, so search owns the one Add path and
                the top of the page goes straight to the ring → log. */}

            {/* Planned (meal-plan) items waiting to be checked off — with live
                budget-fit status. Portions self-adjust to the day's current target,
                so this normally reads "fits"; warn means the budget is too far gone
                for portions to shrink into. */}
            {/* Planned-budget readout is data + chrome, NOT a biometric — neutral
                ink hierarchy with kcal in its own GOLD hue (SYS-09a/d). The leaf/
                warn spectrum is reserved for biometric readouts. */}
            {plannedCount > 0 && (
              <div className="flex items-center gap-2.5 glass px-4 py-2.5 text-caption">
                <span className="w-5 h-5 rounded-full border-[1.5px] border-track shrink-0" />
                <span className="text-ink-secondary flex-1 min-w-0">
                  <span className="font-semibold text-ink">
                    {plannedCount} planned · <span className="text-ink font-technical tabular-nums">{planFit.plannedCal.toLocaleString()} kcal</span>
                  </span>{' '}
                  {planFit.rebalancing
                    ? 'adjusting portions to today’s target…'
                    : planFit.proteinHeld
                      ? `runs ${Math.max(0, planFit.plannedCal - planFit.remaining).toLocaleString()} kcal over, portions held at the cut protein floor instead of shrinking.`
                      : planFit.fits
                        ? 'fits remaining budget'
                        : `exceeds what’s left by ${Math.max(0, planFit.plannedCal - planFit.remaining).toLocaleString()} kcal, edit or remove items.`}
                </span>
              </div>
            )}


            {/* Meal log (DESIGN.md/directions "B · Fuel" .mrow): one flat module
                — a shared "kcal P C F" caption row, then each meal as a header
                row (name + time + totals) followed by its food rows (name,
                muted quantity, tabular numbers) and a trailing "Add to <meal>"
                row. Every existing per-entry action survives verbatim (edit,
                delete-with-undo, swap, mark-eaten, save-meal-as-template) —
                only the visual grid changed, not the handlers/aria-labels. */}
            {entriesError ? (
              <div className="glass px-4 py-6 flex flex-col items-center gap-2.5 text-center">
                {/* A failed fetch is chrome, not a biometric — the icon stays neutral
                    ink (food-tracker-4); warn-yellow is reserved for the spectrum. */}
                <AlertTriangle className="w-4 h-4 text-ink-muted" />
                <p className="text-caption text-ink-muted">Couldn't load this day's food log.</p>
                <Button variant="dim" size="sm" onClick={() => refetchEntries()}>Retry</Button>
              </div>
            ) : entriesLoading ? (
              /* Loading skeletons: bars use the system `bg-track` material with
                 the tokened `.pulse-loop` shimmer (single easing, --loop-dur
                 cadence), a restrained, hue-free placeholder breathe. */
              /* min-h matches the loaded empty-day log (~415px) so the swap to
                 real rows doesn't shove everything below (incl. the Templates
                 button) down ~95px mid-tap, which made a tap land on empty space. */
              <div className="surface px-4 sm:px-5 py-2 -mx-4 sm:-mx-6 space-y-4 min-h-[415px]">
                {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((label) => (
                  <div key={label} className="pulse-loop space-y-2 py-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full shrink-0 bg-track" />
                      <h3 className="section-label tracking-[0.12em]">{label}</h3>
                    </div>
                    <div className="h-3 w-full rounded bg-track" />
                    <div className="h-3 w-2/3 rounded bg-track" />
                  </div>
                ))}
              </div>
            ) : (
            <div className="surface px-4 sm:px-5 py-1 -mx-4 sm:-mx-6 rise-in-2">
              {[
                { mealType: 'breakfast', label: 'Breakfast' },
                { mealType: 'lunch',     label: 'Lunch' },
                { mealType: 'dinner',    label: 'Dinner' },
                { mealType: 'snack',     label: 'Snack' },
              ].map(({ mealType, label }, i) => {
                const entries = mealGroups[mealType];
                // Header totals are what was eaten, matching the ring; planned
                // rows still list below (striped) and are counted separately.
                const eatenInMeal = eatenOnly(entries);
                const plannedInMeal = entries.length - eatenInMeal.length;
                const mealCals = eatenInMeal.reduce((sum, e) => sum + (e.calories || 0), 0);
                const mealP = eatenInMeal.reduce((sum, e) => sum + (e.protein_grams || 0), 0);
                const mealC = eatenInMeal.reduce((sum, e) => sum + (e.carbs_grams || 0), 0);
                const mealF = eatenInMeal.reduce((sum, e) => sum + (e.fats_grams || 0), 0);
                const hasEntries = entries.length > 0;
                // Earliest VALID eaten_at across the meal's entries, for the
                // header time badge — date-fns `format` throws on an invalid
                // Date, so a bad/missing timestamp is skipped, not fatal.
                const mealTime = eatenInMeal.reduce((earliest, e) => {
                  if (!e.eaten_at) return earliest;
                  const d = new Date(e.eaten_at);
                  if (!isValid(d)) return earliest;
                  return !earliest || d < earliest ? d : earliest;
                }, null);
                return (
                  <section key={mealType} className={i > 0 ? 'mt-1 pt-1 border-t hairline' : ''}>
                    <div className="flex items-center gap-2.5 py-3 border-b hairline">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${hasEntries ? 'bg-ink-secondary' : 'bg-track'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-emph font-semibold text-ink truncate">{label}</span>
                          {plannedInMeal > 0 && (
                            <span className="font-technical text-caption font-semibold text-ink-muted shrink-0">+{plannedInMeal} planned</span>
                          )}
                          {mealTime && (
                            <span className="font-technical text-caption font-semibold text-ink-muted shrink-0">{format(mealTime, 'h:mm a')}</span>
                          )}
                        </div>
                        {hasEntries && <MacroInline p={mealP} c={mealC} f={mealF} />}
                      </div>
                      {hasEntries && (
                        <span className="font-technical text-emph font-bold text-ink tabular-nums shrink-0">
                          {Math.round(mealCals)}<span className="text-caption font-semibold text-ink-muted ml-1">kcal</span>
                        </span>
                      )}
                      {hasEntries && (
                        <button
                          onClick={() => { setTemplateEntries(entries); setTemplateMealType(mealType); setShowSaveTemplateDialog(true); }}
                          className="shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 text-ink-faint hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]"
                          aria-label="Save meal as template"
                          title="Save as template"
                        >
                          <Bookmark className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Food rows */}
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        /* One row system: hairline-separated tiles. The faint
                           glass-inset fill is RESERVED for planned (not-yet-
                           eaten) rows so it reads as a distinct state, not a
                           decorative zebra. */
                        className={`grid grid-cols-[1fr_auto] gap-x-3 items-start py-3 border-b hairline tile-interactive group ${entry.planned ? 'row-stripe' : ''}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {entry.planned && (
                            <button
                              onClick={() => togglePlannedMutation.mutate(entry.id)}
                              title="Mark as eaten"
                              aria-label="Mark as eaten"
                              className="shrink-0 p-3 -m-2 flex items-center justify-center min-w-[44px] min-h-[44px] active:scale-95 transition-transform duration-200 [transition-timing-function:var(--ease)]"
                            >
                              {/* Checking off is an ACTION, so the affordance wears
                                  the teal action color on interaction — not leaf
                                  green (a done-state data hue). The resting ring is
                                  neutral track; teal arrives only on hover/active. */}
                              <span className="w-5 h-5 rounded-full border-[1.5px] border-track flex items-center justify-center hover:bg-brand/[0.18] hover:border-brand/60 transition-colors duration-200 [transition-timing-function:var(--ease)]" />
                            </button>
                          )}
                          {/* Tapping the name block opens the action strip on phones
                              (the strip is sm:hidden, so this is a no-op on desktop,
                              where the hover buttons stay). */}
                          <div
                            className="min-w-0 flex-1 cursor-pointer sm:cursor-auto"
                            onClick={() => setOpenActionsId((id) => (id === entry.id ? null : entry.id))}
                          >
                            {/* The name gets the whole line, wrapping to two lines
                                on phones. The Pre/Post-WO tag moved down beside the
                                quantity so it can't crowd the name out. */}
                            <span className={`block text-emph font-semibold tracking-tight leading-snug line-clamp-2 sm:line-clamp-1 ${entry.planned ? 'text-ink-muted' : 'text-ink'}`}>{entry.food_name}</span>
                            {/* Quantity + macros under the name; wraps instead of clipping. */}
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption font-technical mt-1 font-semibold text-ink-muted min-w-0">
                              {entry.tag && (
                                <span className="section-label shrink-0 glass-inset px-1.5 py-0.5">
                                  {entry.tag === 'pre' ? 'Pre-WO' : 'Post-WO'}
                                </span>
                              )}
                              {(formatEntryServing(entry) || entry.planned) && (
                                <span>{formatEntryServing(entry)}{entry.planned ? `${formatEntryServing(entry) ? ' · ' : ''}planned` : ''}</span>
                              )}
                              <MacroInline p={entry.protein_grams ?? 0} c={entry.carbs_grams ?? 0} f={entry.fats_grams ?? 0} fields />
                            </span>
                          </div>
                          {/* Edit/delete/swap — same handlers and aria-labels as
                              before, just compacted to sit beside the numeric
                              columns instead of the FAB-clearance gutter. Every
                              row keeps a real 44px tap target on mobile. */}
                          <div className="shrink-0 hidden sm:flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 [transition-timing-function:var(--ease)]">
                            {entry.planned && (
                              <button
                                onClick={() => setSwapEntry(entry)}
                                aria-label={`Swap out ${entry.food_name}`}
                                title="Swap this for another food"
                                className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1 text-ink-secondary hover:text-brand active:scale-90 transition-[color,transform] duration-200 [transition-timing-function:var(--ease)]"
                              >
                                <ArrowLeftRight className="w-[15px] h-[15px] sm:w-3.5 sm:h-3.5" />
                              </button>
                            )}
                            <button onClick={() => startEditEntry(entry)} aria-label="Edit entry" className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1 text-ink-secondary hover:text-brand active:scale-90 transition-[color,transform] duration-200 [transition-timing-function:var(--ease)]">
                              <Pencil className="w-[15px] h-[15px] sm:w-3.5 sm:h-3.5" />
                            </button>
                            <button onClick={() => deleteFoodMutation.mutate(entry)} aria-label="Delete entry" className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1 text-ink-secondary hover:text-bad active:scale-90 transition-[color,transform] duration-200 [transition-timing-function:var(--ease)]">
                              <Trash2 className="w-[15px] h-[15px] sm:w-3.5 sm:h-3.5" />
                            </button>
                          </div>
                        </div>
                        <span data-field="kcal" className={`font-technical text-emph font-bold text-ink text-right tabular-nums pt-0.5 ${entry.planned ? 'opacity-45' : ''}`}>{entry.calories ?? 0}</span>
                        {/* Phone action strip: same handlers as the desktop hover
                            buttons, full-width 44px targets, one row under the food. */}
                        {openActionsId === entry.id && (
                          <div className="col-span-2 flex gap-2 pt-2 pb-1 sm:hidden">
                            {entry.planned && (
                              <button
                                onClick={() => { setOpenActionsId(null); setSwapEntry(entry); }}
                                aria-label={`Swap out ${entry.food_name}`}
                                className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg glass-inset text-body font-semibold text-ink-secondary active:scale-95 transition-transform duration-200 [transition-timing-function:var(--ease)]"
                              >
                                <ArrowLeftRight className="w-4 h-4" /> Swap
                              </button>
                            )}
                            <button
                              onClick={() => { setOpenActionsId(null); startEditEntry(entry); }}
                              aria-label="Edit entry"
                              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg glass-inset text-body font-semibold text-ink-secondary active:scale-95 transition-transform duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <Pencil className="w-4 h-4" /> Edit
                            </button>
                            <button
                              onClick={() => { setOpenActionsId(null); deleteFoodMutation.mutate(entry); }}
                              aria-label="Delete entry"
                              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg glass-inset text-body font-semibold text-bad active:scale-95 transition-transform duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add to <meal> — every meal, whether it has entries yet or not */}
                    <button
                      type="button"
                      className="w-full min-h-[44px] py-2 flex items-center gap-2 text-ink-muted hover:text-brand hover:bg-charcoal-surface2/60 active:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)] group"
                      onClick={() => {
                        setNewFood(prev => ({ ...prev, meal_type: mealType }));
                        setShowAddDialog(true);
                      }}
                      aria-label={`Add item to ${mealType}`}
                    >
                      <Plus className="w-3.5 h-3.5 text-ink-faint group-hover:text-brand shrink-0" />
                      <span className="text-body font-semibold text-ink-muted group-hover:text-brand">Add to {label.toLowerCase()}</span>
                    </button>
                  </section>
                );
              })}
            </div>
            )}

            {/* Templates / recipes / ideas: always visible, one tap each (phone). */}
            <div className="lg:hidden grid grid-cols-3 gap-2">
              {[
                { id: 'templates', label: 'Templates', Icon: Bookmark },
                { id: 'recipes', label: 'Recipes', Icon: BookOpen },
                { id: 'ideas', label: 'Meal ideas', Icon: UtensilsCrossed },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setSidebarTab(id); setShowMoreSheet(true); }}
                  // All three open the one "Templates, recipes & ideas" sheet on
                  // their tab; Recipes (the old single entry's landing tab)
                  // keeps that sheet's name after its own word.
                  aria-label={id === 'recipes' ? 'Recipes: Templates, recipes & ideas' : undefined}
                  className="glass glass-interactive min-h-[68px] flex flex-col items-center justify-center gap-1.5 text-body font-semibold text-ink-secondary hover:text-ink active:scale-[0.98] transition-[color,transform] duration-200 [transition-timing-function:var(--ease)]"
                >
                  <Icon className="w-4 h-4 text-brand" />
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="dim"
                size="sm"
                className="min-h-[44px] w-full"
                onClick={() => {
                  // Default to the most recent logged day before this one, so
                  // the dialog opens on something rather than an empty date.
                  const prior = eatenOnly(allFoodEntries)
                    .map((e) => e.date)
                    .filter((d) => d < selectedDate)
                    .sort()
                    .pop();
                  setCopyFromDate(prior || format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"));
                  setCopySelection({});
                  setShowCopyDayDialog(true);
                }}
              >
                <Bookmark className="w-3.5 h-3.5 mr-1.5" /> Copy a day
              </Button>
              <Button variant="dim" size="sm" className="min-h-[44px] w-full" onClick={() => setShowIntakeStats((v) => !v)}>
                <Calculator className="w-3.5 h-3.5 mr-1.5" /> Intake stats
                {showIntakeStats ? <ChevronUp className="w-3.5 h-3.5 ml-1.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-1.5" />}
              </Button>
              {foodEntries.length > 0 && (
                <Button
                  variant="dim"
                  size="sm"
                  className="min-h-[44px] w-full"
                  onClick={() => { setTemplateEntries(foodEntries); setTemplateMealType(null); setShowSaveTemplateDialog(true); }}
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Save day as template
                </Button>
              )}
              <Button variant="dim" size="sm" className="min-h-[44px] w-full" onClick={() => setShowGoalsModal(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit goals
              </Button>
            </div>

            {showIntakeStats && (
              <div className="glass px-4 sm:px-5 py-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="section-label">Intake stats</span>
                  <div className="flex items-center gap-1">
                    {[7, 14, 28].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setStatsWindow(w)}
                        className={`font-technical text-caption font-bold px-2 py-1 ${
                          statsWindow === w ? "text-ink glass-inset" : "text-ink-faint hover:text-ink-secondary"
                        }`}
                      >
                        {w}d
                      </button>
                    ))}
                  </div>
                </div>
                {!intakeStats ? (
                  <p className="text-caption text-ink-muted">Nothing logged in the last {statsWindow} days.</p>
                ) : (
                  <>
                    {/* Averaged over days actually logged, not over the calendar
                        window — dividing by 28 when 9 days were logged reports a
                        deficit that never happened. */}
                    <p className="text-caption text-ink-muted mb-2">
                      Average of {intakeStats.daysLogged} logged {intakeStats.daysLogged === 1 ? "day" : "days"} out of the last {intakeStats.windowDays}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Calories', value: intakeStats.avgCalories, unit: '', hue: 'text-ink' },
                        { label: 'Protein', value: intakeStats.avgProtein, unit: 'g', hue: 'text-coral' },
                        { label: 'Carbs', value: intakeStats.avgCarbs, unit: 'g', hue: 'text-carb' },
                        { label: 'Fats', value: intakeStats.avgFats, unit: 'g', hue: 'text-fat' },
                      ].map(({ label, value, unit, hue }) => (
                        <div key={label} className="glass-inset px-2 py-2 text-center">
                          <div className="text-caption text-ink-muted font-medium">{label}</div>
                          <div className={`font-technical font-semibold text-body ${hue}`}>{value}{unit}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-secondary">
                      {intakeStats.split && (
                        <span>
                          Split{' '}
                          <span className="font-technical text-ink">
                            {intakeStats.split.protein}/{intakeStats.split.carbs}/{intakeStats.split.fats}
                          </span>{' '}
                          P/C/F by calories
                        </span>
                      )}
                      <span>
                        Fiber{' '}
                        {intakeStats.avgFiber == null ? (
                          <span className="text-ink-faint">not fully logged on any day</span>
                        ) : (
                          <>
                            <span className="font-technical text-ink">{intakeStats.avgFiber}g</span>
                            <span className="text-ink-faint"> over {intakeStats.fiberCompleteDays} complete {intakeStats.fiberCompleteDays === 1 ? "day" : "days"}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="pb-2" />

            {recentFoods.length > 0 && (
              <Module label="Recent">
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-5 sm:px-5">
                  {recentFoods.map((entry, i) => (
                    <button
                      key={`${entry.food_name}-${i}`}
                      type="button"
                      onClick={() => quickRelogFood(entry)}
                      disabled={addFoodMutation.isPending}
                      aria-label={`Log ${entry.food_name} again`}
                      className="shrink-0 w-[136px] text-left glass-inset px-3 py-2.5 min-h-[44px] active:scale-[0.98] transition-transform duration-200 [transition-timing-function:var(--ease)] disabled:opacity-50"
                    >
                      <div className="text-caption font-semibold text-ink truncate">{entry.food_name}</div>
                      <MacroResultLine cal={entry.calories} p={entry.protein_grams} c={entry.carbs_grams} f={entry.fats_grams} />
                    </button>
                  ))}
                </div>
              </Module>
            )}

          </div>
        </div>

        {/* ── Desktop sidebar ── */}
        <aside
          className="hidden lg:flex flex-col w-[500px] shrink-0 border-l border-charcoal-border bg-charcoal-surface/20 sticky z-10"
          style={{ top: 'var(--layout-header-height, 0px)', height: 'calc(100vh - var(--layout-header-height, 0px))' }}
        >
          {/* ── Pinned top: Trend + Goals + check-in ── */}
          <div className="shrink-0 p-4 space-y-3 border-b border-charcoal-border">

            {/* 7-day trend — always visible at top */}
            <div className="glass px-3 pt-3 pb-1">
              <div className="section-label mb-1">7-Day Trend</div>
              {calorieTrend.some(d => d.calories > 0) ? (
                <div className="w-full">
                  <ResponsiveContainer width="100%" height={112}>
                    <LineChart data={calorieTrend} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-faint)" }} axisLine={false} tickLine={false} />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="glass-elevated rounded-lg px-2.5 py-1.5 text-caption text-ink-muted space-y-0.5">
                              <p className="font-semibold">{d.label}</p>
                              <p className="text-ink font-technical">{d.calories} kcal eaten</p>
                              {d.goal > 0 && <p className="text-ink-muted">Goal: {d.goal} kcal</p>}
                            </div>
                          );
                        }}
                      />
                      {/* Per-day goal as a dashed line */}
                      <Line type="monotone" dataKey="goal" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                      <Line type="monotone" dataKey="calories" stroke="var(--hue-gold)" strokeWidth={2} dot={{ fill: "var(--hue-gold)", r: 2.5 }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-16 flex items-center justify-center text-caption text-ink-muted">
                  Log food for a few days to see your trend
                </div>
              )}
            </div>

            {/* Goals card with phase info */}
            <div className="glass p-4 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="section-label">Nutrition Goals</span>
                  {activePhase && (
                    <span className="pill-value text-ink-secondary">
                      {activePhase.phase_type === 'cut' ? 'Cut' : activePhase.phase_type === 'bulk' ? 'Bulk' : activePhase.phase_type === 'reverse' ? 'Reverse' : 'Maintain'}
                      {activePhase.weekly_rate != null && (
                        activePhase.phase_type === 'reverse'
                          ? ` · +${activePhase.weekly_rate} cal/wk`
                          : ` · ${activePhase.weekly_rate > 0 ? '+' : ''}${activePhase.weekly_rate} ${profile?.weight_unit || 'lbs'}/wk`
                      )}
                    </span>
                  )}
                </div>
                <button onClick={() => setShowGoalsModal(true)} className="text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  { label: 'Calories', value: targets.calories, unit: 'kcal' },
                  { label: 'Protein',  value: targets.protein,  unit: 'g' },
                  { label: 'Carbs',    value: targets.carbs,    unit: 'g' },
                  { label: 'Fats',     value: targets.fats,     unit: 'g' },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-caption text-ink-secondary uppercase font-semibold">{label}</span>
                    <span className="font-technical text-caption font-bold text-ink">{value}<span className="opacity-40 font-normal ml-0.5 text-caption">{unit}</span></span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => !tdee.tdee ? setShowStatsModal(true) : setShowGoalsModal(true)}
                className={`${GHOST_DASHED} mt-3 w-full py-1.5 rounded-lg hover:text-brand hover:border-brand/40`}
              >
                {!tdee.tdee ? 'Set up TDEE' : 'Edit Goals'}
              </button>
            </div>

          </div>

          {/* ── Tab bar: Templates | Recipes | Ideas ── */}
          <div className="shrink-0 flex border-b border-charcoal-border bg-charcoal-surface/20">
            {[
              { id: 'templates', label: 'Templates' },
              { id: 'recipes',   label: 'Recipes' },
              { id: 'ideas',     label: 'Ideas' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                className={`flex-1 py-2.5 text-caption font-semibold uppercase tracking-wider border-b-2 transition-colors duration-200 [transition-timing-function:var(--ease)] ${
                  sidebarTab === tab.id
                    ? 'border-brand/30 text-brand'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Scrollable tab content ── */}
          <div className="flex-1 overflow-y-auto p-4">
            {sidebarTab === 'templates' && <MealTemplates compact />}

            {sidebarTab === 'recipes' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowNewRecipe(true)}
                    className="flex items-center gap-1 text-caption font-semibold uppercase tracking-widest text-brand hover:text-[var(--brand-bright)] transition-colors duration-200 [transition-timing-function:var(--ease)]"
                  >
                    <Plus className="w-3 h-3" />New Recipe
                  </button>
                </div>
                <RecipeBuilder compact showCreateDialog={showNewRecipe} onCreateDialogChange={setShowNewRecipe} />
              </div>
            )}

            {sidebarTab === 'ideas' && (
              <MealPlanIdeas
                calorieGoal={targets.calories}
                proteinGoal={targets.protein}
                carbsGoal={targets.carbs}
                fatsGoal={targets.fats}
                aggressiveCut={targets.aggressiveCut}
              />
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
