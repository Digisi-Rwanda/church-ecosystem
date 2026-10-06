import { describe, expect, it } from 'vitest';
import type { PortalSystem } from '../api/frontDoorApi';
import { churchWideLink, landingPath, myUnits } from './portalHome';

const sys = (id: string): PortalSystem => ({ id, code: id, name: id, shortName: id, basePath: `/${id}`, role: 'Member', unreadCount: 0 });

describe('church-wide landing', () => {
  const member = [sys('sys-main'), sys('sys-choir'), sys('sys-youth')];
  it('lands on the church-wide home when the person may enter it', () => {
    expect(landingPath(member)).toBe('/s/sys-main');
  });
  it('falls back to the card page when the person may not enter the church level', () => {
    expect(landingPath([sys('sys-choir')])).toBeNull();
    expect(landingPath([])).toBeNull();
  });
  it('lists only the unit systems under My units', () => {
    expect(myUnits(member).map((s) => s.id)).toEqual(['sys-choir', 'sys-youth']);
    expect(myUnits([sys('sys-main')])).toEqual([]);
  });
  it('offers the way back to church-wide from a unit, but not from the church itself', () => {
    expect(churchWideLink(member, 'sys-choir')).toBe('/s/sys-main');
    expect(churchWideLink(member, 'sys-main')).toBeNull();
    expect(churchWideLink([sys('sys-choir')], 'sys-choir')).toBeNull();
  });
});
