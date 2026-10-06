/**
 * Helpers for applying database migrations at start-up.
 *
 * The database used to be shaped by `prisma db push` on every boot. From slice 1.1 the
 * schema ships as real migrations. A database that `db push` already shaped has all the
 * tables but no migration history; Prisma then refuses to deploy (error P3005) until the
 * baseline migration is marked as already applied, which changes no data.
 */
export const BASELINE_MIGRATION = '0001_baseline';

/** True when Prisma's output says the database has tables but no migration history. */
export function needsBaseline(output: string): boolean {
  return output.includes('P3005');
}

/** True when the migrations folder holds at least one migration (a folder with migration.sql). */
export function hasMigrations(entries: Array<{ name: string; isDirectory: boolean; hasSql: boolean }>): boolean {
  return entries.some((e) => e.isDirectory && e.hasSql);
}
