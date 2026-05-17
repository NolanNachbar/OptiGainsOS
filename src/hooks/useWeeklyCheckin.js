import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useAllFoodEntries, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import {
  queryKeys,
  invalidateCheckins,
  invalidateProfile,
} from "@/lib/queryKeys";
import { generateWeeklyCheckin } from "@/utils/checkinUtils";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { toast } from "sonner";

export function useWeeklyCheckin() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activePhase } = useDietPhase();
  const queryClient = useQueryClient();

  const { weightEntries } = useBodyWeightEntries();

  const { allFoodEntries: foodEntries } = useAllFoodEntries();

  // Check if a check-in already exists for this week
  const weekStart = format(
    startOfWeek(new Date(), { weekStartsOn: 0 }),
    "yyyy-MM-dd"
  );
  const weekEnd = format(
    endOfWeek(new Date(), { weekStartsOn: 0 }),
    "yyyy-MM-dd"
  );

  const { data: existingCheckin } = useQuery({
    queryKey: queryKeys.pendingCheckin(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_checkins")
        .select("*")
        .eq("created_by", user.id)
        .gte("checkin_date", weekStart)
        .lte("checkin_date", weekEnd)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Last accepted check-in (for week_number and previous trend weight)
  const { data: lastAcceptedCheckin } = useQuery({
    queryKey: queryKeys.lastAcceptedCheckin(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_checkins")
        .select("*")
        .eq("created_by", user.id)
        .eq("status", "accepted")
        .order("checkin_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Determine if we should generate a check-in
  const isCheckinDay = useMemo(() => {
    const today = new Date().getDay();
    return today === (profile?.checkin_day ?? 0);
  }, [profile?.checkin_day]);

  const shouldGenerate =
    (isCheckinDay || !existingCheckin) &&
    !existingCheckin &&
    activePhase &&
    weightEntries.length >= 2;

  // Generate check-in (computed, not yet saved)
  const generatedCheckin = useMemo(() => {
    if (!shouldGenerate) return null;
    return generateWeeklyCheckin({
      activePhase,
      weightEntries,
      foodEntries,
      profile,
      previousCheckin: lastAcceptedCheckin,
    });
  }, [
    shouldGenerate,
    activePhase,
    weightEntries,
    foodEntries,
    profile,
    lastAcceptedCheckin,
  ]);

  const acceptCheckin = useMutation({
    mutationFn: async (checkin) => {
      await db.entities.WeeklyCheckin.create({
        ...checkin,
        created_by: user.id,
        status: "accepted",
      });
      if (profile) {
        await db.entities.UserProfile.update(profile.id, {
          daily_calorie_goal: checkin.new_calories,
          daily_protein_goal: checkin.new_protein,
          daily_carbs_goal: checkin.new_carbs,
          daily_fats_goal: checkin.new_fats,
        });
      }
    },
    onSuccess: () => {
      invalidateCheckins(queryClient);
      invalidateProfile(queryClient);
      queryClient.invalidateQueries({ queryKey: ['lastAcceptedCheckin'] });
      toast.success("Check-in accepted! Macros updated.");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save check-in");
    },
  });

  const dismissCheckin = useMutation({
    mutationFn: async (checkin) => {
      await db.entities.WeeklyCheckin.create({
        ...checkin,
        created_by: user.id,
        status: "dismissed",
      });
    },
    onSuccess: () => {
      invalidateCheckins(queryClient);
      queryClient.invalidateQueries({ queryKey: ['lastAcceptedCheckin'] });
      toast.info("Check-in dismissed. Macros unchanged.");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to dismiss check-in");
    },
  });

  // The pending check-in to show: either an existing pending one from DB, or a freshly generated one
  const pendingCheckin = existingCheckin?.status === "pending"
    ? existingCheckin
    : !existingCheckin
    ? generatedCheckin
    : null;

  return {
    pendingCheckin,
    isCheckinDay,
    acceptCheckin,
    dismissCheckin,
    hasPendingCheckin: !!pendingCheckin,
  };
}
