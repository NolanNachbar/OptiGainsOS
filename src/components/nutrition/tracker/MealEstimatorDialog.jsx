import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Camera, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoggingModeToggle } from "@/components/nutrition/tracker/shared";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// Extracted from FoodTracker.jsx (no behavior change).
export default function MealEstimatorDialog({ estMealItems, estimateMeal, isEstimatingMeal, isLoggingMeal, logMealItems, loggingMode, mealMealType, mealPhoto, mealPhotoInputRef, mealText, pickMealPhoto, removeEstMealItem, resetMealEstimator, setEstMealItems, setLoggingMode, setMealMealType, setMealPhoto, setMealText, setShowMealEstimator, showMealEstimator }) {
  return (
    <>
      {/* ─── Quick-meal estimator (text or photo → item list → batch log) ─── */}
      <Dialog open={showMealEstimator} onOpenChange={(open) => { setShowMealEstimator(open); if (!open) resetMealEstimator(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log a whole meal</DialogTitle>
            <DialogDescription>
              Describe what you ate or add a photo. It splits into items you adjust before logging.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={mealPhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={pickMealPhoto}
          />

          {!estMealItems ? (
            <div className="space-y-3">
              <textarea
                value={mealText}
                onChange={(e) => setMealText(e.target.value)}
                rows={3}
                disabled={isEstimatingMeal}
                placeholder="e.g. cheeseburger, large fries, and a regular coke"
                className="w-full glass-inset rounded-lg px-3 py-2 text-body text-ink placeholder:text-faint resize-none focus-visible:ring-1 focus-visible:ring-brand"
              />
              {mealPhoto ? (
                <div className="relative">
                  <img src={mealPhoto.previewUrl} alt="Meal to estimate" className="w-full rounded-lg object-contain max-h-56 bg-black/40" />
                  <button
                    type="button"
                    onClick={() => setMealPhoto((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; })}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="dim" size="lg" className="w-full" onClick={() => mealPhotoInputRef.current?.click()} disabled={isEstimatingMeal}>
                  <Camera className="w-4 h-4" /> Add a photo
                </Button>
              )}
              <Button
                type="button"
                variant="volt"
                size="lg"
                className="w-full"
                onClick={estimateMeal}
                disabled={isEstimatingMeal || (!mealText.trim() && !mealPhoto)}
              >
                {isEstimatingMeal ? <><Loader2 className="w-4 h-4 spin-loop" /> Estimating…</> : <><Sparkles className="w-4 h-4" /> Estimate</>}
              </Button>
              <p className="text-caption text-ink-muted">
                Rough estimate, less accurate than weighing. Review the items before logging.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <LoggingModeToggle value={loggingMode} onChange={setLoggingMode} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label>Add to</Label>
                <Select value={mealMealType} onValueChange={setMealMealType}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">Breakfast</SelectItem>
                    <SelectItem value="lunch">Lunch</SelectItem>
                    <SelectItem value="dinner">Dinner</SelectItem>
                    <SelectItem value="snack">Snack</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {estMealItems.map((it, i) => (
                  <div key={i} className="glass-inset rounded-lg px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-body font-semibold text-ink truncate">{it.food_name}</div>
                      <div className="font-technical text-caption text-ink-muted">
                        {it.serving_description} · {it.calories} kcal · P{it.protein} C{it.carbs} F{it.fats}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEstMealItem(i)}
                      className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-ink-muted hover:text-bad"
                      aria-label={`Remove ${it.food_name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {(() => {
                const t = estMealItems.reduce(
                  (a, i) => ({ cal: a.cal + i.calories, p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fats }),
                  { cal: 0, p: 0, c: 0, f: 0 },
                );
                return (
                  <div className="flex items-center justify-between text-body font-semibold text-ink border-t border-charcoal-border pt-2">
                    <span>Total</span>
                    <span className="font-technical">
                      {Math.round(t.cal)} kcal · P{Math.round(t.p)} C{Math.round(t.c)} F{Math.round(t.f)}
                    </span>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                <Button type="button" variant="dim" size="lg" className="flex-1" onClick={() => setEstMealItems(null)} disabled={isLoggingMeal}>
                  Back
                </Button>
                <Button type="button" variant="volt" size="lg" className="flex-1" onClick={logMealItems} disabled={isLoggingMeal || !estMealItems.length}>
                  {isLoggingMeal ? <Loader2 className="w-4 h-4 spin-loop" /> : `Log ${estMealItems.length} item${estMealItems.length > 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
