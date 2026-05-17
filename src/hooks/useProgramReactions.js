import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

export function useProgramReactions(sharedProgramId) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = queryKeys.programReactions(sharedProgramId);

  // Fetch reaction stats for this program
  const { data: stats = { count: 0, userLiked: false } } = useQuery({
    queryKey,
    queryFn: async () => {
      const [countResult, userReactionResult] = await Promise.all([
        supabase
          .from("shared_program_reactions")
          .select("id", { count: "exact", head: true })
          .eq("shared_program_id", sharedProgramId),
        supabase
          .from("shared_program_reactions")
          .select("id")
          .eq("shared_program_id", sharedProgramId)
          .eq("created_by", user.id)
          .maybeSingle(),
      ]);

      if (countResult.error) throw countResult.error;

      return {
        count: countResult.count || 0,
        userLiked: Boolean(userReactionResult.data),
      };
    },
    enabled: !!user && !!sharedProgramId,
    staleTime: 10_000,
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (stats.userLiked) {
        // Remove like
        const { error } = await supabase
          .from("shared_program_reactions")
          .delete()
          .eq("shared_program_id", sharedProgramId)
          .eq("created_by", user.id);
        if (error) throw error;
        return { action: "unliked" };
      } else {
        // Add like
        const { error } = await supabase
          .from("shared_program_reactions")
          .insert({
            shared_program_id: sharedProgramId,
            created_by: user.id,
            reaction_type: "like",
          });
        if (error) throw error;
        return { action: "liked" };
      }
    },

    // Optimistic update
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previousStats = queryClient.getQueryData(queryKey);

      const optimisticStats = {
        count: stats.userLiked ? stats.count - 1 : stats.count + 1,
        userLiked: !stats.userLiked,
      };

      queryClient.setQueryData(queryKey, optimisticStats);
      return { previousStats };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousStats) {
        queryClient.setQueryData(queryKey, context.previousStats);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.exploreFeed(user?.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.feed(user?.id) });
    },
  });

  return {
    likeCount: stats.count,
    userLiked: stats.userLiked,
    toggleLike: toggleLikeMutation.mutate,
    isLoading: toggleLikeMutation.isPending,
  };
}
