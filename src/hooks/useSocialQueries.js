import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys, invalidateFriends, invalidateWorkouts, invalidateFeed, invalidateComments, invalidateSharedRecipes, invalidateSharedPrograms, invalidatePrograms } from "@/lib/queryKeys";
import { getUniqueExercises } from "@/utils/exerciseStats";

export function useFriends() {
  const { user } = useAuth();

  const { data: friends = [], isLoading, error } = useQuery({
    queryKey: queryKeys.friends(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      if (error) throw error;

      // For each friendship, look up the friend's profile
      const friendIds = (data || []).map(f =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );
      if (friendIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('created_by, username, display_name, bio, avatar_url, privacy_level, total_workouts, current_streak, last_workout_date')
        .in('created_by', friendIds);
      if (profileError) throw profileError;

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.created_by] = p; });

      return (data || []).map(f => {
        const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
        return { ...f, friendProfile: profileMap[friendId] || null };
      });
    },
    enabled: !!user,
  });

  return { friends, isLoading, error };
}

export function usePendingFriendRequests() {
  const { user } = useAuth();

  const { data: pendingRequests = [], isLoading, error } = useQuery({
    queryKey: queryKeys.pendingFriendRequests(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('*')
        .eq('addressee_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Look up requester profiles
      const requesterIds = (data || []).map(f => f.requester_id);
      if (requesterIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('created_by, username, display_name, avatar_url')
        .in('created_by', requesterIds);
      if (profileError) throw profileError;

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.created_by] = p; });

      return (data || []).map(f => ({
        ...f,
        requesterProfile: profileMap[f.requester_id] || null,
      }));
    },
    enabled: !!user,
  });

  return { pendingRequests, isLoading, error };
}

export function useNewlyAcceptedFriends() {
  const { user } = useAuth();

  const { data: newlyAccepted = [], isLoading } = useQuery({
    queryKey: queryKeys.newlyAcceptedFriends(user?.id),
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('last_viewed_social_at')
        .eq('created_by', user.id)
        .single();
      const lastViewed = profile?.last_viewed_social_at || new Date(0).toISOString();

      const { data, error } = await supabase
        .from('friendships')
        .select('*')
        .eq('requester_id', user.id)
        .eq('status', 'accepted')
        .gt('updated_at', lastViewed)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      return data || [];
    },
    enabled: !!user,
  });

  return { newlyAccepted, isLoading };
}

export function useMarkFriendsAsViewed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from('user_profiles')
      .update({ last_viewed_social_at: new Date().toISOString() })
      .eq('created_by', user.id);
    queryClient.invalidateQueries({ queryKey: ['newlyAcceptedFriends'] });
    queryClient.invalidateQueries({ queryKey: ['notificationCount'] });
  }, [user?.id, queryClient]);
}

export function useSentFriendRequests() {
  const { user } = useAuth();

  const { data: sentRequests = [], isLoading, error } = useQuery({
    queryKey: queryKeys.sentFriendRequests(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('*')
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const addresseeIds = (data || []).map(f => f.addressee_id);
      if (addresseeIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('created_by, username, display_name, avatar_url')
        .in('created_by', addresseeIds);
      if (profileError) throw profileError;

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.created_by] = p; });

      return (data || []).map(f => ({
        ...f,
        addresseeProfile: profileMap[f.addressee_id] || null,
      }));
    },
    enabled: !!user,
  });

  return { sentRequests, isLoading, error };
}

export function useUserSearch(searchInput) {
  const { user } = useAuth();
  const [debouncedTerm, setDebouncedTerm] = useState('');

  useEffect(() => {
    const trimmed = searchInput?.trim() || '';
    if (trimmed.length < 2) {
      setDebouncedTerm('');
      return;
    }
    const timer = setTimeout(() => setDebouncedTerm(trimmed), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: queryKeys.userSearch(debouncedTerm),
    queryFn: () => db.searchUsers(debouncedTerm, user.id),
    enabled: !!user && debouncedTerm.length >= 2,
    staleTime: 30_000,
  });

  return {
    results,
    isLoading,
    isSearching: debouncedTerm.length >= 2,
  };
}

export function useSendFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUsername) => {
      const cleaned = targetUsername.trim();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleaned)) {
        throw new Error('Invalid username. Use 3-20 characters: letters, numbers, underscores.');
      }

      const result = await db.lookupUsername(cleaned);
      if (!result) throw new Error('User not found');
      if (result.user_id === user.id) throw new Error("That's your own username!");

      // Check for existing friendship in either direction
      const { data: existing } = await supabase
        .from('friendships')
        .select('id, status')
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${result.user_id}),and(requester_id.eq.${result.user_id},addressee_id.eq.${user.id})`
        );

      if (existing?.length > 0) {
        const f = existing[0];
        if (f.status === 'accepted') throw new Error('Already friends!');
        if (f.status === 'pending') throw new Error('Request already pending');
        if (f.status === 'blocked') throw new Error('User not found');
        if (f.status === 'declined') {
          // Allow re-sending if previously declined
          await db.entities.Friendship.update(f.id, {
            status: 'pending',
            requester_id: user.id,
            addressee_id: result.user_id,
            updated_at: new Date().toISOString(),
          });
          return;
        }
      }

      return db.entities.Friendship.create({
        requester_id: user.id,
        addressee_id: result.user_id,
        status: 'pending',
      });
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, action }) => {
      return db.entities.Friendship.update(requestId, {
        status: action,
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (friendshipId) => {
      return db.entities.Friendship.delete(friendshipId);
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function usePublicProfile(username) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.publicProfile(username),
    queryFn: async () => {
      // lookup_username now returns all profile fields via SECURITY DEFINER
      const result = await db.lookupUsername(username);
      if (!result) return null;

      // Check friendship status if not our own profile
      let isFriend = false;
      if (result.user_id !== user.id) {
        isFriend = await db.checkAreFriends(user.id, result.user_id);
      }

      const isOwn = result.user_id === user.id;
      const privacyLevel = result.privacy_level || result.privacy || 'public';
      const canView = isOwn || privacyLevel === 'public' || ((privacyLevel === 'friends_only' || privacyLevel === 'private') && isFriend);

      if (!canView) {
        return {
          username: result.display_name,
          privacy_level: privacyLevel,
          isFriend,
          isOwn,
          restricted: true,
        };
      }

      // Use the data already returned from lookup_username (bypasses RLS)
      return {
        created_by: result.user_id,
        username: result.display_name,
        display_name: result.user_display_name,
        bio: result.user_bio,
        avatar_url: result.user_avatar_url,
        privacy_level: privacyLevel,
        total_workouts: result.user_total_workouts,
        current_streak: result.user_current_streak,
        longest_streak: result.user_longest_streak,
        fitness_level: result.user_fitness_level,
        primary_goal: result.user_primary_goal,
        isFriend,
        isOwn,
        restricted: false,
      };
    },
    enabled: !!username && !!user,
  });
}

export function useSharedWorkouts(userId) {
  return useQuery({
    queryKey: queryKeys.sharedWorkouts(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_workouts')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useSharedPrograms(userId) {
  return useQuery({
    queryKey: queryKeys.sharedPrograms(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_programs')
        .select(`
          *,
          program:programs(
            id,
            name,
            description,
            difficulty,
            goal,
            cycle_length,
            num_cycles
          )
        `)
        .eq('created_by', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useCloneSharedWorkout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedWorkout) => {
      // Convert shared exercises back to workout template format
      const exercises = (sharedWorkout.exercises || []).map(ex => ({
        name: ex.name,
        sets: typeof ex.sets === 'number' ? ex.sets : (ex.sets?.length || 3),
        reps: typeof ex.reps === 'number' ? String(ex.reps) : String(ex.sets?.[0]?.reps || 10),
        rest_seconds: 60,
        notes: ex.notes || "",
      }));

      return db.entities.Workout.create({
        title: sharedWorkout.workout_title,
        description: `Cloned from a shared workout`,
        difficulty: "intermediate",
        duration_minutes: Math.max(15, exercises.length * 8),
        exercises,
        is_custom: true,
        created_by: user.id,
      });
    },
    onSuccess: () => {
      invalidateWorkouts(queryClient);
    },
  });
}

export function useFeed() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.feed(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_social_feed', {
        user_id_param: user.id,
      });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Map the flat structure to match UI expectations
      return data.map(row => ({
        id: row.id,
        created_by: row.created_by,
        workout_title: row.workout_title,
        caption: row.caption,
        share_type: row.share_type,
        exercises: row.exercises,
        prs: row.prs,
        photo_urls: row.photo_urls,
        created_at: row.created_at,
        authorProfile: {
          created_by: row.created_by,
          username: row.author_username,
          display_name: row.author_display_name,
          avatar_url: row.author_avatar,
        },
        reactionCount: Number(row.reaction_count) || 0,
        userReacted: Boolean(row.user_reacted),
        commentCount: Number(row.comment_count) || 0,
      }));
    },
    enabled: !!user,
  });
}

export function useToggleKudos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sharedWorkoutId, hasReacted }) => {
      if (hasReacted) {
        // Remove reaction
        const { error } = await supabase
          .from('shared_workout_reactions')
          .delete()
          .eq('shared_workout_id', sharedWorkoutId)
          .eq('created_by', user.id);
        if (error) throw error;
      } else {
        // Add reaction
        const { error } = await supabase
          .from('shared_workout_reactions')
          .insert({
            created_by: user.id,
            shared_workout_id: sharedWorkoutId,
            reaction_type: 'fire',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateFeed(queryClient),
  });
}

export function useNotificationCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notificationCount(user?.id),
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('last_viewed_social_at')
        .eq('created_by', user.id)
        .single();
      const lastViewed = profile?.last_viewed_social_at || new Date(0).toISOString();

      // Count NEW pending incoming requests (created after last viewed)
      const { count: pendingCount, error } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending')
        .gt('created_at', lastViewed);
      if (error) throw error;

      // Count newly accepted outgoing requests not yet seen
      const { count: newlyAcceptedCount, error: err2 } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', user.id)
        .eq('status', 'accepted')
        .gt('updated_at', lastViewed);
      if (err2) throw err2;

      return (pendingCount || 0) + (newlyAcceptedCount || 0);
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000, // Poll every 5 min; mutations call invalidateFriends which also refreshes this
  });
}

export function useUserExerciseNames() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.userExerciseNames(user?.id),
    queryFn: async () => {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      const friendIds = (friendships || []).map(f =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );

      const { data, error } = await supabase
        .from('workout_logs')
        .select('exercises')
        .in('created_by', [user.id, ...friendIds]);
      if (error) throw error;
      return getUniqueExercises(data || []);
    },
    enabled: !!user,
  });
}

export function useLeaderboard(exercise, timePeriod = 'all') {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.leaderboard(exercise, timePeriod),
    queryFn: () => db.getLeaderboard(user.id, exercise, timePeriod),
    enabled: !!user && !!exercise,
  });
}

// ── Comments ─────────────────────────────────────────────

export function useComments(sharedWorkoutId, enabled = true) {
  return useQuery({
    queryKey: queryKeys.comments(sharedWorkoutId),
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from('shared_workout_comments')
        .select('*')
        .eq('shared_workout_id', sharedWorkoutId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (!comments || comments.length === 0) return [];

      // Enrich with author profiles
      const authorIds = [...new Set(comments.map(c => c.created_by))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('created_by, username, display_name, avatar_url')
        .in('created_by', authorIds);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.created_by] = p; });

      return comments.map(c => ({
        ...c,
        authorProfile: profileMap[c.created_by] || null,
      }));
    },
    enabled: !!sharedWorkoutId && enabled,
  });
}

export function useAddComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sharedWorkoutId, body }) =>
      db.entities.SharedWorkoutComment.create({
        shared_workout_id: sharedWorkoutId,
        created_by: user.id,
        body,
      }),
    onSuccess: (_, { sharedWorkoutId }) => {
      invalidateComments(queryClient);
      invalidateFeed(queryClient);
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId) => db.entities.SharedWorkoutComment.delete(commentId),
    onSuccess: () => {
      invalidateComments(queryClient);
      invalidateFeed(queryClient);
    },
  });
}

// ── Explore Feed ─────────────────────────────────────────

export function useExploreFeed() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.exploreFeed(user?.id),
    queryFn: async () => {
      // Fetch shared workouts
      const { data: workoutsData, error: workoutsError } = await supabase.rpc('get_explore_feed', {
        user_id_param: user.id,
      });
      if (workoutsError) throw workoutsError;

      // Fetch user's friends to check privacy settings
      const { data: friendships, error: friendshipsError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const friendIds = new Set(
        (friendships || []).map(f =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        )
      );

      // Fetch shared programs (don't throw error, just log it)
      let programsData = [];
      try {
        const { data, error } = await supabase
          .from('shared_programs')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Error fetching shared programs:', error);
        } else {
          programsData = data || [];
        }
      } catch (err) {
        console.error('Failed to fetch shared programs:', err);
      }

      // Fetch shared recipes
      let recipesData = [];
      try {
        const { data, error } = await supabase
          .from('shared_recipes')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Error fetching shared recipes:', error);
        } else {
          recipesData = data || [];
        }
      } catch (err) {
        console.error('Failed to fetch shared recipes:', err);
      }

      // Map workouts
      const workouts = (workoutsData || []).map(row => ({
        id: row.id,
        type: 'workout',
        created_by: row.created_by,
        workout_title: row.workout_title,
        caption: row.caption,
        share_type: row.share_type,
        exercises: row.exercises,
        prs: row.prs,
        photo_urls: row.photo_urls,
        created_at: row.created_at,
        isFriend: Boolean(row.is_friend),
        authorProfile: {
          created_by: row.created_by,
          username: row.author_username,
          display_name: row.author_display_name,
          avatar_url: row.author_avatar,
        },
        reactionCount: Number(row.reaction_count) || 0,
        userReacted: Boolean(row.user_reacted),
        commentCount: Number(row.comment_count) || 0,
      }));

      // Batch fetch all program details in one query
      const programIds = programsData.map(p => p.program_id).filter(Boolean);
      let programDetailMap = {};
      if (programIds.length > 0) {
        const { data: programDetails } = await supabase
          .from('programs')
          .select('id, name, description, difficulty, goal, cycle_length, num_cycles')
          .in('id', programIds);
        programDetailMap = Object.fromEntries((programDetails || []).map(p => [p.id, p]));
      }

      // Batch fetch all author profiles for programs + recipes in one query
      const allAuthorIds = [...new Set([
        ...programsData.map(p => p.created_by),
        ...recipesData.map(r => r.created_by),
      ])].filter(Boolean);
      let profileMap = {};
      if (allAuthorIds.length > 0) {
        const { data: authorProfiles } = await supabase
          .from('user_profiles')
          .select('created_by, username, display_name, avatar_url, privacy_level')
          .in('created_by', allAuthorIds);
        profileMap = Object.fromEntries((authorProfiles || []).map(p => [p.created_by, p]));
      }

      // Batch fetch program reactions (non-throwing — table may not exist yet)
      const programItemIds = programsData.map(p => p.id).filter(Boolean);
      let programReactionMap = {};
      if (programItemIds.length > 0) {
        try {
          const { data: prx } = await supabase
            .from('shared_program_reactions')
            .select('shared_program_id, created_by')
            .in('shared_program_id', programItemIds);
          for (const r of prx || []) {
            if (!programReactionMap[r.shared_program_id]) {
              programReactionMap[r.shared_program_id] = { count: 0, userReacted: false };
            }
            programReactionMap[r.shared_program_id].count++;
            if (r.created_by === user.id) programReactionMap[r.shared_program_id].userReacted = true;
          }
        } catch { /* table not yet created */ }
      }

      // Batch fetch recipe reactions (non-throwing — table may not exist yet)
      const recipeItemIds = recipesData.map(r => r.id).filter(Boolean);
      let recipeReactionMap = {};
      if (recipeItemIds.length > 0) {
        try {
          const { data: rrx } = await supabase
            .from('shared_recipe_reactions')
            .select('shared_recipe_id, created_by')
            .in('shared_recipe_id', recipeItemIds);
          for (const r of rrx || []) {
            if (!recipeReactionMap[r.shared_recipe_id]) {
              recipeReactionMap[r.shared_recipe_id] = { count: 0, userReacted: false };
            }
            recipeReactionMap[r.shared_recipe_id].count++;
            if (r.created_by === user.id) recipeReactionMap[r.shared_recipe_id].userReacted = true;
          }
        } catch { /* table not yet created */ }
      }

      // Map programs using pre-fetched data
      const programs = [];
      for (const item of programsData) {
        const program = programDetailMap[item.program_id];
        const authorProfile = profileMap[item.created_by];

        const pLevel = authorProfile?.privacy_level;
        if ((pLevel === 'private' || pLevel === 'friends_only') && !friendIds.has(item.created_by) && item.created_by !== user.id) {
          continue;
        }
        if (!program) continue;

        const prx = programReactionMap[item.id] || { count: 0, userReacted: false };
        programs.push({
          id: item.id,
          type: 'program',
          created_by: item.created_by,
          program_id: item.program_id,
          program_title: program.name || 'Untitled Program',
          caption: item.caption,
          created_at: item.created_at,
          isFriend: friendIds.has(item.created_by),
          program,
          authorProfile: authorProfile || { username: 'Unknown', display_name: null, avatar_url: null },
          reactionCount: prx.count,
          userReacted: prx.userReacted,
          commentCount: 0,
        });
      }

      // Map recipes using pre-fetched profiles
      const recipes = [];
      for (const item of recipesData) {
        const authorProfile = profileMap[item.created_by];

        const rLevel = authorProfile?.privacy_level;
        if ((rLevel === 'private' || rLevel === 'friends_only') && !friendIds.has(item.created_by) && item.created_by !== user.id) {
          continue;
        }

        const rrx = recipeReactionMap[item.id] || { count: 0, userReacted: false };
        recipes.push({
          id: item.id,
          type: 'recipe',
          created_by: item.created_by,
          recipe_id: item.recipe_id,
          recipe_name: item.name,
          description: item.description,
          servings: item.servings,
          ingredients: item.ingredients,
          total_calories: item.total_calories,
          total_protein: item.total_protein,
          total_carbs: item.total_carbs,
          total_fats: item.total_fats,
          created_at: item.created_at,
          isFriend: friendIds.has(item.created_by),
          authorProfile: authorProfile || { username: 'Unknown', display_name: null, avatar_url: null },
          reactionCount: rrx.count,
          userReacted: rrx.userReacted,
          commentCount: 0,
        });
      }

      // Merge and sort by created_at
      const combined = [...workouts, ...programs, ...recipes].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      return combined;
    },
    enabled: !!user,
  });
}

// ── Recipe Sharing ───────────────────────────────────────

export function useShareRecipe() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recipeData) =>
      db.entities.SharedRecipe.create({
        ...recipeData,
        created_by: user.id,
      }),
    onSuccess: () => invalidateSharedRecipes(queryClient),
  });
}

export function useUnshareRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sharedRecipeId) => db.entities.SharedRecipe.delete(sharedRecipeId),
    onSuccess: () => {
      invalidateSharedRecipes(queryClient);
      invalidateFeed(queryClient);
    },
  });
}

// ── Program Sharing ──────────────────────────────────────

export function useShareProgram() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ programId, caption, isPublic = true }) =>
      db.entities.SharedProgram.create({
        created_by: user.id,
        program_id: programId,
        caption: caption || null,
        is_public: isPublic,
      }),
    onSuccess: () => invalidateSharedPrograms(queryClient),
  });
}

export function useUnshareWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sharedWorkoutId) => db.entities.SharedWorkout.delete(sharedWorkoutId),
    onSuccess: () => {
      invalidateFeed(queryClient);
      invalidateWorkouts(queryClient);
    },
  });
}

export function useUnshareProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sharedProgramId) => db.entities.SharedProgram.delete(sharedProgramId),
    onSuccess: () => {
      invalidateSharedPrograms(queryClient);
      invalidateFeed(queryClient);
    },
  });
}

export function useCloneProgram() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (programId) => {
      // Get the source program and its workouts
      const program = await db.entities.Program.get(programId);
      const workouts = await db.entities.ProgramWorkout.filter({ program_id: programId });

      // Create a copy owned by the current user
      const cloned = await db.entities.Program.create({
        name: program.name,
        description: program.description,
        duration_weeks: program.duration_weeks,
        days_per_week: program.days_per_week,
        cycle_length: program.cycle_length,
        num_cycles: program.num_cycles,
        difficulty: program.difficulty,
        goal: program.goal,
        is_public: false,
        tags: program.tags || [],
        created_by: user.id,
      });

      // Copy all workouts
      for (const w of workouts) {
        await db.entities.ProgramWorkout.create({
          program_id: cloned.id,
          week_number: w.week_number,
          day_number: w.day_number,
          day_index: w.day_index,
          title: w.title,
          type: w.type,
          exercises: w.exercises,
          notes: w.notes,
          sort_order: w.sort_order,
        });
      }

      return cloned;
    },
    onSuccess: () => invalidatePrograms(queryClient),
  });
}

// ── Program Comments ─────────────────────────────────────────────

export function useProgramComments(sharedProgramId, enabled = true) {
  return useQuery({
    queryKey: queryKeys.programComments(sharedProgramId),
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from('shared_program_comments')
        .select('*')
        .eq('shared_program_id', sharedProgramId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (!comments || comments.length === 0) return [];

      // Enrich with author profiles
      const authorIds = [...new Set(comments.map(c => c.created_by))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('created_by, username, display_name, avatar_url')
        .in('created_by', authorIds);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.created_by] = p; });

      return comments.map(c => ({
        ...c,
        authorProfile: profileMap[c.created_by] || null,
      }));
    },
    enabled: !!sharedProgramId && enabled,
  });
}

export function useAddProgramComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sharedProgramId, body }) =>
      db.entities.SharedProgramComment.create({
        shared_program_id: sharedProgramId,
        created_by: user.id,
        body,
      }),
    onSuccess: (_, { sharedProgramId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.programComments(sharedProgramId) });
      invalidateFeed(queryClient);
    },
  });
}

export function useDeleteProgramComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId) => db.entities.SharedProgramComment.delete(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programComments'] });
      invalidateFeed(queryClient);
    },
  });
}

// ── Recipe Comments ──────────────────────────────────────────────

export function useRecipeComments(sharedRecipeId, enabled = true) {
  return useQuery({
    queryKey: queryKeys.recipeComments(sharedRecipeId),
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from('shared_recipe_comments')
        .select('*')
        .eq('shared_recipe_id', sharedRecipeId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (!comments || comments.length === 0) return [];

      // Enrich with author profiles
      const authorIds = [...new Set(comments.map(c => c.created_by))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('created_by, username, display_name, avatar_url')
        .in('created_by', authorIds);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.created_by] = p; });

      return comments.map(c => ({
        ...c,
        authorProfile: profileMap[c.created_by] || null,
      }));
    },
    enabled: !!sharedRecipeId && enabled,
  });
}

export function useAddRecipeComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sharedRecipeId, body }) =>
      db.entities.SharedRecipeComment.create({
        shared_recipe_id: sharedRecipeId,
        created_by: user.id,
        body,
      }),
    onSuccess: (_, { sharedRecipeId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipeComments(sharedRecipeId) });
      invalidateFeed(queryClient);
    },
  });
}

export function useDeleteRecipeComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId) => db.entities.SharedRecipeComment.delete(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipeComments'] });
      invalidateFeed(queryClient);
    },
  });
}

// ── Program & Recipe Reactions ───────────────────────────

export function useToggleProgramReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sharedProgramId, hasReacted }) => {
      if (hasReacted) {
        const { error } = await supabase
          .from('shared_program_reactions')
          .delete()
          .eq('shared_program_id', sharedProgramId)
          .eq('created_by', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shared_program_reactions')
          .insert({ created_by: user.id, shared_program_id: sharedProgramId, reaction_type: 'fire' });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateFeed(queryClient),
  });
}

export function useToggleRecipeReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sharedRecipeId, hasReacted }) => {
      if (hasReacted) {
        const { error } = await supabase
          .from('shared_recipe_reactions')
          .delete()
          .eq('shared_recipe_id', sharedRecipeId)
          .eq('created_by', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shared_recipe_reactions')
          .insert({ created_by: user.id, shared_recipe_id: sharedRecipeId, reaction_type: 'fire' });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateFeed(queryClient),
  });
}
