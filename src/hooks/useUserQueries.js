import { useQuery } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { format, subDays } from "date-fns";

export function useProfile() {
  const { user } = useAuth();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: queryKeys.userProfile(user?.id),
    queryFn: async () => {
      const profiles = await db.entities.UserProfile.filter({ created_by: user.id });
      return profiles[0] || null;
    },
    enabled: !!user,
  });

  return { profile, isLoading, error };
}

export function useAllFoodEntries() {
  const { user } = useAuth();

  const { data: allFoodEntries = [], isLoading, error } = useQuery({
    queryKey: queryKeys.allFoodEntries(user?.id),
    queryFn: async () => {
      const since = format(subDays(new Date(), 90), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('created_by', user.id)
        .gte('date', since)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { allFoodEntries, isLoading, error };
}

export function useCustomFoods() {
  const { user } = useAuth();

  const { data: customFoods = [], isLoading, error } = useQuery({
    queryKey: queryKeys.customFoods(user?.id),
    queryFn: () => db.entities.CustomFood.filter({ created_by: user.id }),
    enabled: !!user,
  });

  return { customFoods, isLoading, error };
}

export function useBodyWeightEntries() {
  const { user } = useAuth();

  const { data: weightEntries = [], isLoading, error } = useQuery({
    queryKey: queryKeys.bodyWeightEntries(user?.id),
    queryFn: async () => {
      const since = format(subDays(new Date(), 365), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('body_weight_entries')
        .select('*')
        .eq('created_by', user.id)
        .gte('recorded_date', since)
        .order('recorded_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { weightEntries, isLoading, error };
}
