/** The old Music engine, ported to the server: these are its original tests with the lineup passed in. */
import { describe, expect, it } from 'vitest';
import type { MusicScheduleUnit } from '../src/music/types';
import { buildMusicCalendar, generateMusicChoirSchedule, periodOptionsForHorizon, validateConfigPolicies, validateSchedule } from '../src/music/engine';
import type { CategoryServicePolicyView, ChoirCategoryView, SchedulingServiceView } from '../src/scheduling/types';

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
  it('builds Music slots from the pinned shared calendar recurrence, names and flags', () => {
    const services = buildMusicCalendar('2026-03', 'MONTH', [
      { code: 'ss1', name: 'Sunday Gathering', weekday: 0, time: '10:30', recurrence: 'WEEKLY', selectedDates: [], active: true, musicRequired: true, protocolRequired: true },
      { code: 'igaburo', name: 'Communion', weekday: null, time: null, recurrence: 'MONTHLY', selectedDates: [], active: true, musicRequired: false, protocolRequired: true },
      { code: 'friday', name: 'Retired Friday', weekday: 5, time: '18:00', recurrence: 'WEEKLY', selectedDates: [], active: false, musicRequired: true, protocolRequired: false },
    ]);
    const sunday = services.filter((s) => s.kind === 'SS1');
    expect(sunday).toHaveLength(5);
    expect(sunday[0]).toMatchObject({ date: '2026-03-01', label: 'Sunday Gathering · 2026-03-01', time: '10:30', musicRequired: true, protocolRequired: true });
    expect(services.filter((s) => s.kind === 'IGABURO')).toHaveLength(1);
    expect(services.find((s) => s.kind === 'IGABURO')).toMatchObject({ musicRequired: false, protocolRequired: true });
    expect(services.some((s) => s.kind === 'FRIDAY')).toBe(false);
  });
  it('rejects calendar entries the fixed scheduling engines do not support', () => {
    expect(() => buildMusicCalendar('2026-03', 'MONTH', [
      { code: 'special', name: 'Special Service', weekday: 0, time: '09:00', recurrence: 'WEEKLY', selectedDates: [], active: true, musicRequired: true, protocolRequired: true },
    ])).toThrow(/Unsupported scheduling service code/);
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

describe('music engine: versioned category policies', () => {
  const service: SchedulingServiceView = {
    id: 'service-ss1-v1', systemId: 'sys-music', code: 'ss1', name: 'Sunday', kind: 'SERVICE',
    weekday: 0, time: '10:00', recurrence: 'WEEKLY', selectedDates: [], active: true,
    effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, musicRequired: true, protocolRequired: true,
    maxChoirs: 3, targetTeamSize: 10, configVersionId: 'music-v1', displayOrder: 0, supersedesId: null,
    createdByPersonId: 'leader', createdAt: '2026-01-01T00:00:00.000Z',
  };
  const category: ChoirCategoryView = {
    id: 'primary-v1', systemId: 'sys-music', code: 'PRIMARY', name: 'Primary', description: '',
    active: true, effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null,
    configVersionId: 'music-v1', supersedesId: null, createdByPersonId: 'leader',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const policy = (updates: Partial<CategoryServicePolicyView>): CategoryServicePolicyView => ({
    id: 'policy-v1', systemId: 'sys-music', categoryId: category.id, serviceId: service.id,
    eligible: true, active: true, frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'TARGET',
    planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false, configVersionId: 'music-v1',
    effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, supersedesId: null,
    createdByPersonId: 'leader', createdAt: '2026-01-01T00:00:00.000Z', ...updates,
  });
  const slot = buildMusicCalendar('2026-03', 'MONTH').find((entry) => entry.kind === 'SS1')!;
  const units: MusicScheduleUnit[] = [{ id: 'primary-choir', kind: 'PRIMARY', name: 'Primary choir' }];
  const validate = (configPolicy: CategoryServicePolicyView) => validateConfigPolicies({
    services: [slot],
    assignments: [{ id: 'assignment', serviceId: slot.id, unitId: 'primary-choir', source: 'ENGINE' }],
    units,
    policies: [configPolicy],
    categories: [category],
    serviceByCode: new Map([['SS1', service]]),
  });

  it('resolves policy service references through the versioned service id', () => {
    expect(validate(policy({ eligible: false })).reason).toMatch(/not eligible/);
  });

  it('enforces frequency minima and reports target shortfalls', () => {
    expect(validate(policy({ frequencyTarget: 2, frequencyKind: 'MINIMUM' })).reason).toMatch(/Frequency minimum/);
    expect(validate(policy({ frequencyTarget: 2, frequencyKind: 'TARGET' })).warnings).toHaveLength(1);
    expect(validate(policy({ frequencyTarget: 1, frequencyKind: 'MINIMUM' })).ok).toBe(true);
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
