import { supabase } from '@/api/supabaseClient';

const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;
const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strava-token`;

const getRedirectUri = () =>
  `${window.location.origin}${import.meta.env.BASE_URL}strava-callback`;

const callStravaProxy = async (body) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Strava token request failed');
  }
  return res.json();
};

export const getStravaAuthUrl = () => {
  // Generate a random state token to prevent CSRF attacks.
  // Validated in StravaCallback before accepting the authorization code.
  const state = crypto.randomUUID();
  sessionStorage.setItem('strava_oauth_state', state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'activity:read_all',
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
};

export const exchangeCodeForTokens = async (code) =>
  callStravaProxy({ action: 'exchange', code, redirect_uri: getRedirectUri() });

// refresh_token is stored server-side — Edge Function reads it directly
export const refreshAccessToken = async () =>
  callStravaProxy({ action: 'refresh' });

export const disconnectStrava = async () =>
  callStravaProxy({ action: 'disconnect' });

export const fetchStravaActivities = async (accessToken, perPage = 100, page = 1) => {
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error('Failed to fetch Strava activities');
  return res.json();
};

export const mapStravaActivity = (activity, userId) => ({
  created_by: userId,
  strava_activity_id: activity.id,
  activity_type: activity.type,
  name: activity.name,
  start_date: activity.start_date,
  distance_meters: activity.distance || 0,
  moving_time_seconds: activity.moving_time || 0,
  elapsed_time_seconds: activity.elapsed_time || 0,
  total_elevation_gain: activity.total_elevation_gain || 0,
  average_speed: activity.average_speed || 0,
  max_speed: activity.max_speed || 0,
  average_heartrate: activity.average_heartrate || null,
  max_heartrate: activity.max_heartrate || null,
  average_cadence: activity.average_cadence || null,
  calories: activity.calories || null,
  map_polyline: activity.map?.summary_polyline || null,
});

export const ACTIVITY_TYPE_COLORS = {
  Run: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  VirtualRun: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Ride: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  VirtualRide: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Swim: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Walk: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Hike: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  WeightTraining: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Workout: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  Yoga: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  Rowing: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

export const ACTIVITY_TYPE_LABELS = {
  Run: 'Run',
  VirtualRun: 'Virtual Run',
  Ride: 'Ride',
  VirtualRide: 'Virtual Ride',
  Swim: 'Swim',
  Walk: 'Walk',
  Hike: 'Hike',
  WeightTraining: 'Weight Training',
  Workout: 'Workout',
  Yoga: 'Yoga',
  EllipticalTrainer: 'Elliptical',
  StairStepper: 'Stair Stepper',
  Rowing: 'Row',
  NordicSki: 'Nordic Ski',
  AlpineSki: 'Alpine Ski',
};
