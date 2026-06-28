#!/usr/bin/env node
// Renders requirements.md, tasks.md, and design.md from the validated plan.json
// so all counts/tables trace to a single machine-checked source (no drift).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(here, 'plan.json'), 'utf8'));
const { baseline, requirements, components, tasks, meta } = plan;

const reqById = new Map(requirements.map((r) => [r.id, r]));
const reqToTasks = new Map(requirements.map((r) => [r.id, []]));
for (const t of tasks) for (const rq of t.requirements) reqToTasks.get(rq)?.push(t.id);
const reqToComps = new Map(requirements.map((r) => [r.id, []]));
for (const c of components) for (const rq of c.requirements) reqToComps.get(rq)?.push(c.id);
const baseToReq = new Map(baseline.map((b) => [b.id, []]));
for (const r of requirements) for (const b of r.baseline) baseToReq.get(b)?.push(r.id);

const grp = (id) => id.split('-').slice(0, 2).join('-');
const groups = [...new Set(requirements.map((r) => grp(r.id)))];
const GROUP_TITLE = {
  'R-ING': 'Ingestion & Data Pipeline', 'R-MON': 'Monetization & Tracking', 'R-RTE': 'Routing & SSR',
  'R-GEO': 'SEO / AEO / Structured Data', 'R-I18N': 'Internationalization', 'R-LOC': 'Geolocation & Locale',
  'R-COMP': 'Legal & Compliance', 'R-MAIL': 'Email & Alerts', 'R-SEC': 'Security & Privacy',
  'R-PERF': 'Performance', 'R-OPS': 'Operations & Observability', 'R-TEST': 'Testing & Release', 'R-UX': 'UX & Accessibility',
};

const counts = {
  baseline: baseline.length, req: requirements.length, comp: components.length, task: tasks.length,
  p0: requirements.filter((r) => r.priority === 'P0').length,
  p1: requirements.filter((r) => r.priority === 'P1').length,
  p2: requirements.filter((r) => r.priority === 'P2').length,
  reg: requirements.filter((r) => r.priority === 'REGRESSION').length,
  stated: requirements.filter((r) => r.provenance === 'stated').length,
  inferred: requirements.filter((r) => r.provenance === 'inferred').length,
};

// ---------- requirements.md ----------
let R = `# DealRadar Remediation — Requirements (EARS) + Coverage Matrix
> Generated from \`plan.json\` (Tier-A validated by \`validate_plan.mjs\`). Do not hand-edit; edit plan.json and re-render.

**Counts (machine-checked):** ${counts.req} requirements · ${counts.baseline} baseline items (${counts.baseline}/${counts.baseline} MAPPED) · provenance: ${counts.stated} stated / ${counts.inferred} inferred · priority: P0=${counts.p0} P1=${counts.p1} P2=${counts.p2} REGRESSION=${counts.reg}.

**EARS legend:** ubiquitous (\`The system SHALL\`) · event (\`WHEN…THEN…SHALL\`) · state (\`WHILE…SHALL\`) · unwanted (\`IF…THEN…SHALL\`) · optional (\`WHERE…SHALL\`). REGRESSION = already implemented in code (audit-verified); locked as a regression gate, not new build.

`;
for (const g of groups) {
  R += `\n## ${g} — ${GROUP_TITLE[g] || g}\n`;
  for (const r of requirements.filter((x) => grp(x.id) === g)) {
    R += `\n### ${r.id} · [${r.priority}] · ${r.pattern} · _${r.provenance}_\n`;
    R += `**Story:** ${r.story}\n\n`;
    R += `**Requirement:** ${r.text}\n\n`;
    R += `**Acceptance:**\n` + r.acceptance.map((a) => `- ${a}`).join('\n') + '\n\n';
    R += `**Trace:** baseline ${r.baseline.join(', ')} · original ${r.original.length ? r.original.join(', ') : '—'} · findings ${r.findings.length ? r.findings.join(', ') : '—'} · tasks ${reqToTasks.get(r.id).join(', ') || '—'} · components ${reqToComps.get(r.id).join(', ') || '—'}\n`;
  }
}
R += `\n---\n\n## Coverage matrix (baseline → requirements) — ${counts.baseline}/${counts.baseline} MAPPED\n\n`;
R += `| Baseline | Block | Authority | Requirement(s) | Status |\n|---|---|---|---|---|\n`;
for (const b of baseline) {
  const rs = baseToReq.get(b.id);
  R += `| ${b.id} | ${b.block} | ${b.authority} | ${rs.join(', ')} | ${rs.length ? 'MAPPED' : '**UNMAPPED**'} |\n`;
}
writeFileSync(join(here, 'requirements.md'), R);

// ---------- tasks.md ----------
const phases = [...new Set(tasks.map((t) => t.phase))].sort();
const PHASE_NAME = { 0: 'SPINE — minimal end-to-end core loop', 1: 'Compliance & i18n core', 2: 'SEO / AEO', 3: 'Security hardening', 4: 'Ingestion depth & data integrity', 5: 'Ops, testing, a11y, regression' };
let T = `# DealRadar Remediation — Tasks (phased, dependency-ordered)
> Generated from \`plan.json\`. ${counts.task} tasks across ${phases.length} phases. Each task → requirement(s) → named verification.

**Spine (hard prerequisite):** ${meta.params.spine}

`;
for (const p of phases) {
  T += `\n## Phase ${p} — ${PHASE_NAME[p] || ''}\n`;
  for (const t of tasks.filter((x) => x.phase === p)) {
    T += `\n- **${t.id}** — ${t.title}\n`;
    T += `  - Requirements: ${t.requirements.join(', ')}\n`;
    T += `  - Verification: ${t.verification}\n`;
    T += `  - Depends on: ${t.dependsOn.length ? t.dependsOn.join(', ') : '—'}\n`;
  }
}
T += `\n---\n\n## Dependency edges\n`;
for (const t of tasks) for (const d of t.dependsOn) T += `- ${d} → ${t.id}\n`;
writeFileSync(join(here, 'tasks.md'), T);

// ---------- design component inventory (fragment appended to design.md by hand) ----------
let C = `\n## Component inventory (${components.length}) — every component traces to ≥1 requirement\n\n`;
C += `| ID | Component | Path | Phase | Responsibility | Requirements |\n|---|---|---|---|---|---|\n`;
for (const c of components.sort((a, b) => a.phase - b.phase)) {
  C += `| ${c.id} | ${c.name} | \`${c.path}\` | ${c.phase} | ${c.responsibility} | ${c.requirements.join(', ')} |\n`;
}
writeFileSync(join(here, '_components_table.md'), C);

console.log(`Rendered requirements.md (${counts.req} reqs), tasks.md (${counts.task} tasks), _components_table.md (${counts.comp} components).`);
