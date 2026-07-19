// Brand normalization at ingest (FR-4.3/EC-16, docs/specs/pdp-full-content).
//
// Feed pollution is a small CLOSED set of aliases (suffixes "ROCKBROS-EU",
// typos "ROCKBORS", case variants "OMIDI", country forms "Sunshare
// Deutschland"), so a census-seeded exact-match table beats a token heuristic.
// Whole-value match only, case-insensitive; anything not in the map passes
// through trimmed but otherwise UNCHANGED — never invent a canonical form.
// The exceptions list pins verified-legit brands that merely look polluted
// (e.g. 'aosu' lowercase styling) so they can never be mapped by mistake.
//
// Dependency-free (Node built-ins only), same contract as description.cjs.
'use strict';

const { map, exceptions } = require('./brand-map.json');

// Case-insensitive indexes, built once at require time.
const MAP = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
const EXCEPTIONS = new Set(exceptions.map((e) => e.toLowerCase()));

/** Feed brand string → canonical brand. Unknown values pass through trimmed;
 *  empty/nullish input → ''. */
function normalizeBrand(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (EXCEPTIONS.has(s.toLowerCase())) return s;
  return MAP.get(s.toLowerCase()) ?? s;
}

module.exports = { normalizeBrand };
