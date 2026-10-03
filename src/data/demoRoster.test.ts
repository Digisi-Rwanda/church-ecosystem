/**
 * The staging server's demo roster is generated from the app's demo data, so
 * "demo mode" and "server mode" show the same church.
 *
 *   Re-generate after changing the app's demo data:
 *     (Windows)  set EXPORT_DEMO_ROSTER=1 && npx vitest run src/data/demoRoster.test.ts
 *
 * Without the variable this file only CHECKS that the saved roster is current.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { MEMBERSHIPS, ORG_UNITS, PEOPLE, POSITIONS } from './seed';

const FILE = new URL('../../server/prisma/demoRoster.json', import.meta.url);
const clean = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const build = () => ({
  note: 'Generated from src/data/seed by src/data/demoRoster.test.ts. Demo data only — never loaded when APP_ENV=production.',
  orgUnits: ORG_UNITS.map(clean),
  people: PEOPLE.map(({ photoSource: _p, createdAt: _c, ...p }) => clean(p)),
  memberships: MEMBERSHIPS.map(clean),
  positions: POSITIONS.map(clean),
});

describe('demo roster for the staging server', () => {
  if (process.env.EXPORT_DEMO_ROSTER) {
    it('writes the roster file', () => {
      writeFileSync(FILE, JSON.stringify(build(), null, 1) + '\n');
    });
  } else {
    it('is up to date with the app demo data', () => {
      const saved = JSON.parse(readFileSync(FILE, 'utf8'));
      const now = build();
      for (const k of ['orgUnits', 'people', 'memberships', 'positions'] as const) {
        expect(saved[k].map((r: { id: string }) => r.id), `${k}: re-generate the roster (see top of this file)`).toEqual(
          now[k].map((r) => (r as { id: string }).id),
        );
      }
      expect(JSON.stringify(saved.positions)).toBe(JSON.stringify(now.positions));
    });
  }
});
