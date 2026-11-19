import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useAllFoodEntries, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { searchGenericFoods, searchBrandedFoods } from "@/api/usda";
import { getDailyCalorieTrend, getRecentFoods, gramsForAmount, scaleFromBase } from "@/utils/nutritionUtils";
import { getBestTDEE, calculatePhaseCalories } from "@/utils/coachingUtils";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { DEFAULT_GOALS } from "@/lib/constants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateFood, invalidateProfile } from "@/lib/queryKeys";
import { format, subDays } from "date-fns";
import { getTodayString, nowInTz } from "@/utils/dateUtils";
import { createTapGuard } from "@/utils/foodLog";
import { toast } from "sonner";
import TrackerDateBar from "@/components/nutrition/tracker/TrackerDateBar";
import TrackerBody from "@/components/nutrition/tracker/TrackerBody";
import FoodEntryDialog from "@/components/nutrition/tracker/FoodEntryDialog";
import MealEstimatorDialog from "@/components/nutrition/tracker/MealEstimatorDialog";
import LabelReaderDialog from "@/components/nutrition/tracker/LabelReaderDialog";
import GoalsDialog from "@/components/nutrition/tracker/GoalsDialog";
import FuelMoreSheet from "@/components/nutrition/tracker/FuelMoreSheet";
import TrackerOverlays from "@/components/nutrition/tracker/TrackerOverlays";
import { useCustomFoodLibrary } from "@/components/nutrition/tracker/useCustomFoodLibrary";
import { useFoodPicks } from "@/components/nutrition/tracker/useFoodPicks";
import { useFoodForm } from "@/components/nutrition/tracker/useFoodForm";
import { useDaySummary } from "@/components/nutrition/tracker/useDaySummary";
import { getDefaultMealType, getEatenAt, downscaleToDataUrl, fnErrorMessage } from "@/components/nutrition/tracker/shared";

export default function FoodTracker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  // If the tab is left open (or an iOS home-screen app backgrounded) across
  // local midnight, selectedDate never re-derives on its own and new entries
  // silently save under yesterday's date with no on-screen indication. Only
  // roll forward when the athlete was viewing today — a deliberately chosen
  // past day is left alone.
  const wasOnTodayRef = useRef(selectedDate === getTodayString());
  useEffect(() => {
    wasOnTodayRef.current = selectedDate === getTodayString();
  }, [selectedDate]);
  const editingEntryRef = useRef(null);
  const rollDateForwardRef = useRef(() => {});
  rollDateForwardRef.current = () => {
    const nowToday = getTodayString();
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
  // Consumed/Remaining view for the "Intake vs pace" module — same saved
  // display preference pattern as Today.jsx's Nutrition module
  // (mf-app-screens.md "Nutrition & Targets widget": a bar-fill toggle,
  // never a ring). Kept as its own key since Fuel shows a selectable
  // historical date, not just today.
  const [fuelNutritionView, setFuelNutritionView] = useState(() => {
    try { return localStorage.getItem("fuelNutritionView") === "consumed" ? "consumed" : "remaining"; }
    catch { return "remaining"; }
  });
  const setFuelNutritionViewPersist = (v) => {
    setFuelNutritionView(v);
    try { localStorage.setItem("fuelNutritionView", v); } catch { /* private mode / blocked storage */ }
  };
  const [manualExpanded, setManualExpanded] = useState(false);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [showNewMealDialog, setShowNewMealDialog] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showFoodFormatGuide, setShowFoodFormatGuide] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
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
  const [copyFromDate, setCopyFromDate] = useState(format(subDays(nowInTz(), 1), "yyyy-MM-dd"));
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
  // Where the form's food came from, for the custom_foods.source tag:
  // 'ai_estimate' | 'label_scan' | 'usda' | 'barcode' | 'manual' | null.
  const [foodSource, setFoodSource] = useState(null);
  // What the estimator said about its own answer: { kind, confidence, detail }.
  // Shown quietly on the form; null for anything that isn't a fresh estimate.
  const [estimateMeta, setEstimateMeta] = useState(null);
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

  // Auto-open add dialog when navigated with ?addFood=true (the dock's '+' ->
  // Log Food, QuickAddMenu.jsx). This path used to only ever fire through a
  // fresh mount of the standalone /food-tracker route, where selectedDate's
  // initial useState already computed today fresh -- rollDateForwardRef
  // never needed calling here. Now that the dock also stays on /fuel (already
  // mounted, no remount) when Log Food is opened from there, this needs the
  // same rollDateForward + form reset the sticky-bar/former-FAB onClick did,
  // or a tab left open across local midnight would open the dialog still
  // logging to yesterday (r1-01's bug, resurfaced through the new path).
  useEffect(() => {
    if (searchParams.get("addFood") === "true") {
      resetForm();
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
        toast.error("Food search failed. Check your connection and try again.");
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
  // The profile (and its timezone) can land after first render, or be synced to
  // the device zone on app open; re-derive "today" if we were on it.
  useEffect(() => { rollDateForwardRef.current(); }, [profile?.timezone]);
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
      toast.success("Nutrition targets updated.");
    },
    onError: () => {
      toast.error("Goals not updated. Try again.");
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
    // selectedDate isn't read above, but getDailyCalorieTrend windows off
    // `new Date()` internally — without this dep the strip stays pinned to
    // whatever "today" was at first render and never rolls forward past
    // local midnight, so the selected (now-current) day can fall outside
    // the 7 days shown and nothing highlights.
  }, [allFoodEntries, phaseHistory, profile?.daily_calorie_goal, tdee.tdee, selectedDate]);

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

  const { buildCustomFoodPayload, customFoods, handleImportFoodsCSV, matchingCustomFoods, portionsByFood, portionsUnavailable, saveCustomFoodMutation, sortedCustomFoods, syncPortions, toggleFavoriteFoodMutation } = useCustomFoodLibrary({ activeFoodId, activePortions, baseMacros, baseUnit, foodServingSizeGrams, foodSource, newFood, portionsDirty, queryClient, searchQuery, setActiveFoodId, setActivePortions, user });

  // Re-log a previously logged food entry.
  // Macros are already fully scaled to the recorded serving — treat baseMacros as per-1-serving.
  const { selectCustomFood, selectRecentFood } = useFoodPicks({ customFoods, newFood, portionsByFood, setActiveFoodId, setActivePortions, setBaseMacros, setBaseUnit, setBrandedResults, setEstimateMeta, setFoodServingSizeGrams, setFoodSource, setGenericResults, setIsEstimatedFood, setIsUsdaFood, setNewFood, setPortionsDirty, setSearchQuery, setServingHint });

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
        source: "ai_estimate",
        calories: est.calories,
        protein_grams: est.protein,
        carbs_grams: est.carbs,
        fats_grams: est.fats,
        fiber_grams: est.fiber ?? null,
      });
      setServingHint(est.serving_description ? `Estimated for ${est.serving_description}` : null);
      setIsEstimatedFood(true);
      setEstimateMeta({ kind: "AI estimate", confidence: est.confidence, detail: est.assumptions || null });
      setManualExpanded(true);
      setEstimateInput("");
      toast.success(`Estimated ${est.food_name} · ${est.confidence} confidence. Check the macros.`);
    } catch (err) {
      toast.error(err.message || "Could not estimate. Add detail and try again.");
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
      toast.error(err.message || "Could not estimate. Add detail and try again.");
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
      const { data: inserted, error } = await supabase.from("food_entries").insert(rows).select("id");
      if (error) throw error;
      invalidateFood(queryClient);
      toastLogged(
        `Logged ${estMealItems.length} item${estMealItems.length > 1 ? "s" : ""}`,
        (inserted || []).map((r) => r.id)
      );
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
        source: "label_scan",
        calories: est.calories,
        protein_grams: est.protein,
        carbs_grams: est.carbs,
        fats_grams: est.fats,
        fiber_grams: est.fiber ?? null,
      });
      setServingHint(est.serving_description ? `Label: ${est.serving_description}` : null);
      setIsEstimatedFood(true);
      setEstimateMeta({ kind: "Label read", confidence: est.confidence, detail: est.note || null });
      setManualExpanded(true);
      setShowLabelCapture(false);
      resetLabelCapture();
      toast.success(`Read label · ${est.confidence} confidence. Check the macros.`);
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
    saveCustomFoodMutation.mutate({ food: buildCustomFoodPayload(), activeFoodId });
  }

  setMealItems((prev) => [...prev, item]);
  resetForm();
  toast.success("Added to meal.");
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

  // Undo for a log action: removes exactly the row(s) that action created, by
  // id, so a later identical entry is never touched.
  const undoLoggedEntries = (ids) => {
    Promise.all(ids.map((id) => db.entities.FoodEntry.delete(id)))
      .then(() => invalidateFood(queryClient))
      .catch(() => {
        invalidateFood(queryClient);
        toast.error("Couldn't undo that log. Delete the entry from the list instead.");
      });
  };
  const toastLogged = (message, ids) => {
    toast.success(message, {
      // Same reasoning as the delete toast: no second tap target beside Undo.
      closeButton: false,
      action: ids.length ? { label: "Undo", onClick: () => undoLoggedEntries(ids) } : undefined,
    });
  };

  // One-tap re-log double-tap guard (see createTapGuard).
  const relogGuardRef = useRef(null);
  if (!relogGuardRef.current) relogGuardRef.current = createTapGuard(800);

  const addFoodMutation = useMutation({
    mutationFn: async (data) => {
      return db.entities.FoodEntry.create({
        food_name: data.food_name,
        meal_type: data.meal_type,
        serving_size: parseFloat(data.serving_amount) || 1,
        serving_unit: data.serving_unit,
        // Quick re-log passes its own resolved serving_grams (copied straight
        // from the past entry, no rescale needed since the amount/unit are
        // unchanged); every other caller still resolves it from form state.
        serving_grams: data.serving_grams ?? entryServingGrams(data),
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
    onSuccess: (created, variables) => {
      invalidateFood(queryClient);
      // A quick re-log never opened/populated the Add Food form, so there's
      // nothing to close or reset for it — closing here would dismiss the
      // Add Food dialog out from under someone still browsing the Recent list.
      if (!variables?.__quickRelog) {
        setShowAddDialog(false);
        resetForm();
      }
      toastLogged("Food logged.", created?.id ? [created.id] : []);
    },
    onError: () => {
      toast.error("Food not logged. Try again.");
    },
    onSettled: (_d, _e, variables) => {
      if (variables?.__quickRelog) relogGuardRef.current.release();
    },
  });

  // Re-log a Recent entry with one tap: same food, same last-used portion,
  // logged straight to the current meal/date — no dialog detour through
  // selectRecentFood's form-population dance (that path is for editing the
  // portion before logging; this path is for repeating it verbatim).
  const quickRelogFood = (entry) => {
    if (addFoodMutation.isPending) return; // guard a double-tap duplicate
    // The ref guard also catches two taps inside one frame (isPending hasn't
    // flipped yet) and a repeat of the same food right after it settled.
    if (!relogGuardRef.current.tryAcquire(`${entry.food_name}|${entry.serving_size}|${entry.serving_unit}`)) return;
    const servingStr = String(entry.serving_size || "");
    const parts = servingStr.split(' ');
    const originalAmount = parseFloat(parts[0]) || (typeof entry.serving_size === 'number' ? entry.serving_size : 1);
    const originalUnit = parts.slice(1).join(' ') || entry.serving_unit || 'serving';
    addFoodMutation.mutate({
      __quickRelog: true,
      food_name: entry.food_name,
      // The Recent entry's meal is whenever it was last eaten, not now: a
      // dinner item re-logged at breakfast went into Dinner. Today follows the
      // clock (same default as a fresh form); a back-dated day keeps the entry's.
      meal_type: selectedDate === getTodayString() ? getDefaultMealType() : entry.meal_type,
      serving_amount: originalAmount,
      serving_unit: originalUnit,
      serving_grams: entry.serving_grams ?? null,
      calories: entry.calories || 0,
      protein_grams: entry.protein_grams || 0,
      carbs_grams: entry.carbs_grams || 0,
      fats_grams: entry.fats_grams || 0,
      fiber_grams: entry.fiber_grams ?? null,
    });
  };

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
            const { id: _id, created_at: _createdAt, ...rest } = entry;
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
      toast.success("Food logged.");
    },
    onError: () => toast.error("Food not logged. Try again."),
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
      toast.success("Food entry updated.");
    },
    onError: () => {
      toast.error("Food entry not updated. Try again.");
    },
  });

  const { activePortionLabels, activePortionMap, addPortionDraft, changeServingUnit, currentScale, genericUnitOptions, removePortion, resetForm, selectFood, servingEquivalence, showServingLikeUnits, startEditEntry } = useFoodForm({ activeFoodId, activePortions, baseUnit, customFoods, foodServingSizeGrams, newFood, portionDraft, portionsByFood, portionsUnavailable, rollDateForwardRef, servingHint, setActiveFoodId, setActivePortions, setBaseMacros, setBaseUnit, setBrandedResults, setEditingEntry, setEstimateMeta, setFoodServingSizeGrams, setFoodSource, setGenericResults, setIsEstimatedFood, setIsUsdaFood, setLoggingMode, setNewFood, setPortionDraft, setPortionsDirty, setPortionsExpanded, setSearchQuery, setSelectedDate, setServingHint, setShowAddDialog, syncPortions });

  // Consumed macros count only EATEN entries — planned (not-yet-checked-off) plan
  // items are shown in the list but don't inflate today's intake until checked.
  const { changeDate, copyDayMutation, copySourceEntries, dayContext, foodSwap, intakeStats, isViewingToday, mealGroups, openActionsId, planFit, plannedCount, revertSwap, runSwap, setOpenActionsId, setSwapEntry, swapEntry, totals } = useDaySummary({ allFoodEntries, copyFromDate, customFoods, foodEntries, profile, queryClient, selectedDate, setCopySelection, setSelectedDate, setShowCopyDayDialog, statsWindow, targets, user });

  return (
    <div className="text-ink" style={{ scrollPaddingBottom: 'calc(var(--dock-clearance) + 88px)' }}>

      <TrackerDateBar {...{ changeDate, isViewingToday, resetForm, selectedDate, setMealItems, setMealTemplateType, setSelectedDate, setShowAddDialog, setShowBarcodeScanner, setShowNewMealDialog, showAddDialog }} />

      <TrackerBody {...{ activePhase, addFoodMutation, allFoodEntries, calorieTrend, deleteFoodMutation, entriesError, entriesLoading, foodEntries, fuelNutritionView, intakeStats, mealGroups, openActionsId, planFit, plannedCount, profile, quickRelogFood, recentFoods, refetchEntries, selectedDate, setCopyFromDate, setCopySelection, setFuelNutritionViewPersist, setNewFood, setOpenActionsId, setSelectedDate, setShowAddDialog, setShowCopyDayDialog, setShowGoalsModal, setShowIntakeStats, setShowMoreSheet, setShowNewRecipe, setShowSaveTemplateDialog, setShowStatsModal, setSidebarTab, setStatsWindow, setSwapEntry, setTemplateEntries, setTemplateMealType, showIntakeStats, showNewRecipe, sidebarTab, startEditEntry, statsWindow, targets, tdee, togglePlannedMutation, totals }} />

      <FoodEntryDialog {...{ activeFoodId, activePortionLabels, activePortionMap, activePortions, addFoodMutation, addPortionDraft, baseMacros, baseUnit, brandedResults, buildCustomFoodPayload, changeServingUnit, currentScale, customFoods, editingEntry, estimateFood, estimateInput, estimateMeta, foodServingSizeGrams, fuzzyFallback, genericResults, genericUnitOptions, handleImportFoodsCSV, isEstimatedFood, isEstimating, isSearching, isUsdaFood, loggingMode, macroCalcWarning, manualExpanded, matchingCustomFoods, myFoodsExpanded, newFood, portionDraft, portionsExpanded, quickRelogFood, recentExpanded, recentFoods, removePortion, resetForm, resetMealEstimator, saveCustomFoodMutation, searchError, searchQuery, searchRef, selectCustomFood, selectFood, selectRecentFood, selectedDate, servingEquivalence, setBaseMacros, setEstimateInput, setFoodServingSizeGrams, setLoggingMode, setManualExpanded, setMyFoodsExpanded, setNewFood, setPortionDraft, setPortionsExpanded, setRecentExpanded, setSearchError, setSearchQuery, setSearchRetry, setShowAddDialog, setShowBarcodeScanner, setShowBranded, setShowFoodFormatGuide, setShowMealEstimator, showAddDialog, showBranded, showServingLikeUnits, sortedCustomFoods, toggleFavoriteFoodMutation, updateFoodMutation }} />

      <MealEstimatorDialog {...{ estMealItems, estimateMeal, isEstimatingMeal, isLoggingMeal, logMealItems, loggingMode, mealMealType, mealPhoto, mealPhotoInputRef, mealText, pickMealPhoto, removeEstMealItem, resetMealEstimator, setEstMealItems, setLoggingMode, setMealMealType, setMealPhoto, setMealText, setShowMealEstimator, showMealEstimator }} />

      <LabelReaderDialog {...{ isReadingLabel, labelName, labelPhoto, labelPhotoInputRef, pickLabelPhoto, readLabel, resetLabelCapture, setLabelName, setLabelPhoto, setShowLabelCapture, showLabelCapture }} />

      <GoalsDialog {...{ activePhase, fiberGoal, goalForm, latestWeight, navigate, profile, proteinPerLb, setFiberGoal, setGoalForm, setProteinPerLb, setShowGoalsModal, setShowStatsModal, showGoalsModal, targets, tdee, updateGoalsMutation }} />

      <FuelMoreSheet {...{ activePortionLabels, activePortionMap, addCurrentFoodToMeal, baseMacros, brandedResults, changeServingUnit, foodServingSizeGrams, fuzzyFallback, genericResults, genericUnitOptions, handleSaveMealTemplate, isSearching, matchingCustomFoods, mealItems, mealTemplateType, mealTotals, newFood, removeMealItem, resetForm, searchQuery, searchRef, selectCustomFood, selectFood, servingEquivalence, setBaseMacros, setFoodServingSizeGrams, setMealItems, setMealTemplateType, setNewFood, setSearchQuery, setShowBranded, setShowMoreSheet, setShowNewMealDialog, setShowNewRecipe, setShowSaveTemplateDialog, setShowStatsModal, setSidebarTab, setTemplateEntries, setTemplateMealType, showBranded, showMoreSheet, showNewMealDialog, showNewRecipe, showSaveTemplateDialog, showServingLikeUnits, showStatsModal, sidebarTab, targets, templateEntries, templateMealType, toggleFavoriteFoodMutation, user }} />

      <TrackerOverlays {...{ copyDayMutation, copyFromDate, copySelection, copySourceEntries, customFoods, dayContext, foodSwap, resetLabelCapture, revertSwap, runSwap, selectFood, selectedDate, setCopyFromDate, setCopySelection, setSearchQuery, setShowBarcodeScanner, setShowCopyDayDialog, setShowFoodFormatGuide, setShowLabelCapture, setSwapEntry, showBarcodeScanner, showCopyDayDialog, showFoodFormatGuide, swapEntry }} />
    </div>
  );
}

