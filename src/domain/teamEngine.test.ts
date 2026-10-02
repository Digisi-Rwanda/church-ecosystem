import { describe, expect, it } from 'vitest';
import { buildProtocolTeams, musicConflictCode } from './teamEngine';
import type { ProtocolRosterMember, ProtocolSchedulingRules, ProtocolService } from './types';

const member = { personId: 'p1' } as ProtocolRosterMember;
const svc = (id: string): ProtocolService =>
  ({ id, musicServiceId: id, kind: 'TUESDAY' }) as ProtocolService;

describe('musicConflictCode', () => {
  it('worship-team member is only allowed where Worship is scheduled', () => {
    const units = new Map([['p1', new Set(['mu-worship'])]]);
    const on = new Map([['tue', new Set(['mu-worship', 'mu-elim'])], ['sun', new Set(['mu-hope'])]]);
    expect(musicConflictCode(member, svc('tue'), units, on, true, true)).toBeUndefined();
    expect(musicConflictCode(member, svc('sun'), units, on, true, true)).toBe('WORSHIP_NOT_SCHEDULED');
  });

  it('the worship rule can be switched off independently of the choir rule', () => {
    const units = new Map([['p1', new Set(['mu-worship'])]]);
    const on = new Map([['sun', new Set(['mu-hope'])]]);
    expect(musicConflictCode(member, svc('sun'), units, on, true, false)).toBeUndefined();
  });

  it('a choir member is allowed when any of their units is on the service', () => {
    const units = new Map([['p1', new Set(['mu-elim', 'mu-worship'])]]);
    const on = new Map([['s', new Set(['mu-elim'])], ['t', new Set(['mu-ijwi'])]]);
    expect(musicConflictCode(member, svc('s'), units, on, true, true)).toBeUndefined();
    expect(musicConflictCode(member, svc('t'), units, on, true, true)).toBe('CHOIR_NOT_SCHEDULED');
  });

  it('a person in no choir is never blocked', () => {
    expect(musicConflictCode(member, svc('x'), new Map(), new Map(), true, true)).toBeUndefined();
  });
});

describe('Extra (4th) duties and a nearly full roster', () => {
  const rules = {
    preferTarget: 3,
    softMax: 3,
    hardMax: 4,
    defaultTeamSize: 10,
    requireChoirOnService: false,
  } as ProtocolSchedulingRules;
  const svc2 = (id: string, date: string, kind: ProtocolService['kind']) =>
    ({ id, musicServiceId: id, label: `${kind} ${date}`, date, kind, monthKey: '2026-10', targetTeamSize: 10 }) as ProtocolService;
  // October 2026: 4 Tuesdays, 4 Sundays with two services, and Igaburo last.
  const services: ProtocolService[] = [
    ...['06', '13', '20', '27'].map((d) => svc2(`t${d}`, `2026-10-${d}`, 'TUESDAY')),
    ...['04', '11', '18', '25'].flatMap((d) => [
      svc2(`a${d}`, `2026-10-${d}`, 'SS1'),
      svc2(`b${d}`, `2026-10-${d}`, 'SS2'),
    ]),
    svc2('ig', '2026-10-31', 'IGABURO'),
  ];
  const person = (i: number, extra: Partial<ProtocolRosterMember> = {}) =>
    ({ id: `r${i}`, personId: `p${i}`, status: 'ACTIVE', serveDays: 'BOTH', unavailableDates: [], ...extra }) as ProtocolRosterMember;
  const run = (roster: ProtocolRosterMember[]) => {
    const { slots } = buildProtocolTeams({ services, roster, rules, choirUnits: new Map(), unitsOnService: new Map() });
    const perService = (id: string) => slots.filter((s) => s.serviceId === id).length;
    const perPerson = new Map<string, number>();
    for (const sl of slots) perPerson.set(sl.personId, (perPerson.get(sl.personId) ?? 0) + 1);
    return { perService, maxDuties: Math.max(...perPerson.values()), shortServices: services.filter((s) => perService(s.id) < 10) };
  };

  it('13 services x 10 people are covered by 41-45 people, however the last duties fall', () => {
    for (const n of [41, 42, 43, 44, 45]) {
      const r = run(Array.from({ length: n }, (_, i) => person(i)));
      expect(r.shortServices, `${n} people`).toHaveLength(0);
      expect(r.maxDuties).toBeLessThanOrEqual(rules.hardMax);
    }
  });

  it('adding a person never makes a team smaller, even if they can only serve some services', () => {
    const base = Array.from({ length: 42 }, (_, i) => person(i));
    for (const added of [
      person(100),
      person(100, { serveDays: 'TUESDAY' }),
      person(100, { allowedServiceKinds: ['SS1'] }),
      person(100, { unavailableDates: ['2026-10-31'] }),
    ]) {
      const r = run([...base, added]);
      expect(r.shortServices).toHaveLength(0);
    }
  });

  it('with too few people the shortfall is real, and nobody is given more than the maximum', () => {
    const r = run(Array.from({ length: 30 }, (_, i) => person(i)));
    expect(r.shortServices.length).toBeGreaterThan(0);
    expect(r.maxDuties).toBeLessThanOrEqual(rules.hardMax);
  });
});
