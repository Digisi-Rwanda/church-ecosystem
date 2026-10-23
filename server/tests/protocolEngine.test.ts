/** The old Protocol team engine, ported to the server: its original tests, with the unit kinds passed in. */
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_SCORE_POINTS, buildProtocolTeams, canServeKind, musicConflictCode, rankLeaderCandidates, scoreAttendanceRow, validateProtocolTeamsDetailed,
} from '../src/protocol/engine';
import type { ProtocolRosterMember, ProtocolSchedulingRules, ProtocolService, ProtocolTeamSlot } from '../src/protocol/types';

const kindOf = (u: string) => (u.includes('worship') ? 'WORSHIP' : 'PRIMARY');
const member = { personId: 'p1' } as ProtocolRosterMember;
const svc = (id: string): ProtocolService => ({ id, musicServiceId: id, kind: 'TUESDAY' }) as ProtocolService;

describe('musicConflictCode', () => {
  it('worship-team member is only allowed where Worship is scheduled', () => {
    const units = new Map([['p1', new Set(['mu-worship'])]]);
    const on = new Map([['tue', new Set(['mu-worship', 'mu-elim'])], ['sun', new Set(['mu-hope'])]]);
    expect(musicConflictCode(member, svc('tue'), units, on, true, true, kindOf)).toBeUndefined();
    expect(musicConflictCode(member, svc('sun'), units, on, true, true, kindOf)).toBe('WORSHIP_NOT_SCHEDULED');
  });
  it('the worship rule can be switched off independently of the choir rule', () => {
    const units = new Map([['p1', new Set(['mu-worship'])]]);
    const on = new Map([['sun', new Set(['mu-hope'])]]);
    expect(musicConflictCode(member, svc('sun'), units, on, true, false, kindOf)).toBeUndefined();
  });
  it('a choir member is allowed when any of their units is on the service', () => {
    const units = new Map([['p1', new Set(['mu-elim', 'mu-worship'])]]);
    const on = new Map([['s', new Set(['mu-elim'])], ['t', new Set(['mu-ijwi'])]]);
    expect(musicConflictCode(member, svc('s'), units, on, true, true, kindOf)).toBeUndefined();
    expect(musicConflictCode(member, svc('t'), units, on, true, true, kindOf)).toBe('CHOIR_NOT_SCHEDULED');
  });
  it('a person in no choir is never blocked', () => {
    expect(musicConflictCode(member, svc('x'), new Map(), new Map(), true, true, kindOf)).toBeUndefined();
  });
  it('a choir added later is held to its own services; the Coordinator relaxation lifts it', () => {
    const m = { personId: 'p1' } as ProtocolRosterMember;
    const s = { id: 'x', kind: 'SS1', date: '2026-11-01', musicServiceId: 'm1' } as ProtocolService;
    const mine = new Map([['p1', new Set(['gamma'])]]);
    expect(musicConflictCode(m, s, mine, new Map([['m1', new Set(['gamma'])]]), true, true, kindOf)).toBeUndefined();
    expect(musicConflictCode(m, s, mine, new Map([['m1', new Set(['delta'])]]), true, true, kindOf)).toBe('CHOIR_NOT_SCHEDULED');
    expect(musicConflictCode(m, s, mine, new Map([['m1', new Set(['delta'])]]), false, false, kindOf)).toBeUndefined();
  });
});

describe('Extra (4th) duties and a nearly full roster', () => {
  const rules = { preferTarget: 3, softMax: 3, hardMax: 4, defaultTeamSize: 10, requireChoirOnService: false } as ProtocolSchedulingRules;
  const svc2 = (id: string, date: string, kind: ProtocolService['kind']) =>
    ({ id, musicServiceId: id, label: `${kind} ${date}`, date, kind, monthKey: '2026-10', targetTeamSize: 10 }) as ProtocolService;
  const services: ProtocolService[] = [
    ...['06', '13', '20', '27'].map((d) => svc2(`t${d}`, `2026-10-${d}`, 'TUESDAY')),
    ...['04', '11', '18', '25'].flatMap((d) => [svc2(`a${d}`, `2026-10-${d}`, 'SS1'), svc2(`b${d}`, `2026-10-${d}`, 'SS2')]),
    svc2('ig', '2026-10-31', 'IGABURO'),
  ];
  const person = (i: number, extra: Partial<ProtocolRosterMember> = {}) =>
    ({ id: `r${i}`, personId: `p${i}`, status: 'ACTIVE', serveDays: 'BOTH', unavailableDates: [], ...extra }) as ProtocolRosterMember;
  const run = (roster: ProtocolRosterMember[]) => {
    const { slots } = buildProtocolTeams({ services, roster, rules, choirUnits: new Map(), unitsOnService: new Map(), kindOf });
    const perService = (id: string) => slots.filter((s) => s.serviceId === id).length;
    const perPerson = new Map<string, number>();
    for (const sl of slots) perPerson.set(sl.personId, (perPerson.get(sl.personId) ?? 0) + 1);
    return { slots, perService, maxDuties: Math.max(...perPerson.values()), shortServices: services.filter((s) => perService(s.id) < 10) };
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
    for (const added of [person(100), person(100, { serveDays: 'TUESDAY' }), person(100, { allowedServiceKinds: ['SS1'] }), person(100, { unavailableDates: ['2026-10-31'] })]) {
      expect(run([...base, added]).shortServices).toHaveLength(0);
    }
  });
  it('with too few people the shortfall is real, and nobody is given more than the maximum', () => {
    const r = run(Array.from({ length: 30 }, (_, i) => person(i)));
    expect(r.shortServices.length).toBeGreaterThan(0);
    expect(r.maxDuties).toBeLessThanOrEqual(rules.hardMax);
  });
  it('nobody serves both Sunday services on one day, and each team has a recommended leader and vice leader', () => {
    const r = run(Array.from({ length: 45 }, (_, i) => person(i)));
    const issues = validateProtocolTeamsDetailed({ services, roster: Array.from({ length: 45 }, (_, i) => person(i)), slots: r.slots, rules, choirUnits: new Map(), unitsOnService: new Map(), kindOf });
    expect(issues.filter((i) => i.severity === 'BLOCKING')).toEqual([]);
    for (const s of services) {
      const roles = r.slots.filter((x) => x.serviceId === s.id).map((x) => x.recommendedRole);
      expect(roles).toContain('TEAM_LEADER');
      expect(roles).toContain('VICE_LEADER');
    }
  });
});

describe('who can serve, and the leaders', () => {
  const m = (extra: Partial<ProtocolRosterMember>) => ({ personId: 'p', status: 'ACTIVE', serveDays: 'BOTH', unavailableDates: [], ...extra }) as ProtocolRosterMember;
  it('serve days, allowed kinds and picked services decide', () => {
    expect(canServeKind(m({ serveDays: 'TUESDAY' }), 'TUESDAY')).toBe(true);
    expect(canServeKind(m({ serveDays: 'TUESDAY' }), 'SS1')).toBe(false);
    expect(canServeKind(m({ serveDays: 'SUNDAY' }), 'IGABURO')).toBe(true);
    expect(canServeKind(m({ allowedServiceKinds: ['SS1'] }), 'SS2')).toBe(false);
    const only = m({ onlyServices: [{ date: '2026-10-04', kind: 'SS1' }] });
    expect(canServeKind(only, 'SS1', '2026-10-04')).toBe(true);
    expect(canServeKind(only, 'SS2', '2026-10-11')).toBe(false);
    expect(canServeKind(only, 'SS2', '2026-11-08')).toBe(true);
  });
  it('leaders are ranked by office, then fewest led, then name', () => {
    const roster = new Map([['a', m({ personId: 'a', office: 'MEMBER' })], ['b', m({ personId: 'b', office: 'PRESIDENT' })], ['c', m({ personId: 'c', office: 'MEMBER' })]]);
    expect(rankLeaderCandidates(['a', 'b', 'c'], roster)).toEqual(['b', 'a', 'c']);
    expect(rankLeaderCandidates(['a', 'b', 'c'], roster, new Map([['a', 2]]))).toEqual(['b', 'c', 'a']);
  });
});

describe('scoring', () => {
  it('follows the old points', () => {
    expect(scoreAttendanceRow({ status: 'PRESENT' })).toBe(PROTOCOL_SCORE_POINTS.PRESENT);
    expect(scoreAttendanceRow({ status: 'HALF_PRESENT' })).toBe(3);
    expect(scoreAttendanceRow({ status: 'PRESENT', slotKind: 'EXTRA' })).toBe(7);
    expect(scoreAttendanceRow({ status: 'PRESENT', slotKind: 'FILL_IN' })).toBe(10);
    expect(scoreAttendanceRow({ status: 'ABSENT', slotKind: 'FILL_IN' })).toBe(-3);
    expect(scoreAttendanceRow({ status: 'EXCUSED' })).toBe(0);
  });
});

describe('validation', () => {
  const rules = { preferTarget: 3, softMax: 3, hardMax: 4, defaultTeamSize: 2, requireChoirOnService: true, requireWorshipOnService: true } as ProtocolSchedulingRules;
  const services = [
    { id: 'a', musicServiceId: 'ma', label: 'SS1', date: '2026-10-04', kind: 'SS1', monthKey: '2026-10', targetTeamSize: 2 },
    { id: 'b', musicServiceId: 'mb', label: 'SS2', date: '2026-10-04', kind: 'SS2', monthKey: '2026-10', targetTeamSize: 2 },
  ] as ProtocolService[];
  const roster = [
    { id: 'r1', personId: 'p1', status: 'ACTIVE', serveDays: 'BOTH', unavailableDates: [] },
    { id: 'r2', personId: 'p2', status: 'INACTIVE', serveDays: 'SUNDAY', unavailableDates: [] },
  ] as ProtocolRosterMember[];
  const slot = (serviceId: string, personId: string): ProtocolTeamSlot => ({ id: `${serviceId}${personId}`, serviceId, personId, source: 'MANUAL', role: 'MEMBER', slotKind: 'REGULAR' });
  it('flags double Sunday, inactive, unknown, choir not scheduled and short teams', () => {
    const issues = validateProtocolTeamsDetailed({
      services, roster, rules, kindOf,
      slots: [slot('a', 'p1'), slot('b', 'p1'), slot('a', 'p2'), slot('a', 'ghost')],
      choirUnits: new Map([['p1', new Set(['mu-elim'])]]),
      unitsOnService: new Map([['ma', new Set(['mu-elim'])], ['mb', new Set(['mu-ijwi'])]]),
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['DOUBLE_SUNDAY', 'NOT_ACTIVE', 'UNKNOWN_PERSON', 'CHOIR_NOT_SCHEDULED', 'TEAM_SHORT']));
    expect(issues.find((i) => i.code === 'TEAM_SHORT')!.severity).toBe('WARNING');
    expect(issues.find((i) => i.code === 'DOUBLE_SUNDAY')!.severity).toBe('BLOCKING');
    expect(new Set(issues.map((i) => i.key)).size).toBe(issues.length);
  });
});

describe('the monthly maximum has the last word', () => {
  const mk = (id: string, date: string): ProtocolService => ({ id, musicServiceId: id, label: id, date, kind: 'TUESDAY', monthKey: '2026-10', targetTeamSize: 1 }) as ProtocolService;
  const services = ['01', '02', '03', '04', '05', '06'].map((d) => mk(`s${d}`, `2026-10-${d}`));
  const byId = new Map(services.map((s) => [s.id, s]));
  it('drops anything beyond the maximum and any doubled place, and says so', async () => {
    const { enforceDutyCap } = await import('../src/protocol/engine');
    const slots = [...services.map((s, i) => ({ id: `a${i}`, serviceId: s.id, personId: 'p1', source: 'ENGINE', role: 'MEMBER', slotKind: i < 3 ? 'REGULAR' : 'EXTRA' })), { id: 'dup', serviceId: 's01', personId: 'p1', source: 'ENGINE', role: 'MEMBER', slotKind: 'EXTRA' }] as ProtocolTeamSlot[];
    const r = enforceDutyCap(slots, byId, { hardMax: 4 });
    expect(r.slots.filter((s) => s.personId === 'p1')).toHaveLength(4);
    expect(new Set(r.slots.map((s) => s.serviceId)).size).toBe(4);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('never counts a fill-in against the maximum', async () => {
    const { enforceDutyCap } = await import('../src/protocol/engine');
    const slots = services.map((s, i) => ({ id: `f${i}`, serviceId: s.id, personId: 'p2', source: 'FILL_IN', role: 'MEMBER', slotKind: 'FILL_IN' })) as ProtocolTeamSlot[];
    expect(enforceDutyCap(slots, byId, { hardMax: 4 }).slots).toHaveLength(6);
  });
});
