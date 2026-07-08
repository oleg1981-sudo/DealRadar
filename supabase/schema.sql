-- DealRadar — Supabase schema
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pg_trgm;

create table if not exists public.deals (
  product_id        text primary key,          -- provider-prefixed: "kelkoo:12345"
  product_name      text not null,
  shop_name         text not null,
  shop_url          text not null,
  shop_logo_url     text,
  original_price    numeric(12,2) not null check (original_price >= 0),
  sale_price        numeric(12,2) not null check (sale_price >= 0),
  discount_percent  smallint      not null check (discount_percent between 0 and 100),
  currency          char(3)       not null,
  category          text          not null,
  brand             text,
  image_url         text,
  gallery           text[],                     -- extra real product images (detail modal)
  description       text,                       -- real product description (detail modal)
  merchant_url      text,                       -- direct shop URL (live price/stock verifier)
  hidden            boolean       not null default false,  -- verifier hides sold-out / undiscounted (not deleted, so re-ingest can't resurrect)
  homepage_hidden   boolean       not null default false,  -- excluded from the homepage only (e.g. merchant's page shows a different price after JS runs); still visible via category/search
  country           char(2)       not null,
  city              text,                       -- nullable: country-wide deals
  is_sponsored      boolean       not null default true,
  source            text          not null,     -- provider id
  last_updated      timestamptz   not null default now()
);

-- Migration for existing databases (safe to re-run): add the detail columns.
alter table public.deals add column if not exists gallery       text[];
alter table public.deals add column if not exists description    text;
alter table public.deals add column if not exists merchant_url   text;
alter table public.deals add column if not exists hidden         boolean not null default false;
alter table public.deals add column if not exists homepage_hidden boolean not null default false;

-- Hot path: country (+ city) scoped, sorted by discount.
create index if not exists deals_country_discount_idx
  on public.deals (country, discount_percent desc);
create index if not exists deals_country_category_discount_idx
  on public.deals (country, category, discount_percent desc);
create index if not exists deals_country_brand_idx
  on public.deals (country, brand) where brand is not null;
create index if not exists deals_last_updated_idx
  on public.deals (last_updated desc);

-- Fuzzy search on names and brands (used by /api/search).
create index if not exists deals_name_trgm_idx
  on public.deals using gin (product_name gin_trgm_ops);
create index if not exists deals_brand_trgm_idx
  on public.deals using gin (brand gin_trgm_ops) where brand is not null;

-- Distinct brands per country/category (burger-menu filters).
create or replace function public.distinct_brands(p_country char(2), p_category text default null)
returns table (brand text)
language sql stable as $$
  select distinct d.brand
  from public.deals d
  where d.country = p_country
    and d.brand is not null
    and d.hidden = false
    and (p_category is null or d.category = p_category)
  order by d.brand;
$$;

-- Freshness guarantee support: purge anything older than 24h (cron, optional).
-- The 30-minute freshness bound is enforced by the refresh job + Redis TTL;
-- this is a safety net against orphaned rows from removed providers.
-- select cron.schedule('purge-stale-deals', '0 * * * *',
--   $$delete from public.deals where last_updated < now() - interval '24 hours'$$);

-- RLS: the app uses the service-role key server-side only. Lock the table down
-- for anon/authenticated so a leaked anon key exposes nothing.
alter table public.deals enable row level security;

-- Price-drop alert subscriptions (one row per email × product). The refresh job
-- emails the subscriber once the product's sale_price first drops below
-- target_price, then flips `notified` (see notifyPriceDrops() in alerts.repo.ts).
create table if not exists public.price_alerts (
  id            uuid          primary key default gen_random_uuid(),
  email         text          not null,
  product_id    text          not null,
  product_name  text          not null,
  target_price  numeric(12,2) not null check (target_price >= 0),
  currency      char(3)       not null,
  notified      boolean       not null default false,
  notified_at   timestamptz,
  created_at    timestamptz   not null default now(),
  unique (email, product_id)
);

-- Hot path for the notify pass: pending alerts looked up by product.
create index if not exists price_alerts_pending_idx
  on public.price_alerts (product_id) where notified = false;

alter table public.price_alerts enable row level security;

-- Migration Additions: Product Metadata & History Extensions
alter table public.deals
  add column if not exists slug text,
  add column if not exists ean_code text,
  add column if not exists upc_code text,
  add column if not exists mpn text,
  add column if not exists model_number text,
  add column if not exists historical_low_price numeric(12,2),
  add column if not exists merchant_id text,
  add column if not exists affiliate_subid text;

create unique index if not exists deals_slug_idx on public.deals (slug) where slug is not null;
create index if not exists deals_ean_idx on public.deals (ean_code) where ean_code is not null;

-- Real recorded price history — one snapshot per product per day, written by
-- scripts/snapshot-prices.cjs after the daily ingest (03 UTC, feed prices) and
-- again after the daily verify (05 UTC, live-shop prices; same-day upsert means
-- the verified price wins). Feeds the per-deal price cardiogram, which shows a
-- genuine recorded curve once enough days accumulate.
create table if not exists public.price_history (
  product_id      text          not null,   -- matches deals.product_id (no FK: deals rows may be purged while history stays)
  day             date          not null,
  sale_price      numeric(12,2) not null check (sale_price >= 0),
  original_price  numeric(12,2) not null check (original_price >= 0),
  currency        char(3)       not null,
  recorded_at     timestamptz   not null default now(),
  primary key (product_id, day)
);
-- The PK (product_id, day) already serves the read path: latest N days per product.

alter table public.price_history enable row level security;

-- Affiliate transaction & commission tracking from network postbacks
create table if not exists public.transactions (
  id                uuid          primary key default gen_random_uuid(),
  transaction_id    text          not null unique,
  product_id        text,
  network           text          not null,
  commission_earned numeric(12,2) not null default 0.00,
  status            text          not null default 'pending',
  created_at        timestamptz   not null default now()
);

create index if not exists transactions_product_id_idx on public.transactions (product_id) where product_id is not null;
alter table public.transactions enable row level security;

-- Trigger to automatically capture price snapshot on update
create or replace function public.record_price_history()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') or (OLD.sale_price <> NEW.sale_price) then
    insert into public.price_history (product_id, day, sale_price, original_price, currency, recorded_at)
    values (NEW.product_id, CURRENT_DATE, NEW.sale_price, NEW.original_price, NEW.currency, now())
    on conflict (product_id, day) do update set 
      sale_price = EXCLUDED.sale_price, 
      original_price = EXCLUDED.original_price, 
      recorded_at = EXCLUDED.recorded_at;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trigger_record_price_history on public.deals;
create trigger trigger_record_price_history
  after insert or update on public.deals
  for each row execute function public.record_price_history();

-- RPC function to batch calculate and update 90-day historical low prices
create or replace function public.update_historical_lows_batch()
returns void language sql as $$
  update public.deals d
  set historical_low_price = sub.min_price
  from (
    select product_id, min(sale_price) as min_price
    from public.price_history
    where recorded_at >= now() - interval '90 days'
    group by product_id
  ) sub
  where d.product_id = sub.product_id;
$$;
