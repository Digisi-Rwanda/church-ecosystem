/**
 * SPA <-> server rule parity, exhaustively (one factor at a time).
 *
 * parity.spa.test.ts compares the two engines for the seeded accounts. This one
 * builds a synthetic person for every combination of system x role/office
 * x status (and memberships, assignments, tasks) and requires the
 * two engines to grant exactly the same things. It exists to catch the day one
 * copy of a rule is changed and the other is not.
 */
import { describe, expect, it } from 'vitest';
import { buildEffectiveAccess as spaBuild } from '../../src/domain/authorize';
import { buildEffectiveAccess as serverBuild } from '../src/policy/buildAccess';
import { SYSTEMS } from '../../src/data/seed';

const NOW = new Date('2026-09-30T12:00:00Z');
const ids = SYSTEMS.map((s) => s.id);
const key = (g: any) => `${g.systemId}|${g.resource}|${g.action}`;
const P = 'p-x';

const SYSTEM_ROLES = [undefined, 'CHURCH_LEADER', 'PASTOR', 'CATECHIST', 'CHURCH_SECRETARY', 'CHURCH_TREASURER', 'MEMBER'];
const MIN_OFFICES = [undefined, 'PRESIDENT', 'VP', 'SECRETARY', 'TREASURER', 'COORDINATOR', 'MEMBER'];
const CHOIR = [undefined, 'PRESIDENT', 'VP', 'TREASURER', 'SECRETARY', 'MUSIC_DIRECTOR', 'COORDINATOR', 'ADVISOR', 'FAMILY_LEADER', 'MEMBER'];
const WORSHIP = [undefined, 'ADMIN', 'PRESIDENT', 'VP', 'SECRETARY', 'TREASURER', 'COORDINATOR', 'MUSIC_DIRECTOR', 'FAMILY_LEADER', 'FAMILY_VICE', 'MEMBER'];
const DEACON = [undefined, 'COORDINATOR', 'PRESIDENT', 'SECRETARY', 'TREASURER', 'MEMBER'];
const PROTOCOL = [undefined, 'PRESIDENT', 'VP', 'SECRETARY', 'TREASURER', 'COORDINATOR', 'MEMBER'];
const MEMBERSHIP_TYPES = ['CHURCH_MEMBER', 'CHOIR_MEMBER', 'WORSHIP_MEMBER', 'YOUTH_MEMBER', 'PROTOCOL_MEMBER', 'DEACON_MEMBER', 'MEDIA_MEMBER', 'MUSIC_MEMBER', 'MEN_MEMBER', 'WOMEN_MEMBER', 'COUPLES_MEMBER', 'CHILDREN_MEMBER', 'ELDERLY_MEMBER', 'EVANGELISM_MEMBER'];

type Case = { name: string; input: any };
const base = { memberships: [], positions: [], assignments: [], tasks: [], allSystemIds: ids };
const pos = (over: Record<string, unknown>) => ({
  id: 'pos', personId: P, title: 't', status: 'ACTIVE', startDate: '2020-01-01', ...over,
});

const cases: Case[] = [];
for (const sys of ids) {
  for (const status of ['ACTIVE', 'ENDED']) {
    const add = (label: string, over: Record<string, unknown>) =>
      cases.push({ name: `${sys} ${status} ${label}`, input: { ...base, positions: [pos({ systemId: sys, status, endDate: status === 'ENDED' ? '2021-01-01' : undefined, ...over })] } });
    for (const v of SYSTEM_ROLES) add(`systemRole=${v}`, { systemRole: v });
    for (const v of MIN_OFFICES) add(`ministryOffice=${v}`, { ministryOffice: v });
    for (const v of CHOIR) add(`choirOffice=${v}`, { choirOffice: v });
    for (const v of WORSHIP) add(`worshipOffice=${v}`, { worshipOffice: v });
    for (const v of DEACON) add(`deaconOffice=${v}`, { deaconOffice: v });
    for (const v of PROTOCOL) add(`protocolOffice=${v}`, { protocolOffice: v });
    add('grantsAllSystems', { grantsAllSystems: true });
  }
  for (const t of MEMBERSHIP_TYPES) {
    cases.push({
      name: `${sys} membership ${t}`,
      input: { ...base, memberships: [{ id: 'm', personId: P, systemId: sys, type: t, label: 'l', status: 'ACTIVE', startDate: '2020-01-01' }] },
    });
  }
  cases.push({
    name: `${sys} assignment`,
    input: { ...base, assignments: [{ id: 'a', personId: P, systemId: sys, title: 't', contextLabel: 'c', status: 'ACTIVE', startDate: '2020-01-01' }] },
  });
  const windows: Array<[string, Record<string, unknown>]> = [
    ['open', { startDate: '2020-01-01' }],
    ['not started yet', { startDate: '2027-01-01' }],
    ['ended', { startDate: '2020-01-01', endDate: '2021-01-01' }],
    ['ends later', { startDate: '2020-01-01', endDate: '2027-01-01' }],
    ['done', { startDate: '2020-01-01', status: 'DONE' }],
    ['cancelled', { startDate: '2020-01-01', status: 'CANCELLED' }],
    ['in progress', { startDate: '2020-01-01', status: 'IN_PROGRESS' }],
  ];
  for (const grants of [true, false]) {
    for (const [label, over] of windows) {
      cases.push({
        name: `${sys} task ${label} grantsSystemAccess=${grants}`,
        input: { ...base, tasks: [{ id: 't', ownerPersonId: P, title: 't', systemId: sys, status: 'TODO', grantsSystemAccess: grants, ...over }] },
      });
    }
  }
}

describe('SPA <-> server grant parity, synthetic matrix', () => {
  it(`covers a meaningful number of cases (${cases.length})`, () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('every case grants exactly the same on both sides', () => {
    const diffs: string[] = [];
    for (const c of cases) {
      const spa = new Set(spaBuild(P, c.input, NOW).map(key));
      const srv = new Set(serverBuild(P, c.input, NOW).map(key));
      const onlySpa = [...spa].filter((k) => !srv.has(k));
      const onlySrv = [...srv].filter((k) => !spa.has(k));
      if (onlySpa.length || onlySrv.length) {
        diffs.push(`${c.name}\n    only SPA:    ${onlySpa.slice(0, 4).join(', ') || '-'}\n    only server: ${onlySrv.slice(0, 4).join(', ') || '-'}`);
      }
    }
    expect(diffs.length, `${diffs.length} of ${cases.length} cases differ. First ones:\n${diffs.slice(0, 12).join('\n')}`).toBe(0);
  });
});
