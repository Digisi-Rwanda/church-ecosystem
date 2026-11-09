#!/usr/bin/env node
/**
 * Import-boundary check: keeps the layers honest as the codebase grows.
 *
 *   domain      -> may import: domain only            (pure rules)
 *   data        -> may import: domain, data           (seed + storage)
 *   api         -> may import: api, domain            (talks to the server)
 *   services    -> may import: services, domain, data, api, lib
 *   hooks/lib   -> anything below pages
 *   components, pages -> must not import from data/ directly (go through services/hooks)
 *
 * Existing violations are listed in scripts/boundaries.baseline.json so the
 * check passes today and fails on any NEW one. Fix one, delete its baseline
 * line, and the rule gets stricter for good.
 *
 *   node scripts/check-boundaries.mjs           check
 *   node scripts/check-boundaries.mjs --update  rewrite the baseline (after fixing some)
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const baselinePath = join(root, 'scripts', 'boundaries.baseline.json');

/** layer -> layers it must NOT import */
const FORBIDDEN = {
  domain: ['services', 'data', 'pages', 'components', 'api', 'hooks', 'auth', 'navigation'],
  data: ['services', 'pages', 'components', 'hooks', 'auth', 'navigation'],
  api: ['services', 'pages', 'components', 'hooks', 'auth', 'navigation', 'data'],
  services: ['pages', 'components', 'hooks', 'navigation'],
  components: ['data'],
  pages: ['data'],
};

const layerOf = (file) => {
  const rel = relative(src, file).split(sep);
  return rel.length > 1 ? rel[0] : 'root';
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g;

const found = new Set();
for (const file of walk(src)) {
  const from = layerOf(file);
  const banned = FORBIDDEN[from];
  if (!banned) continue;
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    const target = resolve(dirname(file), spec);
    if (!target.startsWith(src + sep)) continue;
    const to = layerOf(target);
    if (banned.includes(to)) {
      found.add(`${relative(root, file).split(sep).join('/')} -> ${to}`);
    }
  }
}

// The app is built for the browser (tsc -b on Vercel has no Node types): nothing under src/,
// tests included, may import Node modules or read `process`. Put Node-only code in server/tests.
function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkAll(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const nodeUse = [];
for (const file of walkAll(src)) {
  const text = readFileSync(file, 'utf8');
  if (/from\s+['"]node:|require\(\s*['"]|\bprocess\.(env|argv|cwd)\b/.test(text)) {
    nodeUse.push(relative(root, file).split(sep).join('/'));
  }
}
if (nodeUse.length) {
  console.error('\nNode-only code inside src/ (the browser build cannot compile it):');
  for (const f of nodeUse) console.error('  ' + f);
  console.error('Move it to server/tests (it runs under Node there).');
  process.exit(1);
}

const current = [...found].sort();
if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log(`baseline written: ${current.length} known violations`);
  process.exit(0);
}

const baseline = new Set(existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : []);
const fresh = current.filter((v) => !baseline.has(v));
const fixed = [...baseline].filter((v) => !found.has(v));

if (fixed.length) {
  console.log(`\n${fixed.length} baseline entr${fixed.length === 1 ? 'y is' : 'ies are'} fixed — run with --update to lock that in:`);
  for (const v of fixed) console.log('  fixed  ' + v);
}
if (fresh.length) {
  console.error(`\nNew import-boundary violations (${fresh.length}):`);
  for (const v of fresh) console.error('  ' + v);
  console.error('\nA layer imported something it should not know about. See the rules at the top of scripts/check-boundaries.mjs.');
  process.exit(1);
}
console.log(`import boundaries ok (${baseline.size - fixed.length} known violations, no new ones)`);
