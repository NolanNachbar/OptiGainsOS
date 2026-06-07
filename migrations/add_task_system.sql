-- Migration: Task system (recurring plan + daily instances)
-- Aligns with PersonalOS-PRD.md and the "vault owns the plan, app owns today" model.
--
-- Two layers, no two-way sync:
--   task_templates  = THE PLAN. Recurring rules. Synced down one-way from the
--                     second brain (vault) by source_key. Changes rarely.
--   daily_tasks     = TODAY'S LIST. Instances generated each morning by cron.
--                     The phone reads/checks/deletes/adds here. Edits to today
--                     never touch the plan. Ad-hoc phone additions have
--                     template_id = NULL and are one-offs by construction.
-- "Make this permanent" from the phone -> capture_inbox (already exists) ->
-- triaged into the vault later.

-- ── 1. THE PLAN ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  source_key text NOT NULL,              -- stable id from the vault, e.g. 'skill.typing'
  title text NOT NULL,                   -- "15 min typing on keybr.com"
  domain text CHECK (domain IN ('mind','career','training','nutrition','general')),
  goal text,                             -- what it serves: "IB prep", "Skill dev"
  recurrence text NOT NULL DEFAULT 'daily'
    CHECK (recurrence IN ('daily','weekdays','weekly','custom')),
  days_of_week int[],                    -- for 'weekly'/'custom': [1,3,5] = Mon/Wed/Fri (0=Sun .. 6=Sat)
  target text,                           -- "1 problem", "45 min" — shown, not enforced
  sort_order int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (created_by, source_key)        -- re-syncing the vault upserts, never duplicates
);

-- ── 2. TODAY'S LIST ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  template_id uuid REFERENCES task_templates ON DELETE SET NULL, -- NULL = ad-hoc (phone one-off)
  title text NOT NULL,                   -- snapshot copy, so editing today never edits the plan
  domain text,
  target text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  completed_at timestamptz,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (created_by, date, template_id)  -- idempotent: cron can run twice, no dupes
                                          -- (NULL template_id rows are distinct, so ad-hoc adds stack freely)
);

-- ── 3. Idempotent generator ────────────────────────────────────
-- Inserts today's instances for one user from their active templates whose
-- recurrence matches the date. Returns how many rows were created.
-- SECURITY DEFINER so pg_cron (running as table owner) can call it.
CREATE OR REPLACE FUNCTION materialize_daily_tasks(p_user uuid, p_date date DEFAULT current_date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted int;
BEGIN
  INSERT INTO daily_tasks (created_by, date, template_id, title, domain, target, sort_order)
  SELECT t.created_by, p_date, t.id, t.title, t.domain, t.target, t.sort_order
  FROM task_templates t
  WHERE t.created_by = p_user
    AND t.active
    AND (
      t.recurrence = 'daily'
      OR (t.recurrence = 'weekdays' AND extract(dow FROM p_date) BETWEEN 1 AND 5)
      OR (t.recurrence IN ('weekly','custom') AND extract(dow FROM p_date) = ANY(t.days_of_week))
    )
  ON CONFLICT (created_by, date, template_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- Keep updated_at honest on the plan table
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_task_templates_updated ON task_templates;
CREATE TRIGGER trg_task_templates_updated
  BEFORE UPDATE ON task_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. RLS (single-user PersonalOS) ────────────────────────────
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own templates"   ON task_templates FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "own daily tasks" ON daily_tasks    FOR ALL USING (auth.uid() = created_by);

-- ── 5. Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_tasks_today    ON daily_tasks(created_by, date, status);
CREATE INDEX IF NOT EXISTS idx_task_templates_active ON task_templates(created_by, active);
