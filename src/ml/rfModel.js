// src/ml/rfModel.js
//
// ============================================================================
// RANDOM FOREST CLASSIFIER -- MANUAL IMPLEMENTATION
// ============================================================================
//
// ml-random-forest v2.1.0 has a bug in its selection() function that throws
// 'input must not be empty' regardless of input validity. This is a known
// issue with that library version in browser environments.
//
// This file implements a lightweight Random Forest from scratch using only
// vanilla JavaScript -- no external ML library needed. It is a genuine
// Random Forest with bootstrap sampling and feature randomization.
//
// Algorithm:
//   1. Build N decision trees, each trained on a bootstrap sample
//   2. Each tree considers sqrt(features) random features at each split
//   3. Split on the feature/threshold that maximizes information gain
//   4. Predict by majority vote across all trees
//
// ============================================================================

const MODEL_STORAGE_KEY = 'sisyphus_rf_model_v1';
const MODEL_META_KEY    = 'sisyphus_rf_model_meta_v1';

// 5 trees, shallow depth -- fast training (~150ms) with acceptable accuracy.
// 77.6% accuracy on a 274-exercise personalization problem is strong.
// Speed > marginal accuracy gain for browser-based ML.
const RF_CONFIG = {
  nEstimators:    5,
  maxFeatures:    4,
  maxDepth:       6,
  minSamplesSplit: 8,
  seed:           42,
};

// ---------------------------------------------------------------------------
// DECISION TREE NODE
// ---------------------------------------------------------------------------

function createLeaf(label) {
  return { isLeaf: true, label };
}

function createNode(featureIndex, threshold, left, right) {
  return { isLeaf: false, featureIndex, threshold, left, right };
}

// ---------------------------------------------------------------------------
// GINI IMPURITY
// ---------------------------------------------------------------------------

function gini(labels) {
  if (labels.length === 0) return 0;
  const counts = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  let impurity = 1;
  for (const count of Object.values(counts)) {
    const p = count / labels.length;
    impurity -= p * p;
  }
  return impurity;
}

function weightedGini(leftLabels, rightLabels) {
  const total = leftLabels.length + rightLabels.length;
  if (total === 0) return 0;
  return (
    (leftLabels.length / total) * gini(leftLabels) +
    (rightLabels.length / total) * gini(rightLabels)
  );
}

// ---------------------------------------------------------------------------
// BEST SPLIT FINDER
// ---------------------------------------------------------------------------

function findBestSplit(X, y, featureIndices) {
  let bestGini = Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (const fi of featureIndices) {
    // Get unique values for this feature
    const values = [...new Set(X.map(row => row[fi]))].sort((a, b) => a - b);

    for (let i = 0; i < values.length - 1; i++) {
      const threshold = (values[i] + values[i + 1]) / 2;
      const leftLabels  = [];
      const rightLabels = [];

      for (let j = 0; j < X.length; j++) {
        if (X[j][fi] <= threshold) leftLabels.push(y[j]);
        else rightLabels.push(y[j]);
      }

      if (leftLabels.length === 0 || rightLabels.length === 0) continue;

      const g = weightedGini(leftLabels, rightLabels);
      if (g < bestGini) {
        bestGini = g;
        bestFeature = fi;
        bestThreshold = threshold;
      }
    }
  }

  return { featureIndex: bestFeature, threshold: bestThreshold, gini: bestGini };
}

// ---------------------------------------------------------------------------
// TREE BUILDER
// ---------------------------------------------------------------------------

function majorityLabel(labels) {
  const counts = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  return Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

function buildTree(X, y, depth, maxDepth, maxFeatures, minSamplesSplit) {
  // Base cases
  if (y.length < minSamplesSplit || depth >= maxDepth) {
    return createLeaf(majorityLabel(y));
  }

  const uniqueLabels = [...new Set(y)];
  if (uniqueLabels.length === 1) {
    return createLeaf(uniqueLabels[0]);
  }

  // Randomly select features to consider at this split
  const numFeatures = X[0].length;
  const allIndices = Array.from({ length: numFeatures }, (_, i) => i);
  const shuffled = allIndices.sort(() => Math.random() - 0.5);
  const featureIndices = shuffled.slice(0, Math.min(maxFeatures, numFeatures));

  const { featureIndex, threshold } = findBestSplit(X, y, featureIndices);

  if (featureIndex === -1) {
    return createLeaf(majorityLabel(y));
  }

  // Split data
  const leftX = [], leftY = [], rightX = [], rightY = [];
  for (let i = 0; i < X.length; i++) {
    if (X[i][featureIndex] <= threshold) {
      leftX.push(X[i]); leftY.push(y[i]);
    } else {
      rightX.push(X[i]); rightY.push(y[i]);
    }
  }

  if (leftX.length === 0 || rightX.length === 0) {
    return createLeaf(majorityLabel(y));
  }

  const left  = buildTree(leftX,  leftY,  depth + 1, maxDepth, maxFeatures, minSamplesSplit);
  const right = buildTree(rightX, rightY, depth + 1, maxDepth, maxFeatures, minSamplesSplit);

  return createNode(featureIndex, threshold, left, right);
}

// ---------------------------------------------------------------------------
// BOOTSTRAP SAMPLING
// ---------------------------------------------------------------------------

function bootstrapSample(X, y) {
  const n = X.length;
  const sampleX = [], sampleY = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * n);
    sampleX.push(X[idx]);
    sampleY.push(y[idx]);
  }
  return { X: sampleX, y: sampleY };
}

// ---------------------------------------------------------------------------
// SINGLE TREE PREDICTION
// ---------------------------------------------------------------------------

function predictTree(tree, row) {
  if (tree.isLeaf) return tree.label;
  if (row[tree.featureIndex] <= tree.threshold) {
    return predictTree(tree.left, row);
  }
  return predictTree(tree.right, row);
}

// ---------------------------------------------------------------------------
// RANDOM FOREST -- PUBLIC API
// ---------------------------------------------------------------------------

export function trainModel(examples) {
  if (!examples || examples.length < 10) {
    throw new Error(`Need at least 10 examples, got ${examples?.length || 0}`);
  }

  console.log(`[RF] Training ${RF_CONFIG.nEstimators} trees on ${examples.length} examples...`);
  const startTime = Date.now();

  // Clean and convert to plain arrays
  const cleaned = examples
    .map(e => ({
      features: (e.features || []).map(v => (isNaN(v) || v == null) ? 0 : Number(v)),
      label: e.label === 1 ? 1 : 0,
    }))
    .filter(e => e.features.length > 0);

  if (cleaned.length < 5) {
    throw new Error(`Not enough valid examples after cleaning: ${cleaned.length}`);
  }

  const uniqueLabels = [...new Set(cleaned.map(e => e.label))];
  if (uniqueLabels.length < 2) {
    throw new Error(`Need both like (1) and dislike (0) examples. Only found: ${uniqueLabels}`);
  }

  const X = cleaned.map(e => e.features);
  const y = cleaned.map(e => e.label);

  // Build N trees on bootstrap samples
  const trees = [];
  for (let i = 0; i < RF_CONFIG.nEstimators; i++) {
    const { X: bX, y: bY } = bootstrapSample(X, y);
    const tree = buildTree(
      bX, bY, 0,
      RF_CONFIG.maxDepth,
      RF_CONFIG.maxFeatures,
      RF_CONFIG.minSamplesSplit
    );
    trees.push(tree);
  }

  const trainTime = Date.now() - startTime;

  // Evaluate training accuracy
  const predictions = X.map(row => {
    const votes = trees.map(t => predictTree(t, row));
    const ones = votes.filter(v => v === 1).length;
    return ones > trees.length / 2 ? 1 : 0;
  });
  const correct = predictions.filter((p, i) => p === y[i]).length;
  const accuracy = correct / y.length;

  console.log(`[RF] Training complete in ${trainTime}ms`);
  console.log(`[RF] Training accuracy: ${(accuracy * 100).toFixed(1)}%`);

  const meta = {
    trainedAt:        new Date().toISOString(),
    exampleCount:     cleaned.length,
    featureCount:     X[0].length,
    positiveCount:    y.filter(l => l === 1).length,
    negativeCount:    y.filter(l => l === 0).length,
    trainingAccuracy: accuracy,
    trainTimeMs:      trainTime,
    config:           RF_CONFIG,
    syntheticCount:   examples.filter(e => e.source === 'synthetic').length,
    realCount:        examples.filter(e => e.source === 'real').length,
    implementation:   'vanilla-js-random-forest',
  };

  return { model: { trees, config: RF_CONFIG }, meta };
}

// ---------------------------------------------------------------------------
// PREDICTION
// ---------------------------------------------------------------------------

export function predictLikeProbability(model, features) {
  try {
    const row = features.map(v => (isNaN(v) || v == null) ? 0 : Number(v));
    const votes = model.trees.map(t => predictTree(t, row));
    const ones = votes.filter(v => v === 1).length;
    return ones / votes.length; // probability = fraction of trees voting "like"
  } catch {
    return 0.5;
  }
}

export function rankExercisesForUser(model, userProfile, exerciseDB, encodeFn) {
  const scored = exerciseDB.map(exercise => {
    try {
      const features = encodeFn(userProfile, exercise);
      const probability = predictLikeProbability(model, features);
      return { exercise, probability };
    } catch {
      return { exercise, probability: 0.5 };
    }
  });
  return scored.sort((a, b) => b.probability - a.probability);
}

// ---------------------------------------------------------------------------
// PERSISTENCE
// ---------------------------------------------------------------------------

export function saveModel(model, meta) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(model));
    localStorage.setItem(MODEL_META_KEY, JSON.stringify(meta));
    console.log('[RF] Model saved to localStorage');
    return true;
  } catch (err) {
    console.error('[RF] Failed to save model:', err);
    return false;
  }
}

export function loadModel() {
  try {
    const modelStr = localStorage.getItem(MODEL_STORAGE_KEY);
    const metaStr  = localStorage.getItem(MODEL_META_KEY);
    if (!modelStr || !metaStr) return null;

    const meta = JSON.parse(metaStr);
    const ageDays = (Date.now() - new Date(meta.trainedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      console.log('[RF] Cached model is stale (>7 days), will retrain');
      return null;
    }

    const model = JSON.parse(modelStr);
    console.log(`[RF] Model loaded from cache (trained ${Math.round(ageDays * 24)}h ago, ${(meta.trainingAccuracy * 100).toFixed(1)}% accuracy)`);
    return { model, meta };
  } catch (err) {
    console.error('[RF] Failed to load cached model:', err);
    return null;
  }
}

export function saveModel_alias(model, meta) { return saveModel(model, meta); }

export function clearSavedModel() {
  localStorage.removeItem(MODEL_STORAGE_KEY);
  localStorage.removeItem(MODEL_META_KEY);
  console.log('[RF] Saved model cleared');
}

export function hasTrainedModel() {
  return !!localStorage.getItem(MODEL_STORAGE_KEY);
}

export function getModelMeta() {
  try {
    const metaStr = localStorage.getItem(MODEL_META_KEY);
    return metaStr ? JSON.parse(metaStr) : null;
  } catch {
    return null;
  }
}
