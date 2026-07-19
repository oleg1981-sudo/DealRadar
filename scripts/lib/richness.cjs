// PDP richness invariants [FR-5.3/EC-19, docs/specs/pdp-full-content §8] —
// the SINGLE source of truth for TH-1..TH-3 shared by the acceptance harness
// and the cost-guardrail budgets so the two can never diverge.
//
// Thresholds are user-resolved COMPLETENESS INVARIANTS (Q-8, 2026-07-19):
//   TH-1  every visible deal has ≥1 image (1 image = complete; 0 = broken)
//   TH-2  every visible deal has a non-empty title
//   TH-3  every visible deal has visible description data (any = pass)
// Violation budgets default to 0 and are env-overridable ONLY so the failure
// path is provable (EC-19 mutation: RICHNESS_MAX_TH3=-1 must exit non-zero).
'use strict';

const bound = (name, dflt) => {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : dflt;
};

/** rows: [{product_name, description, description_html, gallery, image_url}] (visible only). */
function computeRichness(rows) {
  let th1 = 0, th2 = 0, th3 = 0, multi = 0;
  for (const r of rows) {
    const hasImage = (Array.isArray(r.gallery) && r.gallery.length > 0) || !!(r.image_url && String(r.image_url).trim());
    const hasTitle = !!(r.product_name && String(r.product_name).trim());
    const hasDesc = !!(r.description && String(r.description).trim()) || !!(r.description_html && String(r.description_html).trim());
    if (!hasImage) th1++;
    if (!hasTitle) th2++;
    if (!hasDesc) th3++;
    if (Array.isArray(r.gallery) && r.gallery.length >= 2) multi++;
  }
  return {
    visible: rows.length,
    th1NoImage: th1,
    th2NoTitle: th2,
    th3NoDesc: th3,
    multiImagePct: rows.length ? Math.round((multi / rows.length) * 100) : 0, // reported, non-gating
  };
}

/** Gate the computed counts against the (default-0) violation budgets.
 *  Returns { pass, failures: [..] }. */
function gateRichness(r, { catalogFloor = 1000 } = {}) {
  const failures = [];
  if (r.visible < catalogFloor) failures.push(`catalog floor: only ${r.visible} visible rows`);
  if (r.th1NoImage > bound('RICHNESS_MAX_TH1', 0)) failures.push(`TH-1: ${r.th1NoImage} visible deals without any image`);
  if (r.th2NoTitle > bound('RICHNESS_MAX_TH2', 0)) failures.push(`TH-2: ${r.th2NoTitle} visible deals without a title`);
  if (r.th3NoDesc > bound('RICHNESS_MAX_TH3', 0)) failures.push(`TH-3: ${r.th3NoDesc} visible deals without description data`);
  return { pass: failures.length === 0, failures };
}

module.exports = { computeRichness, gateRichness };
