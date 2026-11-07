#!/usr/bin/env node
/**
 * Reads the reviewed spreadsheet back into the language file:
 *   node scripts/i18n-import.mjs rw translations-rw.csv
 * Empty cells stay unwritten (English shows instead). A text whose {placeholders} differ from English is refused.
 * It does NOT switch the language on: that is a deliberate step in src/i18n/locales.ts after review.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMessages, msgDir, placeholders } from './i18n-lib.mjs';

const [lang, file] = process.argv.slice(2);
if (!['rw', 'fr'].includes(lang) || !file) { console.error('Usage: node scripts/i18n-import.mjs rw|fr file.csv'); process.exit(1); }

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const en = await loadMessages('en');
const rows = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, '')).slice(1);
const out = {}; const refused = [];
for (const [key, , translation] of rows) {
  if (!key || !(key in en)) continue;
  const text = (translation ?? '').trim();
  if (!text) continue;
  if (placeholders(text) !== placeholders(en[key])) { refused.push(key); continue; }
  out[key] = text;
}
const esc = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const label = lang === 'rw' ? 'Kinyarwanda' : 'French';
const body = Object.entries(out).map(([k, v]) => `  '${k}': ${esc(v)},`).join('\n');
writeFileSync(join(msgDir, `${lang}.ts`), `import type { Messages } from './en';\n\n/**\n * ${label} (native), imported from the reviewed spreadsheet.\n * Stays switched off in locales.ts until the reviewer has signed it off.\n */\nexport const ${lang}: Partial<Messages> = {\n${body}\n};\n`);
console.log(`Imported ${Object.keys(out).length} of ${Object.keys(en).length} texts into ${lang}.ts.`);
if (refused.length) console.log(`Refused ${refused.length} with changed {placeholders}: ${refused.slice(0, 10).join(', ')}`);
