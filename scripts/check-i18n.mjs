#!/usr/bin/env node
/**
 * Wording check. Fails when:
 *  - a language that is switched on (ENABLED_LOCALES) is missing a text, or
 *  - a written Kinyarwanda / French text has different {placeholders} from the English one, or
 *  - a Kinyarwanda / French text has no English twin.
 * Warns (fails with --strict) about English texts no screen uses any more.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMessages, placeholders, root, walk } from './i18n-lib.mjs';

const strict = process.argv.includes('--strict');
const en = await loadMessages('en');
const enKeys = Object.keys(en);
let failed = false;
const fail = (m) => { failed = true; console.error('x ' + m); };

const locales = readFileSync(join(root, 'src/i18n/locales.ts'), 'utf8');
const enabled = [...(/export const ENABLED_LOCALES[^=]*=\s*\[([^\]]*)\]/.exec(locales)?.[1] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);

for (const l of ['rw', 'fr']) {
  const cat = await loadMessages(l);
  const missing = enKeys.filter((k) => !cat[k]);
  const stray = Object.keys(cat).filter((k) => !(k in en));
  const badPh = Object.keys(cat).filter((k) => k in en && placeholders(cat[k]) !== placeholders(en[k]));
  if (enabled.includes(l) && missing.length) fail(`${l} is switched on but misses ${missing.length} texts (first: ${missing.slice(0, 5).join(', ')})`);
  if (stray.length) fail(`${l} has ${stray.length} texts English does not have (first: ${stray.slice(0, 5).join(', ')})`);
  if (badPh.length) fail(`${l} changes the {placeholders} of ${badPh.length} texts (first: ${badPh.slice(0, 5).join(', ')})`);
  console.log(`${l}: ${enKeys.length - missing.length}/${enKeys.length} written${enabled.includes(l) ? ' (on)' : ' (off, waiting for review)'}`);
}

const files = walk(join(root, 'src')).filter((f) => !f.includes('/i18n/messages/') && !/\.test\./.test(f));
const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const prefixes = [...text.matchAll(/['"`]([\w.]+\.)\$\{/g)].map((m) => m[1]);
const used = (k) => text.includes(`'${k}'`) || text.includes(`"${k}"`) || text.includes(`\`${k}\``) || prefixes.some((p) => k.startsWith(p)) || /\.(one|other|few|many)$/.test(k);
const unused = enKeys.filter((k) => !used(k));
if (unused.length) {
  const msg = `${unused.length} English texts look unused (first: ${unused.slice(0, 5).join(', ')})`;
  if (strict) fail(msg); else console.warn('! ' + msg);
}
process.exit(failed ? 1 : 0);
