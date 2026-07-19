/**
 * Bridge to the pipeline's single source of truth for which feed attrs
 * surface [FR-4.1/FR-5.1] — the visible block, JSON-LD additionalProperty
 * and the /md agent surface must always agree (three-surface parity; the
 * gate itself lives in scripts/lib/feed-attrs.cjs beside the collector).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderableAttrs: gate } = require('../../../scripts/lib/feed-attrs.cjs') as {
  renderableAttrs: (attrs: Record<string, string> | null | undefined) => Record<string, string>;
};

export function renderableAttrs(attrs: Record<string, string> | null | undefined): Record<string, string> {
  return gate(attrs);
}
