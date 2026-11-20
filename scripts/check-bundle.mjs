#!/usr/bin/env node
/**
 * Bundle budget: what a first visit to the new app must download stays small, and the old
 * app never rides along. Run after `npm run build` (or pass another folder: node scripts/check-bundle.mjs /tmp/out).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(process.argv[2] ?? join(root, 'dist'));
const BUDGET_GZIP_KB = 150; // the code a first visit loads: boot files plus the new app
const OLD_APP_MARKERS = ['localDomainStore', 'peerSystemSeed', 'musicScheduleEngine', 'protocolSeed'];

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No build found in ${dist}. Run: npm run build`);
  process.exit(1);
}
const assets = join(dist, 'assets');
const read = (f) => readFileSync(join(assets, f), 'utf8');

function closure(starts) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) walk(m[1]);
  };
  starts.forEach(walk);
  return seen;
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const boot = [...html.matchAll(/\/assets\/([^"']+\.js)/g)].map((m) => m[1]);
const newApp = readdirSync(assets).find((f) => /^NewApp-.*\.js$/.test(f));
if (!newApp) {
  console.error('The new app is not in its own file (NewApp-*.js is missing).');
  process.exit(1);
}
const first = closure([...boot, newApp]);
const gzipKb = [...first].reduce((n, f) => n + gzipSync(readFileSync(join(assets, f))).length, 0) / 1024;
const rawKb = [...first].reduce((n, f) => n + readFileSync(join(assets, f)).length, 0) / 1024;
const problems = [];
for (const f of first) {
  const text = read(f);
  for (const mark of OLD_APP_MARKERS) if (text.includes(mark)) problems.push(`${f} carries the old app (${mark})`);
}
if (gzipKb > BUDGET_GZIP_KB) problems.push(`first visit is ${gzipKb.toFixed(0)} kB compressed; the budget is ${BUDGET_GZIP_KB} kB`);

console.log(`first visit: ${first.size} files, ${rawKb.toFixed(0)} kB (${gzipKb.toFixed(0)} kB compressed), budget ${BUDGET_GZIP_KB} kB`);
if (problems.length) {
  console.error(problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('bundle ok');
