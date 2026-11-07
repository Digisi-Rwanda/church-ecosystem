/**
 * Apply database migrations at start-up.
 * Run: npm run migrate:pg  (from server/)
 *
 * A missing baseline or any migration failure stops startup. Baseline adoption must
 * be performed explicitly; this runner never changes schema outside migrations.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runMigrationDeployment } from '../src/lib/migrationRunner.js';

const SCHEMA = 'prisma/schema.postgres.prisma';
const MIGRATIONS = join('prisma', 'migrations');

type SpawnResult = {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: Error;
};
type Spawn = (
  command: string,
  args: string[],
  options: { encoding: 'utf8'; shell: true },
) => SpawnResult;

export function executeMigrationRunner(
  spawn: Spawn = spawnSync,
  targetProcess: { exitCode?: number } = process,
  reportOutput: (output: string) => void = (output) => process.stdout.write(output),
  reportError: (error: string) => void = (error) => process.stderr.write(`${error}\n`),
): number {
  const entries = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS, { withFileTypes: true }).map((d) => ({
        name: d.name,
        isDirectory: d.isDirectory(),
        hasSql: d.isDirectory() && existsSync(join(MIGRATIONS, d.name, 'migration.sql')),
      }))
    : [];

  const status = runMigrationDeployment(
    entries,
    (args) => {
      const result = spawn(
        'npx',
        ['prisma', ...args, `--schema=${SCHEMA}`],
        { encoding: 'utf8', shell: true },
      );
      return {
        status: result.status,
        output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
        error: result.error,
      };
    },
    reportOutput,
    reportError,
  );
  targetProcess.exitCode = status;
  return status;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  executeMigrationRunner();
}
