import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useUserQueries';
import { db } from '@/api/supabaseClient';
import { exchangeCodeForTokens } from '@/lib/strava';
import { invalidateProfile } from '@/lib/queryKeys';
import { LoadingScreen } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function StravaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;

    const errorParam = searchParams.get('error');
    if (errorParam) {
      navigate('/profile');
      return;
    }

    // Validate OAuth state to prevent CSRF attacks
    const returnedState = searchParams.get('state');
    const storedState = sessionStorage.getItem('strava_oauth_state');
    sessionStorage.removeItem('strava_oauth_state');
    if (!storedState || storedState !== returnedState) {
      setError('Invalid OAuth state — possible CSRF attempt. Please try connecting Strava again.');
      return;
    }

    const code = searchParams.get('code');
    if (!code || !user || profileLoading) return;

    if (!profile) {
      setError('Profile not found — please complete onboarding first.');
      return;
    }

    setDone(true);
    (async () => {
      try {
        // refresh_token is stored server-side by the Edge Function — never returned here
        const tokenData = await exchangeCodeForTokens(code);
        await db.entities.UserProfile.update(profile.id, {
          strava_athlete_id: String(tokenData.athlete.id),
          strava_access_token: tokenData.access_token,
          strava_token_expires_at: tokenData.expires_at,
        });
        invalidateProfile(queryClient);
        toast.success('Strava connected! Head to the Cardio tab to sync your activities.');
        navigate('/profile');
      } catch (err) {
        setError(err.message || 'Failed to connect Strava');
      }
    })();
  }, [searchParams, user, profile, profileLoading, done, navigate, queryClient]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] ">
        <div className="text-center p-6">
          <p className="text-[#f87171] font-medium text-lg mb-1">Failed to connect Strava</p>
          <p className="text-sm text-[#555555] mb-4">{error}</p>
          <Button variant="outline" onClick={() => navigate('/profile')}>
            Back to Profile
          </Button>
        </div>
      </div>
    );
  }

  return <LoadingScreen />;
}
