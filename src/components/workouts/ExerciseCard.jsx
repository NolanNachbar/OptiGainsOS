import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, MoreVertical, FileText, RefreshCw, X, AlertTriangle, TrendingUp, HelpCircle, Check, Heart, GripVertical, Camera } from "lucide-react";
import { evaluateSetPerformance } from "@/utils/programProgression";
import { getBetweenSetCoaching } from "@/utils/coachingEngine";
import { getSmartRestDuration } from "@/utils/fatigueManagement";
import { EXERCISE_DB } from "@/ml/exerciseDB";
import { getLibraryNames, getExerciseInfo, inferSetKind } from "@/utils/exerciseLibrary";
import { FAILURE_REASONS, reasonsForExercise, stickingPointReasons, isMissedSet } from "@/config/failureReasons";
import { estimateOneRepMax, isE1rmEligibleSet } from "@/utils/exerciseStats";

const DB_NAMES = EXERCISE_DB.map(e => e.name).sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
);
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  // Focused-exercise model (Ledger rebuild): exactly one exercise is "focused"
  // (full rich card — header, vitals, set table, tools); every other exercise
  // in the session renders as a compact one-line row via this same component
  // (same hooks/effects/keys/drag identity — only the JSX branch differs, so
  // switching focus never unmounts/remounts a card mid-interaction). Tapping
  // a compact row calls onFocus to make it the new focused exercise.
  isFocused = true,
  onFocus = null,
  // Reorder mode (Ledger rebuild): drag handles are hidden on every row
  // (focused card + compact .nx rows) until explicitly chosen from the
  // kebab, matching the mockup's flush, handle-free rows. Both booleans are
  // lifted to WorkoutDetail since one toggle governs every ExerciseCard.
  reorderMode = false,
  onToggleReorderMode = null,
  // True when this is the last compact row in the "Next" module — suppresses
  // its own bottom rule so the module's rows read as N-1 internal dividers,
  // not N (which would double up against the module container's own edge).
  isLastRow = false,
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState(null);
  const confirmedHeavyRef = useRef({});
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

  const smartRest = getSmartRestDuration(exercise.name);
  const isProgramMode = !!programExercise;
  // Timed holds (planks, hangs, carries) log seconds in place of reps.
  const isHold = (exercise.kind || inferSetKind(exercise.name)) === "hold";

  // Presentation only: the first un-completed set is the "active" set.
  const activeSetIndex = exercise.sets.findIndex((s) => !s.completed);

  // Ledger per-exercise vitals (DESIGN.md dB .vit4): Target / Volume vs last /
  // Best set — all derived from props already in memory (programExercise,
  // progressionTargets, originalExercise, lastPerformance, exercise.sets), so
  // this adds no fetch and can't change offline behavior. Any cell whose data
  // doesn't exist is simply omitted (rendered null below), per spec "only
  // where data exists". The Target cell reuses exactly the same conditional
  // logic as the pre-existing header target line — same data, same rule.
  const vitals = useMemo(() => {
    let target = null;
    if (isProgramMode && progressionTargets) {
      const bits = [];
      if (progressionTargets.workingWeight) bits.push(`${progressionTargets.workingWeight} ${weightUnit}`);
      if (progressionTargets.dailyMin) bits.push(`min ${progressionTargets.dailyMin}`);
      if (bits.length) {
        target = { primary: bits.join(' · '), sub: programExercise?.rir_target ? `RIR ${programExercise.rir_target}` : null };
      }
    } else if (!isProgramMode && originalExercise) {
      const setCount = Array.isArray(originalExercise.sets) ? originalExercise.sets.length : (originalExercise.sets || 3);
      target = { primary: `${setCount} × ${originalExercise.reps || 10}`, sub: null };
    }

    const repsOf = (s) => (isHold ? s.duration_s : s.reps);
    const completedSets = exercise.sets.filter(
      (s) => s.completed && Number(s.weight) > 0 && Number(repsOf(s)) > 0
    );
    const currentVolume = completedSets.reduce((sum, s) => sum + Number(s.weight) * Number(repsOf(s)), 0);
    // Apples-to-apples comparison (coordinator review, r4d/step3): comparing
    // in-progress volume (only the sets done SO FAR) against last session's
    // FULL total made an honest mid-workout state read as "+550%" or a scary
    // negative before the workout was even done. Compare against only the
    // first N sets of last time, N = completedSets.length here, so both
    // sides cover the same amount of work. No last session, or fewer than N
    // sets logged last time (rep scheme not comparable), -> null ("–").
    const lastComparableSets = lastPerformance?.sets?.slice(0, completedSets.length) ?? [];
    const comparable = lastComparableSets.length === completedSets.length;
    const lastVolume = comparable
      ? lastComparableSets.reduce((sum, s) => sum + Number(s.weight || 0) * Number(s.reps || 0), 0)
      : 0;
    // current shows whenever there's real volume so far; deltaPct is null
    // ("–" in the UI) whenever the comparison isn't apples-to-apples
    // (no last session, or fewer comparable sets logged last time).
    const volume = currentVolume > 0
      ? {
          current: Math.round(currentVolume),
          deltaPct: comparable && lastVolume > 0
            ? Math.round(((currentVolume - lastVolume) / lastVolume) * 100)
            : null,
        }
      : null;

    let best = null;
    if (completedSets.length > 0) {
      const bestSet = completedSets.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
      best = {
        weight: bestSet.weight,
        reps: repsOf(bestSet),
        e1rm: !isHold && isE1rmEligibleSet(bestSet) ? Math.round(estimateOneRepMax(bestSet.weight, bestSet.reps)) : null,
      };
    }

    if (!target && !volume && !best) return null;
    return { target, volume, best };
  }, [isProgramMode, progressionTargets, programExercise, originalExercise, exercise.sets, isHold, lastPerformance, weightUnit]);

  // Set-grid template (DESIGN.md dB .st) — SET | PREV | LOAD | REPS | (RIR) |
  // E1RM | ✓ | ✕. LOAD/REPS/RIR are real <input>s and ✓/✕ are real buttons,
  // so all five stay 44px (touch-target floor) at every breakpoint; SET (a
  // label) and E1RM (read-only text) are the only tracks allowed to shrink.
  // Measured at 428px viewport: the card's inner content area is 362px once
  // the page's p-4, the card's 1px border, and CardContent's px-4 are
  // subtracted. 22+52(Prev min)+44+44+44+36+44+44 + 7×4px gaps = 358px, so
  // all 8 tracks fit with 4px to spare — no column needs to drop on mobile.
  const gridCols = showRIR
    ? "grid grid-cols-[22px_minmax(52px,1fr)_44px_44px_44px_36px_44px_44px] sm:grid-cols-[32px_minmax(64px,1fr)_72px_60px_48px_48px_44px_44px]"
    : "grid grid-cols-[22px_minmax(52px,1fr)_44px_44px_36px_44px_44px] sm:grid-cols-[32px_minmax(64px,1fr)_80px_64px_48px_44px_44px]";

  // Translucent value cell — 44px tall (touch-target floor), rounded 10px,
  // inset top highlight. Cells inside the active (raised) row read slightly
  // brighter; future (not-yet-reached, not completed) rows mute their value
  // text so the current row is the one thing that reads at full contrast.
  const setCell = (isActive, muted = false) =>
    `h-11 w-full min-w-0 rounded-[10px] text-center font-technical font-extrabold text-[14px] ` +
    `${muted ? 'text-ink-faint' : 'text-ink'} ` +
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
    // Sweaty-thumb guard (r1-01): a fat-fingered extra digit (1710 for 171)
    // sails past any per-field max and becomes the e1RM/PR/progression
    // baseline the moment the set is marked complete. Catch it here, once,
    // right before it's treated as real data — not in onChange, so typing
    // isn't interrupted mid-entry. Tunable UI threshold, not engine semantics.
    if (completed) {
      const weight = exercise.sets[setIndex]?.weight;
      const lastWeight = lastPerformance?.lastWeight;
      // Once the athlete confirms a heavy weight for this exercise, don't ask
      // again for later sets at or below it (a light last session, or a unit
      // switch, would otherwise nag on every working set). Keyed by name, not
      // card index: cards are keyed by index and a drag-reorder reuses them.
      const confirmedMax = confirmedHeavyRef.current[exercise.name] ?? 0;
      if (
        typeof weight === 'number' && Number.isFinite(weight)
        && typeof lastWeight === 'number' && lastWeight > 0
        && weight > lastWeight * 2
        && weight > confirmedMax
      ) {
        const ok = window.confirm(
          `${weight} ${weightUnit} is much heavier than your last ${lastWeight} ${weightUnit} on this exercise. Save it anyway?`
        );
        if (!ok) return;
        confirmedHeavyRef.current[exercise.name] = weight;
      }
    }

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

  // Compact one-line row for every exercise other than the focused one
  // (mockup .nx: "name · target · last time"). Ledger rebuild (coordinator
  // review, r4d/step3): the old version was a boxed glass-inset card with a
  // big gap, an always-visible (usually empty) drag-handle slot, and an
  // empty check circle — heavy for a row that mostly just says "up next".
  // Rebuilt full-bleed and flush: no card chrome, no rounded box, just a 1px
  // rule under each row (the LAST row's rule is suppressed by the caller via
  // isLastRow, matching a module's closing edge instead of doubling it with
  // the module container's own border). Upcoming rows read as plain text;
  // done rows mute to ink-muted with a small check + "done/target" in place
  // of the target string. All hooks above still run every render regardless
  // of isFocused, so toggling focus never changes this component's hook
  // order.
  if (!isFocused) {
    const doneCount = exercise.sets.filter((s) => s.completed).length;
    const totalCount = exercise.sets.length;
    const isDone = totalCount > 0 && doneCount === totalCount;
    const targetText = vitals?.target?.primary ?? (totalCount ? `${totalCount} sets` : null);
    const lastTimeText = lastPerformance?.lastWeight
      ? `${lastPerformance.lastWeight}${weightUnit}×${lastPerformance.lastReps}`
      : null;
    return (
      <button
        type="button"
        onClick={() => onFocus?.()}
        data-testid={`exercise-row-${exerciseIndex}`}
        className={`w-full min-h-[48px] flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-charcoal-borderSoft/30 ${
          isLastRow ? "" : "border-b border-charcoal-border"
        }`}
      >
        {dragHandleProps && reorderMode && (
          <span
            role="button"
            tabIndex={-1}
            aria-hidden="true"
            className="touch-none text-ink-faint flex-shrink-0 -ml-1"
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" strokeWidth={2.5} />
          </span>
        )}
        {isDone && (
          <Check className="w-3.5 h-3.5 text-up flex-shrink-0" strokeWidth={3} />
        )}
        <span className={`flex-1 min-w-0 truncate text-[14px] font-semibold ${isDone ? "text-ink-muted" : "text-ink"}`}>
          {exercise.name}
        </span>
        {isDone ? (
          <span className="flex-shrink-0 font-technical text-[12px] text-ink-muted tabular-nums">
            {doneCount}/{targetText || totalCount}
          </span>
        ) : (
          targetText && (
            <span className="flex-shrink-0 font-technical text-[12px] text-ink-secondary tabular-nums">
              {targetText}
            </span>
          )
        )}
        {lastTimeText && (
          <span className="flex-shrink-0 font-technical text-[12px] text-ink-faint tabular-nums hidden sm:inline">
            {lastTimeText}
          </span>
        )}
      </button>
    );
  }

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
              // Ledger rebuild: the name is the only thing left in the header row
              // itself — one line, truncated, no stacked sub-blocks. Everything
              // that used to stack underneath it has a home elsewhere instead of
              // being deleted outright:
              //   - dbEntry type badge  -> dropped (decorative; program mode is
              //     already implied by the rest of the card).
              //   - Heart like/unlike   -> moved into the kebab menu below.
              //   - Program/Original targets -> fully duplicated by the vitals
              //     row's Target cell (see the `vitals` useMemo above, which
              //     already computes this exact primary/sub pair) — dropped here,
              //     not lost.
              //   - Last performance (weight x reps) -> already shown live on
              //     every set row via the Prev column and the +N up-delta badge;
              //     only the session DATE had no other home and is the one
              //     genuinely dropped field (minor — last-session recency, not a
              //     number the athlete logs against).
              // A page-level sticky name/meta/Finish row is Step 5 (this header
              // stays a plain in-card title until then).
              <CardTitle className="text-[17px] font-extrabold text-ink truncate">{exercise.name}</CardTitle>
            )}
          </div>
          <div className="flex items-center gap-1">
            {dragHandleProps && reorderMode && (
              <button
                type="button"
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
                aria-label="Drag to reorder exercise"
                className="h-11 w-11 -my-1 flex items-center justify-center text-ink-faint hover:text-ink touch-manipulation cursor-grab active:cursor-grabbing"
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
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
            {openMenu && createPortal(
              <div
                ref={menuContentRef}
                style={menuStyle}
                className="fixed glass-elevated rounded-xl overflow-y-auto max-h-[min(60vh,320px)] overscroll-contain py-1 z-[10200] min-w-[160px] text-ink"
              >
                {/* Like/Unlike moved here from the header row (Ledger rebuild) —
                    it steers future programming, same behavior as before. */}
                {onToggleLike && (
                  <button
                    onClick={() => {
                      onToggleLike();
                      setOpenMenu(false);
                    }}
                    aria-pressed={liked}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                  >
                    <Heart className={`w-4 h-4 ${liked ? "fill-brand text-brand" : ""}`} />
                    {liked ? "Unlike this exercise" : "Like — program this more often"}
                  </button>
                )}
                {/* Reorder toggle (Ledger rebuild): drag handles are hidden by
                    default on every row (focused card + compact .nx rows) —
                    they added visual weight (empty-looking grip icons) most
                    sessions never touch. Chosen here, WorkoutDetail flips
                    dragHandleProps on for every ExerciseCard until toggled off
                    again (or the athlete taps away — WorkoutDetail owns that). */}
                {onToggleReorderMode && (
                  <button
                    onClick={() => {
                      onToggleReorderMode();
                      setOpenMenu(false);
                    }}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                  >
                    <GripVertical className="w-4 h-4" />
                    {reorderMode ? "Done reordering" : "Reorder exercises"}
                  </button>
                )}
                {/* Replace exercise leads the destructive/utility part of the menu:
                    a mid-session equipment swap (Casper day, machine taken) is a
                    routine workaround the athlete reaches for far more than
                    notes/cues, per the overnight audit's UX pass (wishes.json).
                    Destructive Remove stays anchored last regardless. */}
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
        {/* Advisory nudge, between-set coaching chip, and shot-list note all moved
            below the set table (Ledger rebuild, vertical-space budget): they're
            occasional/contextual, not always-there chrome, so they no longer sit
            between the header and the table pushing it toward the fold. The
            set-progress segment strip that used to live here is dropped outright
            — it duplicated the "N/M sets" count already in the page meta line
            above the logger. */}

        {/* Per-exercise vitals (DESIGN.md dB .vit4): Target / Volume vs last /
            Best set. Only rendered cells with real data; the row itself is
            skipped entirely when there's nothing to show. */}
        {vitals && (
          <div
            className="grid gap-2.5 border-t border-charcoal-border pt-2.5 mb-3 font-technical"
            style={{ gridTemplateColumns: `repeat(${[vitals.target, vitals.volume, vitals.best].filter(Boolean).length}, 1fr)` }}
          >
            {vitals.target && (
              <div className="border-l border-charcoal-border first:border-l-0 pl-2.5 first:pl-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted">Target</div>
                <div className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">{vitals.target.primary}</div>
                {vitals.target.sub && <div className="text-[11px] text-ink-muted mt-0.5">{vitals.target.sub}</div>}
              </div>
            )}
            {vitals.volume && (
              <div className="border-l border-charcoal-border first:border-l-0 pl-2.5 first:pl-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted">Volume</div>
                <div className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">
                  {vitals.volume.current.toLocaleString()}<span className="text-[11px] text-ink-muted font-semibold ml-0.5">{weightUnit}</span>
                </div>
                <div className="text-[11px] mt-0.5">
                  {vitals.volume.deltaPct != null ? (
                    <span className={vitals.volume.deltaPct > 0 ? 'text-leaf font-bold' : 'text-ink-muted'}>
                      {vitals.volume.deltaPct > 0 ? '+' : ''}{vitals.volume.deltaPct}%
                    </span>
                  ) : (
                    <span className="text-ink-muted">–</span>
                  )}
                  <span className="text-ink-muted"> vs last</span>
                </div>
              </div>
            )}
            {vitals.best && (
              <div className="border-l border-charcoal-border first:border-l-0 pl-2.5 first:pl-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted">Best set</div>
                <div className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">
                  {vitals.best.weight}×{vitals.best.reps}
                </div>
                {vitals.best.e1rm != null && (
                  <div className="text-[11px] text-ink-muted mt-0.5">{vitals.best.e1rm} e1RM</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Column header */}
        <div className={`${gridCols} gap-1 sm:gap-1.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted`}>
          <span className="pl-0.5">Set</span>
          <span>Prev</span>
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
          <span className="text-center">e1RM</span>
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
                  ? 'bg-charcoal-surface2 rounded-xl -mx-2 px-2'
                  : setIndex === 0 ? '' : 'border-t-[0.5px] border-t-charcoal-border'
              } ${!set.completed && !isActive ? 'text-ink-faint' : ''}`}
            >
              <span className={`font-technical text-[13px] font-extrabold pl-0.5 ${
                set.set_type === 'daily_min' ? 'text-info' : isActive ? 'text-ink' : !set.completed ? '' : 'text-ink-muted'
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
                className="font-technical text-[11px] font-semibold text-ink-faint whitespace-nowrap pr-1 text-left tabular-nums disabled:cursor-default enabled:active:text-brand min-h-[44px] -my-3.5 inline-flex items-center"
              >
                {lastPerformance?.lastWeight
                  ? `${lastPerformance.lastWeight}×${lastPerformance.lastReps}`
                  : '—'}
              </button>
              <div className="relative min-w-0">
                <input
                  type="number" inputMode="decimal"
                  aria-label={`Set ${set.set_number} weight in ${weightUnit}`}
                  // `?? ""`, not `|| ""`: a logged 0 is a real load (every
                  // bodyweight movement) and `||` blanked the field out from
                  // under him. And an empty field means empty, not zero — with
                  // `|| 0` the box refilled itself with "0" the instant it was
                  // cleared, so a mistyped weight could not be deleted, only
                  // typed over, and the RIR input three rows down had the
                  // null-on-empty handling this one was missing.
                  value={set.weight ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    let next = raw === "" ? null : parseFloat(raw);
                    // The max="2000" attribute below is decorative on a controlled
                    // number input (never enforced outside <form> validation), so
                    // enforce the cap here for real (r1-01): a fat-fingered extra
                    // digit becomes the e1RM / PR / progression baseline downstream.
                    if (Number.isFinite(next) && next > 2000) next = 2000;
                    onUpdateSet(exerciseIndex, setIndex, 'weight', Number.isFinite(next) ? next : null);
                  }}
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
                  // A fat-fingered extra digit (2255 for 225) is indistinguishable
                  // from a real lift downstream: it becomes the e1RM, the PR, and
                  // the progression baseline. 2000 is far above anything human and
                  // still catches the common slip. Enforced for real in onChange above.
                  max="2000"
                  step="2.5"
                  className={setCell(isActive, !set.completed && !isActive)}
                />
                {/* Ledger "+5" up-delta (DESIGN.md .up, gain-green): a completed set
                    that beats the last logged weight for this exercise. Absolutely
                    positioned + pointer-events-none so it never shrinks the input's
                    44px hit area or intercepts the tap. */}
                {set.completed && lastPerformance?.lastWeight != null && Number(set.weight) > Number(lastPerformance.lastWeight) && (
                  <span className="pointer-events-none absolute -top-1 -right-0.5 font-technical text-[9px] font-bold text-leaf bg-[var(--color-bg)] px-0.5 rounded">
                    +{Math.round(Number(set.weight) - Number(lastPerformance.lastWeight))}
                  </span>
                )}
              </div>
              <input
                type="number" inputMode="numeric"
                aria-label={isHold ? `Set ${set.set_number} hold seconds` : `Set ${set.set_number} reps`}
                value={(isHold ? set.duration_s : set.reps) ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = raw === "" ? null : parseInt(raw, 10);
                  onUpdateSet(
                    exerciseIndex,
                    setIndex,
                    isHold ? 'duration_s' : 'reps',
                    Number.isFinite(next) ? next : null
                  );
                }}
                onFocus={handleInputFocus}
                placeholder={isHold ? "30" : (lastPerformance?.lastReps ? String(lastPerformance.lastReps) : "0")}
                min="0"
                // Holds are seconds, reps are reps, so the ceiling differs: an
                // hour-long plank and a 500-rep set are both absurd, and either
                // number wrecks the volume totals it feeds.
                max={isHold ? "3600" : "500"}
                className={setCell(isActive, !set.completed && !isActive)}
              />
              {showRIR && (
                <input
                  type="number" inputMode="decimal"
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
                  className={setCell(isActive, !set.completed && !isActive)}
                />
              )}
              {/* e1RM (Epley, ≤12 reps, completed sets only — matches
                  exerciseStats.isE1rmEligibleSet exactly, no second rule). */}
              <span className={`font-technical text-[13px] text-center tabular-nums ${
                !set.completed && !isActive ? 'text-ink-faint' : 'text-ink-muted'
              }`}>
                {!isHold && isE1rmEligibleSet(set)
                  ? Math.round(estimateOneRepMax(set.weight, set.reps))
                  : '–'}
              </span>
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
                    ? 'bg-leaf/[0.16] text-leaf'
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

        {/* Advisory nudge (program mode) */}
        {nudgeMessage && (
          <div className="mt-3 px-3 py-2.5 rounded-xl glass-inset flex items-start gap-2.5">
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
          <div className="mt-3 px-3 py-2.5 rounded-xl glass-inset flex items-center gap-2.5 rise-in">
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
          <div className="mt-3 px-3 py-2.5 rounded-xl glass-inset flex items-start gap-2.5">
            <i className="w-[26px] h-[26px] rounded-[9px] bg-brand/[0.16] text-brand flex items-center justify-center flex-shrink-0 not-italic">
              <Camera className="w-3.5 h-3.5" />
            </i>
            <span className="text-xs font-semibold text-ink-muted leading-relaxed pt-1">{shotNote}</span>
          </div>
        )}

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
