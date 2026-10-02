import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, addEventListener: () => {} });
vi.stubGlobal('localStorage', (globalThis as any).window.localStorage);
import { musicScheduleService } from './musicScheduleService';
import { protocolService } from './protocolService';
import { buildMusicCalendar, generateMusicChoirSchedule } from '../domain/musicScheduleEngine';

const M = '2026-09';
const log = (...a: unknown[]) => console.log('PROBE', ...a);

describe('Music → Protocol flow', () => {
  it('A. generated protocol teams respect rules', () => {
    musicScheduleService.ensureDemoPublished(M);
    const g = protocolService.generateTeams(M);
    expect(g.ok).toBe(true);
    const issues = protocolService.validateMonth(M);
    log('A issues', issues);
    const load = protocolService.dutyLoad(M);
    log('A max load', Math.max(...load.map((l) => l.count)), 'min', Math.min(...load.map((l) => l.count)), 'zero-duty', load.filter((l) => l.count === 0).length, 'of', load.length);
    const svcs = protocolService.servicesForMonth(M);
    for (const s of svcs) {
      const n = protocolService.teamForService(s.id).filter((x) => x.slotKind !== 'FILL_IN').length;
      if (n !== s.targetTeamSize) log('A short/over', s.label, n);
    }
    expect(Math.max(...load.map((l) => l.count))).toBeLessThanOrEqual(4);
  });

  it('B. Music update after protocol generation → stale protocol?', () => {
    musicScheduleService.ensureDemoPublished(M);
    protocolService.generateTeams(M);
    const pub = musicScheduleService.getPublished(M)!;
    const before = protocolService.validateMonth(M).length;
    // swap every Sunday SS1 choir assignment to Hope-only removal of primaries (remove all non-hope on an SS2)
    const ss2 = pub.services.find((s) => s.kind === 'SS2')!;
    const r = musicScheduleService.removePublishedUnit(M, 'p-music', ss2.id, pub.assignments.filter(a=>a.serviceId===ss2.id)[0].unitId, []);
    log('B music edit ok', r.ok, (r as any).reason);
    const after = protocolService.validateMonth(M);
    log('B issues before/after', before, after.length, after.slice(0, 3));
    // Does protocol notice? plan status:
    log('B plan status', protocolService.getMonthPlan(M)?.status);
    // can it still go to review/publish?
    const sub = protocolService.submitForReview(M, 'p-protocol');
    log('B submit', sub);
    const p = protocolService.publish(M, 'p-protocol');
    log('B publish', p);
  });

  it('C. Music republish via draft changes service ids → orphaned protocol slots', () => {
    musicScheduleService.ensureDemoPublished(M);
    const oldIds = new Set(protocolService.servicesForMonth(M).map((s) => s.musicServiceId));
    const slotsBefore = protocolService.slotsForMonth(M).length;
    musicScheduleService.buildCalendar(M, 'MONTH');
    musicScheduleService.buildChoirSchedule();
    const d = musicScheduleService.saveDraft('p-music', 'x');
    log('C saveDraft', (d as any).ok, (d as any).reason);
    const draftId = (d as any).draft?.id;
    if (draftId) {
      const r = musicScheduleService.publishDraft(draftId, 'p-music', []);
      log('C publish', r.ok, r.reason);
      const newIds = new Set(musicScheduleService.getPublished(M)!.services.map((s) => s.id));
      const overlap = [...oldIds].filter((i) => newIds.has(i!)).length;
      log('C music service id overlap old/new', overlap, 'of', oldIds.size);
      const slotsAfter = protocolService.slotsForMonth(M).length;
      log('C protocol slots before/after', slotsBefore, slotsAfter);
      const svcAfter = protocolService.servicesForMonth(M);
      log('C protocol service dates still match music?', svcAfter.every((s) => newIds.has(s.musicServiceId!)));
    }
  });

  it('D. Music engine: midweek double detection across weeks', () => {
    const services = buildMusicCalendar('2026-09', 'MONTH');
    let worst = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = generateMusicChoirSchedule({ services, seed, attempts: 60 });
      const w = r.warnings.filter((x) => x.includes('double midweek')).length;
      worst = Math.max(worst, w);
      if (!r.ok) log('D engine failed seed', seed, r.reason);
    }
    log('D worst double-midweek warnings in 30 seeds', worst);
  });

  it('E. Protocol month window is hard-coded', () => {
    log('E allowed', protocolService.allowedMonths(), 'live in Dec 2026 →', protocolService.liveMonthKey(new Date('2026-12-15T10:00:00')));
    log('E music allowed', musicScheduleService.allowedMonths().slice(0, 3));
  });

  it('F. worship team members not gated on Tuesday', () => {
    const svcs = protocolService.servicesForMonth(M);
    const tues = svcs.find((s) => s.kind === 'TUESDAY')!;
    log('F tuesday units', [...(musicScheduleService.getPublished(M)!.assignments.filter((a) => a.serviceId === tues.musicServiceId).map((a) => a.unitId))]);
  });

  it('G. regenerate wipes manual edits & is month-scoped', () => {
    protocolService.generateTeams(M);
    protocolService.generateTeams('2026-10');
    const a = protocolService.slotsForMonth(M).length;
    protocolService.generateTeams('2026-10');
    log('G sept slots stable after oct regen', a, protocolService.slotsForMonth(M).length);
    // 2026-10 plan: choir history continuity
    log('G oct issues', protocolService.validateMonth('2026-10').length);
  });
});

describe('Music → Protocol flow (focused)', () => {
  it('H. removing a choir that has protocol members on the team', async () => {
    const { MEMBERSHIPS } = await import('../data/seed');
    const { MUSIC_UNITS } = await import('../domain/musicUnits');
    musicScheduleService.ensureDemoPublished(M);
    protocolService.generateTeams(M);
    const pub = musicScheduleService.getPublished(M)!;
    const orgToMusic = new Map(MUSIC_UNITS.filter((u) => u.orgUnitId).map((u) => [u.orgUnitId!, u.id]));
    const unitOf = (pid: string) => MEMBERSHIPS.filter((m: any) => m.systemId === 'sys-choir' && m.status === 'ACTIVE' && m.personId === pid).map((m: any) => orgToMusic.get(m.orgUnitId)).filter(Boolean);
    let target: { svc: any; unit: string; person: string } | null = null;
    for (const s of protocolService.servicesForMonth(M)) {
      for (const t of protocolService.teamForService(s.id)) {
        const u = unitOf(t.personId).find((x) => pub.assignments.some((a) => a.serviceId === s.musicServiceId && a.unitId === x));
        if (u) { target = { svc: s, unit: u as string, person: t.personId }; break; }
      }
      if (target) break;
    }
    log('H target', target && { svc: target.svc.label, unit: target.unit, person: target.person });
    if (!target) return;
    const r = musicScheduleService.removePublishedUnit(M, 'p-music', target.svc.musicServiceId, target.unit, []);
    log('H music remove', r.ok, (r as any).reason);
    const issues = protocolService.validateMonth(M);
    log('H issues now', issues.filter((i) => i.includes('choir')).slice(0, 2));
    log('H plan status', protocolService.getMonthPlan(M)?.status);
    log('H submit', protocolService.submitForReview(M, 'p-protocol'));
    log('H publish', protocolService.publish(M, 'p-protocol'));
    // after protocol PUBLISHED, music changes again
    const pub2 = musicScheduleService.getPublished(M)!;
    const other = pub2.assignments.find((a) => a.unitId !== 'mu-worship' && a.unitId !== 'mu-hope')!;
    musicScheduleService.removePublishedUnit(M, 'p-music', other.serviceId, other.unitId, []);
    log('H plan still PUBLISHED, issues', protocolService.getMonthPlan(M)?.status, protocolService.validateMonth(M).filter((i) => i.includes('choir')).length);
  });

  it('I. after music republish (new ids), what validation says', () => {
    musicScheduleService.ensureDemoPublished(M);
    protocolService.generateTeams(M);
    musicScheduleService.buildCalendar(M, 'MONTH');
    musicScheduleService.buildChoirSchedule();
    const d: any = musicScheduleService.saveDraft('p-music', 'y');
    musicScheduleService.publishDraft(d.draft.id, 'p-music', []);
    const issues = protocolService.validateMonth(M);
    log('I issue count', issues.length, issues.slice(0, 2));
    const sv = protocolService.servicesForMonth(M);
    log('I protocol service count', sv.length);
    const re = protocolService.generateTeams(M);
    log('I regenerate', re.ok, re.reason, re.slotCount);
  });
});
