// Merchant-image host gate [FR-2.2 tripwire class] — watchdog-side matcher.
//
// The allowlist has ONE source of truth: scripts/lib/image-hosts.json.
// next.config.mjs builds next/image remotePatterns from it, SmartImage gates on
// it via src/lib/utils/image-hosts.ts, and the coverage watchdog checks deal
// rows against it here. Earlier this module's job was done by regex-scraping
// `hostname: '...'` literals out of next.config.mjs; when the list moved into
// JSON those literals vanished, the scrape returned zero patterns, and the
// watchdog reported EVERY image host as uncovered. Read the list, never the
// config that consumes it.
//
// Dependency-free; consumed by scripts/awin-programmes-sync.cjs.
'use strict';

const { hosts } = require('./image-hosts.json');

/** `**.example.com` matches example.com and any subdomain; else exact host. */
function hostAllowed(host, patterns = hosts) {
  return patterns.some((p) =>
    p.startsWith('**.') ? host === p.slice(3) || host.endsWith(p.slice(2)) : host === p);
}

/**
 * Deal image hosts NOT covered by the allowlist → Map(host → row count).
 * An uncovered host means next/image can't optimize it (SmartImage degrades to
 * a plain <img>), so it is a real — but non-crashing — coverage signal.
 *
 * dealRows  [{ image_url, gallery }]
 */
function uncoveredImageHosts(dealRows, patterns = hosts) {
  const out = new Map();
  for (const d of dealRows) {
    for (const u of [d.image_url, ...(Array.isArray(d.gallery) ? d.gallery : [])]) {
      if (!u) continue;
      try {
        const h = new URL(u).host;
        if (!hostAllowed(h, patterns)) out.set(h, (out.get(h) || 0) + 1);
      } catch { /* malformed URL — ingest filters these; ignore */ }
    }
  }
  return out;
}

module.exports = { hosts, hostAllowed, uncoveredImageHosts };
