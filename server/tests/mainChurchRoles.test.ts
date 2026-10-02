/** Main-church role reach on the SERVER engine (mirrors src/domain/access.critical.test.ts). */
import { describe, expect, it } from 'vitest';
import { authorize, buildEffectiveAccess } from '../src/policy/buildAccess';
import { SYSTEMS } from './world';

const now = new Date('2026-10-01T12:00:00Z');
const base = { memberships: [] as any[], assignments: [] as any[], tasks: [] as any[], allSystemIds: SYSTEMS, fundGrants: [] as any[] };
const pos = (role: string, extra: any = {}) => ({ id: `pos-${role}`, personId: 'p', title: role, systemRole: role, status: 'ACTIVE', startDate: '2020-01-01', ...extra });
const enterable = (positions: any[]) => {
  const grants = buildEffectiveAccess('p', { ...base, positions }, now);
  return SYSTEMS.filter((s) => authorize({ personId: 'p', systemId: s, resource: 'SYSTEM', action: 'ENTER' }, grants).allowed).sort();
};

describe('server: governance reach by role', () => {
  it('PASTOR → Main Church + Evangelism only', () => {
    expect(enterable([pos('PASTOR')])).toEqual(['sys-evangelism', 'sys-main']);
  });
  it('PASTOR stays scoped even if the legacy grantsAllSystems flag is on', () => {
    expect(enterable([pos('PASTOR', { grantsAllSystems: true })])).toEqual(['sys-evangelism', 'sys-main']);
  });
  it('CHURCH_LEADER → every system', () => {
    expect(enterable([pos('CHURCH_LEADER')]).length).toBe(SYSTEMS.length);
  });
  it('CATECHIST → every system', () => {
    expect(enterable([pos('CATECHIST')]).length).toBe(SYSTEMS.length);
  });
  it('ASSISTANT_PASTOR is no longer a role → no governance at all', () => {
    expect(enterable([pos('ASSISTANT_PASTOR')])).toEqual(['sys-main']);
  });
  it('TREASURER / SECRETARY never get system-wide reach', () => {
    expect(enterable([pos('CHURCH_TREASURER', { systemId: 'sys-finance' })])).toEqual(['sys-finance', 'sys-main']);
    expect(enterable([pos('CHURCH_SECRETARY')])).toEqual(['sys-main']);
  });
});
