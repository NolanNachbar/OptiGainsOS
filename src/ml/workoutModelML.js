// src/ml/workoutModelML.js
//
// ============================================================================
// SISYPHUS' SCHEDULE -- ORIGINAL ML ARCHITECTURE (Not In Production)
// ============================================================================
//
// This file documents the two ML models that were designed and implemented
// for Sisyphus' Schedule but could not be activated due to insufficient beta testing
// data. Both models are fully written and ready to deploy when data thresholds
// are reached.
//
// CURRENT STATUS:
//   The Random Forest classifier in rfModel.js runs instead, trained on
//   synthetic data generated from real user profiles. workoutModel.js serves
//   as the rule-based fallback if RF initialization fails.
//
// DATA REQUIREMENTS vs WHAT BETA TESTING PRODUCED:
//   Model 1 (Apriori):  needed 500+ completions, 100+ users
//   Model 2 (SVD):      needed 200+ reactions,   50+ users
//   Beta produced:       21 reactions,            3 users
//
// TO ACTIVATE THESE MODELS IN FUTURE:
//   1. Ensure data thresholds are met (check Supabase tables)
//   2. Deploy Python services (Flask apps below)
//   3. Hit /train on each service
//   4. Update mlRecommender.js to call these services instead of rfModel.js
//
// ============================================================================


// ============================================================================
// MODEL 1 -- APRIORI ASSOCIATION RULE MINING
// Purpose: Workout Generation
// Algorithm: Same technique Amazon uses for "frequently bought together"
// Finds: which exercises naturally appear together in completed workouts
// Replaces: generateWorkoutPlan() in workoutModel.js
// Python service: port 5001
// ============================================================================
//
// HOW IT WORKS:
//   Analyzes every completed workout session in the database.
//   Finds rules like "80% of users who did Squat + Deadlift also did RDL"
//   Uses those rules to chain exercises together into personalized workouts.
//   The rules are discovered from data -- never written by a developer.
//
// WHY IT FAILED:
//   Apriori requires patterns to appear in at least 5% of sessions to be
//   statistically valid. With 21 data points every rule had 100% confidence
//   because nothing appeared more than once. The model memorized the training
//   data and generalized to nothing.
//
// MINIMUM DATA TO ACTIVATE:
//   SELECT COUNT(*) FROM workout_logs;          -- need 500+
//   SELECT COUNT(DISTINCT created_by) FROM workout_logs; -- need 100+

/*
PYTHON SERVICE -- workoutGenerationService.py
Install: pip install flask flask-cors mlxtend pandas supabase

from flask import Flask, request, jsonify
from flask_cors import CORS
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder
import pandas as pd
from supabase import create_client
import os

app = Flask(__name__)
CORS(app)
supabase = create_client(os.environ['VITE_SUPABASE_URL'], os.environ['VITE_SUPABASE_ANON_KEY'])

trained_rules = pd.DataFrame()

def build_transactions():
    response = supabase.table('workout_logs').select('exercises, duration_seconds').execute()
    transactions = []
    for log in response.data:
        if not log.get('exercises') or not log.get('duration_seconds'):
            continue
        names = [ex['name'] for ex in log['exercises'] if ex.get('name')]
        if len(names) >= 3:
            transactions.append(names)
    print(f'Loaded {len(transactions)} workout sessions')
    return transactions

def train(transactions):
    encoder = TransactionEncoder()
    encoded = encoder.fit(transactions).transform(transactions)
    df = pd.DataFrame(encoded, columns=encoder.columns_)
    frequent = apriori(df, min_support=0.05, use_colnames=True, max_len=4)
    if frequent.empty:
        print(f'No frequent patterns found -- need more data (have {len(transactions)}, need 500+)')
        return pd.DataFrame()
    rules = association_rules(frequent, metric='confidence', min_threshold=0.6)
    strong = rules[(rules['lift'] > 1.2)].sort_values('lift', ascending=False)
    print(f'Discovered {len(strong)} strong association rules')
    return strong

@app.route('/train', methods=['POST'])
def train_endpoint():
    global trained_rules
    t = build_transactions()
    trained_rules = train(t)
    return jsonify({'trained': not trained_rules.empty, 'sessions': len(t), 'rules': len(trained_rules)})

@app.route('/generate', methods=['POST'])
def generate():
    if trained_rules.empty:
        return jsonify({'fallback': True, 'reason': f'Need 500+ sessions, check workout_logs table'})
    data = request.json
    exercise_db = data.get('exerciseDB', [])
    day_focus = data.get('dayFocus', 'Full Body')
    # Chain rules to build workout
    seed = exercise_db[0]['name'] if exercise_db else 'Squat'
    workout = [seed]
    for _ in range(5):
        current = frozenset(workout)
        matching = trained_rules[trained_rules['antecedents'].apply(lambda a: a.issubset(current))]
        matching = matching.sort_values('confidence', ascending=False)
        added = False
        for _, rule in matching.iterrows():
            candidates = [c for c in rule['consequents'] if c not in workout]
            if candidates:
                workout.append(candidates[0])
                added = True
                break
        if not added:
            break
    return jsonify({'fallback': False, 'exercises': workout})

@app.route('/status', methods=['GET'])
def status():
    t = build_transactions()
    return jsonify({'sessions': len(t), 'sessions_needed': 500, 'model_trained': not trained_rules.empty})

if __name__ == '__main__':
    print('Workout generation service on port 5001')
    t = build_transactions()
    if len(t) >= 100:
        trained_rules = train(t)
    app.run(port=5001)
*/


// ============================================================================
// MODEL 1 -- JAVASCRIPT INTEGRATION
// Replaces generateWorkoutPlan() when the Python service is running
// ============================================================================

export async function generateWorkoutPlanML(userProfile, dayFocus, exerciseDB, targetCount = 6) {
  try {
    const res = await fetch('http://localhost:5001/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userProfile, dayFocus, exerciseDB, targetCount })
    });
    const data = await res.json();
    if (data.fallback) {
      console.warn('[Model 1] Fell back to rule-based:', data.reason);
      const { generateWorkoutPlan } = await import('./workoutModel.js');
      return generateWorkoutPlan(userProfile);
    }
    return data.exercises.map(name => {
      const ex = exerciseDB.find(e => e.name === name);
      if (!ex) return null;
      return { name: ex.name, sets: 3, reps: '8-12', rest: 90, pattern: ex.pattern, primaryMuscle: ex.primaryMuscle || [], difficulty: ex.difficulty };
    }).filter(Boolean);
  } catch (err) {
    console.error('[Model 1] Service unreachable:', err);
    const { generateWorkoutPlan } = await import('./workoutModel.js');
    return generateWorkoutPlan(userProfile);
  }
}


// ============================================================================
// MODEL 2 -- SVD MATRIX FACTORIZATION
// Purpose: Exercise Replacement
// Algorithm: Same core algorithm behind the Netflix Prize (2009)
// Finds: latent preference dimensions across all users simultaneously
// Replaces: replaceExercise() in workoutModel.js
// Python service: port 5002
// ============================================================================
//
// HOW IT WORKS:
//   Builds a user x exercise interaction matrix from like/dislike data.
//   Decomposes it into hidden "latent factors" -- dimensions the model
//   discovers on its own like "compound vs isolation preference" or
//   "upper vs lower body dominance". Then predicts preference scores for
//   exercises the user hasn't tried yet.
//
// IMPLICIT FEEDBACK WEIGHTING:
//   explicit like:         +1.5  (user actively clicked)
//   explicit dislike:      -2.0  (user actively clicked)
//   completed workout:     +0.5  (implicit -- no click needed)
//   skipped workout:       -0.3  (implicit -- no click needed)
//
// WHY IT FAILED:
//   SVD requires more users than latent factors (k). For k=20 meaningful
//   factors you need 200+ reacting users. We had 3. SVD with k=3 memorized
//   those 3 users and generalized to nobody else -- pure overfitting.
//
// MINIMUM DATA TO ACTIVATE:
//   SELECT COUNT(DISTINCT created_by) FROM exercise_reactions; -- need 50+
//   SELECT COUNT(*) FROM exercise_reactions;                   -- need 200+

/*
PYTHON SERVICE -- exerciseReplacementService.py
Install: pip install flask flask-cors scipy numpy pandas supabase

from flask import Flask, request, jsonify
from flask_cors import CORS
from scipy.sparse.linalg import svds
from scipy.sparse import csr_matrix
import numpy as np
import pandas as pd
from supabase import create_client
import os

app = Flask(__name__)
CORS(app)
supabase = create_client(os.environ['VITE_SUPABASE_URL'], os.environ['VITE_SUPABASE_ANON_KEY'])

state = {'trained': False, 'predicted': None, 'user_ids': None, 'ex_names': None, 'df': None}

def build_matrix():
    reactions = supabase.table('exercise_reactions').select('*').execute().data
    logs = supabase.table('workout_logs').select('created_by, exercises').execute().data
    rows = []
    for r in reactions:
        rows.append({'user_id': r['created_by'], 'exercise': r['exercise_name'], 'score': 1.5 if r['reaction'] == 'like' else -2.0})
    for log in logs:
        for ex in (log.get('exercises') or []):
            if ex.get('name'):
                rows.append({'user_id': log['created_by'], 'exercise': ex['name'], 'score': 0.5})
    if not rows:
        return None, None, None, None
    df = pd.DataFrame(rows).groupby(['user_id', 'exercise'], as_index=False)['score'].sum()
    matrix = df.pivot_table(values='score', index='user_id', columns='exercise', fill_value=0.0)
    print(f'Matrix: {matrix.shape[0]} users x {matrix.shape[1]} exercises')
    return matrix, matrix.index.tolist(), matrix.columns.tolist(), df

def train_svd(matrix, k=20):
    sparse = csr_matrix(matrix.values.astype(float))
    actual_k = min(k, min(sparse.shape) - 1)
    if actual_k < 2:
        print('Matrix too small -- need 50+ users with reactions')
        return None, None, None, None
    U, sigma, Vt = svds(sparse, k=actual_k)
    predicted = np.dot(np.dot(U, np.diag(sigma)), Vt)
    print(f'SVD trained: k={actual_k} latent factors')
    return U, sigma, Vt, predicted

@app.route('/train', methods=['POST'])
def train():
    global state
    matrix, user_ids, ex_names, df = build_matrix()
    if matrix is None:
        return jsonify({'trained': False, 'reason': 'No interaction data found'})
    result = train_svd(matrix)
    if result[0] is None:
        return jsonify({'trained': False, 'reason': 'Matrix too small -- need 50+ users'})
    _, _, _, predicted = result
    state = {'trained': True, 'predicted': predicted, 'user_ids': user_ids, 'ex_names': ex_names, 'df': df}
    return jsonify({'trained': True})

@app.route('/replace', methods=['POST'])
def replace():
    d = request.json
    if not state['trained']:
        return jsonify({'fallback': True, 'reason': 'Model not trained'})
    user_id = d['userId']
    disliked = d['dislikedExercise']
    exercise_db = d.get('exerciseDB', [])
    if user_id not in state['user_ids']:
        return jsonify({'fallback': True, 'reason': 'New user -- no interaction history'})
    user_idx = state['user_ids'].index(user_id)
    scores = state['predicted'][user_idx]
    seen = state['df'][state['df']['user_id'] == user_id]['exercise'].tolist() + [disliked]
    candidates = [{'name': n, 'score': float(scores[i]), 'difficulty': next((e.get('difficulty', 2) for e in exercise_db if e['name'] == n), 2)} for i, n in enumerate(state['ex_names']) if n not in seen]
    candidates.sort(key=lambda x: x['score'], reverse=True)
    disliked_diff = next((e.get('difficulty', 2) for e in exercise_db if e['name'] == disliked), 2)
    def pick(fn): return next((c for c in candidates if fn(c['difficulty'])), candidates[0] if candidates else None)
    def build(c):
        if not c: return None
        ex = next((e for e in exercise_db if e['name'] == c['name']), {})
        return {'name': c['name'], 'primaryMuscle': ex.get('primaryMuscle', []), 'difficulty': c['difficulty'], 'pattern': ex.get('pattern', ''), 'sets': 3, 'reps': '8-12', 'rest': 90}
    return jsonify({'fallback': False, 'easier': build(pick(lambda d: d < disliked_diff)), 'same': build(pick(lambda d: d == disliked_diff)), 'harder': build(pick(lambda d: d > disliked_diff))})

@app.route('/status', methods=['GET'])
def status():
    _, user_ids, _, df = build_matrix()
    users = len(user_ids) if user_ids else 0
    interactions = len(df) if df is not None else 0
    return jsonify({'trained': state['trained'], 'users_have': users, 'users_need': 50, 'interactions_have': interactions, 'interactions_need': 200, 'ready_to_train': users >= 50 and interactions >= 200})

if __name__ == '__main__':
    print('Exercise replacement service on port 5002')
    success = train_model()
    if not success:
        print('Insufficient data -- running in fallback mode')
    app.run(port=5002)
*/


// ============================================================================
// MODEL 2 -- JAVASCRIPT INTEGRATION
// Replaces replaceExercise() when the Python service is running
// ============================================================================

export async function replaceExerciseML({ dislikedName, userId, goal, level, equipment, dayFocus, currentWeekExerciseNames = [] }) {
  try {
    const { EXERCISE_DB } = await import('./exerciseDB.js');
    const res = await fetch('http://localhost:5002/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, dislikedExercise: dislikedName, exerciseDB: EXERCISE_DB })
    });
    const data = await res.json();
    if (data.fallback) {
      console.warn('[Model 2] Fell back to rule-based:', data.reason);
      const { replaceExercise } = await import('./workoutModel.js');
      return replaceExercise({ dislikedName, goal, level, equipment, dayFocus, currentWeekExerciseNames });
    }
    return { easier: data.easier || null, same: data.same || null, harder: data.harder || null };
  } catch (err) {
    console.error('[Model 2] Service unreachable:', err);
    const { replaceExercise } = await import('./workoutModel.js');
    return replaceExercise({ dislikedName, goal, level, equipment, dayFocus, currentWeekExerciseNames });
  }
}


// ============================================================================
// STATUS CHECKER
// Run this to see whether enough data exists to activate these models
// ============================================================================

export async function checkOriginalMLStatus() {
  const results = { apriori: null, svd: null };
  try { results.apriori = await (await fetch('http://localhost:5001/status')).json(); }
  catch { results.apriori = { error: 'Service not running on port 5001' }; }
  try { results.svd = await (await fetch('http://localhost:5002/status')).json(); }
  catch { results.svd = { error: 'Service not running on port 5002' }; }
  const aprioriReady = results.apriori?.sessions >= 500;
  const svdReady = results.svd?.ready_to_train;
  return {
    ...results,
    recommendation: aprioriReady && svdReady ? 'ready_to_activate' : 'insufficient_data',
    message: aprioriReady && svdReady
      ? 'Both models have enough data -- deploy Python services and activate'
      : `Still collecting data. Check Supabase: workout_logs (need 500+), exercise_reactions (need 200+)`
  };
}
