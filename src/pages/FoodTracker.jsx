import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useAllFoodEntries, useCustomFoods, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { searchGenericFoods, searchBrandedFoods } from "@/api/usda";
import { calculateMacros, getDailyCalorieTrend, getRecentFoods, UNIT_TO_GRAMS } from "@/utils/nutritionUtils";
import { calculateMacroSplit, getBestTDEE, calculatePhaseCalories } from "@/utils/coachingUtils";
import { useDietPhase } from "@/hooks/useDietPhase";
import { DEFAULT_GOALS } from "@/lib/constants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Apple, Plus, Trash2, Pencil, Search, Loader2, BookOpen, UtensilsCrossed, Star, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Bookmark, Calculator, Save, Camera, AlertTriangle, Upload, HelpCircle, X } from "lucide-react";
import { queryKeys, invalidateCustomFoods, invalidateFood, invalidateProfile } from "@/lib/queryKeys";
import { format } from "date-fns";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import RecipeBuilder from "@/components/nutrition/RecipeBuilder";
import { MacroGoalsEditor } from "@/components/nutrition/MacroGoalsEditor";
import MealTemplates, { SaveAsTemplateDialog } from "@/components/nutrition/MealTemplates";
import StatsSetupModal from "@/components/nutrition/StatsSetupModal";
import BarcodeScanner from "@/components/nutrition/BarcodeScanner";
import MealPlanIdeas from "@/components/nutrition/MealPlanIdeas";

const getDefaultMealType = () => {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 17) return "snack";
  return "dinner";
};

export default function FoodTracker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateEntries, setTemplateEntries] = useState([]);
  const [templateMealType, setTemplateMealType] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [genericResults, setGenericResults] = useState([]);
  const [brandedResults, setBrandedResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showBranded, setShowBranded] = useState(false);
  const [fuzzyFallback, setFuzzyFallback] = useState(false);
  const [myFoodsExpanded, setMyFoodsExpanded] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [showNewMealDialog, setShowNewMealDialog] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showFoodFormatGuide, setShowFoodFormatGuide] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showRecipesPanel, setShowRecipesPanel] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('templates');
  const [mealTemplateType, setMealTemplateType] = useState("lunch");
  const [mealItems, setMealItems] = useState([]);
  const [newFood, setNewFood] = useState({
    food_name: "",
    meal_type: getDefaultMealType(),
    serving_amount: 1,
    serving_unit: "serving",
    calories: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fats_grams: 0,
  });
  const [baseMacros, setBaseMacros] = useState({
    calories: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fats_grams: 0,
  });
  // Set when a USDA/barcode food is selected — stores the food's serving size in grams
  // so "serving" unit scales correctly. Null for manual/custom/recent foods.
  const [foodServingSizeGrams, setFoodServingSizeGrams] = useState(null);
  // True when the selected food came from USDA/barcode (baseMacros = per 100g).
  // False for manual entry and custom/recent foods (baseMacros = per 1 unit).
  const [isUsdaFood, setIsUsdaFood] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const queryClient = useQueryClient();
  const searchRef = useRef(null);

  // ref to autofocus the search input in the modal
  useEffect(() => {
  if (showAddDialog || showNewMealDialog) {
    const timer = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }
}, [showAddDialog, showNewMealDialog]);

  // Auto-open add dialog when navigated with ?addFood=true (e.g. from FAB)
  useEffect(() => {
    if (searchParams.get("addFood") === "true") {
      setShowAddDialog(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Debounced search — generic and branded run in parallel but are shown separately
  useEffect(() => {
    if (searchQuery.length < 2) {
      setGenericResults([]);
      setBrandedResults([]);
      setShowBranded(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [generic, branded] = await Promise.all([
          searchGenericFoods(searchQuery),
          searchBrandedFoods(searchQuery),
        ]);

        const words = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length >= 3);

        // Tier 1: strict — all words must appear in description
        const strictMatch = (food) => words.every(w => food.description.toLowerCase().includes(w));
        const strictGeneric = words.length > 0 ? generic.filter(strictMatch) : generic;
        const strictBranded = words.length > 0 ? branded.filter(strictMatch) : branded;

        if (strictGeneric.length > 0 || strictBranded.length > 0) {
          setGenericResults(strictGeneric);
          setBrandedResults(strictBranded);
          setFuzzyFallback(false);
          return;
        }

        // Tier 2: loose — any word matches
        const looseMatch = (food) => words.some(w => food.description.toLowerCase().includes(w));
        const looseGeneric = words.length > 0 ? generic.filter(looseMatch) : [];
        const looseBranded = words.length > 0 ? branded.filter(looseMatch) : [];

        if (looseGeneric.length > 0 || looseBranded.length > 0) {
          setGenericResults(looseGeneric);
          setBrandedResults(looseBranded);
          setFuzzyFallback(true);
          return;
        }

        // Tier 3: retry with just the longest word
        if (words.length > 1) {
          const keyword = words.reduce((a, b) => a.length >= b.length ? a : b);
          const [g2, b2] = await Promise.all([
            searchGenericFoods(keyword),
            searchBrandedFoods(keyword),
          ]);
          setGenericResults(g2);
          setBrandedResults(b2);
          setFuzzyFallback(g2.length > 0 || b2.length > 0);
        } else {
          setGenericResults([]);
          setBrandedResults([]);
          setFuzzyFallback(false);
        }
      } catch (error) {
        console.error("Search failed:", error);
        toast.error("Failed to search foods");
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Update displayed macros when serving amount or unit changes.
  //
  // USDA/barcode foods: baseMacros is per 100g — convert any unit to grams then divide by 100.
  // Manual/custom/recent: baseMacros is per 1 unit — g/ml use amount/100, everything else amount×1.
  useEffect(() => {
    if (baseMacros.calories <= 0 && baseMacros.protein_grams <= 0) return;
    const amount = newFood.serving_amount || 0;
    const unit = newFood.serving_unit;
    let scale;
    if (isUsdaFood) {
      const isServingLike = unit === 'serving' || unit === 'piece';
      const gramsPerUnit = isServingLike
        ? (foodServingSizeGrams ?? 100)
        : (UNIT_TO_GRAMS[unit] ?? 1);
      scale = (amount * gramsPerUnit) / 100;
    } else {
      scale = ['g', 'ml'].includes(unit) ? amount / 100 : amount;
    }
    setNewFood(prev => ({
      ...prev,
      calories: Math.round(baseMacros.calories * scale),
      protein_grams: Math.round(baseMacros.protein_grams * scale * 10) / 10,
      carbs_grams: Math.round(baseMacros.carbs_grams * scale * 10) / 10,
      fats_grams: Math.round(baseMacros.fats_grams * scale * 10) / 10,
    }));
  }, [newFood.serving_amount, newFood.serving_unit, baseMacros, isUsdaFood, foodServingSizeGrams]);

  const { profile } = useProfile();
  const { weightEntries } = useBodyWeightEntries();
  const { activePhase, phaseHistory } = useDietPhase();
  const [goalForm, setGoalForm] = useState({
    daily_calorie_goal: DEFAULT_GOALS.calories,
    daily_protein_goal: DEFAULT_GOALS.protein,
    daily_carbs_goal: DEFAULT_GOALS.carbs,
    daily_fats_goal: DEFAULT_GOALS.fats,
  });
  const [goalFormInitialized, setGoalFormInitialized] = useState(false);
  const [proteinPerLb, setProteinPerLb] = useState(0.8);

  useEffect(() => {
    if (profile && !goalFormInitialized) {
      setGoalForm({
        daily_calorie_goal: profile.daily_calorie_goal || DEFAULT_GOALS.calories,
        daily_protein_goal: profile.daily_protein_goal || DEFAULT_GOALS.protein,
        daily_carbs_goal: profile.daily_carbs_goal || DEFAULT_GOALS.carbs,
        daily_fats_goal: profile.daily_fats_goal || DEFAULT_GOALS.fats,
      });
      // Initialize protein multiplier from saved goal / current weight, or default by goal
      const goals = Array.isArray(profile.primary_goal) ? profile.primary_goal : [profile.primary_goal || ''];
      const isHighProteinGoal = goals.some(g => {
        const lower = (g || '').toLowerCase();
        return lower.includes('weight_loss') || lower.includes('muscle_gain');
      });
      const defaultMultiplier = isHighProteinGoal ? 1.0 : 0.8;
      setProteinPerLb(defaultMultiplier);
      setGoalFormInitialized(true);
    }
  }, [profile, goalFormInitialized]);

  const latestWeight = profile?.current_weight
    ?? (weightEntries.length > 0
      ? [...weightEntries].sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date))[0].weight
      : null);

  const updateGoalsMutation = useMutation({
    mutationFn: async (data) => {
      if (profile) {
        await db.entities.UserProfile.update(profile.id, data);
      }
    },
    onSuccess: () => {
      invalidateProfile(queryClient);
      toast.success("Nutrition goals updated!");
    },
    onError: () => {
      toast.error("Failed to update goals");
    },
  });

  const { data: foodEntries = [] } = useQuery({
    queryKey: queryKeys.foodEntries(selectedDate, user?.id),
    queryFn: () => db.entities.FoodEntry.filter({
      date: selectedDate,
      created_by: user.id
    }),
    enabled: !!user,
  });

  const { allFoodEntries } = useAllFoodEntries();
  const tdee = profile ? getBestTDEE(profile, latestWeight, weightEntries, allFoodEntries) : {};

  const calorieTrend = useMemo(() => {
    const base = getDailyCalorieTrend(allFoodEntries, 7);
    const currentGoal = profile?.daily_calorie_goal || 2000;
    return base.map(day => {
      // Find which phase was active on this specific day
      const dayDate = new Date(day.date + 'T12:00:00');
      const phaseForDay = phaseHistory?.find(p => {
        const start = new Date(p.created_at);
        const end = p.end_date ? new Date(p.end_date) : new Date('9999-12-31');
        return start <= dayDate && dayDate <= end;
      });
      let goal = currentGoal;
      if (phaseForDay && tdee.tdee) {
        goal = phaseForDay.phase_type === 'reverse'
          ? currentGoal
          : calculatePhaseCalories(tdee.tdee, phaseForDay.weekly_rate);
      }
      return { ...day, goal };
    });
  }, [allFoodEntries, phaseHistory, profile?.daily_calorie_goal, tdee.tdee]);

  // Recently-used foods surfaced at the top of the search panel
  const recentFoods = useMemo(() => getRecentFoods(allFoodEntries, 8), [allFoodEntries]);

  // Manual-entry macro validation: warn when P×4 + C×4 + F×9 doesn't match entered calories
  const macroCalcWarning = useMemo(() => {
    if (isUsdaFood) return null;
    const { calories, protein_grams, carbs_grams, fats_grams } = baseMacros;
    if (calories <= 0 && protein_grams <= 0 && carbs_grams <= 0 && fats_grams <= 0) return null;
    const calculated = protein_grams * 4 + carbs_grams * 4 + fats_grams * 9;
    if (calculated === 0) return null;
    const threshold = Math.max(50, calories * 0.10);
    if (Math.abs(calories - calculated) <= threshold) return null;
    return { calculated: Math.round(calculated) };
  }, [baseMacros, isUsdaFood]);

  const { customFoods } = useCustomFoods();
  const matchingCustomFoods = searchQuery.length >= 2
    ? customFoods.filter((f) =>
        f.food_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Save custom food mutation (fire-and-forget)
  const saveCustomFoodMutation = useMutation({
    mutationFn: async (food) => {
      const existing = await db.entities.CustomFood.filter({ created_by: user.id });
      const match = existing.find(
        (f) => f.food_name.toLowerCase() === food.food_name.toLowerCase()
      );
      if (match) {
        return db.entities.CustomFood.update(match.id, food);
      }
      return db.entities.CustomFood.create({ ...food, created_by: user.id });
    },
    onSuccess: () => invalidateCustomFoods(queryClient),
  });

  const handleImportFoodsCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const lines = evt.target.result.trim().split("\n").filter(Boolean);
        if (lines.length < 2) { toast.error("CSV must have a header row and at least one food."); return; }
        const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
        const nameIdx = header.indexOf("food_name");
        const calIdx = header.indexOf("calories");
        const protIdx = header.indexOf("protein_grams");
        const carbIdx = header.indexOf("carbs_grams");
        const fatIdx = header.indexOf("fats_grams");
        const unitIdx = header.indexOf("serving_unit");
        if (nameIdx === -1 || calIdx === -1) {
          toast.error("CSV must have food_name and calories columns.");
          return;
        }
        let imported = 0;
        for (const line of lines.slice(1)) {
          const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          const food_name = cols[nameIdx];
          if (!food_name) continue;
          await saveCustomFoodMutation.mutateAsync({
            food_name,
            calories: parseFloat(cols[calIdx]) || 0,
            protein_grams: protIdx >= 0 ? parseFloat(cols[protIdx]) || 0 : 0,
            carbs_grams: carbIdx >= 0 ? parseFloat(cols[carbIdx]) || 0 : 0,
            fats_grams: fatIdx >= 0 ? parseFloat(cols[fatIdx]) || 0 : 0,
            serving_size: 1,
            serving_unit: unitIdx >= 0 ? cols[unitIdx] || "serving" : "serving",
          });
          imported++;
        }
        toast.success(`${imported} food${imported !== 1 ? "s" : ""} imported to My Foods.`);
      } catch {
        toast.error("Could not read CSV file.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  // Re-log a previously logged food entry.
  // Macros are already fully scaled to the recorded serving — treat baseMacros as per-1-serving.
  const selectRecentFood = (entry) => {
    // 1. Determine original amount and unit from the entry's serving_size string/number
    const servingStr = String(entry.serving_size || "");
    const parts = servingStr.split(' ');
    const originalAmount = parseFloat(parts[0]) || (typeof entry.serving_size === 'number' ? entry.serving_size : 1);
    const originalUnit = parts.slice(1).join(' ') || entry.serving_unit || 'serving';

    // 2. Calculate the scale factor the entry used (per 100g for mass/volume, or per unit)
    const originalScale = ['g', 'ml'].includes(originalUnit) ? originalAmount / 100 : originalAmount;
    const safeScale = originalScale > 0 ? originalScale : 1;

    // 3. Normalize macros to "per 100g/ml" or "per 1 unit" so they can be re-scaled safely
    const baseMacroValues = {
      calories: Math.round((entry.calories || 0) / safeScale),
      protein_grams: Math.round(((entry.protein_grams || 0) / safeScale) * 10) / 10,
      carbs_grams: Math.round(((entry.carbs_grams || 0) / safeScale) * 10) / 10,
      fats_grams: Math.round(((entry.fats_grams || 0) / safeScale) * 10) / 10,
    };

    setFoodServingSizeGrams(null);
    setIsUsdaFood(false);
    setBaseMacros(baseMacroValues);
    setNewFood({
      ...newFood,
      food_name: entry.food_name,
      serving_unit: originalUnit,
      serving_amount: originalAmount,
      calories: Math.round(entry.calories) || 0,
      protein_grams: entry.protein_grams || 0,
      carbs_grams: entry.carbs_grams || 0,
      fats_grams: entry.fats_grams || 0,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
  };

  const selectCustomFood = (food) => {
    // Custom foods store macros per 'serving_size' units. Normalize to per-100 or per-1.
    const originalAmount = food.serving_size || 1;
    const originalUnit = food.serving_unit || "serving";
    
    const originalScale = ['g', 'ml'].includes(originalUnit) ? originalAmount / 100 : originalAmount;
    const safeScale = originalScale > 0 ? originalScale : 1;

    const baseMacroValues = {
      calories: Math.round((food.calories || 0) / safeScale),
      protein_grams: Math.round(((food.protein_grams || 0) / safeScale) * 10) / 10,
      carbs_grams: Math.round(((food.carbs_grams || 0) / safeScale) * 10) / 10,
      fats_grams: Math.round(((food.fats_grams || 0) / safeScale) * 10) / 10,
    };

    setFoodServingSizeGrams(null);
    setIsUsdaFood(false);
    setBaseMacros(baseMacroValues);
    
    // Set default amount: 100 for g/ml, otherwise 1
    const defaultAmount = ['g', 'ml'].includes(originalUnit) ? 100 : 1;
    const defaultScale = ['g', 'ml'].includes(originalUnit) ? 1 : 1; // 100/100 or 1/1

    setNewFood({
      ...newFood,
      food_name: food.food_name,
      serving_unit: originalUnit,
      serving_amount: defaultAmount,
      calories: Math.round(baseMacroValues.calories * defaultScale),
      protein_grams: Math.round(baseMacroValues.protein_grams * defaultScale * 10) / 10,
      carbs_grams: Math.round(baseMacroValues.carbs_grams * defaultScale * 10) / 10,
      fats_grams: Math.round(baseMacroValues.fats_grams * defaultScale * 10) / 10,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
  };

  const addCurrentFoodToMeal = () => {
  if (!newFood.food_name) {
    toast.error("Select or enter a food first");
    return;
  }

  const item = {
    id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    food_name: newFood.food_name,
    meal_type: mealTemplateType,
    serving_size: `${newFood.serving_amount} ${newFood.serving_unit}`,
    serving_amount: newFood.serving_amount,
    serving_unit: newFood.serving_unit,
    calories: Math.round(newFood.calories),
    protein_grams: Number(newFood.protein_grams) || 0,
    carbs_grams: Number(newFood.carbs_grams) || 0,
    fats_grams: Number(newFood.fats_grams) || 0,
  };

  if (newFood.food_name && baseMacros.calories > 0) {
    saveCustomFoodMutation.mutate({
      food_name: newFood.food_name,
      serving_size: ['g', 'ml'].includes(newFood.serving_unit) ? 100 : 1,
      serving_unit: newFood.serving_unit,
      calories: Math.round(baseMacros.calories),
      protein_grams: Math.round(baseMacros.protein_grams * 10) / 10,
      carbs_grams: Math.round(baseMacros.carbs_grams * 10) / 10,
      fats_grams: Math.round(baseMacros.fats_grams * 10) / 10,
    });
  }

  setMealItems((prev) => [...prev, item]);
  resetForm();
  toast.success("Added to meal");
};

const removeMealItem = (id) => {
  setMealItems((prev) => prev.filter((item) => item.id !== id));
};

const mealTotals = useMemo(() => {
  return mealItems.reduce(
    (acc, item) => {
      acc.calories += Number(item.calories) || 0;
      acc.protein_grams += Number(item.protein_grams) || 0;
      acc.carbs_grams += Number(item.carbs_grams) || 0;
      acc.fats_grams += Number(item.fats_grams) || 0;
      return acc;
    },
    {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fats_grams: 0,
    }
  );
}, [mealItems]);

const handleSaveMealTemplate = () => {
  if (!mealItems.length) {
    toast.error("Add at least one food");
    return;
  }

  setTemplateEntries(mealItems);
  setTemplateMealType(mealTemplateType);
  setShowNewMealDialog(false);
  setShowSaveTemplateDialog(true);
};

  const addFoodMutation = useMutation({
    mutationFn: async (data) => {
      await db.entities.FoodEntry.create({
        food_name: data.food_name,
        meal_type: data.meal_type,
        serving_size: parseFloat(data.serving_amount) || 1,
        serving_unit: data.serving_unit,
        calories: Math.round(data.calories),
        protein_grams: data.protein_grams,
        carbs_grams: data.carbs_grams,
        fats_grams: data.fats_grams,
        date: selectedDate,
        created_by: user.id
      });
    },
    onSuccess: () => {
      invalidateFood(queryClient);
      setShowAddDialog(false);
      resetForm();
      toast.success("Food logged successfully!");
    },
    onError: () => {
      toast.error("Failed to log food");
    }
  });

  const deleteFoodMutation = useMutation({
    mutationFn: async (id) => {
      await db.entities.FoodEntry.delete(id);
    },
    onSuccess: () => {
      invalidateFood(queryClient);
      toast.success("Entry deleted");
    },
  });

  // Check off a planned (weekly-meal-plan) item → flips planned:false so it counts
  // as eaten toward today's macros.
  const togglePlannedMutation = useMutation({
    mutationFn: async (id) => {
      await db.entities.FoodEntry.update(id, { planned: false });
    },
    onSuccess: () => {
      invalidateFood(queryClient);
      toast.success("Logged ✓");
    },
    onError: () => toast.error("Failed to log"),
  });

  const updateFoodMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await db.entities.FoodEntry.update(id, {
        food_name: data.food_name,
        meal_type: data.meal_type,
        serving_size: parseFloat(data.serving_amount) || 1,
        serving_unit: data.serving_unit,
        calories: Math.round(data.calories),
        protein_grams: data.protein_grams,
        carbs_grams: data.carbs_grams,
        fats_grams: data.fats_grams,
        date: selectedDate,
      });
    },
    onSuccess: () => {
      invalidateFood(queryClient);
      setShowAddDialog(false);
      resetForm();
      toast.success("Food entry updated!");
    },
    onError: () => {
      toast.error("Failed to update food entry");
    },
  });

  const startEditEntry = (entry) => {
    // Handle both string ("300 g") and numeric (300) serving_size from DB
    const servingStr = String(entry.serving_size || "");
    const parts = servingStr.split(' ');
    const amount = parseFloat(parts[0]) || (typeof entry.serving_size === 'number' ? entry.serving_size : 1);
    const unit = parts.slice(1).join(' ') || entry.serving_unit || 'serving';
    
    const scale = ['g', 'ml'].includes(unit) ? amount / 100 : amount;
    const safeScale = scale > 0 ? scale : 1;
    const baseMacroValues = {
      calories: Math.round((entry.calories || 0) / safeScale),
      protein_grams: Math.round(((entry.protein_grams || 0) / safeScale) * 10) / 10,
      carbs_grams: Math.round(((entry.carbs_grams || 0) / safeScale) * 10) / 10,
      fats_grams: Math.round(((entry.fats_grams || 0) / safeScale) * 10) / 10,
    };
    setIsUsdaFood(false);
    setFoodServingSizeGrams(null);
    setBaseMacros(baseMacroValues);
    setNewFood({
      food_name: entry.food_name,
      meal_type: entry.meal_type,
      serving_amount: amount,
      serving_unit: unit,
      calories: entry.calories || 0,
      protein_grams: entry.protein_grams || 0,
      carbs_grams: entry.carbs_grams || 0,
      fats_grams: entry.fats_grams || 0,
    });
    setSelectedDate(entry.date || format(new Date(), "yyyy-MM-dd"));
    setEditingEntry(entry);
    setShowAddDialog(true);
  };

  const resetForm = () => {
    setNewFood({
      food_name: "",
      meal_type: getDefaultMealType(),
      serving_amount: 1,
      serving_unit: "serving",
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fats_grams: 0,
    });
    setBaseMacros({ calories: 0, protein_grams: 0, carbs_grams: 0, fats_grams: 0 });
    setFoodServingSizeGrams(null);
    setIsUsdaFood(false);
    setSearchQuery("");
    setGenericResults([]); setBrandedResults([]);
    setEditingEntry(null);
  };

  const selectFood = (food) => {
    // baseMacros always stored per 100g (USDA/barcode nutrient basis)
    const baseMacroValues = {
      calories: Math.round(food.calories),
      protein_grams: Math.round(food.protein * 10) / 10,
      carbs_grams: Math.round(food.carbs * 10) / 10,
      fats_grams: Math.round(food.fats * 10) / 10,
    };
    // Default unit: ml for liquids, otherwise g
    const unit = food.servingSizeUnit?.toLowerCase() === 'ml' ? 'ml' : 'g';
    // Default amount = food's actual serving size from the database
    const servingG = food.servingSize || 100;
    const initialScale = servingG / 100;

    setFoodServingSizeGrams(servingG);
    setIsUsdaFood(true);
    setBaseMacros(baseMacroValues);
    setNewFood({
      ...newFood,
      food_name: food.description.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      serving_unit: unit,
      serving_amount: servingG,
      calories: Math.round(baseMacroValues.calories * initialScale),
      protein_grams: Math.round(baseMacroValues.protein_grams * initialScale * 10) / 10,
      carbs_grams: Math.round(baseMacroValues.carbs_grams * initialScale * 10) / 10,
      fats_grams: Math.round(baseMacroValues.fats_grams * initialScale * 10) / 10,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
  };

  // Consumed macros count only EATEN entries — planned (not-yet-checked-off) plan
  // items are shown in the list but don't inflate today's intake until checked.
  const eatenEntries = foodEntries.filter((e) => !e.planned);
  const plannedCount = foodEntries.length - eatenEntries.length;
  const totals = calculateMacros(eatenEntries);

  const mealGroups = {
    breakfast: foodEntries.filter(e => e.meal_type === "breakfast"),
    lunch: foodEntries.filter(e => e.meal_type === "lunch"),
    dinner: foodEntries.filter(e => e.meal_type === "dinner"),
    snack: foodEntries.filter(e => e.meal_type === "snack"),
  };

  const MacroCard = ({ label, value, goal, ringColor, unit = "g", compact = false }) => {
    const percentage = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
    const remaining = Math.round(goal - value);
    const isOver = remaining < 0;
    const size = compact ? 60 : 80;
    const strokeWidth = compact ? 5 : 7;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const progressLength = (percentage / 100) * circumference;

    if (compact) {
      return (
        <div className="flex flex-col items-center">
          <div className="text-xs text-slate-400 mb-2">{label}</div>
          <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size}>
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke="#2a2a2a" strokeWidth={strokeWidth} fill="none"
              />
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke={isOver ? "#ef4444" : ringColor}
                strokeWidth={strokeWidth} fill="none"
                strokeDasharray={`${progressLength} ${circumference - progressLength}`}
                strokeLinecap="round"
                style={{
                  transform: "rotate(-90deg)",
                  transformOrigin: "center",
                  transition: "stroke-dasharray 0.5s ease-in-out",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-white ">{Math.round(percentage)}%</span>
            </div>
          </div>
          <div className="mt-2 text-center">
            <div className={`text-lg font-bold ${isOver ? "text-[#f87171]" : "text-white"}`}>
              {Math.abs(remaining)}{unit}
            </div>
            <div className="text-xs text-slate-500">{isOver ? "over" : "left"}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {Math.round(value)} / {goal}{unit}
            </div>
          </div>
        </div>
      );
    }

    return (
      <Card className="">
        <CardContent className="pt-6">
          <div className="text-sm text-slate-400 mb-3">{label}</div>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size}>
                <circle
                  cx={size / 2} cy={size / 2} r={radius}
                  stroke="#2a2a2a" strokeWidth={strokeWidth} fill="none"
                />
                <circle
                  cx={size / 2} cy={size / 2} r={radius}
                  stroke={isOver ? "#ef4444" : ringColor}
                  strokeWidth={strokeWidth} fill="none"
                  strokeDasharray={`${progressLength} ${circumference - progressLength}`}
                  strokeLinecap="round"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                    transition: "stroke-dasharray 0.5s ease-in-out",
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white ">{Math.round(percentage)}%</span>
              </div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${isOver ? "text-[#f87171]" : "text-white"}`}>
                {Math.abs(remaining)}{unit}
              </div>
              <div className="text-xs text-slate-500">{isOver ? "over" : "remaining"}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {Math.round(value)} / {goal}{unit}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand/30"></div>
      </div>
    );
  }

  const changeDate = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
  };


  return (
    <div className="bg-charcoal text-white min-h-screen">

      {/* Date navigation + action bar */}
      <div className="sticky top-[var(--layout-header-height,0px)] z-20 border-b border-charcoal-border bg-charcoal/95 backdrop-blur-md px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => changeDate(-1)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-charcoal-surface transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent border-none text-sm font-semibold text-white focus:outline-none cursor-pointer font-mono"
          />
          <button
            onClick={() => changeDate(1)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-charcoal-surface transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
            className="text-xs text-slate-500 hover:text-brand transition-colors ml-1 hidden sm:block"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="energy"
            size="sm"
            onClick={() => { resetForm(); setShowAddDialog(true); }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Food
          </Button>

          <Button
            variant="dim"
            size="sm"
            className="hidden sm:flex"
            onClick={() => { resetForm(); setMealItems([]); setMealTemplateType("lunch"); setShowNewMealDialog(true); }}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            New Meal
          </Button>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex items-start">

        {/* ── Main scrollable content ── */}
        <div className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-3 py-3 space-y-3.5">

            {/* Calorie ring + macro progress bars */}
            {(() => {
              const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');
              const calsConsumed = totals.calories;
              const calsGoal = profile?.daily_calorie_goal || 2000;
              const calsRemaining = calsGoal - calsConsumed;
              const calsPct = Math.min(1, calsConsumed / calsGoal);
              const macroRows = [
                { label: 'Protein', consumed: totals.protein, goal: profile?.daily_protein_goal || 150, unit: 'g', barColor: 'bg-sky-400', textColor: 'text-sky-400' },
                { label: 'Carbohydrates', consumed: totals.carbs, goal: profile?.daily_carbs_goal || 200, unit: 'g', barColor: 'bg-amber-500', textColor: 'text-amber-500' },
                { label: 'Dietary Fats', consumed: totals.fats, goal: profile?.daily_fats_goal || 65, unit: 'g', barColor: 'bg-emerald-500', textColor: 'text-emerald-500' },
              ];
              return (
                <div className="flex items-center gap-5 md:gap-8 p-5 rounded-xl border border-charcoal-border bg-charcoal-surface shadow-dark-card" data-tutorial="nutrition-rings">
                  {/* Calorie ring */}
                  <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
                    <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="50" cy="50" r="40" stroke="#161622" strokeWidth="6" fill="transparent" />
                      <circle
                        cx="50" cy="50" r="40"
                        stroke={calsConsumed > calsGoal ? '#f43f5e' : 'var(--color-brand)'}
                        strokeWidth="6"
                        fill="transparent"
                        strokeDasharray={`${calsPct * (2 * Math.PI * 40)} ${2 * Math.PI * 40}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-technical text-2xl font-bold leading-none text-white">
                        {isToday ? Math.abs(Math.round(calsRemaining)) : Math.round(calsConsumed)}
                      </span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase mt-1 tracking-widest leading-none">
                        {isToday ? (calsRemaining < 0 ? 'over' : 'remaining') : 'consumed'}
                      </span>
                    </div>
                  </div>
                  {/* Macro bars */}
                  <div className="flex-1 space-y-3.5 min-w-0">
                    {macroRows.map(({ label, consumed, goal, unit, barColor, textColor }) => {
                      const pct = goal > 0 ? Math.min(100, Math.round((consumed / goal) * 100)) : 0;
                      return (
                        <div key={label} className="space-y-1">
                          <div className="flex justify-between items-end gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</span>
                            {isToday ? (
                              <span className={`font-technical text-xs font-semibold shrink-0 ${textColor}`}>{Math.round(consumed)}<span className="text-[10px] text-slate-500 font-normal">/{goal}{unit}</span></span>
                            ) : (
                              <span className={`font-technical text-xs font-semibold shrink-0 ${textColor}`}>{Math.round(consumed)}{unit}</span>
                            )}
                          </div>
                          {isToday && (
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div className={`${barColor} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
 
 
            {/* Planned (meal-plan) items waiting to be checked off */}
            {plannedCount > 0 && (
              <div className="mb-3 flex items-center gap-2.5 rounded-xl glass px-4 py-2.5 text-xs">
                <span className="w-5 h-5 rounded-full border-2 border-brand/50 shrink-0" />
                <span className="text-slate-300">
                  <span className="text-brand font-semibold">{plannedCount} planned item{plannedCount !== 1 ? 's' : ''}</span> from your weekly plan — tap the circle to check each off as you eat it.
                </span>
              </div>
            )}

            {/* Numbered meal sections */}
            <div className="space-y-4">
              {[
                { mealType: 'breakfast', label: '01. BREAKFAST' },
                { mealType: 'lunch',     label: '02. LUNCH' },
                { mealType: 'dinner',    label: '03. DINNER' },
                { mealType: 'snack',     label: '04. SNACK' },
              ].map(({ mealType, label }) => {
                const entries = mealGroups[mealType];
                const mealCals = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
                const hasEntries = entries.length > 0;
                return (
                  <section key={mealType} className="rounded-xl bg-charcoal-surface border border-charcoal-border overflow-hidden shadow-dark-card transition-all duration-300 hover:border-slate-800">
                    {/* Meal header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-charcoal-border">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${hasEntries ? 'bg-brand' : 'bg-slate-800'}`} />
                        <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-slate-400">{label}</h3>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {hasEntries && (
                          <button
                            onClick={() => { setTemplateEntries(entries); setTemplateMealType(mealType); setShowSaveTemplateDialog(true); }}
                            className="text-slate-500 hover:text-brand transition-colors"
                            title="Save as template"
                          >
                            <Bookmark className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className="font-technical text-sm font-bold text-slate-300">
                          {mealCals} <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-0.5">kcal</span>
                        </span>
                      </div>
                    </div>
 
                    {/* Food rows */}
                    {hasEntries ? (
                      <>
                        {entries.map((entry, i) => (
                          <div
                            key={entry.id}
                            className={`grid grid-cols-12 gap-2 md:gap-3 py-3 px-4 border-b border-charcoal-border/30 hover:bg-charcoal-surface2/60 transition-colors group ${entry.planned ? 'border-l-2 border-l-brand/50 bg-brand/[3%]' : i % 2 === 1 ? 'bg-charcoal-surface2/10' : ''}`}
                          >
                            <div className="col-span-6 md:col-span-7 flex items-center gap-2.5 min-w-0">
                              {entry.planned && (
                                <button
                                  onClick={() => togglePlannedMutation.mutate(entry.id)}
                                  title="Mark as eaten"
                                  aria-label="Mark as eaten"
                                  className="shrink-0 w-5 h-5 rounded-full border-2 border-brand/50 text-brand flex items-center justify-center hover:bg-brand/20 hover:border-brand transition-colors"
                                />
                              )}
                              <div className="flex flex-col min-w-0 justify-center">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={`text-sm font-semibold tracking-tight truncate ${entry.planned ? 'text-slate-400' : 'text-white'}`}>{entry.food_name}</span>
                                  {entry.tag && (
                                    <span className={`shrink-0 text-[8px] uppercase tracking-wider font-bold px-1 py-0.5 rounded ${entry.tag === 'pre' ? 'text-sky-300 bg-sky-500/15' : 'text-emerald-300 bg-emerald-500/15'}`}>
                                      {entry.tag === 'pre' ? 'Pre-WO' : 'Post-WO'}
                                    </span>
                                  )}
                                </div>
                                {entry.serving_size != null && (
                                  <span className={`text-[10px] font-technical mt-0.5 font-medium ${entry.planned ? 'text-slate-600' : 'text-brand'}`}>
                                    {entry.serving_size}{entry.serving_unit ? ` ${entry.serving_unit}` : ''}{entry.planned ? ' · planned' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className={`col-span-5 md:col-span-4 grid grid-cols-4 gap-1 text-right items-center ${entry.planned ? 'opacity-45' : ''}`}>
                              <div className="flex flex-col">
                                <span className="font-technical text-xs font-bold text-white">{entry.calories}</span>
                                <span className="text-[8px] uppercase text-slate-500 font-bold tracking-wider leading-none mt-0.5">Cal</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="font-technical text-xs font-bold text-sky-400">{entry.protein_grams}</span>
                                <span className="text-[8px] uppercase text-slate-500 font-bold tracking-wider leading-none mt-0.5">Pro</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="font-technical text-xs font-bold text-amber-500">{entry.carbs_grams}</span>
                                <span className="text-[8px] uppercase text-slate-500 font-bold tracking-wider leading-none mt-0.5">Car</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="font-technical text-xs font-bold text-emerald-500">{entry.fats_grams}</span>
                                <span className="text-[8px] uppercase text-slate-500 font-bold tracking-wider leading-none mt-0.5">Fat</span>
                              </div>
                            </div>
                            <div className="col-span-1 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEditEntry(entry)} className="p-1 text-slate-500 hover:text-brand transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteFoodMutation.mutate(entry.id)} className="p-1 text-slate-500 hover:text-rose-500 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          className="w-full py-2.5 flex items-center justify-center gap-1.5 text-slate-400 hover:text-brand hover:bg-charcoal-surface2/60 transition-colors"
                          onClick={() => {
                            setNewFood(prev => ({ ...prev, meal_type: mealType }));
                            setShowAddDialog(true);
                          }}
                        >
                          <Plus className="w-3 h-3" />
                          <span className="text-xs font-bold tracking-widest uppercase">Add Item</span>
                        </button>
                      </>
                    ) : (
                      <button
                        className="w-full py-4 flex items-center justify-center gap-2 text-slate-500 hover:text-brand hover:bg-charcoal-surface2/60 transition-colors group"
                        onClick={() => {
                          setNewFood(prev => ({ ...prev, meal_type: mealType }));
                          setShowAddDialog(true);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 text-slate-600 group-hover:text-brand" />
                        <span className="text-xs font-bold tracking-widest uppercase text-slate-500 group-hover:text-brand">Add Item</span>
                      </button>
                    )}
                  </section>
                );
              })}
            </div>

            {/* Save full day as template */}
            {foodEntries.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => { setTemplateEntries(foodEntries); setTemplateMealType(null); setShowSaveTemplateDialog(true); }}
                  className="flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase border border-dashed border-charcoal-border rounded-xl px-4 py-2.5 text-slate-500 hover:text-brand hover:border-brand/40 transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Day as Template
                </button>
              </div>
            )}

            {/* Mobile: sidebar content shown below meals */}
            <div className="lg:hidden space-y-4 pt-2">
              {/* Goals card */}
              <div className="rounded-xl border border-charcoal-border bg-charcoal-surface p-4 shadow-dark-card">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold tracking-widest text-brand uppercase">NUTRITION GOALS</span>
                  <button onClick={() => setShowGoalsModal(true)} className="text-slate-400 hover:text-white transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  {[
                    { label: 'Calories', value: profile?.daily_calorie_goal || 2000, unit: 'kcal' },
                    { label: 'Protein', value: profile?.daily_protein_goal || 150, unit: 'g' },
                    { label: 'Carbs', value: profile?.daily_carbs_goal || 200, unit: 'g' },
                    { label: 'Fats', value: profile?.daily_fats_goal || 65, unit: 'g' },
                  ].map(({ label, value, unit }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 uppercase font-bold">{label}</span>
                      <span className="font-technical text-xs font-bold text-white">{value}<span className="opacity-50 font-normal ml-0.5 text-xs">{unit}</span></span>
                    </div>
                  ))}
                </div>
              </div>
              <MealTemplates compact />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-widest text-slate-500 uppercase">Recipes</span>
                  <button onClick={() => setShowNewRecipe(true)} className="flex items-center gap-1 text-xs font-bold text-brand uppercase tracking-widest">
                    <Plus className="w-3 h-3" />New
                  </button>
                </div>
                <RecipeBuilder compact showCreateDialog={showNewRecipe} onCreateDialogChange={setShowNewRecipe} />
              </div>
              <MealPlanIdeas
                allFoodEntries={allFoodEntries}
                calorieGoal={profile?.daily_calorie_goal}
                proteinGoal={profile?.daily_protein_goal}
                carbsGoal={profile?.daily_carbs_goal}
                fatsGoal={profile?.daily_fats_goal}
              />
            </div>

          </div>
        </div>

        {/* ── Desktop sidebar ── */}
        <aside
          className="hidden lg:flex flex-col w-[500px] shrink-0 border-l border-charcoal-border bg-charcoal-surface bg-charcoal-surface/20 sticky z-10"
          style={{ top: 'var(--layout-header-height, 0px)', height: 'calc(100vh - var(--layout-header-height, 0px))' }}
        >
          {/* ── Pinned top: Trend + Goals + check-in ── */}
          <div className="shrink-0 p-4 space-y-3 border-b border-charcoal-border">

            {/* 7-day trend — always visible at top */}
            <div className="rounded-xl border border-charcoal-border bg-charcoal-surface px-3 pt-3 pb-1">
              <div className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">7-Day Trend</div>
              {calorieTrend.some(d => d.calories > 0) ? (
                <div className="w-full">
                  <ResponsiveContainer width="100%" height={112}>
                    <LineChart data={calorieTrend} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="glass glass-interactive rounded-lg px-2.5 py-1.5 shadow text-xs text-slate-400 space-y-0.5">
                              <p className="font-semibold">{d.label}</p>
                              <p className="text-brand">{d.calories} cal eaten</p>
                              {d.goal > 0 && <p className="text-slate-400">Goal: {d.goal} cal</p>}
                            </div>
                          );
                        }}
                      />
                      {/* Per-day goal as a dashed line */}
                      <Line type="monotone" dataKey="goal" stroke="#4b5563" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                      <Line type="monotone" dataKey="calories" stroke="var(--color-brand)" strokeWidth={2} dot={{ fill: "var(--color-brand)", r: 2.5 }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-16 flex items-center justify-center text-xs text-slate-400">
                  Log food for a few days to see your trend
                </div>
              )}
            </div>

            {/* Goals card with phase info */}
            <div className="rounded-xl border border-charcoal-border bg-charcoal-surface p-4 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-widest text-brand uppercase">Nutrition Goals</span>
                  {activePhase && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      activePhase.phase_type === 'cut'     ? 'bg-[rgba(59,130,246,0.1)] text-[#60a5fa]'
                      : activePhase.phase_type === 'bulk'  ? 'bg-[rgba(34,197,94,0.1)] text-[#4ade80]'
                      : 'bg-charcoal-elevated text-slate-400 bg-charcoal-elevated text-slate-400'
                    }`}>
                      {activePhase.phase_type === 'cut' ? 'Cut' : activePhase.phase_type === 'bulk' ? 'Bulk' : activePhase.phase_type === 'reverse' ? 'Reverse' : 'Maintain'}
                      {' '}·{' '}
                      {activePhase.phase_type === 'reverse'
                        ? `+${activePhase.weekly_rate} cal/wk`
                        : `${activePhase.weekly_rate > 0 ? '+' : ''}${activePhase.weekly_rate} ${profile?.weight_unit || 'lbs'}/wk`}
                    </span>
                  )}
                </div>
                <button onClick={() => setShowGoalsModal(true)} className="text-slate-400 hover:text-white transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  { label: 'Calories', value: profile?.daily_calorie_goal || 2000, unit: 'kcal' },
                  { label: 'Protein',  value: profile?.daily_protein_goal  || 150,  unit: 'g' },
                  { label: 'Carbs',    value: profile?.daily_carbs_goal    || 200,  unit: 'g' },
                  { label: 'Fats',     value: profile?.daily_fats_goal     || 65,   unit: 'g' },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 uppercase font-semibold">{label}</span>
                    <span className="font-technical text-xs font-bold text-white">{value}<span className="opacity-40 font-normal ml-0.5 text-xs">{unit}</span></span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => !tdee.tdee ? setShowStatsModal(true) : setShowGoalsModal(true)}
                className="mt-3 w-full py-1.5 border border-dashed border-charcoal-border rounded-lg text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-brand hover:text-brand hover:border-brand/40 transition-all"
              >
                {!tdee.tdee ? 'Set up TDEE' : 'Edit Goals'}
              </button>
              <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-brand/[5%] rounded-full blur-2xl pointer-events-none" />
            </div>

          </div>

          {/* ── Tab bar: Templates | Recipes | Ideas ── */}
          <div className="shrink-0 flex border-b border-charcoal-border bg-charcoal-surface bg-charcoal-surface/20">
            {[
              { id: 'templates', label: 'Templates' },
              { id: 'recipes',   label: 'Recipes' },
              { id: 'ideas',     label: 'Ideas' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
                  sidebarTab === tab.id
                    ? 'border-brand/30 text-brand'
                    : 'border-transparent text-slate-400 hover:text-white'
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
                    className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-brand hover:text-brand transition-colors"
                  >
                    <Plus className="w-3 h-3" />New Recipe
                  </button>
                </div>
                <RecipeBuilder compact showCreateDialog={showNewRecipe} onCreateDialogChange={setShowNewRecipe} />
              </div>
            )}

            {sidebarTab === 'ideas' && (
              <MealPlanIdeas
                allFoodEntries={allFoodEntries}
                calorieGoal={profile?.daily_calorie_goal}
                proteinGoal={profile?.daily_protein_goal}
                carbsGoal={profile?.daily_carbs_goal}
                fatsGoal={profile?.daily_fats_goal}
              />
            )}
          </div>
        </aside>
      </div>

      {/* ─── Add / Edit Food Dialog ─── */}
      {showAddDialog && (
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            resetForm();
            setSelectedDate(format(new Date(), "yyyy-MM-dd"));
          }
        }}>
          <DialogContent className="max-w-lg flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle>{editingEntry ? "Edit Food Entry" : "Add Food Entry"}</DialogTitle>
            </DialogHeader>

              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div>
                  <div className="mb-3">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="border-none bg-transparent focus:outline-none w-full"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="search">Search USDA Database</Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="search"
                        ref={searchRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search for a food..."
                        className="pl-10 pr-3"
                      />
                      {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBarcodeScanner(true)}
                      className="flex items-center gap-1.5 px-3 h-10 rounded-md border border-charcoal-border bg-charcoal-surface text-slate-400 hover:text-brand hover:border-brand/40 transition-colors shrink-0"
                      aria-label="Scan barcode"
                      title="Scan a barcode"
                    >
                      <Camera className="w-4 h-4" />
                      <span className="text-xs font-medium hidden sm:inline">Scan</span>
                    </button>
                  </div>

                      {/* Search results: My Foods → Generic → Branded */}
                      {fuzzyFallback && (genericResults.length > 0 || brandedResults.length > 0) && (
                        <p className="mt-1.5 text-xs text-[#fbbf24] px-1">Showing approximate results for "{searchQuery}"</p>
                      )}
                      {(matchingCustomFoods.length > 0 || genericResults.length > 0) && (
                        <div className="mt-2 max-h-64 overflow-y-auto border rounded-lg bg-charcoal-surface divide-y divide-charcoal-border">
                          {/* My saved foods */}
                          {matchingCustomFoods.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-[rgba(245,158,11,0.08)] text-xs font-semibold text-[#fbbf24] flex items-center gap-1 sticky top-0">
                                <Star className="w-3 h-3 fill-amber-500" /> My Foods
                              </div>
                              {matchingCustomFoods.map((food) => (
                                <button key={food.id} onClick={() => selectCustomFood(food)} className="w-full text-left px-4 py-2.5 hover:bg-[rgba(245,158,11,0.08)] transition-colors">
                                  <div className="font-medium text-white text-sm">{food.food_name}</div>
                                  <div className="flex gap-3 mt-0.5 text-xs text-slate-500">{Math.round(food.calories)} cal · P {Math.round(food.protein_grams)}g · C {Math.round(food.carbs_grams)}g · F {Math.round(food.fats_grams)}g</div>
                                </button>
                              ))}
                            </>
                          )}
                          {/* Generic whole foods (Foundation + SR Legacy) */}
                          {genericResults.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-slate-500 sticky top-0">
                                Generic Foods
                              </div>
                              {genericResults.map((food) => (
                                <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-2.5 hover:bg-charcoal-surface hover:bg-charcoal-elevated transition-colors">
                                  <div className="font-medium text-white text-sm">{food.description}</div>
                                  <div className="flex gap-3 mt-0.5 text-xs text-slate-500">{Math.round(food.calories)} cal / 100g · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fats)}g</div>
                                </button>
                              ))}
                            </>
                          )}
                          {/* Branded foods — collapsed by default */}
                          {brandedResults.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setShowBranded(v => !v)}
                                className="w-full px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-slate-500 flex items-center justify-between sticky top-0 hover:bg-charcoal-elevated hover:bg-charcoal-elevated transition-colors"
                              >
                                <span>Branded Foods ({brandedResults.length})</span>
                                {showBranded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              {showBranded && brandedResults.map((food) => (
                                <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-2.5 hover:bg-charcoal-surface hover:bg-charcoal-elevated transition-colors">
                                  <div className="font-medium text-white text-sm">{food.description}</div>
                                  {food.brandOwner && <div className="text-xs text-slate-400">{food.brandOwner}</div>}
                                  <div className="flex gap-3 mt-0.5 text-xs text-slate-500">{Math.round(food.calories)} cal · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fats)}g</div>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* When not searching and no food selected: show Recent Foods + My Foods */}
                    {searchQuery.length < 2 && !newFood.food_name && (
                      <div className="space-y-3">
                        {recentFoods.length > 0 && (
                          <div className="border rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setRecentExpanded(!recentExpanded)}
                              className="w-full px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-slate-500 flex items-center justify-between hover:bg-charcoal-elevated hover:bg-charcoal-elevated transition-colors"
                            >
                              <span>Recent</span>
                              {recentExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {recentExpanded && recentFoods.map((entry, i) => (
                              <button key={i} onClick={() => selectRecentFood(entry)} className="w-full text-left px-4 py-2.5 hover:bg-charcoal-surface hover:bg-charcoal-elevated border-b last:border-b-0 transition-colors">
                                <div className="font-medium text-white text-sm">{entry.food_name}</div>
                                <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                                  {entry.serving_size && <span>{entry.serving_size} · </span>}
                                  {Math.round(entry.calories)} cal · P {Math.round(entry.protein_grams)}g · C {Math.round(entry.carbs_grams)}g · F {Math.round(entry.fats_grams)}g
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-[#fbbf24] flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-500" /> My Foods
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => document.getElementById("import-foods-csv-input").click()}
                              className="text-xs text-slate-500 hover:text-brand flex items-center gap-1"
                              title="Import foods from CSV"
                            >
                              <Upload className="w-3 h-3" /> Import CSV
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowFoodFormatGuide(true)}
                              className="text-slate-400 hover:text-brand"
                              title="CSV format guide"
                            >
                              <HelpCircle className="w-3 h-3" />
                            </button>
                          </div>
                          <input
                            id="import-foods-csv-input"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportFoodsCSV}
                          />
                        </div>
                        {customFoods.length > 0 && (
                          <div className="border rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setMyFoodsExpanded(!myFoodsExpanded)}
                              className="w-full px-3 py-1.5 bg-[rgba(245,158,11,0.08)] text-xs font-semibold text-[#fbbf24] flex items-center justify-between hover:bg-[rgba(245,158,11,0.12)] transition-colors"
                            >
                              <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-500" /> My Foods ({customFoods.length})</span>
                              {myFoodsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {myFoodsExpanded && (
                              <div className="max-h-36 overflow-y-auto">
                                {customFoods.map((food) => (
                                  <button key={food.id} onClick={() => selectCustomFood(food)} className="w-full text-left px-4 py-2.5 hover:bg-[rgba(245,158,11,0.08)] border-b last:border-b-0 transition-colors">
                                    <div className="font-medium text-white text-sm">{food.food_name}</div>
                                    <div className="flex gap-3 mt-0.5 text-xs text-slate-500">{Math.round(food.calories)} cal · P {Math.round(food.protein_grams)}g · C {Math.round(food.carbs_grams)}g · F {Math.round(food.fats_grams)}g</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <p className="text-xs text-slate-500 mb-3">Or enter manually:</p>

                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="food_name">Food Name *</Label>
                          <Input
                            id="food_name"
                            value={newFood.food_name}
                            onChange={(e) => setNewFood({ ...newFood, food_name: e.target.value })}
                            placeholder="e.g., Chicken Breast"
                            className="mt-1"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="meal_type">Meal Type *</Label>
                            <Select
                              value={newFood.meal_type}
                              onValueChange={(value) => setNewFood({ ...newFood, meal_type: value })}
                            >
                              <SelectTrigger className="mt-1">
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

                          <div>
                            <Label>Amount</Label>
                            <div className="flex gap-2 mt-1">
                              <Input
                                type="number"
                                value={newFood.serving_amount}
                                onChange={(e) => setNewFood({ ...newFood, serving_amount: e.target.value })}
                                min="0"
                                step="0.5"
                                className="w-20"
                              />
                              <Select
                                value={newFood.serving_unit}
                                onValueChange={(value) => {
                                  if (isUsdaFood) {
                                    // Convert amount so the same mass is preserved across unit switches
                                    const isServingLike = (u) => u === 'serving' || u === 'piece';
                                    const fromG = isServingLike(newFood.serving_unit)
                                      ? newFood.serving_amount * (foodServingSizeGrams ?? 100)
                                      : newFood.serving_amount * (UNIT_TO_GRAMS[newFood.serving_unit] ?? 1);
                                    const toPerUnit = isServingLike(value)
                                      ? (foodServingSizeGrams ?? 100)
                                      : (UNIT_TO_GRAMS[value] ?? 1);
                                    const newAmount = Math.round((fromG / toPerUnit) * 100) / 100;
                                    setNewFood(prev => ({ ...prev, serving_unit: value, serving_amount: newAmount }));
                                  } else {
                                    setNewFood(prev => ({ ...prev, serving_unit: value }));
                                  }
                                }}
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="serving">serving(s)</SelectItem>
                                  <SelectItem value="g">grams</SelectItem>
                                  <SelectItem value="oz">oz</SelectItem>
                                  <SelectItem value="cup">cup(s)</SelectItem>
                                  <SelectItem value="tbsp">tbsp</SelectItem>
                                  <SelectItem value="tsp">tsp</SelectItem>
                                  <SelectItem value="ml">ml</SelectItem>
                                  <SelectItem value="piece">piece(s)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        {(isUsdaFood ? newFood.calories > 0 : baseMacros.calories > 0 || baseMacros.protein_grams > 0) && (
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { label: 'Calories', value: Math.round(newFood.calories), unit: '' },
                              { label: 'Protein', value: newFood.protein_grams, unit: 'g' },
                              { label: 'Carbs', value: newFood.carbs_grams, unit: 'g' },
                              { label: 'Fats', value: newFood.fats_grams, unit: 'g' },
                            ].map(({ label, value, unit }) => (
                              <div key={label} className="bg-brand/[5%] rounded-lg px-2 py-2 text-center">
                                <div className="text-xs text-brand font-medium">{label}</div>
                                <div className="font-semibold text-white text-sm">{value}{unit}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-slate-500">
                          {isUsdaFood
                            ? `Total for ${newFood.serving_amount} ${newFood.serving_unit}:`
                            : (({ g: 'Per 100g:', ml: 'Per 100ml:', oz: 'Per 1 oz:', cup: 'Per 1 cup:', tbsp: 'Per 1 tbsp:', tsp: 'Per 1 tsp:', piece: 'Per piece:', serving: 'Per serving:' })[newFood.serving_unit] || 'Per serving:')}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="calories">Calories *</Label>
                            <Input
                              id="calories"
                              type="number"
                              value={isUsdaFood ? newFood.calories : baseMacros.calories}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, calories: raw }));
                                  if (raw !== '') {
                                    const isServingLike = newFood.serving_unit === 'serving' || newFood.serving_unit === 'piece';
                                    const gpU = isServingLike ? (foodServingSizeGrams ?? 100) : (UNIT_TO_GRAMS[newFood.serving_unit] ?? 1);
                                    const scale = (parseFloat(newFood.serving_amount) || 0) * gpU / 100;
                                    if (scale > 0) setBaseMacros(prev => ({ ...prev, calories: Math.round((parseFloat(raw) || 0) / scale) }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, calories: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                            />
                          </div>

                          <div>
                            <Label htmlFor="protein">Protein (g) *</Label>
                            <Input
                              id="protein"
                              type="number"
                              value={isUsdaFood ? newFood.protein_grams : baseMacros.protein_grams}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, protein_grams: raw }));
                                  if (raw !== '') {
                                    const isServingLike = newFood.serving_unit === 'serving' || newFood.serving_unit === 'piece';
                                    const gpU = isServingLike ? (foodServingSizeGrams ?? 100) : (UNIT_TO_GRAMS[newFood.serving_unit] ?? 1);
                                    const scale = (parseFloat(newFood.serving_amount) || 0) * gpU / 100;
                                    if (scale > 0) setBaseMacros(prev => ({ ...prev, protein_grams: Math.round((parseFloat(raw) || 0) / scale * 10) / 10 }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, protein_grams: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>

                          <div>
                            <Label htmlFor="carbs">Carbs (g) *</Label>
                            <Input
                              id="carbs"
                              type="number"
                              value={isUsdaFood ? newFood.carbs_grams : baseMacros.carbs_grams}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, carbs_grams: raw }));
                                  if (raw !== '') {
                                    const isServingLike = newFood.serving_unit === 'serving' || newFood.serving_unit === 'piece';
                                    const gpU = isServingLike ? (foodServingSizeGrams ?? 100) : (UNIT_TO_GRAMS[newFood.serving_unit] ?? 1);
                                    const scale = (parseFloat(newFood.serving_amount) || 0) * gpU / 100;
                                    if (scale > 0) setBaseMacros(prev => ({ ...prev, carbs_grams: Math.round((parseFloat(raw) || 0) / scale * 10) / 10 }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, carbs_grams: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>

                          <div>
                            <Label htmlFor="fats">Fats (g) *</Label>
                            <Input
                              id="fats"
                              type="number"
                              value={isUsdaFood ? newFood.fats_grams : baseMacros.fats_grams}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, fats_grams: raw }));
                                  if (raw !== '') {
                                    const isServingLike = newFood.serving_unit === 'serving' || newFood.serving_unit === 'piece';
                                    const gpU = isServingLike ? (foodServingSizeGrams ?? 100) : (UNIT_TO_GRAMS[newFood.serving_unit] ?? 1);
                                    const scale = (parseFloat(newFood.serving_amount) || 0) * gpU / 100;
                                    if (scale > 0) setBaseMacros(prev => ({ ...prev, fats_grams: Math.round((parseFloat(raw) || 0) / scale * 10) / 10 }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, fats_grams: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>
                        </div>

                        {macroCalcWarning && (
                          <div className="bg-[rgba(245,158,11,0.08)] border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                            <div className="flex items-center gap-1.5 font-medium mb-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Macros don't match calories
                            </div>
                            <p>P+C+F = <strong>{macroCalcWarning.calculated} cal</strong>, but you entered <strong>{baseMacros.calories} cal</strong>.</p>
                            <button
                              type="button"
                              className="mt-1 underline font-medium"
                              onClick={() => setBaseMacros(prev => ({ ...prev, calories: macroCalcWarning.calculated }))}
                            >
                              Use {macroCalcWarning.calculated} cal instead
                            </button>
                          </div>
                        )}
                  </div>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="px-6 pt-4 border-t bg-charcoal-surface shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <Button
                  onClick={() => {
                    if (editingEntry) {
                      updateFoodMutation.mutate({ id: editingEntry.id, data: newFood });
                      return;
                    }
                    addFoodMutation.mutate(newFood);
                    // Save manually-entered foods to custom_foods (fire-and-forget, per-serving values)
                    if (newFood.food_name && baseMacros.calories > 0) {
                      saveCustomFoodMutation.mutate({
                        food_name: newFood.food_name,
                        serving_size: ['g', 'ml'].includes(newFood.serving_unit) ? 100 : 1,
                        serving_unit: newFood.serving_unit,
                        calories: Math.round(baseMacros.calories),
                        protein_grams: Math.round(baseMacros.protein_grams * 10) / 10,
                        carbs_grams: Math.round(baseMacros.carbs_grams * 10) / 10,
                        fats_grams: Math.round(baseMacros.fats_grams * 10) / 10,
                      });
                    }
                  }}
                  disabled={!newFood.food_name || addFoodMutation.isPending || updateFoodMutation.isPending}
                  className="w-full bg-brand"
                  data-tutorial="add-food-submit"
                >
                  {(addFoodMutation.isPending || updateFoodMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingEntry ? "Saving..." : "Adding..."}
                    </>
                  ) : (
                    editingEntry ? "Save Changes" : "Add Food"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      {/* ─── Goals Modal ─── */}
      <Dialog open={showGoalsModal} onOpenChange={setShowGoalsModal}>
        <DialogContent className="max-w-xl flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Nutrition Goals</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5" style={{ WebkitOverflowScrolling: 'touch' }}>
            <GoalsFormContent
              activePhase={activePhase}
              tdee={tdee}
              profile={profile}
              latestWeight={latestWeight}
              proteinPerLb={proteinPerLb}
              setProteinPerLb={setProteinPerLb}
              goalForm={goalForm}
              setGoalForm={setGoalForm}
              updateGoalsMutation={updateGoalsMutation}
              navigate={navigate}
              setShowGoalsModal={setShowGoalsModal}
              setShowStatsModal={setShowStatsModal}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Recipes Side Sheet ─── */}
      {showRecipesPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9999] bg-black/40"
            onClick={() => setShowRecipesPanel(false)}
          />
          {/* Sheet */}
          <div
            className="fixed right-0 z-[10000] flex flex-col bg-charcoal-surface border-l border-charcoal-border shadow-2xl"
            style={{
              top: 'var(--layout-header-height, 0px)',
              bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
              width: 'min(520px, 100vw)',
            }}
          >
            {/* Sheet header */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-charcoal-border">
              <h2 className="text-base font-semibold text-white">Your Recipes</h2>
              <div className="flex items-center gap-2">
                <Button onClick={() => setShowNewRecipe(true)} className="bg-brand h-8 text-xs px-3">
                  <Plus className="w-3.5 h-3.5 mr-1" />New Recipe
                </Button>
                <button
                  onClick={() => setShowRecipesPanel(false)}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Sheet content */}
            <div className="flex-1 overflow-y-auto p-5">
              <RecipeBuilder hideHeader showCreateDialog={showNewRecipe} onCreateDialogChange={setShowNewRecipe} />
            </div>
          </div>
        </>
      )}

        {showNewMealDialog && (
  <Dialog
    open={showNewMealDialog}
    onOpenChange={(open) => {
  setShowNewMealDialog(open);
  if (!open) {
    resetForm();
    setMealItems([]);
    setMealTemplateType("lunch");
  }
}}
  >
    <DialogContent className="max-w-2xl flex flex-col p-0 overflow-hidden">
      <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
        <DialogTitle>Build New Meal</DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="grid grid-cols-1 gap-4">
  

          <div>
            <Label>Meal Type</Label>
            <Select value={mealTemplateType} onValueChange={setMealTemplateType}>
              <SelectTrigger className="mt-1">
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
          <Label htmlFor="meal-search">Search USDA Database</Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
  id="meal-search"
  ref={searchRef}
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder="Search for a food..."
  className="pl-10"
/>
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>

          {fuzzyFallback && (genericResults.length > 0 || brandedResults.length > 0) && (
            <p className="mt-1.5 text-xs text-[#fbbf24] px-1">Showing approximate results for "{searchQuery}"</p>
          )}
          {(matchingCustomFoods.length > 0 || genericResults.length > 0) && (
            <div className="mt-2 max-h-56 overflow-y-auto border rounded-lg bg-charcoal-surface divide-y divide-charcoal-border">
              {matchingCustomFoods.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-[rgba(245,158,11,0.08)] text-xs font-semibold text-[#fbbf24] sticky top-0">My Foods</div>
                  {matchingCustomFoods.map((food) => (
                    <button key={food.id} onClick={() => selectCustomFood(food)} className="w-full text-left px-4 py-2.5 hover:bg-[rgba(245,158,11,0.08)] transition-colors">
                      <div className="font-medium text-white text-sm">{food.food_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{Math.round(food.calories)} cal · P {Math.round(food.protein_grams)}g · C {Math.round(food.carbs_grams)}g · F {Math.round(food.fats_grams)}g</div>
                    </button>
                  ))}
                </>
              )}
              {genericResults.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-slate-500 sticky top-0">Generic Foods</div>
                  {genericResults.map((food) => (
                    <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-2.5 hover:bg-charcoal-surface hover:bg-charcoal-elevated transition-colors">
                      <div className="font-medium text-white text-sm">{food.description}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{Math.round(food.calories)} cal / 100g · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fats)}g</div>
                    </button>
                  ))}
                </>
              )}
              {brandedResults.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowBranded(v => !v)} className="w-full px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-slate-500 flex items-center justify-between hover:bg-charcoal-elevated transition-colors sticky top-0">
                    <span>Branded ({brandedResults.length})</span>
                    {showBranded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showBranded && brandedResults.map((food) => (
                    <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-2.5 hover:bg-charcoal-surface hover:bg-charcoal-elevated transition-colors">
                      <div className="font-medium text-white text-sm">{food.description}</div>
                      {food.brandOwner && <div className="text-xs text-slate-400">{food.brandOwner}</div>}
                      <div className="text-xs text-slate-500 mt-0.5">{Math.round(food.calories)} cal · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fats)}g</div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="border border-charcoal-border rounded-lg p-4 space-y-4 bg-charcoal-surface/50">
          <div>
            <Label>Food Name</Label>
            <Input
              value={newFood.food_name}
              onChange={(e) => setNewFood({ ...newFood, food_name: e.target.value })}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Amount</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  value={newFood.serving_amount}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      serving_amount: e.target.value,
                    })
                  }
                  min="0"
                  step="0.5"
                  className="w-24"
                />
                <Select
                  value={newFood.serving_unit}
                  onValueChange={(value) => setNewFood({ ...newFood, serving_unit: value })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="serving">serving(s)</SelectItem>
                    <SelectItem value="g">grams</SelectItem>
                    <SelectItem value="oz">oz</SelectItem>
                    <SelectItem value="cup">cup(s)</SelectItem>
                    <SelectItem value="tbsp">tbsp</SelectItem>
                    <SelectItem value="tsp">tsp</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="piece">piece(s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Calories</Label>
              <Input
                type="number"
                value={baseMacros.calories}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, calories: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Protein (g)</Label>
              <Input
                type="number"
                value={baseMacros.protein_grams}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, protein_grams: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Carbs (g)</Label>
              <Input
                type="number"
                value={baseMacros.carbs_grams}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, carbs_grams: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Fats (g)</Label>
              <Input
                type="number"
                value={baseMacros.fats_grams}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, fats_grams: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={addCurrentFoodToMeal}
            disabled={!newFood.food_name}
            className="w-full bg-brand"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Food to Meal
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Meal Items</h3>
            <Badge variant="secondary">{mealItems.length} items</Badge>
          </div>

          {mealItems.length === 0 ? (
            <div className="text-sm text-slate-500 border rounded-lg p-4">
              No foods added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {mealItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between p-3 rounded-lg bg-charcoal-elevated"
                >
                  <div>
                    <div className="font-medium text-sm">{item.food_name}</div>
                    <div className="text-xs text-slate-500">{item.serving_size}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {item.calories} cal · P {item.protein_grams}g · C {item.carbs_grams}g · F {item.fats_grams}g
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMealItem(item.id)}
                    className="text-[#f87171] hover:text-[#f87171] hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {mealItems.length > 0 && (
            <div className="rounded-lg bg-brand/[5%] p-3 text-sm text-brand text-brand">
              <div className="font-medium">
                Total: {Math.round(mealTotals.calories)} cal
              </div>
              <div>
                P {Math.round(mealTotals.protein_grams * 10) / 10}g ·
                C {Math.round(mealTotals.carbs_grams * 10) / 10}g ·
                F {Math.round(mealTotals.fats_grams * 10) / 10}g
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t bg-charcoal-surface shrink-0">
        <Button
          onClick={handleSaveMealTemplate}
          disabled={mealItems.length === 0}
          className="w-full bg-brand"
        >
          Save Meal Template
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)}
        {showSaveTemplateDialog && (
          <SaveAsTemplateDialog
            open={showSaveTemplateDialog}
            onOpenChange={(open) => {
              setShowSaveTemplateDialog(open);
              if (!open) {
                setTemplateEntries([]);
                setTemplateMealType(null);
              }
            }}
            entries={templateEntries}
            mealType={templateMealType}
            userId={user.id}
          />
        )}

      {showStatsModal && (
        <StatsSetupModal
          open={showStatsModal}
          onOpenChange={setShowStatsModal}
        />
      )}

      {/* Food CSV Format Guide */}
      <Dialog open={showFoodFormatGuide} onOpenChange={setShowFoodFormatGuide}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Food CSV Import Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 mb-3">
            Save a <code className="text-xs bg-charcoal-elevated px-1 rounded">.csv</code> file with these columns, then use the Import CSV button to add foods to My Foods.
          </p>
          <pre className="bg-charcoal-surface rounded-lg p-3 text-xs overflow-auto text-white text-slate-400 border text-left">{`food_name,calories,protein_grams,carbs_grams,fats_grams,serving_unit
Chicken Breast,165,31,0,3.6,100g
Greek Yogurt,59,10,3.6,0.4,100g
Oats,389,17,66,7,100g`}</pre>
          <div className="text-xs text-slate-500 space-y-1 mt-2">
            <p><span className="font-semibold">food_name</span> and <span className="font-semibold">calories</span> are required. All other columns are optional.</p>
            <p><span className="font-semibold">serving_unit</span>: any label like <code>100g</code>, <code>cup</code>, <code>serving</code> (defaults to "serving").</p>
            <p>Macros are per the serving size you specify.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode scanner — full-screen overlay, mobile only */}
      <BarcodeScanner
        open={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onFoodFound={(food) => {
          setShowBarcodeScanner(false);
          selectFood(food);
        }}
        onNotFound={(barcode) => {
          setShowBarcodeScanner(false);
          setSearchQuery(barcode);
          toast.info("Product not found. Try searching manually.");
        }}
      />
    </div>
  );
}

function GoalsFormContent({
  activePhase, tdee, profile, latestWeight,
  proteinPerLb, setProteinPerLb,
  goalForm, setGoalForm,
  updateGoalsMutation,
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
          <div className={`rounded-xl border p-4 space-y-3 ${goalsOutOfSync ? 'border-amber-300 bg-[rgba(245,158,11,0.08)]' : 'border-charcoal-border'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    activePhase.phase_type === 'cut'  ? 'bg-[rgba(59,130,246,0.1)] text-[#60a5fa]'
                    : activePhase.phase_type === 'bulk' ? 'bg-[rgba(34,197,94,0.1)] text-[#4ade80]'
                    : 'bg-charcoal-elevated text-slate-400'
                  }`}>
                    {activePhase.phase_type === 'cut' ? 'Cut' : activePhase.phase_type === 'bulk' ? 'Bulk' : activePhase.phase_type === 'reverse' ? 'Reverse' : 'Maintain'}
                  </span>
                  <span className="text-sm text-slate-400">
                    {activePhase.phase_type === 'reverse'
                      ? `+${activePhase.weekly_rate} cal/wk`
                      : `${activePhase.weekly_rate > 0 ? '+' : ''}${activePhase.weekly_rate} ${profile?.weight_unit || 'lbs'}/wk`}
                  </span>
                </div>
                <div className="text-sm font-medium text-white mt-1">
                  {phaseCalories.toLocaleString()} cal/day phase target
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-brand shrink-0"
                onClick={() => { setShowGoalsModal(false); navigate('/dashboard?tab=coach'); }}>
                Manage ↗
              </Button>
            </div>
            {goalsOutOfSync && (
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-amber-200">
                <p className="text-xs text-[#fbbf24]">
                  Your saved goals ({(profile?.daily_calorie_goal || 0).toLocaleString()} cal) don't match your phase target.
                </p>
                <Button type="button" size="sm" className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs h-7"
                  onClick={() => {
                    const weightLbs = profile?.weight_unit === 'kg' ? (latestWeight || 0) * 2.205 : (latestWeight || 0);
                    const protein = weightLbs ? Math.round(weightLbs * proteinPerLb) : profile?.daily_protein_goal || 150;
                    setGoalForm(calculateMacroSplit(phaseCalories, protein));
                    toast.info('Goals updated to match your phase — save to apply.');
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
          <p className="text-sm text-slate-400">Set up your stats to auto-calculate daily calorie and macro targets.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => { setShowGoalsModal(false); setShowStatsModal(true); }}>
            <Calculator className="w-4 h-4 mr-2" />Set up TDEE calculation
          </Button>
        </div>
      )}

      {tdee.tdee && latestWeight && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap text-sm shrink-0">Protein target</Label>
            <div className="flex items-center gap-2 flex-1">
              <Input type="number" step="0.05" min="0.5" max="2.5" value={proteinPerLb}
                onChange={(e) => setProteinPerLb(e.target.value)} className="w-24" />
              <span className="text-sm text-slate-500 whitespace-nowrap">
                g / lb{latestWeight ? ` = ${Math.round(proteinPerLb * (profile?.weight_unit === 'kg' ? latestWeight * 2.205 : latestWeight))}g/day` : ''}
              </span>
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
            <Calculator className="w-4 h-4 mr-2" />Auto-calculate from TDEE ({tdee.tdee} cal)
          </Button>
        </div>
      )}

      <MacroGoalsEditor values={goalForm} onChange={setGoalForm} />
      <Button className="w-full bg-brand" disabled={updateGoalsMutation.isPending}
        onClick={() => updateGoalsMutation.mutate({
          daily_calorie_goal: parseInt(goalForm.daily_calorie_goal) || 0,
          daily_protein_goal: parseInt(goalForm.daily_protein_goal) || 0,
          daily_carbs_goal:   parseInt(goalForm.daily_carbs_goal)   || 0,
          daily_fats_goal:    parseInt(goalForm.daily_fats_goal)    || 0,
        })}
      >
        {updateGoalsMutation.isPending
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
          : <><Save className="w-4 h-4 mr-2" />Save Goals</>}
      </Button>
    </div>
  );
}
