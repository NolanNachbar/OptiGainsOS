import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MoreVertical, FileText, RefreshCw, X, AlertTriangle, TrendingUp, History, HelpCircle, Check, Heart, GripVertical, Camera } from "lucide-react";
import { evaluateSetPerformance } from "@/utils/programProgression";
import { getBetweenSetCoaching } from "@/utils/coachingEngine";
import { getSmartRestDuration } from "@/utils/fatigueManagement";
import { lookupExercise, EXERCISE_DB } from "@/ml/exerciseDB";
import { getLibraryNames, getExerciseInfo, inferSetKind } from "@/utils/exerciseLibrary";
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
  liked = false,            // exercise is in exercise_preferences.preferred
  onToggleLike = null,      // () => void ; toggles the like (steers future programming)
  dragHandleProps = null,  // { attributes, listeners } from useSortable, spread onto the drag handle
  showShotList = false,     // "Shot list" toggle state, lifted from the workout page
  shotNote = null,          // recommended-shot text for this exercise, or null if none defined
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState(null);
  const [coachingChip, setCoachingChip] = useState(null); // { message, suggestedWeight, type, targetSetIndex }
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [libNames, setLibNames] = useState([]); // free-exercise-db names, lazy-loaded
  const [showCues, setShowCues] = useState(false);
  const [cuesInfo, setCuesInfo] = useState(undefined); // undefined=loading, null=none, object=loaded
  const menuRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const menuContentRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});
  const nudgeTimerRef = useRef(null);

  // Select the value AND lift the field above the on-screen keyboard. Without the
  // scroll, focusing a bottom-row set input leaves it hidden behind the keyboard.
  // The on-screen keyboard opening fires a visualViewport resize; scroll THEN, so
  // the field lands inside the shrunken (above-keyboard) viewport instead of
  // guessing the animation duration (the old fixed 250ms timeout was flaky and
  // left the input behind the keyboard). Fallback timeout covers desktop / an
  // already-open keyboard where no resize fires.
  const handleInputFocus = (e) => {
    e.target.select();
    const el = e.target;
    const bringIntoView = () => el.scrollIntoView({ block: "center", behavior: "smooth" });
    const vv = window.visualViewport;
    if (vv) {
      const onResize = () => { vv.removeEventListener("resize", onResize); bringIntoView(); };
      vv.addEventListener("resize", onResize);
      // Fallback if no resize fires (keyboard already open, or desktop).
      setTimeout(() => { vv.removeEventListener("resize", onResize); bringIntoView(); }, 400);
    } else {
      setTimeout(bringIntoView, 250);
    }
  };

  const dbEntry = lookupExercise(exercise.name);
  const smartRest = getSmartRestDuration(exercise.name);
  const isProgramMode = !!programExercise;
  // Timed holds (planks, hangs, carries) log seconds in place of reps.
  const isHold = (exercise.kind || inferSetKind(exercise.name)) === "hold";

  // Presentation only: the first un-completed set is the "active" set.
  const activeSetIndex = exercise.sets.findIndex((s) => !s.completed);

  // Set-grid template — SET | PREV | LOAD | REPS | (RIR) | ✓ | ✕
  // The DONE/✓ and delete/✕ tracks are 44px each (touch-target floor) so the
  // enlarged hit areas aren't re-clipped by their column width. A wider column
  // gap on the trailing tracks keeps ✕ off ✓'s edge so a delete-set mis-tap
  // isn't one stray thumb away from the completion check.
  const gridCols = showRIR
    ? "grid grid-cols-[24px_minmax(52px,1fr)_58px_48px_40px_44px_44px] sm:grid-cols-[32px_minmax(64px,1fr)_88px_72px_56px_44px_44px]"
    : "grid grid-cols-[24px_minmax(52px,1fr)_58px_48px_44px_44px] sm:grid-cols-[32px_minmax(64px,1fr)_88px_72px_44px_44px]";

  // Translucent value cell — 44px tall (touch-target floor), rounded 10px,
  // inset top highlight. Cells inside the active (coral-tinted) row read
  // slightly brighter.
  const setCell = (isActive) =>
    `h-11 w-full min-w-0 rounded-[10px] text-center font-technical font-extrabold text-[14px] text-ink ` +
    `placeholder:text-ink-faint placeholder:font-semibold border-0 touch-manipulation ` +
    `shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] focus:outline-none focus:ring-2 focus:ring-brand/40 ` +
    `${isActive ? 'bg-[var(--glass-bg)]' : 'bg-track'}`;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!openMenu) return;
      const inTrigger = menuTriggerRef.current?.contains(e.target);
      const inMenu = menuContentRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setOpenMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  // The dropdown is portaled to <body> (fixed positioning, flips up if it
  // won't fit below) so it can never be clipped by a scroll container or
  // buried under the sticky logging action bar the way an `absolute`-positioned
  // menu anchored inside the card could be — this is the same pattern
  // combobox.jsx uses for the same class of bug.
  useEffect(() => {
    if (!openMenu || !menuTriggerRef.current) return;
    const MENU_H = 236; // 5 rows max, roughly — used only for the flip decision
    const updatePosition = () => {
      if (!menuTriggerRef.current) return;
      const rect = menuTriggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < MENU_H && rect.top > spaceBelow;
      setMenuStyle(
        flipUp
          ? { bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 4, right: window.innerWidth - rect.right }
      );
    };
    let rafId = null;
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePosition);
    };
    updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
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

  // Lazy-load how-to instructions for THIS exercise when the cues dialog opens.
  useEffect(() => {
    if (showCues) {
      setCuesInfo(undefined);
      getExerciseInfo(exercise.name).then((info) => setCuesInfo(info)).catch(() => setCuesInfo(null));
    }
  }, [showCues, exercise.name]);

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
                  {onToggleLike && (
                    <button
                      type="button"
                      onClick={onToggleLike}
                      aria-label={liked ? "Unlike this exercise" : "Like this exercise — the engine will program it more"}
                      aria-pressed={liked}
                      title={liked ? "Liked — programmed more often" : "Like — program this more often"}
                      className="min-h-[32px] min-w-[32px] -my-1 flex items-center justify-center touch-manipulation"
                    >
                      <Heart className={`w-[18px] h-[18px] transition-colors ${liked ? "fill-brand text-brand" : "text-ink-faint hover:text-brand"}`} strokeWidth={2.5} />
                    </button>
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
            {dragHandleProps && (
              <button
                type="button"
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
                aria-label="Drag to reorder exercise"
                className="h-9 w-8 flex items-center justify-center text-ink-faint hover:text-ink touch-manipulation cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
            <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              ref={menuTriggerRef}
              onClick={() => setOpenMenu(!openMenu)}
              className="h-9 w-9"
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
            {openMenu && createPortal(
              <div
                ref={menuContentRef}
                style={menuStyle}
                className="fixed glass-elevated rounded-xl overflow-y-auto max-h-[min(60vh,320px)] overscroll-contain py-1 z-[10200] min-w-[160px] text-ink"
              >
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
                <button
                  onClick={() => {
                    setShowCues(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                >
                  <HelpCircle className="w-4 h-4" />
                  How to
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
              </div>,
              document.body
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

        {/* Shot list — recommended shot for this exercise, only when the workout-level
            toggle is on and a shot_note is defined (most exercises won't have one). */}
        {showShotList && shotNote && (
          <div className="mb-3 px-3 py-2.5 rounded-xl glass-inset flex items-start gap-2.5">
            <i className="w-[26px] h-[26px] rounded-[9px] bg-brand/[0.16] text-brand flex items-center justify-center flex-shrink-0 not-italic">
              <Camera className="w-3.5 h-3.5" />
            </i>
            <span className="text-xs font-semibold text-ink-muted leading-relaxed pt-1">{shotNote}</span>
          </div>
        )}

        {/* Set progress segments — NEUTRAL, not hue-coded. rtb-2/3: completed/active/
            pending was bg-teal/bg-brand, but a set-progress strip is structural
            chrome, not a datum that owns a hue (teal is the single action color).
            Repainted to a neutral ramp: completed = bright glass edge, active =
            primary ink, pending = the shared empty track material. */}
        <div className="flex gap-[5px] mb-3">
          {exercise.sets.map((s, i) => (
            <i
              key={i}
              className={`flex-1 h-1 rounded-full ${
                s.completed ? 'bg-[var(--glass-edge-strong)]' : i === activeSetIndex ? 'bg-ink' : 'bg-track'
              }`}
            />
          ))}
        </div>

        {/* Column header */}
        <div className={`${gridCols} gap-1 sm:gap-1.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted`}>
          <span className="pl-0.5">Set</span>
          <span>Last</span>
          <span className="text-center">{weightUnit}</span>
          <span className="text-center">{isHold ? "Sec" : "Reps"}</span>
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
          <span className="text-center">Done</span>
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
          // A back-off set's target is its own reps, not the exercise's headline
          // rep_target (the top set's) — comparing a 5-rep back-off against a
          // 3-rep target flags every made set as a miss.
          const prescribedReps = (set.set_label ? Number(set.reps) : parseInt(programExercise?.rep_target)) || 0;
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
          // A merged lift (heavy top set, then back-offs) is one exercise whose
          // sets are not all the same prescription. Head each block once so the
          // card reads the way the lift is written, without inventing a second
          // exercise row for the back-offs.
          const blockLabel = set.set_label
            && (setIndex === 0 || exercise.sets[setIndex - 1]?.set_label !== set.set_label)
            ? set.set_label : null;
          return (
          <div key={setIndex}>
            {blockLabel && (
              <div className="pt-2 pb-1 text-[10px] font-technical font-bold uppercase tracking-wider text-ink-faint">
                {blockLabel}
              </div>
            )}
            <div
              className={`${gridCols} gap-1 sm:gap-1.5 items-center min-h-[44px] py-[5px] transition-colors [transition-timing-function:var(--ease)] duration-200 ${
                isActive
                  ? 'bg-brand/[0.06] rounded-xl -mx-2 px-2'
                  : setIndex === 0 ? '' : 'border-t-[0.5px] border-t-charcoal-border'
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
                className="font-technical text-[11px] font-semibold text-ink-faint whitespace-nowrap pr-1 text-left tabular-nums disabled:cursor-default enabled:active:text-brand"
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
                aria-label={isHold ? `Set ${set.set_number} hold seconds` : `Set ${set.set_number} reps`}
                value={(isHold ? set.duration_s : set.reps) || ""}
                onChange={(e) => onUpdateSet(exerciseIndex, setIndex, isHold ? 'duration_s' : 'reps', parseInt(e.target.value) || 0)}
                onFocus={handleInputFocus}
                placeholder={isHold ? "30" : (lastPerformance?.lastReps ? String(lastPerformance.lastReps) : "0")}
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
                <span className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 [transition-timing-function:var(--ease)] ${
                  set.completed
                    ? 'bg-brand/[0.16] text-brand'
                    : 'border-[1.5px] border-charcoal-border text-ink-faint hover:border-brand/50 hover:text-brand'
                }`}>
                  <Check className="w-5 h-5" strokeWidth={3} />
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove set ${set.set_number}`}
                onClick={() => onRemoveSet(exerciseIndex, setIndex)}
                // ml gap keeps delete (✕) off the completion check's (✓) edge so a
                // confirm-set tap doesn't sit one stray thumb from deleting the set.
                className="min-h-[44px] w-full flex items-center justify-center pl-1.5 text-ink-faint hover:text-bad touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tag capture. failure_reason (miss): WHY it fell short — technical reasons
                route to programming, "out of gas" eases the cut. sticking_point (made,
                RIR ≤ 1): WHERE it stalled, programming only, never the cut signal. */}
            {reasonKeys.length > 0 && tagField && (
              <div className="flex flex-wrap items-center gap-1.5 pb-2 pl-0.5 -mt-0.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] ${
                  tagField === 'failure_reason' ? 'text-warn' : 'text-info'
                }`}>
                  <AlertTriangle className="w-3 h-3" />
                  {tagField === 'failure_reason' ? 'Missed, why?' : 'Where did it stall?'}
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
                {/* Free text on "Other": let the athlete type WHY when no bucket fits. */}
                {tagField === 'failure_reason' && set.failure_reason === 'other' && (
                  <input
                    type="text"
                    value={set.failure_note || ""}
                    onChange={(e) => onUpdateSet(exerciseIndex, setIndex, 'failure_note', e.target.value)}
                    onFocus={handleInputFocus}
                    placeholder="What happened?"
                    aria-label={`Set ${set.set_number} — what happened`}
                    className="w-full mt-1 text-[12px] rounded-lg px-2.5 py-1.5 bg-transparent border border-charcoal-border text-ink placeholder:text-ink-faint focus:border-brand/50 focus:outline-none touch-manipulation"
                  />
                )}
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
            className="mt-3 text-sm text-ink-muted italic border-l-2 border-brand/30 pl-3 cursor-pointer hover:bg-track rounded-r-lg py-1"
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

    {/* How-to / cues — instructions from the free-exercise-db library */}
    <Dialog open={showCues} onOpenChange={setShowCues}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
          {cuesInfo && (cuesInfo.primaryMuscles?.length || cuesInfo.equipment) && (
            <DialogDescription className="capitalize">
              {[cuesInfo.primaryMuscles?.join(", "), cuesInfo.equipment].filter(Boolean).join(" · ")}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-2 text-sm text-ink-secondary max-h-[60vh] overflow-y-auto">
          {cuesInfo === undefined ? (
            <p className="text-ink-muted">Loading…</p>
          ) : cuesInfo?.instructions?.length ? (
            <ol className="list-decimal pl-5 space-y-2">
              {cuesInfo.instructions.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          ) : (
            <p className="text-ink-muted">No how-to found for this exercise in the library.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
