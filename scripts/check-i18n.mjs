#!/usr/bin/env node
// i18n gate (R-I18N-1). Two phases:
//   1. PARITY   — every locale has every key en.json has (non-empty).
//   2. USAGE    — every static t('key') in code resolves to a key that exists in
//                 en.json under the component's declared namespace. Parity alone
//                 is BLIND to a key missing from *every* locale (incl. en) — that
//                 renders the literal key string to users (e.g. "deal.priceNote").
// Exit non-zero on any gap in either phase.
//   node scripts/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'messages');
const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else out[key] = v;
  }
  return out;
};

const en = flat(JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')));
const refKeys = Object.keys(en);
const locales = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.replace('.json', ''));

let problems = 0;
console.log(`Reference en.json: ${refKeys.length} keys · checking ${locales.length} locales`);
for (const loc of locales) {
  const m = flat(JSON.parse(readFileSync(join(dir, `${loc}.json`), 'utf8')));
  const missing = refKeys.filter((k) => !(k in m));
  const empty = refKeys.filter((k) => k in m && (m[k] === '' || m[k] == null));
  if (missing.length || empty.length) {
    problems += missing.length + empty.length;
    console.log(`  ✗ ${loc}: ${missing.length} missing, ${empty.length} empty`);
    missing.slice(0, 8).forEach((k) => console.log(`      missing: ${k}`));
    empty.slice(0, 8).forEach((k) => console.log(`      empty:   ${k}`));
  } else {
    console.log(`  ✓ ${loc}: complete (${Object.keys(m).length} keys)`);
  }
}
console.log(problems ? `\nI18N PARITY: FAIL (${problems} gaps)` : '\nI18N PARITY: PASS (0 missing, 0 empty)');

// ── Phase 2: code-usage scan ────────────────────────────────────────────────
// Walk src for .ts/.tsx, resolve each file's translation namespace(s), and check
// every static t('key') / t.rich('key') resolves to an existing en.json key.
const enKeys = new Set(refKeys);
function walk(d, out = []) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== 'node_modules' && name !== '.next') walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const NS_RE = /(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*?namespace:\s*)?['"]([^'"]+)['"]/g;
// t('key'), t.rich('key'), t.markup('key') — static single-quoted/double-quoted only.
const KEY_RE = /\bt(?:\.rich|\.markup)?\(\s*['"]([^'"$`{}]+)['"]/g;
let usageProblems = 0;
let scanned = 0;
const srcDir = join(root, 'src');
for (const file of walk(srcDir)) {
  const code = readFileSync(file, 'utf8');
  const namespaces = [...code.matchAll(NS_RE)].map((m) => m[1]);
  if (namespaces.length === 0) continue; // no translation scope resolvable here
  scanned++;
  const keys = [...code.matchAll(KEY_RE)].map((m) => m[1]);
  for (const k of new Set(keys)) {
    // Valid if it resolves under any of the file's namespaces, or is already a full dotted key.
    const ok = enKeys.has(k) || namespaces.some((ns) => enKeys.has(`${ns}.${k}`));
    if (!ok) {
      usageProblems++;
      console.log(`  ✗ ${file.replace(root + '/', '')}: t('${k}') → no key ${namespaces.map((ns) => `${ns}.${k}`).join(' | ')} in en.json`);
    }
  }
}
console.log(usageProblems ? `\nI18N USAGE: FAIL (${usageProblems} unresolved key(s) across ${scanned} scoped files)` : `\nI18N USAGE: PASS (0 unresolved keys across ${scanned} scoped files)`);

process.exit(problems || usageProblems ? 1 : 0);
