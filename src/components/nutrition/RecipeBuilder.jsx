import { useState, useEffect, useRef } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { searchFoods } from "@/api/usda";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateRecipes, invalidateFood, invalidateCustomFoods } from "@/lib/queryKeys";
import {
  calculateRecipeTotals,
  scaleRecipeToServings,
  recipeToFoodEntry,
  rescaleIngredient,
  stripBaseFields,
  ingredientFromUSDA,
} from "@/utils/nutritionUtils";
import { useAllFoodEntries, useCustomFoods } from "@/hooks/useUserQueries";
import { getRecentFoods } from "@/utils/nutritionUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  BookOpen,
  Plus,
  Trash2,
  Search,
  Loader2,
  Pencil,
  UtensilsCrossed,
  Minus,
  X,
  ArrowLeft,
  ArrowRight,
  Clock,
  PenLine,
  Star,
  Share2,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { toast } from "sonner";

export default function RecipeBuilder({ showCreateDialog: externalShow, onCreateDialogChange, hideHeader = false, compact = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [internalShow, setInternalShow] = useState(false);
  const showCreateDialog = externalShow || internalShow;
  const setShowCreateDialog = (v) => {
    setInternalShow(v);
    onCreateDialogChange?.(v);
    if (v) setEditingRecipe(null);
  };
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [loggingRecipe, setLoggingRecipe] = useState(null);
  const [sharingRecipe, setSharingRecipe] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: queryKeys.recipes(user?.id),
    queryFn: () => db.entities.Recipe.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: (id) => db.entities.Recipe.delete(id),
    onSuccess: () => {
      invalidateRecipes(queryClient);
      toast.success("Recipe deleted");
    },
    onError: () => toast.error("Failed to delete recipe"),
  });

  const handleEdit = (recipe) => {
    setEditingRecipe(recipe);
    setShowCreateDialog(true);
  };

  const handleLog = (recipe) => {
    setLoggingRecipe(recipe);
    setShowLogDialog(true);
  };

  const handleDelete = (recipe) => {
    setDeleteTarget({ id: recipe.id, name: recipe.name });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {recipes.length === 0 ? (
          <div className="text-center py-6 text-ink-muted text-sm">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-ink font-semibold">No recipes yet</p>
            <p className="text-xs mt-1">Use the + button to create your first recipe</p>
          </div>
        ) : recipes.map((recipe) => {
          const perServing = scaleRecipeToServings(recipe, 1);
          return (
            <div key={recipe.id} className="tile p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-ink truncate block">{recipe.name}</span>
                  <span className="text-xs text-ink-muted capitalize">
                    {recipe.ingredients?.length || 0} ingredients · {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(recipe)}
                    aria-label="Edit recipe"
                    className="h-11 w-11 flex items-center justify-center rounded-lg text-ink-muted transition-colors duration-200 [transition-timing-function:var(--ease)] hover:text-ink hover:bg-[var(--glass-edge)] active:opacity-90"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <Button variant="volt" size="sm" onClick={() => handleLog(recipe)} className="min-h-[44px]">
                    <UtensilsCrossed className="w-3 h-3" />Log
                  </Button>
                </div>
              </div>
              <div className="flex gap-3 text-xs font-technical tabular-nums">
                <span className="text-ink font-bold">{Math.round(perServing.calories)}<span className="text-ink-muted font-normal ml-0.5">cal</span></span>
                <span className="text-coral">P{perServing.protein_grams}g</span>
                <span className="text-carb">C{perServing.carbs_grams}g</span>
                <span className="text-fat">F{perServing.fats_grams}g</span>
              </div>
            </div>
          );
        })}

        {showCreateDialog && (
          <RecipeFormDialog
            open={showCreateDialog}
            onOpenChange={(open) => { setShowCreateDialog(open); if (!open) setEditingRecipe(null); }}
            recipe={editingRecipe}
            userId={user.id}
          />
        )}
        {showLogDialog && loggingRecipe && (
          <LogRecipeDialog
            open={showLogDialog}
            onOpenChange={(open) => { setShowLogDialog(open); if (!open) setLoggingRecipe(null); }}
            recipe={loggingRecipe}
            userId={user.id}
          />
        )}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete Recipe?"
          description={`This will permanently delete "${deleteTarget?.name}".`}
          confirmText="Delete" cancelText="Cancel" variant="danger"
          onConfirm={() => { deleteRecipeMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          loading={deleteRecipeMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div>
          <h2 className="text-xl font-bold text-left text-ink">Your Recipes</h2>
          <p className="text-sm text-left text-ink-muted">
            Create custom recipes and log them to your daily tracker
          </p>
        </div>
      )}


      {recipes.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-charcoal-border">
          <BookOpen className="w-12 h-12 text-ink-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-ink mb-1">No recipes yet</h3>
          <p className="text-sm text-ink-muted">Use the "New Recipe" button above to create your first recipe</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recipes.map((recipe) => {
            const perServing = scaleRecipeToServings(recipe, 1);
            return (
              <div key={recipe.id} className="tile p-4 flex flex-col gap-3">
                {/* Name row */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink leading-snug">{recipe.name}</p>
                    {recipe.description && (
                      <p className="text-xs text-ink-muted mt-0.5 truncate">{recipe.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-semibold bg-charcoal-elevated text-ink-muted rounded-md px-1.5 py-0.5">
                    {recipe.servings}×
                  </span>
                </div>
                {/* Macros */}
                <div className="flex gap-4">
                  <div>
                    <p className="text-sm font-bold text-gold font-technical tabular-nums">{Math.round(perServing.calories)}</p>
                    <p className="text-xs text-ink-muted">Cal</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-coral font-technical tabular-nums">{perServing.protein_grams}g</p>
                    <p className="text-xs text-ink-muted">Pro</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-carb font-technical tabular-nums">{perServing.carbs_grams}g</p>
                    <p className="text-xs text-ink-muted">Carb</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-fat font-technical tabular-nums">{perServing.fats_grams}g</p>
                    <p className="text-xs text-ink-muted">Fat</p>
                  </div>
                </div>
                <p className="text-xs text-ink-muted -mt-1">
                  {recipe.ingredients?.length || 0} ingredients · per serving
                </p>
                {/* Actions */}
                <div className="flex gap-1.5">
                  <Button variant="volt" size="sm" onClick={() => handleLog(recipe)} className="flex-1 min-h-[44px]">
                    <UtensilsCrossed className="w-3 h-3 mr-1" />Log
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setSharingRecipe(recipe)} title="Share" className="h-11 w-11">
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleEdit(recipe)} aria-label="Edit recipe" className="h-11 w-11">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => handleDelete(recipe)} aria-label="Delete recipe" className="h-11 w-11">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateDialog && (
        <RecipeFormDialog
          open={showCreateDialog}
          onOpenChange={(open) => {
            setShowCreateDialog(open);
            if (!open) setEditingRecipe(null);
          }}
          recipe={editingRecipe}
          userId={user.id}
        />
      )}

      {showLogDialog && loggingRecipe && (
        <LogRecipeDialog
          open={showLogDialog}
          onOpenChange={(open) => {
            setShowLogDialog(open);
            if (!open) setLoggingRecipe(null);
          }}
          recipe={loggingRecipe}
          userId={user.id}
        />
      )}


      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Recipe?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          deleteRecipeMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        loading={deleteRecipeMutation.isPending}
      />
    </div>
  );
}

const SERVING_UNITS = ["g", "oz", "lb", "ml", "cup", "tbsp", "tsp", "piece", "serving"];

// System easing: the single cubic-bezier(.2,.7,.3,1) from --ease in index.css,
// expressed as a framer-motion bezier array.
const SYSTEM_EASE = [0.2, 0.7, 0.3, 1];
const STEP_TRANSITION = { duration: 0.26, ease: SYSTEM_EASE };

const stepVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

function StickyMacroBar({ ingredients, servings }) {
  const totals = calculateRecipeTotals(ingredients);
  const hasIngredients = ingredients.length > 0;

  return (
    <div
      className={`sticky top-0 z-10 glass-elevated border-b px-6 py-3 transition-opacity duration-300 [transition-timing-function:var(--ease)] ${
        hasIngredients ? "" : "opacity-40"
      }`}
    >
      <div className="grid grid-cols-4 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-gold font-technical tabular-nums transition-all duration-300 [transition-timing-function:var(--ease)]">
            {Math.round(totals.total_calories)}
          </div>
          <div className="text-xs font-medium text-ink-muted uppercase tracking-wide">
            Calories
          </div>
        </div>
        <div>
          <div className="text-lg font-bold text-coral font-technical tabular-nums transition-all duration-300 [transition-timing-function:var(--ease)]">
            {Math.round(totals.total_protein * 10) / 10}g
          </div>
          <div className="text-xs font-medium text-ink-muted uppercase tracking-wide">
            Protein
          </div>
        </div>
        <div>
          <div className="text-lg font-bold text-carb font-technical tabular-nums transition-all duration-300 [transition-timing-function:var(--ease)]">
            {Math.round(totals.total_carbs * 10) / 10}g
          </div>
          <div className="text-xs font-medium text-ink-muted uppercase tracking-wide">
            Carbs
          </div>
        </div>
        <div>
          <div className="text-lg font-bold text-fat font-technical tabular-nums transition-all duration-300 [transition-timing-function:var(--ease)]">
            {Math.round(totals.total_fats * 10) / 10}g
          </div>
          <div className="text-xs font-medium text-ink-muted uppercase tracking-wide">
            Fats
          </div>
        </div>
      </div>
      {servings > 1 && hasIngredients && (
        <div className="text-xs text-ink-muted text-center mt-1.5 font-technical tabular-nums">
          Per serving: {Math.round(totals.total_calories / servings)} cal{" · "}
          {Math.round((totals.total_protein / servings) * 10) / 10}g P{" · "}
          {Math.round((totals.total_carbs / servings) * 10) / 10}g C{" · "}
          {Math.round((totals.total_fats / servings) * 10) / 10}g F
        </div>
      )}
    </div>
  );
}

function FoodSearchResult({ food, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-brand/[8%] border-b last:border-b-0 transition-colors group"
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 text-ink-muted group-hover:text-brand transition-colors">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ink text-sm truncate">
            {food.description || food.food_name}
          </div>
          {food.brandOwner && (
            <div className="text-xs text-ink-muted">{food.brandOwner}</div>
          )}
          <div className="flex gap-3 mt-1 text-xs">
            <span className="text-gold font-medium">
              {Math.round(food.calories ?? food.cal ?? 0)} cal
            </span>
            <span className="text-coral">
              {Math.round((food.protein ?? food.protein_grams ?? 0) * 10) / 10}g P
            </span>
            <span className="text-carb">
              {Math.round((food.carbs ?? food.carbs_grams ?? 0) * 10) / 10}g C
            </span>
            <span className="text-fat">
              {Math.round((food.fats ?? food.fats_grams ?? 0) * 10) / 10}g F
            </span>
          </div>
        </div>
        <Plus className="w-4 h-4 text-ink-muted group-hover:text-brand mt-1 transition-colors" />
      </div>
    </button>
  );
}

function CollapsibleFoodSection({ label, icon, count, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        {icon}
        <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-ink-muted ml-auto">{count}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto border rounded-xl bg-charcoal-surface mt-2">
          {children}
        </div>
      )}
    </div>
  );
}

function IngredientCard({ ingredient, index, onUpdateServing, onUpdateUnit, onRemove }) {
  return (
    <div className="tile tile-interactive p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-ink truncate">
            {ingredient.food_name}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs font-technical tabular-nums">
            <span className="text-ink-muted font-medium">Per serving:</span>
            <span className="text-gold font-medium">{ingredient.calories} cal</span>
            <span className="text-coral">{ingredient.protein_grams}g P</span>
            <span className="text-carb">{ingredient.carbs_grams}g C</span>
            <span className="text-fat">{ingredient.fats_grams}g F</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          className="text-bad hover:text-bad hover:bg-bad/10 h-8 w-8 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex justify-end mt-2">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={ingredient.serving_size}
            onChange={(e) => onUpdateServing(index, e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-16 h-11 text-center"
            min="0"
            step="1"
          />
          <Select
            value={ingredient.serving_unit}
            onValueChange={(val) => onUpdateUnit(index, val)}
          >
            <SelectTrigger className="h-11 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVING_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit} className="text-xs">
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function ManualIngredientForm({ onAdd, onCancel, userId }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("serving");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");

  const saveCustomFoodMutation = useMutation({
    mutationFn: async (food) => {
      // Check for existing custom food with same name to avoid duplicates
      const existing = await db.entities.CustomFood.filter({
        created_by: userId,
      });
      const match = existing.find(
        (f) => f.food_name.toLowerCase() === food.food_name.toLowerCase()
      );
      if (match) {
        return db.entities.CustomFood.update(match.id, food);
      }
      return db.entities.CustomFood.create({ ...food, created_by: userId });
    },
    onSuccess: () => invalidateCustomFoods(queryClient),
  });

  const handleAdd = () => {
    if (!name.trim()) {
      toast.error("Food name is required");
      return;
    }
    const cal = parseFloat(calories) || 0;
    const p = parseFloat(protein) || 0;
    const c = parseFloat(carbs) || 0;
    const f = parseFloat(fats) || 0;
    if (cal === 0 && p === 0 && c === 0 && f === 0) {
      toast.error("Enter at least one nutrition value");
      return;
    }

    // Macros entered are per-serving; multiply by amount for the ingredient totals
    const numAmount = parseFloat(amount) || 1;
    const totalCal = Math.round(cal * numAmount);
    const totalP = Math.round(p * numAmount * 10) / 10;
    const totalC = Math.round(c * numAmount * 10) / 10;
    const totalF = Math.round(f * numAmount * 10) / 10;

    const ingredient = {
      food_name: name.trim(),
      serving_size: numAmount,
      serving_unit: unit,
      calories: totalCal,
      protein_grams: totalP,
      carbs_grams: totalC,
      fats_grams: totalF,
      _base_serving_size: 1,
      _base_serving_unit: unit,
      _base_calories: cal,
      _base_protein: p,
      _base_carbs: c,
      _base_fats: f,
    };

    onAdd(ingredient);

    // Save to custom foods per-serving (fire-and-forget)
    saveCustomFoodMutation.mutate({
      food_name: name.trim(),
      serving_size: 1,
      serving_unit: unit,
      calories: Math.round(cal),
      protein_grams: Math.round(p * 10) / 10,
      carbs_grams: Math.round(c * 10) / 10,
      fats_grams: Math.round(f * 10) / 10,
    });

    // Reset for next entry
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setAmount(1);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to search
      </button>

      <div>
        <Label className="text-xs font-medium text-ink-muted">Food Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Chilli Beans"
          className="mt-1 h-10 rounded-lg"
          autoFocus
        />
      </div>

      <div>
        <Label className="text-xs font-medium text-ink-muted">Serving</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.5"
            className="w-20 h-10 text-center rounded-lg"
          />
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="h-10 w-28 text-sm rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVING_UNITS.map((u) => (
                <SelectItem key={u} value={u} className="text-sm">
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-ink-muted">
          Nutrition (per serving)
        </Label>
        <div className="grid grid-cols-4 gap-2 mt-1">
          <div>
            <Input
              type="number"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="Cal"
              min="0"
              className="h-10 text-sm text-center rounded-lg"
            />
            <div className="text-xs text-gold font-medium text-center mt-0.5">
              Calories
            </div>
          </div>
          <div>
            <Input
              type="number"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="g"
              min="0"
              step="0.1"
              className="h-10 text-sm text-center rounded-lg"
            />
            <div className="text-xs text-coral font-medium text-center mt-0.5">
              Protein
            </div>
          </div>
          <div>
            <Input
              type="number"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder="g"
              min="0"
              step="0.1"
              className="h-10 text-sm text-center rounded-lg"
            />
            <div className="text-xs text-carb font-medium text-center mt-0.5">
              Carbs
            </div>
          </div>
          <div>
            <Input
              type="number"
              value={fats}
              onChange={(e) => setFats(e.target.value)}
              placeholder="g"
              min="0"
              step="0.1"
              className="h-10 text-sm text-center rounded-lg"
            />
            <div className="text-xs text-fat font-medium text-center mt-0.5">
              Fats
            </div>
          </div>
        </div>
      </div>

      {amount > 1 && (parseFloat(calories) > 0 || parseFloat(protein) > 0) && (
        <div className="bg-brand/[8%] rounded-lg px-3 py-2 text-xs text-brand">
          <span className="font-medium">Total ({amount} {unit}s):</span>{" "}
          {Math.round((parseFloat(calories) || 0) * amount)} cal &middot;{" "}
          {Math.round((parseFloat(protein) || 0) * amount * 10) / 10}g P &middot;{" "}
          {Math.round((parseFloat(carbs) || 0) * amount * 10) / 10}g C &middot;{" "}
          {Math.round((parseFloat(fats) || 0) * amount * 10) / 10}g F
        </div>
      )}

      <Button
        variant="volt"
        onClick={handleAdd}
        className="w-full h-11 text-sm"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Add Ingredient
      </Button>
    </div>
  );
}

function RecipeFormDialog({ open, onOpenChange, recipe, userId }) {
  const queryClient = useQueryClient();
  const searchRef = useRef(null);
  const isEditing = !!recipe;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Step 1 fields
  const [name, setName] = useState(recipe?.name || "");
  const [description, setDescription] = useState(recipe?.description || "");
  const [servings, setServings] = useState(recipe?.servings || 1);

  // Step 2 fields
  const initIngredients = (recipe?.ingredients || []).map((ing) => ({
    ...ing,
    _base_serving_size: ing._base_serving_size ?? ing.serving_size,
    _base_serving_unit: ing._base_serving_unit ?? ing.serving_unit ?? "g",
    _base_calories: ing._base_calories ?? ing.calories,
    _base_protein: ing._base_protein ?? ing.protein_grams,
    _base_carbs: ing._base_carbs ?? ing.carbs_grams,
    _base_fats: ing._base_fats ?? ing.fats_grams,
  }));
  const [ingredients, setIngredients] = useState(initIngredients);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Recent foods & custom foods
  const { allFoodEntries } = useAllFoodEntries();
  const recentFoods = getRecentFoods(allFoodEntries, 8);
  const { customFoods } = useCustomFoods();

  // Filter custom foods when searching
  const matchingCustomFoods = searchQuery.length >= 2
    ? customFoods.filter((f) =>
        f.food_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Debounced USDA search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchFoods(searchQuery);
        setSearchResults(results);
      } catch {
        toast.error("Failed to search foods");
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus search on step 2
  useEffect(() => {
    if (currentStep === 2) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [currentStep]);

  const addIngredientFromUSDA = (food) => {
    setIngredients((prev) => [...prev, ingredientFromUSDA(food)]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const addRecentFood = (recentFood) => {
    const servingSize = parseFloat(recentFood.serving_size) || 100;
    setIngredients((prev) => [
      ...prev,
      {
        food_name: recentFood.food_name,
        serving_size: servingSize,
        serving_unit: "g",
        calories: Math.round(recentFood.calories),
        protein_grams: Math.round(recentFood.protein_grams * 10) / 10,
        carbs_grams: Math.round(recentFood.carbs_grams * 10) / 10,
        fats_grams: Math.round(recentFood.fats_grams * 10) / 10,
        _base_serving_size: servingSize,
        _base_serving_unit: "g",
        _base_calories: recentFood.calories,
        _base_protein: recentFood.protein_grams,
        _base_carbs: recentFood.carbs_grams,
        _base_fats: recentFood.fats_grams,
      },
    ]);
  };

  const addManualIngredient = (ingredient) => {
    setIngredients((prev) => [...prev, ingredient]);
  };

  const addCustomFood = (food) => {
    setIngredients((prev) => [
      ...prev,
      {
        food_name: food.food_name,
        serving_size: food.serving_size || 1,
        serving_unit: food.serving_unit || "serving",
        calories: Math.round(food.calories),
        protein_grams: Math.round((food.protein_grams || 0) * 10) / 10,
        carbs_grams: Math.round((food.carbs_grams || 0) * 10) / 10,
        fats_grams: Math.round((food.fats_grams || 0) * 10) / 10,
        _base_serving_size: food.serving_size || 1,
        _base_serving_unit: food.serving_unit || "serving",
        _base_calories: food.calories,
        _base_protein: food.protein_grams || 0,
        _base_carbs: food.carbs_grams || 0,
        _base_fats: food.fats_grams || 0,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeIngredient = (index) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateIngredientServing = (index, newAmount) => {
    const parsed = parseFloat(newAmount);
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        // Show the raw string while typing; only rescale when there's a valid number
        return isNaN(parsed)
          ? { ...ing, serving_size: newAmount }
          : rescaleIngredient(ing, parsed, ing.serving_unit);
      })
    );
  };

  const updateIngredientUnit = (index, newUnit) => {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        // Rescale macros for the new unit with the same numeric amount
        const updated = rescaleIngredient(ing, ing.serving_size, newUnit);
        return { ...updated, serving_unit: newUnit };
      })
    );
  };

  const goToStep = (step) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  // Mutations
  const createRecipeMutation = useMutation({
    mutationFn: (data) => db.entities.Recipe.create(data),
    onSuccess: () => {
      invalidateRecipes(queryClient);
      toast.success("Recipe created!");
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to save recipe"),
  });

  const updateRecipeMutation = useMutation({
    mutationFn: ({ id, ...data }) => db.entities.Recipe.update(id, data),
    onSuccess: () => {
      invalidateRecipes(queryClient);
      toast.success("Recipe updated!");
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to update recipe"),
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Recipe name is required");
      goToStep(1);
      return;
    }
    if (ingredients.length === 0) {
      toast.error("Add at least one ingredient");
      return;
    }

    const cleanIngredients = ingredients.map(stripBaseFields);
    const data = {
      name: name.trim(),
      servings,
      ingredients: cleanIngredients,
      ...calculateRecipeTotals(cleanIngredients),
      created_by: userId,
    };

    if (isEditing) {
      updateRecipeMutation.mutate({ id: recipe.id, ...data });
    } else {
      createRecipeMutation.mutate(data);
    }
  };

  const isSaving = createRecipeMutation.isPending || updateRecipeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${currentStep === 2 ? "max-w-2xl" : "max-w-md"} w-full max-h-[88dvh] sm:max-h-[75vh] sm:my-8 flex flex-col overflow-hidden p-0 min-h-0`} hideClose>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b">
          <div className="flex items-center gap-3">
            {currentStep === 2 && (
              <button
                onClick={() => goToStep(1)}
                className="h-11 w-11 flex items-center justify-center -ml-2 rounded-full text-ink-muted hover:text-ink hover:bg-[var(--glass-edge)] transition-colors"
                aria-label="Back to details"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold text-ink">
                {isEditing ? "Edit Recipe" : "Create Recipe"}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex gap-1.5">
                  <div
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                      currentStep >= 1
                        ? "bg-brand"
                        : "bg-track"
                    }`}
                  />
                  <div
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                      currentStep >= 2
                        ? "bg-brand"
                        : "bg-track"
                    }`}
                  />
                </div>
                <span className="text-xs text-ink-muted">
                  {currentStep === 1 ? "Details" : "Ingredients"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="h-11 w-11 flex items-center justify-center -mr-2 rounded-full text-ink-muted hover:text-ink hover:bg-[var(--glass-edge)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          <AnimatePresence mode="wait" custom={direction}>
            {currentStep === 1 ? (
              <motion.div
                key="step-1"
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={STEP_TRANSITION}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
                  <div className="max-w-md mx-auto space-y-6">
                    <div>
                      <Label htmlFor="recipe-name" className="text-sm font-medium">
                        Recipe Name *
                      </Label>
                      <Input
                        id="recipe-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Chicken Stir Fry"
                        className="mt-1.5 h-11"
                        autoFocus
                      />
                    </div>

                    <div>
                      <Label htmlFor="recipe-desc" className="text-sm font-medium">
                        Description
                      </Label>
                      <Input
                        id="recipe-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional — e.g., Quick weeknight dinner"
                        className="mt-1.5 h-11"
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Servings</Label>
                      <div className="flex items-center gap-3 mt-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setServings(Math.max(1, servings - 1))}
                          className="h-11 w-11 rounded-xl"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          value={servings}
                          onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                          min="1"
                          className="w-20 h-11 text-center text-lg font-semibold"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setServings(servings + 1)}
                          className="h-11 w-11 rounded-xl"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 1 footer */}
                <div
                  className="px-6 py-4 border-t bg-charcoal-surface/50"
                  style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                >
                  <Button
                    variant="volt"
                    onClick={() => {
                      if (!name.trim()) {
                        toast.error("Recipe name is required");
                        return;
                      }
                      goToStep(2);
                    }}
                    className="w-full h-11 text-sm"
                  >
                    Next: Add Ingredients
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-2"
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={STEP_TRANSITION}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="flex-1 overflow-y-auto min-h-0">
                  {/* Sticky macro bar */}
                  <StickyMacroBar ingredients={ingredients} servings={servings} />

                  <div className="px-6 py-4 space-y-4">
                    {/* Search or Manual Entry */}
                    <div>
                      {!showManualEntry ? (
                        <>
                          <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                            <Input
                              ref={searchRef}
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search foods to add..."
                              className="pl-10 h-11 rounded-xl glass glass-interactive focus:bg-charcoal-surface"
                            />
                            {isSearching && (
                              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand animate-spin" />
                            )}
                          </div>

                          {/* Search results: custom foods first, then USDA */}
                          {(matchingCustomFoods.length > 0 || searchResults.length > 0) && (
                            <div className="mt-2 max-h-64 overflow-y-auto border rounded-xl bg-charcoal-surface">
                              {matchingCustomFoods.map((food) => (
                                <FoodSearchResult
                                  key={"custom-" + food.id}
                                  food={food}
                                  onClick={() => addCustomFood(food)}
                                  icon={<Star className="w-3.5 h-3.5 fill-gold text-gold" />}
                                />
                              ))}
                              {matchingCustomFoods.length > 0 && searchResults.length > 0 && (
                                <div className="px-4 py-1.5 bg-charcoal-surface text-xs font-medium text-ink-muted uppercase tracking-wide">
                                  USDA Database
                                </div>
                              )}
                              {searchResults.map((food) => (
                                <FoodSearchResult
                                  key={food.fdcId}
                                  food={food}
                                  onClick={() => addIngredientFromUSDA(food)}
                                  icon={<Search className="w-3.5 h-3.5" />}
                                />
                              ))}
                            </div>
                          )}

                          {/* My Foods + Recent foods (when not searching) */}
                          {searchQuery.length < 2 && searchResults.length === 0 && (
                            <>
                              {customFoods.length > 0 && (
                                <CollapsibleFoodSection
                                  label="My Foods"
                                  icon={<Star className="w-3.5 h-3.5 fill-gold text-gold" />}
                                  count={customFoods.length}
                                >
                                  {customFoods.map((food) => (
                                    <FoodSearchResult
                                      key={"my-" + food.id}
                                      food={food}
                                      onClick={() => addCustomFood(food)}
                                      icon={<Star className="w-3.5 h-3.5 fill-gold text-gold" />}
                                    />
                                  ))}
                                </CollapsibleFoodSection>
                              )}

                              {recentFoods.length > 0 && (
                                <CollapsibleFoodSection
                                  label="Recent Foods"
                                  icon={<Clock className="w-3.5 h-3.5 text-ink-muted" />}
                                  count={recentFoods.length}
                                >
                                  {recentFoods.map((food, i) => (
                                    <FoodSearchResult
                                      key={food.food_name + i}
                                      food={food}
                                      onClick={() => addRecentFood(food)}
                                      icon={<Clock className="w-3.5 h-3.5" />}
                                    />
                                  ))}
                                </CollapsibleFoodSection>
                              )}
                            </>
                          )}

                          {/* Manual entry toggle */}
                          <div className="flex justify-center mt-3">
                            <button
                              onClick={() => setShowManualEntry(true)}
                              className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-brand transition-colors"
                            >
                              <PenLine className="w-3.5 h-3.5" />
                              or add manually from label
                            </button>
                          </div>
                        </>
                      ) : (
                        <ManualIngredientForm
                          onAdd={addManualIngredient}
                          onCancel={() => setShowManualEntry(false)}
                          userId={userId}
                        />
                      )}
                    </div>

                    {/* Ingredients list */}
                    {ingredients.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-semibold text-ink">
                            Ingredients
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {ingredients.length}
                          </Badge>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                          <AnimatePresence>
                            {ingredients.map((ing, index) => (
                              <motion.div
                                key={ing.food_name + index}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <IngredientCard
                                  ingredient={ing}
                                  index={index}
                                  onUpdateServing={updateIngredientServing}
                                  onUpdateUnit={updateIngredientUnit}
                                  onRemove={removeIngredient}
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}

                    {ingredients.length === 0 && (
                      <div className="text-center py-8">
                        <Search className="w-10 h-10 text-ink-muted mx-auto mb-3" />
                        <p className="text-sm text-ink-muted">
                          Search above to start adding ingredients
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2 footer */}
                <div
                  className="px-6 pt-4 pb-6 border-t bg-charcoal-surface/50 flex-shrink-0"
                  style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
                >
                  <Button
                    variant="volt"
                    onClick={handleSave}
                    disabled={isSaving || ingredients.length === 0}
                    className="w-full h-11 text-sm"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : isEditing ? (
                      "Update Recipe"
                    ) : (
                      `Save Recipe${ingredients.length > 0 ? ` (${ingredients.length} ingredients)` : ""}`
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogRecipeDialog({ open, onOpenChange, recipe, userId }) {
  const queryClient = useQueryClient();
  const [mealType, setMealType] = useState("lunch");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [servingCount, setServingCount] = useState(1);

  const scaled = scaleRecipeToServings(recipe, parseFloat(servingCount) || 1);

  const logMutation = useMutation({
    mutationFn: (entry) => db.entities.FoodEntry.create(entry),
    onSuccess: () => {
      invalidateFood(queryClient);
      toast.success(`${recipe.name} logged!`);
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to log recipe"),
  });

  const handleLog = () => {
    const entry = recipeToFoodEntry(recipe, parseFloat(servingCount) || 1, mealType, date, userId);
    logMutation.mutate(entry);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Recipe: {recipe.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                type="number"
                value={servingCount}
                onChange={(e) => setServingCount(e.target.value)}
                min="0.5"
                step="0.5"
                className="w-20 text-center"
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
              <div className="text-lg font-bold text-gold font-technical tabular-nums">
                {scaled.calories}
              </div>
              <div className="text-xs text-ink-muted">Calories</div>
            </div>
            <div className="glass-inset text-center p-3">
              <div className="text-lg font-bold text-coral font-technical tabular-nums">
                {scaled.protein_grams}g
              </div>
              <div className="text-xs text-ink-muted">Protein</div>
            </div>
            <div className="glass-inset text-center p-3">
              <div className="text-lg font-bold text-carb font-technical tabular-nums">
                {scaled.carbs_grams}g
              </div>
              <div className="text-xs text-ink-muted">Carbs</div>
            </div>
            <div className="glass-inset text-center p-3">
              <div className="text-lg font-bold text-fat font-technical tabular-nums">
                {scaled.fats_grams}g
              </div>
              <div className="text-xs text-ink-muted">Fats</div>
            </div>
          </div>

          <Button
            variant="volt"
            size="lg"
            onClick={handleLog}
            disabled={logMutation.isPending}
            className="w-full"
          >
            {logMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
