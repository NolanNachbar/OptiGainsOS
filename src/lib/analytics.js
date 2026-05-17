import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = 'https://us.i.posthog.com';

let _initialized = false;

export function initAnalytics() {
  if (!KEY || _initialized) return;
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    autocapture: false,
  });
  _initialized = true;
}

export function identifyUser(userId, traits = {}) {
  if (!_initialized) return;
  posthog.identify(userId, traits);
}

export function resetAnalytics() {
  if (!_initialized) return;
  posthog.reset();
}

export function track(event, properties = {}) {
  if (!_initialized) return;
  posthog.capture(event, properties);
}

// Named event helpers keep call sites clean and typo-free

export const analytics = {
  signup:              (method = 'email')           => track('signup', { method }),
  onboardingComplete:  (steps)                       => track('onboarding_complete', { steps }),
  programDeepLink:     (programId)                   => track('program_deep_link_viewed', { program_id: programId }),
  programEnrolled:     (programId, programName)      => track('program_enrolled', { program_id: programId, program_name: programName }),
  workoutStarted:      (workoutId, source)            => track('workout_started', { workout_id: workoutId, source }),
  workoutCompleted:    (workoutId, durationMin)       => track('workout_completed', { workout_id: workoutId, duration_minutes: durationMin }),
  foodLogged:          (mealType)                     => track('food_logged', { meal_type: mealType }),
  weekGenerated:       ()                             => track('week_generated'),
  templateSeeded:      (name)                         => track('template_seeded', { template_name: name }),
};
