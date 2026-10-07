/** The old Music engine, ported to the server: these are its original tests with the lineup passed in. */
import { describe, expect, it } from 'vitest';
import type { MusicScheduleUnit } from '../src/music/types';
import { buildMusicCalendar, generateMusicChoirSchedule, periodOptionsForHorizon, validateSchedule } from '../src/music/engine';

const DEFAULT: MusicScheduleUnit[] = [
  { id: 'mu-ijwi', kind: 'PRIMARY', name: "Ijwi ry' umwami Yesu", active: true },
  { id: 'mu-elbethel', kind: 'PRIMARY', name: 'El bethel', active: true },
  { id: 'mu-elim', kind: 'PRIMARY', name: 'Elim', active: true },
  { id: 'mu-integuza', kind: 'PRIMARY', name: 'Integuza', active: true },
  { id: 'mu-beulah', kind: 'SECONDARY', name: 'Beulah', active: true },
  { id: 'mu-yerusalemu', kind: 'SECONDARY', name: 'Yerusalemu', active: true },
  { id: 'mu-hope', kind: 'CHILDREN', name: 'Hope', active: true },
  { id: 'mu-worship', kind: 'WORSHIP', name: 'Worship team', active: true },
];
const primaryIds = DEFAULT.filter((u) => u.kind === 'PRIMARY').map((u) => u.id);

describe('music engine: the church lineup', () => {
  it('builds SS1/SS2, midweek, and Igaburo for a month', () => {
    const services = buildMusicCalendar('2026-03', 'MONTH');
    for (const k of ['SS1', 'SS2', 'TUESDAY', 'FRIDAY']) expect(services.some((s) => s.kind === k)).toBe(true);
    expect(services.filter((s) => s.kind === 'IGABURO')).toHaveLength(1);
    expect(services.filter((s) => s.kind === 'SS1')).toHaveLength(5);
  });
  it('generates a valid schedule for 4- and 5-Sunday months', () => {
    for (const [month, seed, sundays] of [['2026-04', 42, 4], ['2026-03', 7, 5]] as const) {
      const services = buildMusicCalendar(month, 'MONTH');
      expect(services.filter((s) => s.kind === 'SS1')).toHaveLength(sundays);
      const r = generateMusicChoirSchedule({ services, units: DEFAULT, seed, attempts: 100 });
      expect(r.ok).toBe(true);
      expect(validateSchedule(services, r.assignments, 'strict', DEFAULT).ok).toBe(true);
      for (const s of services.filter((x) => x.kind === 'SS1')) expect(r.assignments.some((a) => a.serviceId === s.id && a.unitId === 'mu-hope')).toBe(true);
      for (const s of services.filter((x) => x.kind === 'TUESDAY')) {
        expect(r.assignments.some((a) => a.serviceId === s.id && a.unitId === 'mu-worship')).toBe(true);
        expect(r.assignments.filter((a) => a.serviceId === s.id && primaryIds.includes(a.unitId))).toHaveLength(1);
      }
    }
  });
  it('uses stable service ids (date + kind)', () => {
    const a = buildMusicCalendar('2026-09', 'MONTH');
    const b = buildMusicCalendar('2026-09', 'MONTH');
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(a.find((x) => x.kind === 'SS1')!.id).toMatch(/^msvc-2026-09-\d\d-SS1$/);
  });
  it('a retired choir is never scheduled, but stays valid in history', () => {
    const units = DEFAULT.map((u) => (u.id === 'mu-elim' ? { ...u, active: false } : u));
    const services = buildMusicCalendar('2026-09', 'MONTH');
    const r = generateMusicChoirSchedule({ services, units, seed: 5, attempts: 200 });
    expect(r.ok).toBe(true);
    expect(r.assignments.some((a) => a.unitId === 'mu-elim')).toBe(false);
    const hist = [{ id: 'x', serviceId: services.find((s) => s.kind === 'TUESDAY')!.id, unitId: 'mu-elim', source: 'MANUAL' as const }];
    expect(validateSchedule(services, hist, 'manual', units).reason).toBeUndefined();
  });
  it('a manual edit that breaks a hard rule is refused, a soft one only warns', () => {
    const services = buildMusicCalendar('2026-09', 'MONTH');
    const tue = services.find((s) => s.kind === 'TUESDAY')!;
    const ss2 = services.find((s) => s.kind === 'SS2')!;
    const hard = validateSchedule(services, [{ id: 'a', serviceId: ss2.id, unitId: 'mu-hope', source: 'MANUAL' }], 'manual', DEFAULT);
    expect(hard.ok).toBe(false);
    const soft = validateSchedule(services, [{ id: 'a', serviceId: tue.id, unitId: 'mu-worship', source: 'MANUAL' }], 'manual', DEFAULT);
    expect(soft.ok).toBe(true);
    expect(soft.warnings.length).toBeGreaterThan(0);
  });
});

function lineup(opts: { primaries: number; secondaries: number; children?: number; worship?: number }): MusicScheduleUnit[] {
  const mk = (kind: MusicScheduleUnit['kind'], n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `mu-${tag}${i + 1}`, kind, name: `${tag}${i + 1}`, active: true }));
  return [...mk('PRIMARY', opts.primaries, 'p'), ...mk('SECONDARY', opts.secondaries, 's'), ...mk('CHILDREN', opts.children ?? 1, 'c'), ...mk('WORSHIP', opts.worship ?? 1, 'w')];
}

describe('music engine: configurable lineup', () => {
  const months = ['2026-03', '2026-04', '2026-09', '2026-10'];
  const cases: Array<[string, Parameters<typeof lineup>[0]]> = [
    ['5 primaries', { primaries: 5, secondaries: 2 }],
    ['6 primaries', { primaries: 6, secondaries: 2 }],
    ['3 primaries', { primaries: 3, secondaries: 2 }],
    ['2 primaries', { primaries: 2, secondaries: 1 }],
    ['3 secondaries', { primaries: 4, secondaries: 3 }],
    ['no secondaries', { primaries: 4, secondaries: 0 }],
    ['2 children choirs', { primaries: 4, secondaries: 2, children: 2 }],
    ['no worship team', { primaries: 4, secondaries: 2, worship: 0 }],
  ];
  for (const [name, cfg] of cases) {
    it(`generates a valid schedule: ${name}`, () => {
      const units = lineup(cfg);
      for (const m of months) {
        const services = buildMusicCalendar(m, 'MONTH');
        const r = generateMusicChoirSchedule({ services, units, seed: 11, attempts: 200 });
        expect(r.reason ?? '', `${name} ${m}`).toBe('');
        expect(r.ok).toBe(true);
        expect(validateSchedule(services, r.assignments, 'strict', units).ok).toBe(true);
        const primaries = units.filter((u) => u.kind === 'PRIMARY').map((u) => u.id);
        const sundayIds = new Set(services.filter((s) => s.kind === 'SS1' || s.kind === 'SS2').map((s) => s.id));
        const counts = primaries.map((p) => r.assignments.filter((a) => a.unitId === p && sundayIds.has(a.serviceId)).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        for (const sec of units.filter((u) => u.kind === 'SECONDARY')) expect(r.assignments.filter((a) => a.unitId === sec.id)).toHaveLength(1);
        for (const c of units.filter((u) => u.kind === 'CHILDREN')) expect(r.assignments.filter((a) => a.unitId === c.id)).toHaveLength(services.filter((s) => s.kind === 'SS1').length);
      }
    });
  }
  it('reports a lineup that cannot work instead of looping', () => {
    const r = generateMusicChoirSchedule({ services: buildMusicCalendar('2026-09', 'MONTH'), units: lineup({ primaries: 1, secondaries: 1 }), seed: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/2 active primary/);
  });
  it('reports more secondary choirs than Sundays', () => {
    const r = generateMusicChoirSchedule({ services: buildMusicCalendar('2026-09', 'MONTH'), units: lineup({ primaries: 4, secondaries: 5 }), seed: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Sundays/);
  });
  for (const n of [2, 3, 4, 5, 7, 9, 12]) {
    it(`${n} primary choirs + worship: a quarter schedules and validates`, () => {
      const u = lineup({ primaries: n, secondaries: 0 });
      const services = buildMusicCalendar('2026-11', 'QUARTER');
      const r = generateMusicChoirSchedule({ services, units: u, seed: 7 });
      expect(r.reason ?? '').toBe('');
      expect(r.ok).toBe(true);
      expect(validateSchedule(services, r.assignments, 'strict', u).ok).toBe(true);
    });
  }
});

describe('period options follow the horizon', () => {
  it('month: every month from the live one', () => {
    const o = periodOptionsForHorizon('MONTH', '2026-09');
    expect(o[0].value).toBe('2026-09');
    expect(o[1].value).toBe('2026-10');
    expect(o[0].label).toBe('Sep 2026');
  });
  it('quarter: calendar quarters, starting after the live month if it is mid-quarter', () => {
    const o = periodOptionsForHorizon('QUARTER', '2026-09');
    expect(o.slice(0, 3).map((x) => x.value)).toEqual(['2026-10', '2027-01', '2027-04']);
    expect(periodOptionsForHorizon('QUARTER', '2026-10')[0].value).toBe('2026-10');
  });
  it('half year and year are calendar aligned', () => {
    expect(periodOptionsForHorizon('HALF', '2026-09').slice(0, 2).map((x) => x.value)).toEqual(['2027-01', '2027-07']);
    expect(periodOptionsForHorizon('YEAR', '2026-09')[0].value).toBe('2027-01');
  });
});
