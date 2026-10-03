/**
 * Guards the staging server's demo roster (server/prisma/demoRoster.json): it is generated from
 * the app's demo data so "demo mode" and "server mode" show the same church. If this fails, the
 * app's demo data changed — regenerate the file:
 *
 *   cd server
 *   (Windows)  set EXPORT_DEMO_ROSTER=1 && npx vitest run tests/demoRosterExport.test.ts
 */
import { describe, expect, it } from 'vitest';
import raw from '../../server/prisma/demoRoster.json?raw';
import { buildDemoRoster } from './demoRosterBuild';

describe('demo roster for the staging server', () => {
  it('is up to date with the app demo data', () => {
    const saved = JSON.parse(raw);
    const now = buildDemoRoster();
    for (const k of ['orgUnits', 'people', 'memberships', 'positions'] as const) {
      expect(
        saved[k].map((r: { id: string }) => r.id),
        `${k}: regenerate the roster (see the top of this file)`,
      ).toEqual(now[k].map((r) => (r as { id: string }).id));
    }
    expect(JSON.stringify(saved.positions)).toBe(JSON.stringify(now.positions));
  });
});
