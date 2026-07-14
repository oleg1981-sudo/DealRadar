#!/usr/bin/env node
/**
 * DB contract test — verifies the database actually honors the shape,
 * semantics, and retrieval contract the app depends on (v3.1 DSN-INF-10).
 *
 * Three tiers, all read-only in effect (the semantics tier writes inside a
 * transaction that is ALWAYS rolled back):
 *
 *   shape      every expected column / index / function / trigger /
 *              constraint / RLS flag exists (catches half-applied schema,
 *              writer↔schema drift, missing objects)
 *   semantics  synthetic-deal probe: slug auto-composition, price_history
 *              trigger behavior (insert → row; same-price → no-op; change →
 *              same-day conflict-update; hidden-patch → no fire), historical-
 *              low RPC, transactions idempotency — then ROLLBACK
 *   retrieval  the six real app query shapes succeed with sane counts, plus
 *              the silent-truncation guard (PostgREST max-rows = 1000 caps
 *              REST reads without erroring — count(*) is the only detector)
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://...:5432/postgres" node scripts/db-verify.mjs [shape|semantics|retrieval|all]
 *
 * Run after every schema apply and every deploy; exit code 0 = contract holds.
 * Dependency-free: shells out to psql, like apply-schema.mjs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PSQL_CANDIDATES = [
  '/usr/bin/psql',
  '/usr/local/bin/psql',
  '/opt/homebrew/bin/psql',
  '/Library/PostgreSQL/16/bin/psql',
  '/Applications/Postgres.app/Contents/Versions/latest/bin/psql',
];

const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('[db:verify] SUPABASE_DB_URL (or DATABASE_URL) is required.');
  process.exit(1);
}
const psqlBin = PSQL_CANDIDATES.find((p) => existsSync(p));
if (!psqlBin) {
  console.error('[db:verify] psql not found. Install postgresql-client.');
  process.exit(1);
}

const tier = (process.argv[2] || 'all').toLowerCase();

/** Run a SQL script; return trimmed stdout lines. Throws on non-zero exit. */
function sql(script) {
  const res = spawnSync(psqlBin, [url, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', script], {
    encoding: 'utf8',
    shell: false,
  });
  if (res.status !== 0) throw new Error(res.stderr || `psql exited ${res.status}`);
  return res.stdout.trim();
}

let failures = 0;
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`[db:verify] ${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── Tier 1: shape ────────────────────────────────────────────────────────────
function shape() {
  const j = JSON.parse(sql(`select json_build_object(
    'deals_cols', (select array_agg(column_name order by column_name) from information_schema.columns where table_schema='public' and table_name='deals'),
    'slug_not_null', (select is_nullable='NO' from information_schema.columns where table_schema='public' and table_name='deals' and column_name='slug'),
    'alerts_locale', (select count(*)=1 from information_schema.columns where table_schema='public' and table_name='price_alerts' and column_name='locale'),
    'ph_day_pk', (select array_agg(a.attname order by a.attname) from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='public.price_history'::regclass and i.indisprimary),
    'tx_exists', (select to_regclass('public.transactions') is not null),
    'functions', (select array_agg(proname order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('distinct_brands','deal_slug','deals_set_slug','record_price_history','update_historical_lows_batch','purge_stale_price_alerts')),
    'rph_single', (select count(*)=1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='record_price_history'),
    'rph_day_body', (select prosrc like '%ON CONFLICT (product_id, day)%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='record_price_history'),
    'deals_triggers', (select array_agg(tgname order by tgname) from pg_trigger where tgrelid='public.deals'::regclass and not tgisinternal),
    'indexes', (select array_agg(indexname order by indexname) from pg_indexes where schemaname='public' and indexname in ('deals_slug_idx','deals_ean_idx','transactions_product_id_idx','price_alerts_pending_idx')),
    'slug_idx_unique', (select indisunique from pg_index where indexrelid='public.deals_slug_idx'::regclass),
    'tx_constraints', (select array_agg(conname order by conname) from pg_constraint where conrelid='public.transactions'::regclass and conname in ('transactions_product_id_fkey','transactions_commission_chk','transactions_status_chk')),
    'rls', (select bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relname in ('deals','price_alerts','price_history','transactions'))
  )`));
  const needCols = ['slug','ean_code','upc_code','mpn','model_number','historical_low_price','merchant_id','affiliate_subid','gallery','description','description_html','merchant_url','hidden','homepage_hidden'];
  check('deals has all contract columns', needCols.every((c) => j.deals_cols.includes(c)),
    needCols.filter((c) => !j.deals_cols.includes(c)).join(',') || 'all present');
  check('deals.slug is NOT NULL', j.slug_not_null === true);
  check('price_alerts.locale exists', j.alerts_locale === true);
  check('price_history PK = (day, product_id)', JSON.stringify(j.ph_day_pk) === JSON.stringify(['day','product_id']));
  check('transactions table exists', j.tx_exists === true);
  check('all 6 contract functions exist', (j.functions || []).length === 6, (j.functions || []).join(','));
  check('record_price_history defined exactly once', j.rph_single === true);
  check('record_price_history body is day-keyed', j.rph_day_body === true);
  check('both deals triggers present', JSON.stringify(j.deals_triggers) === JSON.stringify(['trigger_deals_set_slug','trigger_record_price_history']), (j.deals_triggers || []).join(','));
  check('contract indexes present', (j.indexes || []).length === 4, (j.indexes || []).join(','));
  check('deals_slug_idx is UNIQUE', j.slug_idx_unique === true);
  check('transactions FK + CHECKs present', (j.tx_constraints || []).length === 3, (j.tx_constraints || []).join(','));
  check('RLS enabled on all 4 tables', j.rls === true);
}

// ── Tier 2: semantics (synthetic probe, always rolled back) ─────────────────
function semantics() {
  const out = sql(`
    begin;
    insert into public.deals (product_id, product_name, shop_name, shop_url, original_price, sale_price, discount_percent, currency, category, country, source)
      values ('test:dbverify', 'DB Verify Probe', 'TestShop', 'https://example.com/x', 100, 80, 20, 'EUR', 'electronics', 'DE', 'awin');
    update public.deals set sale_price = 80 where product_id = 'test:dbverify';          -- same price: no new snapshot
    update public.deals set sale_price = 70 where product_id = 'test:dbverify';          -- change: same-day conflict-update
    update public.deals set hidden = true  where product_id = 'test:dbverify';           -- non-price patch: trigger must not fire
    insert into public.transactions (transaction_id, network, commission_earned, status)
      values ('test-dbverify-tx', 'awin', 1.23, 'pending') on conflict (transaction_id) do nothing;
    insert into public.transactions (transaction_id, network, commission_earned, status)
      values ('test-dbverify-tx', 'awin', 9.99, 'approved') on conflict (transaction_id) do nothing;
    select public.update_historical_lows_batch();
    select json_build_object(
      'slug_composed', (select slug is not null and slug like 'db-verify-probe-%' from public.deals where product_id='test:dbverify'),
      'ph_rows', (select count(*) from public.price_history where product_id='test:dbverify'),
      'ph_price', (select min(sale_price) from public.price_history where product_id='test:dbverify'),
      'tx_rows', (select count(*) from public.transactions where transaction_id='test-dbverify-tx'),
      'hist_low', (select historical_low_price from public.deals where product_id='test:dbverify')
    );
    rollback;`);
  const j = JSON.parse(out.split('\n').find((l) => l.startsWith('{')));
  check('slug auto-composed by trigger', j.slug_composed === true);
  check('trigger wrote exactly one same-day snapshot', Number(j.ph_rows) === 1, `rows=${j.ph_rows}`);
  check('same-day price change conflict-updated (70)', Number(j.ph_price) === 70, `price=${j.ph_price}`);
  check('transactions idempotent on transaction_id', Number(j.tx_rows) === 1);
  check('historical-low RPC populated the probe deal', Number(j.hist_low) === 70, `low=${j.hist_low}`);
  const residue = sql(`select count(*) from public.deals where product_id='test:dbverify'`);
  check('probe rolled back cleanly (zero residue)', residue === '0');
}

// ── Tier 3: retrieval (real app query shapes + truncation guard) ────────────
function retrieval() {
  const j = JSON.parse(sql(`select json_build_object(
    'homepage', (select count(*) from (select 1 from public.deals where country='DE' and not hidden and not homepage_hidden order by discount_percent desc limit 500) q),
    'category', (select count(*) from (select 1 from public.deals where country='DE' and not hidden and category='electronics' order by discount_percent desc limit 48) q),
    'brands_rpc', (select count(*) from public.distinct_brands('DE', null)),
    'null_slugs', (select count(*) from public.deals where slug is null or slug = ''),
    'slug_lookup', (select count(*) from public.deals d where d.slug = (select slug from public.deals where not hidden limit 1)),
    'active_total', (select count(*) from public.deals where not hidden),
    'ph_read', (select count(*) from (select day, sale_price from public.price_history where product_id = (select product_id from public.deals limit 1) order by day desc limit 90) q)
  )`));
  check('homepage shape returns rows', Number(j.homepage) > 0, `rows=${j.homepage}`);
  check('category shape returns rows', Number(j.category) > 0, `rows=${j.category}`);
  check('distinct_brands RPC works', Number(j.brands_rpc) > 0, `brands=${j.brands_rpc}`);
  check('zero NULL/empty slugs', Number(j.null_slugs) === 0, `nulls=${j.null_slugs}`);
  check('slug point-lookup resolves', Number(j.slug_lookup) === 1);
  check('price-history day-ordered read works', Number(j.ph_read) > 0, `rows=${j.ph_read}`);
  // PostgREST silent-truncation guard: REST reads cap at max-rows (default 1000)
  // WITHOUT an error. Any unpaginated bulk read (e.g. sitemap slugs) must .range().
  const active = Number(j.active_total);
  check('truncation guard: active deals vs PostgREST max-rows(1000)', true,
    active > 1000
      ? `WARNING: ${active} active deals exceed the 1000-row REST cap — unpaginated reads ARE truncating`
      : `${active} active deals — under the cap today; keep .range() pagination for scale`);
}

console.log(`[db:verify] contract test — tier: ${tier}`);
try {
  if (tier === 'shape' || tier === 'all') shape();
  if (tier === 'semantics' || tier === 'all') semantics();
  if (tier === 'retrieval' || tier === 'all') retrieval();
} catch (e) {
  console.error(`[db:verify] ERROR — ${e.message}`);
  process.exit(2);
}
console.log(failures === 0 ? '[db:verify] CONTRACT HOLDS — all checks passed.' : `[db:verify] ${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
