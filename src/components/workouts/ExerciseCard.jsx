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
import { getBetweenSetCoaching } from "@/utils/coachingEngine";
import { getSmartRestDuration } from "@/utils/fatigueManagement";
import { lookupExercise, EXERCISE_DB } from "@/ml/exerciseDB";

const DB_NAMES = EXERCISE_DB.map(e => e.name).sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
);
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
  workoutLogs = [],          // all historical logs for between-set coaching (Phase 3)
  coachingPhase = 1,         // from getCoachingPhase()
  onApplyCoachingSuggestion = null, // (exerciseIndex, setIndex, weight) => void
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState(null);
  const [coachingChip, setCoachingChip] = useState(null); // { message, suggestedWeight, type, targetSetIndex }
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

    // Evaluate performance if RIR is logged
    if (completed) {
      const set = exercise.sets[setIndex];
      const rir = set.rir ?? set.rpe;

      // Program mode nudge
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

      // Phase 3 between-set coaching (free workout mode)
      if (rir != null && coachingPhase >= 3 && !programExercise) {
        const chip = getBetweenSetCoaching(
          workoutLogs,
          exercise.name,
          { weight: set.weight, reps: set.reps, rir, set_number: set.set_number ?? setIndex + 1 },
          exercise.sets.length,
          exercise.sets.filter(s => s.completed)
        );
        if (chip) {
          const nextSetIndex = setIndex + 1 < exercise.sets.length ? setIndex + 1 : null;
          setCoachingChip({ ...chip, targetSetIndex: nextSetIndex });
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

    // Phase 3 chip triggered when RIR is entered on a completed set in free mode
    if (set.completed && coachingPhase >= 3 && !programExercise) {
      const chip = getBetweenSetCoaching(
        workoutLogs,
        exercise.name,
        { weight: set.weight, reps: set.reps, rir, set_number: set.set_number ?? setIndex + 1 },
        exercise.sets.length,
        exercise.sets.filter(s => s.completed)
      );
      if (chip) {
        const nextSetIndex = setIndex + 1 < exercise.sets.length ? setIndex + 1 : null;
        setCoachingChip({ ...chip, targetSetIndex: nextSetIndex });
      }
    }
  };

  return (
    <>
    <Card className="bg-charcoal-surface">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
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
                  <CardTitle className="text-lg text-white">{exercise.name}</CardTitle>
                  {dbEntry && (
                    <Badge variant="outline" className="text-xs capitalize border-charcoal-border border-charcoal-border text-slate-400 text-slate-400">
                      {dbEntry.type}
                    </Badge>
                  )}
                </div>
                {/* Program targets */}
                {isProgramMode && progressionTargets && (
                  <div className="flex items-center gap-2.5 mt-1">
                    {progressionTargets.workingWeight && (
                      <span className="text-xs text-brand font-semibold">
                        Target: <span className="font-technical">{progressionTargets.workingWeight}</span> {weightUnit}
                      </span>
                    )}
                    {progressionTargets.dailyMin && (
                      <span className="text-xs text-slate-500">
                        Min: <span className="font-technical text-slate-400">{progressionTargets.dailyMin}</span> {weightUnit}
                      </span>
                    )}
                    {programExercise.rir_target && (
                      <span className="text-xs text-slate-500">
                        RIR <span className="font-technical text-slate-400">{programExercise.rir_target}</span>
                      </span>
                    )}
                  </div>
                )}
                {/* Original exercise targets (non-program) */}
                {!isProgramMode && originalExercise && (
                  <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wide">
                    Target: <span className="font-technical">{originalExercise.sets || 3}</span> sets × <span className="font-technical">{originalExercise.reps || 10}</span> reps
                  </p>
                )}
                {/* Last performance data */}
                {lastPerformance && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <History className="w-3 h-3 text-slate-600" />
                    <span className="text-xs text-slate-500">
                      Last: <span className="font-semibold text-brand font-technical">
                        {lastPerformance.lastWeight}
                      </span><span className="text-[10px] text-slate-600 ml-0.5">{weightUnit}</span> × <span className="font-technical text-brand font-semibold">{lastPerformance.lastReps}</span>
                      {lastPerformance.lastDate && (
                        <span className="text-slate-600 ml-1.5 font-technical text-[10px]">
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
              <div className="absolute right-0 top-9 rounded-lg border border-charcoal-border py-1 z-20 min-w-[160px] bg-charcoal-surface text-white ">
                <button
                  onClick={() => {
                    setEditingNotes(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-400  hover:bg-charcoal-elevated hover:bg-charcoal-elevated flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Add notes
                </button>
                <button
                  onClick={() => {
                    setReplaceAlternatives(null);
                    setShowReplaceDialog(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-400  hover:bg-charcoal-elevated hover:bg-charcoal-elevated flex items-center gap-2"
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
                    className="w-full px-3 py-2 text-left text-sm text-slate-400  hover:bg-charcoal-elevated hover:bg-charcoal-elevated flex items-center gap-2"
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
                  className="w-full px-3 py-2 text-left text-sm text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] flex items-center gap-2"
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
        {/* Advisory nudge (program mode) */}
        {nudgeMessage && (
          <div className={`mb-3 p-2.5 rounded-lg text-sm flex items-start gap-2 ${
            nudgeMessage.type === 'success' ? 'bg-[rgba(34,197,94,0.08)] text-[#4ade80]' :
            nudgeMessage.type === 'warning' ? 'bg-[rgba(245,158,11,0.08)] text-[#fbbf24]' :
            'bg-[rgba(59,130,246,0.08)] text-[#60a5fa]'
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

        {/* Between-set coaching chip (Phase 3) */}
        {coachingChip && (
          <div className="mb-3 p-2.5 rounded-lg bg-brand/5 border border-brand/20 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand flex-shrink-0" />
            <span className="text-sm text-slate-300 flex-1">{coachingChip.message}</span>
            {coachingChip.suggestedWeight && coachingChip.targetSetIndex != null && (
              <button
                className="text-xs font-semibold text-brand border border-brand/40 rounded px-2 py-0.5 hover:bg-brand/10"
                onClick={() => {
                  onApplyCoachingSuggestion?.(exerciseIndex, coachingChip.targetSetIndex, coachingChip.suggestedWeight);
                  setCoachingChip(null);
                }}
              >
                Apply
              </button>
            )}
            <button onClick={() => setCoachingChip(null)} className="text-slate-600 hover:text-slate-400 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-full">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-charcoal-border/50 uppercase tracking-wider font-semibold">
                <th className="text-left py-2 px-1.5 w-8 md:w-12">Set</th>
                <th className="text-left py-2 px-1.5 text-xs">Weight</th>
                <th className="text-left py-2 px-1.5 text-xs">Reps</th>
                {showRIR && (
                  <th className="text-left py-2 px-1.5 w-16 md:w-24 text-xs">
                    <div className="flex items-center gap-1">
                      <span>RIR</span>
                      <div className="group relative">
                        <HelpCircle className="w-3 h-3 cursor-help text-slate-500 hover:text-slate-400" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-48 p-2 bg-charcoal text-white text-xs rounded border border-charcoal-border shadow-lg">
                          Reps In Reserve (0-10): How many reps you left in the tank. 0 = failure, 1 = 1 rep left, 2 = 2 reps left.
                        </div>
                      </div>
                    </div>
                  </th>
                )}
                <th className="text-center py-2 px-1.5 w-10 md:w-12 text-xs">✓</th>
                <th className="text-center py-2 px-1.5 w-8 md:w-12"></th>
              </tr>
            </thead>
            <tbody>
              {exercise.sets.map((set, setIndex) => (
                <tr key={setIndex} className={`transition-colors border-b border-charcoal-border/20 ${
                  set.completed
                    ? set.set_type === 'daily_min' 
                      ? "bg-blue-500/5 border-l-2 border-l-blue-500" 
                      : "bg-emerald-500/5 border-l-2 border-l-emerald-500"
                    : "border-l-2 border-l-transparent"
                }`}>
                  <td className="py-2.5 px-1.5">
                    <span className="font-technical text-sm font-semibold text-slate-400">{set.set_number}</span>
                  </td>
                  <td className="py-2.5 px-1.5">
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
                      className="w-16 md:w-24 h-9 text-sm font-technical font-semibold text-center touch-manipulation bg-slate-900 border-charcoal-border focus:border-brand"
                    />
                  </td>
                  <td className="py-2.5 px-1.5">
                    <Input
                      type="number"
                      value={set.reps || ""}
                      onChange={(e) => onUpdateSet(exerciseIndex, setIndex, 'reps', parseInt(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      placeholder={lastPerformance?.lastReps ? String(lastPerformance.lastReps) : "0"}
                      min="0"
                      className="w-14 md:w-20 h-9 text-sm font-technical font-semibold text-center touch-manipulation bg-slate-900 border-charcoal-border focus:border-brand"
                    />
                  </td>
                  {showRIR && (
                    <td className="py-2.5 px-1.5">
                      <Input
                        type="number"
                        value={(set.rir != null ? set.rir : (set.rpe != null ? 10 - set.rpe : null)) ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const rir = val === "" ? null : parseFloat(val);
                          handleRirChange(setIndex, rir);
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="—"
                        min="0"
                        max="10"
                        step="0.5"
                        className="w-14 md:w-24 h-9 text-sm font-technical font-semibold text-center touch-manipulation bg-slate-900 border-charcoal-border focus:border-brand text-brand"
                      />
                    </td>
                  )}
                  <td className="py-2.5 px-1.5 text-center">
                    <Checkbox
                      checked={set.completed}
                      onCheckedChange={(checked) => handleSetCompleted(setIndex, checked)}
                      className="h-5 w-5 md:h-5 md:w-5 border-charcoal-border data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                  </td>
                  <td className="py-2.5 px-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveSet(exerciseIndex, setIndex)}
                      className="h-7 w-7 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <X className="w-3.5 h-3.5" />
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
          className="mt-2 text-brand h-8"
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
              className="mt-1 text-brand"
            >
              Done
            </Button>
          </div>
        ) : exercise.notes ? (
          <p
            className="mt-3 text-sm text-slate-400 italic border-l-2 border-brand/30 pl-3 cursor-pointer hover:bg-charcoal-surface py-1"
            onClick={() => setEditingNotes(true)}
          >
            {exercise.notes}
          </p>
        ) : originalExercise?.notes ? (
          <p className="text-sm text-slate-400 mt-3 italic border-l-2 border-charcoal-border pl-3">
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
            { key: "easier", label: "Easier", icon: "↓" },
            { key: "same",   label: "Same Level", icon: "→" },
            { key: "harder", label: "Harder", icon: "↑" },
          ].map(({ key, label, icon }) => {
            const alt = replaceAlternatives[key];
            if (!alt) return null;

            const origEquip = (dbEntry?.equipment || []).map(e => String(e).toLowerCase());
            const altEquip  = (alt.equipment || []).map(e => String(e).toLowerCase());
            const origIsBarbell  = origEquip.some(e => e.includes('barbell'));
            const altIsDumbbell  = altEquip.some(e => e.includes('dumbbell'));
            const origIsDumbbell = origEquip.some(e => e.includes('dumbbell'));
            const altIsBarbell   = altEquip.some(e => e.includes('barbell'));
            const altIsBodyweight = altEquip.some(e => e.includes('bodyweight') || e === 'none');

            let loadHint = null;
            if (origIsBarbell && altIsDumbbell)       loadHint = 'Use ~45% of barbell load per dumbbell';
            else if (origIsDumbbell && altIsBarbell)  loadHint = 'Combine both dumbbell loads';
            else if (altIsBodyweight)                 loadHint = 'Bodyweight — adjust volume as needed';

            const muscles = (alt.primaryMuscle || []).slice(0, 3).join(', ');

            return (
              <button
                key={key}
                onClick={() => {
                  if (onReplaceExercise) onReplaceExercise(exercise.name, alt);
                  setShowReplaceDialog(false);
                }}
                className="w-full text-left p-4 rounded-xl border border-charcoal-border hover:border-brand/30 hover:bg-brand/[8%] transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-slate-400 group-hover:text-brand">{icon}</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
                      {alt.pattern && (
                        <span className="text-xs text-slate-500 border border-charcoal-border rounded px-1.5 py-0.5">{alt.pattern}</span>
                      )}
                    </div>
                    <p className="font-semibold text-white group-hover:text-brand">{alt.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                      {muscles && <span className="text-xs text-slate-400">{muscles}</span>}
                      <span className="text-xs text-slate-500">{alt.sets} × {alt.reps} · {alt.rest}s</span>
                    </div>
                    {loadHint && (
                      <p className="text-xs text-[#fbbf24] mt-1">{loadHint}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand mt-1 flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-charcoal-border pt-3">
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
