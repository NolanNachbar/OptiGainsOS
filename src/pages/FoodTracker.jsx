import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useAllFoodEntries, useCustomFoods, useFoodPortions, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { searchGenericFoods, searchBrandedFoods } from "@/api/usda";
import {
  calculateMacros,
  getDailyCalorieTrend,
  getRecentFoods,
  UNIT_TO_GRAMS,
  isServingLikeUnit,
  gramsForAmount,
  baseQuantityForUnit,
  scaleFromBase,
  formatServingHint,
  formatEntryServing,
  portionsMap,
  portionLabels,
} from "@/utils/nutritionUtils";
import { calculateMacroSplit, getBestTDEE, calculatePhaseCalories } from "@/utils/coachingUtils";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { usePlannedDayRebalance } from "@/hooks/usePlannedDayRebalance";
import { useDayPlanContext } from "@/hooks/useDayPlanContext";
import { useFoodSwap } from "@/hooks/useFoodSwap";
import { DEFAULT_GOALS } from "@/lib/constants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Apple, Plus, Trash2, Pencil, Search, Loader2, BookOpen, UtensilsCrossed, Star, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Bookmark, Calculator, Save, Camera, AlertTriangle, Upload, HelpCircle, ArrowUpRight, Sparkles, Flame, ArrowLeftRight } from "lucide-react";
import { queryKeys, invalidateCustomFoods, invalidateFoodPortions, invalidateFood, invalidateProfile } from "@/lib/queryKeys";
import { format, subDays, parseISO, isValid } from "date-fns";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import RecipeBuilder from "@/components/nutrition/RecipeBuilder";
import { MacroGoalsEditor } from "@/components/nutrition/MacroGoalsEditor";
import MealTemplates, { SaveAsTemplateDialog } from "@/components/nutrition/MealTemplates";
import StatsSetupModal from "@/components/nutrition/StatsSetupModal";
import BarcodeScanner from "@/components/nutrition/BarcodeScanner";
import MealPlanIdeas from "@/components/nutrition/MealPlanIdeas";
import SwapFoodDialog from "@/components/nutrition/SwapFoodDialog";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { Module } from "@/components/ui/system";

const getDefaultMealType = () => {
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
const MEAL_DEFAULT_TIME = { breakfast: "08:00", lunch: "12:30", snack: "15:30", dinner: "19:00" };

// eaten_at for a new food_entries row: "now" stamps the actual moment; "earlier"
// (he's logging something he ate a while ago) falls back to the meal type's
// default clock time on the entry's date, since MealFactor-style retroactive
// logging happens with no reliable actual-time input.
const getEatenAt = (loggingMode, mealType, dateStr) => {
  if (loggingMode !== "earlier") return new Date().toISOString();
  const time = MEAL_DEFAULT_TIME[mealType] || MEAL_DEFAULT_TIME.snack;
  return new Date(`${dateStr}T${time}:00`).toISOString();
};

// "Eating it right now" vs "logging it earlier" segmented toggle — governs
// eaten_at on the entries this dialog creates.
const LoggingModeToggle = ({ value, onChange }) => (
  <div className="inline-flex rounded-lg surface-2 p-0.5 text-xs">
    {[["now", "Eating now"], ["earlier", "Logging earlier"]].map(([id, label]) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
          value === id ? "bg-gold/15 text-gold" : "text-ink-muted"
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
const MacroResultLine = ({ cal, p, c, f, per100g = false }) => (
  <div className="flex flex-wrap gap-x-1.5 mt-0.5 text-xs font-technical tabular-nums">
    <span className="text-gold">{Math.round(cal)} kcal{per100g ? ' / 100g' : ''}</span>
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
const GHOST_DASHED =
  "flex items-center justify-center gap-1.5 min-h-[44px] border border-dashed border-charcoal-border text-xs font-bold uppercase tracking-widest text-ink-muted transition-all duration-200 [transition-timing-function:var(--ease)]";
// Default neutral hover for the dashed ghost; the desktop "Set up TDEE / Edit
// goals" affordance swaps this for a teal action-hover instead.
const GHOST_DASHED_HOVER = "hover:text-ink hover:border-charcoal-borderSoft";

// The units every food gets for free. A food that defines its own portion under
// one of these names (a cup of flour is 120 g, not the 240 g water constant)
// replaces the entry rather than sitting beside it.
// Star a saved food to float it to the top of My Foods. Sits beside the row's
// select button rather than inside it — nesting buttons is invalid HTML and the
// star would swallow the click that picks the food.
const FavoriteToggle = ({ food, onToggle }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onToggle({ id: food.id, is_favorite: !food.is_favorite }); }}
    aria-label={food.is_favorite ? `Unfavorite ${food.food_name}` : `Favorite ${food.food_name}`}
    aria-pressed={!!food.is_favorite}
    className="min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center text-ink-faint hover:text-gold transition-colors duration-200 [transition-timing-function:var(--ease)]"
  >
    <Star className={`w-4 h-4 ${food.is_favorite ? "fill-gold text-gold" : ""}`} />
  </button>
);

const GENERIC_UNITS = [
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
async function downscaleToDataUrl(file, maxEdge = 1568, quality = 0.8) {
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
async function fnErrorMessage(error) {
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

export default function FoodTracker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  // If the tab is left open (or an iOS home-screen app backgrounded) across
  // local midnight, selectedDate never re-derives on its own and new entries
  // silently save under yesterday's date with no on-screen indication. Only
  // roll forward when the athlete was viewing today — a deliberately chosen
  // past day is left alone.
  const wasOnTodayRef = useRef(selectedDate === format(new Date(), "yyyy-MM-dd"));
  useEffect(() => {
    wasOnTodayRef.current = selectedDate === format(new Date(), "yyyy-MM-dd");
  }, [selectedDate]);
  const editingEntryRef = useRef(null);
  const rollDateForwardRef = useRef(() => {});
  rollDateForwardRef.current = () => {
    const nowToday = format(new Date(), "yyyy-MM-dd");
    // Never move the day out from under an open edit: updateFoodMutation
    // saves with date: selectedDate, so a roll mid-edit would move the entry.
    if (editingEntryRef.current) return;
    setSelectedDate((prev) => (wasOnTodayRef.current && prev !== nowToday ? nowToday : prev));
  };
  useEffect(() => {
    const rollDateForward = () => rollDateForwardRef.current();
    const onVisibility = () => { if (document.visibilityState === "visible") rollDateForward(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", rollDateForward);
    const interval = setInterval(rollDateForward, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", rollDateForward);
      clearInterval(interval);
    };
  }, []);
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
  const [searchError, setSearchError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const [myFoodsExpanded, setMyFoodsExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);
  const [manualExpanded, setManualExpanded] = useState(false);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [showNewMealDialog, setShowNewMealDialog] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showFoodFormatGuide, setShowFoodFormatGuide] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [goalsExpanded, setGoalsExpanded] = useState(false);
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
    // Null, not 0: a food whose fiber nobody knows is not a zero-fiber food.
    fiber_grams: null,
  });
  const [baseMacros, setBaseMacros] = useState({
    calories: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fats_grams: 0,
    fiber_grams: null,
  });
  // What one serving/piece of the selected food weighs, in grams. Set from
  // whichever source the food came from: USDA serving size, a custom food's
  // saved serving_grams, an AI estimate, a label scan, or typed by hand.
  // Null means unknown — never substitute a default, or a serving silently
  // becomes 100 g.
  const [foodServingSizeGrams, setFoodServingSizeGrams] = useState(null);
  // The unit baseMacros are expressed in. 'g'/'ml' means per 100; anything else
  // means per 1. USDA/barcode foods are always per 100 g.
  const [baseUnit, setBaseUnit] = useState('g');
  // The selected food's own named portions: [{ id?, label, grams }]. They become
  // units in the picker and outrank the generic conversion table, which is what
  // makes 'cup' mean this food's cup rather than a cup of water.
  const [activePortions, setActivePortions] = useState([]);
  // The custom_foods row the form is editing, when there is one. Portion edits
  // write straight through for a saved food; for a new one they're held here and
  // flushed the moment it's saved.
  const [activeFoodId, setActiveFoodId] = useState(null);
  // True once the athlete has actually touched the portion list in this form.
  // syncPortions reconciles by deletion, so it must only ever run against a list
  // he edited — never against one that merely happens to be empty because the
  // read hadn't landed. It stays true for the rest of the form session rather
  // than clearing on a successful write: the invalidated query hasn't refetched
  // yet at that moment, so clearing it would let the adopt-effect below stomp
  // the edit back to the pre-edit list until the refetch landed. Re-syncing an
  // unchanged list on save is a no-op, and every food selection resets it.
  const [portionsDirty, setPortionsDirty] = useState(false);
  const [portionDraft, setPortionDraft] = useState({ label: "", grams: "" });
  const [portionsExpanded, setPortionsExpanded] = useState(false);
  // Copy a previous day's log forward.
  const [showCopyDayDialog, setShowCopyDayDialog] = useState(false);
  const [copyFromDate, setCopyFromDate] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const [copySelection, setCopySelection] = useState({});
  // Descriptive intake stats window, in days.
  const [statsWindow, setStatsWindow] = useState(7);
  const [showIntakeStats, setShowIntakeStats] = useState(false);
  // Extra descriptive text from the source, e.g. USDA's "2/3 cup" household
  // serving or an AI estimate's serving description. Appended to the hint.
  const [servingHint, setServingHint] = useState(null);
  // True when the selected food came from USDA/barcode. Only affects which
  // source-specific UI shows; the scaling math reads baseUnit instead.
  const [isUsdaFood, setIsUsdaFood] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  // AI "describe a food" macro estimate (estimate-food-macros edge function).
  const [estimateInput, setEstimateInput] = useState("");
  const [isEstimating, setIsEstimating] = useState(false);
  const [isEstimatedFood, setIsEstimatedFood] = useState(false);
  // Quick-meal estimator (estimate-meal edge fn): a free-text or photo meal ->
  // a list of items the athlete confirms, then batch-logs. For travel/restaurants
  // where weighing each item isn't possible.
  const [showMealEstimator, setShowMealEstimator] = useState(false);
  const [mealText, setMealText] = useState("");
  const [mealPhoto, setMealPhoto] = useState(null); // { dataUrl, previewUrl }
  const [estMealItems, setEstMealItems] = useState(null);  // estimated items (null until estimated)
  const [mealMealType, setMealMealType] = useState(getDefaultMealType());
  // "Eating it right now" vs "logging it earlier" — governs eaten_at on every
  // food_entries insert below. Shared across the manual/meal-estimator flows;
  // defaults to "now" since that's the common case.
  const [loggingMode, setLoggingMode] = useState("now");
  const [isEstimatingMeal, setIsEstimatingMeal] = useState(false);
  const [isLoggingMeal, setIsLoggingMeal] = useState(false);
  const mealPhotoInputRef = useRef(null);
  // Nutrition-label reader (read-nutrition-label edge fn): barcode-miss fallback.
  // Snap the Nutrition Facts panel + type the name -> prefills the manual form.
  const [showLabelCapture, setShowLabelCapture] = useState(false);
  const [labelName, setLabelName] = useState("");
  const [labelPhoto, setLabelPhoto] = useState(null); // { dataUrl, previewUrl }
  const [isReadingLabel, setIsReadingLabel] = useState(false);
  const labelPhotoInputRef = useRef(null);
  const [editingEntry, setEditingEntry] = useState(null);
  editingEntryRef.current = editingEntry;
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
      setSearchError(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(false);
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
        setSearchError(true);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchRetry]);

  // Update displayed macros when serving amount or unit changes.
  //
  // Gram-canonical scaling: convert both the stored base quantity and the amount
  // the athlete typed into grams, then take the ratio. Works across a unit change
  // for any food whose serving weight is known. Falls back to the plain quantity
  // ratio when it isn't (older custom foods saved before serving_grams existed).
  useEffect(() => {
    if (baseMacros.calories <= 0 && baseMacros.protein_grams <= 0) return;
    const scale = scaleFromBase({
      amount: newFood.serving_amount || 0,
      unit: newFood.serving_unit,
      baseUnit,
      servingGrams: foodServingSizeGrams,
      portions: activePortions,
    });
    setNewFood(prev => ({
      ...prev,
      calories: Math.round(baseMacros.calories * scale),
      protein_grams: Math.round(baseMacros.protein_grams * scale * 10) / 10,
      carbs_grams: Math.round(baseMacros.carbs_grams * scale * 10) / 10,
      fats_grams: Math.round(baseMacros.fats_grams * scale * 10) / 10,
      // Unknown fiber scales to unknown fiber, never to zero.
      fiber_grams: baseMacros.fiber_grams == null
        ? null
        : Math.round(baseMacros.fiber_grams * scale * 10) / 10,
    }));
  }, [newFood.serving_amount, newFood.serving_unit, baseMacros, baseUnit, foodServingSizeGrams, activePortions]);

  const { profile } = useProfile();
  const { weightEntries } = useBodyWeightEntries();
  const { activePhase, phaseHistory } = useDietPhase();
  // The day's targets — engine recovery-gated when available, else profile
  // goals. Same source the weekly plan card scales to, so they always agree.
  const targets = useDailyTargets(selectedDate);
  const [goalForm, setGoalForm] = useState({
    daily_calorie_goal: DEFAULT_GOALS.calories,
    daily_protein_goal: DEFAULT_GOALS.protein,
    daily_carbs_goal: DEFAULT_GOALS.carbs,
    daily_fats_goal: DEFAULT_GOALS.fats,
  });
  // Fiber sits outside goalForm on purpose: the TDEE auto-calculate and
  // MacroGoalsEditor both replace that object wholesale, and fiber isn't part of
  // the calorie split they're solving. Empty string means "no goal set" — the
  // DRI ratio then supplies one.
  const [fiberGoal, setFiberGoal] = useState("");
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
      setFiberGoal(profile.daily_fiber_goal ? String(profile.daily_fiber_goal) : "");
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

  // Auto-expand the Manual entry disclosure once a food is picked/typed or when
  // editing an existing entry; otherwise keep it collapsed so search leads.
  useEffect(() => {
    if (editingEntry || (newFood.food_name && newFood.food_name.length > 0)) {
      setManualExpanded(true);
    }
  }, [editingEntry, newFood.food_name]);

  // Reset the disclosure to collapsed each time the dialog opens fresh.
  useEffect(() => {
    if (!showAddDialog) setManualExpanded(false);
  }, [showAddDialog]);

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

  const { data: foodEntries = [], isLoading: entriesLoading, isError: entriesError, refetch: refetchEntries } = useQuery({
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
  const { portionsByFood, portionsUnavailable } = useFoodPortions();

  // The portion query resolves after a food can already be picked. A food chosen
  // in that window would sit on an empty list: its named units missing from the
  // picker, and an empty list is exactly what a save would reconcile-delete
  // against. Adopt the server's list the moment it lands, unless the form is
  // holding edits that haven't been written yet.
  useEffect(() => {
    if (!activeFoodId || portionsDirty || portionsUnavailable) return;
    const server = portionsByFood[activeFoodId];
    if (server) setActivePortions((prev) => (prev === server ? prev : server));
  }, [activeFoodId, portionsByFood, portionsDirty, portionsUnavailable]);
  // Favorites first, then alphabetical. A starred food stops sinking out of
  // reach the moment it hasn't been eaten in a week.
  const sortedCustomFoods = useMemo(() => {
    return [...customFoods].sort((a, b) => {
      if (!!a.is_favorite !== !!b.is_favorite) return a.is_favorite ? -1 : 1;
      return (a.food_name || "").localeCompare(b.food_name || "");
    });
  }, [customFoods]);
  const matchingCustomFoods = searchQuery.length >= 2
    ? sortedCustomFoods.filter((f) =>
        f.food_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const toggleFavoriteFoodMutation = useMutation({
    mutationFn: ({ id, is_favorite }) => db.entities.CustomFood.update(id, { is_favorite }),
    onSuccess: () => invalidateCustomFoods(queryClient),
    onError: () => toast.error("Couldn't update favorite"),
  });

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
    onSuccess: (saved) => {
      invalidateCustomFoods(queryClient);
      // A food's portions are part of the food. Flush whatever the form is
      // holding now that there's a row to hang them off.
      if (saved?.id) {
        setActiveFoodId(saved.id);
        // Only when he edited them here. An untouched form's list is a copy of
        // the server's at best and empty at worst, and syncing it would delete
        // portions he never asked to lose.
        if (portionsDirty) {
          syncPortions(saved.id, activePortions)
            .catch((e) =>
              toast.error(`Saved the food, but its portions didn't stick: ${e.message}`)
            );
        }
      }
    },
  });

  // Build the custom-food payload from the current form. Stored macros are per
  // 100 g/ml or per 1 of any other unit, so convert from whatever unit the
  // current baseMacros are in. serving_grams rides along so the food knows what
  // one serving of it weighs the next time it's logged.
  const buildCustomFoodPayload = () => {
    const unit = newFood.serving_unit;
    const scale = scaleFromBase({
      amount: baseQuantityForUnit(unit),
      unit,
      baseUnit,
      servingGrams: foodServingSizeGrams,
      portions: activePortions,
    });
    return {
      food_name: newFood.food_name,
      serving_size: baseQuantityForUnit(unit),
      serving_unit: unit,
      serving_grams: foodServingSizeGrams ?? null,
      calories: Math.round(baseMacros.calories * scale),
      protein_grams: Math.round(baseMacros.protein_grams * scale * 10) / 10,
      carbs_grams: Math.round(baseMacros.carbs_grams * scale * 10) / 10,
      fats_grams: Math.round(baseMacros.fats_grams * scale * 10) / 10,
      fiber_grams: baseMacros.fiber_grams == null
        ? null
        : Math.round(baseMacros.fiber_grams * scale * 10) / 10,
    };
  };

  /**
   * Write the form's portion list to food_portions for a saved food.
   *
   * Portions can be typed before the food exists, so this runs after the custom
   * food is saved and reconciles: rows that vanished from the form are deleted,
   * new ones are inserted, and changed weights are updated. Labels are the
   * identity, matching the unique index on (custom_food_id, lower(label)).
   */
  const syncPortions = async (foodId, portions) => {
    if (!foodId || !user) return;
    const existing = await db.entities.FoodPortion.filter({ custom_food_id: foodId });
    const wanted = (portions || []).filter((p) => p.label && Number(p.grams) > 0);
    const wantedByLabel = new Map(wanted.map((p) => [p.label.toLowerCase().trim(), p]));

    for (const row of existing) {
      const label = String(row.label || "").toLowerCase().trim();
      const match = wantedByLabel.get(label);
      if (!match) {
        await db.entities.FoodPortion.delete(row.id);
      } else if (Number(row.grams) !== Number(match.grams)) {
        await db.entities.FoodPortion.update(row.id, { grams: Number(match.grams) });
      }
      wantedByLabel.delete(label);
    }

    let order = existing.length;
    for (const p of wantedByLabel.values()) {
      await db.entities.FoodPortion.create({
        created_by: user.id,
        custom_food_id: foodId,
        label: p.label.toLowerCase().trim(),
        grams: Number(p.grams),
        sort_order: order++,
      });
    }
    invalidateFoodPortions(queryClient);
  };

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
      fiber_grams: entry.fiber_grams == null
        ? null
        : Math.round(((entry.fiber_grams || 0) / safeScale) * 10) / 10,
    };

    // Grams per single unit, recovered from the total weight the entry recorded.
    const perUnitGrams =
      entry.serving_grams > 0 && originalAmount > 0 && isServingLikeUnit(originalUnit)
        ? entry.serving_grams / originalAmount
        : null;

    setFoodServingSizeGrams(perUnitGrams);
    setBaseUnit(originalUnit);
    setIsUsdaFood(false);
    setServingHint(null);
    setBaseMacros(baseMacroValues);
    // A logged entry doesn't carry the food's portion list; if the same food is
    // saved in My Foods, pick its portions back up by name.
    const savedMatch = customFoods.find(
      (f) => f.food_name.toLowerCase() === String(entry.food_name || "").toLowerCase()
    );
    setActiveFoodId(savedMatch?.id || null);
    setActivePortions(savedMatch ? (portionsByFood[savedMatch.id] || []) : []);
    setPortionsDirty(false);
    setNewFood({
      ...newFood,
      food_name: entry.food_name,
      serving_unit: originalUnit,
      serving_amount: originalAmount,
      calories: Math.round(entry.calories) || 0,
      protein_grams: entry.protein_grams || 0,
      carbs_grams: entry.carbs_grams || 0,
      fats_grams: entry.fats_grams || 0,
      fiber_grams: entry.fiber_grams ?? null,
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
      fiber_grams: food.fiber_grams == null
        ? null
        : Math.round(((food.fiber_grams || 0) / safeScale) * 10) / 10,
    };

    // What one serving of this food weighs, if it was ever recorded. Null stays
    // null: the picker then offers grams and says nothing it can't back up.
    const savedServingGrams = Number(food.serving_grams);
    setFoodServingSizeGrams(
      Number.isFinite(savedServingGrams) && savedServingGrams > 0 ? savedServingGrams : null
    );
    setBaseUnit(originalUnit);
    setIsUsdaFood(false);
    setServingHint(null);
    setBaseMacros(baseMacroValues);
    // Synthetic foods (AI estimates, label scans) have no row yet — no id, and
    // no portions until the athlete saves them to My Foods.
    setActiveFoodId(food.id || null);
    setActivePortions(food.id ? (portionsByFood[food.id] || []) : []);
    setPortionsDirty(false);

    // Set default amount: 100 for g/ml, otherwise 1
    const defaultAmount = ['g', 'ml'].includes(originalUnit) ? 100 : 1;
    const defaultScale = 1; // 100 of a per-100 food, or 1 of a per-1 food

    setNewFood({
      ...newFood,
      food_name: food.food_name,
      serving_unit: originalUnit,
      serving_amount: defaultAmount,
      calories: Math.round(baseMacroValues.calories * defaultScale),
      protein_grams: Math.round(baseMacroValues.protein_grams * defaultScale * 10) / 10,
      carbs_grams: Math.round(baseMacroValues.carbs_grams * defaultScale * 10) / 10,
      fats_grams: Math.round(baseMacroValues.fats_grams * defaultScale * 10) / 10,
      fiber_grams: baseMacroValues.fiber_grams,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
    setIsEstimatedFood(false);
  };

  // AI estimate: turn a plain-language food description into a single-serving
  // macro estimate (via the estimate-food-macros edge function) and prefill the
  // form like a custom food so the athlete reviews + adjusts before logging.
  const estimateFood = async () => {
    const description = estimateInput.trim();
    if (!description) { toast.error("Describe a food first"); return; }
    setIsEstimating(true);
    try {
      const { data, error } = await supabase.functions.invoke("estimate-food-macros", { body: { description } });
      if (error) throw new Error(await fnErrorMessage(error));
      const est = data?.estimate;
      if (!est) throw new Error(data?.error || "No estimate returned");
      // The estimator returns the weight it assumed; keep it so the picker can
      // show "1 serving (Xg)" and the athlete can weigh against it.
      const estGrams = Number(est.serving_grams);
      const hasGrams = Number.isFinite(estGrams) && estGrams > 0;
      selectCustomFood({
        food_name: est.food_name,
        serving_size: 1,
        serving_unit: "serving",
        serving_grams: hasGrams ? estGrams : null,
        calories: est.calories,
        protein_grams: est.protein,
        carbs_grams: est.carbs,
        fats_grams: est.fats,
        fiber_grams: est.fiber ?? null,
      });
      setServingHint(est.serving_description ? `Estimated for ${est.serving_description}` : null);
      setIsEstimatedFood(true);
      setManualExpanded(true);
      setEstimateInput("");
      toast.success(`Estimated ${est.food_name} · ${est.confidence} confidence — review & adjust`);
    } catch (err) {
      toast.error(err.message || "Estimate failed");
    } finally {
      setIsEstimating(false);
    }
  };

  // ── Quick-meal estimator: text/photo -> item list -> batch log ──────────
  const resetMealEstimator = () => {
    setMealText("");
    setEstMealItems(null);
    setMealPhoto((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; });
    setMealMealType(getDefaultMealType());
    setLoggingMode("now");
  };

  const pickMealPhoto = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    try {
      const dataUrl = await downscaleToDataUrl(file);
      setMealPhoto({ dataUrl, previewUrl });
    } catch {
      URL.revokeObjectURL(previewUrl);
      toast.error("Couldn't process that photo");
    }
  };

  const estimateMeal = async () => {
    const description = mealText.trim();
    if (!description && !mealPhoto) { toast.error("Describe your meal or add a photo"); return; }
    setIsEstimatingMeal(true);
    try {
      // Photo wins if both are present (the image carries more signal).
      const body = mealPhoto ? { image: mealPhoto.dataUrl } : { description };
      const { data, error } = await supabase.functions.invoke("estimate-meal", { body });
      if (error) throw new Error(await fnErrorMessage(error));
      if (!data?.items?.length) throw new Error(data?.error || "No foods identified");
      setEstMealItems(data.items);
    } catch (err) {
      toast.error(err.message || "Estimate failed");
    } finally {
      setIsEstimatingMeal(false);
    }
  };

  const removeEstMealItem = (idx) => setEstMealItems((items) => items.filter((_, i) => i !== idx));

  const logMealItems = async () => {
    if (!estMealItems?.length) return;
    setIsLoggingMeal(true);
    try {
      // Each estimated item is a portion total, so it logs as a 1-serving entry.
      // ONE atomic multi-row insert (not a per-item loop): all-or-nothing, so a
      // mid-batch network failure can't leave a partial log that a retry would
      // then double-insert.
      const eatenAt = getEatenAt(loggingMode, mealMealType, selectedDate);
      const rows = estMealItems.map((it) => ({
        food_name: it.food_name,
        meal_type: mealMealType,
        serving_size: 1,
        serving_unit: "serving",
        calories: Math.round(it.calories),
        protein_grams: it.protein,
        carbs_grams: it.carbs,
        fats_grams: it.fats,
        date: selectedDate,
        created_by: user.id,
        eaten_at: eatenAt,
      }));
      const { error } = await supabase.from("food_entries").insert(rows);
      if (error) throw error;
      invalidateFood(queryClient);
      toast.success(`Logged ${estMealItems.length} item${estMealItems.length > 1 ? "s" : ""}`);
      resetMealEstimator();
      setShowMealEstimator(false);
      setShowAddDialog(false);
    } catch {
      toast.error("Couldn't log the meal, nothing was saved. Try again.");
    } finally {
      setIsLoggingMeal(false);
    }
  };

  // ── Nutrition-label reader: barcode-miss fallback ───────────────────────
  const resetLabelCapture = () => {
    setLabelName("");
    setLabelPhoto((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; });
  };

  const pickLabelPhoto = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    try {
      const dataUrl = await downscaleToDataUrl(file);
      setLabelPhoto({ dataUrl, previewUrl });
    } catch {
      URL.revokeObjectURL(previewUrl);
      toast.error("Couldn't process that photo");
    }
  };

  const readLabel = async () => {
    if (!labelPhoto) { toast.error("Add a photo of the label first"); return; }
    setIsReadingLabel(true);
    try {
      const { data, error } = await supabase.functions.invoke("read-nutrition-label", { body: { image: labelPhoto.dataUrl } });
      if (error) throw new Error(await fnErrorMessage(error));
      const est = data?.estimate;
      if (!est) throw new Error(data?.error || "Could not read the label");
      // Prefill the single-item form like a custom food (totals are per serving).
      // The label's own gram figure comes along so the serving isn't abstract.
      const labelGrams = Number(est.serving_grams);
      selectCustomFood({
        food_name: labelName.trim() || "Scanned product",
        serving_size: 1,
        serving_unit: "serving",
        serving_grams: Number.isFinite(labelGrams) && labelGrams > 0 ? labelGrams : null,
        calories: est.calories,
        protein_grams: est.protein,
        carbs_grams: est.carbs,
        fats_grams: est.fats,
        fiber_grams: est.fiber ?? null,
      });
      setServingHint(est.serving_description ? `Label: ${est.serving_description}` : null);
      setIsEstimatedFood(true);
      setManualExpanded(true);
      setShowLabelCapture(false);
      resetLabelCapture();
      toast.success(`Read label · ${est.confidence} confidence — review & adjust`);
    } catch (err) {
      toast.error(err.message || "Couldn't read the label");
    } finally {
      setIsReadingLabel(false);
    }
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
    // Total grams, so applying this template later logs a real weight.
    serving_grams: entryServingGrams(newFood),
    calories: Math.round(newFood.calories),
    protein_grams: Number(newFood.protein_grams) || 0,
    carbs_grams: Number(newFood.carbs_grams) || 0,
    fats_grams: Number(newFood.fats_grams) || 0,
  };

  if (newFood.food_name && baseMacros.calories > 0) {
    saveCustomFoodMutation.mutate(buildCustomFoodPayload());
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

  // Total grams this entry represents, resolved now so the log stays readable
  // even if the food's definition changes later. Null when genuinely unknown.
  const entryServingGrams = (data) =>
    gramsForAmount(
      parseFloat(data.serving_amount) || 1,
      data.serving_unit,
      foodServingSizeGrams,
      activePortions
    );

  const addFoodMutation = useMutation({
    mutationFn: async (data) => {
      await db.entities.FoodEntry.create({
        food_name: data.food_name,
        meal_type: data.meal_type,
        serving_size: parseFloat(data.serving_amount) || 1,
        serving_unit: data.serving_unit,
        serving_grams: entryServingGrams(data),
        calories: Math.round(data.calories),
        protein_grams: data.protein_grams,
        carbs_grams: data.carbs_grams,
        fats_grams: data.fats_grams,
        fiber_grams: data.fiber_grams ?? null,
        date: selectedDate,
        created_by: user.id,
        eaten_at: getEatenAt(loggingMode, data.meal_type, selectedDate),
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
    mutationFn: async (entry) => {
      await db.entities.FoodEntry.delete(entry.id);
      return entry;
    },
    onSuccess: (entry) => {
      invalidateFood(queryClient);
      toast("Entry deleted", {
        // Global closeButton (App.jsx) sits top-right, same corner as the
        // trash/edit icons this delete came from — off so it isn't a second
        // tap target fighting Undo right after a mis-tap.
        closeButton: false,
        action: {
          label: "Undo",
          onClick: () => {
            const { id, created_at, ...rest } = entry;
            db.entities.FoodEntry.create(rest)
              .then(() => invalidateFood(queryClient))
              .catch(() => toast.error("Couldn't restore the entry. Check your connection and add it again."));
          },
        },
      });
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
        serving_grams: entryServingGrams(data),
        calories: Math.round(data.calories),
        protein_grams: data.protein_grams,
        carbs_grams: data.carbs_grams,
        fats_grams: data.fats_grams,
        fiber_grams: data.fiber_grams ?? null,
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
      fiber_grams: entry.fiber_grams == null
        ? null
        : Math.round(((entry.fiber_grams || 0) / safeScale) * 10) / 10,
    };
    setIsUsdaFood(false);
    setBaseUnit(unit);
    const savedMatch = customFoods.find(
      (f) => f.food_name.toLowerCase() === String(entry.food_name || "").toLowerCase()
    );
    setActiveFoodId(savedMatch?.id || null);
    setActivePortions(savedMatch ? (portionsByFood[savedMatch.id] || []) : []);
    setPortionsDirty(false);
    // Recover grams-per-unit from the total weight the entry recorded, so editing
    // a logged serving still shows what it weighs.
    setFoodServingSizeGrams(
      entry.serving_grams > 0 && amount > 0 && isServingLikeUnit(unit)
        ? entry.serving_grams / amount
        : null
    );
    setServingHint(null);
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
      fiber_grams: entry.fiber_grams ?? null,
    });
    setSelectedDate(entry.date || format(new Date(), "yyyy-MM-dd"));
    setEditingEntry(entry);
    setShowAddDialog(true);
  };

  // Switching the unit on the logging form.
  //
  // When the weight of one unit is known on both sides, the food itself doesn't
  // change — only how it's described — so the amount is restated to preserve mass.
  // When it isn't (a custom food with no recorded serving weight), no honest
  // conversion exists, so the stored base macros are rebased onto the new unit and
  // the totals on screen stay put for the athlete to correct.
  const changeServingUnit = (value) => {
    if (value === newFood.serving_unit) return;
    const amount = parseFloat(newFood.serving_amount) || 0;
    const fromPerUnit = gramsForAmount(1, newFood.serving_unit, foodServingSizeGrams, activePortions);
    const toPerUnit = gramsForAmount(1, value, foodServingSizeGrams, activePortions);

    if (fromPerUnit != null && toPerUnit > 0) {
      const newAmount = Math.round(((amount * fromPerUnit) / toPerUnit) * 100) / 100;
      setNewFood(prev => ({ ...prev, serving_unit: value, serving_amount: newAmount }));
      return;
    }

    // Land on the quantity the new unit is naturally described in (100 g, or 1 of
    // anything else) so the amount, the totals and the "per X" label all agree.
    const newAmount = baseQuantityForUnit(value);
    setBaseMacros({
      calories: Math.round(parseFloat(newFood.calories) || 0),
      protein_grams: Math.round((parseFloat(newFood.protein_grams) || 0) * 10) / 10,
      carbs_grams: Math.round((parseFloat(newFood.carbs_grams) || 0) * 10) / 10,
      fats_grams: Math.round((parseFloat(newFood.fats_grams) || 0) * 10) / 10,
      fiber_grams: newFood.fiber_grams == null
        ? null
        : Math.round((parseFloat(newFood.fiber_grams) || 0) * 10) / 10,
    });
    setBaseUnit(value);
    setNewFood(prev => ({ ...prev, serving_unit: value, serving_amount: newAmount }));
  };

  // "1 serving (62 g)" under the amount picker. Null when there's nothing
  // truthful to say about what the selected unit weighs.
  const servingEquivalence = formatServingHint({
    amount: parseFloat(newFood.serving_amount) || 0,
    unit: newFood.serving_unit,
    servingGrams: foodServingSizeGrams,
    portions: activePortions,
    household: servingHint,
  });

  // Portion labels this food defines, offered as units in the picker.
  const activePortionLabels = useMemo(() => portionLabels(activePortions), [activePortions]);
  const activePortionMap = useMemo(() => portionsMap(activePortions), [activePortions]);
  // The generic units, minus any the food has already redefined — a food that
  // says "cup = 130 g" must not also offer the 240 g water constant under the
  // same name, and two SelectItems can't share a value anyway.
  const genericUnitOptions = useMemo(
    () => GENERIC_UNITS.filter((u) => !activePortionMap[u.value]),
    [activePortionMap]
  );
  const showServingLikeUnits =
    foodServingSizeGrams > 0 || isServingLikeUnit(newFood.serving_unit) || isServingLikeUnit(baseUnit);

  // Portions live in local state until the food is saved (syncPortions flushes
  // them once there's an id), so they can be typed before the food exists. Once
  // the food does exist, every edit writes straight through — a portion is a
  // property of the food, not of the entry being logged, so it shouldn't wait on
  // whether this particular log gets submitted.
  const persistPortions = (next) => {
    // Without a trustworthy read of what's already stored, a write would
    // reconcile against a list that only looks empty and delete real rows.
    if (portionsUnavailable) {
      toast.error("Can't load this food's portions right now, so they can't be edited yet.");
      return;
    }
    setActivePortions(next);
    setPortionsDirty(true);
    if (activeFoodId) {
      syncPortions(activeFoodId, next)
        .catch((e) => toast.error(`Couldn't save the portion: ${e.message}`));
    }
  };

  const addPortionDraft = () => {
    const label = String(portionDraft.label || "").trim().toLowerCase();
    const grams = parseFloat(portionDraft.grams);
    if (!label) return toast.error("Name the portion first (slice, loaf, scoop…)");
    if (!Number.isFinite(grams) || grams <= 0) return toast.error("Portion needs a gram weight");
    if (activePortionMap[label]) return toast.error(`"${label}" is already a portion of this food`);
    persistPortions([...activePortions, { label, grams, sort_order: activePortions.length }]);
    setPortionDraft({ label: "", grams: "" });
  };

  const removePortion = (label) => {
    const target = String(label).toLowerCase();
    persistPortions(activePortions.filter((p) => String(p.label).toLowerCase() !== target));
    // Logging in a unit that no longer exists would silently lose its gram
    // weight, so fall back to grams.
    if (String(newFood.serving_unit).toLowerCase() === target) changeServingUnit("g");
  };

  // Scale from the stored base macros to what's currently on screen. Shared by
  // the macro inputs so a typed total converts back to a base value correctly.
  const currentScale = scaleFromBase({
    amount: parseFloat(newFood.serving_amount) || 0,
    unit: newFood.serving_unit,
    baseUnit,
    servingGrams: foodServingSizeGrams,
    portions: activePortions,
  });

  const resetForm = () => {
    rollDateForwardRef.current();
    setNewFood({
      food_name: "",
      meal_type: getDefaultMealType(),
      serving_amount: 1,
      serving_unit: "serving",
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fats_grams: 0,
      fiber_grams: null,
    });
    setBaseMacros({ calories: 0, protein_grams: 0, carbs_grams: 0, fats_grams: 0, fiber_grams: null });
    setFoodServingSizeGrams(null);
    setBaseUnit("serving");
    setServingHint(null);
    setIsUsdaFood(false);
    setActivePortions([]);
    setPortionsDirty(false);
    setActiveFoodId(null);
    setPortionDraft({ label: "", grams: "" });
    setPortionsExpanded(false);
    setSearchQuery("");
    setLoggingMode("now");
    setGenericResults([]); setBrandedResults([]);
    setEditingEntry(null);
    setIsEstimatedFood(false);
  };

  const selectFood = (food) => {
    setIsEstimatedFood(false);
    // baseMacros always stored per 100g (USDA/barcode nutrient basis)
    const baseMacroValues = {
      calories: Math.round(food.calories),
      protein_grams: Math.round(food.protein * 10) / 10,
      carbs_grams: Math.round(food.carbs * 10) / 10,
      fats_grams: Math.round(food.fats * 10) / 10,
      // USDA reports fiber for most foods; null when it doesn't.
      fiber_grams: food.fiber == null ? null : Math.round(food.fiber * 10) / 10,
    };
    // MacroFactor-style defaults: when the food has a real serving size,
    // start at "1 serving" (the hint shows its gram equivalent + household
    // text like "2/3 cup (55g)"). Without one, fall back to 100 g/ml.
    const hasRealServing = !!food.servingSize;
    const servingG = food.servingSize || null;
    const fallbackUnit = food.servingSizeUnit === 'ml' ? 'ml' : 'g';
    const unit = hasRealServing ? 'serving' : fallbackUnit;
    const amount = hasRealServing ? 1 : 100;
    const initialScale = (hasRealServing ? servingG : 100) / 100;

    // Null when USDA has no serving data. The picker then stays on grams and the
    // "serving" option is hidden, rather than quietly calling 100 g a serving.
    setFoodServingSizeGrams(servingG);
    setBaseUnit('g');
    setServingHint(food.householdServing || null);
    setIsUsdaFood(true);
    setBaseMacros(baseMacroValues);
    setActiveFoodId(null);
    setActivePortions([]);
    setPortionsDirty(false);
    setNewFood({
      ...newFood,
      food_name: food.description.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      serving_unit: unit,
      serving_amount: amount,
      calories: Math.round(baseMacroValues.calories * initialScale),
      protein_grams: Math.round(baseMacroValues.protein_grams * initialScale * 10) / 10,
      carbs_grams: Math.round(baseMacroValues.carbs_grams * initialScale * 10) / 10,
      fats_grams: Math.round(baseMacroValues.fats_grams * initialScale * 10) / 10,
      fiber_grams: baseMacroValues.fiber_grams == null
        ? null
        : Math.round(baseMacroValues.fiber_grams * initialScale * 10) / 10,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
  };

  // Consumed macros count only EATEN entries — planned (not-yet-checked-off) plan
  // items are shown in the list but don't inflate today's intake until checked.
  const eatenEntries = foodEntries.filter((e) => !e.planned);
  const totals = calculateMacros(eatenEntries);

  // Keep this day's planned portions pinned to the day's CURRENT budget. The
  // engine's target moves daily and off-plan foods get logged, so the un-eaten
  // plan rows are rescaled until eaten + planned = target — checking everything
  // off can then never blow the budget.
  const planFit = usePlannedDayRebalance(selectedDate, foodEntries, targets.calories, targets.proteinFloor);
  const plannedCount = planFit.plannedCount;

  // ── Swap a planned food ────────────────────────────────────────────────────
  // A plan row is a suggestion, not an order: swapping one out re-solves THIS
  // day (today only) through the same optimizer the week plan uses, so the
  // replacement's grams — and every other row's — are recomputed around it.
  const swapDates = useMemo(() => [selectedDate], [selectedDate]);
  const { dayContext, isTrainingDay } = useDayPlanContext(swapDates, { enabled: !!targets.calories });
  const [swapEntry, setSwapEntry] = useState(null);
  const eatenTotals = useMemo(() => ({
    calories: eatenEntries.reduce((s, e) => s + (e.calories || 0), 0),
    protein: eatenEntries.reduce((s, e) => s + (e.protein_grams || 0), 0),
    fats: eatenEntries.reduce((s, e) => s + (e.fats_grams || 0), 0),
  }), [eatenEntries]);

  const foodSwap = useFoodSwap({
    date: selectedDate,
    dayContext,
    trainingDay: isTrainingDay(selectedDate),
    calTarget: targets.calories,
    proteinTarget: targets.protein,
    fatTarget: targets.fats,
    isCut: targets.isCut,
    profile,
    aggressiveCut: targets.aggressiveCut,
    customFoods,
    eatenOverride: eatenTotals,
  });

  const revertSwap = (displaced) => {
    foodSwap.mutate({ original: displaced, replacement: null }, {
      onSuccess: () => { setSwapEntry(null); toast.success(`${displaced} is back on today's plan`); },
      onError: (e) => toast.error(e.message || "Revert failed"),
    });
  };

  const runSwap = (replacement) => {
    const original = swapEntry?.food_name;
    foodSwap.mutate({ original, replacement }, {
      onSuccess: ({ plan }) => {
        setSwapEntry(null);
        const row = plan.rows.find((r) => r.food_name === replacement);
        // No gram number here on purpose: a fresh solve lands a little over
        // budget by design (floor buffer + minServe rounding), so
        // usePlannedDayRebalance may rescale these rows moments later. The
        // row itself always shows the current grams; a toast can't.
        toast.success(row
          ? `Swapped in ${replacement}, day re-fit around it`
          : `${original} removed; ${replacement} didn't fit today's budget`);
      },
      onError: (e) => toast.error(e.message || "Swap failed"),
    });
  };

  // ── Copy a previous day forward ────────────────────────────────────────────
  // The recents list handles one food at a time; this handles "yesterday again",
  // which is most of a repeatable diet.
  const copySourceEntries = allFoodEntries.filter((e) => e.date === copyFromDate);

  const copyDayMutation = useMutation({
    mutationFn: async (entries) => {
      for (const entry of entries) {
        await db.entities.FoodEntry.create({
          food_name: entry.food_name,
          meal_type: entry.meal_type,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
          serving_grams: entry.serving_grams ?? null,
          calories: entry.calories,
          protein_grams: entry.protein_grams,
          carbs_grams: entry.carbs_grams,
          fats_grams: entry.fats_grams,
          fiber_grams: entry.fiber_grams ?? null,
          // Eating it again costs the same as eating it the first time.
          cost_usd: entry.cost_usd ?? null,
          date: selectedDate,
          created_by: user.id,
          // Copies are logged against the meal's usual clock time, not the
          // moment of copying, so eaten_at stays meaningful.
          eaten_at: getEatenAt("earlier", entry.meal_type, selectedDate),
        });
      }
      return entries.length;
    },
    onSuccess: (count) => {
      invalidateFood(queryClient);
      setShowCopyDayDialog(false);
      setCopySelection({});
      toast.success(`Copied ${count} ${count === 1 ? "entry" : "entries"} to ${selectedDate}`);
    },
    onError: (e) => toast.error(`Couldn't copy the day: ${e.message}`),
  });

  // ── Descriptive intake stats ───────────────────────────────────────────────
  // Averages over days actually logged, not over the calendar window: dividing
  // by 7 when only 4 days were logged reports a deficit that never happened.
  const intakeStats = useMemo(() => {
    const start = format(subDays(parseISO(selectedDate), statsWindow - 1), "yyyy-MM-dd");
    const inWindow = allFoodEntries.filter(
      (e) => e.date >= start && e.date <= selectedDate && !e.planned
    );
    const byDate = {};
    for (const e of inWindow) {
      if (!byDate[e.date]) {
        byDate[e.date] = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, fiberKnown: true };
      }
      const d = byDate[e.date];
      d.calories += e.calories || 0;
      d.protein += e.protein_grams || 0;
      d.carbs += e.carbs_grams || 0;
      d.fats += e.fats_grams || 0;
      d.fiber += e.fiber_grams || 0;
      if (e.fiber_grams == null) d.fiberKnown = false;
    }
    const days = Object.values(byDate);
    if (!days.length) return null;

    const mean = (pick) => days.reduce((s, d) => s + pick(d), 0) / days.length;
    const avgCalories = Math.round(mean((d) => d.calories));
    const avgProtein = Math.round(mean((d) => d.protein));
    const avgCarbs = Math.round(mean((d) => d.carbs));
    const avgFats = Math.round(mean((d) => d.fats));
    const fiberDays = days.filter((d) => d.fiberKnown);
    const macroCals = avgProtein * 4 + avgCarbs * 4 + avgFats * 9;

    return {
      daysLogged: days.length,
      windowDays: statsWindow,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFats,
      // Only average fiber over days where every entry reported it — a day with
      // one unknown food understates, and a silent understatement is worse than
      // an absent number.
      avgFiber: fiberDays.length
        ? Math.round((fiberDays.reduce((s, d) => s + d.fiber, 0) / fiberDays.length) * 10) / 10
        : null,
      fiberCompleteDays: fiberDays.length,
      split: macroCals > 0
        ? {
            protein: Math.round(((avgProtein * 4) / macroCals) * 100),
            carbs: Math.round(((avgCarbs * 4) / macroCals) * 100),
            fats: Math.round(((avgFats * 9) / macroCals) * 100),
          }
        : null,
    };
  }, [allFoodEntries, selectedDate, statsWindow]);

  const mealGroups = {
    breakfast: foodEntries.filter(e => e.meal_type === "breakfast"),
    lunch: foodEntries.filter(e => e.meal_type === "lunch"),
    dinner: foodEntries.filter(e => e.meal_type === "dinner"),
    snack: foodEntries.filter(e => e.meal_type === "snack"),
  };

  if (!user) return <LoadingScreen />;

  const changeDate = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
  };

  // 'Today' is a jump-back action, not a status label — only surface it when
  // the user has scrubbed off the current day, so the word is unambiguously
  // tappable and never redundant with a date pill that already reads today.
  const isViewingToday = selectedDate === format(new Date(), 'yyyy-MM-dd');


  return (
    <div className="text-ink" style={{ scrollPaddingBottom: 'calc(var(--dock-clearance) + 88px)' }}>

      {/* Date navigation + action bar */}
      <div className="sticky top-[var(--layout-header-height,0px)] z-20 border-b border-charcoal-border bg-charcoal px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => changeDate(-1)}
            aria-label="Previous day"
            className="flex items-center justify-center w-11 h-11 rounded-lg text-ink-muted hover:text-ink hover:bg-charcoal-surface transition-colors duration-200 [transition-timing-function:var(--ease)]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {/* Styled date control: the native picker is the invisible top layer
              (still tappable across the whole pill), overlaid by a Manrope +
              tabular-nums label so no bright UA calendar box leaks onto the
              dark field. */}
          <label className="relative flex items-center h-11 px-3 glass-inset cursor-pointer">
            <span className="font-technical tabular-nums text-sm font-semibold text-ink">
              {format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Select date"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
          <button
            onClick={() => changeDate(1)}
            aria-label="Next day"
            className="flex items-center justify-center w-11 h-11 rounded-lg text-ink-muted hover:text-ink hover:bg-charcoal-surface transition-colors duration-200 [transition-timing-function:var(--ease)]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isViewingToday && (
            <button
              onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
              className="text-xs font-bold tracking-wide text-ink-secondary hover:text-ink glass-inset px-2.5 h-11 ml-1 flex items-center transition-colors duration-200 [transition-timing-function:var(--ease)]"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Header search/barcode — one tap each, every breakpoint. Search opens
              the Add dialog straight onto its search field (already
              auto-focused there); barcode opens the same dialog underneath the
              full-screen scanner so a found product lands in a visible form.
              Hidden while the Add dialog is open so they don't collide (same
              aria-labels) with that dialog's own search/scan controls. */}
          {!showAddDialog && (
            <>
              <button
                type="button"
                onClick={() => { resetForm(); setShowAddDialog(true); }}
                aria-label="Search food"
                title="Search food"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
              >
                <Search className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => { resetForm(); setShowAddDialog(true); setShowBarcodeScanner(true); }}
                aria-label="Scan barcode"
                title="Scan a barcode"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
              >
                <Camera className="w-[18px] h-[18px]" />
              </button>
            </>
          )}
          {/* Coral discipline: the sticky-bar 'Add Food' is desktop-only — on
              mobile the thumb-zone coral FAB is the SOLE Add-Food affordance, so
              exactly one coral Add-Food exists per viewport. */}
          <Button
            variant="volt"
            size="lg"
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="hidden lg:inline-flex"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Food
          </Button>

          {/* New Meal is a desktop affordance — on mobile it lives in the More
              sheet (Templates, recipes & ideas) so the sticky bar stays compact
              and the thumb-zone coral FAB owns the one Add path. */}
          <Button
            variant="dim"
            size="sm"
            onClick={() => { resetForm(); setMealItems([]); setMealTemplateType("lunch"); setShowNewMealDialog(true); }}
            className="hidden lg:inline-flex"
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            New Meal
          </Button>
        </div>
      </div>

      {/* Thumb-zone FAB — off-white action 'Add Food' in the lower-right, above
          the dock. Mobile only; desktop keeps the sticky-bar button. active:scale-95
          gives a press confirmation (fuel-nutrition-2) on the single easing.
          bottom: var(--floating-chrome-bottom), not a bare 5rem+safe-area —
          the shared token's 12px breathing gap keeps this clear of the dock
          even when the dock's real height drifts a couple px past its nominal
          80px (SF Pro's line-height vs Manrope's caused exactly that). */}
      <button
        type="button"
        onClick={() => { resetForm(); setShowAddDialog(true); }}
        aria-label="Add food"
        className="cta-action lg:hidden fixed right-3 z-30 h-12 w-12 !rounded-full p-0 active:scale-95 transition-transform duration-200 [transition-timing-function:var(--ease)]"
        style={{ bottom: 'var(--floating-chrome-bottom)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

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

            {/* 7-day strip (DESIGN.md/directions "B · Fuel" .wk): a kcal bar per
                day against a dashed goal tick, today highlighted, tap to select —
                reuses the same selectedDate state the date-nav pill above drives. */}
            <div className="grid grid-cols-7 gap-1.5">
              {calorieTrend.map((day) => {
                const isSelected = day.date === selectedDate;
                const isTodayCol = day.date === format(new Date(), 'yyyy-MM-dd');
                // One shared scale across all 7 days (goal × ~1.1 headroom, or the
                // tallest day if someone blew way past goal) so an over-target day
                // visibly crosses its own dashed tick instead of clipping flat.
                const scaleMax = Math.max(
                  ...calorieTrend.map((d) => Math.max(d.calories, d.goal || 0)),
                  1
                ) * 1.02;
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
                    <span className={`text-[11px] font-bold uppercase ${isTodayCol ? 'text-ink' : 'text-ink-muted'}`}>
                      {day.label[0]}
                    </span>
                    <div className="relative w-full h-11 rounded-sm bg-charcoal-surface overflow-hidden">
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-sm"
                        style={{
                          height: `${barPct}%`,
                          background: isSelected ? 'var(--text-primary)' : 'var(--text-faint)',
                        }}
                      />
                      {tickPct != null && (
                        <span
                          className="absolute inset-x-0 border-t border-dashed"
                          style={{ bottom: `${tickPct}%`, borderColor: 'var(--text-secondary)' }}
                        />
                      )}
                    </div>
                    <span className="font-technical text-[11px] font-semibold tabular-nums text-ink-secondary">
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
              const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');
              const calsConsumed = totals.calories;
              const calsGoal = targets.calories;
              const calsRemaining = calsGoal - calsConsumed;
              const macroCols = [
                { label: 'Kcal', consumed: calsConsumed, goal: calsGoal, hue: null },
                { label: 'Protein', consumed: totals.protein, goal: targets.protein, hue: 'var(--hue-coral)' },
                { label: 'Carbs', consumed: totals.carbs, goal: targets.carbs, hue: 'var(--hue-blue)' },
                { label: 'Fat', consumed: totals.fats, goal: targets.fats, hue: 'var(--hue-yellow)' },
              ];
              return (
                <div
                  className="surface px-4 sm:px-5 py-3 -mx-4 sm:-mx-6 rise-in"
                  data-tutorial="nutrition-rings"
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[13px] font-semibold text-muted-2 flex items-center gap-1.5">
                      Intake vs pace
                      {targets.engineSet && (
                        <span className="text-[9px] font-extrabold tracking-wider text-ink-muted glass-inset px-1.5 py-0.5">
                          ENGINE-SET
                        </span>
                      )}
                    </span>
                    <span className="font-technical text-[13px] font-semibold text-ink tabular-nums shrink-0">
                      {calsGoal > 0
                        ? (isToday
                            ? `${Math.abs(Math.round(calsRemaining)).toLocaleString()} kcal ${calsRemaining < 0 ? 'over' : 'left'}`
                            : `${Math.round(calsConsumed).toLocaleString()} / ${Math.round(calsGoal).toLocaleString()} kcal`)
                        : '—'}
                    </span>
                  </div>
                  {isToday && calsConsumed === 0 && plannedCount > 0 && (
                    <span className="chip-gold mb-2 inline-block">
                      {Math.round(planFit.plannedCal)} kcal planned
                    </span>
                  )}
                  <div className="grid grid-cols-4 gap-3">
                    {macroCols.map((c) => {
                      const pct = c.goal > 0 ? Math.min(100, (c.consumed / c.goal) * 100) : 0;
                      return (
                        <div key={c.label} className="min-w-0">
                          <div
                            className="text-[11px] font-semibold mb-1.5 truncate"
                            style={{ color: c.hue || 'var(--text-secondary)' }}
                          >
                            {c.label}
                          </div>
                          <div className="h-2 rounded-full bg-track overflow-hidden">
                            <div
                              className="h-full rounded-full opacity-90"
                              style={{ width: `${pct}%`, background: c.hue || 'var(--text-primary)' }}
                            />
                          </div>
                          <div className="font-technical text-[11px] text-secondary tabular-nums mt-1.5 truncate">
                            {Math.round(c.consumed)}
                            <span className="opacity-60"> / {Math.round(c.goal) || 0}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Fiber: already counted inside carbs, so it gets a plain line
                      rather than a 5th bar that would double-draw the same grams. */}
                  <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t hairline">
                    <span className="text-[10px] text-ink-faint truncate">
                      Fiber{targets.fiberIsDefault ? ' · 14 g / 1000 kcal' : ''}
                    </span>
                    <span className="font-technical text-[11px] font-semibold tabular-nums text-secondary">
                      {Math.round(totals.fiber || 0)}
                      <span className="opacity-60">/{targets.fiber}g</span>
                      {!totals.fiberKnown && <span className="opacity-60 ml-1">+ unknown</span>}
                    </span>
                  </div>
                  {totals.cost > 0 && (
                    <div className="text-right font-technical text-[11px] font-semibold text-ink-muted mt-1">
                      ≈ ${totals.cost.toFixed(2)}
                    </div>
                  )}
                </div>
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
                    <div key={w.label} className="text-xs text-ink-secondary">
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
              <div className="flex items-center gap-2.5 glass px-4 py-2.5 text-xs">
                <span className="w-5 h-5 rounded-full border-[1.5px] border-track shrink-0" />
                <span className="text-ink-secondary flex-1 min-w-0">
                  <span className="font-semibold text-ink">
                    {plannedCount} planned · <span className="text-gold font-technical tabular-nums">{planFit.plannedCal.toLocaleString()} kcal</span>
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

            {/* Repeat a day, and see what the last week actually looked like.
                The recents list handles one food; most of a repeatable diet is
                "the same as yesterday". */}
            <div className="flex items-center gap-2">
              <Button
                variant="dim"
                size="sm"
                className="min-h-[44px]"
                onClick={() => {
                  // Default to the most recent logged day before this one, so
                  // the dialog opens on something rather than an empty date.
                  const prior = allFoodEntries
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
              <Button variant="dim" size="sm" className="min-h-[44px]" onClick={() => setShowIntakeStats((v) => !v)}>
                <Calculator className="w-3.5 h-3.5 mr-1.5" /> Intake stats
                {showIntakeStats ? <ChevronUp className="w-3.5 h-3.5 ml-1.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-1.5" />}
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
                        className={`font-technical text-[10.5px] font-bold px-2 py-1 ${
                          statsWindow === w ? "text-ink glass-inset" : "text-ink-faint hover:text-ink-secondary"
                        }`}
                      >
                        {w}d
                      </button>
                    ))}
                  </div>
                </div>
                {!intakeStats ? (
                  <p className="text-xs text-ink-muted">Nothing logged in the last {statsWindow} days.</p>
                ) : (
                  <>
                    {/* Averaged over days actually logged, not over the calendar
                        window — dividing by 28 when 9 days were logged reports a
                        deficit that never happened. */}
                    <p className="text-[10.5px] text-ink-muted mb-2">
                      Average of {intakeStats.daysLogged} logged {intakeStats.daysLogged === 1 ? "day" : "days"} out of the last {intakeStats.windowDays}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Calories', value: intakeStats.avgCalories, unit: '', hue: 'text-gold' },
                        { label: 'Protein', value: intakeStats.avgProtein, unit: 'g', hue: 'text-coral' },
                        { label: 'Carbs', value: intakeStats.avgCarbs, unit: 'g', hue: 'text-carb' },
                        { label: 'Fats', value: intakeStats.avgFats, unit: 'g', hue: 'text-fat' },
                      ].map(({ label, value, unit, hue }) => (
                        <div key={label} className="glass-inset px-2 py-2 text-center">
                          <div className="text-xs text-ink-muted font-medium">{label}</div>
                          <div className={`font-technical font-semibold text-sm ${hue}`}>{value}{unit}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-ink-secondary">
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
                <p className="text-xs text-ink-muted">Couldn't load this day's food log.</p>
                <Button variant="dim" size="sm" onClick={() => refetchEntries()}>Retry</Button>
              </div>
            ) : entriesLoading ? (
              /* Loading skeletons: bars use the system `bg-track` material with
                 the tokened `.pulse-loop` shimmer (single easing, --loop-dur
                 cadence), a restrained, hue-free placeholder breathe. */
              <div className="surface px-4 sm:px-5 py-2 -mx-4 sm:-mx-6 space-y-4">
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
              {/* Column header caption — kcal/P/C/F once for the whole log */}
              <div className="grid grid-cols-[1fr_42px_32px_32px_32px] gap-x-1.5 text-[11px] uppercase tracking-wider font-semibold text-ink-faint py-2">
                <span />
                <span className="text-right">kcal</span>
                <span className="text-right">P</span>
                <span className="text-right">C</span>
                <span className="text-right">F</span>
              </div>
              {[
                { mealType: 'breakfast', label: 'Breakfast' },
                { mealType: 'lunch',     label: 'Lunch' },
                { mealType: 'dinner',    label: 'Dinner' },
                { mealType: 'snack',     label: 'Snack' },
              ].map(({ mealType, label }, i) => {
                const entries = mealGroups[mealType];
                const mealCals = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
                const mealP = entries.reduce((sum, e) => sum + (e.protein_grams || 0), 0);
                const mealC = entries.reduce((sum, e) => sum + (e.carbs_grams || 0), 0);
                const mealF = entries.reduce((sum, e) => sum + (e.fats_grams || 0), 0);
                const mealCost = entries.reduce((sum, e) => sum + (e.cost_usd || 0), 0);
                const hasEntries = entries.length > 0;
                // Earliest VALID eaten_at across the meal's entries, for the
                // header time badge — date-fns `format` throws on an invalid
                // Date, so a bad/missing timestamp is skipped, not fatal.
                const mealTime = entries.reduce((earliest, e) => {
                  if (!e.eaten_at) return earliest;
                  const d = new Date(e.eaten_at);
                  if (!isValid(d)) return earliest;
                  return !earliest || d < earliest ? d : earliest;
                }, null);
                return (
                  <section key={mealType} className={i > 0 ? 'mt-1 pt-1 border-t hairline' : ''}>
                    {/* Meal header row */}
                    <div className="grid grid-cols-[1fr_42px_32px_32px_32px] gap-x-1.5 items-center py-2.5 border-b hairline">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${hasEntries ? 'bg-ink-secondary' : 'bg-track'}`} />
                        <span className="text-[14.5px] font-bold text-ink truncate">{label}</span>
                        {mealTime && (
                          <span className="font-technical text-[11px] font-semibold text-ink-muted shrink-0">
                            {format(mealTime, 'h:mm a')}
                          </span>
                        )}
                        {mealCost > 0 && (
                          <span className="font-technical text-[10px] font-semibold text-ink-muted shrink-0">
                            ${mealCost.toFixed(2)}
                          </span>
                        )}
                        {hasEntries && (
                          <button
                            onClick={() => { setTemplateEntries(entries); setTemplateMealType(mealType); setShowSaveTemplateDialog(true); }}
                            className="ml-auto shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1 text-ink-faint hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]"
                            aria-label="Save meal as template"
                            title="Save as template"
                          >
                            <Bookmark className="w-[15px] h-[15px] sm:w-3.5 sm:h-3.5" />
                          </button>
                        )}
                      </div>
                      {hasEntries ? (
                        <>
                          <span className="font-technical text-[13px] font-bold text-ink text-right tabular-nums">{Math.round(mealCals)}</span>
                          <span className="font-technical text-[13px] font-bold text-coral text-right tabular-nums">{Math.round(mealP)}</span>
                          <span className="font-technical text-[13px] font-bold text-carb text-right tabular-nums">{Math.round(mealC)}</span>
                          <span className="font-technical text-[13px] font-bold text-fat text-right tabular-nums">{Math.round(mealF)}</span>
                        </>
                      ) : <span className="col-span-4" />}
                    </div>

                    {/* Food rows */}
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        /* One row system: hairline-separated tiles. The faint
                           glass-inset fill is RESERVED for planned (not-yet-
                           eaten) rows so it reads as a distinct state, not a
                           decorative zebra. */
                        className={`grid grid-cols-[1fr_42px_32px_32px_32px] gap-x-1.5 items-center py-2.5 border-b hairline tile-interactive group ${entry.planned ? 'row-stripe' : ''}`}
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
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[13px] font-bold tracking-tight truncate ${entry.planned ? 'text-ink-muted' : 'text-ink'}`}>{entry.food_name}</span>
                              {entry.tag && (
                                <span className="section-label shrink-0 glass-inset px-1.5 py-0.5">
                                  {entry.tag === 'pre' ? 'Pre-WO' : 'Post-WO'}
                                </span>
                              )}
                            </div>
                            {/* Muted quantity line under the name */}
                            {formatEntryServing(entry) && (
                              <span className="block text-[10.5px] font-technical mt-0.5 font-semibold text-ink-muted truncate">
                                {formatEntryServing(entry)}{entry.planned ? ' · planned' : ''}
                                {entry.cost_usd != null && ` · $${entry.cost_usd.toFixed(2)}`}
                              </span>
                            )}
                          </div>
                          {/* Edit/delete/swap — same handlers and aria-labels as
                              before, just compacted to sit beside the numeric
                              columns instead of the FAB-clearance gutter. Every
                              row keeps a real 44px tap target on mobile. */}
                          <div className="shrink-0 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 [transition-timing-function:var(--ease)]">
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
                        <span data-field="kcal" className={`font-technical text-[13px] font-semibold text-ink text-right tabular-nums ${entry.planned ? 'opacity-45' : ''}`}>{entry.calories ?? 0}</span>
                        <span data-field="protein" className={`font-technical text-[13px] font-semibold text-ink text-right tabular-nums ${entry.planned ? 'opacity-45' : ''}`}>{entry.protein_grams ?? 0}</span>
                        <span data-field="carbs" className={`font-technical text-[13px] font-semibold text-ink text-right tabular-nums ${entry.planned ? 'opacity-45' : ''}`}>{entry.carbs_grams ?? 0}</span>
                        <span data-field="fats" className={`font-technical text-[13px] font-semibold text-ink text-right tabular-nums ${entry.planned ? 'opacity-45' : ''}`}>{entry.fats_grams ?? 0}</span>
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
                      <span className="text-[13px] font-bold text-ink-muted group-hover:text-brand">Add to {label.toLowerCase()}</span>
                    </button>
                  </section>
                );
              })}
            </div>
            )}

            {/* Save full day as template */}
            {foodEntries.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => { setTemplateEntries(foodEntries); setTemplateMealType(null); setShowSaveTemplateDialog(true); }}
                  className={`${GHOST_DASHED} ${GHOST_DASHED_HOVER} rounded-xl px-4 py-2.5`}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Day as Template
                </button>
              </div>
            )}

            {/* Mobile: goals breakdown (tap-to-expand) + entry to More sheet */}
            <div className="lg:hidden space-y-3.5 pt-1">
              {/* Goals card — tap header to reveal the macro breakdown */}
              <div className="glass overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGoalsExpanded(v => !v)}
                  aria-expanded={goalsExpanded}
                  className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 hover:bg-charcoal-surface2/60 transition-colors duration-200 [transition-timing-function:var(--ease)]"
                >
                  <span className="section-label">Nutrition goals</span>
                  <div className="flex items-center gap-3">
                    <span className="font-technical text-xs font-bold text-ink">{targets.calories}<span className="opacity-50 font-normal ml-0.5">kcal</span></span>
                    {goalsExpanded ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                  </div>
                </button>
                {goalsExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t hairline">
                    {/* fuel-nutrition-7: the kcal goal already reads in the header
                        row above, so the breakdown carries only the P/C/F macros it
                        uniquely adds — no second kcal restatement. */}
                    <div className="grid grid-cols-3 gap-y-2 gap-x-4 mt-3">
                      {[
                        { label: 'Protein', value: targets.protein, unit: 'g' },
                        { label: 'Carbs', value: targets.carbs, unit: 'g' },
                        { label: 'Fats', value: targets.fats, unit: 'g' },
                      ].map(({ label, value, unit }) => (
                        <div key={label} className="flex justify-between items-center">
                          <span className="text-xs text-ink-secondary uppercase font-bold">{label}</span>
                          <span className="font-technical text-xs font-bold text-ink">{value}<span className="opacity-50 font-normal ml-0.5 text-xs">{unit}</span></span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowGoalsModal(true)}
                      className={`${GHOST_DASHED} ${GHOST_DASHED_HOVER} mt-3 w-full py-2 rounded-lg`}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Goals
                    </button>
                  </div>
                )}
              </div>

              {/* Tail content (Templates / Cut apply / Recipes / Meal-plan ideas) tucked behind a sheet */}
              <button
                type="button"
                onClick={() => setShowMoreSheet(true)}
                className="w-full min-h-[44px] glass glass-interactive flex items-center justify-between px-4 py-3 text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
              >
                <span className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
                  <BookOpen className="w-3.5 h-3.5" /> Templates, recipes &amp; ideas
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

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
                            <div className="glass-elevated rounded-lg px-2.5 py-1.5 text-xs text-ink-muted space-y-0.5">
                              <p className="font-semibold">{d.label}</p>
                              <p className="text-gold font-technical">{d.calories} kcal eaten</p>
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
                <div className="h-16 flex items-center justify-center text-xs text-ink-muted">
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
                    <span className="text-xs text-ink-secondary uppercase font-semibold">{label}</span>
                    <span className="font-technical text-xs font-bold text-ink">{value}<span className="opacity-40 font-normal ml-0.5 text-xs">{unit}</span></span>
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
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors duration-200 [transition-timing-function:var(--ease)] ${
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
                    className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-brand hover:text-[var(--brand-bright)] transition-colors duration-200 [transition-timing-function:var(--ease)]"
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
                calorieGoal={targets.calories}
                proteinGoal={targets.protein}
                carbsGoal={targets.carbs}
                fatsGoal={targets.fats}
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
          }
        }}>
          <DialogContent sheetMinHeight="min-h-[85dvh]" className="max-w-lg flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border shrink-0">
              <DialogTitle>{editingEntry ? "Edit Food Entry" : "Add Food Entry"}</DialogTitle>
              <DialogDescription>
                Logging to <span className="font-technical font-semibold text-ink tabular-nums">{format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')}</span>
              </DialogDescription>
            </DialogHeader>

              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                {/* Quick-meal: describe or photograph a whole meal and split it
                    into items. Sits above search as the fast path for travel /
                    restaurants where weighing each item isn't possible. */}
                {!editingEntry && (
                  <button
                    type="button"
                    onClick={() => { resetMealEstimator(); setShowMealEstimator(true); }}
                    className="w-full flex items-center gap-2.5 rounded-lg border border-charcoal-border bg-charcoal-elevated px-4 py-3 text-left hover:bg-[var(--glass-bg)] transition-colors min-h-[44px]"
                  >
                    <Sparkles className="w-4 h-4 text-brand shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-ink">Log a whole meal</span>
                      <span className="block text-[11px] text-ink-muted">Describe it or snap a photo — splits into items</span>
                    </span>
                    <Camera className="w-4 h-4 text-ink-muted shrink-0" />
                  </button>
                )}
                <div>
                  <Label htmlFor="search">Search USDA Database</Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                      <Input
                        id="search"
                        ref={searchRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search for a food..."
                        className="pl-10 pr-3"
                      />
                      {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted spin-loop" />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="dim"
                      size="lg"
                      onClick={() => setShowBarcodeScanner(true)}
                      className="shrink-0 min-w-[44px]"
                      aria-label="Scan barcode"
                      title="Scan a barcode"
                    >
                      <Camera className="w-4 h-4" />
                      <span className="text-xs font-medium">Scan</span>
                    </Button>
                  </div>

                      {/* Search results: My Foods → Generic → Branded */}
                      {fuzzyFallback && (genericResults.length > 0 || brandedResults.length > 0) && (
                        <p className="mt-1.5 text-xs text-ink-muted px-1">Showing approximate results for "{searchQuery}"</p>
                      )}
                      {(matchingCustomFoods.length > 0 || genericResults.length > 0) && (
                        /* add-food-dialog-4: cap the results list on MOBILE too
                           (max-h-[50vh] + scroll), not just md+, so a long result
                           set never pushes the manual-entry/AI paths off-screen. */
                        <div className="mt-2 max-h-[50vh] md:max-h-64 overflow-y-auto overscroll-contain border border-charcoal-border rounded-lg bg-charcoal-surface divide-y divide-charcoal-border">
                          {/* My saved foods */}
                          {matchingCustomFoods.length > 0 && (
                            <>
                              <div className="section-label px-3 py-1.5 bg-charcoal-elevated flex items-center gap-1 sticky top-0">
                                <Star className="w-3 h-3" /> My Foods
                              </div>
                              {matchingCustomFoods.map((food) => (
                                <div key={food.id} className="flex items-center hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                  <button onClick={() => selectCustomFood(food)} className="flex-1 text-left px-4 py-3 min-h-[44px]">
                                    <div className="font-medium text-ink text-sm">{food.food_name}</div>
                                    <MacroResultLine cal={food.calories} p={food.protein_grams} c={food.carbs_grams} f={food.fats_grams} />
                                  </button>
                                  <FavoriteToggle food={food} onToggle={toggleFavoriteFoodMutation.mutate} />
                                </div>
                              ))}
                            </>
                          )}
                          {/* Generic whole foods (Foundation + SR Legacy) */}
                          {genericResults.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-ink-muted sticky top-0">
                                Generic Foods
                              </div>
                              {genericResults.map((food) => (
                                <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                  <div className="font-medium text-ink text-sm">{food.description}</div>
                                  <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} per100g />
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
                                className="w-full px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-ink-muted flex items-center justify-between sticky top-0 hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)]"
                              >
                                <span>Branded Foods ({brandedResults.length})</span>
                                {showBranded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              {showBranded && brandedResults.map((food) => (
                                <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                  <div className="font-medium text-ink text-sm">{food.description}</div>
                                  {food.brandOwner && <div className="text-xs text-ink-muted">{food.brandOwner}</div>}
                                  <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} />
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}

                      {/* add-food-dialog-1 + -2: a query that returns nothing renders
                          an INLINE neutral-glass message (no spectrum color), with a
                          forward action pointing at the AI "describe it" path so a
                          dead-end search still moves the athlete forward.
                          When the USDA proxy errors out, show an inline error block
                          with a Retry button instead of the "No matches" message —
                          the two states are mutually exclusive. */}
                      {searchQuery.length >= 2 && !isSearching
                        && matchingCustomFoods.length === 0
                        && genericResults.length === 0
                        && brandedResults.length === 0 && (
                        searchError ? (
                          <div className="mt-2 glass-inset px-4 py-3 text-center space-y-2">
                            <p className="text-xs text-ink-secondary">
                              Could not reach the food database.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="w-full min-h-[44px]"
                              onClick={() => {
                                setSearchError(false);
                                setSearchRetry(n => n + 1);
                              }}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-2 glass-inset px-4 py-3 text-center space-y-2">
                            <p className="text-xs text-ink-secondary">
                              No matches for <span className="text-ink font-semibold">"{searchQuery}"</span>.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setEstimateInput(searchQuery);
                                document.getElementById("ai-estimate")?.focus();
                              }}
                              className="w-full min-h-[44px] cta-ghost active:scale-[0.99] transition-transform duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <Sparkles className="w-4 h-4" />
                              Estimate it with AI instead
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    {/* When not searching and no food selected: show Recent Foods + My Foods */}
                    {searchQuery.length < 2 && !newFood.food_name && (
                      <div className="space-y-2">
                        {recentFoods.length > 0 && (
                          <div className="border border-charcoal-border rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setRecentExpanded(!recentExpanded)}
                              className="w-full px-3 min-h-[44px] py-2 bg-charcoal-elevated text-xs font-semibold text-ink-muted flex items-center justify-between hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <span>Recent</span>
                              {recentExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {recentExpanded && recentFoods.map((entry, i) => (
                              <button key={i} onClick={() => selectRecentFood(entry)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated border-b border-charcoal-border last:border-b-0 transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                <div className="font-medium text-ink text-sm">{entry.food_name}</div>
                                {/* add-food-dialog-3: never render a bare "1" — show
                                    the amount WITH its unit, or omit when there's no
                                    unit and the amount is the meaningless default 1. */}
                                {formatEntryServing(entry) && (
                                  <div className="text-[11px] text-ink-muted font-technical tabular-nums">{formatEntryServing(entry)}</div>
                                )}
                                <MacroResultLine cal={entry.calories} p={entry.protein_grams} c={entry.carbs_grams} f={entry.fats_grams} />
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => document.getElementById("import-foods-csv-input").click()}
                            className="min-h-[44px] px-2 text-xs text-ink-muted hover:text-brand flex items-center gap-1"
                            title="Import foods from CSV"
                          >
                            <Upload className="w-3 h-3" /> Import CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowFoodFormatGuide(true)}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-brand"
                            title="CSV format guide"
                          >
                            <HelpCircle className="w-3 h-3" />
                          </button>
                          <input
                            id="import-foods-csv-input"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportFoodsCSV}
                          />
                        </div>
                        {customFoods.length > 0 && (
                          <div className="border border-charcoal-border rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setMyFoodsExpanded(!myFoodsExpanded)}
                              className="w-full px-3 py-1.5 bg-charcoal-elevated section-label flex items-center justify-between hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <span className="flex items-center gap-1"><Star className="w-3 h-3" /> My Foods ({customFoods.length})</span>
                              {myFoodsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {myFoodsExpanded && (
                              <div className="md:max-h-36 md:overflow-y-auto">
                                {sortedCustomFoods.map((food) => (
                                  <div key={food.id} className="flex items-center hover:bg-charcoal-elevated border-b border-charcoal-border last:border-b-0 transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                    <button onClick={() => selectCustomFood(food)} className="flex-1 text-left px-4 py-3 min-h-[44px]">
                                      <div className="font-medium text-ink text-sm">{food.food_name}</div>
                                      <MacroResultLine cal={food.calories} p={food.protein_grams} c={food.carbs_grams} f={food.fats_grams} />
                                    </button>
                                    <FavoriteToggle food={food} onToggle={toggleFavoriteFoodMutation.mutate} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI estimate — describe a food when exact macros aren't in the DB */}
                    <div className="border-t border-charcoal-border pt-4">
                      <Label htmlFor="ai-estimate" className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand" /> Can't find it? Describe it
                      </Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id="ai-estimate"
                          value={estimateInput}
                          onChange={(e) => setEstimateInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); estimateFood(); } }}
                          placeholder="e.g., 8 oz grilled chicken breast"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="dim"
                          size="lg"
                          onClick={estimateFood}
                          disabled={isEstimating || !estimateInput.trim()}
                          className="shrink-0 min-w-[92px]"
                        >
                          {isEstimating ? <Loader2 className="w-4 h-4 spin-loop" /> : <><Sparkles className="w-4 h-4" /> Estimate</>}
                        </Button>
                      </div>
                      {isEstimatedFood ? (
                        <p className="mt-1.5 text-[11px] text-brand flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> AI estimate filled in below — review the macros and adjust before logging.
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-ink-muted">Estimated from the name + portion. Best with an explicit amount (oz, g, cups).</p>
                      )}
                    </div>

                    {/* add-food-dialog-5: the AI-estimate section above already
                        opens this "alternatives to search" zone with a single
                        border-t rule; the manual-entry disclosure that follows it
                        drops its own top border so the two don't stack into a
                        double divider, spacing alone (pt-1) separates them. */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setManualExpanded(v => !v)}
                        aria-expanded={manualExpanded}
                        className="w-full min-h-[44px] flex items-center justify-between text-left mb-1"
                      >
                        <span className="section-label">Manual entry</span>
                        {manualExpanded ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                      </button>

                      {manualExpanded && (
                      <div className="space-y-4 pt-1">
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

                        <div>
                          <LoggingModeToggle value={loggingMode} onChange={setLoggingMode} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="meal_type">Meal Type</Label>
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
                                type="number" inputMode="decimal"
                                value={newFood.serving_amount}
                                onChange={(e) => setNewFood({ ...newFood, serving_amount: e.target.value })}
                                min="0"
                                step="0.5"
                                className="w-20"
                              />
                              <Select
                                value={newFood.serving_unit}
                                onValueChange={changeServingUnit}
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {/* The food's own portions come first — they're the
                                      only units here whose gram weight this food
                                      actually vouches for. */}
                                  {activePortionLabels.map((label) => (
                                    <SelectItem key={label} value={label}>
                                      {label} ({activePortionMap[label]}g)
                                    </SelectItem>
                                  ))}
                                  {/* Serving-like units only appear when the food's own
                                      weight backs them up, or when it's already stored
                                      that way. Otherwise "1 serving" means nothing. */}
                                  {showServingLikeUnits && !activePortionMap.serving && (
                                    <SelectItem value="serving">serving(s)</SelectItem>
                                  )}
                                  {showServingLikeUnits && !activePortionMap.piece && (
                                    <SelectItem value="piece">piece(s)</SelectItem>
                                  )}
                                  {genericUnitOptions.map((u) => (
                                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {servingEquivalence && (
                              <p className="font-technical text-[10.5px] font-semibold text-ink-faint mt-1">{servingEquivalence}</p>
                            )}
                          </div>
                        </div>

                        {/* The weight of one serving. This is the number that was
                            missing: without it a homemade food's "serving" is a
                            guess, and every unit conversion from it is too. */}
                        {isServingLikeUnit(newFood.serving_unit) && (
                          <div>
                            <Label htmlFor="serving_grams">
                              Weight of 1 {newFood.serving_unit} (g)
                            </Label>
                            <Input
                              id="serving_grams"
                              type="number" inputMode="decimal"
                              placeholder="e.g. 62"
                              value={foodServingSizeGrams ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const g = parseFloat(raw);
                                setFoodServingSizeGrams(raw === "" || !Number.isFinite(g) || g <= 0 ? null : g);
                              }}
                              className="mt-1"
                              min="0"
                              step="1"
                            />
                            <p className="text-[10.5px] text-ink-muted mt-1">
                              {foodServingSizeGrams > 0
                                ? "Saved with the food, so grams and servings stay interchangeable."
                                : "Optional. Weigh one serving once and every log after it is exact."}
                            </p>
                          </div>
                        )}

                        {/* Named portions. One food, many honest units: a slice is
                            62 g and a loaf is 800 g, and both beat any generic
                            table because this food defined them. */}
                        {!isUsdaFood && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setPortionsExpanded((v) => !v)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-ink"
                            >
                              {portionsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              Portions
                              {activePortions.length > 0 && (
                                <span className="font-technical text-ink-faint">({activePortions.length})</span>
                              )}
                            </button>

                            {portionsExpanded && (
                              <div className="mt-2 space-y-2">
                                {activePortions.length === 0 && (
                                  <p className="text-[10.5px] text-ink-muted">
                                    Weigh one and name it. "slice = 62 g" turns every future log into a count.
                                  </p>
                                )}
                                {activePortions.map((p) => (
                                  <div key={p.label} className="flex items-center gap-2 glass-inset px-2 py-1.5">
                                    <span className="text-xs text-ink flex-1">{p.label}</span>
                                    <span className="font-technical text-xs font-semibold text-ink-secondary">{p.grams}g</span>
                                    <button
                                      type="button"
                                      onClick={() => removePortion(p.label)}
                                      aria-label={`Remove ${p.label} portion`}
                                      className="text-ink-faint hover:text-coral"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="slice"
                                    value={portionDraft.label}
                                    onChange={(e) => setPortionDraft((d) => ({ ...d, label: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPortionDraft(); } }}
                                    className="flex-1"
                                  />
                                  <Input
                                    type="number" inputMode="decimal"
                                    placeholder="g"
                                    value={portionDraft.grams}
                                    onChange={(e) => setPortionDraft((d) => ({ ...d, grams: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPortionDraft(); } }}
                                    className="w-20"
                                    min="0"
                                    step="1"
                                  />
                                  <Button type="button" variant="outline" size="sm" onClick={addPortionDraft}>
                                    <Plus className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {(isUsdaFood ? newFood.calories > 0 : baseMacros.calories > 0 || baseMacros.protein_grams > 0) && (
                          <>
                          <p className="section-label">Total for {newFood.serving_amount} {newFood.serving_unit}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { label: 'Calories', value: Math.round(newFood.calories), unit: '', hue: 'text-gold' },
                              { label: 'Protein', value: newFood.protein_grams, unit: 'g', hue: 'text-coral' },
                              { label: 'Carbs', value: newFood.carbs_grams, unit: 'g', hue: 'text-carb' },
                              { label: 'Fats', value: newFood.fats_grams, unit: 'g', hue: 'text-fat' },
                              ...(newFood.fiber_grams != null && newFood.fiber_grams !== ''
                                ? [{ label: 'Fiber', value: newFood.fiber_grams, unit: 'g', hue: 'text-ink-secondary' }]
                                : []),
                            ].map(({ label, value, unit, hue }) => (
                              <div key={label} className="glass-inset px-2 py-2 text-center">
                                <div className="text-xs text-ink-muted font-medium">{label}</div>
                                <div className={`font-technical font-semibold text-sm ${hue}`}>{value}{unit}</div>
                              </div>
                            ))}
                          </div>
                          </>
                        )}

                        <p className="text-xs text-ink-muted">
                          Edit base values,{' '}
                          {isUsdaFood
                            ? `per ${newFood.serving_unit}`
                            : (({ g: 'per 100g', ml: 'per 100ml', oz: 'per 1 oz', cup: 'per 1 cup', tbsp: 'per 1 tbsp', tsp: 'per 1 tsp', piece: 'per piece', serving: 'per serving' })[baseUnit] || 'per serving')}
                          {isUsdaFood ? ' (total above scales with amount)' : ''}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="calories">Calories</Label>
                            <Input
                              id="calories"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.calories : baseMacros.calories) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, calories: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, calories: Math.round((parseFloat(raw) || 0) / currentScale) }));
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
                            <Label htmlFor="protein">Protein (g)</Label>
                            <Input
                              id="protein"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.protein_grams : baseMacros.protein_grams) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, protein_grams: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, protein_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
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
                            <Label htmlFor="carbs">Carbs (g)</Label>
                            <Input
                              id="carbs"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.carbs_grams : baseMacros.carbs_grams) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, carbs_grams: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, carbs_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
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
                            <Label htmlFor="fats">Fats (g)</Label>
                            <Input
                              id="fats"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.fats_grams : baseMacros.fats_grams) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, fats_grams: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, fats_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
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

                          {/* Fiber is optional and stays null when blank. Blank
                              means unknown, which is not the same as zero — the
                              daily average only counts days where every entry
                              reported it. */}
                          <div>
                            <Label htmlFor="fiber">Fiber (g)</Label>
                            <Input
                              id="fiber"
                              type="number" inputMode="decimal"
                              placeholder="optional"
                              value={(isUsdaFood ? newFood.fiber_grams : baseMacros.fiber_grams) ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const blank = raw === "";
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, fiber_grams: blank ? null : raw }));
                                  if (!blank && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, fiber_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
                                  }
                                  if (blank) setBaseMacros(prev => ({ ...prev, fiber_grams: null }));
                                } else {
                                  setBaseMacros({ ...baseMacros, fiber_grams: blank ? null : raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>
                        </div>

                        {/* Form-validation attention, not a biometric — neutral
                            glass-inset + ink hierarchy; coral lives ONLY on the
                            corrective action (SYS-09c). */}
                        {macroCalcWarning && (
                          <div className="glass-inset px-3 py-2 text-xs text-ink-secondary">
                            <div className="flex items-center gap-1.5 font-semibold text-ink mb-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-ink-muted" />
                              Macros don't match calories
                            </div>
                            <p>P+C+F = <strong className="text-ink">{macroCalcWarning.calculated} cal</strong>, but you entered <strong className="text-ink">{baseMacros.calories} cal</strong>.</p>
                            <button
                              type="button"
                              className="mt-1 underline font-semibold text-brand"
                              onClick={() => setBaseMacros(prev => ({ ...prev, calories: macroCalcWarning.calculated }))}
                            >
                              Use {macroCalcWarning.calculated} kcal instead
                            </button>
                          </div>
                        )}
                      </div>
                      )}
                  </div>
                </div>

              {/* Fixed footer — only mounts once a food is selected/typed, so
                  the search-first sheet isn't capped by a dead submit bar while
                  browsing results. */}
              {(editingEntry || newFood.food_name) && (
              <div className="px-6 pt-4 border-t bg-charcoal-surface shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <Button
                  onClick={() => {
                    // No hard max, just a once-per-submit gut check: a typo'd
                    // amount (10000g instead of 1000g) silently wrecks the
                    // day's ring with no other feedback. Mirrors the
                    // train-logger heavy-weight confirm.
                    const computedCalories = Math.round(parseFloat(newFood.calories) || 0);
                    // Editing an already-logged big entry (renaming it, moving
                    // its meal) with the calories unchanged isn't a typo.
                    const unchangedEdit = editingEntry
                      && computedCalories === Math.round(Number(editingEntry.calories) || 0);
                    if (computedCalories > 2500 && !unchangedEdit) {
                      const ok = window.confirm(
                        `That's ${computedCalories.toLocaleString()} kcal, log it?`
                      );
                      if (!ok) return;
                    }
                    if (editingEntry) {
                      updateFoodMutation.mutate({ id: editingEntry.id, data: newFood });
                      return;
                    }
                    addFoodMutation.mutate(newFood);
                    // Save manually-entered foods to custom_foods (fire-and-forget, per-serving values)
                    if (newFood.food_name && baseMacros.calories > 0) {
                      saveCustomFoodMutation.mutate(buildCustomFoodPayload());
                    }
                  }}
                  // Block a blank/zero amount: it would log a real entry with 0
                  // calories and serving_size coerced to 1 (a silent empty log).
                  disabled={!newFood.food_name || (parseFloat(newFood.serving_amount) || 0) <= 0 || addFoodMutation.isPending || updateFoodMutation.isPending}
                  variant="volt"
                  size="lg"
                  className="w-full"
                  data-tutorial="add-food-submit"
                >
                  {(addFoodMutation.isPaused || updateFoodMutation.isPaused) ? (
                    // React Query's default networkMode pauses (not fails) a
                    // mutation while navigator.onLine is false — it resumes on
                    // its own on reconnect, so this is honest, not an error.
                    "Offline - saves when you're back online"
                  ) : (addFoodMutation.isPending || updateFoodMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 spin-loop" />
                      {editingEntry ? "Saving..." : "Adding..."}
                    </>
                  ) : (
                    editingEntry ? "Save Changes" : "Add Food"
                  )}
                </Button>
              </div>
              )}
            </DialogContent>
          </Dialog>
        )}

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
                className="w-full glass-inset rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint resize-none focus-visible:ring-1 focus-visible:ring-brand"
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
              <p className="text-[11px] text-ink-muted">
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
                      <div className="text-sm font-bold text-ink truncate">{it.food_name}</div>
                      <div className="font-technical text-[11px] text-ink-muted">
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
                  <div className="flex items-center justify-between text-sm font-bold text-ink border-t border-charcoal-border pt-2">
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

      {/* ─── Nutrition-label reader (barcode-miss fallback) ─── */}
      <Dialog open={showLabelCapture} onOpenChange={(open) => { setShowLabelCapture(open); if (!open) resetLabelCapture(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Read a nutrition label</DialogTitle>
            <DialogDescription>
              Barcode missed it? Snap the Nutrition Facts panel and type the product name. The macros read straight off the label.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={labelPhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={pickLabelPhoto}
          />

          <div className="space-y-3">
            <div>
              <Label htmlFor="label-name">Product name</Label>
              <Input
                id="label-name"
                value={labelName}
                onChange={(e) => setLabelName(e.target.value)}
                placeholder="e.g. Chobani vanilla yogurt"
                disabled={isReadingLabel}
                className="mt-1"
              />
            </div>
            {labelPhoto ? (
              <div className="relative">
                <img src={labelPhoto.previewUrl} alt="Nutrition label to read" className="w-full rounded-lg object-contain max-h-72 bg-black/40" />
                <button
                  type="button"
                  onClick={() => setLabelPhoto((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; })}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"
                  aria-label="Remove photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="dim" size="lg" className="w-full" onClick={() => labelPhotoInputRef.current?.click()} disabled={isReadingLabel}>
                <Camera className="w-4 h-4" /> Photograph the label
              </Button>
            )}
            <Button
              type="button"
              variant="volt"
              size="lg"
              className="w-full"
              onClick={readLabel}
              disabled={isReadingLabel || !labelPhoto}
            >
              {isReadingLabel ? <><Loader2 className="w-4 h-4 spin-loop" /> Reading…</> : <><Camera className="w-4 h-4" /> Read label</>}
            </Button>
            <p className="text-[11px] text-ink-muted">
              Reads the printed numbers, so it's accurate when the panel is sharp and fully in frame. Review before logging.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Goals Modal ─── */}
      <Dialog open={showGoalsModal} onOpenChange={setShowGoalsModal}>
        <DialogContent className="max-w-lg flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border shrink-0">
            <DialogTitle>Nutrition Goals</DialogTitle>
            <DialogDescription>
              Set your daily calorie and macro targets, or sync them to your active phase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5" style={{ WebkitOverflowScrolling: 'touch' }}>
            <GoalsFormContent
              activePhase={activePhase}
              tdee={tdee}
              profile={profile}
              latestWeight={latestWeight}
              proteinPerLb={proteinPerLb}
              setProteinPerLb={setProteinPerLb}
              goalForm={goalForm}
              setGoalForm={setGoalForm}
              fiberGoal={fiberGoal}
              setFiberGoal={setFiberGoal}
              // The DRI default off the calorie target the day actually resolved
              // to (engine rec first), not off the profile goal — otherwise the
              // dialog promises a number the daily readout contradicts.
              fiberDefault={Math.round((targets.calories / 1000) * 14)}
              navigate={navigate}
              setShowGoalsModal={setShowGoalsModal}
              setShowStatsModal={setShowStatsModal}
            />
          </div>
          {/* Save pinned to a non-scrolling footer (out of overflow-y-auto). The
              dialog uses p-0 so it skips the primitive's safe-area pad, re-add it
              here so the CTA clears the home-indicator. */}
          <div className="px-6 pt-4 border-t bg-charcoal-surface shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <Button variant="volt" className="w-full" disabled={updateGoalsMutation.isPending}
              onClick={() => updateGoalsMutation.mutate({
                daily_calorie_goal: parseInt(goalForm.daily_calorie_goal) || 0,
                daily_protein_goal: parseInt(goalForm.daily_protein_goal) || 0,
                daily_carbs_goal:   parseInt(goalForm.daily_carbs_goal)   || 0,
                daily_fats_goal:    parseInt(goalForm.daily_fats_goal)    || 0,
                // Null clears it and hands fiber back to the DRI ratio, which is
                // a real choice — don't coerce a blank field to 0 g of fiber.
                daily_fiber_goal:   fiberGoal === "" ? null : (parseInt(fiberGoal) || null),
              })}
            >
              {updateGoalsMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 spin-loop" />Saving...</>
                : <><Save className="w-4 h-4 mr-2" />Save Goals</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Mobile "More" sheet: Templates · Recipes · Meal-plan ideas ─── */}
      <Dialog open={showMoreSheet} onOpenChange={setShowMoreSheet}>
        <DialogContent className="max-w-xl flex flex-col p-0 overflow-hidden lg:hidden"
          style={{ maxHeight: 'calc(100dvh - var(--layout-header-height, 0px) - var(--dock-clearance))' }}>
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-charcoal-border shrink-0">
            <DialogTitle>Templates &amp; Recipes</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-5" style={{ WebkitOverflowScrolling: 'touch' }}>
            <button
              type="button"
              onClick={() => { setShowMoreSheet(false); resetForm(); setMealItems([]); setMealTemplateType("lunch"); setShowNewMealDialog(true); }}
              className="w-full min-h-[44px] cta-ghost"
            >
              <UtensilsCrossed className="w-4 h-4" />
              Build New Meal
            </button>
            <MealTemplates compact />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-widest text-ink-muted uppercase">Recipes</span>
                <button onClick={() => setShowNewRecipe(true)} className="flex items-center gap-1 text-xs font-bold text-brand uppercase tracking-widest min-h-[44px] px-1">
                  <Plus className="w-3 h-3" />New
                </button>
              </div>
              <RecipeBuilder compact showCreateDialog={showNewRecipe} onCreateDialogChange={setShowNewRecipe} />
            </div>
            <MealPlanIdeas
              allFoodEntries={allFoodEntries}
              calorieGoal={targets.calories}
              proteinGoal={targets.protein}
              carbsGoal={targets.carbs}
              fatsGoal={targets.fats}
            />
          </div>
        </DialogContent>
      </Dialog>

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
      <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border shrink-0">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <Input
  id="meal-search"
  ref={searchRef}
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder="Search for a food..."
  className="pl-10"
/>
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted spin-loop" />
            )}
          </div>

          {fuzzyFallback && (genericResults.length > 0 || brandedResults.length > 0) && (
            <p className="mt-1.5 text-xs text-ink-muted px-1">Showing approximate results for "{searchQuery}"</p>
          )}
          {(matchingCustomFoods.length > 0 || genericResults.length > 0) && (
            <div className="mt-2 md:max-h-56 md:overflow-y-auto border border-charcoal-border rounded-lg bg-charcoal-surface divide-y divide-charcoal-border">
              {matchingCustomFoods.length > 0 && (
                <>
                  <div className="section-label px-3 py-1.5 bg-charcoal-elevated sticky top-0">My Foods</div>
                  {matchingCustomFoods.map((food) => (
                    <div key={food.id} className="flex items-center hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                      <button onClick={() => selectCustomFood(food)} className="flex-1 text-left px-4 py-3 min-h-[44px]">
                        <div className="font-medium text-ink text-sm">{food.food_name}</div>
                        <MacroResultLine cal={food.calories} p={food.protein_grams} c={food.carbs_grams} f={food.fats_grams} />
                      </button>
                      <FavoriteToggle food={food} onToggle={toggleFavoriteFoodMutation.mutate} />
                    </div>
                  ))}
                </>
              )}
              {genericResults.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-ink-muted sticky top-0">Generic Foods</div>
                  {genericResults.map((food) => (
                    <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                      <div className="font-medium text-ink text-sm">{food.description}</div>
                      <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} per100g />
                    </button>
                  ))}
                </>
              )}
              {brandedResults.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowBranded(v => !v)} className="w-full px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-ink-muted flex items-center justify-between hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)] sticky top-0">
                    <span>Branded ({brandedResults.length})</span>
                    {showBranded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showBranded && brandedResults.map((food) => (
                    <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                      <div className="font-medium text-ink text-sm">{food.description}</div>
                      {food.brandOwner && <div className="text-xs text-ink-muted">{food.brandOwner}</div>}
                      <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} />
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
                  type="number" inputMode="decimal"
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
                  onValueChange={changeServingUnit}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activePortionLabels.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label} ({activePortionMap[label]}g)
                      </SelectItem>
                    ))}
                    {showServingLikeUnits && !activePortionMap.serving && (
                      <SelectItem value="serving">serving(s)</SelectItem>
                    )}
                    {showServingLikeUnits && !activePortionMap.piece && (
                      <SelectItem value="piece">piece(s)</SelectItem>
                    )}
                    {genericUnitOptions.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {servingEquivalence && (
                <p className="font-technical text-[10.5px] font-semibold text-ink-faint mt-1">{servingEquivalence}</p>
              )}
            </div>
            {isServingLikeUnit(newFood.serving_unit) && (
              <div>
                <Label>Weight of 1 {newFood.serving_unit} (g)</Label>
                <Input
                  type="number" inputMode="decimal"
                  placeholder="e.g. 62"
                  value={foodServingSizeGrams ?? ""}
                  onChange={(e) => {
                    const g = parseFloat(e.target.value);
                    setFoodServingSizeGrams(e.target.value === "" || !Number.isFinite(g) || g <= 0 ? null : g);
                  }}
                  className="mt-1"
                  min="0"
                  step="1"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Calories</Label>
              <Input
                type="number" inputMode="decimal"
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
                type="number" inputMode="decimal"
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
                type="number" inputMode="decimal"
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
                type="number" inputMode="decimal"
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
            variant="volt" className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Food to Meal
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink">Meal Items</h3>
            <Badge variant="secondary">{mealItems.length} items</Badge>
          </div>

          {mealItems.length === 0 ? (
            <div className="text-sm text-ink-muted border border-charcoal-border rounded-lg p-4">
              No foods added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {mealItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-2 p-3 glass-inset"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-ink truncate">{item.food_name}</div>
                    <div className="text-xs text-ink-muted font-technical tabular-nums">{item.serving_size}</div>
                    {/* Shared hue strip — kcal=gold, P=coral, C=carb, F=fat. */}
                    <MacroResultLine cal={item.calories} p={item.protein_grams} c={item.carbs_grams} f={item.fats_grams} />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMealItem(item.id)}
                    aria-label="Remove item"
                    className="shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] -my-1 text-ink-muted hover:text-bad transition-colors duration-200 [transition-timing-function:var(--ease)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Running total — neutral glass-inset with the shared hue strip
              (kcal=gold, P=coral, C=carb, F=fat), not teal (teal is the action
              color, never a decorative total fill). */}
          {mealItems.length > 0 && (
            <div className="glass-inset p-3 flex items-center justify-between gap-2">
              <span className="section-label shrink-0">Total</span>
              <MacroResultLine
                cal={mealTotals.calories}
                p={mealTotals.protein_grams}
                c={mealTotals.carbs_grams}
                f={mealTotals.fats_grams}
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t bg-charcoal-surface shrink-0">
        <Button
          onClick={handleSaveMealTemplate}
          disabled={mealItems.length === 0}
          variant="volt" className="w-full"
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

      {/* Copy a previous day forward */}
      <Dialog open={showCopyDayDialog} onOpenChange={setShowCopyDayDialog}>
        <DialogContent className="max-w-lg flex flex-col">
          <DialogHeader>
            <DialogTitle>Copy a day to {selectedDate}</DialogTitle>
            <DialogDescription>
              Pick a day, then pick what carries over. Nothing is moved — the source day keeps its entries.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="copy-from">Copy from</Label>
            <Input
              id="copy-from"
              type="date"
              value={copyFromDate}
              max={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => { setCopyFromDate(e.target.value); setCopySelection({}); }}
              className="mt-1"
            />
          </div>

          {copySourceEntries.length === 0 ? (
            <p className="text-xs text-ink-muted">Nothing was logged on {copyFromDate}.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="section-label">{copySourceEntries.length} entries</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand underline"
                    onClick={() => setCopySelection(Object.fromEntries(copySourceEntries.map((e) => [e.id, true])))}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-ink-muted underline"
                    onClick={() => setCopySelection({})}
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto border border-charcoal-border rounded-lg divide-y divide-charcoal-border">
                {copySourceEntries.map((entry) => (
                  <label key={entry.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-charcoal-elevated">
                    <input
                      type="checkbox"
                      checked={!!copySelection[entry.id]}
                      onChange={(e) => setCopySelection((prev) => ({ ...prev, [entry.id]: e.target.checked }))}
                      className="shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink truncate">{entry.food_name}</span>
                      <span className="block text-[10.5px] text-ink-muted">
                        {entry.meal_type} · {formatEntryServing(entry)}
                      </span>
                    </span>
                    <span className="font-technical text-xs font-semibold text-gold shrink-0">
                      {Math.round(entry.calories || 0)}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <Button
            onClick={() => copyDayMutation.mutate(copySourceEntries.filter((e) => copySelection[e.id]))}
            disabled={
              copyDayMutation.isPending ||
              !copySourceEntries.some((e) => copySelection[e.id])
            }
          >
            {copyDayMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Copying…</>
            ) : (
              <>Copy {copySourceEntries.filter((e) => copySelection[e.id]).length} to {selectedDate}</>
            )}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Food CSV Format Guide */}
      <Dialog open={showFoodFormatGuide} onOpenChange={setShowFoodFormatGuide}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Food CSV Import Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-muted mb-3">
            Save a <code className="text-xs bg-charcoal-elevated px-1 rounded">.csv</code> file with these columns, then use the Import CSV button to add foods to My Foods.
          </p>
          <pre className="bg-charcoal-surface rounded-lg p-3 text-xs overflow-auto text-ink-muted border border-charcoal-border text-left">{`food_name,calories,protein_grams,carbs_grams,fats_grams,serving_unit
Chicken Breast,165,31,0,3.6,100g
Greek Yogurt,59,10,3.6,0.4,100g
Oats,389,17,66,7,100g`}</pre>
          <div className="text-xs text-ink-muted space-y-1 mt-2">
            <p><span className="font-semibold">food_name</span> and <span className="font-semibold">calories</span> are required. All other columns are optional.</p>
            <p><span className="font-semibold">serving_unit</span>: any label like <code>100g</code>, <code>cup</code>, <code>serving</code> (defaults to "serving").</p>
            <p>Macros are per the serving size you specify.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Swap a planned food out for something already in the fridge */}
      <SwapFoodDialog
        open={!!swapEntry}
        onOpenChange={(o) => { if (!o) setSwapEntry(null); }}
        entry={swapEntry}
        customFoods={customFoods}
        swaps={dayContext?.foodSwaps?.[selectedDate] || {}}
        onSwap={runSwap}
        onRevert={revertSwap}
        pending={foodSwap.isPending}
      />

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
          // An empty barcode means nothing was ever scanned or looked up
          // (e.g. "Enter manually" from the camera-unavailable error state,
          // which shares this same handler) — don't tell the athlete their
          // product wasn't found when no lookup happened.
          if (barcode) {
            setSearchQuery(barcode);
            toast.info("Product not found. Try searching manually.");
          }
        }}
        onScanLabel={() => {
          setShowBarcodeScanner(false);
          resetLabelCapture();
          setShowLabelCapture(true);
        }}
      />
    </div>
  );
}

function GoalsFormContent({
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
                  <span className="text-sm text-ink-muted">
                    {activePhase.phase_type === 'reverse'
                      ? `+${activePhase.weekly_rate} cal/wk`
                      : `${activePhase.weekly_rate > 0 ? '+' : ''}${activePhase.weekly_rate} ${profile?.weight_unit || 'lbs'}/wk`}
                  </span>
                </div>
                {/* One hero number: the saved Daily Calories goal (kcal owns
                    gold). The phase target demotes to a muted reference line. */}
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="type-display text-gold text-3xl tabular-nums">
                    {(profile?.daily_calorie_goal || goalForm?.calories || phaseCalories).toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold text-ink-muted">cal/day</span>
                </div>
                <div className="text-xs text-ink-muted mt-0.5 tabular-nums">
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
                <p className="text-xs text-ink-secondary">
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
          <p className="text-sm text-ink-muted">Set up your stats to auto-calculate daily calorie and macro targets.</p>
          <Button type="button" variant="outline" size="lg" className="w-full min-h-[44px]" onClick={() => { setShowGoalsModal(false); setShowStatsModal(true); }}>
            <Calculator className="w-4 h-4 mr-2" />Set up TDEE calculation
          </Button>
        </div>
      )}

      {tdee.tdee && latestWeight && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Label className="whitespace-nowrap text-sm sm:shrink-0">Protein target</Label>
            <div className="flex items-center gap-2 flex-1">
              <Input type="number" inputMode="decimal" step="0.05" min="0.5" max="2.5" value={proteinPerLb}
                onChange={(e) => setProteinPerLb(e.target.value)} className="flex-1 min-w-0" />
              <span className="text-sm text-ink-muted whitespace-nowrap">g / lb</span>
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
        <p className="text-xs text-ink-faint">
          Leave blank to track 14 g per 1,000 kcal (
          {fiberDefault} g at your current calorie target).
        </p>
      </div>
    </div>
  );
}
