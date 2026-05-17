import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MoreVertical, FileText, RefreshCw, X, AlertTriangle, TrendingUp, History, HelpCircle, ChevronRight } from "lucide-react";
import { evaluateSetPerformance } from "@/utils/programProgression";
import { getSmartRestDuration } from "@/utils/fatigueManagement";
import { lookupExercise, EXERCISE_DB } from "@/ml/exerciseDB";

const DB_NAMES = EXERCISE_DB.map(e => e.name).sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
);
import { replaceExercise } from "@/ml/workoutModel";
import ExerciseReactionButtons from "@/components/workouts/ExerciseReactionButtons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";

export default function ExerciseCard({
  exercise,
  exerciseIndex,
  weightUnit,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onUpdateNotes,
  onUpdateName,
  originalExercise = null,
  lastPerformance = null,
  programExercise = null, // exercise config from program_workouts
  progressionTargets = null, // from calculateDailyTargets
  onNudge = null, // callback when a nudge is generated
  onStartRestTimer = null, // callback to start the centralized rest timer
  showRIR = true, // whether to show RIR column
  // Reaction props
  currentReaction = undefined,
  onReactionChange = null,
  onReplaceExercise = null,
  dayFocus = "Full Body",
  goal = "General Fitness",
  fitnessLevel = "intermediate",
  equipment = [],
  currentWeekExerciseNames = [],
  allExerciseNames = [],
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState(null);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [replaceAlternatives, setReplaceAlternatives] = useState(null);
  const [customExerciseName, setCustomExerciseName] = useState("");
  const menuRef = useRef(null);
  const nudgeTimerRef = useRef(null);

  const dbEntry = lookupExercise(exercise.name);
  const smartRest = getSmartRestDuration(exercise.name);
  const isProgramMode = !!programExercise;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenu && menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  // Clear nudge timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => { if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current); };
  }, []);

  // Handle set completed
  const handleSetCompleted = (setIndex, completed) => {
    onUpdateSet(exerciseIndex, setIndex, 'completed', completed);

    // Start rest timer when set is completed
    // BUG FIX: use exercise.rest_seconds first, then program config, then smart default
    if (completed && onStartRestTimer) {
      const restDuration = exercise.rest_seconds || programExercise?.rest_seconds || smartRest;
      onStartRestTimer(restDuration);
    }

    // Evaluate performance if RIR is logged (program mode)
    if (completed) {
      const set = exercise.sets[setIndex];
      const rir = set.rir ?? set.rpe;
      if (rir != null && programExercise && progressionTargets) {
        const nudge = evaluateSetPerformance(
          programExercise,
          { rir, weight: set.weight, set_type: set.set_type || 'working', set_number: set.set_number },
          progressionTargets.workingWeight,
          exercise.sets.length
        );
        if (nudge) {
          setNudgeMessage(nudge);
          onNudge?.(nudge);
          if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
          nudgeTimerRef.current = setTimeout(() => setNudgeMessage(null), 8000);
        }
      }
    }
  };

  const handleRirChange = (setIndex, rir) => {
    onUpdateSet(exerciseIndex, setIndex, 'rir', rir);

    const set = exercise.sets[setIndex];
    if (set.completed && programExercise && progressionTargets) {
      const nudge = evaluateSetPerformance(
        programExercise,
        { rir, weight: set.weight, set_type: set.set_type || 'working', set_number: set.set_number },
        progressionTargets.workingWeight,
        exercise.sets.length
      );
      if (nudge) {
        setNudgeMessage(nudge);
        onNudge?.(nudge);
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(() => setNudgeMessage(null), 8000);
      }
    }
  };

  return (
    <>
    <Card className="border-none shadow-lg bg-white dark:bg-slate-800">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-500 dark:bg-primary-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {exerciseIndex + 1}
            </div>
            {editingName ? (
              <Input
                autoFocus
                value={exercise.name}
                onChange={(e) => onUpdateName(exerciseIndex, e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                className="h-8 text-lg font-semibold"
              />
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg text-slate-900 dark:text-white">{exercise.name}</CardTitle>
                  {dbEntry && (
                    <Badge variant="outline" className="text-xs capitalize border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
                      {dbEntry.type}
                    </Badge>
                  )}
                </div>
                {/* Program targets */}
                {isProgramMode && progressionTargets && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {progressionTargets.workingWeight && (
                      <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                        Target: {progressionTargets.workingWeight} {weightUnit}
                      </span>
                    )}
                    {progressionTargets.dailyMin && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Min: {progressionTargets.dailyMin} {weightUnit}
                      </span>
                    )}
                    {programExercise.rir_target && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        RIR {programExercise.rir_target}
                      </span>
                    )}
                  </div>
                )}
                {/* Original exercise targets (non-program) */}
                {!isProgramMode && originalExercise && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Target: {originalExercise.sets || 3} sets × {originalExercise.reps || 10} reps
                  </p>
                )}
                {/* Last performance data */}
                {lastPerformance && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <History className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Last: <span className="font-semibold text-primary-600 dark:text-primary-400">
                        {lastPerformance.lastWeight} {weightUnit} × {lastPerformance.lastReps}
                      </span>
                      {lastPerformance.lastDate && (
                        <span className="text-slate-500 dark:text-slate-500 ml-1">
                          ({format(new Date(lastPerformance.lastDate), 'MMM d')})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Like / Dislike buttons */}
            {onReactionChange && (
              <ExerciseReactionButtons
                exerciseName={exercise.name}
                currentReaction={currentReaction}
                onReactionChange={onReactionChange}
                onReplaceExercise={onReplaceExercise}
                exercise={exercise}
                dayFocus={dayFocus}
                goal={goal}
                level={fitnessLevel}
                equipment={equipment}
                currentWeekExerciseNames={currentWeekExerciseNames}
              />
            )}
            <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpenMenu(!openMenu)}
              className="h-9 w-9"
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
            {openMenu && (
              <div className="absolute right-0 top-9 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-20 min-w-[160px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <button
                  onClick={() => {
                    setEditingNotes(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Add notes
                </button>
                <button
                  onClick={() => {
                    const alts = replaceExercise({
                      dislikedName: exercise.name,
                      currentWeekExerciseNames,
                      goal,
                      level: fitnessLevel,
                      equipment,
                      dayFocus,
                    });
                    setReplaceAlternatives(alts);
                    setShowReplaceDialog(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Replace exercise
                </button>
                {isProgramMode && (
                  <button
                    onClick={() => {
                      onAddSet(exerciseIndex, { set_type: 'daily_min', weight: progressionTargets?.dailyMin || 0 });
                      setOpenMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Add daily min set
                  </button>
                )}
                <button
                  onClick={() => {
                    onRemoveExercise(exerciseIndex);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove exercise
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Advisory nudge */}
        {nudgeMessage && (
          <div className={`mb-3 p-2.5 rounded-lg text-sm flex items-start gap-2 ${
            nudgeMessage.type === 'success' ? 'bg-success-50 text-success-700' :
            nudgeMessage.type === 'warning' ? 'bg-amber-50 text-amber-700' :
            'bg-blue-50 text-blue-700'
          }`}>
            {nudgeMessage.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            ) : (
              <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
            )}
            <span>{nudgeMessage.message}</span>
            <button onClick={() => setNudgeMessage(null)} className="ml-auto flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-full">
            <thead>
              <tr className="text-xs md:text-sm text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 px-1 w-8 md:w-12">Set</th>
                <th className="text-left py-2 px-1 text-xs md:text-xs">Wt</th>
                <th className="text-left py-2 px-1 text-xs md:text-xs">Reps</th>
                {showRIR && (
                  <th className="text-left py-2 px-1 w-16 md:w-24 text-xs md:text-xs">
                    <div className="flex items-center gap-1">
                      <span>RIR</span>
                      <div className="group relative">
                        <HelpCircle className="w-3 h-3 cursor-help text-slate-400 hover:text-slate-600" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-48 p-2 bg-slate-900 text-white text-xs rounded shadow-lg">
                          Reps In Reserve: How many more reps you could do (0 = failure, 3 = 3 more reps possible)
                        </div>
                      </div>
                    </div>
                  </th>
                )}
                <th className="text-center py-2 px-1 w-10 md:w-12 text-xs md:text-xs">✓</th>
                <th className="text-center py-2 px-1 w-8 md:w-12"></th>
              </tr>
            </thead>
            <tbody>
              {exercise.sets.map((set, setIndex) => (
                <tr key={setIndex} className={
                  set.completed
                    ? set.set_type === 'daily_min' ? "bg-blue-100 dark:bg-blue-950/30" : "bg-success-600/10 dark:bg-success-600/20"
                    : ""
                }>
                  <td className="py-2 px-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">{set.set_number}</span>
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      type="number"
                      value={set.weight || ""}
                      onChange={(e) => onUpdateSet(exerciseIndex, setIndex, 'weight', parseFloat(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      placeholder={
                        isProgramMode && set.set_type === 'daily_min' && progressionTargets?.dailyMin
                          ? String(progressionTargets.dailyMin)
                          : isProgramMode && progressionTargets?.workingWeight
                          ? String(progressionTargets.workingWeight)
                          : lastPerformance?.lastWeight
                          ? String(lastPerformance.lastWeight)
                          : "0"
                      }
                      min="0"
                      step="2.5"
                      className="w-16 md:w-24 h-10 md:h-9 text-sm touch-manipulation"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      type="number"
                      value={set.reps || ""}
                      onChange={(e) => onUpdateSet(exerciseIndex, setIndex, 'reps', parseInt(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      placeholder={lastPerformance?.lastReps ? String(lastPerformance.lastReps) : "0"}
                      min="0"
                      className="w-14 md:w-20 h-10 md:h-9 text-sm touch-manipulation"
                    />
                  </td>
                  {showRIR && (
                    <td className="py-2 px-1">
                      <Input
                        type="number"
                        value={(set.rir ?? set.rpe) ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleRirChange(setIndex, val === "" ? null : parseFloat(val));
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="—"
                        min="0"
                        max="5"
                        step="0.5"
                        className="w-14 md:w-24 h-10 md:h-9 text-center text-sm touch-manipulation"
                      />
                    </td>
                  )}
                  <td className="py-2 px-1 text-center">
                    <Checkbox
                      checked={set.completed}
                      onCheckedChange={(checked) => handleSetCompleted(setIndex, checked)}
                      className="h-6 w-6 md:h-6 md:w-6"
                    />
                  </td>
                  <td className="py-2 px-1 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveSet(exerciseIndex, setIndex)}
                      className="h-7 w-7 md:h-8 md:w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddSet(exerciseIndex)}
          className="mt-2 text-primary-600 h-8"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Set
        </Button>

        {editingNotes ? (
          <div className="mt-3">
            <Textarea
              autoFocus
              value={exercise.notes || ""}
              onChange={(e) => onUpdateNotes(exerciseIndex, e.target.value)}
              placeholder="Exercise notes (e.g., focus on form, pause at bottom...)"
              rows={2}
              className="text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingNotes(false)}
              className="mt-1 text-primary-600"
            >
              Done
            </Button>
          </div>
        ) : exercise.notes ? (
          <p
            className="mt-3 text-sm text-slate-600 italic border-l-2 border-primary-200 pl-3 cursor-pointer hover:bg-slate-50 py-1"
            onClick={() => setEditingNotes(true)}
          >
            {exercise.notes}
          </p>
        ) : originalExercise?.notes ? (
          <p className="text-sm text-slate-600 mt-3 italic border-l-2 border-slate-300 pl-3">
            {originalExercise.notes}
          </p>
        ) : null}
      </CardContent>
    </Card>

    {/* Replace exercise dialog (triggered from menu) */}
    <Dialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a replacement</DialogTitle>
          <DialogDescription>
            Pick an alternative for <span className="font-semibold">{exercise.name}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {replaceAlternatives && [
            { key: "easier", label: "Easier", icon: "↓", description: "Lower difficulty, same muscle group" },
            { key: "same",   label: "Same Level", icon: "→", description: "Similar difficulty, different exercise" },
            { key: "harder", label: "Harder", icon: "↑", description: "Higher difficulty, same muscle group" },
          ].map(({ key, label, icon }) => {
            const alt = replaceAlternatives[key];
            if (!alt) return null;
            return (
              <button
                key={key}
                onClick={() => {
                  if (onReplaceExercise) onReplaceExercise(exercise.name, alt);
                  setShowReplaceDialog(false);
                }}
                className="w-full text-left p-4 rounded-xl border-2 border-slate-200 hover:border-primary-400 hover:bg-primary-50 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-slate-400 group-hover:text-primary-500">{icon}</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
                    </div>
                    <p className="font-semibold text-slate-800 group-hover:text-primary-700">{alt.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {alt.sets} sets × {alt.reps} reps · {alt.rest}s rest
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 mt-1 flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Custom exercise</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Combobox
                value={customExerciseName}
                onValueChange={setCustomExerciseName}
                items={allExerciseNames.length > 0 ? allExerciseNames : DB_NAMES}
                excludeValue={exercise.name}
                placeholder="Enter exercise name…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customExerciseName.trim()) {
                    if (onReplaceExercise) onReplaceExercise(exercise.name, { name: customExerciseName.trim() });
                    setCustomExerciseName("");
                    setShowReplaceDialog(false);
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              disabled={!customExerciseName.trim()}
              onClick={() => {
                if (onReplaceExercise) onReplaceExercise(exercise.name, { name: customExerciseName.trim() });
                setCustomExerciseName("");
                setShowReplaceDialog(false);
              }}
            >
              Use
            </Button>
          </div>
        </div>
        <Button variant="ghost" className="w-full mt-2 text-slate-500" onClick={() => { setCustomExerciseName(""); setShowReplaceDialog(false); }}>
          Keep current exercise
        </Button>
      </DialogContent>
    </Dialog>
  </>
  );
}
