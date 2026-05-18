import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { db, supabase } from '@/api/supabaseClient';
import { useProfile } from '@/hooks/useUserQueries';
import { invalidateProfile } from '@/lib/queryKeys';
import { getStravaAuthUrl, fetchStravaActivities, mapStravaActivity, refreshAccessToken, disconnectStrava } from '@/lib/strava';
import { toast } from 'sonner';
import { RefreshCw, Link2, Link2Off, CheckCircle2 } from 'lucide-react';

export default function StravaConnect() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const isConnected = !!profile?.strava_access_token;

  const handleDisconnect = async () => {
    if (!profile) return;
    try {
      await disconnectStrava(); // deletes refresh_token from server-side strava_tokens table
      await db.entities.UserProfile.update(profile.id, {
        strava_athlete_id: null,
        strava_access_token: null,
        strava_token_expires_at: null,
      });
      invalidateProfile(queryClient);
      queryClient.invalidateQueries({ queryKey: ['cardioSessions'] });
      toast.success('Strava disconnected');
    } catch {
      toast.error('Failed to disconnect Strava');
    }
  };

  const handleSync = async () => {
    if (!profile?.strava_access_token) return;
    setSyncing(true);
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
      if (activities.length === 0) {
        toast.success('No activities found on Strava');
        return;
      }

      const sessions = activities.map(a => mapStravaActivity(a, user.id));
      const { error } = await supabase
        .from('cardio_sessions')
        .upsert(sessions, { onConflict: 'strava_activity_id' });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['cardioSessions'] });
      toast.success(`Synced ${activities.length} activities from Strava`);
    } catch (err) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-white">Connect Strava</p>
          <p className="text-sm text-[#555555] ">
            Import your runs, rides, and other cardio activities
          </p>
        </div>
        <Button
          onClick={() => { window.location.href = getStravaAuthUrl(); }}
          className="bg-[#FC4C02] hover:bg-[#e04400] text-white"
        >
          <Link2 className="w-4 h-4 mr-2" />
          Connect Strava
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-white">Strava</p>
          <Badge className="bg-[rgba(34,197,94,0.1)] text-[#4ade80] border-[rgba(34,197,94,0.2)]">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Connected
          </Badge>
        </div>
        <p className="text-sm text-[#555555] ">
          Sync your latest activities in the Cardio tab
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="text-[#555555] hover:text-[#f87171]"
        >
          <Link2Off className="w-4 h-4 mr-1.5" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}
