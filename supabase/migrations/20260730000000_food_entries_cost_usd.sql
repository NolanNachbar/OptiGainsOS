-- Log grocery cost per planned food_entries row, so shopping-list totals stay
-- traceable to what a row actually cost at the time the week was approved,
-- independent of later FOOD_CATALOG price edits.
alter table public.food_entries add column if not exists cost_usd numeric;
