// Today's actual Garmin cardio activities — the ground truth of what was done
// (the engine already reads garmin_activities for run volume/ACWR; this surfaces
// the same reality in the UI so prescribed cardio auto-completes from real data).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayString } from "@/utils/dateUtils";

export function useTodayGarminCardio(date) {
  const { user } = useAuth();
  const day = date || getTodayString();

  const { data } = useQuery({
    queryKey: ["garmin-cardio", day, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("garmin_activities")
        .select("activity_type, name, distance_meters, duration_seconds")
        .eq("created_by", user.id)
        .eq("activity_date", day);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const activities = data || [];

  // Find the activity matching a prescribed discipline ('run' | 'swim').
  const match = (kind) => {
    const needle = kind === "swim" ? "swim" : "run";
    return activities.find((a) =>
      String(a.activity_type || "").toLowerCase().includes(needle)
    );
  };

  return { activities, match };
}
