-- Standardized pose tagging for physique photos so progress is comparable
-- across time (same pose vs same pose). Pose vocabulary lives in the frontend
-- (PhysiqueTracker POSES); this just stores which one a photo is.
alter table physique_entries add column if not exists pose text;
create index if not exists idx_physique_pose on physique_entries(created_by, pose, taken_at desc);
