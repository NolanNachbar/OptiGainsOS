import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { invalidateBodyWeight, invalidateProfile } from "@/lib/queryKeys";
import { getTodayString } from "@/utils/dateUtils";

// Today's weigh-in, if one exists. Keyed under the 'bodyWeightEntries' prefix so
// the existing invalidateBodyWeight() helper refreshes it too.
export function useTodayBodyWeight(date) {
  const { user } = useAuth();
  const dateStr = date || getTodayString();

  const { data: todayWeight = null, isLoading, isFetching } = useQuery({
    queryKey: ["bodyWeightEntries", "today", user?.id, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_weight_entries")
        .select("*")
        .eq("created_by", user.id)
        .eq("recorded_date", dateStr)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!user,
  });

  // isFetching is exposed alongside isLoading because a background refetch of a
  // stale cache still reports isLoading false while holding the old value. The
  // pre-session gate needs "we don't know yet" to be distinguishable from
  // "no weigh-in today", or it would re-ask on a day already logged.
  return { todayWeight, isLoading, isFetching };
}

// Single write path for a weigh-in, shared by the standalone WeighInModal and
// the pre-session check-in. body_weight_entries has no unique constraint on
// (created_by, recorded_date), so an upsert would not dedupe — re-weighing the
// same day updates the existing row instead of inserting a duplicate (duplicate
// same-day rows would skew the engine's weight trend / adaptive TDEE).
// No unit conversion: the value is stored exactly as entered, profile
// weight_unit is display only.
//
// Args: { weight, date, notes, syncProfile }. Omitting `notes` leaves an
// existing note alone; passing null clears it. syncProfile: false is for callers
// that write current_weight themselves in the same save (Profile, StatsSetup),
// so the two writes can't race.
export function useLogWeight() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weight, date, notes, syncProfile = true }) => {
      const value = parseFloat(weight);
      const dateStr = date || getTodayString();

      const existing = await db.entities.BodyWeightEntry.filter({
        created_by: user.id,
        recorded_date: dateStr,
      });

      // Only patch notes when the caller passed them: a weigh-in from the
      // check-in sends no notes, and must not wipe a note logged that morning
      // from the Progress page.
      const patch = notes === undefined ? { weight: value } : { weight: value, notes };
      const entry = existing?.length
        ? await db.entities.BodyWeightEntry.update(existing[0].id, patch)
        : await db.entities.BodyWeightEntry.create({
            weight: value,
            recorded_date: dateStr,
            notes: notes ?? null,
            created_by: user.id,
          });

      // current_weight means "what he weighs now", so only today's entry sets
      // it. Backfilling an older date from Progress must leave it alone.
      if (syncProfile && profile?.id && dateStr === getTodayString()) {
        await db.entities.UserProfile.update(profile.id, { current_weight: value });
      }
      return entry;
    },
    onSuccess: () => {
      invalidateBodyWeight(queryClient);
      invalidateProfile(queryClient);
    },
  });
}
