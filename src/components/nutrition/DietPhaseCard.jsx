import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import { invalidateDietPhases, invalidateProfile } from "@/lib/queryKeys";
import { PHASE_TYPES, WEEKLY_RATE_PRESETS } from "@/lib/constants";
import {
  calculatePhaseCalories,
  calculateMacroSplit,
  suggestProtein,
  phaseToGoal,
  shouldTransitionPhase,
} from "@/utils/coachingUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Play,
  Calendar,
  Target,
  ChevronDown,
  ChevronUp,
  Trophy,
  Dumbbell,
  RefreshCcw,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";

export default function DietPhaseCard({ tdeeResult, trendWeight }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activePhase, phaseHistory } = useDietPhase();
  const queryClient = useQueryClient();

  const [showNewPhase, setShowNewPhase] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newPhaseType, setNewPhaseType] = useState("cut");
  const [newRate, setNewRate] = useState(-0.75);
  const [customRate, setCustomRate] = useState("");
  const [targetWeight, setTargetWeight] = useState("");

  const weightUnit = profile?.weight_unit || "lbs";

  const phaseCalories = useMemo(() => {
    if (!activePhase) return null;
    // Reverse diet: calories are tracked via profile goals, not TDEE formula
    if (activePhase.phase_type === "reverse") return profile?.daily_calorie_goal || null;
    if (!tdeeResult?.tdee) return null;
    return calculatePhaseCalories(tdeeResult.tdee, activePhase.weekly_rate);
  }, [tdeeResult, activePhase, profile?.daily_calorie_goal]);

  const daysInPhase = useMemo(() => {
    if (!activePhase?.start_date) return 0;
    return differenceInDays(new Date(), parseISO(activePhase.start_date));
  }, [activePhase]);

  const shouldTransition = useMemo(
    () => shouldTransitionPhase(activePhase, trendWeight),
    [activePhase, trendWeight]
  );

  const completedPhases = useMemo(
    () =>
      phaseHistory
        .filter((p) => p.end_date)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [phaseHistory]
  );

  const startPhaseMutation = useMutation({
    mutationFn: async ({ phaseType, weeklyRate, targetWt }) => {
      // End current phase if one exists
      if (activePhase) {
        await db.entities.DietPhase.update(activePhase.id, {
          end_date: format(new Date(), "yyyy-MM-dd"),
        });
      }

      // Create new phase
      const rate = parseFloat(weeklyRate) || 0;
      await db.entities.DietPhase.create({
        created_by: user.id,
        phase_type: phaseType,
        weekly_rate: rate,
        start_date: format(new Date(), "yyyy-MM-dd"),
        target_weight: targetWt ? parseFloat(targetWt) : null,
        starting_weight: trendWeight || null,
        starting_calories: profile?.daily_calorie_goal || null,
      });

      // Update macro goals based on new phase
      if (profile) {
        if (phaseType === "reverse") {
          // Reverse diet starts from current calories — don't recalculate
          await db.entities.UserProfile.update(profile.id, {
            primary_goal: phaseToGoal(phaseType),
          });
        } else if (tdeeResult?.tdee) {
          const newCalories = calculatePhaseCalories(tdeeResult.tdee, rate);
          const weightLbs =
            weightUnit === "kg"
              ? (trendWeight || 0) * 2.205
              : trendWeight || 0;
          const protein = suggestProtein(weightLbs, phaseToGoal(phaseType));
          const macros = calculateMacroSplit(newCalories, protein);

          await db.entities.UserProfile.update(profile.id, {
            ...macros,
            primary_goal: phaseToGoal(phaseType),
          });
        }
      }
    },
    onSuccess: () => {
      invalidateDietPhases(queryClient);
      invalidateProfile(queryClient);
      setShowNewPhase(false);
      toast.success("New diet phase started!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to start phase");
    },
  });

  const handleStartPhase = () => {
    const rate = customRate ? parseFloat(customRate) : newRate;
    startPhaseMutation.mutate({
      phaseType: newPhaseType,
      weeklyRate: rate,
      targetWt: targetWeight,
    });
  };

  const openNewPhaseDialog = (type) => {
    setNewPhaseType(type || "cut");
    const presets = WEEKLY_RATE_PRESETS[type || "cut"];
    setNewRate(presets[Math.floor(presets.length / 2)]?.value || 0);
    setCustomRate("");
    setTargetWeight("");
    setShowNewPhase(true);
  };

  const getPhaseIcon = (type) => {
    switch (type) {
      case "cut":     return <TrendingDown className="w-5 h-5" />;
      case "bulk":    return <TrendingUp className="w-5 h-5" />;
      case "reverse": return <RefreshCcw className="w-5 h-5" />;
      default:        return <Minus className="w-5 h-5" />;
    }
  };

  const getPhaseColor = (type) => {
    switch (type) {
      case "cut":
        return {
          bg: "bg-bad/10",
          text: "text-bad",
          badge: "bg-bad/10 text-bad",
          border: "border-bad/20",
        };
      case "bulk":
        return {
          bg: "bg-leaf/10",
          text: "text-leaf",
          badge: "bg-leaf/10 text-leaf",
          border: "border-leaf/20",
        };
      case "reverse":
        return {
          bg: "bg-[rgba(20,184,166,0.08)]",
          text: "text-[#2dd4bf]",
          badge: "bg-[rgba(20,184,166,0.1)] text-[#2dd4bf]",
          border: "border-[rgba(20,184,166,0.2)]",
        };
      default:
        return {
          bg: "bg-[rgba(59,130,246,0.08)]",
          text: "text-info",
          badge: "bg-info/10 text-info",
          border: "border-[rgba(59,130,246,0.2)]",
        };
    }
  };

  const previewCalories = useMemo(() => {
    if (newPhaseType === "reverse") {
      // Reverse diet starts from current calories — show that + first week increment
      const current = profile?.daily_calorie_goal;
      const increment = customRate ? parseFloat(customRate) : newRate;
      return current ? `${current} → ${current + increment} after week 1` : null;
    }
    if (!tdeeResult?.tdee) return null;
    const rate = customRate ? parseFloat(customRate) : newRate;
    return calculatePhaseCalories(tdeeResult.tdee, rate);
  }, [tdeeResult, newRate, customRate, newPhaseType, profile?.daily_calorie_goal]);

  return (
    <>
      <Card className="">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-brand" />
              Diet Phase
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => openNewPhaseDialog(null)}
            >
              <Play className="w-3 h-3 mr-1" />
              New Phase
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {activePhase ? (
            <div className="space-y-2">
              {/* Auto-transition banner */}
              {shouldTransition && (
                <div className="p-2.5 bg-warn/10 border border-warn/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-warn" />
                    <span className="font-semibold text-sm text-amber-800">
                      Target Reached!
                    </span>
                    <Button
                      size="sm"
                      className="ml-auto h-6 text-xs bg-amber-600 hover:bg-amber-700 text-ink"
                      onClick={() => openNewPhaseDialog("maintain")}
                    >
                      Switch to Maintenance
                    </Button>
                  </div>
                </div>
              )}

              {/* Active phase display — compact */}
              {(() => {
                const colors = getPhaseColor(activePhase.phase_type);
                return (
                  <div className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {getPhaseIcon(activePhase.phase_type)}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors.badge}`}>
                          {activePhase.phase_type.charAt(0).toUpperCase() + activePhase.phase_type.slice(1)}
                        </span>
                      </div>
                      <span className="text-xs text-ink-muted">Day {daysInPhase}</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <div className="text-ink-muted">Rate</div>
                        <div className="font-semibold text-sm text-ink">
                          {activePhase.phase_type === "reverse"
                            ? `+${activePhase.weekly_rate} cal/wk`
                            : `${activePhase.weekly_rate > 0 ? "+" : ""}${activePhase.weekly_rate} ${weightUnit}/wk`}
                        </div>
                      </div>
                      <div>
                        <div className="text-ink-muted">Started</div>
                        <div className="font-semibold text-sm text-ink">
                          {format(parseISO(activePhase.start_date), "MMM d")}
                        </div>
                      </div>
                      {phaseCalories && (
                        <div>
                          <div className="text-ink-muted">Calories</div>
                          <div className="font-semibold text-sm text-ink">{phaseCalories}</div>
                        </div>
                      )}
                      {activePhase.target_weight && (
                        <div>
                          <div className="text-ink-muted">Goal</div>
                          <div className="font-semibold text-sm text-ink">{activePhase.target_weight} {weightUnit}</div>
                        </div>
                      )}
                    </div>

                    {activePhase.phase_type === "reverse" && activePhase.starting_calories && tdeeResult?.tdee && (
                      <div className="mt-2 pt-2 border-t border-charcoal-border/50 border-charcoal-border text-xs">
                        <div className="flex justify-between text-ink-muted mb-1">
                          <span>Metabolic recovery</span>
                          <span>{activePhase.starting_calories} → {phaseCalories} / {tdeeResult.tdee} cal</span>
                        </div>
                        <div className="w-full bg-charcoal-elevated  rounded-full h-1.5">
                          <div
                            className="bg-teal-500 h-1.5 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(0,
                                ((phaseCalories - activePhase.starting_calories) /
                                 (tdeeResult.tdee - activePhase.starting_calories)) * 100
                              ))}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {activePhase.phase_type !== "reverse" && activePhase.starting_weight && trendWeight && (
                      <div className="mt-2 pt-2 border-t border-charcoal-border/50 border-charcoal-border text-xs text-ink-muted">
                        {activePhase.starting_weight} → {trendWeight} {weightUnit} ({(trendWeight - activePhase.starting_weight) > 0 ? "+" : ""}{(trendWeight - activePhase.starting_weight).toFixed(1)})
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Phase history toggle */}
              {completedPhases.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink-muted transition-colors"
                  >
                    History ({completedPhases.length})
                    {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showHistory && (
                    <div className="mt-1.5 space-y-1.5">
                      {completedPhases.map((phase) => {
                        const colors = getPhaseColor(phase.phase_type);
                        const days = phase.end_date ? differenceInDays(parseISO(phase.end_date), parseISO(phase.start_date)) : 0;
                        return (
                          <div key={phase.id} className="flex items-center justify-between p-2 bg-charcoal-surface bg-charcoal-elevated rounded text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                                {phase.phase_type.charAt(0).toUpperCase() + phase.phase_type.slice(1)}
                              </span>
                              <span className="text-ink-muted text-ink-muted">
                                {phase.weekly_rate > 0 ? "+" : ""}{phase.weekly_rate} {weightUnit}/wk
                              </span>
                            </div>
                            <span className="text-ink-muted">
                              {days}d · {format(parseISO(phase.start_date), "MMM d")}–{format(parseISO(phase.end_date), "MMM d")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-3">
              <Dumbbell className="w-8 h-8 text-ink-muted mx-auto mb-2" />
              <p className="text-ink-muted font-medium text-sm">No active diet phase</p>
              <p className="text-xs text-ink-muted mt-0.5 mb-3">
                Start a phase for coached check-ins and auto macro adjustments.
              </p>
              <div className="flex gap-2 justify-center">
                {PHASE_TYPES.map((pt) => (
                  <Button
                    key={pt.value}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openNewPhaseDialog(pt.value)}
                  >
                    {getPhaseIcon(pt.value)}
                    <span className="ml-1">{pt.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Phase Dialog */}
      <Dialog open={showNewPhase} onOpenChange={setShowNewPhase}>
        <DialogContent className="flex flex-col p-0">
          {/* Fixed header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border flex-shrink-0">
            <DialogTitle>Start New Diet Phase</DialogTitle>
            <DialogDescription>
              {activePhase
                ? "This will end your current phase and start a new one."
                : "Choose your goal and how aggressively you want to pursue it."}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Phase type selector */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Phase Type
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {PHASE_TYPES.map((pt) => {
                  const colors = getPhaseColor(pt.value);
                  const selected = newPhaseType === pt.value;
                  return (
                    <button
                      key={pt.value}
                      onClick={() => {
                        setNewPhaseType(pt.value);
                        const presets = WEEKLY_RATE_PRESETS[pt.value];
                        setNewRate(
                          presets[Math.floor(presets.length / 2)]?.value || 0
                        );
                        setCustomRate("");
                      }}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        selected
                          ? `${colors.border} ${colors.bg} ring-2 ring-offset-1 ring-brand/30`
                          : "border-charcoal-border border-charcoal-border hover:border-charcoal-border"
                      }`}
                    >
                      <div className="flex justify-center mb-1">
                        {getPhaseIcon(pt.value)}
                      </div>
                      <div className="font-semibold text-sm">{pt.label}</div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {pt.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rate / Aggressiveness selector */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Aggressiveness
              </Label>
              <div className="space-y-2">
                {WEEKLY_RATE_PRESETS[newPhaseType]?.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      setNewRate(preset.value);
                      setCustomRate("");
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      !customRate && newRate === preset.value
                        ? "border-brand/40 bg-brand/[8%] text-ink"
                        : "border-charcoal-border border-charcoal-border hover:border-charcoal-border"
                    }`}
                  >
                    <span className="font-medium text-sm">{preset.label}</span>
                    <span className="text-sm text-ink-muted">{preset.desc}</span>
                  </button>
                ))}

                {/* Custom rate input */}
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    step="0.05"
                    placeholder="Custom rate"
                    value={customRate}
                    onChange={(e) => setCustomRate(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-sm text-ink-muted whitespace-nowrap">
                    {newPhaseType === "reverse" ? "cal/wk" : `${weightUnit}/wk`}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  {newPhaseType === "cut"
                    ? "Negative values for cutting (e.g., -0.6)"
                    : newPhaseType === "bulk"
                    ? "Positive values for bulking (e.g., 0.35)"
                    : newPhaseType === "reverse"
                    ? "Enter cal/week increment (e.g. 60)"
                    : "Use 0 for maintenance"}
                </p>
              </div>
            </div>

            {/* Target weight (optional) */}
            <div>
              <Label className="text-sm font-medium mb-1 block">
                Target Weight{" "}
                <span className="text-ink-muted font-normal">(optional)</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  placeholder={`e.g., ${
                    newPhaseType === "cut" ? "165" : "185"
                  }`}
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-ink-muted">{weightUnit}</span>
              </div>
              <p className="text-xs text-ink-muted mt-1">
                You'll be notified when you reach this weight.
              </p>
            </div>

            {/* Preview */}
            {previewCalories && (
              <div className="p-3 bg-charcoal-surface bg-charcoal-elevated rounded-lg text-sm">
                {newPhaseType === "reverse" ? (
                  <div className="text-ink-muted text-ink-muted">
                    Calorie progression:{" "}
                    <span className="font-bold text-ink">
                      {previewCalories}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="text-ink-muted text-ink-muted">
                      Estimated daily target:{" "}
                      <span className="font-bold text-ink">
                        {previewCalories} cal
                      </span>
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      TDEE ({tdeeResult.tdee}){" "}
                      {(customRate ? parseFloat(customRate) : newRate) < 0
                        ? ""
                        : "+"}
                      {Math.round(
                        (customRate ? parseFloat(customRate) : newRate) * 500
                      )}{" "}
                      cal/day
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Fixed footer */}
          <div className="px-6 py-4 border-t border-charcoal-border flex-shrink-0 flex gap-2">
            <Button
              onClick={handleStartPhase}
              className="flex-1 bg-brand hover:bg-brand text-[var(--color-action-dark)] font-bold"
              disabled={startPhaseMutation.isPending}
            >
              {startPhaseMutation.isPending
                ? "Starting..."
                : "Start Phase"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowNewPhase(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
