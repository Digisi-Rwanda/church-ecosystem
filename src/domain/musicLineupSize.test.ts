import { afterEach, describe, expect, it } from 'vitest';
import { addMusicUnit, resetMusicUnits, setMusicUnitActive } from './musicUnits';
import { musicConflictCode } from './teamEngine';
import type { ProtocolRosterMember, ProtocolService } from './types';
import type { MusicScheduleUnit } from './musicSchedule';
import { buildMusicCalendar, generateMusicChoirSchedule, validateSchedule } from './musicScheduleEngine';

const units = (primaries: number, opts: { worship?: boolean; secondary?: number; children?: number } = {}): MusicScheduleUnit[] => [
  ...Array.from({ length: primaries }, (_, i) => ({ id: `u${i}`, kind: 'PRIMARY' as const, name: `Choir ${i}`, active: true })),
  ...Array.from({ length: opts.secondary ?? 0 }, (_, i) => ({ id: `s${i}`, kind: 'SECONDARY' as const, name: `Second ${i}`, active: true })),
  ...Array.from({ length: opts.children ?? 0 }, (_, i) => ({ id: `c${i}`, kind: 'CHILDREN' as const, name: `Kids ${i}`, active: true })),
  ...(opts.worship ? [{ id: 'w0', kind: 'WORSHIP' as const, name: 'Worship', active: true }] : []),
];

describe('the Music engine follows whatever lineup it is given', () => {
  for (const n of [2, 3, 4, 5, 7, 9, 12]) {
    it(`${n} primary choirs + worship: a quarter schedules and validates, and everyone sings`, () => {
      const u = units(n, { worship: true });
      const services = buildMusicCalendar('2026-11', 'QUARTER');
      const r = generateMusicChoirSchedule({ services, units: u, seed: 7 });
      expect(r.reason ?? '').toBe('');
      expect(r.ok).toBe(true);
      expect(validateSchedule(services, r.assignments, 'strict', u).ok).toBe(true);
      const used = new Set(r.assignments.map((a) => a.unitId));
      // every choir is used at least once across a quarter (fairness), except when there are more than the slots can hold
      if (n <= 7) for (const x of u) expect(used.has(x.id)).toBe(true);
    });
  }
  it('one primary cannot work (Igaburo needs two): the engine says so', () => {
    const r = generateMusicChoirSchedule({ services: buildMusicCalendar('2026-11', 'MONTH'), units: units(1), seed: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/At least 2/);
  });
  it('secondary and children choirs of any number', () => {
    const u = units(4, { worship: true, secondary: 2, children: 1 });
    const services = buildMusicCalendar('2026-11', 'MONTH');
    const r = generateMusicChoirSchedule({ services, units: u, seed: 3 });
    expect(r.reason ?? '').toBe('');
    expect(r.ok).toBe(true);
  });
});

describe('the Protocol choir rule follows the live lineup too', () => {
  afterEach(() => resetMusicUnits());
  const member = { personId: 'p1', id: 'r1', office: 'MEMBER', serveDays: 'BOTH', status: 'ACTIVE', unavailableDates: [] } as ProtocolRosterMember;
  const svc = { id: 'x', kind: 'SS1', date: '2026-11-01', musicServiceId: 'm1' } as ProtocolService;

  it('a member of a choir added later is held to that choir\'s services', () => {
    const gamma = addMusicUnit({ name: 'Gamma Chorale', kind: 'PRIMARY' }).unit!;
    const delta = addMusicUnit({ name: 'Delta Voices', kind: 'PRIMARY' }).unit!;
    const mine = new Map([['p1', new Set([gamma.id])]]);
    // their choir sings this service: fine
    expect(musicConflictCode(member, svc, mine, new Map([['m1', new Set([gamma.id])]]), true)).toBeUndefined();
    // another choir sings it: they are not on the schedule that day
    expect(musicConflictCode(member, svc, mine, new Map([['m1', new Set([delta.id])]]), true)).toBe('CHOIR_NOT_SCHEDULED');
    // the Coordinator's relaxation (rule off) still lifts it
    expect(musicConflictCode(member, svc, mine, new Map([['m1', new Set([delta.id])]]), false)).toBeUndefined();
  });

  it('a worship unit is told apart from a choir by its kind, not its name', () => {
    const w = addMusicUnit({ name: 'Praise Band', kind: 'WORSHIP' }).unit!;
    const mine = new Map([['p1', new Set([w.id])]]);
    expect(musicConflictCode(member, svc, mine, new Map(), true, true)).toBe('WORSHIP_NOT_SCHEDULED');
    expect(setMusicUnitActive(w.id, false).ok).toBe(true);
  });
});
