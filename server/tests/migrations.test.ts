import { describe, expect, it } from 'vitest';
import { BASELINE_MIGRATION, hasBaseline, hasMigrations, needsBaseline } from '../src/lib/migrations';

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
