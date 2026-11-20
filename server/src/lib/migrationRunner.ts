import { BASELINE_MIGRATION, hasBaseline, needsBaseline } from './migrations.js';

type MigrationEntry = { name: string; isDirectory: boolean; hasSql: boolean };
type PrismaResult = { status: number | null; output: string; error?: Error };

export function runMigrationDeployment(
  entries: MigrationEntry[],
  runPrisma: (args: string[]) => PrismaResult,
  reportOutput: (output: string) => void,
  reportError: (error: string) => void,
): number {
  if (!hasBaseline(entries)) {
    reportError(
      `[migrate] Required baseline migration ${BASELINE_MIGRATION}/migration.sql was not found. ` +
        'Generate or restore the baseline and retry; no database changes were attempted.',
    );
    return 1;
  }

  const result = runPrisma(['migrate', 'deploy']);
  if (result.status === 0 && !result.error) {
    reportOutput(result.output);
    return 0;
  }

  const details = [
    result.output.trim(),
    result.error ? String(result.error) : '',
  ]
    .filter(Boolean)
    .join('\n') || `prisma migrate deploy failed with exit code ${result.status}.`;
  const baselineGuidance = needsBaseline(result.output)
    ? `\n[migrate] Prisma reports P3005: an explicit baseline procedure is required. ` +
      'No migration history was changed.'
    : '';
  reportError(`${details}${baselineGuidance}`);
  return result.status && result.status !== 0 ? result.status : 1;
}
