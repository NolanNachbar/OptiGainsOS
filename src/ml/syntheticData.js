// src/ml/syntheticData.js
//
// ============================================================================
// SYNTHETIC TRAINING DATA GENERATOR
// ============================================================================
//
// Generates realistic like/dislike training examples from real user profiles.
// Each example = { features: [...], label: 1 (like) or 0 (dislike) }
//
// Used to bootstrap the Random Forest model when real interaction data
// is insufficient. Combines with real reactions (weighted 3x) for training.
//
// ============================================================================

import { EXERCISE_DB } from './exerciseDB.js';
import { getTemplatePreferences } from './fitnessTemplates.js';

// ---------------------------------------------------------------------------
// FEATURE ENCODING
// Converts a user profile + exercise pair into a numeric feature vector.
// Random Forest only works with numbers -- everything must be encoded.
// ---------------------------------------------------------------------------

const GOALS = ['muscle_gain', 'weight_loss', 'endurance', 'general_fitness', 'flexibility'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const PATTERNS = ['Squat','Hinge','Horizontal Push','Incline Press','Decline Press',
                  'Vertical Push','Vertical Pull','Horizontal Pull','Lunge','Bridge',
                  'Core','Cardio','Elevation','Step','Plantar Flexion','Olympic',
                  'Mobility','Abduction','Anti-Extension','Anti-Rotation','Dynamic',
                  'Plyometric','Conditioning','Carry','Rotation','Flexion','Extension'];
const MUSCLES = ['Chest','Back','Shoulders','Arms','Legs','Core','Glutes',
                 'Quads','Hamstrings','Calves','Abs'];
const EX_TYPES = ['Compound','Isolation','Cardio','Machine'];
const EQUIPMENT_TYPES = ['none','dumbbells','barbells','resistance_bands',
                         'pull_up_bar','bench','full_gym','bodyweight',
                         'cable','machine','kettlebell'];

export function encodeFeatures(userProfile, exercise) {
  const features = [];

  // --- USER GOAL (one-hot encoded) ---
  // One-hot means one slot per possible value, only one is 1 at a time
  // e.g. muscle_gain = [1,0,0,0,0], weight_loss = [0,1,0,0,0]
  const goalArr = Array.isArray(userProfile.goal)
    ? userProfile.goal.map(g => normalizeGoalKey(g))
    : [normalizeGoalKey(userProfile.goal)];
  GOALS.forEach(g => features.push(goalArr.includes(g) ? 1 : 0));

  // --- USER FITNESS LEVEL (one-hot) ---
  LEVELS.forEach(l => features.push(l === userProfile.level ? 1 : 0));

  // --- USER LEVEL AS NUMERIC (1=beginner, 2=intermediate, 3=advanced) ---
  features.push(LEVELS.indexOf(userProfile.level) + 1);

  // --- USER EQUIPMENT (binary flags per equipment type) ---
  const userEquip = expandUserEquipment(userProfile.equipment || []);
  EQUIPMENT_TYPES.forEach(eq => features.push(userEquip.has(eq) ? 1 : 0));

  // --- USER DAYS PER WEEK (normalized 0-1) ---
  features.push((userProfile.daysPerWeek || 3) / 7);

  // --- EXERCISE DIFFICULTY (normalized 0-1) ---
  const diff = Number(exercise.difficulty || 2);
  features.push(diff / 3);

  // --- DIFFICULTY MATCH SCORE ---
  // How well does this exercise difficulty match the user's level?
  // Perfect match = 1.0, one tier off = 0.5, two tiers off = 0.0
  const userLevelNum = LEVELS.indexOf(userProfile.level) + 1;
  const diffMatch = 1 - Math.abs(userLevelNum - diff) / 2;
  features.push(Math.max(0, diffMatch));

  // --- EXERCISE TYPE (one-hot) ---
  EX_TYPES.forEach(t => features.push(t === exercise.type ? 1 : 0));

  // --- EXERCISE PATTERN (one-hot) ---
  PATTERNS.forEach(p => features.push(p === exercise.pattern ? 1 : 0));

  // --- PRIMARY MUSCLE (one-hot, multi-label) ---
  const primaryMuscles = exercise.primaryMuscle || [];
  MUSCLES.forEach(m => features.push(primaryMuscles.includes(m) ? 1 : 0));

  // --- EQUIPMENT COMPATIBILITY ---
  // Does the user have the equipment this exercise needs?
  const exEquip = exercise.equipment || ['bodyweight'];
  const compatible = exEquip.some(eq => userEquip.has(eq));
  features.push(compatible ? 1 : 0);

  // --- EQUIPMENT OVERLAP SCORE ---
  // Fraction of exercise equipment options the user has (0.0 to 1.0)
  const overlapCount = exEquip.filter(eq => userEquip.has(eq)).length;
  features.push(exEquip.length > 0 ? overlapCount / exEquip.length : 0);

  // --- GOAL TAG MATCH ---
  // Does this exercise explicitly list this user's goal in its goalTags?
  const exGoalTags = (exercise.goalTags || []).map(t => normalizeGoalKey(t));
  const goalMatch = goalArr.some(g => exGoalTags.includes(g)) ? 1 : 0;
  features.push(goalMatch);

  // --- GOAL TAG MATCH SCORE (fraction of user goals matched) ---
  const matchedGoals = goalArr.filter(g => exGoalTags.includes(g)).length;
  features.push(goalArr.length > 0 ? matchedGoals / goalArr.length : 0);

  // --- IS CARDIO ---
  features.push(exercise.isCardio ? 1 : 0);

  // --- CARDIO GOAL ALIGNMENT ---
  // Cardio exercises are better for weight_loss and endurance
  const wantsCardio = goalArr.some(g => g === 'weight_loss' || g === 'endurance');
  features.push(exercise.isCardio && wantsCardio ? 1 : 0);

  // --- COMPOUND GOAL ALIGNMENT ---
  // Compound exercises are better for muscle_gain and general_fitness
  const wantsCompound = goalArr.some(g => g === 'muscle_gain' || g === 'general_fitness');
  features.push(exercise.type === 'Compound' && wantsCompound ? 1 : 0);

  return features;
}

export function getFeatureCount() {
  // Must match exactly what encodeFeatures() returns
  return (
    GOALS.length +         // 5  goal one-hot
    LEVELS.length +        // 3  level one-hot
    1 +                    // 1  level numeric
    EQUIPMENT_TYPES.length + // 11 equipment flags
    1 +                    // 1  days per week
    1 +                    // 1  exercise difficulty
    1 +                    // 1  difficulty match
    EX_TYPES.length +      // 4  exercise type one-hot
    PATTERNS.length +      // 15 pattern one-hot
    MUSCLES.length +       // 11 muscle one-hot
    1 +                    // 1  equipment compatible
    1 +                    // 1  equipment overlap score
    1 +                    // 1  goal tag match
    1 +                    // 1  goal tag score
    1 +                    // 1  is cardio
    1 +                    // 1  cardio goal alignment
    1                      // 1  compound goal alignment
  ); // Total: 61 features
}

// ---------------------------------------------------------------------------
// LIKE PROBABILITY CALCULATOR
// Computes how likely a given user is to like a given exercise.
// Based on domain knowledge -- this is our synthetic label generator.
// ---------------------------------------------------------------------------

export function computeLikeProbability(userProfile, exercise) {
  let score = 0.5; // start neutral

  const goals = Array.isArray(userProfile.goal)
    ? userProfile.goal.map(g => normalizeGoalKey(g))
    : [normalizeGoalKey(userProfile.goal)];
  const level = userProfile.level || 'intermediate';
  const userEquip = expandUserEquipment(userProfile.equipment || []);
  const diff = Number(exercise.difficulty || 2);
  const levelNum = LEVELS.indexOf(level) + 1;
  const exEquip = exercise.equipment || ['bodyweight'];
  const goalTags = (exercise.goalTags || []).map(t => normalizeGoalKey(t));

  // HARD BLOCK: user doesn't have required equipment
  // If they literally cannot do this exercise, probability is very low
  const canDo = exEquip.some(eq => userEquip.has(eq));
  if (!canDo) return 0.03 + Math.random() * 0.05;

  // DIFFICULTY MATCH
  // Perfect match = big boost, too hard/easy = penalty
  const diffGap = Math.abs(levelNum - diff);
  if (diffGap === 0) score += 0.20;      // perfect difficulty match
  else if (diffGap === 1) score += 0.05; // one tier off -- still okay
  else score -= 0.25;                    // two tiers off -- probably wrong level

  // GOAL TAG MATCH
  // Exercise explicitly designed for this user's goal
  const goalMatches = goals.filter(g => goalTags.includes(g)).length;
  score += goalMatches * 0.15;

  // GOAL-SPECIFIC BONUSES
  if (goals.includes('muscle_gain')) {
    if (exercise.type === 'Compound') score += 0.20;
    if (exercise.type === 'Isolation') score += 0.08;
    if (['Squat','Hinge','Horizontal Push','Vertical Pull','Horizontal Pull'].includes(exercise.pattern)) score += 0.10;
  }

  if (goals.includes('weight_loss')) {
    if (exercise.isCardio) score += 0.25;
    if (exercise.type === 'Compound') score += 0.15;
    if (['Squat','Lunge','Hinge'].includes(exercise.pattern)) score += 0.08;
    if (diff === 1) score += 0.05; // beginners doing weight loss like accessible exercises
  }

  if (goals.includes('endurance')) {
    if (exercise.isCardio) score += 0.30;
    const hasBodyweight = exEquip.includes('bodyweight');
    if (hasBodyweight) score += 0.12;
    if (diff <= 2) score += 0.08;
  }

  if (goals.includes('general_fitness')) {
    if (exercise.type === 'Compound') score += 0.12;
    score += 0.05; // general fitness users are more flexible in what they like
  }

  if (goals.includes('flexibility')) {
    if (exercise.pattern && exercise.pattern.toLowerCase().includes('stretch')) score += 0.30;
    if (exercise.isCardio) score += 0.10;
    if (diff === 1) score += 0.15;
  }

  // LEVEL-SPECIFIC ADJUSTMENTS
  if (level === 'beginner') {
    if (diff === 1) score += 0.15;  // beginners like accessible exercises
    if (diff === 3) score -= 0.35;  // beginners strongly dislike advanced exercises
    if (exercise.type === 'Compound' && diff >= 3) score -= 0.20;
  }
  if (level === 'intermediate') {
    if (diff === 2) score += 0.10;
    if (diff === 1) score -= 0.05;  // intermediates find beginner exercises too easy
  }
  if (level === 'advanced') {
    if (diff === 3) score += 0.20;  // advanced users like challenging exercises
    if (diff === 1) score -= 0.20;  // advanced users dislike exercises that are too easy
  }

  // EQUIPMENT QUALITY BONUS
  // Having the ideal equipment for an exercise increases likelihood of liking it
  const equipOverlap = exEquip.filter(eq => userEquip.has(eq)).length;
  score += (equipOverlap / Math.max(exEquip.length, 1)) * 0.10;

  // TEMPLATE PREFERENCE BOOST
  // Check if this exercise is preferred or avoided by the user's fitness template
  // This adds profile-archetype knowledge on top of goal/equipment rules
  try {
    const templatePrefs = getTemplatePreferences(userProfile, EXERCISE_DB);
    const templateMod = templatePrefs[exercise.name] || 0;
    score += templateMod * 0.20; // templates contribute up to ±20% to score
  } catch {
    // template preferences are optional -- ignore errors
  }

  // CLAMP to valid probability range
  score = Math.max(0.02, Math.min(0.97, score));

  // ADD REALISTIC NOISE
  const noise = (Math.random() - 0.5) * 0.18;
  score = Math.max(0.02, Math.min(0.97, score + noise));

  return score;
}

// ---------------------------------------------------------------------------
// SYNTHETIC DATASET GENERATOR
// ---------------------------------------------------------------------------

/**
 * Generate synthetic training examples for all user profiles.
 *
 * For each user x exercise pair:
 *   1. Compute like probability from domain knowledge
 *   2. Convert probability to binary label (like=1, dislike=0)
 *   3. Encode features as numeric vector
 *   4. Store as training example
 *
 * Returns array of { features, label } objects ready for Random Forest.
 */
export function generateSyntheticData(userProfiles, exerciseDB = EXERCISE_DB) {
  const examples = [];

  // HARD CAP: max 20 exercises per user, max 25 users total.
  // 25 users x 20 exercises = 500 examples maximum.
  // This trains in under 1 second with 10 trees -- no browser freeze.
  // Increased from 20 to 35 exercises per user to handle template complexity.
  // 35 users x 35 exercises = ~1225 synthetic examples -- trains in ~500ms.
  const MAX_USERS = 40;
  const MAX_PER_USER = 45;

  const limitedProfiles = userProfiles.slice(0, MAX_USERS);

  for (const profile of limitedProfiles) {
    // Shuffle and take a small sample -- spread across difficulties
    const shuffled = [...exerciseDB].sort(() => Math.random() - 0.5);
    const sampled = shuffled.slice(0, MAX_PER_USER);

    for (const exercise of sampled) {
      const probability = computeLikeProbability(profile, exercise);
      const label = Math.random() < probability ? 1 : 0;
      const features = encodeFeatures(profile, exercise);
      examples.push({
        features,
        label,
        userId: profile.userId,
        exerciseName: exercise.name,
        probability,
        source: 'synthetic',
        weight: 1.0,
      });
    }
  }

  console.log(`[Synthetic] Generated ${examples.length} training examples`);
  console.log(`[Synthetic] Positive (like): ${examples.filter(e => e.label === 1).length}`);
  console.log(`[Synthetic] Negative (dislike): ${examples.filter(e => e.label === 0).length}`);

  return examples;
}

/**
 * Convert real Supabase reactions into training examples.
 * Real reactions are weighted 3x over synthetic -- they are ground truth.
 */
export function convertRealReactions(reactions, userProfiles, exerciseDB = EXERCISE_DB) {
  const profileMap = {};
  userProfiles.forEach(p => { profileMap[p.userId] = p; });

  const examples = [];

  for (const reaction of reactions) {
    // Skip workout-level reactions (exercise_name starts with 'workout:')
    if (reaction.exercise_name?.startsWith('workout:')) continue;

    const profile = profileMap[reaction.created_by];
    if (!profile) continue;

    const exercise = exerciseDB.find(ex => ex.name === reaction.exercise_name);
    if (!exercise) continue;

    const label = reaction.reaction === 'like' ? 1 : 0;
    const features = encodeFeatures(profile, exercise);

    // Add the real reaction 3 times to give it 3x weight vs synthetic
    for (let i = 0; i < 3; i++) {
      examples.push({
        features,
        label,
        userId: reaction.created_by,
        exerciseName: reaction.exercise_name,
        source: 'real',
        weight: 3.0,
      });
    }
  }

  console.log(`[Real] Converted ${reactions.length} real reactions (weighted 3x)`);
  return examples;
}

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

function normalizeGoalKey(goal) {
  if (!goal) return 'general_fitness';
  const g = String(goal).toLowerCase().trim();
  const map = {
    'weight loss': 'weight_loss',
    'muscle gain': 'muscle_gain',
    'build endurance': 'endurance',
    'improve flexibility': 'flexibility',
    'general fitness': 'general_fitness',
  };
  return map[g] || g;
}

function expandUserEquipment(equipment) {
  const set = new Set(equipment.map(e => String(e).toLowerCase()));
  // full_gym includes everything
  if (set.has('full_gym')) {
    ['dumbbells','barbells','cable','machine','bench','pull_up_bar',
     'resistance_bands','kettlebell','bodyweight'].forEach(e => set.add(e));
  }
  // barbells include bench for pressing
  if (set.has('barbells')) set.add('bench');
  // everyone can do bodyweight
  set.add('bodyweight');
  return set;
}

// ---------------------------------------------------------------------------
// LOAD USER PROFILES FROM SUPABASE
// ---------------------------------------------------------------------------

/**
 * Fetch all user profiles from Supabase.
 * Returns normalized profile objects ready for feature encoding and
 * synthetic data generation.
 */
export async function loadUserProfiles(supabase) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('created_by, primary_goal, fitness_level, available_equipment, days_per_week, workout_duration_preference');

  if (error) throw error;

  return (data || []).map(profile => ({
    userId:      profile.created_by,
    goal:        profile.primary_goal || 'general_fitness',
    level:       profile.fitness_level || 'intermediate',
    equipment:   profile.available_equipment || [],
    daysPerWeek: profile.days_per_week || 3,
    duration:    profile.workout_duration_preference || '45 min',
  }));
}
