import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MoreVertical, FileText, RefreshCw, X, AlertTriangle, TrendingUp, History, HelpCircle, Check } from "lucide-react";
import { evaluateSetPerformance } from "@/utils/programProgression";
import { getBetweenSetCoaching } from "@/utils/coachingEngine";
import { getSmartRestDuration } from "@/utils/fatigueManagement";
import { lookupExercise, EXERCISE_DB } from "@/ml/exerciseDB";
import { getLibraryNames } from "@/utils/exerciseLibrary";
import { FAILURE_REASONS, reasonsForExercise, stickingPointReasons, isMissedSet } from "@/config/failureReasons";

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
  onReplaceExercise = null,
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
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [libNames, setLibNames] = useState([]); // free-exercise-db names, lazy-loaded
  const menuRef = useRef(null);
  const nudgeTimerRef = useRef(null);

  // Select the value AND lift the field above the on-screen keyboard. Without the
  // scroll, focusing a bottom-row set input leaves it hidden behind the keyboard.
  // ponytail: 250ms heuristic waits for the keyboard animation; swap for a
  // visualViewport resize listener if the delay proves flaky on some devices.
  const handleInputFocus = (e) => {
    e.target.select();
    const el = e.target;
    setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
  };

  const dbEntry = lookupExercise(exercise.name);
  const smartRest = getSmartRestDuration(exercise.name);
  const isProgramMode = !!programExercise;

  // Presentation only: the first un-completed set is the "active" set.
  const activeSetIndex = exercise.sets.findIndex((s) => !s.completed);

  // Set-grid template — SET | PREV | LOAD | REPS | (RIR) | ✓ | ✕
  const gridCols = showRIR
    ? "grid grid-cols-[26px_minmax(0,1fr)_62px_52px_46px_34px_26px] sm:grid-cols-[32px_minmax(0,1fr)_88px_72px_56px_38px_30px]"
    : "grid grid-cols-[26px_minmax(0,1fr)_62px_52px_34px_26px] sm:grid-cols-[32px_minmax(0,1fr)_88px_72px_38px_30px]";

  // Translucent value cell — 36px tall, rounded 10px, inset top highlight.
  // Cells inside the active (coral-tinted) row read slightly brighter.
  const setCell = (isActive) =>
    `h-9 w-full min-w-0 rounded-[10px] text-center font-technical font-extrabold text-[14px] text-ink ` +
    `placeholder:text-ink-faint placeholder:font-semibold border-0 touch-manipulation ` +
    `shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] focus:outline-none focus:ring-2 focus:ring-teal/40 ` +
    `${isActive ? 'bg-white/[0.09]' : 'bg-white/[0.05]'}`;

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

  // Lazy-load the full exercise library only when the swap dialog opens.
  useEffect(() => {
    if (showReplaceDialog && libNames.length === 0) {
      getLibraryNames().then(setLibNames).catch(() => {});
    }
  }, [showReplaceDialog, libNames.length]);

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
    <Card className="rise-in">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-brand/15 border border-brand/30 flex items-center justify-center text-brand font-technical font-extrabold text-[13px] flex-shrink-0">
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
                  <CardTitle className="text-[17px] font-extrabold text-ink">{exercise.name}</CardTitle>
                  {dbEntry && (
                    <Badge variant="outline" className="text-xs capitalize border-charcoal-border text-ink-muted">
                      {dbEntry.type}
                    </Badge>
                  )}
                </div>
                {/* Program targets */}
                {isProgramMode && progressionTargets && (
                  <div className="flex items-center gap-2.5 mt-1 text-[11px] font-semibold text-ink-muted">
                    {progressionTargets.workingWeight && (
                      <span>
                        Target <span className="font-technical font-extrabold text-ink">{progressionTargets.workingWeight}</span> {weightUnit}
                      </span>
                    )}
                    {progressionTargets.dailyMin && (
                      <span>
                        Min <span className="font-technical font-extrabold text-ink">{progressionTargets.dailyMin}</span> {weightUnit}
                      </span>
                    )}
                    {programExercise.rir_target && (
                      <span>
                        RIR <span className="font-technical font-extrabold text-ink">{programExercise.rir_target}</span>
                      </span>
                    )}
                  </div>
                )}
                {/* Original exercise targets (non-program) */}
                {!isProgramMode && originalExercise && (
                  <p className="text-[10.5px] text-ink-muted mt-1 uppercase font-bold tracking-[0.06em]">
                    Target <span className="font-technical text-ink">{Array.isArray(originalExercise.sets) ? originalExercise.sets.length : (originalExercise.sets || 3)}</span> × <span className="font-technical text-ink">{originalExercise.reps || 10}</span> reps
                  </p>
                )}
                {/* Last performance data */}
                {lastPerformance && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <History className="w-3 h-3 text-ink-faint" />
                    <span className="text-[11px] font-semibold text-ink-muted">
                      Last <span className="font-technical font-extrabold text-ink-secondary">
                        {lastPerformance.lastWeight}
                      </span><span className="text-[10px] text-ink-faint ml-0.5">{weightUnit}</span> × <span className="font-technical font-extrabold text-ink-secondary">{lastPerformance.lastReps}</span>
                      {lastPerformance.lastDate && (
                        <span className="text-ink-faint ml-1.5 font-technical text-[10px]">
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
              <div className="absolute right-0 top-9 glass-elevated rounded-xl overflow-hidden py-1 z-20 min-w-[160px] text-ink">
                <button
                  onClick={() => {
                    setEditingNotes(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Add notes
                </button>
                {onReplaceExercise && (
                <button
                  onClick={() => {
                    setShowReplaceDialog(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Replace exercise
                </button>
                )}
                {isProgramMode && (
                  <button
                    onClick={() => {
                      onAddSet(exerciseIndex, { set_type: 'daily_min', weight: progressionTargets?.dailyMin || 0 });
                      setOpenMenu(false);
                    }}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
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
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-bad hover:bg-bad/10 flex items-center gap-2"
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
          <div className="mb-3 px-3 py-2.5 rounded-xl glass-inset flex items-start gap-2.5">
            <i className={`w-[26px] h-[26px] rounded-[9px] flex items-center justify-center flex-shrink-0 not-italic ${
              nudgeMessage.type === 'success' ? 'bg-teal/[0.16] text-teal' :
              nudgeMessage.type === 'warning' ? 'bg-warn/[0.15] text-warn' :
              'bg-info/[0.15] text-info'
            }`}>
              {nudgeMessage.type === 'warning' ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5" />
              )}
            </i>
            <span className="text-xs font-semibold text-ink-muted leading-relaxed pt-1">{nudgeMessage.message}</span>
            <button onClick={() => setNudgeMessage(null)} aria-label="Dismiss" className="ml-auto flex-shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -mr-2 text-ink-faint hover:text-ink-muted">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Between-set coaching chip (Phase 3) */}
        {coachingChip && (
          <div className="mb-3 px-3 py-2.5 rounded-xl glass-inset flex items-center gap-2.5 rise-in">
            <i className="w-[26px] h-[26px] rounded-[9px] bg-coral/15 text-coral flex items-center justify-center flex-shrink-0 not-italic">
              <TrendingUp className="w-3.5 h-3.5" />
            </i>
            <span className="text-xs font-semibold text-ink-muted leading-relaxed flex-1">{coachingChip.message}</span>
            {coachingChip.suggestedWeight && coachingChip.targetSetIndex != null && (
              <button
                className="text-[11px] font-bold text-brand bg-brand/10 border border-brand/30 rounded-full px-2.5 py-1 hover:bg-brand/15"
                onClick={() => {
                  onApplyCoachingSuggestion?.(exerciseIndex, coachingChip.targetSetIndex, coachingChip.suggestedWeight);
                  setCoachingChip(null);
                }}
              >
                Apply
              </button>
            )}
            <button onClick={() => setCoachingChip(null)} aria-label="Dismiss" className="flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -mr-2 text-ink-faint hover:text-ink-muted flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Set progress segments — done teal, current coral, upcoming faint */}
        <div className="flex gap-[5px] mb-3">
          {exercise.sets.map((s, i) => (
            <i
              key={i}
              className={`flex-1 h-1 rounded-full ${
                s.completed ? 'bg-teal' : i === activeSetIndex ? 'bg-brand' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Column header */}
        <div className={`${gridCols} gap-1 sm:gap-1.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted`}>
          <span className="pl-0.5">Set</span>
          <span>Last</span>
          <span className="text-center">{weightUnit}</span>
          <span className="text-center">Reps</span>
          {showRIR && (
            <span className="text-center flex items-center justify-center gap-1">
              RIR
              <span className="group relative">
                <HelpCircle className="w-3 h-3 cursor-help" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-48 p-2 glass-elevated rounded-lg text-ink text-[11px] font-semibold normal-case tracking-normal text-left">
                  Reps In Reserve (0-10): How many reps you left in the tank. 0 = failure, 1 = 1 rep left, 2 = 2 reps left.
                </span>
              </span>
            </span>
          )}
          <span></span>
          <span></span>
        </div>

        {/* Set rows */}
        {exercise.sets.map((set, setIndex) => {
          const isActive = !set.completed && setIndex === activeSetIndex;
          // Compare against what was PRESCRIBED for this set (working/daily-min
          // weight × the exercise's rep target), not a heavier all-time best — so
          // programmed-lighter sets that hit their target aren't flagged as misses.
          const prescribedWeight = set.set_type === 'daily_min'
            ? progressionTargets?.dailyMin
            : progressionTargets?.workingWeight;
          const prescribedReps = parseInt(programExercise?.rep_target) || 0;
          const missed = isMissedSet(set, { weight: prescribedWeight, reps: prescribedReps });
          // Two tag modes, miss wins: a missed set tags WHY (failure_reason → nutrition +
          // programming); a MADE near-failure set (RIR ≤ 1) tags WHERE it stalled
          // (sticking_point → programming only). Big-3 only for sticking points.
          const rir = set.rir != null ? set.rir : (set.rpe != null ? 10 - set.rpe : null);
          const hardMake = !!set.completed && !missed && rir != null && rir <= 1;
          const tagField = (missed || set.failure_reason) ? 'failure_reason'
            : (hardMake || set.sticking_point) ? 'sticking_point' : null;
          const reasonKeys = tagField === 'failure_reason' ? reasonsForExercise(exercise.name)
            : tagField === 'sticking_point' ? stickingPointReasons(exercise.name) : [];
          return (
          <div key={setIndex}>
            <div
              className={`${gridCols} gap-1 sm:gap-1.5 items-center min-h-[44px] py-[5px] transition-colors ${
                isActive
                  ? 'bg-[rgba(239,115,104,0.06)] rounded-xl -mx-2 px-2'
                  : setIndex === 0 ? '' : 'border-t-[0.5px] border-t-white/[0.08]'
              }`}
            >
              <span className={`font-technical text-[13px] font-extrabold pl-0.5 ${
                set.set_type === 'daily_min' ? 'text-info' : 'text-ink-muted'
              }`}>
                {set.set_number}
              </span>
              <button
                type="button"
                disabled={!lastPerformance?.lastWeight}
                onClick={() => {
                  // Tap "last time" to copy it into this set (Hevy-style prefill).
                  onUpdateSet(exerciseIndex, setIndex, 'weight', lastPerformance.lastWeight);
                  onUpdateSet(exerciseIndex, setIndex, 'reps', lastPerformance.lastReps);
                }}
                aria-label={lastPerformance?.lastWeight ? `Use last set ${lastPerformance.lastWeight} by ${lastPerformance.lastReps}` : 'No previous set'}
                className="font-technical text-[11px] font-semibold text-ink-faint truncate pr-1 text-left disabled:cursor-default enabled:active:text-brand"
              >
                {lastPerformance?.lastWeight
                  ? `${lastPerformance.lastWeight}×${lastPerformance.lastReps}`
                  : '—'}
              </button>
              <input
                type="number"
                aria-label={`Set ${set.set_number} weight in ${weightUnit}`}
                value={set.weight || ""}
                onChange={(e) => onUpdateSet(exerciseIndex, setIndex, 'weight', parseFloat(e.target.value) || 0)}
                onFocus={handleInputFocus}
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
                className={setCell(isActive)}
              />
              <input
                type="number"
                aria-label={`Set ${set.set_number} reps`}
                value={set.reps || ""}
                onChange={(e) => onUpdateSet(exerciseIndex, setIndex, 'reps', parseInt(e.target.value) || 0)}
                onFocus={handleInputFocus}
                placeholder={lastPerformance?.lastReps ? String(lastPerformance.lastReps) : "0"}
                min="0"
                className={setCell(isActive)}
              />
              {showRIR && (
                <input
                  type="number"
                  aria-label={`Set ${set.set_number} reps in reserve`}
                  value={(set.rir != null ? set.rir : (set.rpe != null ? 10 - set.rpe : null)) ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const rir = val === "" ? null : parseFloat(val);
                    handleRirChange(setIndex, rir);
                  }}
                  onFocus={handleInputFocus}
                  placeholder="—"
                  min="0"
                  max="10"
                  step="0.5"
                  className={setCell(isActive)}
                />
              )}
              <button
                type="button"
                role="checkbox"
                aria-checked={set.completed}
                aria-label={`Mark set ${set.set_number} ${set.completed ? 'incomplete' : 'complete'}`}
                onClick={() => handleSetCompleted(setIndex, !set.completed)}
                className="min-h-[44px] w-full flex items-center justify-center touch-manipulation"
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                  set.completed
                    ? 'bg-teal/[0.16] text-teal'
                    : 'border-[1.5px] border-charcoal-border text-transparent hover:border-white/30'
                }`}>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove set ${set.set_number}`}
                onClick={() => onRemoveSet(exerciseIndex, setIndex)}
                className="min-h-[44px] w-full flex items-center justify-center text-ink-faint hover:text-bad touch-manipulation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tag capture. failure_reason (miss): WHY it fell short — technical reasons
                route to programming, "out of gas" eases the cut. sticking_point (made,
                RIR ≤ 1): WHERE it stalled — programming only, never the cut signal. */}
            {reasonKeys.length > 0 && tagField && (
              <div className="flex flex-wrap items-center gap-1.5 pb-2 pl-0.5 -mt-0.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] ${
                  tagField === 'failure_reason' ? 'text-warn' : 'text-info'
                }`}>
                  <AlertTriangle className="w-3 h-3" />
                  {tagField === 'failure_reason' ? 'Missed — why?' : 'Where did it stall?'}
                </span>
                {reasonKeys.map((rk) => {
                  const sel = set[tagField] === rk;
                  return (
                    <button
                      key={rk}
                      type="button"
                      onClick={() => onUpdateSet(exerciseIndex, setIndex, tagField, sel ? null : rk)}
                      className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors ${
                        sel
                          ? 'bg-brand/[0.16] border-brand/40 text-brand'
                          : 'border-charcoal-border text-ink-muted hover:border-brand/30 hover:text-ink'
                      }`}
                    >
                      {FAILURE_REASONS[rk]?.label || rk}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
        <Button
          variant="ghost"
          onClick={() => onAddSet(exerciseIndex)}
          className="mt-2 text-brand min-h-[44px]"
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
            className="mt-3 text-sm text-ink-muted italic border-l-2 border-brand/30 pl-3 cursor-pointer hover:bg-white/[0.05] rounded-r-lg py-1"
            onClick={() => setEditingNotes(true)}
          >
            {exercise.notes}
          </p>
        ) : originalExercise?.notes ? (
          <p className="text-sm text-ink-muted mt-3 italic border-l-2 border-charcoal-border pl-3">
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
        <div className="mt-2">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Swap to another exercise</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Combobox
                value={customExerciseName}
                onValueChange={setCustomExerciseName}
                items={(allExerciseNames.length || libNames.length) ? [...new Set([...allExerciseNames, ...libNames])] : DB_NAMES}
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
        <Button variant="ghost" className="w-full mt-2 text-ink-muted" onClick={() => { setCustomExerciseName(""); setShowReplaceDialog(false); }}>
          Keep current exercise
        </Button>
      </DialogContent>
    </Dialog>
  </>
  );
}
