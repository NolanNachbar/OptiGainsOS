-- Pre-populated weekly-meal-plan rows are written with planned = true (a
-- not-yet-eaten check-off item). Checking one off flips it to false, at which
-- point it counts as a normal logged/eaten entry. Existing rows are all real
-- (eaten) entries, so they default to false. Additive + safe.
alter table public.food_entries
  add column if not exists planned boolean not null default false;
