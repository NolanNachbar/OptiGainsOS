/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useRef } from "react";
import { db } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateCustomFoods } from "@/lib/queryKeys";
import { calculateRecipeTotals, portionLabels, portionsMap } from "@/utils/nutritionUtils";
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
import { Plus, Trash2, Pencil, X, ArrowLeft, Share2, ChevronRight, MoreVertical } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";


export const SERVING_UNITS = ["g", "oz", "lb", "ml", "cup", "tbsp", "tsp", "piece", "serving"];

// System easing: the single cubic-bezier(.2,.7,.3,1) from --ease in index.css,
// expressed as a framer-motion bezier array.
export const SYSTEM_EASE = [0.2, 0.7, 0.3, 1];

export const STEP_TRANSITION = { duration: 0.26, ease: SYSTEM_EASE };

export const stepVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

// Overflow menu for a recipe card — keeps Log as the single full-width primary
// while Share / Edit / Delete live behind a kebab. Mirrors the WorkoutCard kebab:
// collision-aware (flips above the trigger near the viewport bottom), closes on
// outside click, 44px tap targets.
export function RecipeCardMenu({ onShare, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // ~150px menu height + dock clearance; flip up if it would collide.
      setFlipUp(window.innerHeight - rect.bottom < 200);
    }
    setOpen((v) => !v);
  };

  const run = (fn) => () => { fn(); setOpen(false); };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Button
        ref={triggerRef}
        variant="outline"
        size="icon"
        onClick={toggle}
        aria-label="Recipe options"
        aria-expanded={open}
        className="h-11 w-11"
      >
        <MoreVertical className="w-4 h-4" />
      </Button>
      {open && (
        <div className={`absolute right-0 glass-elevated rounded-xl py-1 z-20 min-w-[150px] ${flipUp ? "bottom-12" : "top-12"}`}>
          <button
            onClick={run(onShare)}
            className="w-full px-3 py-2 text-left text-body text-ink hover:bg-[var(--glass-bg)] transition-colors duration-200 [transition-timing-function:var(--ease)] flex items-center gap-2 min-h-[44px]"
          >
            <Share2 className="w-3.5 h-3.5" />Share
          </button>
          <button
            onClick={run(onEdit)}
            className="w-full px-3 py-2 text-left text-body text-ink hover:bg-[var(--glass-bg)] transition-colors duration-200 [transition-timing-function:var(--ease)] flex items-center gap-2 min-h-[44px]"
          >
            <Pencil className="w-3.5 h-3.5" />Edit
          </button>
          <button
            onClick={run(onDelete)}
            className="w-full px-3 py-2 text-left text-body text-bad hover:bg-bad/10 transition-colors duration-200 [transition-timing-function:var(--ease)] flex items-center gap-2 min-h-[44px]"
          >
            <Trash2 className="w-3.5 h-3.5" />Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function StickyMacroBar({ ingredients, servings }) {
  const totals = calculateRecipeTotals(ingredients);
  const hasIngredients = ingredients.length > 0;

  return (
    <div
      className={`sticky top-0 z-10 glass-elevated glass-elevated--substacked border-b px-6 py-3 transition-opacity duration-300 [transition-timing-function:var(--ease)] ${
        hasIngredients ? "" : "opacity-40"
      }`}
    >
      {/* Calories leads at a display size; P/C/F sit beneath as quiet supporting
          figures so the macro bar has a clear primary readout. */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="hero-metric text-display text-gold transition-[color,opacity] duration-200 [transition-timing-function:var(--ease)]">
            {Math.round(totals.total_calories)}
          </div>
          <div className="text-caption font-medium text-ink-muted uppercase tracking-wide mt-0.5">
            Calories
          </div>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-body font-bold text-coral font-technical tabular-nums transition-[color,opacity] duration-200 [transition-timing-function:var(--ease)]">
              {Math.round(totals.total_protein * 10) / 10}g
            </div>
            <div className="text-caption font-medium text-ink-muted uppercase tracking-wide">
              Protein
            </div>
          </div>
          <div>
            <div className="text-body font-bold text-carb font-technical tabular-nums transition-[color,opacity] duration-200 [transition-timing-function:var(--ease)]">
              {Math.round(totals.total_carbs * 10) / 10}g
            </div>
            <div className="text-caption font-medium text-ink-muted uppercase tracking-wide">
              Carbs
            </div>
          </div>
          <div>
            <div className="text-body font-bold text-fat font-technical tabular-nums transition-[color,opacity] duration-200 [transition-timing-function:var(--ease)]">
              {Math.round(totals.total_fats * 10) / 10}g
            </div>
            <div className="text-caption font-medium text-ink-muted uppercase tracking-wide">
              Fats
            </div>
          </div>
        </div>
      </div>
      {servings > 1 && hasIngredients && (
        <div className="text-caption text-ink-muted text-center mt-1.5 font-technical tabular-nums">
          Per serving: {Math.round(totals.total_calories / servings)} cal{" · "}
          {Math.round((totals.total_protein / servings) * 10) / 10}g P{" · "}
          {Math.round((totals.total_carbs / servings) * 10) / 10}g C{" · "}
          {Math.round((totals.total_fats / servings) * 10) / 10}g F
        </div>
      )}
    </div>
  );
}

export function FoodSearchResult({ food, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-brand/[8%] border-b last:border-b-0 transition-colors duration-200 [transition-timing-function:var(--ease)] group"
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 text-ink-muted group-hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ink text-body truncate">
            {food.description || food.food_name}
          </div>
          {food.brandOwner && (
            <div className="text-caption text-ink-muted">{food.brandOwner}</div>
          )}
          <div className="flex gap-3 mt-1 text-caption">
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
        <Plus className="w-4 h-4 text-ink-muted group-hover:text-brand mt-1 transition-colors duration-200 [transition-timing-function:var(--ease)]" />
      </div>
    </button>
  );
}

export function CollapsibleFoodSection({ label, icon, count, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-200 [transition-timing-function:var(--ease)] ${open ? "rotate-90" : ""}`}
        />
        {icon}
        <span className="text-caption font-medium text-ink-muted uppercase tracking-wide">
          {label}
        </span>
        <span className="text-caption text-ink-muted ml-auto">{count}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: SYSTEM_EASE }}
            className="overflow-hidden"
          >
            <div className="max-h-48 overflow-y-auto border rounded-xl bg-charcoal-surface mt-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function IngredientCard({ ingredient, index, onUpdateServing, onUpdateUnit, onRemove }) {
  return (
    <div className="tile tile-interactive p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-body text-ink truncate">
            {ingredient.food_name}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-caption font-technical tabular-nums">
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
          className="text-bad hover:text-bad hover:bg-bad/10 h-11 w-11 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex justify-end mt-2">
        <div className="flex items-center gap-2">
          <Input
            type="number" inputMode="decimal"
            value={ingredient.serving_size}
            onChange={(e) => onUpdateServing(index, e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-16 h-11 text-center font-technical tabular-nums"
            min="0"
            step="1"
          />
          <Select
            value={ingredient.serving_unit}
            onValueChange={(val) => onUpdateUnit(index, val)}
          >
            <SelectTrigger className="h-11 w-20 text-caption">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* This ingredient's own portions first; a generic unit it has
                  redefined drops out rather than offering two gram weights
                  under one name. */}
              {portionLabels(ingredient._portions).map((label) => (
                <SelectItem key={label} value={label} className="text-caption">
                  {label}
                </SelectItem>
              ))}
              {SERVING_UNITS.filter((unit) => !portionsMap(ingredient._portions)[unit]).map((unit) => (
                <SelectItem key={unit} value={unit} className="text-caption">
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

export function ManualIngredientForm({ onAdd, onCancel, userId }) {
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
        className="flex items-center gap-1.5 text-caption font-medium text-brand hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to search
      </button>

      <div>
        <Label className="text-caption font-medium text-ink-muted">Food Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Chilli Beans"
          className="mt-1 h-11 rounded-lg"
          autoFocus
        />
      </div>

      <div>
        <Label className="text-caption font-medium text-ink-muted">Serving</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            type="number" inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.5"
            className="w-20 h-11 text-center rounded-lg font-technical tabular-nums"
          />
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="h-11 w-28 text-body rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVING_UNITS.map((u) => (
                <SelectItem key={u} value={u} className="text-body">
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-caption font-medium text-ink-muted">
          Nutrition (per serving)
        </Label>
        <div className="grid grid-cols-4 gap-2 mt-1">
          <div>
            <Input
              type="number" inputMode="decimal"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="Cal"
              min="0"
              className="h-11 text-body text-center rounded-lg"
            />
            <div className="text-caption text-gold font-medium text-center mt-0.5">
              Calories
            </div>
          </div>
          <div>
            <Input
              type="number" inputMode="decimal"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="g"
              min="0"
              step="0.1"
              className="h-11 text-body text-center rounded-lg"
            />
            <div className="text-caption text-coral font-medium text-center mt-0.5">
              Protein
            </div>
          </div>
          <div>
            <Input
              type="number" inputMode="decimal"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder="g"
              min="0"
              step="0.1"
              className="h-11 text-body text-center rounded-lg"
            />
            <div className="text-caption text-carb font-medium text-center mt-0.5">
              Carbs
            </div>
          </div>
          <div>
            <Input
              type="number" inputMode="decimal"
              value={fats}
              onChange={(e) => setFats(e.target.value)}
              placeholder="g"
              min="0"
              step="0.1"
              className="h-11 text-body text-center rounded-lg"
            />
            <div className="text-caption text-fat font-medium text-center mt-0.5">
              Fats
            </div>
          </div>
        </div>
      </div>

      {amount > 1 && (parseFloat(calories) > 0 || parseFloat(protein) > 0) && (
        <div className="bg-brand/[8%] rounded-lg px-3 py-2 text-caption text-brand">
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
        className="w-full h-11 text-body"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Add Ingredient
      </Button>
    </div>
  );
}
