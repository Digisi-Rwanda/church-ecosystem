import { describe, expect, it } from 'vitest';
import type { MusicScheduleUnit } from './musicSchedule';
import {
  buildMusicCalendar,
  generateMusicChoirSchedule,
  validateSchedule,
} from './musicScheduleEngine';
import {
  DEFAULT_MUSIC_UNITS,
  addMusicUnit,
  primaryUnitIds,
  resetMusicUnits,
  setMusicUnitActive,
} from './musicUnits';

describe('musicScheduleEngine', () => {
  it('builds SS1/SS2, midweek, and Igaburo for a month', () => {
    const services = buildMusicCalendar('2026-03', 'MONTH');
    expect(services.some((s) => s.kind === 'SS1')).toBe(true);
    expect(services.some((s) => s.kind === 'SS2')).toBe(true);
    expect(services.some((s) => s.kind === 'TUESDAY')).toBe(true);
    expect(services.some((s) => s.kind === 'FRIDAY')).toBe(true);
    expect(services.filter((s) => s.kind === 'IGABURO')).toHaveLength(1);
    // March 2026 has 5 Sundays
    expect(services.filter((s) => s.kind === 'SS1')).toHaveLength(5);
  });

  it('generates a valid choir schedule for a 4-Sunday month', () => {
    const services = buildMusicCalendar('2026-04', 'MONTH');
    expect(services.filter((s) => s.kind === 'SS1')).toHaveLength(4);
    const result = generateMusicChoirSchedule({
      services,
      seed: 42,
      attempts: 80,
    });
    expect(result.ok).toBe(true);
    const v = validateSchedule(services, result.assignments);
    expect(v.ok).toBe(true);

    // Hope on every SS1
    const ss1 = services.filter((s) => s.kind === 'SS1');
    for (const s of ss1) {
      expect(
        result.assignments.some(
          (a) => a.serviceId === s.id && a.unitId === 'mu-hope',
        ),
      ).toBe(true);
    }
    // Worship on every Tuesday
    for (const s of services.filter((x) => x.kind === 'TUESDAY')) {
      expect(
        result.assignments.some(
          (a) => a.serviceId === s.id && a.unitId === 'mu-worship',
        ),
      ).toBe(true);
      const primaries = result.assignments.filter(
        (a) => a.serviceId === s.id && primaryUnitIds().includes(a.unitId),
      );
      expect(primaries).toHaveLength(1);
    }
  });

  it('generates a valid choir schedule for a 5-Sunday month', () => {
    const services = buildMusicCalendar('2026-03', 'MONTH');
    const result = generateMusicChoirSchedule({
      services,
      seed: 7,
      attempts: 100,
    });
    expect(result.ok).toBe(true);
    expect(validateSchedule(services, result.assignments).ok).toBe(true);
  });

  it('uses stable service ids (date + kind)', () => {
    const a = buildMusicCalendar('2026-09', 'MONTH');
    const b = buildMusicCalendar('2026-09', 'MONTH');
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(a.find((x) => x.kind === 'SS1')!.id).toMatch(/^msvc-2026-09-\d\d-SS1$/);
  });
});

function lineup(opts: {
  primaries: number;
  secondaries: number;
  children?: number;
  worship?: number;
}): MusicScheduleUnit[] {
  const mk = (kind: MusicScheduleUnit['kind'], n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `mu-${tag}${i + 1}`,
      kind,
      name: `${tag}${i + 1}`,
      active: true,
    }));
  return [
    ...mk('PRIMARY', opts.primaries, 'p'),
    ...mk('SECONDARY', opts.secondaries, 's'),
    ...mk('CHILDREN', opts.children ?? 1, 'c'),
    ...mk('WORSHIP', opts.worship ?? 1, 'w'),
  ];
}

describe('musicScheduleEngine — configurable lineup', () => {
  const months = ['2026-03', '2026-04', '2026-09', '2026-10']; // 4- and 5-Sunday

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
        const r = generateMusicChoirSchedule({
          services,
          units,
          seed: 11,
          attempts: 200,
        });
        expect(r.reason ?? '', `${name} ${m}`).toBe('');
        expect(r.ok).toBe(true);
        expect(validateSchedule(services, r.assignments, 'strict', units).ok).toBe(true);
        // every primary serves a fair share of Sundays (within 1)
        const primaries = units.filter((u) => u.kind === 'PRIMARY').map((u) => u.id);
        const sundayIds = new Set(
          services.filter((s) => s.kind === 'SS1' || s.kind === 'SS2').map((s) => s.id),
        );
        const counts = primaries.map(
          (p) =>
            r.assignments.filter((a) => a.unitId === p && sundayIds.has(a.serviceId)).length,
        );
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        // each secondary exactly once, children on every SS1
        for (const sec of units.filter((u) => u.kind === 'SECONDARY')) {
          expect(r.assignments.filter((a) => a.unitId === sec.id)).toHaveLength(1);
        }
        for (const c of units.filter((u) => u.kind === 'CHILDREN')) {
          expect(r.assignments.filter((a) => a.unitId === c.id)).toHaveLength(
            services.filter((s) => s.kind === 'SS1').length,
          );
        }
      }
    });
  }

  it('reports a lineup that cannot work instead of looping', () => {
    const services = buildMusicCalendar('2026-09', 'MONTH');
    const r = generateMusicChoirSchedule({
      services,
      units: lineup({ primaries: 1, secondaries: 1 }),
      seed: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/2 active primary/);
  });

  it('reports more secondary choirs than Sundays', () => {
    const services = buildMusicCalendar('2026-09', 'MONTH'); // 4 Sundays
    const r = generateMusicChoirSchedule({
      services,
      units: lineup({ primaries: 4, secondaries: 5 }),
      seed: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Sundays/);
  });

  it('a retired choir is never scheduled, and the 3-choir limit holds', () => {
    resetMusicUnits();
    expect(setMusicUnitActive('mu-elim', false).ok).toBe(true);
    const services = buildMusicCalendar('2026-09', 'MONTH');
    const r = generateMusicChoirSchedule({ services, seed: 5, attempts: 200 });
    expect(r.ok).toBe(true);
    expect(r.assignments.some((a) => a.unitId === 'mu-elim')).toBe(false);
    // Retired choirs stay valid in history (validation resolves their kind).
    const hist = [{ id: 'x', serviceId: services.find((s) => s.kind === 'TUESDAY')!.id, unitId: 'mu-elim', source: 'MANUAL' as const }];
    const v = validateSchedule(services, hist, 'manual');
    expect(v.reason).toBeUndefined();
    resetMusicUnits();
  });

  it('the last two primaries cannot be retired; a new choir joins the rotation', () => {
    resetMusicUnits();
    expect(setMusicUnitActive('mu-elim', false).ok).toBe(true);
    expect(setMusicUnitActive('mu-integuza', false).ok).toBe(true);
    expect(setMusicUnitActive('mu-elbethel', false).ok).toBe(false);
    resetMusicUnits();
    const added = addMusicUnit({ name: 'Shalom', kind: 'PRIMARY', orgUnitId: 'ou-choir-shalom' });
    expect(added.ok).toBe(true);
    expect(primaryUnitIds()).toHaveLength(5);
    const services = buildMusicCalendar('2026-09', 'MONTH');
    const r = generateMusicChoirSchedule({ services, seed: 3, attempts: 200 });
    expect(r.ok).toBe(true);
    expect(r.assignments.some((a) => a.unitId === added.unit!.id)).toBe(true);
    expect(DEFAULT_MUSIC_UNITS.some((u) => u.id === added.unit!.id)).toBe(false);
    resetMusicUnits();
  });
});

import { periodOptionsForHorizon } from './musicScheduleEngine';

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
    expect(o[0].label).toMatch(/^Q4 2026/);
    expect(periodOptionsForHorizon('QUARTER', '2026-10')[0].value).toBe('2026-10');
  });
  it('half year and year are calendar aligned', () => {
    expect(periodOptionsForHorizon('HALF', '2026-09').slice(0, 2).map((x) => x.value)).toEqual(['2027-01', '2027-07']);
    expect(periodOptionsForHorizon('HALF', '2026-09')[0].label).toMatch(/^H1 2027/);
    const y = periodOptionsForHorizon('YEAR', '2026-09');
    expect(y[0].value).toBe('2027-01');
    expect(y[0].label).toMatch(/^2027/);
  });
});
