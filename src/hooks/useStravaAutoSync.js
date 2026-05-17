import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useUserQueries';
import { db, supabase } from '@/api/supabaseClient';
import { fetchStravaActivities, mapStravaActivity, refreshAccessToken } from '@/lib/strava';
import { invalidateProfile } from '@/lib/queryKeys';

const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const STORAGE_KEY = 'strava_last_sync';

export function useStravaAutoSync() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!user || !profile?.strava_access_token || hasSynced.current) return;

    const lastSync = localStorage.getItem(STORAGE_KEY);
    if (lastSync && Date.now() - parseInt(lastSync) < SYNC_INTERVAL_MS) return;

    hasSynced.current = true;

    (async () => {
      try {
        let accessToken = profile.strava_access_token;
        const now = Math.floor(Date.now() / 1000);

        if (profile.strava_token_expires_at <= now + 60) {
          const refreshed = await refreshAccessToken();
          accessToken = refreshed.access_token;
          await db.entities.UserProfile.update(profile.id, {
            strava_access_token: refreshed.access_token,
            strava_token_expires_at: refreshed.expires_at,
          });
          invalidateProfile(queryClient);
        }

        const activities = await fetchStravaActivities(accessToken);
        if (activities.length > 0) {
          const sessions = activities.map(a => mapStravaActivity(a, user.id));
          await supabase
            .from('cardio_sessions')
            .upsert(sessions, { onConflict: 'strava_activity_id' });
          queryClient.invalidateQueries({ queryKey: ['cardioSessions'] });
        }

        localStorage.setItem(STORAGE_KEY, String(Date.now()));

      } catch {
        hasSynced.current = false; // allow retry next mount if sync failed
      }
    })();
  }, [user?.id, profile?.strava_access_token]); // eslint-disable-line react-hooks/exhaustive-deps
}
