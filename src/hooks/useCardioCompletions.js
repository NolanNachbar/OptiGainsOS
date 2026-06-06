// Persisted, cross-device "prescribed cardio done today" state.
// Replaces a localStorage-only flag (see cardio_completions migration) so the
// completion survives device changes and is queryable by the engine later.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayString } from "@/utils/dateUtils";

export function useCardioCompletions(date) {
  const { user } = useAuth();
  const day = date || getTodayString();
  const qc = useQueryClient();
  const key = ["cardio-completions", day, user?.id];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cardio_completions")
        .select("name")
        .eq("created_by", user.id)
        .eq("cardio_date", day);
      if (error) throw error;
      return new Set((data || []).map((r) => r.name));
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const completed = data || new Set();

  const mutation = useMutation({
    mutationFn: async (name) => {
      if (completed.has(name)) {
        const { error } = await supabase
          .from("cardio_completions")
          .delete()
          .eq("created_by", user.id)
          .eq("cardio_date", day)
          .eq("name", name);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cardio_completions")
          .upsert(
            { created_by: user.id, cardio_date: day, name },
            { onConflict: "created_by,cardio_date,name" }
          );
        if (error) throw error;
      }
    },
    // Optimistic toggle so the checkbox feels instant.
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      const next = new Set(prev || []);
      next.has(name) ? next.delete(name) : next.add(name);
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (_e, _name, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    completed,
    isDone: (name) => completed.has(name),
    toggle: (name) => mutation.mutate(name),
  };
}
