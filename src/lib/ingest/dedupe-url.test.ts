// URL-level canonicalisation — one merchant product page publishes ONE row.
// Root cause (issue #27): the ingest deduped by product_id only, so an
// advertiser listing one catalogue in two feeds (Lyra Pet DE #115425: feeds
// 102589 + 104303) published two visible rows for the same merchant_url at
// two different prices — 120 groups / 240 rows in production 2026-07-24.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { planUrlCanonicalisation, canonicalUrlKey } = require('../../../scripts/lib/dedupe-url.cjs');

const NOW = new Date('2026-07-24T05:45:00Z');

/** A normalized ingest row, with only the fields the rule reads. */
const row = (over: Record<string, unknown> = {}) => ({
  product_id: 'awin:1',
  merchant_url: 'https://lyra-pet.de/1-kg-Lyra-Pet-Entenhaelse',
  merchant_id: '115425',
  merchant_sku: '04809-001',
  sale_price: 20.99,
  discount_percent: 30,
  ...over,
});

/** feedMeta entry: which feed a row came from, and that feed's AWIN import date. */
const meta = (pairs: [string, { feedId: string; lastImported: string | null }][]) => new Map(pairs);

const plan = (rows: unknown[], opts: Record<string, unknown> = {}) =>
  planUrlCanonicalisation(rows, { feedMeta: new Map(), existing: new Map(), now: NOW, ...opts });

describe('canonicalUrlKey', () => {
  it('ignores case of scheme+host, trailing slash and fragment', () => {
    expect(canonicalUrlKey('HTTPS://Lyra-Pet.DE/Foo/#frag')).toBe(canonicalUrlKey('https://lyra-pet.de/Foo'));
  });

  it('keeps the path case-sensitive (merchant paths are case-significant)', () => {
    expect(canonicalUrlKey('https://lyra-pet.de/Foo')).not.toBe(canonicalUrlKey('https://lyra-pet.de/foo'));
  });

  it('KEEPS the query string — variant params identify distinct products', () => {
    // Mediakos WooCommerce variants (?attribute_pa_menge=3x1000-g) are genuinely
    // different products at different prices; merging them would be the exact
    // failure the feed-freshness design calls "confidently wrong".
    expect(canonicalUrlKey('https://x.de/p?attribute_pa_menge=3x1000-g'))
      .not.toBe(canonicalUrlKey('https://x.de/p?attribute_pa_menge=1x500-g'));
  });

  it('returns null for empty/unusable urls so they can never group together', () => {
    expect(canonicalUrlKey('')).toBeNull();
    expect(canonicalUrlKey(null)).toBeNull();
    expect(canonicalUrlKey('   ')).toBeNull();
  });
});

describe('planUrlCanonicalisation — what may be collapsed', () => {
  it('collapses two rows proven to be one product (same url + merchant + sku)', () => {
    const a = row({ product_id: 'awin:41396137836', sale_price: 20.99 });
    const b = row({ product_id: 'awin:41808323344', sale_price: 21.17 });
    const r = plan([a, b]);
    expect(r.winners).toHaveLength(1);
    expect(r.losers).toHaveLength(1);
    expect(r.stats.collapsed).toBe(1);
    expect(r.losers[0].duplicateOf).toBe(r.winners[0].product_id);
  });

  it('does NOT collapse rows with differing merchant_sku (variants on one page)', () => {
    const r = plan([row({ product_id: 'awin:1', merchant_sku: 'A' }), row({ product_id: 'awin:2', merchant_sku: 'B' })]);
    expect(r.winners).toHaveLength(2);
    expect(r.losers).toHaveLength(0);
  });

  it('does NOT collapse when a merchant_sku is missing — sameness is unproven', () => {
    const r = plan([row({ product_id: 'awin:1', merchant_sku: null }), row({ product_id: 'awin:2', merchant_sku: null })]);
    expect(r.winners).toHaveLength(2);
    expect(r.losers).toHaveLength(0);
  });

  it('does NOT collapse across advertisers — separate programmes, separate commission', () => {
    const r = plan([row({ product_id: 'awin:1', merchant_id: '115425' }), row({ product_id: 'awin:2', merchant_id: '999' })]);
    expect(r.winners).toHaveLength(2);
  });

  it('never groups rows that have no merchant_url', () => {
    const r = plan([row({ product_id: 'awin:1', merchant_url: null }), row({ product_id: 'awin:2', merchant_url: '' })]);
    expect(r.winners).toHaveLength(2);
  });
});

describe('planUrlCanonicalisation — which row wins', () => {
  const twoFeeds = (over: Record<string, unknown> = {}) => [
    row({ product_id: 'awin:cheap', sale_price: 20.99 }),
    row({ product_id: 'awin:pricey', sale_price: 21.17, ...over }),
  ];

  it('a live-verified row beats an unverified one, whatever the feeds say', () => {
    // The verifier fetched the real page; that evidence outranks every heuristic.
    const r = plan(twoFeeds(), {
      feedMeta: meta([
        ['awin:cheap', { feedId: '102589', lastImported: '2026-07-24 03:00:00' }],
        ['awin:pricey', { feedId: '104303', lastImported: '2026-07-24 03:00:00' }],
      ]),
      existing: new Map([['awin:pricey', { last_verify_outcome: 'ok-live' }]]),
    });
    expect(r.winners[0].product_id).toBe('awin:pricey');
  });

  it('a row the verifier declared DEAD never wins — only "ok-live" is a win', () => {
    // `last_verify_outcome` is not a boolean "was verified": 'gone',
    // 'out-of-stock' and 'no-discount' are all written together with
    // hidden:true. Treating any verdict as a win let a 404'd row outrank a
    // live one, hide it as a duplicate, and take the whole page dark.
    for (const dead of ['gone', 'out-of-stock', 'no-discount']) {
      const r = plan(twoFeeds(), {
        existing: new Map([['awin:cheap', { hidden: true, last_verify_outcome: dead }]]),
      });
      expect(r.winners[0].product_id).toBe('awin:pricey');
      expect(r.losers).toHaveLength(1);
    }
  });

  it('a row hidden by another owner never wins — electing it would darken the page', () => {
    // Stale-hide / TH-3 / the hidden-until-proven split all hide without a
    // verdict, and this rule cannot un-hide them (no duplicate_of marker).
    const r = plan(twoFeeds(), {
      existing: new Map([['awin:cheap', { hidden: true, duplicate_of: null, last_verify_outcome: null }]]),
    });
    expect(r.winners[0].product_id).toBe('awin:pricey');
  });

  it('leaves a group alone when every candidate is already non-publishing', () => {
    // Nothing is on display to fix, and hiding one so a dead row can "win"
    // would darken the page permanently.
    const r = plan(twoFeeds(), {
      existing: new Map([
        ['awin:cheap', { hidden: true, last_verify_outcome: 'gone' }],
        ['awin:pricey', { hidden: true, last_verify_outcome: 'out-of-stock' }],
      ]),
    });
    expect(r.losers).toHaveLength(0);
    expect(r.stats.deadGroups).toBe(1);
    expect(r.winners).toHaveLength(2); // untouched, left to the verifier
  });

  it('prefers the fresher feed when one is fresh and the other is days behind', () => {
    const r = plan(twoFeeds(), {
      feedMeta: meta([
        ['awin:cheap', { feedId: '102589', lastImported: '2026-06-20 03:00:00' }], // 34 days stale
        ['awin:pricey', { feedId: '104303', lastImported: '2026-07-24 03:00:00' }],
      ]),
    });
    expect(r.winners[0].product_id).toBe('awin:pricey');
  });

  it('ignores freshness when BOTH feeds are long stale — "less stale" is not evidence', () => {
    // The real Lyra Pet state: the watchdog reports the fresher of the two at
    // 16 days. A 16-day-old price and a 40-day-old price are both wrong, so a
    // relative gap must not decide 122 published prices. Provenance decides.
    const r = plan(twoFeeds(), {
      feedMeta: meta([
        ['awin:cheap', { feedId: '102589', lastImported: '2026-06-14 03:00:00' }], // 40 days
        ['awin:pricey', { feedId: '104303', lastImported: '2026-07-08 03:00:00' }], // 16 days — fresher
      ]),
    });
    expect(r.winners[0].product_id).toBe('awin:cheap');
  });

  it('elects the same winner regardless of what time of day the run happens', () => {
    // Flooring each row's AGE (measured from now) makes the difference between
    // two fixed stamps flip as the clock crosses each stamp's day boundary, so
    // the winner would depend on the run's wall-clock hour and flap nightly.
    const feedMetaFixed = meta([
      ['awin:cheap', { feedId: '102589', lastImported: '2026-07-22 02:00:00' }],
      ['awin:pricey', { feedId: '104303', lastImported: '2026-07-22 04:00:00' }],
    ]);
    const at = (iso: string) => plan(twoFeeds(), { feedMeta: feedMetaFixed, now: new Date(iso) }).winners[0].product_id;
    const hours = ['2026-07-24T01:30:00Z', '2026-07-24T03:15:00Z', '2026-07-24T05:45:00Z', '2026-07-24T23:50:00Z'];
    expect(new Set(hours.map(at)).size).toBe(1);
  });

  it('same-day imports tie on freshness, so the lowest feed ID wins', () => {
    // This is the live Lyra Pet case: both feeds regenerate nightly, and feed
    // 102589 is the one whose price matches the shop's own product page.
    const r = plan(twoFeeds(), {
      feedMeta: meta([
        ['awin:cheap', { feedId: '102589', lastImported: '2026-07-24 02:00:00' }],
        ['awin:pricey', { feedId: '104303', lastImported: '2026-07-24 04:00:00' }],
      ]),
    });
    expect(r.winners[0].product_id).toBe('awin:cheap');
  });

  it('a future import stamp is clock skew, not extra freshness', () => {
    // Unclamped, a negative age would outrank every same-day feed and hand the
    // page to whichever feed's clock ran fast.
    const r = plan(twoFeeds(), {
      feedMeta: meta([
        ['awin:cheap', { feedId: '102589', lastImported: '2026-07-24 02:00:00' }],
        ['awin:pricey', { feedId: '104303', lastImported: '2026-07-24 21:00:00' }], // after `now`
      ]),
    });
    expect(r.winners[0].product_id).toBe('awin:cheap');
  });

  it('a feed with an unknown import date loses to one with a known date', () => {
    const r = plan(twoFeeds(), {
      feedMeta: meta([
        ['awin:cheap', { feedId: '999999', lastImported: null }],
        ['awin:pricey', { feedId: '104303', lastImported: '2026-07-24 03:00:00' }],
      ]),
    });
    expect(r.winners[0].product_id).toBe('awin:pricey');
  });

  it('falls back to lowest product_id when no feed metadata exists at all', () => {
    const r = plan([row({ product_id: 'awin:200' }), row({ product_id: 'awin:100' })]);
    expect(r.winners[0].product_id).toBe('awin:100');
  });

  it('does NOT use price to pick a winner', () => {
    // "Cheapest wins" would fit today's accident (the stale feed happens to be
    // the pricier one) and biases toward advertising below the shop's real
    // price — the user-harmful direction. The cheaper row here must LOSE.
    const r = plan(
      [row({ product_id: 'awin:a', sale_price: 5 }), row({ product_id: 'awin:b', sale_price: 50 })],
      {
        feedMeta: meta([
          ['awin:a', { feedId: '104303', lastImported: '2026-07-24 03:00:00' }],
          ['awin:b', { feedId: '102589', lastImported: '2026-07-24 03:00:00' }],
        ]),
      },
    );
    expect(r.winners[0].product_id).toBe('awin:b');
    expect(r.winners[0].sale_price).toBe(50);
  });

  it('is stable: the same input always elects the same winner', () => {
    const rows = [row({ product_id: 'awin:b' }), row({ product_id: 'awin:a' }), row({ product_id: 'awin:c' })];
    const first = plan(rows).winners[0].product_id;
    expect(plan([...rows].reverse()).winners[0].product_id).toBe(first);
  });
});

describe('planUrlCanonicalisation — hide, do not drop', () => {
  it('marks the loser for an explicit hide so a wrong price stops publishing now', () => {
    // Dropping the loser from the payload would leave the visible stale row in
    // the DB until the 3-day stale-hide fired — three more days of a wrong price.
    const r = plan([row({ product_id: 'awin:a' }), row({ product_id: 'awin:b' })]);
    expect(r.losers[0]).toMatchObject({ duplicateOf: 'awin:a' });
    expect(r.losers[0].row.product_id).toBe('awin:b');
  });

  it('still collapses to ONE row when both rivals are verified live', () => {
    // Two live-verified rows are still two entries for one product page. An
    // earlier draft published both, which let the verifier's un-hide walk the
    // fix back to the original bug within a few nights.
    const r = plan([row({ product_id: 'awin:a' }), row({ product_id: 'awin:b' })], {
      existing: new Map([
        ['awin:a', { last_verify_outcome: 'ok-live' }],
        ['awin:b', { last_verify_outcome: 'ok-live' }],
      ]),
    });
    expect(r.winners).toHaveLength(1);
    expect(r.losers).toHaveLength(1);
    expect(r.losers[0].duplicateOf).toBe(r.winners[0].product_id); // recoverable
  });

  it('does not flap when the verifier un-hides a demoted duplicate', () => {
    // The verifier sweeps hidden rows and un-hides any it finds live. The
    // winner must not change just because the loser gained a verdict.
    const feedMeta = meta([
      ['awin:a', { feedId: '102589', lastImported: '2026-07-24 03:00:00' }],
      ['awin:b', { feedId: '104303', lastImported: '2026-07-24 03:00:00' }],
    ]);
    const rows = [row({ product_id: 'awin:a' }), row({ product_id: 'awin:b' })];
    const before = plan(rows, { feedMeta }).winners[0].product_id;
    const afterVerifierTouched = plan(rows, {
      feedMeta,
      existing: new Map([
        ['awin:a', { last_verify_outcome: 'ok-live' }],
        ['awin:b', { hidden: false, duplicate_of: 'awin:a', last_verify_outcome: 'ok-live' }],
      ]),
    }).winners[0].product_id;
    expect(afterVerifierTouched).toBe(before);
  });

  it('restores a row that was duplicate-hidden and is now the winner', () => {
    // The rival feed dropped this product, so the survivor must come back —
    // never-capping coverage is a standing rule.
    const r = plan([row({ product_id: 'awin:b' })], {
      existing: new Map([['awin:b', { hidden: true, duplicate_of: 'awin:a', last_verify_outcome: null }]]),
    });
    expect(r.restores.map((x: { product_id: string }) => x.product_id)).toEqual(['awin:b']);
    expect(r.winners).toHaveLength(0); // restores are a disjoint payload group
  });

  it('does NOT restore a row with no discount — that is the hidden-until-proven split, not ours', () => {
    // An enhanced row inserted HIDDEN at discount 0 could become a duplicate
    // loser and then win its page back. Restoring it would publish a non-deal
    // on a deal site without any verifier-proven discount.
    const r = plan([row({ product_id: 'awin:b', discount_percent: 0 })], {
      existing: new Map([['awin:b', { hidden: true, duplicate_of: 'awin:a', last_verify_outcome: null }]]),
    });
    expect(r.restores).toHaveLength(0);
  });

  it('counts URL collisions it refused to collapse, so a no-op is not silent', () => {
    // Differing SKUs on one URL are variants, not duplicates — but "found
    // nothing" and "refused to act" must stay distinguishable in the metric.
    const r = plan([row({ product_id: 'awin:1', merchant_sku: 'A' }), row({ product_id: 'awin:2', merchant_sku: 'B' })]);
    expect(r.stats.refusedCollisions).toBe(1);
    expect(r.stats.collapsed).toBe(0);
  });

  it('does NOT restore a row the verifier hid on its own evidence', () => {
    const r = plan([row({ product_id: 'awin:b' })], {
      existing: new Map([['awin:b', { hidden: true, duplicate_of: 'awin:a', last_verify_outcome: 'out-of-stock' }]]),
    });
    expect(r.restores).toHaveLength(0);
    expect(r.winners).toHaveLength(1);
  });

  it('does NOT restore a row that is still a loser', () => {
    const r = plan([row({ product_id: 'awin:a' }), row({ product_id: 'awin:b' })], {
      existing: new Map([['awin:b', { hidden: true, duplicate_of: 'awin:a', last_verify_outcome: null }]]),
    });
    expect(r.restores).toHaveLength(0);
    expect(r.losers[0].row.product_id).toBe('awin:b');
  });

  it('is idempotent — re-running over an already-canonical DB changes nothing new', () => {
    const rows = [row({ product_id: 'awin:a' }), row({ product_id: 'awin:b' })];
    const existing = new Map([['awin:b', { hidden: true, duplicate_of: 'awin:a', last_verify_outcome: null }]]);
    const first = plan(rows, { existing });
    const second = plan(rows, { existing });
    expect(second.winners.map((w: { product_id: string }) => w.product_id)).toEqual(first.winners.map((w: { product_id: string }) => w.product_id));
    expect(second.losers).toHaveLength(1);
    expect(second.restores).toHaveLength(0);
  });
});
