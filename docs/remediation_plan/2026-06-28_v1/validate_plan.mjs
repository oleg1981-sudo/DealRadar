#!/usr/bin/env node
// Tier-A verification harness for the DealRadar remediation plan.
// Deterministic checks over plan.json. Exit 0 = all gates pass; non-zero = blocking errors.
// Run: node docs/remediation_plan/2026-06-28_v1/validate_plan.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(here, 'plan.json'), 'utf8'));
const { baseline, requirements, components, tasks, meta } = plan;
const PAT = meta.params.earsPatterns;
const VAGUE = meta.params.vagueRejectList;

const errors = [];
const warnings = [];
const E = (m) => errors.push(m);
const W = (m) => warnings.push(m);

// EARS keyword each pattern's text must contain
const PATTERN_KEYWORD = {
  ubiquitous: /\bThe system SHALL\b/,
  event: /\bWHEN\b[\s\S]*\bTHEN the system SHALL\b/,
  state: /\bWHILE\b[\s\S]*\bthe system SHALL\b/,
  unwanted: /\bIF\b[\s\S]*\bTHEN the system SHALL\b/,
  optional: /\bWHERE\b[\s\S]*\bthe system SHALL\b/,
};

// objective tokens that justify an otherwise-flaggable acceptance line
const OBJECTIVE = /(\d|HTTP|exit 0|exit code|grep|0 errors|0 critical|0 missing|<=|>=|<|>|WCAG|RLS|timingSafeEqual|notFound|404|401|400|429|200|InStock|NewCondition|AggregateOffer|itemCondition|List-Unsubscribe|nofollow|sponsored|hreflang|x-default|NOT NULL|FK|CHECK|EXPIRE|INCR|isMock|TTL|=)/i;

const reqIds = new Set(requirements.map((r) => r.id));
const baseIds = new Set(baseline.map((b) => b.id));

// 1. Requirement structural checks
const seen = new Set();
for (const r of requirements) {
  if (seen.has(r.id)) E(`DUP requirement id ${r.id}`);
  seen.add(r.id);
  if (!PAT.includes(r.pattern)) E(`${r.id}: invalid pattern '${r.pattern}'`);
  else if (!PATTERN_KEYWORD[r.pattern].test(r.text)) E(`${r.id}: text does not match EARS '${r.pattern}' keyword`);
  if (!['stated', 'inferred'].includes(r.provenance)) E(`${r.id}: provenance must be stated|inferred`);
  if (!Array.isArray(r.acceptance) || r.acceptance.length < 1) E(`${r.id}: needs >=1 acceptance criterion`);
  for (const a of r.acceptance || []) {
    const lower = ' ' + a.toLowerCase() + ' ';
    for (const v of VAGUE) {
      if (lower.includes(' ' + v + ' ') && !OBJECTIVE.test(a)) {
        E(`${r.id}: vague acceptance term '${v}' without an objective/numeric bound -> "${a}"`);
      }
    }
  }
  for (const b of r.baseline || []) if (!baseIds.has(b)) E(`${r.id}: dangling baseline ref ${b}`);
  if (!(r.baseline || []).length) E(`${r.id}: maps to no baseline item`);
}

// 2. Coverage matrix: every baseline item -> >=1 requirement
const baseToReq = new Map(baseline.map((b) => [b.id, []]));
for (const r of requirements) for (const b of r.baseline || []) if (baseToReq.has(b)) baseToReq.get(b).push(r.id);
const unmapped = [...baseToReq.entries()].filter(([, rs]) => rs.length === 0).map(([b]) => b);
for (const b of unmapped) E(`UNMAPPED baseline item ${b} (zero requirements) — blocks sign-off`);

// 3. Components -> requirements
for (const c of components) {
  if (!(c.requirements || []).length) E(`${c.id}: component maps to no requirement`);
  for (const rq of c.requirements || []) if (!reqIds.has(rq)) E(`${c.id}: dangling requirement ref ${rq}`);
}

// 4. Tasks -> requirements + verification + deps
const taskIds = new Set(tasks.map((t) => t.id));
for (const t of tasks) {
  if (!(t.requirements || []).length) E(`${t.id}: task maps to no requirement`);
  for (const rq of t.requirements || []) if (!reqIds.has(rq)) E(`${t.id}: dangling requirement ref ${rq}`);
  if (!t.verification || !t.verification.trim()) E(`${t.id}: task names no verification`);
  for (const d of t.dependsOn || []) if (!taskIds.has(d)) E(`${t.id}: dangling dependsOn ${d}`);
}

// 5. Every requirement implemented by >=1 task AND covered by >=1 component
const reqToTask = new Map([...reqIds].map((id) => [id, []]));
for (const t of tasks) for (const rq of t.requirements || []) reqToTask.get(rq)?.push(t.id);
const reqToComp = new Map([...reqIds].map((id) => [id, []]));
for (const c of components) for (const rq of c.requirements || []) reqToComp.get(rq)?.push(c.id);
for (const [id, ts] of reqToTask) if (ts.length === 0) E(`${id}: no task implements this requirement (orphan)`);
for (const [id, cs] of reqToComp) if (cs.length === 0) W(`${id}: no component lists this requirement`);

// 6. Spine present (phase 0) and dependency-ordered (deps only to earlier/equal phase)
const phaseOf = new Map(tasks.map((t) => [t.id, t.phase]));
for (const t of tasks) for (const d of t.dependsOn || []) if (phaseOf.get(d) > t.phase) E(`${t.id}: depends on later-phase task ${d}`);
if (!tasks.some((t) => t.phase === 0)) E('no spine (phase 0) tasks defined');

// ---- Report (exact counts) ----
const byPrio = requirements.reduce((a, r) => ((a[r.priority] = (a[r.priority] || 0) + 1), a), {});
const byPat = requirements.reduce((a, r) => ((a[r.pattern] = (a[r.pattern] || 0) + 1), a), {});
const phases = [...new Set(tasks.map((t) => t.phase))].sort();

console.log('================ DealRadar remediation plan — Tier-A validation ================');
console.log(`baseline items : ${baseline.length}`);
console.log(`requirements   : ${requirements.length}  (by pattern: ${JSON.stringify(byPat)})`);
console.log(`               (by priority: ${JSON.stringify(byPrio)})`);
console.log(`components      : ${components.length}`);
console.log(`tasks          : ${tasks.length}  across phases ${JSON.stringify(phases)}`);
console.log(`coverage matrix: ${baseline.length - unmapped.length}/${baseline.length} baseline items MAPPED`);
console.log(`provenance     : stated=${requirements.filter(r=>r.provenance==='stated').length} inferred=${requirements.filter(r=>r.provenance==='inferred').length}`);
console.log('------------------------------------------------------------------------------');
if (warnings.length) { console.log(`WARNINGS (${warnings.length}):`); warnings.forEach((w) => console.log('  ! ' + w)); }
if (errors.length) {
  console.log(`\nBLOCKING ERRORS (${errors.length}):`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('\nRESULT: PASS — 0 blocking errors, 0 UNMAPPED, 0 dangling refs, 0 orphan requirements.');
process.exit(0);
