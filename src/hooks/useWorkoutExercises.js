import { useState, useCallback } from "react";
import { toast } from "sonner";

export function useWorkoutExercises(initialExercises = []) {
  const [exercises, setExercises] = useState(initialExercises);

  const updateSetData = useCallback((exerciseIndex, setIndex, field, value) => {
    setExercises(prev => {
      const updated = [...prev];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: updated[exerciseIndex].sets.map((set, idx) =>
          idx === setIndex ? { ...set, [field]: value } : set
        ),
      };
      return updated;
    });
  }, []);

  const addSet = useCallback((exerciseIndex, overrides = {}) => {
    setExercises(prev => {
      const updated = [...prev];
      const currentSets = updated[exerciseIndex].sets;
      const lastSet = currentSets[currentSets.length - 1];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: [
          ...currentSets,
          {
            set_number: currentSets.length + 1,
            reps: lastSet?.reps || 0,
            weight: lastSet?.weight || 0,
            completed: false,
            rpe: null,
            set_type: 'working',
            ...overrides,
          },
        ],
      };
      return updated;
    });
  }, []);

  const removeSet = useCallback((exerciseIndex, setIndex) => {
    setExercises(prev => {
      const updated = [...prev];
      const filteredSets = updated[exerciseIndex].sets.filter((_, idx) => idx !== setIndex);
      // Renumber the remaining sets
      const renumberedSets = filteredSets.map((set, idx) => ({
        ...set,
        set_number: idx + 1,
      }));
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: renumberedSets,
      };
      return updated;
    });
  }, []);

  const removeExercise = useCallback((index) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateExerciseNotes = useCallback((index, exerciseNotes) => {
    setExercises(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], notes: exerciseNotes };
      return updated;
    });
  }, []);

  const updateExerciseName = useCallback((index, name) => {
    setExercises(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name };
      return updated;
    });
  }, []);

  // Swap an exercise for a chosen alternative (DB entry or free-text custom).
  // Already-completed sets are CARRIED FORWARD exactly as logged (count + load +
  // reps + rpe) so a mid-exercise swap never discards finished work; only the
  // remaining (uncompleted) sets adopt the replacement's seed load/reps. Mirrors
  // WorkoutDetail.handleReplaceExercise so swap behaves the same in the
  // quick-workout flow (previously the Replace menu item was a dead button here —
  // no handler was wired, so it silently did nothing).
  // seedWeight: the new movement's last-performance load (callers look it up
  // from history and pass it). Previously hardcoded to 0, so every swap blanked
  // the load even when the athlete had logged the replacement before.
  const replaceExercise = useCallback((oldName, newExercise, seedWeight = 0) => {
    if (!newExercise?.name?.trim()) {
      toast.error("Please pick or enter a replacement exercise");
      return;
    }
    const newName = newExercise.name.trim();
    setExercises(prev => prev.map(ex => {
      if (ex.name !== oldName) return ex;
      const repsRaw = String(newExercise.reps ?? newExercise.rep_target ?? ex.sets?.[0]?.reps ?? 10).trim();
      const m = repsRaw.match(/^(\d+)\s*-\s*(\d+)/);
      const newReps = m
        ? Math.round((parseInt(m[1], 10) + parseInt(m[2], 10)) / 2)
        : (parseInt(repsRaw, 10) || ex.sets?.[0]?.reps || 10);
      const completedCount = (ex.sets || []).filter(s => s.completed).length;
      return {
        ...ex,
        name: newName,
        // Record the mid-set swap so the engine's notes_parser can learn
        // equipment/preference substitutions (only when work was already done).
        notes: completedCount > 0
          ? `Swapped ${oldName} → ${newName} after ${completedCount} set${completedCount > 1 ? 's' : ''}`
          : null,
        rest_seconds: newExercise.rest || newExercise.rest_seconds || ex.rest_seconds,
        sets: (ex.sets || []).map((s, i) => s.completed
          ? { ...s, set_number: i + 1 }
          : { ...s, set_number: i + 1, reps: newReps, weight: Number(seedWeight) || 0, completed: false, rpe: null, set_type: 'working' }),
      };
    }));
  }, []);

  // Reorder an exercise within the session (drag-and-drop). Order is just the
  // sequence performed.
  const moveExercise = useCallback((fromIndex, toIndex) => {
    setExercises(prev => {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  // defaultWeight: callers already pass the athlete's last-performance /
  // insight weight; the parameter was silently dropped here, seeding every
  // first set at 0 lb.
  const addExercise = useCallback((exerciseName, defaultWeight = 0) => {
    if (!exerciseName?.trim()) {
      toast.error("Please enter an exercise name");
      return false;
    }

    const exercise = {
      name: exerciseName.trim(),
      exercise_index: exercises.length,
      sets: [{
        set_number: 1,
        reps: 0,
        weight: Number(defaultWeight) || 0,
        completed: false,
      }],
    };

    setExercises(prev => [...prev, exercise]);
    return true;
  }, [exercises.length]);

  return {
    exercises,
    setExercises,
    updateSetData,
    addSet,
    removeSet,
    removeExercise,
    updateExerciseNotes,
    updateExerciseName,
    replaceExercise,
    moveExercise,
    addExercise,
  };
}
