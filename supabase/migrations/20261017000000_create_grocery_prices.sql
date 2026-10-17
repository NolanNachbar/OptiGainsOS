-- Dated grocery shelf prices (one row = one product price seen on a store site on a date).
-- Feeds the diet optimizer / meal planning so prices stay traceable by store and date
-- instead of living only in FOOD_CATALOG literals. Owner-scoped on auth.uid() = created_by,
-- same convention as form_reviews. pack_grams is the package weight used to derive $/100 g;
-- grams_estimated is true when the weight was inferred (per-lb pricing, average tray, eggs at
-- 50 g each) rather than printed on the listing. price_text keeps the price as scraped.
create table if not exists public.grocery_prices (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  observed_on date not null,
  source text,
  store text not null,
  item text not null,
  product text not null,
  size_text text,
  price_usd numeric not null,
  pack_grams numeric,
  grams_estimated boolean not null default false,
  unit_price_text text,
  price_text text,
  is_sale boolean not null default false,
  notes text,
  price_per_100g numeric generated always as (
    case when pack_grams > 0 then round(price_usd / pack_grams * 100, 4) end
  ) stored
);

create unique index if not exists grocery_prices_unique_obs
  on public.grocery_prices (created_by, observed_on, store, item, product);
create index if not exists grocery_prices_item_date
  on public.grocery_prices (created_by, item, observed_on desc);

alter table public.grocery_prices enable row level security;

create policy "own grocery_prices select"
  on public.grocery_prices for select to authenticated
  using (auth.uid() = created_by);

create policy "own grocery_prices insert"
  on public.grocery_prices for insert to authenticated
  with check (auth.uid() = created_by);

create policy "own grocery_prices update"
  on public.grocery_prices for update to authenticated
  using (auth.uid() = created_by) with check (auth.uid() = created_by);

create policy "own grocery_prices delete"
  on public.grocery_prices for delete to authenticated
  using (auth.uid() = created_by);
