// Exercise replacement logic
// Finds similar exercises based on movement patterns

import { EXERCISE_DB } from "@/ml/exerciseDB";

/**
 * Find a replacement exercise for a disliked exercise
 * @param {string} dislikedExerciseName - Name of the exercise to replace
 * @param {Array<string>} likedExercises - List of liked exercise names
 * @param {Array<string>} dislikedExercises - List of disliked exercise names
 * @param {Array<string>} availableEquipment - User's available equipment
 * @returns {Object|null} Replacement exercise or null
 */
export function findReplacementExercise(
  dislikedExerciseName,
  likedExercises = [],
  dislikedExercises = [],
  availableEquipment = []
) {
  // Find the disliked exercise
  const dislikedExercise = EXERCISE_DB.find(ex => ex.name === dislikedExerciseName);
  
  if (!dislikedExercise) {
    console.warn(`Exercise not found: ${dislikedExerciseName}`);
    return null;
  }

  const dislikedPattern = dislikedExercise.pattern;

  // Filter exercises by same pattern
  let candidates = EXERCISE_DB.filter(ex => 
    ex.pattern === dislikedPattern && 
    ex.name !== dislikedExerciseName &&
    !dislikedExercises.includes(ex.name)
  );

  // If user has equipment restrictions, filter by equipment
  if (availableEquipment.length > 0 && !availableEquipment.includes('full_gym')) {
    candidates = candidates.filter(ex => {
      const equipmentArray = Array.isArray(ex.equipment) ? ex.equipment : [ex.equipment];
      const normalizedEquipment = equipmentArray.map(e => String(e).toLowerCase());
      
      // Allow bodyweight exercises
      if (normalizedEquipment.some(e => e.includes('bodyweight') || e === 'none')) {
        return true;
      }
      
      // Check if user has the required equipment
      const normalizedUserEquipment = availableEquipment.map(e => String(e).toLowerCase());
      return normalizedEquipment.some(eq => 
        normalizedUserEquipment.includes(eq) || 
        normalizedUserEquipment.some(ueq => eq.includes(ueq))
      );
    });
  }

  if (candidates.length === 0) {
    console.warn(`No replacement found for: ${dislikedExerciseName}`);
    return null;
  }

  // Priority 1: Return a liked exercise with same pattern
  const likedCandidate = candidates.find(ex => likedExercises.includes(ex.name));
  if (likedCandidate) {
    return likedCandidate;
  }

  // Priority 2: Return a random exercise from same pattern
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

/**
 * Replace all disliked exercises in a workout
 * @param {Array<Object>} exercises - Workout exercises
 * @param {Array<string>} likedExercises - Liked exercise names
 * @param {Array<string>} dislikedExercises - Disliked exercise names
 * @param {Array<string>} availableEquipment - User's equipment
 * @returns {Array<Object>} Updated exercises
 */
export function replaceDislikedExercises(
  exercises,
  likedExercises = [],
  dislikedExercises = [],
  availableEquipment = []
) {
  return exercises.map(exercise => {
    if (dislikedExercises.includes(exercise.name)) {
      const replacement = findReplacementExercise(
        exercise.name,
        likedExercises,
        dislikedExercises,
        availableEquipment
      );

      if (replacement) {
        return {
          ...exercise,
          name: replacement.name,
          pattern: replacement.pattern,
          // Keep original sets/reps/rest
        };
      }
    }
    return exercise;
  });
}

/**
 * Check if an exercise should be replaced
 * @param {string} exerciseName - Exercise name
 * @param {Array<string>} dislikedExercises - Disliked exercise names
 * @returns {boolean}
 */
export function shouldReplaceExercise(exerciseName, dislikedExercises = []) {
  return dislikedExercises.includes(exerciseName);
}
