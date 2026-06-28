#!/usr/bin/env node
// i18n key-parity gate (R-I18N-1). Flattens en.json (reference) and every other
// locale; reports keys missing or empty in any locale. Exit non-zero on any gap.
//   node scripts/check-i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'messages');
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
process.exit(problems ? 1 : 0);
