import { useQuery } from "@tanstack/react-query";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

export function useDietPhase() {
  const { user } = useAuth();

  // Fetch active phase (end_date IS NULL)
  const { data: activePhase, isLoading } = useQuery({
    queryKey: queryKeys.activeDietPhase(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diet_phases")
        .select("*")
        .eq("created_by", user.id)
        .is("end_date", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch all phases for history
  const { data: phaseHistory = [] } = useQuery({
    queryKey: queryKeys.dietPhases(user?.id),
    queryFn: () => db.entities.DietPhase.filter({ created_by: user.id }),
    enabled: !!user,
  });

  return { activePhase, phaseHistory, isLoading };
}
