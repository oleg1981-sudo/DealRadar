import { describe, it, expect } from 'vitest';
// Watchdog core is a dependency-free CJS script-lib; tests live in src/ (vitest include).
import { parseCsv, parseAdvertiserId, feedAgeDays, buildCoverageReport, formatCoverage } from '../../../scripts/lib/coverage.cjs';

const NOW = new Date('2026-07-19T05:00:00Z');

function feed(over: Record<string, string> = {}) {
  return {
    'Advertiser ID': '122456', 'Advertiser Name': 'ROCKBROS', 'Primary Region': 'DE',
    'Membership Status': 'active', 'Datafeed Format': 'Google', 'Feed ID': 'F2308',
    'Feed Name': '', Language: 'German', Vertical: 'Retail',
    'Last Imported': '2026-07-18 06:00:00', 'Last Checked': '2026-07-19 06:00:00',
    'No of products': '5109', URL: 'https://example/feed.csv.gz',
    ...over,
  };
}

describe('parseCsv', () => {
  it('parses quoted fields with embedded commas and strips BOM', () => {
    const rows = parseCsv('﻿A,B\n"x, y",2\n');
    expect(rows).toEqual([{ A: 'x, y', B: '2' }]);
  });
  it('handles escaped quotes and CRLF', () => {
    const rows = parseCsv('A,B\r\n"say ""hi""",2\r\n');
    expect(rows[0].A).toBe('say "hi"');
  });
});

describe('parseAdvertiserId / feedAgeDays', () => {
  it('extracts the v2 advertiser id, rejects v1 ids', () => {
    expect(parseAdvertiserId('awin:DE:adv122456:49536796033369')).toBe('122456');
    expect(parseAdvertiserId('awin:31184682119')).toBeNull();
  });
  it('computes whole-day ages and tolerates garbage', () => {
    expect(feedAgeDays('2026-07-16 05:00:00', NOW)).toBe(3);
    expect(feedAgeDays('', NOW)).toBeNull();
  });
});

describe('buildCoverageReport', () => {
  const SUMMARY = { ranAt: '2026-07-19T03:10:00Z', feeds: [{ feed: 'F2308', advertiser: 'ROCKBROS', scanned: 5109, kept: 4519 }] };

  it('green: consumable, fresh, populated', () => {
    const r = buildCoverageReport({
      feedRows: [feed()],
      dealRows: [
        { product_id: 'awin:DE:adv122456:1', merchant_id: null, shop_name: 'ROCKBROS', hidden: true },
        { product_id: 'awin:DE:adv122456:2', merchant_id: null, shop_name: 'ROCKBROS', hidden: false },
      ],
      ingestSummary: SUMMARY, now: NOW,
    });
    expect(r.advertisers[0]).toMatchObject({ status: 'green', populated: 2, live: 1 });
    expect(r.reds).toBe(0);
  });

  it('red: consumable GOOGLE feed but zero DB rows (v2 always populates — genuine gap)', () => {
    const r = buildCoverageReport({ feedRows: [feed()], dealRows: [], ingestSummary: SUMMARY, now: NOW });
    expect(r.advertisers[0].status).toBe('red');
    expect(r.advertisers[0].detail).toContain('0 rows');
  });

  it('yellow: legacy advertiser scanned but nothing discounted (v1 keeps deals only)', () => {
    const r = buildCoverageReport({
      feedRows: [feed({ 'Advertiser ID': '11920', 'Advertiser Name': 'VIDEOBUSTER DE', 'Datafeed Format': 'Awin' })],
      dealRows: [],
      ingestSummary: { ...SUMMARY, legacyScannedById: { '11920': 4321 } },
      now: NOW,
    });
    expect(r.advertisers[0].status).toBe('yellow');
    expect(r.advertisers[0].detail).toContain('4321');
    expect(r.reds).toBe(0);
  });

  it('red: legacy advertiser absent from the combined feed (0 scanned)', () => {
    const r = buildCoverageReport({
      feedRows: [feed({ 'Advertiser ID': '11920', 'Advertiser Name': 'VIDEOBUSTER DE', 'Datafeed Format': 'Awin' })],
      dealRows: [],
      ingestSummary: { ...SUMMARY, legacyScannedById: {} },
      now: NOW,
    });
    expect(r.advertisers[0].status).toBe('red');
  });

  it('red: consumed feed stale past the threshold (the ROCKBROS-legacy failure mode)', () => {
    const r = buildCoverageReport({
      feedRows: [feed({ 'Last Imported': '2026-05-15 10:00:00' })],
      dealRows: [{ product_id: 'awin:DE:adv122456:1', merchant_id: null, shop_name: 'ROCKBROS', hidden: false }],
      ingestSummary: SUMMARY, now: NOW,
    });
    expect(r.advertisers[0].status).toBe('red');
    expect(r.advertisers[0].detail).toContain('stale');
  });

  it('red: per-feed ingest error is surfaced', () => {
    const r = buildCoverageReport({
      feedRows: [feed()],
      dealRows: [{ product_id: 'awin:DE:adv122456:1', merchant_id: null, shop_name: 'ROCKBROS', hidden: false }],
      ingestSummary: { ranAt: 'x', feeds: [{ feed: 'F2308', advertiser: 'ROCKBROS', scanned: 0, kept: 0, error: 'HTTP 500' }] },
      now: NOW,
    });
    expect(r.advertisers[0].status).toBe('red');
    expect(r.advertisers[0].detail).toContain('HTTP 500');
  });

  it('yellow: language-policy exclusion (English-only Google feed, non-DE Primary Region) is not an alert', () => {
    // Hollyland fixture updated: Primary Region = 'GB' so it remains a valid
    // yellow case under the new same-market English rule (2026-07 quick win).
    const r = buildCoverageReport({
      feedRows: [feed({ 'Advertiser ID': '128051', 'Advertiser Name': 'Hollyland DE', Language: 'English', 'Primary Region': 'GB' })],
      dealRows: [], ingestSummary: SUMMARY, now: NOW,
    });
    expect(r.advertisers[0].status).toBe('yellow');
    expect(r.reds).toBe(0);
  });

  it('green: English Google feed with Primary Region DE is consumable (same-market quick win)', () => {
    // Autofull EU (#125332), Hollyland DE (#128051) etc. — English feed, DE market
    const r = buildCoverageReport({
      feedRows: [feed({ 'Advertiser ID': '128051', 'Advertiser Name': 'Hollyland DE', Language: 'English', 'Primary Region': 'DE' })],
      dealRows: [{ product_id: 'awin:DE:adv128051:1', merchant_id: null, shop_name: 'Hollyland DE', hidden: true }],
      ingestSummary: { ...SUMMARY, feeds: [{ feed: 'F2308', advertiser: 'Hollyland DE', scanned: 800, kept: 700 }] },
      now: NOW,
    });
    expect(r.advertisers[0].status).toBe('green');
    expect(r.reds).toBe(0);
  });

  it('green: English legacy (Awin-format) feed with Primary Region DE is consumable (same-market quick win)', () => {
    // MagazinMomente DE (#110910), logo-matten DE (#58127), Liki24 DE (#114828) etc.
    const r = buildCoverageReport({
      feedRows: [feed({ 'Advertiser ID': '110910', 'Advertiser Name': 'MagazinMomente DE', Language: 'English', 'Primary Region': 'DE', 'Datafeed Format': 'Awin', 'Feed ID': 'F9910', URL: '' })],
      dealRows: [],
      ingestSummary: { ranAt: 'x', feeds: [{ feed: 'F9910', advertiser: 'MagazinMomente DE', scanned: 1200, kept: 0 }], legacyScannedById: { '110910': 1200 } },
      now: NOW,
    });
    // Legacy: scanned > 0 but none currently discounted — yellow (not red, not green)
    expect(r.advertisers[0].status).toBe('yellow');
    expect(r.advertisers[0].detail).toContain('scanned 1200');
    expect(r.reds).toBe(0);
  });

  it('yellow: English feed with Primary Region US stays excluded (non-DE market)', () => {
    const r = buildCoverageReport({
      feedRows: [feed({ 'Advertiser ID': '82371', 'Advertiser Name': 'Aeternum US', Language: 'English', 'Primary Region': 'US' })],
      dealRows: [], ingestSummary: SUMMARY, now: NOW,
    });
    expect(r.advertisers[0].status).toBe('yellow');
    expect(r.advertisers[0].detail).toContain('no consumable feed');
    expect(r.reds).toBe(0);
  });

  it('yellow: English feed with missing Primary Region stays excluded (defensive default)', () => {
    const r = buildCoverageReport({
      feedRows: [feed({ 'Advertiser ID': '99000', 'Advertiser Name': 'Unknown Market Co', Language: 'English', 'Primary Region': '' })],
      dealRows: [], ingestSummary: SUMMARY, now: NOW,
    });
    expect(r.advertisers[0].status).toBe('yellow');
    expect(r.advertisers[0].detail).toContain('no consumable feed');
    expect(r.reds).toBe(0);
  });

  it('legacy consumption: Awin-format German feed counts via merchant_id; Google feed wins for dual-format', () => {
    const r = buildCoverageReport({
      feedRows: [
        feed({ 'Advertiser ID': '125816', 'Advertiser Name': 'Imou DE', 'Datafeed Format': 'Awin', 'Feed ID': '115907' }),
        feed(), // ROCKBROS Google
        feed({ 'Datafeed Format': 'Awin', 'Feed ID': '115038', 'Last Imported': '2026-05-15 10:00:00' }), // ROCKBROS stale legacy — must be ignored (Google wins)
      ],
      dealRows: [
        { product_id: 'awin:legacy1', merchant_id: '125816', shop_name: 'Imou DE', hidden: false },
        { product_id: 'awin:DE:adv122456:1', merchant_id: null, shop_name: 'ROCKBROS', hidden: false },
      ],
      ingestSummary: { ranAt: 'x', feeds: [
        { feed: 'F2308', advertiser: 'ROCKBROS', scanned: 5109, kept: 4519 },
        { feed: '115907', advertiser: 'Imou DE', scanned: 561, kept: 0 },
      ] }, now: NOW,
    });
    const imou = r.advertisers.find((a) => a.name === 'Imou DE');
    const rockbros = r.advertisers.find((a) => a.name === 'ROCKBROS');
    expect(imou?.status).toBe('green');
    expect(rockbros?.status).toBe('green'); // stale LEGACY feed ignored — Google feed is the consumed one
  });

  it('red: dead-but-historically-populated Google feed (missing from last ingest / empty scan / pass failed)', () => {
    const rows = [{ product_id: 'awin:DE:adv122456:1', merchant_id: null, shop_name: 'ROCKBROS', hidden: true }];
    // Feed absent from summary → red even though populated > 0
    const r1 = buildCoverageReport({ feedRows: [feed()], dealRows: rows, ingestSummary: { ranAt: 'x', feeds: [] }, now: NOW });
    expect(r1.advertisers[0].status).toBe('red');
    expect(r1.advertisers[0].detail).toContain('not consumed');
    // Scanned 0 → red
    const r2 = buildCoverageReport({ feedRows: [feed()], dealRows: rows, ingestSummary: { ranAt: 'x', feeds: [{ feed: 'F2308', advertiser: 'ROCKBROS', scanned: 0, kept: 0 }] }, now: NOW });
    expect(r2.advertisers[0].detail).toContain('EMPTY');
    // Whole enhanced pass failed (enhanced: null) → red, not silence
    const r3 = buildCoverageReport({ feedRows: [feed()], dealRows: rows, ingestSummary: { ranAt: 'x', feeds: null }, now: NOW });
    expect(r3.advertisers[0].detail).toContain('pass failed');
  });

  it('red: blank-URL Google feed is not consumable; escalates when rows exist (vocab drift)', () => {
    const rows = [{ product_id: 'awin:DE:adv122456:1', merchant_id: null, shop_name: 'ROCKBROS', hidden: false }];
    const r = buildCoverageReport({ feedRows: [feed({ URL: '' })], dealRows: rows, ingestSummary: SUMMARY, now: NOW });
    expect(r.advertisers[0].status).toBe('red');
    expect(r.advertisers[0].detail).toContain('drift');
  });

  it('red: API-joined advertiser whose feed-list membership went non-active (divergence)', () => {
    const r = buildCoverageReport({
      feedRows: [feed({ 'Membership Status': 'Not Joined' })],
      dealRows: [],
      joinedProgrammes: [{ programme_id: 122456, name: 'ROCKBROS' }],
      ingestSummary: SUMMARY, now: NOW,
    });
    const rb = r.advertisers.find((a) => a.id === '122456');
    expect(rb?.status).toBe('red');
    expect(rb?.detail).toContain('diverged');
  });

  it('coverageFingerprint is stable across identical red sets and changes with them', async () => {
    const { coverageFingerprint } = await import('../../../scripts/lib/coverage.cjs');
    const mk = (feeds: ReturnType<typeof feed>[]) => buildCoverageReport({ feedRows: feeds, dealRows: [], ingestSummary: SUMMARY, now: NOW });
    const a = coverageFingerprint(mk([feed()]));
    const b = coverageFingerprint(mk([feed()]));
    const c = coverageFingerprint(mk([feed(), feed({ 'Advertiser ID': '9', 'Advertiser Name': 'X' })]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('flags joined-but-no-feed programmes and missing ingest summary; counts soft membership', () => {
    const r = buildCoverageReport({
      feedRows: [feed()],
      dealRows: [
        { product_id: 'awin:DE:adv122456:1', merchant_id: null, shop_name: 'ROCKBROS', hidden: false },
        { product_id: 'awin:999', merchant_id: '58127', shop_name: 'Kuishi', hidden: false },
      ],
      joinedProgrammes: [{ programme_id: 99999, name: 'NoFeed GmbH' }],
      ingestSummary: null, now: NOW,
    });
    expect(r.summaryMissing).toBe(true);
    expect(r.reds).toBeGreaterThanOrEqual(1); // summary-missing counts as red
    expect(r.joinedNoFeed).toHaveLength(1);
    expect(r.softMerchants).toBe(1);
    const md = formatCoverage(r);
    expect(md).toContain('No ingest summary');
    expect(md).toContain('NoFeed GmbH');
  });
});
