import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { getModelMeta, clearSavedModel } from "@/ml/rfModel";

export function useExerciseReactions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = queryKeys.exerciseReactions(user?.id);

  // Fetch all exercise reactions for the user
  const { data: reactions = [] } = useQuery({
    queryKey,
    queryFn: () => db.entities.ExerciseReaction.filter({ created_by: user.id }),
    enabled: !!user,
    staleTime: 30_000,
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ exerciseName, reaction }) => {
      // Query the DB directly — never use the cache here, because the cache
      // may contain an optimistic entry with a fake id like "optimistic-xxx".
      // Using a fake id for delete/update causes 400 errors.
      const rows = await db.entities.ExerciseReaction.filter({
        created_by: user.id,
        exercise_name: exerciseName,
      });
      const existing = rows[0] || null;

      if (existing) {
        if (existing.reaction === reaction) {
          // Same button — toggle off (delete)
          await db.entities.ExerciseReaction.delete(existing.id);
          return { action: "deleted", exerciseName };
        } else {
          // Switch reaction
          const updated = await db.entities.ExerciseReaction.update(existing.id, { reaction });
          return { action: "updated", exerciseName, reaction, record: updated };
        }
      } else {
        // New reaction — use upsert-style: if unique constraint fires it means
        // an optimistic duplicate, so we catch and update instead.
        try {
          const created = await db.entities.ExerciseReaction.create({
            exercise_name: exerciseName,
            reaction,
            created_by: user.id,
          });
          return { action: "created", exerciseName, reaction, record: created };
        } catch (err) {
          // Unique constraint — row already exists (race), fetch and update it
          const retry = await db.entities.ExerciseReaction.filter({
            created_by: user.id,
            exercise_name: exerciseName,
          });
          if (retry[0]) {
            const updated = await db.entities.ExerciseReaction.update(retry[0].id, { reaction });
            return { action: "updated", exerciseName, reaction, record: updated };
          }
          throw err;
        }
      }
    },

    // Optimistic update — write to cache BEFORE server responds
    // This is what makes the button fill in instantly on click
    onMutate: async ({ exerciseName, reaction }) => {
      // Cancel in-flight refetches so they don't overwrite optimistic state
      await queryClient.cancelQueries({ queryKey });

      // Snapshot for rollback
      const previousReactions = queryClient.getQueryData(queryKey) || [];
      const existing = previousReactions.find(r => r.exercise_name === exerciseName);

      let optimisticReactions;
      if (existing) {
        if (existing.reaction === reaction) {
          // Toggle off
          optimisticReactions = previousReactions.filter(r => r.exercise_name !== exerciseName);
        } else {
          // Switch
          optimisticReactions = previousReactions.map(r =>
            r.exercise_name === exerciseName ? { ...r, reaction } : r
          );
        }
      } else {
        // Add new
        optimisticReactions = [
          ...previousReactions,
          {
            id: `optimistic-${Date.now()}`,
            exercise_name: exerciseName,
            reaction,
            created_by: user.id,
            created_at: new Date().toISOString(),
          },
        ];
      }

      // Write to cache — triggers instant re-render everywhere
      queryClient.setQueryData(queryKey, optimisticReactions);

      return { previousReactions };
    },

    onError: (_err, _vars, context) => {
      // Roll back on failure
      if (context?.previousReactions) {
        queryClient.setQueryData(queryKey, context.previousReactions);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      // Invalidate cached ML model when 5+ reactions have accumulated since last training
      const currentReactions = queryClient.getQueryData(queryKey) || [];
      const meta = getModelMeta();
      if (meta?.reactionCount !== undefined && currentReactions.length - meta.reactionCount >= 5) {
        clearSavedModel();
      }
    },
  });

  const getReaction = (exerciseName) => {
    return reactions.find(r => r.exercise_name === exerciseName)?.reaction;
  };

  const getLikedExercises = () => {
    return reactions.filter(r => r.reaction === "like").map(r => r.exercise_name);
  };

  const getDislikedExercises = () => {
    return reactions.filter(r => r.reaction === "dislike").map(r => r.exercise_name);
  };

  return {
    reactions,
    getReaction,
    getLikedExercises,
    getDislikedExercises,
    toggleReaction: reactionMutation.mutate,
    isLoading: reactionMutation.isPending,
  };
}
