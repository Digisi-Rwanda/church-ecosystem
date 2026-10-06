/**
 * Apply database migrations at start-up (replaces `prisma db push` on Render).
 * Run: npm run migrate:pg  (from server/)
 *
 * - Migrations present, empty database: creates everything.
 * - Migrations present, database shaped earlier by `db push`: marks the baseline as
 *   applied once (no data changes), then deploys anything newer.
 * - No migrations folder yet (baseline not generated): falls back to `db push` and says so,
 *   so a deploy can never leave the database without tables.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BASELINE_MIGRATION, hasMigrations, needsBaseline } from '../src/lib/migrations.js';

const SCHEMA = 'prisma/schema.postgres.prisma';
const MIGRATIONS = join('prisma', 'migrations');

function prisma(args: string[]) {
  const r = spawnSync('npx', ['prisma', ...args, `--schema=${SCHEMA}`], {
    encoding: 'utf8',
    shell: true,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return { status: r.status ?? 1, output: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

const entries = existsSync(MIGRATIONS)
  ? readdirSync(MIGRATIONS, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
      hasSql: d.isDirectory() && existsSync(join(MIGRATIONS, d.name, 'migration.sql')),
    }))
  : [];

if (!hasMigrations(entries)) {
  console.warn('[migrate] No migrations found — applying the schema with db push instead. Generate the baseline: npm run db:baseline');
  process.exit(prisma(['db', 'push']).status);
}

let result = prisma(['migrate', 'deploy']);
if (result.status !== 0 && needsBaseline(result.output)) {
  console.log(`[migrate] Database already has tables: marking ${BASELINE_MIGRATION} as applied (no data changes).`);
  const resolved = prisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION]);
  if (resolved.status !== 0) process.exit(resolved.status);
  result = prisma(['migrate', 'deploy']);
}
process.exit(result.status);
