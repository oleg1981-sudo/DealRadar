/** Types for the coverage watchdog core (see coverage.cjs). */
export interface FeedListRow { [column: string]: string }
export interface DealAttributionRow {
  product_id: string;
  merchant_id: string | null;
  shop_name: string;
  hidden: boolean;
}
export interface JoinedProgramme { programme_id: number | string; name: string }
export interface IngestSummary {
  ranAt?: string;
  feeds?: { feed: string; advertiser: string; format?: string; scanned: number; kept: number; error?: string }[] | null;
  /** pre-2026-07-19 key name (Google entries only) — transition fallback */
  enhanced?: { feed: string; advertiser: string; scanned: number; kept: number; error?: string }[] | null;
  legacyScannedById?: Record<string, number>;
}
export interface CoverageAdvertiser {
  id: string; name: string;
  status: 'red' | 'yellow' | 'green';
  detail: string;
  populated: number; live: number; feeds: number;
}
export interface CoverageReport {
  advertisers: CoverageAdvertiser[];
  joinedNoFeed: JoinedProgramme[];
  summaryMissing: boolean;
  reds: number; yellows: number;
  softMerchants: number; softRows: number;
}
export function parseCsv(text: string): FeedListRow[];
export function parseAdvertiserId(productId: string): string | null;
export function feedAgeDays(lastImported: string, now: Date): number | null;
export function buildCoverageReport(args: {
  feedRows: FeedListRow[];
  dealRows: DealAttributionRow[];
  joinedProgrammes?: JoinedProgramme[];
  ingestSummary?: IngestSummary | null;
  now: Date;
  language?: string;
  staleDays?: number;
}): CoverageReport;
export function formatCoverage(report: CoverageReport, opts?: { language?: string }): string;
export function coverageFingerprint(report: CoverageReport): string;
