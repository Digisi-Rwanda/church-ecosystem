import { describe, expect, it } from 'vitest';
import { limitToCentral, type Capabilities, type PortalSystem } from './frontDoorApi';

const sys = (id: string): PortalSystem => ({ id, code: id, name: id, shortName: id, basePath: `/${id}`, role: 'x', unreadCount: 0 });
const caps = (codes: Array<string | null>): Capabilities => ({
  personId: 'p',
  offices: codes.map((code, i) => ({ id: `o${i}`, systemId: null, title: 't', code: code as never })),
  systems: [{ id: 'sys-main', blocks: {} as never }, { id: 'sys-choir', blocks: {} as never }],
  blockOrder: [],
});
const world = (codes: Array<string | null>) => ({ systems: [sys('sys-main'), sys('sys-choir')], capabilities: caps(codes) });

describe('limitToCentral', () => {
  it('keeps only Central for a church leader or catechist', () => {
    for (const codes of [['CHURCH_LEADER'], ['CHURCH_LEADER', 'CATECHIST'], ['CATECHIST']]) {
      const r = limitToCentral(world(codes));
      expect(r.systems.map((s) => s.id)).toEqual(['sys-main']);
      expect(r.capabilities.systems.map((s) => s.id)).toEqual(['sys-main']);
    }
  });
  it('leaves everyone else alone', () => {
    expect(limitToCentral(world(['CHURCH_LEADER', 'PRESIDENT'])).systems).toHaveLength(2);
    expect(limitToCentral(world([])).systems).toHaveLength(2);
  });
});
