import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Check, X, Plus, Minus, Trash2, BookOpen, TrendingUp, RotateCcw, Info, Calendar } from "lucide-react";
import { replaceExercise } from "@/ml/workoutModel";
import { useProfile } from "@/hooks/useUserQueries";

const PHASE_CONFIG = {
  intro: {
    icon: BookOpen,
    label: "Week 1 — Intro Phase",
    description: "Focus on learning the movements. Lighter loads, longer rest, perfect form.",
    color: "bg-[rgba(204,255,0,0.05)] border-[rgba(204,255,0,0.2)] text-[#ccff00]",
    iconColor: "text-[#ccff00]",
  },
  progression: {
    icon: TrendingUp,
    label: "Progression Phase",
    description: "Progressive overload — weight increases each week to build strength and muscle.",
    color: "bg-[rgba(34,197,94,0.08)] border-[rgba(34,197,94,0.2)] text-[#4ade80]",
    iconColor: "text-[#4ade80]",
  },
  deload: {
    icon: RotateCcw,
    label: "Deload Week",
    description: "Active recovery — reduced load to allow full adaptation and prevent burnout.",
    color: "bg-[rgba(245,158,11,0.08)] border-[rgba(245,158,11,0.2)] text-[#fbbf24]",
    iconColor: "text-[#fbbf24]",
  },
};

export default function WorkoutApprovalModal({ schedule, onApprove, onCancel, lastWeekVolume = null, todayCheckIn = null }) {
  // Deep copy exercises but keep original day metadata (date, dayName) immutable
  const [editedExercises, setEditedExercises] = useState(
    schedule.map(day => day.exercises.map(ex => ({ ...ex })))
  );
  const [saveAsProgram, setSaveAsProgram] = useState(true);
  const { profile } = useProfile();

  const programConfig = schedule[0]?.programConfig || null;
  const phase = programConfig?.phase || null;
  const phaseInfo = phase ? PHASE_CONFIG[phase] : null;

  // ML summary stats
  const focusAreas = [...new Set(schedule.map(d => d.focus).filter(Boolean))];
  const totalPlannedSets = editedExercises.flat().reduce((sum, ex) => sum + (ex.sets || 3), 0);
  const volumeLabel = lastWeekVolume != null
    ? totalPlannedSets > lastWeekVolume
      ? `+${totalPlannedSets - lastWeekVolume} sets vs last week`
      : totalPlannedSets < lastWeekVolume
        ? `${totalPlannedSets - lastWeekVolume} sets vs last week`
        : "Same volume as last week"
    : `${totalPlannedSets} sets planned`;
  const recoveryScore = todayCheckIn
    ? Math.round(((todayCheckIn.sleep_quality || 3) + (todayCheckIn.energy_level || 3) + (6 - (todayCheckIn.soreness_level || 3))) / 3)
    : null;
  const recoveryLabel = recoveryScore != null
    ? recoveryScore >= 4 ? "High" : recoveryScore >= 3 ? "Moderate" : "Low"
    : null;

  const handleReplaceExercise = (dayIndex, exerciseIndex) => {
    const allExerciseNames = editedExercises.flat().map(ex => ex.name);
    const exercise = editedExercises[dayIndex][exerciseIndex];

    const goalMapping = {
      weight_loss: "Weight Loss",
      muscle_gain: "Muscle Gain",
      endurance: "Build Endurance",
      general_fitness: "General Fitness",
      flexibility: "Improve Flexibility",
    };

    // primary_goal may now be an array — use the first value
    const rawGoal = Array.isArray(profile?.primary_goal)
      ? profile.primary_goal[0]
      : profile?.primary_goal;

    const replacement = replaceExercise({
      dislikedName: exercise.name,
      currentWeekExerciseNames: allExerciseNames,
      goal: goalMapping[rawGoal] || "General Fitness",
      level: profile?.fitness_level || "intermediate",
      equipment: profile?.available_equipment || [],
      dayFocus: schedule[dayIndex].focus,
    });

    if (replacement) {
      setEditedExercises(editedExercises.map((dayExs, di) =>
        di === dayIndex
          ? dayExs.map((ex, ei) => ei === exerciseIndex ? replacement : ex)
          : dayExs
      ));
    }
  };

  const handleRemoveExercise = (dayIndex, exerciseIndex) => {
    setEditedExercises(editedExercises.map((dayExs, di) =>
      di === dayIndex ? dayExs.filter((_, ei) => ei !== exerciseIndex) : dayExs
    ));
  };

  const updateExercise = (dayIndex, exerciseIndex, field, value) => {
    setEditedExercises(editedExercises.map((dayExs, di) =>
      di === dayIndex
        ? dayExs.map((ex, ei) => ei === exerciseIndex ? { ...ex, [field]: value } : ex)
        : dayExs
    ));
  };

  const handleApprove = () => {
    // Rebuild schedule: always use original date/dayName/focus/programConfig from source schedule
    // only exercises come from editedExercises state
    const finalSchedule = schedule.map((day, i) => ({
      ...day,
      exercises: editedExercises[i] || [],
      programConfig: saveAsProgram ? day.programConfig : null,
    }));
    onApprove(finalSchedule);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col overflow-hidden">
        <div className="shrink-0 bg-[#1a1a1a]  z-10 border-b p-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold leading-none tracking-tight">Review Your Weekly Schedule</h2>
              <p className="text-[#a0a0a0] text-sm mt-1">Customize before scheduling</p>
            </div>
          </div>

          {/* ML summary — focus areas, volume, recovery */}
          <div className="mt-3 flex flex-wrap gap-3 p-3 bg-[#1a1a1a] 50 rounded-lg border border-[#2a2a2a] ">
            <div className="flex-1 min-w-[120px]">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#555555] mb-0.5">Focus</p>
              <p className="text-xs text-[#a0a0a0]  font-medium">{focusAreas.join(", ") || "Full Body"}</p>
            </div>
            <div className="flex-1 min-w-[100px]">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#555555] mb-0.5">Volume</p>
              <p className="text-xs text-[#a0a0a0]  font-medium">{volumeLabel}</p>
            </div>
            {recoveryLabel && (
              <div className="flex-1 min-w-[80px]">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#555555] mb-0.5">Recovery</p>
                <p className={`text-xs font-medium ${recoveryLabel === "High" ? "text-[#4ade80]" : recoveryLabel === "Low" ? "text-[#f87171]" : "text-[#fbbf24]"}`}>{recoveryLabel}</p>
              </div>
            )}
          </div>

          {/* Phase banner — only shown when saving as program */}
          {phaseInfo && saveAsProgram && (() => {
            const Icon = phaseInfo.icon;
            return (
              <div className={`mt-3 flex items-start gap-3 p-3 rounded-lg border ${phaseInfo.color}`}>
                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${phaseInfo.iconColor}`} />
                <div>
                  <p className="font-semibold text-sm">{phaseInfo.label}</p>
                  <p className="text-xs mt-0.5 opacity-80">{phaseInfo.description}</p>
                </div>
              </div>
            );
          })()}

          {/* Program summary strip */}
          {programConfig && saveAsProgram && (
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#555555]">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3" />
                {programConfig.totalWeeks} week program
              </span>
              <span>+{programConfig.weeklyIncrement} lbs/week</span>
              <span>
                Deload: {programConfig.deloadMode === "match_intro"
                  ? "back to intro weight"
                  : `−${programConfig.deloadReduction} lbs`}
              </span>
            </div>
          )}

          {/* Save as program toggle */}
          {programConfig && (
            <div className="mt-3 flex items-center gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
              <button
                onClick={() => setSaveAsProgram(!saveAsProgram)}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${saveAsProgram ? "bg-[#ccff00]" : "bg-[#333333]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[#1a1a1a] rounded-full shadow transition-transform ${saveAsProgram ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <div>
                <p className="text-sm font-medium text-white">
                  {saveAsProgram ? "Save as multi-week program" : "Just schedule this week"}
                </p>
                <p className="text-xs text-[#555555]">
                  {saveAsProgram
                    ? `Creates a ${programConfig.totalWeeks}-week program with progression tracking`
                    : "One-time schedule only — no program saved"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 p-6 overflow-y-auto overscroll-contain flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {schedule.map((day, dayIndex) => (
            <Card key={dayIndex} className="border-2 border-[#2a2a2a]">
              <CardHeader className="bg-[#1a1a1a] pb-3">
                <CardTitle className="text-lg">{day.focus}</CardTitle>
                <p className="text-sm text-[#555555] flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  {day.dayName} · {day.date}
                </p>
                <p className="text-xs text-[#555555]">{day.duration} · {editedExercises[dayIndex]?.length} exercises</p>
              </CardHeader>

              <CardContent className="pt-4">
                <div className="space-y-4">
                  {(editedExercises[dayIndex] || []).map((exercise, exIndex) => (
                    <div key={exIndex} className="p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-white">{exercise.name}</h4>
                          {exercise.pattern && (
                            <Badge variant="outline" className="text-xs mt-1">{exercise.pattern}</Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReplaceExercise(dayIndex, exIndex)}
                            title="Replace exercise"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveExercise(dayIndex, exIndex)}
                            className="text-[#f87171] hover:text-[#f87171]"
                            title="Remove exercise"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className="text-xs text-[#a0a0a0] mb-1 block">Sets</Label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateExercise(dayIndex, exIndex, "sets", Math.max(1, (exercise.sets || 3) - 1))}
                              disabled={(exercise.sets || 3) <= 1}
                              className="h-8 w-8 p-0"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="text-lg font-semibold min-w-[2ch] text-center">
                              {exercise.sets || 3}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateExercise(dayIndex, exIndex, "sets", (exercise.sets || 3) + 1)}
                              className="h-8 w-8 p-0"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Label htmlFor={`reps-${dayIndex}-${exIndex}`} className="text-xs text-[#a0a0a0] mb-1 block">
                            Reps
                          </Label>
                          <Input
                            id={`reps-${dayIndex}-${exIndex}`}
                            value={exercise.reps || "10"}
                            onChange={(e) => updateExercise(dayIndex, exIndex, "reps", e.target.value)}
                            className="h-8"
                          />
                        </div>

                        <div>
                          <Label htmlFor={`rest-${dayIndex}-${exIndex}`} className="text-xs text-[#a0a0a0] mb-1 block">
                            Rest (sec)
                          </Label>
                          <Input
                            id={`rest-${dayIndex}-${exIndex}`}
                            type="number"
                            value={exercise.rest || 60}
                            onChange={(e) => updateExercise(dayIndex, exIndex, "rest", parseInt(e.target.value) || 60)}
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-3 shrink-0 bg-[#1a1a1a]  p-6 border-t">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleApprove} variant="primary" className="flex-1" data-tutorial="approve-schedule-btn">
            <Check className="w-4 h-4 mr-2" />
            {programConfig && saveAsProgram ? "Save Program & Schedule Week 1" : "Approve & Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
