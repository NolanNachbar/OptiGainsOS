-- joint_action_volume: weekly hard-set counts per joint-action pattern
-- (horizontal_push, vertical_push, hinge, ...), written by
-- compute_joint_action_volume() in compute_athlete_state.py (Gap #4:
-- OHP-vs-bench redundancy). Read by session_generator's exercise-selection
-- tiebreak. Column was never added when that code shipped — compute_athlete_state
-- has been failing to upsert athlete_state ever since.
alter table athlete_state add column if not exists joint_action_volume jsonb;
