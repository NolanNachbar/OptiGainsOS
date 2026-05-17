// src/ml/mlRecommender.js
//
// ============================================================================
// ML RECOMMENDER -- THE API YOUR APP ACTUALLY CALLS
// ============================================================================
//
// This is the single file you import everywhere in your app.
// It handles model lifecycle (training, caching, fallback) automatically.
//
// USAGE IN YOUR COMPONENTS:
//
//   // In App.jsx or a top-level component -- initialize once on startup
//   import { initializeML } from '@/ml/mlRecommender';
//   await initializeML(supabase);
//
//   // In ExerciseReactionButtons.jsx -- replace replaceExercise()
//   import { getExerciseReplacements } from '@/ml/mlRecommender';
//   const alts = await getExerciseReplacements({ dislikedName, userProfile, dayFocus });
//
//   // In Dashboard.jsx -- replace generateWorkoutPlan()
//   import { generatePersonalizedWorkout } from '@/ml/mlRecommender';
//   const plan = await generatePersonalizedWorkout({ userProfile, daysPerWeek, split });
//
// ============================================================================

import { trainIfNeeded }             from './modelTrainer.js';
import { rankExercisesForUser }      from './rfModel.js';
import { encodeFeatures }            from './syntheticData.js';
import { generateWorkoutPlan, replaceExercise } from './workoutModel.js';
import { getTemplatePreferences, getPrimaryTemplate } from './fitnessTemplates.js';
import { EXERCISE_DB }               from './exerciseDB.js';

// ---------------------------------------------------------------------------
// MODULE STATE
// Internal model reference -- initialized once, reused everywhere
// ---------------------------------------------------------------------------

let _model   = null;
let _meta    = null;
let _ready   = false;
let _supabase = null;

// ---------------------------------------------------------------------------
// INITIALIZATION -- call once on app startup
// ---------------------------------------------------------------------------

/**
 * Initialize the ML system. Call this once when your app loads.
 * Loads a cached model from localStorage or trains a new one.
 *
 * Recommended: call from App.jsx in a useEffect on mount.
 *
 * Example:
 *   useEffect(() => {
 *     initializeML(supabase).then(status => {
 *       console.log('ML ready:', status);
 *     });
 *   }, []);
 *
 * @param {object} supabase - your Supabase client
 * @param {boolean} forceRetrain - force retraining even if model cached
 */
export async function initializeML(supabase, forceRetrain = false) {
  _supabase = supabase;

  try {
    console.log('[ML] Initializing recommendation engine...');
    const result = await trainIfNeeded(supabase, forceRetrain);
    _model = result.model;
    _meta  = result.meta;
    _ready = true;

    console.log('[ML] Ready.', result.fromCache ? '(from cache)' : '(freshly trained)');
    console.log(`[ML] Training accuracy: ${(_meta.trainingAccuracy * 100).toFixed(1)}%`);

    return {
      ready:      true,
      fromCache:  result.fromCache,
      accuracy:   _meta.trainingAccuracy,
      examples:   _meta.exampleCount,
      realData:   _meta.realCount,
    };
  } catch (err) {
    console.error('[ML] Initialization failed, falling back to rule-based:', err);
    _ready = false;
    return { ready: false, error: err.message };
  }
}

/**
 * Check if the ML model is ready to use.
 */
export function isMLReady() {
  return _ready && _model !== null;
}

// ---------------------------------------------------------------------------
// EXERCISE REPLACEMENT -- replaces replaceExercise() from workoutModel.js
// ---------------------------------------------------------------------------

/**
 * Find replacement exercises for a disliked exercise.
 * Uses ML model if available, falls back to rule-based scorer.
 *
 * Returns the same { easier, same, harder } shape as replaceExercise()
 * so it is a drop-in replacement with no other changes needed.
 *
 * @param {object} params
 * @param {string} params.dislikedName            - exercise the user disliked
 * @param {object} params.userProfile             - { goal, level, equipment, ... }
 * @param {string} params.dayFocus                - 'Push' | 'Pull' | 'Legs' etc
 * @param {Array}  params.currentWeekExerciseNames - already-used exercises (avoid)
 * @param {string} params.goal                    - user goal string
 * @param {string} params.level                   - user fitness level
 * @param {Array}  params.equipment               - user equipment
 */
export function getExerciseReplacements({
  dislikedName,
  userProfile,
  dayFocus,
  currentWeekExerciseNames = [],
  // Legacy params for backwards compatibility with existing call sites
  goal,
  level,
  equipment,
}) {
  // Build normalized profile from either userProfile object or legacy params
  const profile = userProfile || { goal, level, equipment: equipment || [] };

  if (!isMLReady()) {
    // ML not initialized -- use rule-based fallback
    console.log('[ML] Not ready, using rule-based replacement');
    return replaceExercise({
      dislikedName,
      currentWeekExerciseNames,
      goal: profile.goal,
      level: profile.level,
      equipment: profile.equipment,
      dayFocus,
    });
  }

  const avoid = new Set([...(currentWeekExerciseNames || []), dislikedName]);

  // Get disliked exercise for difficulty comparison
  const disliked = EXERCISE_DB.find(ex =>
    ex.name.toLowerCase() === dislikedName.toLowerCase()
  );
  const dislikedDiff = disliked?.difficulty ?? 2;

  // Score all exercises for this user using the trained model
  const ranked = rankExercisesForUser(_model, profile, EXERCISE_DB, encodeFeatures);

  // Get template preference boosts for this user
  let templatePrefs = {};
  try {
    templatePrefs = getTemplatePreferences(profile, EXERCISE_DB);
  } catch { /* optional */ }

  // Apply template boosts to ML scores
  const rankedWithTemplate = ranked.map(item => ({
    ...item,
    probability: Math.min(0.99, item.probability + (templatePrefs[item.exercise.name] || 0) * 0.15),
  })).sort((a, b) => b.probability - a.probability);

  // Build muscle overlap sets from the disliked exercise
  const dislikedPrimary   = new Set((disliked?.primaryMuscle || []).map(m => m.toLowerCase()));
  const dislikedSecondary = new Set((disliked?.secondaryMuscle || []).map(m => m.toLowerCase()));
  const dislikedPattern   = disliked?.pattern?.toLowerCase() || '';

  function muscleOverlap(exercise) {
    const exPrimary = (exercise.primaryMuscle || []).map(m => m.toLowerCase());
    const exAll = [...exPrimary, ...(exercise.secondaryMuscle || []).map(m => m.toLowerCase())];
    // Count how many muscles overlap with disliked exercise
    const primaryMatches = exPrimary.filter(m => dislikedPrimary.has(m)).length;
    const anyMatches = exAll.filter(m => dislikedPrimary.has(m) || dislikedSecondary.has(m)).length;
    const patternMatch = exercise.pattern?.toLowerCase() === dislikedPattern ? 2 : 0;
    return primaryMatches * 3 + anyMatches + patternMatch;
  }

  // Filter to valid candidates -- must have some muscle overlap with disliked exercise
  // This ensures ML picks within the same muscle group, not random exercises
  const allCandidates = rankedWithTemplate.filter(({ exercise }) =>
    !avoid.has(exercise.name) &&
    exercise.name !== dislikedName &&
    _fitsEquipment(exercise, profile.equipment || [])
  );

  // Prefer muscle-matching candidates, fall back to all if not enough
  const muscleMatched = allCandidates.filter(c => muscleOverlap(c.exercise) > 0);
  const candidates = muscleMatched.length >= 3 ? muscleMatched : allCandidates;

  if (candidates.length === 0) {
    // No valid candidates -- fall back to rule-based
    return replaceExercise({
      dislikedName,
      currentWeekExerciseNames,
      goal: profile.goal,
      level: profile.level,
      equipment: profile.equipment,
      dayFocus,
    });
  }

  // Tier by difficulty
  const easier   = candidates.find(c => c.exercise.difficulty < dislikedDiff);
  const same     = candidates.find(c => c.exercise.difficulty === dislikedDiff);
  const harder   = candidates.find(c => c.exercise.difficulty > dislikedDiff);

  // Fallbacks if a tier is empty
  const easierFinal = easier ?? candidates[0];
  const sameFinal   = same   ?? candidates[1] ?? candidates[0];
  const harderFinal = harder ?? candidates[2] ?? candidates[0];

  function buildResult(candidate) {
    if (!candidate) return null;
    const ex = candidate.exercise;
    return {
      name:           ex.name,
      pattern:        ex.pattern,
      primaryMuscle:  ex.primaryMuscle || [],
      difficulty:     ex.difficulty,
      type:           ex.type,
      equipment:      ex.equipment || [],
      sets:           3,
      reps:           _getReps(ex, profile.goal),
      rest:           _getRest(ex, profile.goal),
      mlScore:        candidate.probability,
    };
  }

  return {
    easier: buildResult(easierFinal),
    same:   buildResult(sameFinal),
    harder: buildResult(harderFinal),
  };
}

// ---------------------------------------------------------------------------
// WORKOUT GENERATION -- replaces generateWorkoutPlan() from workoutModel.js
// ---------------------------------------------------------------------------

/**
 * Generate a personalized weekly workout plan using the ML model.
 * Uses ML model if available, falls back to rule-based generator.
 *
 * Returns the same plan shape as generateWorkoutPlan() -- drop-in replacement.
 *
 * @param {object} params
 * @param {object} params.userProfile  - full user profile object
 * @param {number} params.daysPerWeek  - how many days per week
 * @param {Array}  params.split        - ['Push','Pull','Legs',...] day focuses
 * @param {number} params.weekNumber   - which week (affects phase/progression)
 */
export function generatePersonalizedWorkout({
  userProfile,
  daysPerWeek,
  split,
  weekNumber = 1,
}) {
  if (!isMLReady()) {
    console.log('[ML] Not ready, using rule-based workout generation');
    return generateWorkoutPlan({
      daysPerWeek:  daysPerWeek || userProfile?.daysPerWeek || 3,
      goal:         userProfile?.goal,
      level:        userProfile?.level,
      equipment:    userProfile?.equipment || [],
      duration:     userProfile?.duration  || '45 min',
    }, weekNumber);
  }

  // Score all exercises for this user
  const ranked = rankExercisesForUser(_model, userProfile, EXERCISE_DB, encodeFeatures);

  const usedNames = new Set();
  const weekPlan  = [];

  const activeSplit = split || _getDefaultSplit(daysPerWeek || 3, userProfile?.goal);
  const exercisesPerDay = _getExercisesPerDay(userProfile?.duration);

  for (const dayFocus of activeSplit) {
    const dayPatterns   = _getPatternsForFocus(dayFocus);
    const dayExercises  = [];

    // For each movement pattern slot in this day, pick the highest-scoring
    // exercise from the ML-ranked list that fits
    for (const pattern of dayPatterns) {
      if (dayExercises.length >= exercisesPerDay) break;

      const match = ranked.find(({ exercise }) =>
        exercise.pattern === pattern &&
        !usedNames.has(exercise.name) &&
        _fitsEquipment(exercise, userProfile?.equipment || []) &&
        _fitsLevel(exercise, userProfile?.level)
      );

      if (match) {
        usedNames.add(match.exercise.name);
        dayExercises.push({
          name:          match.exercise.name,
          sets:          _getSets(match.exercise, userProfile?.goal),
          reps:          _getReps(match.exercise, userProfile?.goal),
          rest:          _getRest(match.exercise, userProfile?.goal),
          pattern:       match.exercise.pattern,
          primaryMuscle: match.exercise.primaryMuscle || [],
          difficulty:    match.exercise.difficulty,
          mlScore:       match.probability,
        });
      }
    }

    // Fill remaining slots with highest-scoring valid exercises for this focus
    while (dayExercises.length < exercisesPerDay) {
      const fill = ranked.find(({ exercise }) =>
        !usedNames.has(exercise.name) &&
        _fitsEquipment(exercise, userProfile?.equipment || []) &&
        _fitsLevel(exercise, userProfile?.level) &&
        (dayPatterns.length === 0 || dayPatterns.includes(exercise.pattern))
      );
      if (!fill) break;
      usedNames.add(fill.exercise.name);
      dayExercises.push({
        name:          fill.exercise.name,
        sets:          _getSets(fill.exercise, userProfile?.goal),
        reps:          _getReps(fill.exercise, userProfile?.goal),
        rest:          _getRest(fill.exercise, userProfile?.goal),
        pattern:       fill.exercise.pattern,
        primaryMuscle: fill.exercise.primaryMuscle || [],
        difficulty:    fill.exercise.difficulty,
        mlScore:       fill.probability,
      });
    }

    weekPlan.push({
      focus:     dayFocus,
      exercises: dayExercises,
      duration:  `${exercisesPerDay * 8} min`,
    });
  }

  return {
    week:    weekPlan,
    model:   'random_forest',
    accuracy: _meta?.trainingAccuracy,
  };
}

// ---------------------------------------------------------------------------
// MODEL INFO -- useful for debug/admin UI
// ---------------------------------------------------------------------------

/**
 * Get current model status and metadata.
 * Display this in a settings or debug screen to show the model is working.
 */
export function getMLInfo() {
  if (!_ready || !_meta) {
    return { ready: false, message: 'ML model not initialized' };
  }
  return {
    ready:            true,
    algorithm:        'Random Forest Classifier',
    trainingAccuracy: `${(_meta.trainingAccuracy * 100).toFixed(1)}%`,
    totalExamples:    _meta.exampleCount,
    syntheticExamples: _meta.syntheticCount,
    realExamples:     Math.round(_meta.realCount / 3), // divide by 3 (weight)
    trainedAt:        _meta.trainedAt,
    featureCount:     _meta.featureCount,
    trees:            _meta.config?.nEstimators,
    message:          'Random Forest active -- generating personalized recommendations',
  };
}

/**
 * Force retrain the model. Call this when new reactions are added.
 */
export async function retrainModel() {
  if (!_supabase) {
    throw new Error('ML not initialized -- call initializeML first');
  }
  return initializeML(_supabase, true);
}

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

function _fitsEquipment(exercise, userEquipment) {
  const userEquip = new Set((userEquipment || []).map(e => String(e).toLowerCase()));
  if (userEquip.has('full_gym')) return true;
  userEquip.add('bodyweight');
  const exEquip = exercise.equipment || ['bodyweight'];
  return exEquip.some(eq => userEquip.has(eq.toLowerCase()));
}

function _fitsLevel(exercise, level) {
  const d = exercise.difficulty ?? 2;
  if (level === 'beginner')     return d <= 1;
  if (level === 'intermediate') return d <= 2;
  return true;
}

function _getSets(exercise, goal) {
  const g = Array.isArray(goal) ? goal[0] : goal;
  if (g === 'muscle_gain') return exercise.type === 'Compound' ? 4 : 3;
  if (g === 'endurance')   return 3;
  return 3;
}

function _getReps(exercise, goal) {
  const g = Array.isArray(goal) ? goal[0] : goal;
  const isCompound = exercise.type === 'Compound';
  if (g === 'muscle_gain')     return isCompound ? '6-8'  : '10-12';
  if (g === 'weight_loss')     return '12-15';
  if (g === 'endurance')       return '15-20';
  if (g === 'flexibility')     return '10-15';
  return '8-12';
}

function _getRest(exercise, goal) {
  const g = Array.isArray(goal) ? goal[0] : goal;
  const isCompound = exercise.type === 'Compound';
  if (g === 'muscle_gain') return isCompound ? 120 : 90;
  if (g === 'weight_loss') return 45;
  if (g === 'endurance')   return 30;
  return 60;
}

function _getExercisesPerDay(duration) {
  if (!duration) return 5;
  const mins = parseInt(duration);
  if (mins >= 60) return 7;
  if (mins >= 45) return 6;
  if (mins >= 30) return 5;
  return 4;
}

function _getDefaultSplit(days, goal) {
  const g = Array.isArray(goal) ? goal[0] : (goal || 'general_fitness');
  const splits = {
    3: { muscle_gain: ['Upper','Lower','Full Body'], default: ['Full Body','Full Body','Full Body'] },
    4: { muscle_gain: ['Upper','Lower','Upper','Lower'], default: ['Upper','Lower','Upper','Lower'] },
    5: { muscle_gain: ['Push','Pull','Legs','Push','Pull'], default: ['Push','Pull','Legs','Full Body','Full Body'] },
  };
  const key = g === 'muscle_gain' ? 'muscle_gain' : 'default';
  return (splits[days] || splits[3])[key] || Array(days).fill('Full Body');
}

function _getPatternsForFocus(focus) {
  const map = {
    'Push':       ['Horizontal Push','Incline Press','Vertical Push','Decline Press'],
    'Pull':       ['Vertical Pull','Horizontal Pull','Elevation'],
    'Legs':       ['Squat','Hinge','Lunge','Bridge','Step','Plantar Flexion'],
    'Upper':      ['Horizontal Push','Vertical Push','Vertical Pull','Horizontal Pull','Elevation'],
    'Lower':      ['Squat','Hinge','Lunge','Bridge','Step'],
    'Full Body':  ['Squat','Hinge','Horizontal Push','Horizontal Pull','Vertical Push','Lunge'],
  };
  return map[focus] || [];
}
