-- Fix two pre-existing problems on push_subscriptions that silently blocked all
-- client-side subscription writes (so push notifications never worked):
--
-- 1. RLS was ENABLED with NO policies, denying every authenticated insert/select.
--    Add the standard single-user policy. NOTE: created_by on this table is TEXT
--    (not uuid like other tables), so cast auth.uid() to text.
--
-- 2. The client upserts with onConflict:"endpoint", but the only unique
--    constraint was (created_by, endpoint). PostgREST then returns HTTP 400
--    ("no unique or exclusion constraint matching the ON CONFLICT specification").
--    Add a unique constraint on endpoint alone — a push endpoint is globally
--    unique per device, so this is correct and matches the client.
--
-- These were applied live via MCP on 2026-06-07; this file records them in VCS.

-- 1. RLS policy
DROP POLICY IF EXISTS "own push subscriptions" ON push_subscriptions;
CREATE POLICY "own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid()::text = created_by)
  WITH CHECK (auth.uid()::text = created_by);

-- 2. Unique constraint on endpoint (matches the client's onConflict target)
ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
