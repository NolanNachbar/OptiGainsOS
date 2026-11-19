import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateFood } from "@/lib/queryKeys";
import { scaleRecipeToServings, recipeToFoodEntry } from "@/utils/nutritionUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Plus, Loader2, Minus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";


export function LogRecipeDialog({ open, onOpenChange, recipe, userId }) {
  const queryClient = useQueryClient();
  const [mealType, setMealType] = useState("lunch");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [servingCount, setServingCount] = useState(1);

  const scaled = scaleRecipeToServings(recipe, parseFloat(servingCount) || 1);

  const logMutation = useMutation({
    mutationFn: (entry) => db.entities.FoodEntry.create(entry),
    onSuccess: () => {
      invalidateFood(queryClient);
      toast.success(`${recipe.name} logged`);
      onOpenChange(false);
    },
    onError: () => toast.error("Recipe not logged. Check your connection and try again."),
  });

  const handleLog = () => {
    const entry = recipeToFoodEntry(recipe, parseFloat(servingCount) || 1, mealType, date, userId);
    logMutation.mutate(entry);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full max-h-[88dvh] sm:max-h-[75vh] sm:my-8 flex flex-col overflow-hidden p-0 min-h-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-3 border-b pr-12">
          <DialogTitle>Log Recipe: {recipe.name}</DialogTitle>
        </div>

        {/* Scroll region */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Meal Type</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Servings</Label>
            <div className="flex items-center gap-3 mt-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setServingCount(Math.max(0.5, (parseFloat(servingCount) || 1) - 0.5))}
                className="h-11 w-11"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number" inputMode="decimal"
                value={servingCount}
                onChange={(e) => setServingCount(e.target.value)}
                min="0.5"
                step="0.5"
                className="w-20 h-11 text-center font-technical tabular-nums"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setServingCount((parseFloat(servingCount) || 1) + 0.5)}
                className="h-11 w-11"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="glass-inset text-center p-3">
              <div className="text-title font-bold text-ink font-technical tabular-nums">
                {scaled.calories}
              </div>
              <div className="text-caption text-ink-muted">Calories</div>
            </div>
            <div className="glass-inset text-center p-3">
              <div className="text-title font-bold text-coral font-technical tabular-nums">
                {scaled.protein_grams}g
              </div>
              <div className="text-caption text-ink-muted">Protein</div>
            </div>
            <div className="glass-inset text-center p-3">
              <div className="text-title font-bold text-carb font-technical tabular-nums">
                {scaled.carbs_grams}g
              </div>
              <div className="text-caption text-ink-muted">Carbs</div>
            </div>
            <div className="glass-inset text-center p-3">
              <div className="text-title font-bold text-fat font-technical tabular-nums">
                {scaled.fats_grams}g
              </div>
              <div className="text-caption text-ink-muted">Fats</div>
            </div>
          </div>
        </div>

        {/* Pinned footer — keeps the Log CTA in the thumb zone without scrolling */}
        <div
          className="px-6 pt-4 pb-6 border-t bg-charcoal-surface/50 flex-shrink-0"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <Button
            variant="volt"
            size="lg"
            onClick={handleLog}
            disabled={logMutation.isPending}
            className="w-full"
          >
            {logMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 spin-loop" />
                Logging...
              </>
            ) : (
              "Log to Food Tracker"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
