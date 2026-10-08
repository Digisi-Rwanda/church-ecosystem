import { describe, expect, it } from 'vitest';
import type { PortalSystem } from '../api/frontDoorApi';
import { filterSystems, groupByKind, kindOfSystem, landingPath, pinnedFirst, waitingBySystem } from './portalHome';

const sys = (id: string): PortalSystem => ({ id, code: id, name: id, shortName: id, basePath: `/${id}`, role: 'Member', unreadCount: 0 });

describe('the Portal', () => {
  it('goes straight into the only system a person has', () => {
    expect(landingPath([sys('sys-choir')])).toBe('/s/sys-choir');
    expect(landingPath([sys('sys-choir'), sys('sys-finance')])).toBe('/s/sys-choir');
  });
  it('shows the Portal for two or more systems, or none', () => {
    expect(landingPath([sys('sys-main'), sys('sys-choir')])).toBeNull();
    expect(landingPath([])).toBeNull();
  });
  it('groups the cards as Central Administration, organisations and ministries, and never opens Finance', () => {
    const groups = groupByKind([sys('sys-youth'), sys('sys-finance'), sys('sys-choir'), sys('sys-main'), sys('sys-media')]);
    expect(groups.map((g) => g.kind)).toEqual(['central', 'organisation', 'ministry']);
    expect(groups[1]!.systems.map((s) => s.id)).toEqual(['sys-choir', 'sys-media']);
    expect(groups.flatMap((g) => g.systems.map((s) => s.id))).not.toContain('sys-finance');
  });
  it('knows each kind', () => {
    expect(kindOfSystem('sys-protocol')).toBe('organisation');
    expect(kindOfSystem('sys-music')).toBe('ministry');
  });
});

describe('the Portal home helpers', () => {
  const all = [sys('sys-main'), sys('sys-choir'), sys('sys-youth')];
  it('searches by name or role, every word must match', () => {
    expect(filterSystems(all, 'choir').map((s) => s.id)).toEqual(['sys-choir']);
    expect(filterSystems(all, 'member sys-y').map((s) => s.id)).toEqual(['sys-youth']);
    expect(filterSystems(all, '  ')).toHaveLength(3);
    expect(filterSystems(all, 'zzz')).toHaveLength(0);
  });
  it('puts pinned systems first and ignores pins of systems the person no longer has', () => {
    const r = pinnedFirst(all, ['sys-youth', 'sys-gone', 'sys-main']);
    expect(r.pinned.map((s) => s.id)).toEqual(['sys-youth', 'sys-main']);
    expect(r.rest.map((s) => s.id)).toEqual(['sys-choir']);
  });
  it('counts what waits per system', () => {
    const m = waitingBySystem([{ systemId: 'a', overdue: true }, { systemId: 'a' }, { systemId: 'b' }]);
    expect(m.get('a')).toEqual({ open: 2, overdue: 1 });
    expect(m.get('b')).toEqual({ open: 1, overdue: 0 });
  });
});
