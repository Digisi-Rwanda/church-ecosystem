import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', {
  setTimeout,
  clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {},
});
vi.stubGlobal('localStorage', (globalThis as any).window.localStorage);

import { canServeKind } from '../domain/teamEngine';
import type { MusicScheduleUnit } from '../domain/musicSchedule';
import { replaceMusicUnits } from '../domain/musicUnits';
import type { ProtocolRosterMember } from '../domain/types';
import { PROTOCOL_NOTIFICATIONS, PROTOCOL_ROSTER, PROTOCOL_TEAM_SLOTS } from '../data/protocolSeed';
import { musicScheduleService } from './musicScheduleService';
import { protocolService, setProtocolDemoMusic } from './protocolService';

/**
 * A rehearsal of the whole flow on a made-up church: Music builds and confirms
 * a quarter, the Coordinator plans teams from it, Music edits after release,
 * the President publishes. Every placement is checked against every rule.
 * Nothing here is the demo seed: the choirs and the people are generated.
 */
const Q = ['2026-11', '2026-12', '2027-01'];
const MUSIC = 'p-music-lead';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00'));
  setProtocolDemoMusic(false);
});
afterAll(() => vi.useRealTimers());

// ---- the made-up church ------------------------------------------------------
const CHOIR_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const units: MusicScheduleUnit[] = [
  ...CHOIR_NAMES.map((n, i) => ({ id: `u${i}`, kind: 'PRIMARY' as const, name: `${n} Voices`, active: true })),
  { id: 'u-sec', kind: 'SECONDARY', name: 'Ibyishimo', active: true },
  { id: 'u-kid', kind: 'CHILDREN', name: 'Little Lambs', active: true },
  { id: 'u-wor', kind: 'WORSHIP', name: 'Worship Team', active: true },
];
const choirPool = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u-sec', 'u-wor'];

function buildRoster(): ProtocolRosterMember[] {
  const rows: ProtocolRosterMember[] = [];
  for (let i = 0; i < 45; i++) {
    const office = i === 0 ? 'COORDINATOR' : i === 1 ? 'PRESIDENT' : i === 2 ? 'SECRETARY' : i === 3 ? 'TREASURER' : 'MEMBER';
    const r: ProtocolRosterMember = {
      id: `r${i}`,
      personId: `p${i}`,
      office,
      serveDays: 'BOTH',
      status: 'ACTIVE',
      unavailableDates: [],
      displayName: `Member ${i}`,
    };
    // about 60% sing in a choir
    if (i % 5 !== 0 && i % 5 !== 3) r.choirUnitId = choirPool[i % choirPool.length];
    // varied availability, never the office-holders
    if (i >= 5) {
      if (i % 11 === 0) r.status = 'LEAVE';
      else if (i % 17 === 0) r.status = 'INACTIVE';
      else if (i % 7 === 0) {
        r.allowedServiceKinds = ['TUESDAY'];
        r.serveDays = 'TUESDAY';
      } else if (i % 9 === 0) {
        r.allowedServiceKinds = ['SS1'];
        r.serveDays = 'SUNDAY';
      } else if (i % 13 === 0) {
        r.allowedServiceKinds = ['SS2', 'IGABURO'];
        r.serveDays = 'SUNDAY';
      }
      if (i % 6 === 0) r.unavailableDates = ['2026-11-08', '2026-11-15', '2026-12-13'];
      if (i === 8 || i === 10) r.onlyServices = [{ date: '2026-11-01', kind: 'SS1' }, { date: '2026-11-22', kind: 'SS2' }];
    }
    rows.push(r);
  }
  return rows;
}

const coordinator = 'p0';
const president = 'p1';
const slotsFor = (month: string) =>
  protocolService.servicesForMonth(month).flatMap((s) =>
    protocolService.teamForService(s.id).map((slot) => ({ s, slot })),
  );

describe('rehearsal: a quarter, start to finish', () => {
  it('sets up the church from data alone', () => {
    replaceMusicUnits(units);
    PROTOCOL_ROSTER.splice(0, PROTOCOL_ROSTER.length, ...buildRoster());
    expect(protocolService.officeFor(coordinator)).toBe('COORDINATOR');
    expect(protocolService.officeFor(president)).toBe('PRESIDENT');
    expect(protocolService.listRoster().length).toBe(45);
  });

  it('Music builds a quarter with 8 primary choirs and confirms it; the Coordinator is told', () => {
    musicScheduleService._resetForTests();
    replaceMusicUnits(units);
    musicScheduleService.buildCalendar(Q[0], 'QUARTER');
    const built = musicScheduleService.buildChoirSchedule();
    expect(built.reason ?? '').toBe('');
    expect(built.ok).toBe(true);
    const draft = musicScheduleService.saveDraft(MUSIC, 'Quarter');
    expect(draft.ok).toBe(true);
    expect(musicScheduleService.confirmDraftMonths(draft.draft!.id, MUSIC).ok).toBe(true);
    expect(musicScheduleService.confirmedMonths()).toEqual(Q);
    // Coordinator hears about it, once, and the trail has all three months
    const told = PROTOCOL_NOTIFICATIONS.filter((n) => n.personId === coordinator && n.kind === 'MUSIC_CONFIRMED');
    expect(told.length).toBeGreaterThanOrEqual(1);
    expect(musicScheduleService.listLog().map((e) => e.periodKey).sort()).toEqual(Q);
    // the overview says every month is ready to build
    const rows = protocolService.monthsOverview();
    for (const m of Q) expect(rows.find((r) => r.monthKey === m)!.musicState).toBe('CONFIRMED');
  });

  it('builds the three months at once, and every placement obeys every rule', () => {
    const all = protocolService.buildAllReady(coordinator);
    expect(all.ok).toBe(true);
    for (const month of Q) {
      const rosterById = new Map(PROTOCOL_ROSTER.map((r) => [r.personId, r]));
      const sundaySs1 = new Map<string, Set<string>>();
      const unitsByService = new Map<string, Set<string>>();
      const planned = musicScheduleService.getPlannedForMonth(month)!;
      for (const a of planned.assignments) {
        const set = unitsByService.get(a.serviceId) ?? new Set<string>();
        set.add(a.unitId);
        unitsByService.set(a.serviceId, set);
      }
      const rows = slotsFor(month);
      expect(rows.length).toBeGreaterThan(0);
      for (const { s, slot } of rows) {
        const m = rosterById.get(slot.personId)!;
        expect(m, `${slot.personId} is on the roster`).toBeTruthy();
        expect(m.status, `${m.displayName} must be active`).toBe('ACTIVE');
        expect(canServeKind(m, s.kind, s.date), `${m.displayName} cannot do ${s.kind} ${s.date}`).toBe(true);
        expect(m.unavailableDates.includes(s.date), `${m.displayName} unavailable ${s.date}`).toBe(false);
        // the choir rule: a choir member serves only where their choir sings
        if (m.choirUnitId && slot.slotKind === 'REGULAR') {
          const sung = unitsByService.get(s.musicServiceId ?? s.id);
          expect(sung?.has(m.choirUnitId), `${m.displayName} (${m.choirUnitId}) serving ${s.kind} ${s.date} without their choir`).toBe(true);
        }
        if (s.kind === 'SS1') {
          const set = sundaySs1.get(s.date) ?? new Set<string>();
          set.add(slot.personId);
          sundaySs1.set(s.date, set);
        }
      }
      // no one on SS1 and SS2 the same Sunday
      for (const { s, slot } of rows.filter((x) => x.s.kind === 'SS2')) {
        expect(sundaySs1.get(s.date)?.has(slot.personId), `${slot.personId} on SS1 and SS2 ${s.date}`).not.toBe(true);
      }
      // nobody twice on the same service
      for (const s of protocolService.servicesForMonth(month)) {
        const ids = protocolService.teamForService(s.id).map((x) => x.personId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('the rehearsal really exercised the rules (not a vacuous pass)', () => {
    const byId = new Map(PROTOCOL_ROSTER.map((r) => [r.personId, r]));
    const rows = Q.flatMap(slotsFor);
    const withChoir = rows.filter((x) => byId.get(x.slot.personId)?.choirUnitId).length;
    const tuesdayOnly = rows.filter((x) => byId.get(x.slot.personId)?.allowedServiceKinds?.[0] === 'TUESDAY').length;
    const people = new Set(rows.map((x) => x.slot.personId)).size;
    expect(rows.length).toBeGreaterThan(100);
    expect(withChoir).toBeGreaterThan(20);
    expect(tuesdayOnly).toBeGreaterThan(0);
    expect(people).toBeGreaterThan(25);
  });

  it('the people with particular services serve only those in that month', () => {
    for (const id of ['p8', 'p10']) {
      const duties = slotsFor('2026-11').filter((x) => x.slot.personId === id).map((x) => `${x.s.date}|${x.s.kind}`);
      for (const d of duties) expect(['2026-11-01|SS1', '2026-11-22|SS2']).toContain(d);
    }
  });

  it('leave and inactive members are never placed; Tuesday-only members only on Tuesdays', () => {
    const everyone = Q.flatMap(slotsFor);
    const byId = new Map(PROTOCOL_ROSTER.map((r) => [r.personId, r]));
    for (const { s, slot } of everyone) {
      const m = byId.get(slot.personId)!;
      expect(['LEAVE', 'INACTIVE']).not.toContain(m.status);
      if (m.allowedServiceKinds?.length === 1 && m.allowedServiceKinds[0] === 'TUESDAY') expect(s.kind).toBe('TUESDAY');
    }
  });

  it('teams are fair: duties are spread, and any gap is reported rather than hidden', () => {
    const load = new Map<string, number>();
    for (const { slot } of slotsFor('2026-11').filter((x) => x.slot.slotKind === 'REGULAR')) {
      load.set(slot.personId, (load.get(slot.personId) ?? 0) + 1);
    }
    const loads = [...load.values()];
    expect(Math.max(...loads)).toBeLessThanOrEqual(4); // hard ceiling: target + one extra
    for (const month of Q) {
      const d = protocolService.validateMonthDetailed(month);
      expect(d.blocking, JSON.stringify(d.blocking.slice(0, 3))).toEqual([]);
    }
  });

  it('review, then publish is held back until Music releases the month', () => {
    const m = Q[0];
    expect(protocolService.submitForReview(m, coordinator).ok).toBe(true);
    expect(protocolService.markReviewed(m, president).ok).toBe(true);
    const blocked = protocolService.publish(m, president);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/confirmed/i);
    expect(musicScheduleService.publishMonths([m], MUSIC, []).ok).toBe(true);
    expect(protocolService.musicSync(m).state).toBe('CURRENT');
    expect(protocolService.publish(m, president).ok).toBe(true);
  });

  it('Music edits after release: the Coordinator is told what changed, Protocol is flagged', () => {
    const m = Q[0];
    const pub = musicScheduleService.getPublished(m)!;
    const svc = pub.services.find((s) => s.kind === 'SS2')!;
    const unit = pub.assignments.find((a) => a.serviceId === svc.id)!.unitId;
    expect(musicScheduleService.removePublishedUnit(m, MUSIC, svc.id, unit, []).ok).toBe(true);
    const note = PROTOCOL_NOTIFICATIONS.find((n) => n.personId === coordinator && n.kind === 'MUSIC_EDITED')!;
    expect(note.body).toContain('removed from');
    expect(note.href).toBe('/systems/protocol/music');
    expect(musicScheduleService.listLog(m)[0]).toMatchObject({ action: 'EDITED', stage: 'PUBLISHED' });
    expect(protocolService.musicSync(m).state).toBe('STALE');
  });

  it('release the rest and finish the quarter', () => {
    for (const m of [Q[1], Q[2]]) {
      expect(protocolService.submitForReview(m, coordinator).ok).toBe(true);
      expect(protocolService.markReviewed(m, president).ok).toBe(true);
      expect(musicScheduleService.publishMonths([m], MUSIC, []).ok).toBe(true);
      expect(protocolService.publish(m, president).ok).toBe(true);
    }
    expect(PROTOCOL_TEAM_SLOTS.length).toBeGreaterThan(0);
    const rows = protocolService.monthsOverview();
    for (const m of [Q[1], Q[2]]) expect(rows.find((r) => r.monthKey === m)!.planStatus).toBe('PUBLISHED');
  });
});
