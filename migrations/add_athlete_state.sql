-- athlete_state: daily deterministic snapshot computed by compute_athlete_state.py
-- Run at 4am MT (11am UTC) after garmin-sync (3am MT / 10am UTC).

CREATE TABLE IF NOT EXISTS athlete_state (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid REFERENCES auth.users NOT NULL,
  date         date NOT NULL,
  strength     jsonb DEFAULT '{}'::jsonb,
  hypertrophy  jsonb DEFAULT '{}'::jsonb,
  fatigue      jsonb DEFAULT '{}'::jsonb,
  recovery     jsonb DEFAULT '{}'::jsonb,
  endurance    jsonb DEFAULT '{}'::jsonb,
  nutrition    jsonb DEFAULT '{}'::jsonb,
  computed_at  timestamptz DEFAULT now(),
  UNIQUE(created_by, date)
);

ALTER TABLE athlete_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "owner_all_athlete_state" ON athlete_state;
  CREATE POLICY "owner_all_athlete_state" ON athlete_state
    FOR ALL USING (auth.uid() = created_by);
END $$;

-- pst_tests: BUD/S PST benchmark results logged every 4 weeks
CREATE TABLE IF NOT EXISTS pst_tests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid REFERENCES auth.users NOT NULL,
  test_date    date NOT NULL,
  swim_seconds int,
  pushups      int,
  situps       int,
  pullups      int,
  run_seconds  int,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(created_by, test_date)
);

ALTER TABLE pst_tests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "owner_all_pst_tests" ON pst_tests;
  CREATE POLICY "owner_all_pst_tests" ON pst_tests
    FOR ALL USING (auth.uid() = created_by);
END $$;
