-- Migration: Add capture_inbox for second brain streaming
-- Aligns with Nolan's "Capture-First" desktop agent workflow

CREATE TABLE IF NOT EXISTS capture_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  content text NOT NULL,
  domain text CHECK (domain IN ('mind','career','training','nutrition','general')),
  processed boolean DEFAULT false, -- Flag for desktop agent to mark as done
  created_at timestamptz DEFAULT now()
);

ALTER TABLE capture_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own inbox"
  ON capture_inbox FOR ALL
  USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_capture_inbox_unprocessed ON capture_inbox(created_by, processed);
