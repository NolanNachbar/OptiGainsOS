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

  // Swap an exercise for a chosen alternative (DB entry or free-text custom),
  // keeping the set count but resetting load/reps so the new movement starts
  // fresh. Mirrors WorkoutDetail.handleReplaceExercise so swap behaves the same
  // in the quick-workout flow (previously the Replace menu item was a dead button
  // here — no handler was wired, so it silently did nothing).
  const replaceExercise = useCallback((oldName, newExercise) => {
    if (!newExercise?.name?.trim()) {
      toast.error("Please pick or enter a replacement exercise");
      return;
    }
    setExercises(prev => prev.map(ex => {
      if (ex.name !== oldName) return ex;
      const repsRaw = String(newExercise.reps ?? newExercise.rep_target ?? ex.sets?.[0]?.reps ?? 10).trim();
      const m = repsRaw.match(/^(\d+)\s*-\s*(\d+)/);
      const newReps = m
        ? Math.round((parseInt(m[1], 10) + parseInt(m[2], 10)) / 2)
        : (parseInt(repsRaw, 10) || ex.sets?.[0]?.reps || 10);
      return {
        ...ex,
        name: newExercise.name.trim(),
        notes: null,
        rest_seconds: newExercise.rest || newExercise.rest_seconds || ex.rest_seconds,
        sets: (ex.sets || []).map((s, i) => ({
          ...s, set_number: i + 1, reps: newReps,
          weight: 0, completed: false, rpe: null, set_type: 'working',
        })),
      };
    }));
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
    addExercise,
  };
}
