import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMessages, root, walk } from './i18n-lib.mjs';

const en = await loadMessages('en');
const enKeys = new Set(Object.keys(en));
const files = walk(join(root, 'src')).filter((f) => !f.includes('/i18n/messages/') && !/\.test\./.test(f));
const used = new Set();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) used.add(m[1]);
  for (const m of text.matchAll(/`([\w.]+)` as '/g)) used.add(m[1]);
  for (const m of text.matchAll(/as '([\w.]+)'/g)) used.add(m[1]);
}
const missing = [...used].filter((k) => k.includes('.') && !enKeys.has(k)).sort();
console.log(missing.join('\n'));
console.error('used', used.size, 'en', enKeys.size, 'missing', missing.length);
