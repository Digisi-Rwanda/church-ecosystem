import { describe, expect, it } from 'vitest';
import { BASELINE_MIGRATION, hasBaseline, hasMigrations, needsBaseline } from '../src/lib/migrations';
import { runMigrationDeployment } from '../src/lib/migrationRunner';
import { executeMigrationRunner } from '../scripts/migrate-deploy';

describe('migration start-up helpers', () => {
  it('recognises the "tables but no history" error', () => {
    expect(needsBaseline('Error: P3005 The database schema is not empty.')).toBe(true);
    expect(needsBaseline('All migrations have been successfully applied.')).toBe(false);
  });
  it('needs the baseline itself, not just any later migration', () => {
    expect(hasBaseline([{ name: '0002_codes', isDirectory: true, hasSql: true }])).toBe(false);
    expect(hasBaseline([{ name: BASELINE_MIGRATION, isDirectory: true, hasSql: true }])).toBe(true);
  });
  it('counts only folders that hold a migration.sql', () => {
    expect(hasMigrations([])).toBe(false);
    expect(hasMigrations([{ name: 'migration_lock.toml', isDirectory: false, hasSql: false }])).toBe(false);
    expect(hasMigrations([{ name: BASELINE_MIGRATION, isDirectory: true, hasSql: false }])).toBe(false);
    expect(hasMigrations([{ name: BASELINE_MIGRATION, isDirectory: true, hasSql: true }])).toBe(true);
  });
});

describe('migration deployment runner', () => {
  const baseline = [{ name: BASELINE_MIGRATION, isDirectory: true, hasSql: true }];

  it('returns success after a successful migration deployment', () => {
    const calls: string[][] = [];
    const output: string[] = [];
    const errors: string[] = [];

    const status = runMigrationDeployment(
      baseline,
      (args) => {
        calls.push(args);
        return { status: 0, output: 'Migrations applied.' };
      },
      (value) => output.push(value),
      (value) => errors.push(value),
    );

    expect(status).toBe(0);
    expect(calls).toEqual([['migrate', 'deploy']]);
    expect(output).toEqual(['Migrations applied.']);
    expect(errors).toEqual([]);
  });

  it('returns the migration failure and preserves its original error without fallback', () => {
    const calls: string[][] = [];
    const errors: string[] = [];
    const originalError = 'Error: migration 0059 failed because a column already exists';

    const status = runMigrationDeployment(
      baseline,
      (args) => {
        calls.push(args);
        return { status: 1, output: originalError };
      },
      () => undefined,
      (value) => errors.push(value),
    );

    expect(status).toBe(1);
    expect(calls).toEqual([['migrate', 'deploy']]);
    expect(errors).toEqual([originalError]);
  });

  it('stops on P3005 without resolving the baseline automatically', () => {
    const calls: string[][] = [];
    const errors: string[] = [];
    const originalError = 'Error: P3005 The database schema is not empty.';

    const status = runMigrationDeployment(
      baseline,
      (args) => {
        calls.push(args);
        return { status: 1, output: originalError };
      },
      () => undefined,
      (value) => errors.push(value),
    );

    expect(status).toBe(1);
    expect(calls).toEqual([['migrate', 'deploy']]);
    expect(errors[0]).toContain(originalError);
    expect(errors[0]).toContain('explicit baseline procedure is required');
  });

  it('stops when the baseline is missing without invoking Prisma', () => {
    const calls: string[][] = [];
    const errors: string[] = [];

    const status = runMigrationDeployment(
      [{ name: '0058_versioned_scheduling_snapshots', isDirectory: true, hasSql: true }],
      (args) => {
        calls.push(args);
        return { status: 0, output: '' };
      },
      () => undefined,
      (value) => errors.push(value),
    );

    expect(status).toBe(1);
    expect(calls).toEqual([]);
    expect(errors[0]).toContain('Required baseline migration');
    expect(errors[0]).toContain('no database changes were attempted');
  });

  it('preserves spawn errors and output when spawnSync returns a null status', () => {
    const calls: string[][] = [];
    const errors: string[] = [];
    const spawnError = Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' });

    const status = runMigrationDeployment(
      baseline,
      (args) => {
        calls.push(args);
        return {
          status: null,
          output: 'stdout detail\nstderr detail',
          error: spawnError,
        };
      },
      () => undefined,
      (value) => errors.push(value),
    );

    expect(status).not.toBe(0);
    expect(calls).toEqual([['migrate', 'deploy']]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('stdout detail');
    expect(errors[0]).toContain('stderr detail');
    expect(errors[0]).toContain(String(spawnError));
  });
});

describe('migration production wrapper', () => {
  it.each([
    { status: 0, expectedExitCode: 0, stdout: 'Migration applied.' },
    { status: 1, expectedExitCode: 1, stderr: 'P3005 database schema is not empty.' },
  ])('uses the PostgreSQL migration command and forwards status $status', ({ status, expectedExitCode, stdout, stderr }) => {
    const calls: Array<{ command: string; args: string[]; options: { encoding: 'utf8'; shell: true } }> = [];
    const targetProcess: { exitCode?: number } = {};
    const errors: string[] = [];
    const output: string[] = [];

    const result = executeMigrationRunner(
      (command, args, options) => {
        calls.push({ command, args, options });
        return { status, stdout, stderr };
      },
      targetProcess,
      (value) => output.push(value),
      (value) => errors.push(value),
    );

    expect(result).toBe(expectedExitCode);
    expect(targetProcess.exitCode).toBe(expectedExitCode);
    expect(calls).toEqual([
      {
        command: 'npx',
        args: ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.postgres.prisma'],
        options: { encoding: 'utf8', shell: true },
      },
    ]);
    if (expectedExitCode === 0) {
      expect(output.join('\n')).toContain(stdout);
      expect(errors).toEqual([]);
    } else {
      expect(errors.join('\n')).toContain(stderr);
      expect(output).toEqual([]);
    }
  });

  it('reports the spawnSync error and returns failure when the process cannot start', () => {
    const calls: string[][] = [];
    const targetProcess: { exitCode?: number } = {};
    const errors: string[] = [];
    const spawnError = Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' });

    const result = executeMigrationRunner(
      (_command, args) => {
        calls.push(args);
        return {
          status: null,
          stdout: 'spawn stdout',
          stderr: 'spawn stderr',
          error: spawnError,
        };
      },
      targetProcess,
      () => undefined,
      (error) => errors.push(error),
    );

    expect(result).not.toBe(0);
    expect(targetProcess.exitCode).not.toBe(0);
    expect(calls).toEqual([
      ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.postgres.prisma'],
    ]);
    expect(errors.join('\n')).toContain('spawn stdout');
    expect(errors.join('\n')).toContain('spawn stderr');
    expect(errors.join('\n')).toContain(String(spawnError));
  });
});
