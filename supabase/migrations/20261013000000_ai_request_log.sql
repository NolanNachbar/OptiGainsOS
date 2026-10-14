-- Per-user request log backing the hourly rate limit on the Groq-backed edge
-- functions (estimate-food-macros, estimate-meal, read-nutrition-label).
CREATE TABLE IF NOT EXISTS public.ai_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fn text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS ai_request_log_user_id_created_at_idx
  ON public.ai_request_log (user_id, created_at);

ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own ai logs" ON public.ai_request_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own ai logs" ON public.ai_request_log
  FOR SELECT USING (auth.uid() = user_id);
