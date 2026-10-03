/** Writes server/prisma/demoRoster.json from the app's demo data. Skipped unless EXPORT_DEMO_ROSTER is set. */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDemoRoster } from '../../src/data/demoRosterBuild';

describe.skipIf(!process.env.EXPORT_DEMO_ROSTER)('export demo roster', () => {
  it('writes the file', () => {
    const r = buildDemoRoster();
    writeFileSync(new URL('../prisma/demoRoster.json', import.meta.url), JSON.stringify(r, null, 1) + '\n');
    expect(r.people.length).toBeGreaterThan(0);
  });
});
