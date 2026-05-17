import { useState, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useAllFoodEntries, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateProfile } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Target,
  Calendar,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Info,
  Lightbulb,
  X,
  Scale,
  Flame,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { toast } from "sonner";
import {
  analyzeWeightTrend,
  analyzeLoggingConsistency,
  analyzeMonthlyProgress,
  generateRecommendations,
  getBestTDEE,
  calculateMacroSplit,
  calculatePhaseCalories,
  calculateEWMA,
  getLatestTrendWeight,
  suggestProtein,
} from "@/utils/coachingUtils";
import { WEEKLY_RATE_PRESETS } from "@/lib/constants";
import DietPhaseCard from "./DietPhaseCard";
import WeeklyCheckinBanner from "./WeeklyCheckinBanner";
import TrainingAdaptationBanner from "./TrainingAdaptationBanner";
import CheckinHistory from "./CheckinHistory";
import { useDietPhase } from "@/hooks/useDietPhase";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";

export default function NutritionCoach() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activePhase } = useDietPhase();
  const queryClient = useQueryClient();
  const [dismissedCards, setDismissedCards] = useState(new Set());
  const [showTDEEInfo, setShowTDEEInfo] = useState(false);
  const [editingMacros, setEditingMacros] = useState(false);
  const [goalMode, setGoalMode] = useState('maintain');       // 'cut' | 'maintain' | 'bulk'
  const [weeklyRate, setWeeklyRate] = useState(0);            // lb/wk from WEEKLY_RATE_PRESETS
  const [proteinPerLb, setProteinPerLb] = useState(0.8);     // g per lb bodyweight
  const [macroForm, setMacroForm] = useState({
    daily_calorie_goal: 0,
    daily_protein_goal: 0,
    daily_carbs_goal: 0,
    daily_fats_goal: 0,
  });

  const { weightEntries } = useBodyWeightEntries();

  const { allFoodEntries } = useAllFoodEntries();

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      if (profile) {
        await db.entities.UserProfile.update(profile.id, data);
      }
    },
    onSuccess: () => {
      invalidateProfile(queryClient);
      toast.success("Macros updated!");
      setEditingMacros(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update macros");
    },
  });

  const weightUnit = profile?.weight_unit || "lbs";

  // Latest trend weight for TDEE calculation (EWMA smoothed)
  const latestWeight = useMemo(
    () => getLatestTrendWeight(weightEntries),
    [weightEntries]
  );

  // TDEE calculation
  const tdeeResult = useMemo(
    () => getBestTDEE(profile, latestWeight, weightEntries, allFoodEntries),
    [profile, latestWeight, weightEntries, allFoodEntries]
  );

  // Protein suggestion
  const suggestedProtein = useMemo(() => {
    if (!latestWeight) return null;
    const weightLbs =
      weightUnit === "kg" ? latestWeight * 2.205 : latestWeight;
    return suggestProtein(weightLbs, profile?.primary_goal);
  }, [latestWeight, weightUnit, profile?.primary_goal]);

  // Only analyze weight from the current phase start date so stale pre-phase
  // trends don't generate misleading recommendations.
  const phaseWeightEntries = useMemo(() => {
    if (!activePhase?.start_date) return weightEntries;
    const phaseStart = parseISO(activePhase.start_date);
    return weightEntries.filter((e) => parseISO(e.recorded_date) >= phaseStart);
  }, [weightEntries, activePhase]);

  // 7-day analysis
  const weeklyWeight = analyzeWeightTrend(phaseWeightEntries, 7);
  const weeklyLogging = analyzeLoggingConsistency(allFoodEntries, profile, 7);

  // 30-day analysis
  const { weightAnalysis: monthlyWeight, loggingAnalysis: monthlyLogging } =
    analyzeMonthlyProgress(weightEntries, allFoodEntries, profile);

  // Recommendations
  const recommendations = generateRecommendations(
    weeklyWeight,
    weeklyLogging,
    profile
  );

  // Weight chart data (last 30 days) with EWMA trend
  const chartData = useMemo(() => {
    const allTrended = calculateEWMA(weightEntries, 0.1);
    const cutoff30 = subDays(new Date(), 30);
    return allTrended.filter((e) => parseISO(e.recorded_date) >= cutoff30);
  }, [weightEntries]);

  // Helper: get weight in lbs regardless of unit setting
  const weightLbs = useMemo(() => {
    if (!latestWeight) return null;
    return weightUnit === "kg" ? latestWeight * 2.205 : latestWeight;
  }, [latestWeight, weightUnit]);

  // Infer default goal mode from primary_goal
  const defaultGoalMode = useMemo(() => {
    const goals = Array.isArray(profile?.primary_goal) ? profile.primary_goal : [profile?.primary_goal || ''];
    const g = (goals[0] || '').toLowerCase();
    if (g.includes('weight_loss') || g.includes('weight loss')) return 'cut';
    if (g.includes('muscle_gain') || g.includes('muscle gain')) return 'bulk';
    return 'maintain';
  }, [profile?.primary_goal]);

  const startEditingMacros = () => {
    // Prefer active phase settings over defaults
    const mode = activePhase?.phase_type ?? defaultGoalMode;
    const rate = activePhase?.weekly_rate
      ?? WEEKLY_RATE_PRESETS[mode]?.[1]?.value
      ?? WEEKLY_RATE_PRESETS[mode]?.[0]?.value
      ?? 0;
    const ppl = mode === 'cut' || mode === 'bulk' ? 1.0 : 0.8;

    setGoalMode(mode);
    setWeeklyRate(rate);
    setProteinPerLb(ppl);

    // Always seed the form from current saved goals — user sees what's actually set
    setMacroForm({
      daily_calorie_goal: profile?.daily_calorie_goal || 2000,
      daily_protein_goal: profile?.daily_protein_goal || 150,
      daily_carbs_goal: profile?.daily_carbs_goal || 200,
      daily_fats_goal: profile?.daily_fats_goal || 65,
    });
    setEditingMacros(true);
  };

  // Called when goal mode or rate changes — recalculates all macros
  const applyGoalAndRate = (mode, rate) => {
    if (!tdeeResult.tdee || !weightLbs) return;
    const targetCals = calculatePhaseCalories(tdeeResult.tdee, rate);
    const protein = Math.round(weightLbs * proteinPerLb);
    const macros = calculateMacroSplit(targetCals, protein);
    setMacroForm(macros);
  };

  // Called when protein per lb changes — recalculates protein + carbs/fats
  const applyProteinPerLb = (ppl) => {
    if (!weightLbs) return;
    const protein = Math.round(weightLbs * ppl);
    const macros = calculateMacroSplit(macroForm.daily_calorie_goal, protein);
    setMacroForm(macros);
  };

  const saveMacros = () => {
    updateProfileMutation.mutate({
      daily_calorie_goal: parseInt(macroForm.daily_calorie_goal) || 0,
      daily_protein_goal: parseInt(macroForm.daily_protein_goal) || 0,
      daily_carbs_goal: parseInt(macroForm.daily_carbs_goal) || 0,
      daily_fats_goal: parseInt(macroForm.daily_fats_goal) || 0,
    });
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case "losing":
        return <TrendingDown className="w-5 h-5 text-green-600" />;
      case "gaining":
        return <TrendingUp className="w-5 h-5 text-orange-600" />;
      default:
        return <Minus className="w-5 h-5 text-slate-500" />;
    }
  };

  const getRecommendationStyle = (type) => {
    switch (type) {
      case "warning":
        return {
          border: "border-l-4 border-l-red-500",
          icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
          bg: "bg-red-50 dark:bg-red-900/20",
        };
      case "suggestion":
        return {
          border: "border-l-4 border-l-amber-500",
          icon: <Lightbulb className="w-5 h-5 text-amber-500" />,
          bg: "bg-amber-50 dark:bg-amber-900/20",
        };
      case "success":
        return {
          border: "border-l-4 border-l-green-500",
          icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
          bg: "bg-green-50 dark:bg-green-900/20",
        };
      default:
        return {
          border: "border-l-4 border-l-blue-500",
          icon: <Info className="w-5 h-5 text-blue-500" />,
          bg: "bg-blue-50 dark:bg-blue-900/20",
        };
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const rawEntry = payload.find((p) => p.dataKey === "weight");
      const trendEntry = payload.find((p) => p.dataKey === "trendWeight");
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-semibold dark:text-white">
            {format(parseISO(label), "MMM d, yyyy")}
          </p>
          {rawEntry && (
            <p className="text-sm text-purple-600 dark:text-purple-400">
              Weight: {rawEntry.value} {weightUnit}
            </p>
          )}
          {trendEntry && (
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Trend: {trendEntry.value} {weightUnit}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case "high":
        return "bg-green-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-red-500";
      default:
        return "bg-slate-400";
    }
  };

  const getMethodLabel = (method) => {
    switch (method) {
      case "adaptive":
        return "Adaptive";
      case "formula":
        return "Formula";
      case "manual":
        return "Manual";
      default:
        return "Not set";
    }
  };

  // Macro bar percentages
  const totalMacroCal = profile
    ? (profile.daily_protein_goal || 0) * 4 +
      (profile.daily_carbs_goal || 0) * 4 +
      (profile.daily_fats_goal || 0) * 9
    : 0;
  const proteinPct =
    totalMacroCal > 0
      ? Math.round(((profile?.daily_protein_goal || 0) * 4 * 100) / totalMacroCal)
      : 0;
  const carbsPct =
    totalMacroCal > 0
      ? Math.round(((profile?.daily_carbs_goal || 0) * 4 * 100) / totalMacroCal)
      : 0;
  const fatsPct = totalMacroCal > 0 ? 100 - proteinPct - carbsPct : 0;

  return (
    <div className="space-y-4">
      <MedicalDisclaimer />
      {/* Weekly Check-in Banner */}
      <WeeklyCheckinBanner />
      <TrainingAdaptationBanner />

      {/* TDEE + Macro Goals side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* TDEE Dashboard */}
        <Card className="border-none shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              Estimated TDEE
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tdeeResult.tdee ? (
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">
                    {tdeeResult.tdee}
                  </span>
                  <span className="text-sm text-slate-500">cal/day</span>
                  <span
                    className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                      tdeeResult.method === "adaptive"
                        ? "bg-green-100 text-green-700"
                        : tdeeResult.method === "manual"
                        ? "bg-primary-100 text-primary-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {getMethodLabel(tdeeResult.method)}
                  </span>
                </div>

                {tdeeResult.confidence && (
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div
                      className={`w-2 h-2 rounded-full ${getConfidenceColor(
                        tdeeResult.confidence
                      )}`}
                    />
                    {tdeeResult.confidence === "high"
                      ? "High confidence — 28+ days"
                      : tdeeResult.confidence === "medium"
                      ? "Medium confidence — 14+ days"
                      : "Low confidence — building"}
                  </div>
                )}

                {tdeeResult.formula_tdee && tdeeResult.adaptive_tdee && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                      <div className="text-blue-600 dark:text-blue-400 text-xs font-medium">Formula</div>
                      <div className="text-base font-bold text-slate-900 dark:text-white">
                        {tdeeResult.formula_tdee}
                      </div>
                    </div>
                    <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
                      <div className="text-green-600 dark:text-green-400 text-xs font-medium">Adaptive</div>
                      <div className="text-base font-bold text-slate-900 dark:text-white">
                        {tdeeResult.adaptive_tdee}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowTDEEInfo(!showTDEEInfo)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  How is this calculated?
                  {showTDEEInfo ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                {showTDEEInfo && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 space-y-1.5">
                    <p>
                      <strong>Formula (Mifflin-St Jeor):</strong> Uses your height,
                      weight, age, sex, and activity level.
                    </p>
                    <p>
                      <strong>Adaptive:</strong> Back-calculates TDEE from logged
                      food and weight changes. More accurate with 14+ days of data.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Scale className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 dark:text-slate-400 font-medium text-sm">
                  No TDEE estimate yet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Add body stats in Profile or log food & weight for 14+ days.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Calorie & Macro Configuration */}
        <Card className="border-none shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Calorie & Macro Goals</CardTitle>
            {!editingMacros && (
              <Button variant="outline" size="sm" onClick={startEditingMacros}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingMacros ? (
            <div className="space-y-5">
              {/* Goal + rate selector (only when TDEE is available) */}
              {tdeeResult.tdee && (
                <>
                  {/* Goal mode */}
                  <div>
                    <Label className="text-sm font-medium">What's your goal?</Label>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {[
                        { value: 'cut', label: 'Lose Fat' },
                        { value: 'maintain', label: 'Maintain' },
                        { value: 'bulk', label: 'Gain Muscle' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            const defaultRate = WEEKLY_RATE_PRESETS[opt.value]?.[opt.value === 'cut' ? 1 : 0]?.value ?? 0;
                            setGoalMode(opt.value);
                            setWeeklyRate(defaultRate);
                            applyGoalAndRate(opt.value, defaultRate);
                          }}
                          className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                            goalMode === opt.value
                              ? "bg-primary-600 text-white border-primary-600"
                              : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pace selector (cut or bulk only) */}
                  {goalMode !== 'maintain' && (
                    <div>
                      <Label className="text-sm font-medium">How fast?</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {WEEKLY_RATE_PRESETS[goalMode].map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => {
                              setWeeklyRate(preset.value);
                              applyGoalAndRate(goalMode, preset.value);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              weeklyRate === preset.value
                                ? "bg-primary-600 text-white border-primary-600"
                                : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500"
                            }`}
                          >
                            {preset.label}
                            <span className="ml-1 opacity-60">{preset.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Calorie target result */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {(macroForm.daily_calorie_goal ?? 0).toLocaleString()} cal/day
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        TDEE {(tdeeResult.tdee ?? 0).toLocaleString()}
                        {weeklyRate !== 0
                          ? ` · ${weeklyRate > 0 ? "+" : ""}${Math.round(weeklyRate * 500)} cal ${weeklyRate > 0 ? "surplus" : "deficit"}`
                          : " · maintenance"}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Protein per lb */}
              {weightLbs && (
                <div>
                  <Label className="text-sm font-medium">Protein target</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="2.5"
                      value={proteinPerLb}
                      onChange={(e) => {
                        const ppl = e.target.value;
                        setProteinPerLb(ppl);
                        if (ppl !== '') applyProteinPerLb(parseFloat(ppl) || 0.8);
                      }}
                      className="w-24"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      g / lb = {Math.round(weightLbs * proteinPerLb)}g/day
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Typical: 0.7–1.2 g/lb. Higher for cutting or muscle gain.</p>
                </div>
              )}

              {/* Manual fine-tune inputs */}
              <div>
                <Label className="text-sm font-medium text-slate-500 dark:text-slate-400">Fine-tune</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Calories</Label>
                    <Input
                      type="number"
                      value={macroForm.daily_calorie_goal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') { setMacroForm(prev => ({ ...prev, daily_calorie_goal: '' })); return; }
                        const macros = calculateMacroSplit(parseInt(raw) || 0, parseFloat(macroForm.daily_protein_goal) || 0);
                        setMacroForm(macros);
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Protein (g)</Label>
                    <Input
                      type="number"
                      value={macroForm.daily_protein_goal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') { setMacroForm(prev => ({ ...prev, daily_protein_goal: '' })); return; }
                        const macros = calculateMacroSplit(parseInt(macroForm.daily_calorie_goal) || 0, parseInt(raw) || 0);
                        setMacroForm(macros);
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Carbs (g)</Label>
                    <Input
                      type="number"
                      value={macroForm.daily_carbs_goal}
                      onChange={(e) =>
                        setMacroForm({ ...macroForm, daily_carbs_goal: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fats (g)</Label>
                    <Input
                      type="number"
                      value={macroForm.daily_fats_goal}
                      onChange={(e) =>
                        setMacroForm({ ...macroForm, daily_fats_goal: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Macro split visual */}
              {macroForm.daily_calorie_goal > 0 && (
                <div>
                  <div className="flex h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 transition-all"
                      style={{
                        width: `${
                          (macroForm.daily_protein_goal * 4 * 100) /
                          macroForm.daily_calorie_goal
                        }%`,
                      }}
                    />
                    <div
                      className="bg-amber-500 transition-all"
                      style={{
                        width: `${
                          (macroForm.daily_carbs_goal * 4 * 100) /
                          macroForm.daily_calorie_goal
                        }%`,
                      }}
                    />
                    <div
                      className="bg-rose-500 transition-all"
                      style={{
                        width: `${
                          (macroForm.daily_fats_goal * 9 * 100) /
                          macroForm.daily_calorie_goal
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      Protein {Math.round((macroForm.daily_protein_goal * 4 * 100) / macroForm.daily_calorie_goal)}%
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      Carbs {Math.round((macroForm.daily_carbs_goal * 4 * 100) / macroForm.daily_calorie_goal)}%
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                      Fats {Math.round((macroForm.daily_fats_goal * 9 * 100) / macroForm.daily_calorie_goal)}%
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={saveMacros}
                  className="flex-1 bg-primary-600 hover:bg-primary-700"
                  disabled={updateProfileMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Macros
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingMacros(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current goals display */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {profile?.daily_calorie_goal || "—"}
                  </div>
                  <div className="text-xs text-slate-500">Calories</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {profile?.daily_protein_goal || "—"}
                    <span className="text-sm font-normal">g</span>
                  </div>
                  <div className="text-xs text-slate-500">Protein</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">
                    {profile?.daily_carbs_goal || "—"}
                    <span className="text-sm font-normal">g</span>
                  </div>
                  <div className="text-xs text-slate-500">Carbs</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-rose-600">
                    {profile?.daily_fats_goal || "—"}
                    <span className="text-sm font-normal">g</span>
                  </div>
                  <div className="text-xs text-slate-500">Fats</div>
                </div>
              </div>

              {/* Macro split bar */}
              {totalMacroCal > 0 && (
                <div>
                  <div className="flex h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 transition-all"
                      style={{ width: `${proteinPct}%` }}
                    />
                    <div
                      className="bg-amber-500 transition-all"
                      style={{ width: `${carbsPct}%` }}
                    />
                    <div
                      className="bg-rose-500 transition-all"
                      style={{ width: `${fatsPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>{proteinPct}% P</span>
                    <span>{carbsPct}% C</span>
                    <span>{fatsPct}% F</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Diet Phase */}
      <DietPhaseCard tdeeResult={tdeeResult} trendWeight={latestWeight} />

      {/* Insight Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-none shadow-sm">
          <CardContent className="py-3 px-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-600 dark:text-slate-400">Weekly Weight</div>
              {getTrendIcon(weeklyWeight.trend)}
            </div>
            {weeklyWeight.trend === "insufficient_data" ? (
              <div className="text-xs text-slate-500">Need more data</div>
            ) : (
              <>
                <div className="text-xl font-bold text-slate-900 dark:text-white">
                  {weeklyWeight.weeklyRate > 0 ? "+" : ""}
                  {weeklyWeight.weeklyRate} {weightUnit}
                </div>
                <div className="text-xs text-slate-500 capitalize">
                  {weeklyWeight.trend} · {weeklyWeight.dataPoints} weigh-ins
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="py-3 px-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-600 dark:text-slate-400">Logging</div>
              <Calendar className="w-4 h-4 text-primary-600" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {weeklyLogging.daysLogged}/{weeklyLogging.totalDays} days
            </div>
            <div className="h-1 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-primary-500 transition-all"
                style={{ width: `${weeklyLogging.consistency}%` }}
              ></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="py-3 px-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-600 dark:text-slate-400">Avg Calories</div>
              <Zap className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {weeklyLogging.avgCalories || "—"}
            </div>
            {profile?.daily_calorie_goal && weeklyLogging.avgCalories > 0 && (
              <div className="text-xs text-slate-500">
                Goal: {profile.daily_calorie_goal} ({weeklyLogging.avgCalories > profile.daily_calorie_goal ? "+" : ""}{weeklyLogging.avgCalories - profile.daily_calorie_goal})
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="py-3 px-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-600 dark:text-slate-400">Protein Hit Rate</div>
              <Target className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {weeklyLogging.daysLogged > 0
                ? `${weeklyLogging.proteinHitRate}%`
                : "—"}
            </div>
            <div className="text-xs text-slate-500">
              ≥90% of {profile?.daily_protein_goal || 150}g
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weight Trend Chart */}
      {chartData.length >= 2 && (
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Weight Trend (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="coachWeightGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#8b5cf6"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="#8b5cf6"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="recorded_date"
                    tickFormatter={(date) => format(parseISO(date), "MMM d")}
                    stroke="#64748b"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    stroke="#8b5cf6"
                    style={{ fontSize: "12px" }}
                    domain={["dataMin - 2", "dataMax + 2"]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#coachWeightGradient)"
                    dot={{ fill: "#8b5cf6", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trendWeight"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 5, fill: "#2563eb" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendation Cards — collapsible */}
      {recommendations.length > 0 && (
        <CollapsibleSection title="Recommendations" defaultOpen={true}>
          <div className="space-y-2">
            {recommendations
              .filter((r) => !dismissedCards.has(r.id))
              .map((rec) => {
                const style = getRecommendationStyle(rec.type);
                return (
                  <div
                    key={rec.id}
                    className={`rounded-lg p-3 ${style.border} ${style.bg}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">{style.icon}</div>
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-white">
                            {rec.title}
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                            {rec.description}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                            {rec.suggestion}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDismissedCards(
                            (prev) => new Set([...prev, rec.id])
                          )
                        }
                        className="text-slate-400 hover:text-slate-600 h-6 w-6 -mt-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </CollapsibleSection>
      )}

      {/* Check-in History */}
      <CheckinHistory />

      {/* Monthly Insights — collapsible, collapsed by default */}
      <CollapsibleSection title="Monthly Insights" defaultOpen={false}>
        <div className="space-y-2">
          {monthlyWeight.trend !== "insufficient_data" && (
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
              {getTrendIcon(monthlyWeight.trend)}
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {monthlyWeight.avgWeightChange > 0 ? "Gained" : "Lost"}{" "}
                <strong>
                  {Math.abs(Math.round(monthlyWeight.avgWeightChange * 10) / 10)} {weightUnit}
                </strong>{" "}
                this month ({Math.abs(monthlyWeight.weeklyRate)} {weightUnit}/week)
              </span>
            </div>
          )}
          {monthlyLogging.daysLogged > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <Target className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Protein goal hit <strong>{monthlyLogging.proteinHitRate}%</strong> of the time
              </span>
            </div>
          )}
          {monthlyLogging.daysLogged > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <Calendar className="w-4 h-4 text-primary-600" />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Logged <strong>{monthlyLogging.daysLogged}</strong>/30 days ({monthlyLogging.consistency}%)
              </span>
            </div>
          )}
          {monthlyLogging.avgCalories > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <Zap className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Avg <strong>{monthlyLogging.avgCalories} cal</strong> & <strong>{monthlyLogging.avgProtein}g protein</strong>/day
              </span>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="cursor-pointer py-3" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </div>
      </CardHeader>
      {isOpen && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
