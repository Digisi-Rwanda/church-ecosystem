/**
 * SPA engine vs server engine: same person + same data must yield the same grants.
 * The SPA UI decides what to SHOW, the server decides what is ALLOWED — drift
 * means buttons that 403, or (worse) server endpoints wider than the UI implies.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEffectiveAccess as spaBuild } from '../../src/domain/authorize';
import { buildEffectiveAccess as serverBuild } from '../src/policy/buildAccess';
import { ACCOUNTS, ASSIGNMENTS, MEMBERSHIPS, POSITIONS, SYSTEMS } from '../../src/data/seed';
import { FUND_GRANTS } from '../../src/data/financeSeed';

const NOW = new Date('2026-09-30T12:00:00Z');
const key = (g: any) => `${g.systemId}|${g.resource}|${g.action}${g.fundId ? `|${g.fundId}` : ''}`;
const allSystemIds = SYSTEMS.map((s) => s.id);

function grantsFor(personId: string) {
  const input = {
    memberships: MEMBERSHIPS.filter((m) => m.personId === personId),
    positions: POSITIONS.filter((p) => p.personId === personId),
    assignments: ASSIGNMENTS.filter((a) => a.personId === personId),
    tasks: [],
    allSystemIds,
  };
  const spa = spaBuild(personId, input as any, NOW);
  const srv = serverBuild(personId, { ...input, fundGrants: FUND_GRANTS } as any, NOW);
  return { spa: new Set(spa.map(key)), srv: new Set(srv.map(key)) };
}

describe('SPA ↔ server grant parity (seed data, per account)', () => {
  const report: Record<string, { onlySpa: string[]; onlyServer: string[] }> = {};
  for (const acc of ACCOUNTS) {
    it(`${acc.username} (${acc.personId})`, () => {
      const { spa, srv } = grantsFor(acc.personId);
      const onlySpa = [...spa].filter((k) => !srv.has(k)).sort();
      const onlyServer = [...srv].filter((k) => !spa.has(k)).sort();
      report[acc.username] = { onlySpa, onlyServer };
      try { writeFileSync(process.env.PARITY_OUT ?? '/tmp/parity.json', JSON.stringify(report, null, 1)); } catch {}
      expect({ onlySpa, onlyServer }).toEqual({ onlySpa: [], onlyServer: [] });
    });
  }
});
