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
      FoodPortion: this.createEntity('food_portions'),
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
      ExerciseShotNote: this.createEntity('exercise_shot_notes'),
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
