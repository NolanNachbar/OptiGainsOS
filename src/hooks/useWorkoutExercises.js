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
    addExercise,
  };
}
