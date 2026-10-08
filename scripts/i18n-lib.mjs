/** Shared by the i18n scripts: reads the English wording and a language file as plain objects. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const msgDir = join(root, 'src', 'i18n', 'messages');
const require = createRequire(import.meta.url);

/** Load a messages file (TypeScript) without a build step. */
export async function loadMessages(name) {
  const ts = require('typescript');
  const code = ts.transpileModule(readFileSync(join(msgDir, `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return mod[name];
}

export function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); }
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

export const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
