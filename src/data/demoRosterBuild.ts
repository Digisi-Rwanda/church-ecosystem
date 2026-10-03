/** Demo roster for the staging server, derived from the app's demo data (see demoRoster.test.ts). */
import { MEMBERSHIPS, ORG_UNITS, PEOPLE, POSITIONS } from './seed';

const clean = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export function buildDemoRoster() {
  return {
    note: 'Generated from src/data/seed by server/tests/demoRosterExport.test.ts. Demo data only — never loaded when APP_ENV=production.',
    orgUnits: ORG_UNITS.map(clean),
    people: PEOPLE.map(({ photoSource: _p, createdAt: _c, ...p }) => clean(p)),
    memberships: MEMBERSHIPS.map(clean),
    positions: POSITIONS.map(clean),
  };
}
