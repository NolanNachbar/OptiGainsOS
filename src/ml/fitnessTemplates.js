// src/ml/fitnessTemplates.js
//
// ============================================================================
// FITNESS PROFILE TEMPLATES
// ============================================================================
//
// These templates define exercise preferences and patterns for specific
// fitness archetypes. The ML model uses these as additional training signal
// on top of the user's own profile and interaction history.
//
// Each template defines:
//   - which exercises this archetype strongly prefers (HIGH_PREFERENCE)
//   - which exercises they typically avoid (LOW_PREFERENCE)
//   - which movement patterns are priority for this profile
//   - which patterns to deprioritize
//
// Templates are matched to users by scoring their profile fields against
// each archetype. A user can partially match multiple templates.
//
// ============================================================================

export const FITNESS_TEMPLATES = [

  // --------------------------------------------------------------------------
  // POWERLIFTER
  // Focuses on the big 3: squat, bench, deadlift. Heavy compound work.
  // --------------------------------------------------------------------------
  {
    id: 'powerlifter',
    name: 'Powerlifter',
    description: 'Heavy compound lifts, low rep strength focus',
    matchConditions: {
      goals: ['muscle_gain'],
      levels: ['intermediate', 'advanced'],
      equipment: ['barbells', 'full_gym'],
      minDaysPerWeek: 3,
    },
    priorityPatterns: ['Squat', 'Hinge', 'Horizontal Push', 'Vertical Pull'],
    deprioritizedPatterns: ['Cardio', 'Conditioning', 'Mobility'],
    highPreferenceExercises: [
      'Back Squat', 'Front Squat', 'Conventional Deadlift', 'Romanian Deadlift',
      'Barbell Bench Press', 'Barbell Row', 'Overhead Press',
      'Sumo Deadlift', 'Trap Bar Deadlift', 'Close Grip Bench Press',
      'Pause Squat', 'Box Squat', 'Deficit Deadlift',
    ],
    lowPreferenceExercises: [
      'Jumping Jacks', 'Burpee', 'Mountain Climber', 'Stationary Bike',
      'Cat-Cow Stretch', 'Downward Dog', 'Pigeon Pose',
    ],
    setRepPreference: { sets: 5, reps: '3-5', rest: 180 },
  },

  // --------------------------------------------------------------------------
  // BODYBUILDER
  // Hypertrophy focus. Volume, isolation work, mind-muscle connection.
  // --------------------------------------------------------------------------
  {
    id: 'bodybuilder',
    name: 'Bodybuilder',
    description: 'High volume, isolation exercises, hypertrophy focus',
    matchConditions: {
      goals: ['muscle_gain'],
      levels: ['beginner', 'intermediate', 'advanced'],
      equipment: ['dumbbells', 'full_gym'],
      minDaysPerWeek: 4,
    },
    priorityPatterns: [
      'Horizontal Push', 'Incline Press', 'Vertical Pull',
      'Horizontal Pull', 'Flexion', 'Extension', 'Elevation',
    ],
    deprioritizedPatterns: ['Cardio', 'Conditioning', 'Plyometric'],
    highPreferenceExercises: [
      'Barbell Bench Press', 'Incline Dumbbell Bench Press', 'Cable Chest Fly',
      'Pec Deck Machine', 'Lat Pulldown', 'Cable Row', 'Dumbbell Row',
      'Hammer Curl', 'Preacher Curl', 'Cable Curl',
      'Skull Crusher', 'Cable Tricep Pushdown', 'Overhead Tricep Extension',
      'Dumbbell Lateral Raise', 'Reverse Fly', 'Arnold Press',
      'Leg Extension', 'Leg Curl', 'Hip Thrust', 'Leg Press',
    ],
    lowPreferenceExercises: [
      'Burpee', 'Battle Ropes', 'Box Jump', 'Jump Squat',
      'Stationary Bike', 'Elliptical', 'Rowing Machine',
    ],
    setRepPreference: { sets: 4, reps: '8-12', rest: 90 },
  },

  // --------------------------------------------------------------------------
  // ATHLETE
  // Sports performance. Power, speed, agility, functional movement.
  // --------------------------------------------------------------------------
  {
    id: 'athlete',
    name: 'Athlete',
    description: 'Power, speed, agility and functional performance',
    matchConditions: {
      goals: ['general_fitness', 'endurance', 'muscle_gain'],
      levels: ['intermediate', 'advanced'],
      equipment: ['full_gym', 'barbells'],
      minDaysPerWeek: 4,
    },
    priorityPatterns: [
      'Olympic Lift', 'Plyometric', 'Dynamic', 'Hinge',
      'Squat', 'Carry', 'Conditioning',
    ],
    deprioritizedPatterns: ['Mobility', 'Isolation'],
    highPreferenceExercises: [
      'Power Clean', 'Hang Clean', 'Push Jerk', 'Snatch',
      'Box Jump', 'Jump Squat', 'Broad Jump',
      'Kettlebell Swing', 'Kettlebell Clean and Press',
      'Farmer Carry', 'Overhead Carry', 'Suitcase Carry',
      'Back Squat', 'Trap Bar Deadlift', 'Bulgarian Split Squat',
      'Battle Ropes', 'Sled Push',
    ],
    lowPreferenceExercises: [
      'Pec Deck Machine', 'Leg Extension', 'Preacher Curl',
      'Tricep Kickback', 'Wrist Curl', 'Donkey Calf Raise',
    ],
    setRepPreference: { sets: 4, reps: '4-6', rest: 120 },
  },

  // --------------------------------------------------------------------------
  // WEIGHT LOSS / HIIT
  // Calorie burn priority. High intensity, compound movements, cardio.
  // --------------------------------------------------------------------------
  {
    id: 'weight_loss',
    name: 'Weight Loss',
    description: 'High calorie burn, circuit training, cardio integration',
    matchConditions: {
      goals: ['weight_loss'],
      levels: ['beginner', 'intermediate', 'advanced'],
      equipment: ['none', 'dumbbells', 'resistance_bands', 'full_gym'],
      minDaysPerWeek: 3,
    },
    priorityPatterns: [
      'Conditioning', 'Dynamic', 'Plyometric', 'Squat',
      'Hinge', 'Lunge',
    ],
    deprioritizedPatterns: ['Flexion', 'Extension', 'Elevation'],
    highPreferenceExercises: [
      'Burpee', 'Mountain Climber', 'Jumping Jacks', 'Jump Squat',
      'Rowing Machine', 'Stationary Bike', 'Stair Climber', 'Elliptical',
      'Battle Ropes', 'Bodyweight Squats', 'Walking Lunge',
      'Kettlebell Swing', 'Box Jump', 'High Knees', 'Jump Rope',
      'Hip Thrust', 'Glute Bridge', 'Single-Leg Calf Raises',
    ],
    lowPreferenceExercises: [
      'Wrist Curl', 'Reverse Wrist Curl', 'Donkey Calf Raise',
      'Pec Deck Machine', 'Leg Extension',
    ],
    setRepPreference: { sets: 3, reps: '12-20', rest: 45 },
  },

  // --------------------------------------------------------------------------
  // BEGINNER / GENERAL FITNESS
  // Accessible, balanced, confidence-building. No intimidating equipment.
  // --------------------------------------------------------------------------
  {
    id: 'beginner',
    name: 'Beginner',
    description: 'Accessible movements, form-focused, balanced routine',
    matchConditions: {
      goals: ['general_fitness', 'weight_loss'],
      levels: ['beginner'],
      equipment: ['none', 'dumbbells', 'resistance_bands'],
      minDaysPerWeek: 2,
    },
    priorityPatterns: [
      'Squat', 'Hinge', 'Horizontal Push',
      'Horizontal Pull', 'Lunge', 'Bridge',
    ],
    deprioritizedPatterns: ['Olympic Lift', 'Plyometric', 'Anti-Rotation'],
    highPreferenceExercises: [
      'Bodyweight Squats', 'Goblet Squat', 'Push-up', 'Wide Push-up',
      'Dumbbell Row', 'Glute Bridge', 'Walking Lunge',
      'Resistance Band Row', 'Resistance Band Squat',
      'Bodyweight Deadlift', 'Bird Dog', 'Dead Bug', 'Plank',
      'Dumbbell Bicep Curl', 'Dumbbell Shoulder Press',
      'Jumping Jacks', 'Step-Up',
    ],
    lowPreferenceExercises: [
      'Power Clean', 'Snatch', 'Front Squat', 'Deficit Deadlift',
      'Skull Crusher', 'Nordic Hamstring Curl', 'Sissy Squat',
    ],
    setRepPreference: { sets: 3, reps: '10-15', rest: 90 },
  },

  // --------------------------------------------------------------------------
  // ENDURANCE / RUNNER
  // Stamina, aerobic capacity, leg strength for sustained effort.
  // --------------------------------------------------------------------------
  {
    id: 'endurance',
    name: 'Endurance Athlete',
    description: 'Aerobic capacity, stamina, functional leg strength',
    matchConditions: {
      goals: ['endurance'],
      levels: ['beginner', 'intermediate', 'advanced'],
      equipment: ['none', 'dumbbells', 'full_gym'],
      minDaysPerWeek: 3,
    },
    priorityPatterns: [
      'Conditioning', 'Lunge', 'Squat', 'Bridge',
      'Step', 'Dynamic',
    ],
    deprioritizedPatterns: ['Olympic Lift', 'Elevation', 'Anti-Rotation'],
    highPreferenceExercises: [
      'Rowing Machine', 'Stationary Bike', 'Elliptical', 'Stair Climber',
      'Walking Lunge', 'Step-Up', 'Single Leg Deadlift',
      'Bodyweight Squats', 'Glute Bridge', 'Hip Thrust',
      'Mountain Climber', 'Jump Rope', 'High Knees',
      'Resistance Band Squat', 'Resistance Band Deadlift',
      'Single-Leg Calf Raises', 'Box Jump',
    ],
    lowPreferenceExercises: [
      'Barbell Shrug', 'Wrist Curl', 'Pec Deck Machine',
      'Skull Crusher', 'Preacher Curl',
    ],
    setRepPreference: { sets: 3, reps: '15-25', rest: 30 },
  },

  // --------------------------------------------------------------------------
  // FLEXIBILITY / MOBILITY
  // Stretch, mobilize, recover. Yoga-adjacent, low impact.
  // --------------------------------------------------------------------------
  {
    id: 'flexibility',
    name: 'Flexibility',
    description: 'Mobility, stretching, range of motion improvement',
    matchConditions: {
      goals: ['flexibility'],
      levels: ['beginner', 'intermediate', 'advanced'],
      equipment: ['none', 'resistance_bands'],
      minDaysPerWeek: 2,
    },
    priorityPatterns: ['Mobility', 'Anti-Extension', 'Rotation'],
    deprioritizedPatterns: ['Olympic Lift', 'Plyometric', 'Carry', 'Elevation'],
    highPreferenceExercises: [
      'Cat-Cow Stretch', 'Downward Dog', 'Pigeon Pose', 'Hip Flexor Stretch',
      'Seated Hamstring Stretch', 'Shoulder Cross Stretch', 'Chest Opener Stretch',
      'Thoracic Rotation', "World's Greatest Stretch", 'Foam Roll Quads',
      'Dead Bug', 'Bird Dog', 'Plank', 'Side Plank',
      'Resistance Band Pull Apart', 'Child Pose',
    ],
    lowPreferenceExercises: [
      'Power Clean', 'Snatch', 'Back Squat', 'Deadlift',
      'Barbell Bench Press', 'Battle Ropes', 'Burpee',
    ],
    setRepPreference: { sets: 2, reps: '10-15', rest: 30 },
  },

  // --------------------------------------------------------------------------
  // HOME GYM / MINIMAL EQUIPMENT
  // No barbell. Dumbbells, bands, bodyweight only.
  // --------------------------------------------------------------------------
  {
    id: 'home_gym',
    name: 'Home Gym',
    description: 'Bodyweight and minimal equipment, no barbell required',
    matchConditions: {
      goals: ['general_fitness', 'weight_loss', 'muscle_gain'],
      levels: ['beginner', 'intermediate'],
      equipment: ['none', 'dumbbells', 'resistance_bands'],
      minDaysPerWeek: 2,
    },
    priorityPatterns: ['Squat', 'Hinge', 'Horizontal Push', 'Lunge', 'Bridge'],
    deprioritizedPatterns: ['Olympic Lift'],
    highPreferenceExercises: [
      'Push-up', 'Wide Push-up', 'Pike Push-up', 'Bodyweight Squats',
      'Walking Lunge', 'Glute Bridge', 'Bird Dog', 'Plank', 'Side Plank',
      'Dumbbell Row', 'Dumbbell Bicep Curl', 'Dumbbell Lateral Raise',
      'Resistance Band Row', 'Resistance Band Squat', 'Resistance Band Bicep Curl',
      'Resistance Band Pull Apart', 'Resistance Band Deadlift',
      'Jumping Jacks', 'Mountain Climber', 'Burpee',
    ],
    lowPreferenceExercises: [
      'Barbell Bench Press', 'Back Squat', 'Conventional Deadlift',
      'Power Clean', 'T-Bar Row', 'Leg Press', 'Lat Pulldown',
      'Pec Deck Machine', 'Leg Extension', 'Leg Curl',
    ],
    setRepPreference: { sets: 3, reps: '10-15', rest: 60 },
  },

  // --------------------------------------------------------------------------
  // SENIOR / LOW IMPACT
  // Joint-friendly, low impact, stability and balance focus.
  // --------------------------------------------------------------------------
  {
    id: 'low_impact',
    name: 'Low Impact',
    description: 'Joint-friendly, stability, balance and functional movement',
    matchConditions: {
      goals: ['general_fitness', 'flexibility'],
      levels: ['beginner'],
      equipment: ['none', 'resistance_bands', 'dumbbells'],
      minDaysPerWeek: 2,
    },
    priorityPatterns: ['Mobility', 'Bridge', 'Squat', 'Anti-Extension'],
    deprioritizedPatterns: ['Olympic Lift', 'Plyometric', 'Dynamic'],
    highPreferenceExercises: [
      'Bodyweight Squats', 'Seated Calf Raise', 'Glute Bridge',
      'Bird Dog', 'Dead Bug', 'Plank', 'Side Plank',
      'Cat-Cow Stretch', 'Hip Flexor Stretch', 'Seated Hamstring Stretch',
      'Resistance Band Row', 'Resistance Band Squat',
      'Dumbbell Shoulder Press', 'Step-Up', 'Stationary Bike', 'Elliptical',
    ],
    lowPreferenceExercises: [
      'Burpee', 'Box Jump', 'Jump Squat', 'Battle Ropes',
      'Power Clean', 'Snatch', 'Nordic Hamstring Curl',
    ],
    setRepPreference: { sets: 2, reps: '12-15', rest: 90 },
  },

];

// ============================================================================
// TEMPLATE MATCHING
// ============================================================================

/**
 * Find which templates best match a user profile.
 * Returns templates sorted by match score descending.
 * A user can match multiple templates partially.
 */
export function matchTemplates(userProfile) {
  const goal = Array.isArray(userProfile.goal)
    ? userProfile.goal
    : [userProfile.goal || 'general_fitness'];
  const level = userProfile.level || 'intermediate';
  const equipment = userProfile.equipment || [];
  const daysPerWeek = userProfile.daysPerWeek || 3;

  const scored = FITNESS_TEMPLATES.map(template => {
    let score = 0;
    const cond = template.matchConditions;

    // Goal match -- how many of user goals match template goals
    const goalMatches = goal.filter(g => cond.goals.includes(g)).length;
    score += goalMatches * 3;

    // Level match
    if (cond.levels.includes(level)) score += 2;

    // Equipment match -- at least one equipment type matches
    const equipMatches = equipment.filter(e => cond.equipment.includes(e)).length;
    if (equipMatches > 0) score += 1;
    if (equipment.includes('full_gym') && cond.equipment.includes('full_gym')) score += 1;
    if (equipment.length === 0 && cond.equipment.includes('none')) score += 2;

    // Days per week match
    if (daysPerWeek >= cond.minDaysPerWeek) score += 1;

    return { template, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Get exercise preference modifier for a user based on matched templates.
 * Returns a map of exerciseName -> modifier (-1.0 to +1.0)
 * +1.0 = strongly preferred by matched templates
 * -1.0 = strongly avoided by matched templates
 */
export function getTemplatePreferences(userProfile, exerciseDB) {
  const matchedTemplates = matchTemplates(userProfile);
  if (matchedTemplates.length === 0) return {};

  const preferences = {};

  // Initialize all exercises to 0
  for (const ex of exerciseDB) {
    preferences[ex.name] = 0;
  }

  for (const { template, score } of matchedTemplates) {
    const weight = score / 10; // normalize score to weight

    // High preference exercises get a positive boost
    for (const exName of template.highPreferenceExercises) {
      if (preferences[exName] !== undefined) {
        preferences[exName] += 0.3 * weight;
      }
    }

    // Low preference exercises get a negative modifier
    for (const exName of template.lowPreferenceExercises) {
      if (preferences[exName] !== undefined) {
        preferences[exName] -= 0.25 * weight;
      }
    }
  }

  // Clamp all values to [-1, 1]
  for (const key of Object.keys(preferences)) {
    preferences[key] = Math.max(-1, Math.min(1, preferences[key]));
  }

  return preferences;
}

/**
 * Get the primary matched template for a user.
 * Used for display purposes and set/rep prescription.
 */
export function getPrimaryTemplate(userProfile) {
  const matched = matchTemplates(userProfile);
  return matched[0]?.template || null;
}
