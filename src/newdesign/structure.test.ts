import { describe, expect, it } from 'vitest';
import type { MembershipRecord, OfficeRecord, UnitRecord } from '../api/frontDoorApi';
import { belongingOf, flattenTree, isLive, membersOf, officeHoldersOf, unitPath } from './structure';

const unit = (id: string, name: string, parentId: string | null = null): UnitRecord => ({
  id, name, type: 'TEAM', kind: 'TEAM', code: null, parentId, description: null, systemId: null, leaderPersonId: null,
});
const units = [unit('c', 'Church'), unit('b', 'Choir', 'c'), unit('a', 'Ushers', 'c'), unit('s', 'Sopranos', 'b'), unit('x', 'Orphan', 'gone')];
const today = '2026-10-06';
const mem = (id: string, personId: string, orgUnitId: string, extra: Partial<MembershipRecord> = {}): MembershipRecord => ({
  id, personId, label: 'Member', orgUnitId, systemId: null, status: 'ACTIVE', startDate: '2020-01-01', ...extra,
});
const off = (id: string, personId: string, orgUnitId: string, extra: Partial<OfficeRecord> = {}): OfficeRecord => ({
  id, personId, title: 'President', office: 'PRESIDENT', orgUnitId, systemId: null, status: 'ACTIVE', startDate: '2020-01-01', ...extra,
});

describe('organisation tree', () => {
  it('lists parents before children, ordered by name, with depth', () => {
    expect(flattenTree(units).map((r) => `${r.depth}:${r.unit.id}`)).toEqual(['0:c', '1:b', '2:s', '1:a', '0:x']);
  });
  it('treats a unit whose parent is missing as a root', () => {
    expect(flattenTree(units).find((r) => r.unit.id === 'x')!.depth).toBe(0);
  });
  it('never hangs on a loop in the data', () => {
    const loop = [unit('p', 'P', 'q'), unit('q', 'Q', 'p')];
    expect(flattenTree(loop)).toEqual([]);
    expect(unitPath(loop, 'p').length).toBeLessThanOrEqual(2);
  });
  it('gives the path from the top', () => {
    expect(unitPath(units, 's')).toEqual(['Church', 'Choir', 'Sopranos']);
    expect(unitPath(units, 'nope')).toEqual([]);
  });
});

describe('belonging', () => {
  it('counts only live memberships and offices', () => {
    expect(isLive({ status: 'ACTIVE', startDate: '2020-01-01' }, today)).toBe(true);
    expect(isLive({ status: 'ENDED', startDate: '2020-01-01' }, today)).toBe(false);
    expect(isLive({ status: 'ACTIVE', startDate: '2027-01-01' }, today)).toBe(false);
    expect(isLive({ status: 'ACTIVE', startDate: '2020-01-01', endDate: '2026-01-01' }, today)).toBe(false);
  });
  it('lists unit members once each, and the live office holders', () => {
    const ms = [mem('1', 'p1', 'b'), mem('2', 'p1', 'b'), mem('3', 'p2', 'b'), mem('4', 'p3', 'b', { status: 'ENDED' }), mem('5', 'p4', 'a')];
    expect(membersOf('b', ms, today).sort()).toEqual(['p1', 'p2']);
    const os = [off('o1', 'p1', 'b'), off('o2', 'p2', 'b', { status: 'ENDED' })];
    expect(officeHoldersOf('b', os, today).map((o) => o.id)).toEqual(['o1']);
  });
  it('shows a person their units and offices by name', () => {
    const b = belongingOf('p1', { units, memberships: [mem('1', 'p1', 'b'), mem('2', 'p2', 'a')], offices: [off('o1', 'p1', 'b')] }, today);
    expect(b.memberships.map((m) => m.unit?.name)).toEqual(['Choir']);
    expect(b.offices.map((o) => o.office)).toEqual(['PRESIDENT']);
  });
});
