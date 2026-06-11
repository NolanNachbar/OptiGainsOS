import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// --- Auth Bypass Interception & Mock Data ---
const isBypassActive = () => import.meta.env.DEV && localStorage.getItem('bypass_auth') === 'true';

const getTodayLocalDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mockProfiles = [
  {
    id: 'p1',
    created_by: '00000000-0000-0000-0000-000000000000',
    username: 'mockathlete',
    display_name: 'Mock Athlete',
    avatar_url: null,
    timezone: 'America/Denver',
    primary_goal: 'muscle_gain',
    days_per_week: 4,
    weight_unit: 'lbs',
    daily_calorie_goal: 2800,
    daily_protein_goal: 180,
    daily_carbs_goal: 200,
    daily_fats_goal: 65
  }
];

const mockDailyReadiness = [
  {
    id: 'dr1',
    created_by: '00000000-0000-0000-0000-000000000000',
    checkin_date: getTodayLocalDateStr(),
    hrv_score: 78,
    sleep_score: 85,
    readiness_score: 88,
    mood: 'great',
    soreness: 'none'
  }
];

const mockWorkouts = [
  {
    id: 'w1',
    title: 'Hypertrophy Push A',
    description: 'Chest, shoulders, triceps focus',
    focus: 'strength',
    duration_minutes: 45,
    exercises: [
      { name: 'Bench Press', sets: 4, reps: '8-12', rest_seconds: 90 },
      { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', rest_seconds: 90 },
      { name: 'Lateral Raise', sets: 4, reps: '15', rest_seconds: 60 }
    ],
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: new Date().toISOString()
  }
];

const mockSchedules = [
  {
    id: 'sch1',
    workout_id: 'w1',
    scheduled_date: getTodayLocalDateStr(),
    time_of_day: 'anytime',
    completed: false,
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: new Date().toISOString()
  }
];

const mockFood = [
  { id: 'f1', date: getTodayLocalDateStr(), calories: 650, protein_grams: 45, carbs_grams: 70, fats_grams: 20, food_name: 'Oatmeal & Protein Shake', meal_type: 'breakfast', serving_size: 1, serving_unit: 'serving', created_by: '00000000-0000-0000-0000-000000000000', created_at: new Date().toISOString() },
  { id: 'f2', date: getTodayLocalDateStr(), calories: 850, protein_grams: 60, carbs_grams: 90, fats_grams: 25, food_name: 'Chicken, Rice & Broccoli', meal_type: 'lunch', serving_size: 1, serving_unit: 'serving', created_by: '00000000-0000-0000-0000-000000000000', created_at: new Date().toISOString() },
  { id: 'f3', date: getTodayLocalDateStr(), calories: 400, protein_grams: 30, carbs_grams: 40, fats_grams: 12, food_name: 'Greek Yogurt & Almonds', meal_type: 'snack', serving_size: 1, serving_unit: 'serving', created_by: '00000000-0000-0000-0000-000000000000', created_at: new Date().toISOString() }
];

const mockLogs = [
  {
    id: 'l1',
    log_date: getTodayLocalDateStr(),
    duration_seconds: 2700,
    exercises: [
      { name: 'Bench Press', sets: [{ weight: 225, reps: 8 }, { weight: 225, reps: 8 }] },
      { name: 'Incline Dumbbell Press', sets: [{ weight: 80, reps: 10 }] }
    ],
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: new Date().toISOString()
  }
];

const mockGarminActivities = [
  { activity_date: getTodayLocalDateStr(), activity_type: 'running', distance_meters: 5000, duration_seconds: 1500, avg_hr: 152, max_hr: 171, calories: 400, created_by: '00000000-0000-0000-0000-000000000000' }
];

const mockEnrollments = [
  {
    id: 'pe1',
    program_id: 'prm1',
    status: 'active',
    current_day_index: 1,
    current_cycle: 1,
    current_day: 1,
    current_week: 1,
    completed_workouts: [],
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: new Date().toISOString()
  }
];

const mockPrograms = [
  {
    id: 'prm1',
    title: 'Built Like a Badass',
    description: '12-week strength and conditioning program',
    num_cycles: 3,
    days_per_week: 3,
    duration_weeks: 12,
    schema_version: 2,
    workouts: [
      { programWorkoutId: 'pw1', title: 'Day 1: Upper Body Strength', dayIndex: 1, cycle: 1, cardio_sessions: [] }
    ]
  }
];

// ── Engine + history fixtures so dev-bypass renders a believable athlete ──
const MOCK_UID = '00000000-0000-0000-0000-000000000000';
const dayStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
};

const mockPrescriptions = [
  {
    id: 'tp1', created_by: MOCK_UID, date: getTodayLocalDateStr(),
    mpc_action: 'MIXED', mpc_intensity: 1.06, w_pst: 0.55, w_str: 0.45, acwr: 1.12,
    rationale: 'TSB is positive and HRV is trending up — cleared to push. PST deadline keeps conditioning weighted at 55%.',
    banister_state: { fitness: 62.4, fatigue: 58.1, tsb_banister: 4.2, confidence: 0.81 },
    interference: { interference_level: 'LOW', anabolic_window: true },
    overreach: { overreaching: false, fatigue_state: 'normal', hrv_z_3d: 0.4, rhr_z_3d: -0.2 },
    prescription: {
      session_type: 'mixed', split: 'upper_push',
      strength_block: [
        { name: 'Weighted Pull-Up', sets: 4, reps: 6, rir: 2, load_lbs: 45 },
        { name: 'Incline Barbell Press', sets: 4, reps: 8, rir: 2, load_lbs: 165 },
        { name: 'Overhead Press', sets: 3, reps: 8, rir: 2, load_lbs: 115 },
        { name: 'Cable Lateral Raise', sets: 3, reps: 15, rir: 1, load_lbs: 25 },
      ],
      calisthenics_block: {
        push_ups: { sets: 3, reps_each: 30 },
        sit_ups: { sets: 3, reps_each: 35 },
      },
      run_block: { zone: 'Z2', session_miles: 4.0, pace: '8:55/mi' },
      swim_block: { meters: 500, stroke: 'freestyle' },
    },
  },
];

const mockAthleteState = [
  {
    id: 'as1', created_by: MOCK_UID, date: getTodayLocalDateStr(),
    recovery: { score: 78, hrv: 84, sleep_score: 86, resting_hr: 47, hrv_trend: 'rising' },
    fatigue: { tsb: 4.2, acwr: 1.12, ctl: 62, atl: 58, interpretation: 'productive_training' },
    nutrition: {
      avg_calories_7d: 2764, calorie_target: 2800, protein_target: 185,
      weight_trend_lbs_per_week: -0.6, phase: 'cut',
    },
    endurance: { days_to_aug31: 83, weekly_miles: 18.4, last_run_pace: '8:42/mi' },
    vdot_zones: {
      current_vdot: 46.8, vdot_gap: 2.2,
      zones: { easy: '9:05-9:55', marathon: '8:05', threshold: '7:32', interval: '6:55', repetition: '6:25' },
    },
    strength: {
      bench_1rm: 245, squat_1rm: 335, deadlift_1rm: 405, ohp_1rm: 150,
      weekly_sets: 64, trend: 'rising',
    },
    hypertrophy: { weekly_volume_lbs: 148200, hard_sets: 64, frequency: 4 },
    banister: { fitness: 62.4, fatigue: 58.1, tsb: 4.2 },
  },
];

const mockEngineParams = [
  {
    id: 'ep1', created_by: MOCK_UID, date: getTodayLocalDateStr(),
    kalman_state: { level: 185.2, trend: -0.085, variance: 0.42 },
    rls_params: { theta: [0.62, 0.21, -0.14], update_count: 142 },
    cellular_state: { ampk: 0.35, mtorc1: 0.62, interference_level: "LOW", anabolic_window: true },
    vdot_state: { vdot: 46.8, last_race_equiv: '24:10 5K' },
  },
];

const mockBriefs = [
  {
    id: 'db1', created_by: MOCK_UID, date: getTodayLocalDateStr(),
    generated_at: new Date().toISOString(),
    model_used: 'claude-haiku-4-5', input_tokens: 6420, output_tokens: 980, cache_read_tokens: 4100,
    brief_json: {
      insight: 'Three straight days of rising HRV with falling intake — the cut is landing without recovery cost. Spend it on the upper-push session today.',
      performance: 'Pressing volume is up 9% week-over-week at equal RIR. Incline barbell is your fastest-rising lift; keep the 4×8 at 165 and add 5 lb next exposure if bar speed holds.',
      endurance: 'Z2 base is consolidating — 18.4 mi this week at 8:42 average. Today\'s 4 mi stays conversational; protect tomorrow\'s quality run.',
      nutrition: 'Averaging 2,764 kcal against a 2,800 target with protein at 1.0 g/lb. Carbs cycle up today (training day) — front-load them pre-session.',
      body_comp: 'Trend weight is -0.6 lb/wk, right in the target band. Lean mass markers stable; no diet adjustment warranted this week.',
      learning: 'Two study blocks logged this week. Queue the next anatomy module tonight — rest day tomorrow is a good consolidation window.',
      career: 'PST window opens in 12 weeks. Application packet review is the one open loop — 30 minutes tonight closes it.',
    },
  },
];

// 30-day histories for charts and trends.
const mockWeightHistory = Array.from({ length: 30 }, (_, i) => ({
  id: `wt${i}`, created_by: MOCK_UID, recorded_date: dayStr(i),
  weight: +(185.2 + i * 0.085 + Math.sin(i * 1.7) * 0.55).toFixed(1),
  created_at: new Date(Date.now() - i * 86400000).toISOString(),
}));

const mockRecoveryHistory = Array.from({ length: 30 }, (_, i) => ({
  id: `r${i}`, created_by: MOCK_UID, date: dayStr(i),
  hrv: Math.round(84 - i * 0.3 + Math.sin(i * 1.3) * 6),
  rhr: Math.round(47 + Math.sin(i * 0.9) * 2),
  sleep_score: Math.round(86 - Math.abs(Math.sin(i * 0.7)) * 14),
  created_by_garmin: true,
}));

const liftDay = (i, lift, base, inc) => ({
  name: lift,
  sets: [0, 1, 2, 3].map(() => ({ weight: Math.round(base - i * inc), reps: 6 + (i % 3) })),
});
const mockLogHistory = Array.from({ length: 12 }, (_, k) => {
  const i = k * 2 + 1;
  const upper = k % 2 === 0;
  return {
    id: `l${k}`, created_by: MOCK_UID, log_date: dayStr(i),
    completed_at: new Date(Date.now() - i * 86400000).toISOString(),
    duration_seconds: 3300 + (k % 3) * 420,
    exercises: upper
      ? [liftDay(k, 'Incline Barbell Press', 165, 2.5), liftDay(k, 'Weighted Pull-Up', 45, 1.25), liftDay(k, 'Overhead Press', 115, 1.25)]
      : [liftDay(k, 'Back Squat', 285, 3.5), liftDay(k, 'Romanian Deadlift', 245, 2.5), liftDay(k, 'Walking Lunge', 50, 1)],
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
  };
});

const mockFoodToday = [
  { id: 'f1', date: getTodayLocalDateStr(), calories: 612, protein_grams: 42, carbs_grams: 74, fats_grams: 16, food_name: 'Oats, Whey & Blueberries', meal_type: 'breakfast', serving_size: 1, serving_unit: 'serving', created_by: MOCK_UID, created_at: new Date().toISOString() },
  { id: 'f2', date: getTodayLocalDateStr(), calories: 838, protein_grams: 58, carbs_grams: 92, fats_grams: 24, food_name: 'Chicken, Jasmine Rice & Broccoli', meal_type: 'lunch', serving_size: 1, serving_unit: 'serving', created_by: MOCK_UID, created_at: new Date().toISOString() },
  { id: 'f3', date: getTodayLocalDateStr(), calories: 322, protein_grams: 31, carbs_grams: 33, fats_grams: 8, food_name: 'Greek Yogurt & Granola', meal_type: 'snack', serving_size: 1, serving_unit: 'serving', created_by: MOCK_UID, created_at: new Date().toISOString() },
  { id: 'f4', date: getTodayLocalDateStr(), calories: 704, protein_grams: 49, carbs_grams: 61, fats_grams: 27, food_name: 'Salmon, Potatoes & Asparagus', meal_type: 'dinner', serving_size: 1, serving_unit: 'serving', created_by: MOCK_UID, created_at: new Date().toISOString() },
];

const mockDataMap = {
  user_profiles: mockProfiles,
  daily_readiness: mockDailyReadiness,
  workouts: mockWorkouts,
  workout_schedules: mockSchedules,
  food_entries: mockFoodToday.concat(mockFood.map(f => ({ ...f, id: `old-${f.id}`, date: dayStr(1) }))),
  body_weight_entries: mockWeightHistory,
  workout_logs: mockLogHistory.concat(mockLogs),
  garmin_activities: mockGarminActivities,
  recovery_metrics: mockRecoveryHistory,
  program_enrollments: mockEnrollments,
  programs: mockPrograms,
  training_prescription: mockPrescriptions,
  athlete_state: mockAthleteState,
  engine_params: mockEngineParams,
  daily_briefs: mockBriefs,
};

const originalFrom = supabase.from;
supabase.from = function(tableName) {
  if (isBypassActive()) {
    const mockList = mockDataMap[tableName] || [];
    const queryBuilder = {
      select: () => queryBuilder,
      insert: (data) => {
        mockList.push(...(Array.isArray(data) ? data : [data]));
        return queryBuilder;
      },
      update: (updates) => {
        if (mockList[0]) Object.assign(mockList[0], updates);
        return queryBuilder;
      },
      delete: () => {
        return queryBuilder;
      },
      eq: () => queryBuilder,
      neq: () => queryBuilder,
      gte: () => queryBuilder,
      lte: () => queryBuilder,
      in: () => queryBuilder,
      order: () => queryBuilder,
      limit: () => queryBuilder,
      maybeSingle: async () => ({ data: mockList[0] || null, error: null }),
      single: async () => ({ data: mockList[0] || null, error: null }),
      then: function(onfulfilled) {
        return Promise.resolve({ data: mockList, error: null }).then(onfulfilled);
      }
    };
    return queryBuilder;
  }
  return originalFrom.apply(this, arguments);
};
// ---------------------------------------------

// Database helper with entity-based API
class DatabaseAdapter {
  constructor() {
    this.entities = {
      UserProfile: this.createEntity('user_profiles'),
      Workout: this.createEntity('workouts'),
      WorkoutSchedule: this.createEntity('workout_schedules'),
      FoodEntry: this.createEntity('food_entries'),
      WorkoutLog: this.createEntity('workout_logs'),
      BodyWeightEntry: this.createEntity('body_weight_entries'),
      Recipe: this.createEntity('recipes'),
      MealTemplate: this.createEntity('meal_templates'),
      DietPhase: this.createEntity('diet_phases'),
      WeeklyCheckin: this.createEntity('weekly_checkins'),
      CustomFood: this.createEntity('custom_foods'),
      Friendship: this.createEntity('friendships'),
      SharedWorkout: this.createEntity('shared_workouts'),
      SharedWorkoutReaction: this.createEntity('shared_workout_reactions'),
      Program: this.createEntity('programs'),
      ProgramWorkout: this.createEntity('program_workouts'),
      ProgramEnrollment: this.createEntity('program_enrollments'),
      SharedWorkoutComment: this.createEntity('shared_workout_comments'),
      SharedRecipe: this.createEntity('shared_recipes'),
      RecipeRating: this.createEntity('recipe_ratings'),
      SharedProgram: this.createEntity('shared_programs'),
      SharedProgramReaction: this.createEntity('shared_program_reactions'),
      SharedProgramComment: this.createEntity('shared_program_comments'),
      SharedRecipeReaction: this.createEntity('shared_recipe_reactions'),
      SharedRecipeComment: this.createEntity('shared_recipe_comments'),
      ExerciseReaction: this.createEntity('exercise_reactions'),
      DailyReadiness: this.createEntity('daily_readiness'),
      RecoveryMetrics: this.createEntity('recovery_metrics'),
      ReadingLog: this.createEntity('reading_log'),
      StudyLog: this.createEntity('study_log'),
      Skill: this.createEntity('skills'),
      JobApplication: this.createEntity('job_applications'),
      NetworkingLog: this.createEntity('networking_log'),
      SupplementType: this.createEntity('supplement_types'),
      SupplementLog: this.createEntity('supplement_logs'),
      WaterLog: this.createEntity('water_logs'),
      DailyBrief: this.createEntity('daily_briefs'),
      CaptureInbox: this.createEntity('capture_inbox'),
    };
  }

  async getLeaderboard(userId, exercise, timePeriod = 'all') {
    // Get accepted friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted');

    const friendIds = (friendships || []).map(f =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );
    const allUserIds = [userId, ...friendIds];

    // Time period cutoff
    let cutoff = null;
    if (timePeriod === 'week') cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    else if (timePeriod === 'month') cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let query = supabase
      .from('workout_logs')
      .select('created_by, exercises')
      .in('created_by', allUserIds);
    if (cutoff) query = query.gte('created_at', cutoff.toISOString());

    const { data: logs, error } = await query;
    if (error) throw error;

    // Find best weight+reps per user for the given exercise
    const exerciseLower = exercise.toLowerCase();
    const bests = {};
    for (const log of logs || []) {
      if (!Array.isArray(log.exercises)) continue;
      for (const ex of log.exercises) {
        if (!ex.name || ex.name.toLowerCase() !== exerciseLower) continue;
        if (!Array.isArray(ex.sets)) continue;
        for (const set of ex.sets) {
          const w = Number(set.weight) || 0;
          const r = Number(set.reps) || 0;
          if (w <= 0 || r <= 0) continue;
          const prev = bests[log.created_by];
          if (!prev || w > prev.max_weight || (w === prev.max_weight && r > prev.max_reps)) {
            bests[log.created_by] = { max_weight: w, max_reps: r };
          }
        }
      }
    }

    if (Object.keys(bests).length === 0) return [];

    // Fetch profiles for everyone with data
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('created_by, username, display_name, avatar_url')
      .in('created_by', Object.keys(bests));

    return (profiles || [])
      .map(p => ({
        user_id: p.created_by,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        max_weight: bests[p.created_by]?.max_weight ?? 0,
        max_reps: bests[p.created_by]?.max_reps ?? 0,
      }))
      .sort((a, b) => b.max_weight - a.max_weight || b.max_reps - a.max_reps);
  }

  async lookupUsername(username) {
    const { data, error } = await supabase.rpc('lookup_username', {
      target_username: username,
    });
    if (error) throw error;
    return data?.[0] || null;
  }

  async searchUsers(searchTerm, userId) {
    const pattern = `%${searchTerm}%`;
    const fields = 'created_by, username, display_name, avatar_url, bio, privacy_level';

    // Two parallel queries: both restricted to public profiles only
    const [fuzzyResult, exactResult] = await Promise.all([
      supabase
        .from('user_profiles')
        .select(fields)
        .neq('created_by', userId)
        .eq('privacy_level', 'public')
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(20),
      supabase
        .from('user_profiles')
        .select(fields)
        .neq('created_by', userId)
        .eq('privacy_level', 'public')
        .ilike('username', searchTerm)
        .limit(1),
    ]);

    if (fuzzyResult.error) throw fuzzyResult.error;
    if (exactResult.error) throw exactResult.error;

    // Merge and deduplicate, exact match first
    const seen = new Set();
    const merged = [];
    for (const p of [...(exactResult.data || []), ...(fuzzyResult.data || [])]) {
      if (!seen.has(p.created_by)) {
        seen.add(p.created_by);
        merged.push({
          user_id: p.created_by,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          bio: p.privacy_level === 'public' ? p.bio : null,
          privacy_level: p.privacy_level,
        });
      }
    }
    return merged;
  }

  async checkAreFriends(userA, userB) {
    const { data, error } = await supabase.rpc('are_friends', {
      user_a: String(userA),
      user_b: String(userB),
    });
    if (error) throw error;
    return data;
  }

  createEntity(tableName) {
    return {
      list: async (orderBy = 'created_at') => {
        const ascending = !orderBy.startsWith('-');
        const column = orderBy.replace(/^-/, '');

        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order(column, { ascending });

        if (error) throw error;
        return data || [];
      },

      get: async (id) => {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return data;
      },

      filter: async (filters) => {
        let query = supabase.from(tableName).select('*');

        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      },

      create: async (data) => {
        const { data: created, error } = await supabase
          .from(tableName)
          .insert([data])
          .select()
          .single();

        if (error) {
          console.error(`DB create error on ${tableName}:`, error.message, error.details, error.hint, 'Data:', JSON.stringify(data));
          throw error;
        }
        return created;
      },

      update: async (id, updates) => {
        const { data, error } = await supabase
          .from(tableName)
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data;
      },

      delete: async (id) => {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', id);

        if (error) throw error;
        return { success: true };
      },
    };
  }
}

export const db = new DatabaseAdapter();
