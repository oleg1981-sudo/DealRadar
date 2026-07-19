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
language sql stable
set search_path = public
as $$
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

-- Merchant-page description capture (2026-07-14): the daily live-shop verifier
-- (scripts/verify-awin.cjs) stores the merchant's reduced product-description
-- HTML here — the rich content the plain feed `description` flattens. Owned by
-- the verifier ONLY: the feed ingest never writes this column (its upsert
-- payload omits the key, so merge-duplicates leaves it untouched), and the app
-- sanitizes it again at render time before it reaches the DOM.
alter table public.deals
  add column if not exists description_html text;

-- Merchant's own product identifier (AWIN `merchant_product_id`, 2026-07-15):
-- surfaces as Product.sku in the PDP JSON-LD (Google: merchant-specific ID,
-- no whitespace). Populated only once the Create-a-Feed URL includes the
-- column — additive and inert until then.
alter table public.deals
  add column if not exists merchant_sku text;

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

-- Trigger to automatically capture price snapshot on price change.
-- THE ONLY definition of record_price_history in this file (T-DB-0 / RSK-14):
-- a second create-or-replace would silently win under last-definition-wins and
-- previously broke every price-changing upsert by omitting day/currency (23502).
-- NULL-safe (IS DISTINCT FROM); trigger narrowed to `of sale_price` so verifier
-- hidden-patches/heartbeats don't fire it. Daily fill (one row per visible deal
-- per UTC day even when the price is unchanged) is deliberately NOT this
-- trigger's job — scripts/snapshot-prices.cjs owns it (see v3.1 FR-ING-7).
create or replace function public.record_price_history()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') or (OLD.sale_price is distinct from NEW.sale_price) then
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
  after insert or update of sale_price on public.deals
  for each row execute function public.record_price_history();

-- RPC function to batch calculate and update 90-day historical low prices
create or replace function public.update_historical_lows_batch()
returns void language sql
set search_path = public
as $$
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Remediation migration (2026-06-28) — idempotent; safe to re-run.
-- Closes audit P0/P1/P2: slug integrity, transactions integrity, daily price
-- snapshot, and automated price_alerts retention. See docs/remediation_plan/.
-- ═══════════════════════════════════════════════════════════════════════════

-- [R-RTE-2 / GAP-1] Guarantee every deal has a routable slug.
-- 1) Backstop slug generator mirroring src/lib/utils/slug.ts + deals.repo toRow()
--    (slug = slugify(product_name) || '-' || sanitized(product_id)). Writers
--    (app toRow, ingest-awin.cjs) set slug explicitly; this only catches rows
--    that arrive without one, so a NULL slug (→ 404 deal page) can never persist.
create or replace function public.deal_slug(p_name text, p_product_id text)
returns text language sql immutable
set search_path = public
as $$
  select trim(both '-' from
           regexp_replace(
             regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'),
             '-+', '-', 'g'))
         || '-' ||
         regexp_replace(lower(coalesce(p_product_id, '')), '[^a-z0-9]+', '-', 'g');
$$;

create or replace function public.deals_set_slug()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if NEW.slug is null or NEW.slug = '' then
    NEW.slug := public.deal_slug(NEW.product_name, NEW.product_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trigger_deals_set_slug on public.deals;
create trigger trigger_deals_set_slug
  before insert or update on public.deals
  for each row execute function public.deals_set_slug();

-- 2) Backfill any pre-existing NULL/empty slugs, then enforce NOT NULL.
update public.deals
   set slug = public.deal_slug(product_name, product_id)
 where slug is null or slug = '';
alter table public.deals alter column slug set not null;

-- [R-MAIL-4 / R-LOC-3] Remember the subscriber's locale so price-drop emails
-- and the unsubscribe page render in their language.
alter table public.price_alerts add column if not exists locale text;

-- [R-MON-4 / S1-transactions-table] Bring transactions to integrity spec.
alter table public.transactions add column if not exists subid3      text;
alter table public.transactions add column if not exists raw_payload jsonb;
alter table public.transactions add column if not exists received_at  timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_product_id_fkey') then
    alter table public.transactions
      add constraint transactions_product_id_fkey
      foreign key (product_id) references public.deals(product_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_commission_chk') then
    alter table public.transactions
      add constraint transactions_commission_chk check (commission_earned >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_status_chk') then
    alter table public.transactions
      add constraint transactions_status_chk
      check (status in ('pending','approved','declined','paid'));
  end if;
end $$;

-- [R-ING-5 / S1-trigger-fn] RESOLVED INTO THE SINGLE DEFINITION ABOVE (T-DB-0,
-- 2026-07-09): the remediation-era duplicate of record_price_history() that
-- lived here inserted WITHOUT the NOT-NULL day/currency columns of the
-- redesigned day-keyed price_history table and, winning via create-or-replace,
-- aborted every price-changing upsert. Its NULL-safe IS DISTINCT FROM guard and
-- `of sale_price` trigger narrowing are folded into the definition at the top of
-- this section; its once-per-day fill branch is deliberately superseded by
-- scripts/snapshot-prices.cjs (see v3.1 FR-ING-7 + CHANGELOG).

-- [R-MAIL-5 / NFR-PRIV-1] Automated GDPR retention for price_alerts.
-- Deletes subscriptions past the retention window, and notified rows past a
-- shorter window. Called by the scheduled retention workflow (or pg_cron).
create or replace function public.purge_stale_price_alerts(
  retention_days int default 365,
  notified_days  int default 30)
returns integer language plpgsql
set search_path = public
as $$
declare deleted integer;
begin
  delete from public.price_alerts
   where created_at < now() - make_interval(days => retention_days)
      or (notified = true and notified_at < now() - make_interval(days => notified_days));
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
-- Optional in-DB schedule (requires pg_cron):
-- select cron.schedule('purge-stale-alerts', '0 5 * * *',
--   $$select public.purge_stale_price_alerts(365, 30)$$);

-- ── Affiliate programme state machine (AWIN advertiser discovery) ───────────
-- Written daily by .github/workflows/awin-programmes-sync.yml via
-- scripts/awin-programmes-sync.cjs: mirrors every AWIN programme across all
-- relationship states, scores not-joined programmes against the deterministic
-- join policy, and records relationship transitions (the "events" that drive
-- the join-queue digest). The JOIN itself is human (no publisher API for it).
create table if not exists public.affiliate_programmes (
  programme_id             integer primary key,
  network                  text not null default 'awin',
  name                     text not null,
  description              text,
  display_url              text,
  logo_url                 text,
  country_code             text,
  currency_code            text,
  relationship             text not null,   -- joined | pending | suspended | rejected | notjoined
  policy_score             integer not null default 0,
  policy_verdict           text not null default 'skip',  -- apply | consider | skip
  first_seen               timestamptz not null default now(),
  last_seen                timestamptz not null default now(),
  relationship_changed_at  timestamptz,
  raw                      jsonb
);
create index if not exists affiliate_programmes_relationship_idx
  on public.affiliate_programmes (relationship);
create index if not exists affiliate_programmes_verdict_idx
  on public.affiliate_programmes (policy_verdict, policy_score desc);
alter table public.affiliate_programmes enable row level security;

-- ── Ops metrics (lightweight KV time series for cost-guardrail checks) ──────
-- Minimal, single-purpose store — currently just one metric: the AWIN feed's
-- per-run compressed (on-the-wire) byte size, written by
-- scripts/ingest-awin.cjs and read by scripts/check-budgets.mjs (NFR-COST-2,
-- T-INF-9). Upsert-by-key: each run overwrites its metric's row rather than
-- appending, so this stays O(number of distinct metrics), not O(runs).
create table if not exists public.ops_metrics (
  key           text primary key,     -- e.g. 'awin_feed_bytes'
  value         numeric not null,
  recorded_at   timestamptz not null default now(),
  meta          jsonb
);
alter table public.ops_metrics enable row level security;

-- [R-MAIL-5 / T-CMP-7] Active alerts limit trigger.
-- Enforces a strict cap of 50 active alerts per email address, eliminating the
-- check-then-insert race condition in concurrent API requests.
create or replace function public.check_active_alerts_limit()
returns trigger language plpgsql
set search_path = public
as $$
declare
  active_count int;
begin
  -- If this is an update or the user is just re-subscribing/updating their existing
  -- alert for this product, let it pass (upsert logic).
  if exists (
    select 1 from public.price_alerts
    where email = NEW.email and product_id = NEW.product_id
  ) then
    return NEW;
  end if;

  select count(*) into active_count
  from public.price_alerts
  where email = NEW.email and notified = false;

  if active_count >= 50 then
    raise exception 'Limit of 50 active alerts exceeded' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trigger_check_active_alerts_limit on public.price_alerts;
create trigger trigger_check_active_alerts_limit
  before insert on public.price_alerts
  for each row execute function public.check_active_alerts_limit();

select 1;


-- ── PDP full-content pipeline (docs/specs/pdp-full-content/2026-07-16_v1) ────
-- Stage 1 migration (T1.1): additive columns + fetch-outcome persistence.
-- All nullable/additive — safe to re-run.
alter table public.deals add column if not exists feed_attrs         jsonb;        -- non-empty extra feed columns (FR-2.1)
alter table public.deals add column if not exists last_verified      timestamptz;  -- stalest-first sweep watermark (FR-3.2); content-class write per the M2 amendment
alter table public.deals add column if not exists first_published_at timestamptz;  -- never-published vs delisted discriminator (FR-3.6)
alter table public.deals add column if not exists rating_value       numeric(3,2) check (rating_value is null or (rating_value >= 0 and rating_value <= 5));
alter table public.deals add column if not exists rating_count       integer check (rating_count is null or rating_count >= 0);
alter table public.deals add column if not exists rating_source      text;         -- provenance (Q-5): e.g. 'merchant-jsonld'; markup emitted ONLY when set
alter table public.deals add column if not exists capture_run_id     text;         -- verify run that last wrote content (EC-1 provenance)
alter table public.deals add column if not exists last_verify_outcome text;      -- per-row fetch outcome ('no-discount','out-of-stock','gone',…) — promotion eligibility (Q-2) + EC-21 cohorts

-- Stalest-first ordering support (FR-3.2).
create index if not exists deals_last_verified_idx
  on public.deals (last_verified asc nulls first, product_id asc);

-- first_published_at: set once, on the first insert/update that makes the row
-- visible. Never cleared, never re-set (freeze-after-first-publish).
create or replace function public.deals_set_first_published()
returns trigger language plpgsql as $$
begin
  if new.hidden = false and new.first_published_at is null then
    new.first_published_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trigger_deals_first_published on public.deals;
create trigger trigger_deals_first_published
  before insert or update on public.deals
  for each row execute function public.deals_set_first_published();

-- One-time idempotent backfill: rows visible today were published at some
-- point — approximate with last_updated. Hidden rows stay NULL (treated as
-- never-published until their first promotion).
update public.deals set first_published_at = last_updated
  where hidden = false and first_published_at is null;

-- Per-host fetch outcomes (FR-1.3/EC-1): the persisted block-list evidence the
-- harness reads. Written by verify-awin.cjs each sweep; upsert-by-host.
create table if not exists public.fetch_outcomes (
  host        text primary key,
  status      text not null,        -- 'ok' | 'blocked-403' | 'blocked-429' | 'unreachable' | 'gone'
  http_status integer,
  ok_count    integer not null default 0,
  err_count   integer not null default 0,
  last_seen   timestamptz not null default now()
);
alter table public.fetch_outcomes enable row level security;

-- Read-only acceptance harness [FR-0]: anon SELECT on catalog data the public
-- site already renders. Write paths remain service-role only.
drop policy if exists deals_public_read on public.deals;
create policy deals_public_read on public.deals for select to anon using (true);
drop policy if exists price_history_public_read on public.price_history;
create policy price_history_public_read on public.price_history for select to anon using (true);
drop policy if exists ops_metrics_public_read on public.ops_metrics;
create policy ops_metrics_public_read on public.ops_metrics for select to anon using (true);
drop policy if exists fetch_outcomes_public_read on public.fetch_outcomes;
create policy fetch_outcomes_public_read on public.fetch_outcomes for select to anon using (true);
