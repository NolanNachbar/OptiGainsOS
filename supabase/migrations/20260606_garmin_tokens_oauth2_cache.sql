-- Cache the short-lived Garmin OAuth2 bearer so on-demand syncs
-- (garmin-activities-sync, triggered on "cardio done") don't re-exchange on every
-- call and trip Garmin's 429 rate limit on the OAuth2 exchange endpoint.
-- Additive + nullable; safe to re-run.
alter table public.garmin_tokens
  add column if not exists oauth2_token text,
  add column if not exists oauth2_expires_at timestamptz;
