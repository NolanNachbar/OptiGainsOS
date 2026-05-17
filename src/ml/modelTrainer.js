// src/ml/modelTrainer.js
//
// ============================================================================
// MODEL TRAINER
// ============================================================================
//
// Orchestrates the full training pipeline:
//   1. Load user profiles from Supabase
//   2. Load real reactions from Supabase
//   3. Generate synthetic training data from profiles
//   4. Combine synthetic + real (real weighted 3x)
//   5. Train Random Forest classifier
//   6. Save trained model to localStorage
//
// Call trainIfNeeded() on app startup -- it checks if a trained model
// already exists and only retrains if necessary.
//
// ============================================================================

import { loadUserProfiles, generateSyntheticData, convertRealReactions } from './syntheticData.js';
import { trainModel, saveModel, loadModel, hasTrainedModel, getModelMeta } from './rfModel.js';
import { EXERCISE_DB } from './exerciseDB.js';

// ---------------------------------------------------------------------------
// LOAD REAL DATA FROM SUPABASE
// ---------------------------------------------------------------------------

async function loadRealReactions(supabase) {
  const { data, error } = await supabase
    .from('exercise_reactions')
    .select('created_by, exercise_name, reaction');

  if (error) {
    console.warn('[Trainer] Could not load real reactions:', error.message);
    return [];
  }

  // Filter out workout-level reactions (workout:uuid format)
  const exerciseOnly = (data || []).filter(
    r => r.exercise_name && !r.exercise_name.startsWith('workout:')
  );

  console.log(`[Trainer] Loaded ${exerciseOnly.length} real exercise reactions`);
  return exerciseOnly;
}

// ---------------------------------------------------------------------------
// MAIN TRAINING PIPELINE
// ---------------------------------------------------------------------------

/**
 * Run the full training pipeline.
 *
 * @param {object} supabase - Supabase client instance
 * @returns {object} training result summary
 */
export async function trainModel_full(supabase) {
  console.log('[Trainer] Starting training pipeline...');
  const startTime = Date.now();

  // Step 1 -- Load real user profiles from Supabase
  console.log('[Trainer] Step 1/5: Loading user profiles from Supabase...');
  let userProfiles = [];
  try {
    userProfiles = await loadUserProfiles(supabase);
    console.log(`[Trainer] Loaded ${userProfiles.length} user profiles`);
  } catch (err) {
    console.error('[Trainer] Failed to load profiles:', err);
    // Fall back to a basic default profile so we can still train
    userProfiles = [
      { userId: 'default_beginner',     goal: 'general_fitness', level: 'beginner',     equipment: ['none'],     daysPerWeek: 3 },
      { userId: 'default_intermediate', goal: 'muscle_gain',     level: 'intermediate', equipment: ['dumbbells'], daysPerWeek: 4 },
      { userId: 'default_advanced',     goal: 'muscle_gain',     level: 'advanced',     equipment: ['full_gym'], daysPerWeek: 5 },
      { userId: 'default_weightloss',   goal: 'weight_loss',     level: 'beginner',     equipment: ['none'],     daysPerWeek: 3 },
      { userId: 'default_endurance',    goal: 'endurance',       level: 'intermediate', equipment: ['none'],     daysPerWeek: 5 },
    ];
    console.log('[Trainer] Using default profiles as fallback');
  }

  if (userProfiles.length === 0) {
    throw new Error('No user profiles found -- cannot generate training data');
  }

  // Step 2 -- Load real reactions from Supabase
  console.log('[Trainer] Step 2/5: Loading real reactions from Supabase...');
  const realReactions = await loadRealReactions(supabase);

  // Step 3 -- Generate synthetic training data
  console.log('[Trainer] Step 3/5: Generating synthetic training data...');
  const syntheticExamples = generateSyntheticData(userProfiles, EXERCISE_DB);

  // Step 4 -- Convert real reactions to training examples (weighted 3x)
  console.log('[Trainer] Step 4/5: Converting real reactions (3x weight)...');
  const realExamples = convertRealReactions(realReactions, userProfiles, EXERCISE_DB);

  // Combine synthetic + real
  const allExamples = [...syntheticExamples, ...realExamples];
  console.log(`[Trainer] Total training examples: ${allExamples.length}`);
  console.log(`[Trainer]   Synthetic: ${syntheticExamples.length}`);
  console.log(`[Trainer]   Real (3x): ${realExamples.length} (from ${realReactions.length} reactions)`);

  // Safety check -- if we have no examples, bail out gracefully
  if (allExamples.length < 10) {
    throw new Error(
      `Insufficient training data: ${allExamples.length} examples. ` +
      `Need at least 10. Check that user_profiles table has data in Supabase.`
    );
  }

  // Step 5 -- Train the Random Forest
  // Use setTimeout(0) to yield to the browser event loop before training
  // so the UI stays responsive. Training still blocks for a few seconds
  // but the app will have fully rendered before it starts.
  console.log('[Trainer] Step 5/5: Training Random Forest classifier...');
  await new Promise(resolve => setTimeout(resolve, 100));
  const { model, meta } = trainModel(allExamples);

  // Patch in the raw reaction count before saving so the staleness check can compare apples-to-apples
  meta.reactionCount = realReactions.length;
  saveModel(model, meta);

  const totalTime = Date.now() - startTime;
  console.log(`[Trainer] Training complete in ${totalTime}ms`);

  return {
    success: true,
    model,
    meta,
    summary: {
      userProfiles:       userProfiles.length,
      realReactions:      realReactions.length,
      syntheticExamples:  syntheticExamples.length,
      totalExamples:      allExamples.length,
      trainingAccuracy:   `${(meta.trainingAccuracy * 100).toFixed(1)}%`,
      trainTimeMs:        totalTime,
      savedToStorage:     true,
    }
  };
}

/**
 * Check if a model exists and is fresh. If not, train a new one.
 * Call this once on app startup.
 *
 * @param {object} supabase - Supabase client instance
 * @param {boolean} forceRetrain - force retraining even if model exists
 * @returns {{ model, meta, fromCache: boolean }}
 */
export async function trainIfNeeded(supabase, forceRetrain = false) {
  // Try loading existing model first
  if (!forceRetrain) {
    const cached = loadModel();
    if (cached) {
      console.log('[Trainer] Using cached model from localStorage');
      return { ...cached, fromCache: true };
    }
  }

  // No valid cached model -- train a new one
  console.log('[Trainer] No valid cached model found -- training now...');
  const result = await trainModel_full(supabase);
  return { model: result.model, meta: result.meta, fromCache: false };
}

/**
 * Get a summary of the current model status without loading the full model.
 * Useful for displaying in an admin/debug UI.
 */
export function getTrainingStatus() {
  const meta = getModelMeta();
  if (!meta) {
    return {
      trained:    false,
      message:    'No trained model found. Call trainIfNeeded() to train.',
    };
  }

  const trainedAt = new Date(meta.trainedAt);
  const ageHours  = Math.round((Date.now() - trainedAt.getTime()) / (1000 * 60 * 60));

  return {
    trained:          true,
    trainedAt:        meta.trainedAt,
    ageHours,
    exampleCount:     meta.exampleCount,
    syntheticCount:   meta.syntheticCount,
    realCount:        meta.realCount,
    trainingAccuracy: `${(meta.trainingAccuracy * 100).toFixed(1)}%`,
    featureCount:     meta.featureCount,
    message:          `Model trained ${ageHours}h ago on ${meta.exampleCount} examples (${(meta.trainingAccuracy * 100).toFixed(1)}% accuracy)`,
  };
}
