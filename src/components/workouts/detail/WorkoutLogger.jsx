import { Fragment } from "react";
import { isExerciseLiked } from "@/hooks/useUserQueries";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Target, ChevronDown } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/workouts/SortableExerciseRow";
import ExerciseCard from "@/components/workouts/ExerciseCard";
import AddExerciseForm from "@/components/workouts/AddExerciseForm";
import { getLastExercisePerformance, getExerciseE1rmHistory } from "@/utils/exerciseStats";
import { buildLoadWhy } from "@/utils/loadRationale";

// Extracted from WorkoutDetail.jsx (no behavior change).
export default function WorkoutLogger({ CardioSessions, addExercise, addSet, allExerciseNames, allHistoryExerciseNames, allWorkoutLogs, chipsRow, dragSensors, effectiveFocusIndex, engineByName, exerciseLogs, handleExerciseDragEnd, handleRemoveExercise, handleRemoveSet, handleReplaceExercise, handleUpdateSet, isProgramSource, muscleToggleRow, preWorkoutNotes, profile, programWorkout, progressionTargetsMap, reorderMode, setFocusedExerciseIndex, setPreWorkoutNotes, setReorderMode, setShowCancelConfirm, shotNoteFor, showShotList, startRestTimer, toggleLike, updateExerciseName, updateExerciseNotes, weightUnit, workout }) {
  return (
    <>
          <div className="space-y-6">
            {/* Zero-exercise fallback: with no exercises there's no focused
                card, so its kebab (the only other place "Cancel workout"
                lives after Phase A removed the header's own kebab) never
                renders. Keep Cancel reachable here instead. */}
            {exerciseLogs.length === 0 && (
              <div className="glass px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-ink-muted">No exercises in this workout yet.</p>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-xs font-bold text-bad flex-shrink-0"
                >
                  Cancel workout
                </button>
              </div>
            )}

            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleExerciseDragEnd}>
              <SortableContext
                items={exerciseLogs.map((_, i) => String(i))}
                strategy={verticalListSortingStrategy}
              >
                {exerciseLogs.map((exerciseLog, exerciseIndex) => {
                  // "Next" / "last time" module header (mockup .mod/.mh):
                  // printed once, directly above the first UPCOMING compact
                  // row (the exercise right after the focused one) — not
                  // above already-done compact rows before it, which read as
                  // history rather than "next".
                  const showNextHeader = exerciseIndex === effectiveFocusIndex + 1;
                  const lastPerformance = getLastExercisePerformance(allWorkoutLogs, exerciseLog.name);
                  // e1RM sparkline data — computed ONLY for the focused
                  // exercise (fetch/compute scoped to what's on screen, per
                  // the coordinator's e1RM module requirement), reusing the
                  // exact same history function Lifts.jsx uses.
                  const e1rmHistory = exerciseIndex === effectiveFocusIndex
                    ? getExerciseE1rmHistory(allWorkoutLogs, exerciseLog.name)
                    : null;
                  const programEx = isProgramSource ? programWorkout?.exercises?.find(ex => ex.name === exerciseLog.name) || null : null;
                  const targets = programEx ? progressionTargetsMap[programEx.name] : null;
                  // Match the template entry BY NAME, like programEx above. This was
                  // `workout.exercises[exerciseIndex]` — a positional lookup into an
                  // array that removeExercise never filters. Delete exercise 2 and
                  // exercise 3 slides into index 2 while the template at index 2 is
                  // still the deleted one, so the dead exercise's notes AND its
                  // target sets x reps (ExerciseCard renders both from this prop)
                  // reappear on the exercise below it.
                  const originalEx = workout?.exercises?.find(e => e.name === exerciseLog.name) || null;
                  return (
                    <Fragment key={exerciseIndex}>
                    {showNextHeader && (
                      <div className="flex items-baseline justify-between px-1 pt-3 pb-1 mt-1 border-t border-charcoal-border">
                        <span className="text-caption font-bold uppercase tracking-[0.04em] text-ink-muted">Next</span>
                        <span className="text-caption font-bold uppercase tracking-[0.04em] text-ink-muted">last time</span>
                      </div>
                    )}
                    <SortableExerciseRow
                      id={String(exerciseIndex)}
                      exerciseIndex={exerciseIndex}
                      // Scroll the card (and the active set row it contains) clear of
                      // the floating Cancel/Finish bar when focus/scrollIntoView lands
                      // here, matching the bar's measured footprint.
                      className="scroll-mb-[calc(var(--logging-bar-clearance,132px)+16px)] lg:scroll-mb-0"
                    >
                      {(dragHandleProps) => (
                        <ExerciseCard
                          exercise={exerciseLog}
                          exerciseIndex={exerciseIndex}
                          weightUnit={weightUnit}
                          onUpdateSet={handleUpdateSet}
                          onAddSet={addSet}
                          onRemoveSet={handleRemoveSet}
                          onRemoveExercise={handleRemoveExercise}
                          onUpdateNotes={updateExerciseNotes}
                          onUpdateName={updateExerciseName}
                          originalExercise={originalEx}
                          lastPerformance={lastPerformance}
                          loadWhy={isProgramSource ? buildLoadWhy(engineByName.get(exerciseLog.name), exerciseLog.sets, weightUnit) : null}
                          programExercise={programEx}
                          progressionTargets={targets}
                          onReplaceExercise={handleReplaceExercise}
                          dayFocus={workout.focus || "Full Body"}
                          goal={profile?.primary_goal || "general_fitness"}
                          fitnessLevel={profile?.fitness_level || "intermediate"}
                          equipment={profile?.available_equipment || []}
                          currentWeekExerciseNames={allExerciseNames}
                          allExerciseNames={allHistoryExerciseNames}
                          onStartRestTimer={startRestTimer}
                          showRIR={profile?.show_rir ?? true}
                          liked={isExerciseLiked(profile, exerciseLog.name)}
                          onToggleLike={() => toggleLike.mutate({ profile, exerciseName: exerciseLog.name })}
                          dragHandleProps={dragHandleProps}
                          showShotList={showShotList}
                          shotNote={shotNoteFor(exerciseLog.name)}
                          isFocused={exerciseIndex === effectiveFocusIndex}
                          onFocus={() => setFocusedExerciseIndex(exerciseIndex)}
                          onOpenCalculators={
                            exerciseIndex === effectiveFocusIndex
                              ? () => window.dispatchEvent(new Event("open-calculators"))
                              : null
                          }
                          onRequestCancelWorkout={
                            exerciseIndex === effectiveFocusIndex
                              ? () => setShowCancelConfirm(true)
                              : null
                          }
                          reorderMode={reorderMode}
                          onToggleReorderMode={() => setReorderMode((v) => !v)}
                          isLastRow={
                            exerciseIndex === exerciseLogs.length - 1
                            || exerciseIndex + 1 === effectiveFocusIndex
                          }
                          e1rmHistory={e1rmHistory}
                        />
                      )}
                    </SortableExerciseRow>
                    </Fragment>
                  );
                })}
              </SortableContext>
            </DndContext>

            {/* Cardio sessions (program mode only — separate from lift, not logged as sets) */}
            {isProgramSource && <CardioSessions programWorkout={programWorkout} />}

            {/* Add Exercise Form */}
            <AddExerciseForm onAdd={addExercise} exerciseNames={allHistoryExerciseNames} />

            {/* Session details — the chips, hero metrics, muscle-view toggle,
                and Pre-workout Notes that live in the full session Card when
                not logging. Collapsed by default (never auto-opens, unlike
                the old standalone Pre-workout Notes disclosure) and pinned
                below the logger so the focused exercise stays at the top of
                the page. Pre-workout Notes still writes the same
                preWorkoutNotes state either way. */}
            <details className="glass-inset group mt-2">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden min-h-[44px]">
                <span className="section-label">Session details</span>
                <ChevronDown className="w-4 h-4 text-ink-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {chipsRow}
                  {muscleToggleRow}
                </div>
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div className="flex items-center gap-2.5">
                    <Target className="w-5 h-5 text-ink-muted" />
                    <div>
                      <div className="section-label">Exercises</div>
                      <div className="hero-metric text-title text-ink">{workout.exercises?.length || 0}</div>
                    </div>
                  </div>
                  {workout.duration_minutes != null && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-ink-faint" />
                      <div>
                        <div className="section-label">Duration</div>
                        <div className="font-technical font-bold text-body text-ink-secondary">{workout.duration_minutes} <span className="text-caption font-semibold text-ink-muted">min</span></div>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="section-label block mb-1.5">Pre-workout Notes</label>
                  <Textarea
                    value={preWorkoutNotes}
                    onChange={(e) => setPreWorkoutNotes(e.target.value)}
                    placeholder="Anything notable going in? Energy, soreness, focus..."
                    className="bg-transparent border border-charcoal-border rounded-control px-3 py-2 min-h-[60px] resize-none text-base"
                  />
                </div>
              </div>
            </details>
          </div>
    </>
  );
}
