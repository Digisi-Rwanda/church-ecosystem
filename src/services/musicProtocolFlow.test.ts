import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The services persist through window.setTimeout; give node a minimal window.
vi.stubGlobal('window', {
  setTimeout,
  clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {},
});
vi.stubGlobal('localStorage', (globalThis as any).window.localStorage);

import { PROTOCOL_PRESIDENT_PERSON_ID } from '../data/protocolMembersSeed';
import { POSITIONS } from '../data/seed';
import { PROTOCOL_NOTIFICATIONS, PROTOCOL_ROSTER, replaceProtocolTeamSlots, PROTOCOL_TEAM_SLOTS } from '../data/protocolSeed';
import { musicScheduleService } from './musicScheduleService';
import { protocolService, setProtocolDemoMusic } from './protocolService';

const M = '2026-09';

// The month window follows the clock; pin it to mid-September 2026.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00'));
});
afterAll(() => vi.useRealTimers());
const coordinator = PROTOCOL_ROSTER.find((m) => m.office === 'COORDINATOR')!.personId;
const president = PROTOCOL_PRESIDENT_PERSON_ID; // Protocol President (reviews & publishes)
// No Vice President is seeded; tests that need one add a delegate position.
const vp = PROTOCOL_ROSTER.find((m) => m.office === 'MEMBER' && m.personId !== president)!.personId;
function withVp<T>(run: () => T): T {
  const pos = {
    id: 'pos-test-vp', personId: vp, title: 'Protocol Vice President', orgUnitId: 'ou-protocol',
    protocolOffice: 'VP', systemId: 'sys-protocol', status: 'ACTIVE', startDate: '2023-01-01',
  } as (typeof POSITIONS)[number];
  POSITIONS.push(pos);
  try {
    return run();
  } finally {
    POSITIONS.splice(POSITIONS.indexOf(pos), 1);
  }
}

function fresh() {
  protocolService.returnToDraft(M, president);
  musicScheduleService._resetForTests();
  musicScheduleService.ensureDemoPublished(M);
  const g = protocolService.generateTeams(M, coordinator);
  expect(g.ok).toBe(true);
}

/** A (service, choir) pair where a team member's own choir is singing. */
function memberOnChoirService() {
  const pub = musicScheduleService.getPublished(M)!;
  for (const s of protocolService.servicesForMonth(M)) {
    for (const t of protocolService.teamForService(s.id)) {
      const issues = protocolService.validateMonthDetailed(M).issues;
      void issues;
      for (const a of pub.assignments.filter((x) => x.serviceId === s.musicServiceId)) {
        // remove this choir and see whether this member becomes conflicted
        const before = protocolService.validateMonthDetailed(M).blocking.length;
        const r = musicScheduleService.removePublishedUnit(M, 'p-music', a.serviceId, a.unitId, []);
        if (!r.ok) continue;
        const after = protocolService.validateMonthDetailed(M).blocking.length;
        if (after > before) return { serviceId: a.serviceId, unitId: a.unitId, person: t.personId };
        musicScheduleService.addPublishedUnit(M, 'p-music', a.serviceId, a.unitId, []);
      }
    }
  }
  return null;
}

describe('Music → Protocol: stable ids and reconcile', () => {
  beforeEach(fresh);

  it('republishing Music does not orphan Protocol teams', () => {
    const idsBefore = protocolService.servicesForMonth(M).map((s) => s.id);
    const slotsBefore = protocolService.slotsForMonth(M).length;
    const issuesBefore = protocolService.validateMonth(M);

    musicScheduleService.buildCalendar(M, 'MONTH');
    musicScheduleService.buildChoirSchedule();
    const d = musicScheduleService.saveDraft('p-music', 'republish');
    expect(d.ok).toBe(true);
    expect(musicScheduleService.publishDraft(d.draft!.id, 'p-music', []).ok).toBe(true);

    expect(protocolService.servicesForMonth(M).map((s) => s.id)).toEqual(idsBefore);
    expect(protocolService.slotsForMonth(M)).toHaveLength(slotsBefore);
    // every service still resolves to a Music service
    const musicIds = new Set(musicScheduleService.getPublished(M)!.services.map((s) => s.id));
    expect(protocolService.servicesForMonth(M).every((s) => musicIds.has(s.musicServiceId!))).toBe(true);
    // A regenerated Music schedule moves choirs around, so some members may now
    // conflict — but only as choir conflicts, never as broken/unknown services,
    // and Protocol reports the change instead of silently going stale.
    void issuesBefore;
    const v = protocolService.validateMonthDetailed(M);
    expect(v.blocking.every((i) => i.code === 'CHOIR_NOT_SCHEDULED' || i.code === 'WORSHIP_NOT_SCHEDULED')).toBe(true);
    expect(protocolService.musicSync(M).state).toBe('STALE');
  });

  it('legacy random ids are re-keyed by date + kind, keeping teams', () => {
    const slotsBefore = protocolService.slotsForMonth(M).length;
    const pub = musicScheduleService.getPublished(M)!;
    const rename = new Map(pub.services.map((s) => [s.id, `msvc-legacy-${Math.random().toString(36).slice(2, 8)}`]));
    musicScheduleService.importLocalState({
      published: [
        {
          ...pub,
          services: pub.services.map((s) => ({ ...s, id: rename.get(s.id)! })),
          assignments: pub.assignments.map((a) => ({ ...a, serviceId: rename.get(a.serviceId)! })),
        },
      ],
    });
    const svcs = protocolService.servicesForMonth(M);
    expect(svcs.every((s) => s.musicServiceId!.startsWith('msvc-legacy-'))).toBe(true);
    expect(protocolService.slotsForMonth(M)).toHaveLength(slotsBefore);
    expect(protocolService.musicSync(M).state).toBe('CURRENT');
  });

  it('a service Music removes is dropped from a draft month with its team', () => {
    const pub = musicScheduleService.getPublished(M)!;
    const tue = pub.services.find((s) => s.kind === 'TUESDAY')!;
    const slotsOnTue = protocolService.teamForService(`psvc-${tue.id}`).length;
    expect(slotsOnTue).toBeGreaterThan(0);
    musicScheduleService.importLocalState({
      published: [
        {
          ...pub,
          services: pub.services.filter((s) => s.id !== tue.id),
          assignments: pub.assignments.filter((a) => a.serviceId !== tue.id),
        },
      ],
    });
    const svcs = protocolService.servicesForMonth(M);
    expect(svcs.some((s) => s.date === tue.date && s.kind === 'TUESDAY')).toBe(false);
    expect(protocolService.teamForService(`psvc-${tue.id}`)).toHaveLength(0);
  });
});

describe('Music change tracking', () => {
  beforeEach(fresh);

  it('is CURRENT right after teams are built', () => {
    const s = protocolService.musicSync(M);
    expect(s.state).toBe('CURRENT');
    expect(s.builtOn).toBe(s.current);
  });

  it('flags a Music edit, blocks submit, notifies, and clears on review', () => {
    const pub = musicScheduleService.getPublished(M)!;
    const ss2 = pub.services.find((s) => s.kind === 'SS2')!;
    const units = musicScheduleService.assignmentsForService(pub.assignments, ss2.id);
    const before = PROTOCOL_NOTIFICATIONS.filter((n) => n.kind === 'MUSIC_CHANGED').length;
    expect(musicScheduleService.removePublishedUnit(M, 'p-music', ss2.id, units[0], []).ok).toBe(true);

    const sync = protocolService.musicSync(M);
    expect(sync.state).toBe('STALE');
    expect(sync.current).toBeGreaterThan(sync.builtOn!);
    expect(sync.changes.some((c) => c.kind === 'SS2' && c.date === ss2.date && c.removed.length === 1)).toBe(true);

    const notified = PROTOCOL_NOTIFICATIONS.filter((n) => n.kind === 'MUSIC_CHANGED');
    expect(notified.length).toBeGreaterThan(before);
    // a second edit does not spam again
    const count = notified.length;
    musicScheduleService.addPublishedUnit(M, 'p-music', ss2.id, units[0], []);
    expect(PROTOCOL_NOTIFICATIONS.filter((n) => n.kind === 'MUSIC_CHANGED').length).toBe(count);

    musicScheduleService.removePublishedUnit(M, 'p-music', ss2.id, units[0], []);
    const sub = protocolService.submitForReview(M, coordinator);
    expect(sub.ok).toBe(false);
    expect(sub.reason).toMatch(/Music schedule changed/);

    expect(protocolService.acknowledgeMusicChange(M, coordinator).ok).toBe(true);
    expect(protocolService.musicSync(M).state).toBe('CURRENT');
  });

  it('putting Music back as it was clears the flag by itself', () => {
    const pub = musicScheduleService.getPublished(M)!;
    const ss2 = pub.services.find((s) => s.kind === 'SS2')!;
    const units = musicScheduleService.assignmentsForService(pub.assignments, ss2.id);
    musicScheduleService.removePublishedUnit(M, 'p-music', ss2.id, units[0], []);
    expect(protocolService.musicSync(M).state).toBe('STALE');
    musicScheduleService.addPublishedUnit(M, 'p-music', ss2.id, units[0], []);
    expect(protocolService.musicSync(M).state).toBe('CURRENT');
  });

  it('a published month stays published but is flagged and cannot be re-published until reviewed', () => {
    expect(protocolService.submitForReview(M, coordinator).ok).toBe(true);
    expect(protocolService.publish(M, president).ok).toBe(true);
    const pub = musicScheduleService.getPublished(M)!;
    const ss2 = pub.services.find((s) => s.kind === 'SS2')!;
    const units = musicScheduleService.assignmentsForService(pub.assignments, ss2.id);
    musicScheduleService.removePublishedUnit(M, 'p-music', ss2.id, units[0], []);
    expect(protocolService.getMonthPlan(M)!.status).toBe('PUBLISHED');
    expect(protocolService.musicSync(M).state).toBe('STALE');
  });
});

describe('Blocking issues and overrides', () => {
  beforeEach(fresh);

  it('splits blocking rule violations from warnings', () => {
    const v = protocolService.validateMonthDetailed(M);
    expect(v.blocking).toHaveLength(0);
    expect(v.warnings.every((w) => w.severity === 'WARNING')).toBe(true);
    // short teams are warnings, never blockers
    expect(v.warnings.some((w) => w.code === 'TEAM_SHORT')).toBe(true);
    expect(protocolService.submitForReview(M, coordinator).ok).toBe(true);
  });

  it('a choir conflict blocks submit; only the Coordinator can override, with a reason', () => {
    const hit = memberOnChoirService();
    expect(hit).not.toBeNull();
    // Music changed too — review that first so we isolate the conflict gate
    expect(protocolService.acknowledgeMusicChange(M, coordinator).ok).toBe(true);

    const blocking = protocolService.validateMonthDetailed(M).blocking;
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking[0].code).toMatch(/CHOIR|WORSHIP/);

    const sub = protocolService.submitForReview(M, coordinator);
    expect(sub.ok).toBe(false);
    expect(sub.reason).toMatch(/override/i);

    const key = blocking[0].key;
    expect(protocolService.overrideIssue(M, key, 'agreed with pastor', president).ok).toBe(false);
    expect(protocolService.overrideIssue(M, key, 'no', coordinator).ok).toBe(false);
    expect(protocolService.overrideIssue(M, 'DOUBLE_SUNDAY|x|y', 'a real reason', coordinator).ok).toBe(false);

    // override every choir conflict
    for (const b of blocking) {
      expect(protocolService.overrideIssue(M, b.key, 'Pastor agreed — covers the usher gap', coordinator).ok).toBe(true);
    }
    const v = protocolService.validateMonthDetailed(M);
    expect(v.blocking).toHaveLength(0);
    expect(v.overridden.length).toBe(blocking.length);

    expect(protocolService.submitForReview(M, coordinator).ok).toBe(true);
    const pub = protocolService.publish(M, president);
    expect(pub.ok).toBe(true);
    const hist = protocolService.listHistory().find((h) => h.monthKey === M)!;
    expect(hist.validationNotes.some((n) => n.startsWith('Override:'))).toBe(true);
  });

  it('rebuilding the teams clears earlier overrides', () => {
    const hit = memberOnChoirService();
    expect(hit).not.toBeNull();
    protocolService.acknowledgeMusicChange(M, coordinator);
    const b = protocolService.validateMonthDetailed(M).blocking[0];
    expect(protocolService.overrideIssue(M, b.key, 'one-off arrangement', coordinator).ok).toBe(true);
    expect(protocolService.getMonthPlan(M)!.overrides).toHaveLength(1);
    protocolService.generateTeams(M, coordinator);
    expect(protocolService.getMonthPlan(M)!.overrides).toHaveLength(0);
  });

  it('hard rules (double Sunday) block and cannot be overridden', () => {
    const svcs = protocolService.servicesForMonth(M);
    const ss1 = svcs.find((s) => s.kind === 'SS1')!;
    const ss2 = svcs.find((s) => s.kind === 'SS2' && s.date === ss1.date)!;
    const victim = protocolService.teamForService(ss1.id)[0];
    replaceProtocolTeamSlots([
      ...PROTOCOL_TEAM_SLOTS,
      { ...victim, id: 'pts-test-dup', serviceId: ss2.id },
    ]);
    const v = protocolService.validateMonthDetailed(M);
    const dbl = v.blocking.find((i) => i.code === 'DOUBLE_SUNDAY');
    expect(dbl).toBeTruthy();
    const r = protocolService.overrideIssue(M, dbl!.key, 'because I said so', coordinator);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot be overridden/);
    const sub = protocolService.submitForReview(M, coordinator);
    expect(sub.ok).toBe(false);
    expect(sub.reason).toMatch(/both SS1 and SS2/);
  });
});

describe('Month window follows the clock and Music', () => {
  it('moves with the live date (no hard-coded months)', () => {
    setProtocolDemoMusic(true);
    vi.setSystemTime(new Date('2026-12-15T10:00:00'));
    expect(protocolService.liveMonthKey()).toBe('2026-12');
    const months = protocolService.allowedMonths();
    expect(months).toContain('2026-12');
    expect(months).toContain('2027-01');
    const g = protocolService.generateTeams('2026-12', coordinator);
    expect(g.ok).toBe(true);
    expect(g.slotCount).toBeGreaterThan(0);
    setProtocolDemoMusic(false);
    vi.setSystemTime(new Date('2026-09-15T10:00:00'));
  });

  it('rejects past months and months nobody has published', () => {
    vi.setSystemTime(new Date('2026-12-15T10:00:00'));
    expect(protocolService.generateTeams('2026-08', coordinator).ok).toBe(false);
    expect(protocolService.generateTeams('2027-06', coordinator).ok).toBe(false);
    vi.setSystemTime(new Date('2026-09-15T10:00:00'));
  });

  it('a later month Music has published becomes plannable, even a quarter schedule', () => {
    vi.setSystemTime(new Date('2026-09-15T10:00:00'));
    musicScheduleService._resetForTests();
    musicScheduleService.buildCalendar('2027-03', 'QUARTER');
    expect(musicScheduleService.buildChoirSchedule().ok).toBe(true);
    const d = musicScheduleService.saveDraft('p-music', 'q1');
    expect(musicScheduleService.publishDraft(d.draft!.id, 'p-music', []).ok).toBe(true);

    const months = protocolService.allowedMonths();
    expect(months).toEqual(expect.arrayContaining(['2027-03', '2027-04', '2027-05']));

    // second month of the quarter: services are that month's only
    const g = protocolService.generateTeams('2027-04', coordinator);
    expect(g.ok).toBe(true);
    const svcs = protocolService.servicesForMonth('2027-04');
    expect(svcs.length).toBeGreaterThan(0);
    expect(svcs.every((s) => s.date.startsWith('2027-04'))).toBe(true);
    musicScheduleService._resetForTests();
  });
});

describe('Roles: Coordinator builds, the President reviews and publishes; VP only as delegate', () => {
  beforeEach(fresh);

  it('the President (Claudine, from the roster) holds the office', () => {
    expect(protocolService.officeFor(president)).toBe('PRESIDENT');
    expect(protocolService.isReviewer(president)).toBe(true);
    const row = PROTOCOL_ROSTER.find((m) => m.personId === president)!;
    expect(row.office).toBe('PRESIDENT');
  });

  it('a Vice President does not review while the President is available', () => {
    withVp(() => {
      expect(protocolService.officeFor(vp)).toBe('VP');
      expect(protocolService.isReviewer(vp)).toBe(false);
      protocolService.submitForReview(M, coordinator);
      expect(protocolService.markReviewed(M, vp).ok).toBe(false);
      expect(protocolService.publish(M, vp).ok).toBe(false);
    });
  });

  it('the Vice President acts as delegate when the President is on leave', () => {
    const row = PROTOCOL_ROSTER.find((m) => m.personId === president)!;
    const was = row.status;
    row.status = 'LEAVE';
    try {
      withVp(() => {
        expect(protocolService.isReviewer(vp)).toBe(true);
        // the President is on leave: rebuild the teams without her, then submit
        expect(protocolService.generateTeams(M, coordinator).ok).toBe(true);
        expect(protocolService.submitForReview(M, coordinator).ok).toBe(true);
        expect(protocolService.publish(M, vp).ok).toBe(true);
      });
    } finally {
      row.status = was;
    }
  });

  it('church-level leaders have no Protocol office and cannot act', async () => {
    const { ACCOUNTS } = await import('../data/seed');
    const pastor = ACCOUNTS.find((a: { username: string }) => a.username === 'pastor')!.personId;
    expect(protocolService.officeFor(pastor)).toBeNull();
    expect(protocolService.generateTeams(M, pastor).ok).toBe(false);
    expect(protocolService.submitForReview(M, pastor).ok).toBe(false);
    protocolService.submitForReview(M, coordinator);
    expect(protocolService.markReviewed(M, pastor).ok).toBe(false);
    expect(protocolService.publish(M, pastor).ok).toBe(false);
  });

  it('only the Coordinator builds and submits', () => {
    const b = protocolService.generateTeams(M, president);
    expect(b.ok).toBe(false);
    expect(b.reason).toMatch(/Coordinator/);
    expect(protocolService.submitForReview(M, president).ok).toBe(false);
    expect(protocolService.submitForReview(M, coordinator).ok).toBe(true);
  });

  it('the Coordinator cannot review or publish; the President can', () => {
    const before = PROTOCOL_NOTIFICATIONS.length;
    expect(protocolService.submitForReview(M, coordinator).ok).toBe(true);
    const sent = PROTOCOL_NOTIFICATIONS.slice(0, PROTOCOL_NOTIFICATIONS.length - before).concat(
      PROTOCOL_NOTIFICATIONS.filter((n) => n.kind === 'SUBMITTED_REVIEW'),
    );
    expect(sent.some((n) => n.personId === president)).toBe(true);

    const r1 = protocolService.markReviewed(M, coordinator);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toMatch(/President/);
    const p1 = protocolService.publish(M, coordinator);
    expect(p1.ok).toBe(false);
    expect(protocolService.getMonthPlan(M)!.status).toBe('REVIEW');

    expect(protocolService.markReviewed(M, president).ok).toBe(true);
    const p2 = protocolService.publish(M, president);
    expect(p2.ok).toBe(true);
    const plan = protocolService.getMonthPlan(M)!;
    expect(plan.status).toBe('PUBLISHED');
    expect(plan.publishedByPersonId).toBe(president);
    expect(plan.reviewedByPersonId).toBe(president);
  });

  it('a submitter who also holds a reviewer office cannot review their own submission', () => {
    // Simulate the same person submitting and reviewing.
    protocolService.submitForReview(M, coordinator);
    const plan = protocolService.getMonthPlan(M)!;
    expect(protocolService.reviewerDenied(plan, president, 'publish')).toBeUndefined();
    expect(
      protocolService.reviewerDenied({ ...plan, submittedByPersonId: president }, president, 'publish'),
    ).toMatch(/someone else/);
  });

  it('reopening: Coordinator can withdraw from review, only the President/VP reopen a published month', () => {
    protocolService.submitForReview(M, coordinator);
    expect(protocolService.returnToDraft(M, coordinator).ok).toBe(true);
    expect(protocolService.getMonthPlan(M)!.status).toBe('DRAFT');

    protocolService.submitForReview(M, coordinator);
    expect(protocolService.publish(M, president).ok).toBe(true);
    const denied = protocolService.returnToDraft(M, coordinator);
    expect(denied.ok).toBe(false);
    expect(protocolService.getMonthPlan(M)!.status).toBe('PUBLISHED');
    expect(protocolService.returnToDraft(M, president).ok).toBe(true);
    expect(protocolService.getMonthPlan(M)!.status).toBe('DRAFT');
  });
});

describe('Coverage preview and the Tuesday relaxation', () => {
  beforeEach(fresh);

  it('warns before generating and changes nothing', () => {
    const slotsBefore = protocolService.slotsForMonth(M).length;
    const planBefore = JSON.stringify(protocolService.getMonthPlan(M));
    const p = protocolService.coveragePreview(M);
    expect(p.rows.length).toBeGreaterThan(10);
    expect(p.shortRows.length).toBeGreaterThan(0);
    const short = p.shortRows.find((r) => r.date === '2026-09-29')!;
    expect(short.projected).toBeLessThan(short.target);
    expect(short.limitedBy).not.toBeNull();
    // rows agree with what generating really does
    for (const r of p.rows) {
      expect(protocolService.teamForService(r.serviceId).length).toBe(r.projected);
    }
    expect(protocolService.slotsForMonth(M).length).toBe(slotsBefore);
    expect(JSON.stringify(protocolService.getMonthPlan(M))).toBe(planBefore);
  });

  it('only the Coordinator can relax the rule, with a reason, in a draft month', () => {
    expect(protocolService.setTuesdayChoirRelaxed(M, true, 'not enough ushers', president).ok).toBe(false);
    expect(protocolService.setTuesdayChoirRelaxed(M, true, 'no', coordinator).ok).toBe(false);
    expect(protocolService.setTuesdayChoirRelaxed(M, true, 'not enough ushers on Tuesdays', coordinator).ok).toBe(true);
    protocolService.submitForReview(M, coordinator);
    expect(protocolService.setTuesdayChoirRelaxed(M, false, '', coordinator).ok).toBe(false);
  });

  it('relaxing lets Tuesday teams use people whose choir is not singing, only on Tuesdays', () => {
    const strictTue = protocolService.coveragePreview(M).rows.filter((r) => r.kind === 'TUESDAY');
    expect(protocolService.setTuesdayChoirRelaxed(M, true, 'not enough ushers on Tuesdays', coordinator).ok).toBe(true);
    const relaxed = protocolService.coveragePreview(M);
    expect(relaxed.tuesdayRelaxed).toBe(true);
    const relaxedTue = relaxed.rows.filter((r) => r.kind === 'TUESDAY');
    // never worse; more people become eligible on Tuesdays
    relaxedTue.forEach((r, i) => expect(r.projected).toBeGreaterThanOrEqual(strictTue[i].projected));
    relaxedTue.forEach((r, i) => expect(r.eligible).toBeGreaterThanOrEqual(strictTue[i].eligible));
    // the strict-rule headcount is still reported, and relaxing is never smaller
    relaxedTue.forEach((r) => expect(r.eligible).toBe(r.eligibleIfRelaxed));
    relaxedTue.forEach((r) => expect(r.eligibleIfRelaxed).toBeGreaterThanOrEqual(r.eligibleWithRule));
    // Sundays are untouched by the relaxation
    const sun = relaxed.rows.filter((r) => r.kind !== 'TUESDAY');
    sun.forEach((r) => expect(r.eligible).toBe(r.eligibleWithRule));

    expect(protocolService.generateTeams(M, coordinator).ok).toBe(true);
    expect(protocolService.getMonthPlan(M)?.relaxTuesdayChoirRule).toBe(true);
    expect(protocolService.validateMonthDetailed(M).blocking).toHaveLength(0);
  });

  it('the relaxation and its reason travel with the published month', () => {
    protocolService.setTuesdayChoirRelaxed(M, true, 'not enough ushers on Tuesdays', coordinator);
    protocolService.generateTeams(M, coordinator);
    expect(protocolService.submitForReview(M, coordinator).ok).toBe(true);
    expect(protocolService.publish(M, president).ok).toBe(true);
    const hist = protocolService.listHistory().find((h) => h.monthKey === M)!;
    expect(hist.validationNotes.some((n) => n.startsWith('Rule relaxed: Tuesday choir rule — not enough ushers'))).toBe(true);
    // restoring requires reopening first
    expect(protocolService.setTuesdayChoirRelaxed(M, false, '', coordinator).ok).toBe(false);
  });
});

describe('Staged release: Music confirms ahead, publishes a month at a time', () => {
  const Q = ['2026-11', '2026-12', '2027-01'];
  function quarterDraft() {
    musicScheduleService._resetForTests();
    musicScheduleService.buildCalendar(Q[0], 'QUARTER');
    expect(musicScheduleService.buildChoirSchedule().ok).toBe(true);
    const d = musicScheduleService.saveDraft('p-music', 'quarter');
    expect(d.ok).toBe(true);
    return d.draft!.id;
  }

  it('a draft covers its months; confirming some leaves the rest in the draft', () => {
    const id = quarterDraft();
    expect(musicScheduleService.draftMonths(id)).toEqual(Q);
    const r = musicScheduleService.confirmDraftMonths(id, 'p-music', [Q[0]]);
    expect(r.ok).toBe(true);
    expect(musicScheduleService.monthState(Q[0])).toBe('CONFIRMED');
    expect(musicScheduleService.getPublishedForMonth(Q[0])).toBeNull();
    expect(musicScheduleService.draftMonths(id)).toEqual([Q[1], Q[2]]);
    // unknown / empty picks are refused
    expect(musicScheduleService.confirmDraftMonths(id, 'p-music', [Q[0]]).ok).toBe(false);
    expect(musicScheduleService.confirmDraftMonths(id, 'p-music', []).ok).toBe(false);
    // the draft disappears once everything is decided
    expect(musicScheduleService.confirmDraftMonths(id, 'p-music', [Q[1], Q[2]]).ok).toBe(true);
    expect(musicScheduleService.getDraft(id)).toBeNull();
    expect(musicScheduleService.confirmedMonths()).toEqual(Q);
  });

  it('only confirmed months can be published, and they go out one at a time', () => {
    const id = quarterDraft();
    expect(musicScheduleService.publishMonths([Q[0]], 'p-music', []).ok).toBe(false);
    musicScheduleService.confirmDraftMonths(id, 'p-music');
    const p = musicScheduleService.publishMonths([Q[0]], 'p-music', ['p-x']);
    expect(p.ok).toBe(true);
    expect(musicScheduleService.monthState(Q[0])).toBe('PUBLISHED');
    expect(musicScheduleService.monthState(Q[1])).toBe('CONFIRMED');
    expect(musicScheduleService.listNotifications('p-x').map((n) => n.periodKey)).toEqual([Q[0]]);
    // a published month cannot be re-confirmed from a new draft
    musicScheduleService.buildCalendar(Q[0], 'MONTH');
    musicScheduleService.buildChoirSchedule();
    const d2 = musicScheduleService.saveDraft('p-music', 'again');
    expect(musicScheduleService.confirmDraftMonths(d2.draft!.id, 'p-music').ok).toBe(false);
  });

  it('Protocol plans against confirmed months but cannot publish before Music does', () => {
    const id = quarterDraft();
    expect(protocolService.generateTeams(Q[0], coordinator).ok).toBe(false); // nothing confirmed yet
    musicScheduleService.confirmDraftMonths(id, 'p-music');
    expect(protocolService.musicState(Q[0])).toBe('CONFIRMED');
    expect(protocolService.allowedMonths()).toEqual(expect.arrayContaining(Q));

    expect(protocolService.generateTeams(Q[0], coordinator).ok).toBe(true);
    expect(protocolService.submitForReview(Q[0], coordinator).ok).toBe(true);
    expect(protocolService.markReviewed(Q[0], president).ok).toBe(true);
    const blocked = protocolService.publish(Q[0], president);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/confirmed .* not published/i);
    expect(protocolService.publishBlockReason(Q[0])).toBeTruthy();

    // Music releases the month; Protocol sees no change and can now publish
    musicScheduleService.publishMonths([Q[0]], 'p-music', []);
    expect(protocolService.musicState(Q[0])).toBe('PUBLISHED');
    expect(protocolService.musicSync(Q[0]).state).toBe('CURRENT');
    expect(protocolService.publish(Q[0], president).ok).toBe(true);
    // the other months are still only confirmed: planned ahead, held back
    expect(protocolService.generateTeams(Q[1], coordinator).ok).toBe(true);
    expect(protocolService.publishBlockReason(Q[1])).toBeTruthy();
  });

  it('editing a confirmed month changes nothing for choirs but warns Protocol', () => {
    const id = quarterDraft();
    musicScheduleService.confirmDraftMonths(id, 'p-music');
    expect(protocolService.generateTeams(Q[1], coordinator).ok).toBe(true);
    expect(protocolService.musicSync(Q[1]).state).toBe('CURRENT');

    const conf = musicScheduleService.getConfirmed(Q[1])!;
    const svc = conf.services.find((s) => s.kind === 'SS1')!;
    const unit = conf.assignments.find((a) => a.serviceId === svc.id)!.unitId;
    const r = musicScheduleService.removePublishedUnit(Q[1], 'p-music', svc.id, unit, ['p-x']);
    expect(r.ok).toBe(true);
    expect(musicScheduleService.getConfirmed(Q[1])!.version).toBe(conf.version + 1);
    expect(musicScheduleService.listNotifications('p-x')).toHaveLength(0); // choirs are told nothing
    expect(musicScheduleService.getPublishedForMonth(Q[1])).toBeNull();
    expect(protocolService.musicSync(Q[1]).state).toBe('STALE');
  });

  it('publishing a whole draft in one go still works, month by month', () => {
    const id = quarterDraft();
    expect(musicScheduleService.publishDraft(id, 'p-music', []).ok).toBe(true);
    expect(Q.map((m) => musicScheduleService.monthState(m))).toEqual(['PUBLISHED', 'PUBLISHED', 'PUBLISHED']);
    expect(musicScheduleService.getDraft(id)).toBeNull();
    expect(musicScheduleService.getPublished(Q[2])!.services.every((s) => s.periodKey === Q[2])).toBe(true);
  });

  it('confirming one draft chooses it over its competitors', () => {
    const a = quarterDraft();
    musicScheduleService.buildCalendar(Q[0], 'QUARTER');
    musicScheduleService.buildChoirSchedule();
    // make it a genuinely different alternative (identical drafts can't be saved twice)
    const canvas = musicScheduleService.getCanvas()!;
    let changed = false;
    for (const svc of canvas.services) {
      for (const a of musicScheduleService.assignmentsForService(canvas.assignments, svc.id)) {
        if (!changed && musicScheduleService.removeCanvasUnit(svc.id, a).ok) changed = true;
      }
    }
    expect(changed).toBe(true);
    const b = musicScheduleService.saveDraft('p-music', 'alternative');
    expect(b.ok).toBe(true);
    expect(musicScheduleService.listDrafts()).toHaveLength(2);
    expect(musicScheduleService.confirmDraftMonths(a, 'p-music').ok).toBe(true);
    expect(musicScheduleService.listDrafts()).toHaveLength(0);
    expect(musicScheduleService.confirmedMonths()).toEqual(Q);
  });

  it('a confirmed quarter is released month by month and tracked as one batch', () => {
    const id = quarterDraft();
    musicScheduleService.confirmDraftMonths(id, 'p-music');
    let [batch] = musicScheduleService.listBatches();
    expect(musicScheduleService.listBatches()).toHaveLength(1);
    expect(batch.horizon).toBe('QUARTER');
    expect(batch.total).toBe(3);
    expect(batch.publishedCount).toBe(0);
    musicScheduleService.publishMonths([Q[0]], 'p-music', []);
    [batch] = musicScheduleService.listBatches();
    expect(batch.publishedCount).toBe(1);
    expect(batch.months.map((m) => m.state)).toEqual(['PUBLISHED', 'CONFIRMED', 'CONFIRMED']);
    musicScheduleService.publishMonths([Q[1], Q[2]], 'p-music', []);
    expect(musicScheduleService.listBatches()).toHaveLength(0); // fully released
  });

  it('later drafts take confirmed months into account for fairness', () => {
    const id = quarterDraft();
    musicScheduleService.confirmDraftMonths(id, 'p-music');
    const h = musicScheduleService.historyFromPublished();
    expect(h.tuesdayHistory.length).toBeGreaterThan(0);
  });
});

describe('Protocol sees confirmed and published months side by side', () => {
  it('a confirmed live month is not shadowed by the demo schedule', () => {
    setProtocolDemoMusic(true);
    musicScheduleService._resetForTests();
    musicScheduleService.buildCalendar(M, 'MONTH');
    expect(musicScheduleService.buildChoirSchedule().ok).toBe(true);
    const d = musicScheduleService.saveDraft('p-music', 'live month');
    expect(musicScheduleService.confirmDraftMonths(d.draft!.id, 'p-music').ok).toBe(true);
    // opening the month in Protocol must not auto-publish a demo over it
    expect(protocolService.servicesForMonth(M).length).toBeGreaterThan(0);
    expect(musicScheduleService.monthState(M)).toBe('CONFIRMED');
    expect(protocolService.musicState(M)).toBe('CONFIRMED');
    expect(protocolService.monthLabel(M)).toBe('Sep 2026 · Music confirmed');
    // the next month has nothing from Music, so the demo bootstrap still fills it
    expect(protocolService.monthLabel('2026-10')).toBe('Oct 2026 · Music published');
    setProtocolDemoMusic(false);
    musicScheduleService._resetForTests();
  });

  it('the picker lists confirmed and published months with their state', () => {
    musicScheduleService._resetForTests();
    musicScheduleService.buildCalendar('2026-12', 'QUARTER');
    musicScheduleService.buildChoirSchedule();
    const d = musicScheduleService.saveDraft('p-music', 'q');
    musicScheduleService.confirmDraftMonths(d.draft!.id, 'p-music');
    musicScheduleService.publishMonths(['2026-12'], 'p-music', []);
    const labels = protocolService.allowedMonths().map((m) => protocolService.monthLabel(m));
    expect(labels).toEqual(expect.arrayContaining([
      'Dec 2026 · Music published',
      'Jan 2027 · Music confirmed',
      'Feb 2027 · Music confirmed',
    ]));
    musicScheduleService._resetForTests();
  });
});

describe('Coordinator: months overview, notification, build all', () => {
  const nothing = () => {
    musicScheduleService._resetForTests();
  };

  it('no demo Music schedule appears on its own: Protocol waits for Music', () => {
    nothing();
    expect(musicScheduleService.monthState('2026-10')).toBe('NONE');
    protocolService.servicesForMonth('2026-10');
    expect(musicScheduleService.monthState('2026-10')).toBe('NONE');
    expect(protocolService.monthLabel('2026-10')).toBe('Oct 2026 · no Music schedule');
  });

  it('confirming a quarter notifies the Coordinator once, naming the range', () => {
    nothing();
    musicScheduleService.buildCalendar('2027-07', 'QUARTER');
    expect(musicScheduleService.buildChoirSchedule().ok).toBe(true);
    const d = musicScheduleService.saveDraft('p-music', 'Q4');
    const before = PROTOCOL_NOTIFICATIONS.filter(
      (n) => n.kind === 'MUSIC_CONFIRMED' && n.personId === coordinator,
    ).length;
    expect(musicScheduleService.confirmDraftMonths(d.draft!.id, 'p-music').ok).toBe(true);
    const got = PROTOCOL_NOTIFICATIONS.filter(
      (n) => n.kind === 'MUSIC_CONFIRMED' && n.personId === coordinator,
    );
    expect(got.length).toBe(before + 1);
    expect(got.some((n) => /Jul 2027 – Sep 2027/.test(n.title) && /3 months/.test(n.body))).toBe(true);
  });

  it('overview lists each confirmed month with what happens next', () => {
    nothing();
    musicScheduleService.buildCalendar('2027-07', 'QUARTER');
    musicScheduleService.buildChoirSchedule();
    const d = musicScheduleService.saveDraft('p-music', 'Q4');
    musicScheduleService.confirmDraftMonths(d.draft!.id, 'p-music');
    const rows = protocolService.monthsOverview();
    const oct = rows.find((r) => r.monthKey === '2027-07')!;
    expect(oct).toMatchObject({ musicState: 'CONFIRMED', places: 0, next: 'BUILD' });
    expect(oct.batchLabel).toMatch(/quarter/);
    expect(protocolService.firstActionMonth()).toBe('2027-07');
    expect(protocolService.generateTeams('2027-07', coordinator).ok).toBe(true);
    expect(protocolService.monthsOverview().find((r) => r.monthKey === '2027-07')!.next).toBe('SEND');
    protocolService.submitForReview('2027-07', coordinator);
    expect(protocolService.monthsOverview().find((r) => r.monthKey === '2027-07')!.next).toBe('WAIT_PRESIDENT');
  });

  it('Build all builds every month that has none, and only the Coordinator may', () => {
    nothing();
    musicScheduleService.buildCalendar('2027-10', 'QUARTER');
    musicScheduleService.buildChoirSchedule();
    const d = musicScheduleService.saveDraft('p-music', 'Q4');
    musicScheduleService.confirmDraftMonths(d.draft!.id, 'p-music');
    expect(protocolService.buildAllReady(president).ok).toBe(false);
    const r = protocolService.buildAllReady(coordinator);
    expect(r.ok).toBe(true);
    expect(r.failed).toEqual([]);
    expect(r.built).toEqual(['2027-10', '2027-11', '2027-12']);
    expect(protocolService.buildAllReady(coordinator).built).toEqual([]);
  });

  it('a month Music has not touched shows as waiting for Music', () => {
    nothing();
    expect(protocolService.monthsOverview().every((r) => r.musicState !== 'NONE' || r.next === 'WAIT_MUSIC')).toBe(true);
  });
});

describe('Service teams: leaders and member actions', () => {
  beforeEach(fresh);

  it('every team has exactly one recommended TL and one VTL, with no duplicate people', () => {
    for (const svc of protocolService.servicesForMonth(M)) {
      const team = protocolService.teamForService(svc.id);
      const ids = team.map((s) => s.personId);
      expect(new Set(ids).size).toBe(ids.length);
      const l = protocolService.leadersOf(svc.id);
      expect(l.teamLeader).toBeTruthy();
      expect(l.viceLeader).toBeTruthy();
      expect(l.teamLeader!.personId).not.toBe(l.viceLeader!.personId);
      expect(team.filter((s) => s.recommendedRole === 'TEAM_LEADER').length).toBe(1);
      expect(team.filter((s) => s.recommendedRole === 'VICE_LEADER').length).toBe(1);
    }
  });

  it('leadership rotates instead of always going to the same people', () => {
    const tls = protocolService
      .servicesForMonth(M)
      .map((svc) => protocolService.leadersOf(svc.id).teamLeader!.personId);
    expect(new Set(tls).size).toBeGreaterThan(Math.floor(tls.length / 2));
  });

  it('approving leaders approves both, and only the Coordinator can', () => {
    const svc = protocolService.servicesForMonth(M)[0]!;
    expect(protocolService.approveLeaders(svc.id, president).ok).toBe(false);
    const r = protocolService.approveLeaders(svc.id, coordinator);
    expect(r.ok).toBe(true);
    expect(r.approved).toBe(2);
    const l = protocolService.leadersOf(svc.id);
    expect(l.teamLeader!.status).toBe('APPROVED');
    expect(l.viceLeader!.status).toBe('APPROVED');
  });

  it('replacing or removing a leader recommends a new one', () => {
    const svc = protocolService.servicesForMonth(M)[0]!;
    const tl = protocolService.leadersOf(svc.id).teamLeader!.personId;
    const cand = protocolService.eligibleForServiceTeam(svc.id)[0];
    if (cand) {
      expect(protocolService.replaceTeamMember(svc.id, tl, cand.personId, coordinator).ok).toBe(true);
    } else {
      expect(protocolService.removeTeamMember(svc.id, tl, coordinator).ok).toBe(true);
    }
    const l = protocolService.leadersOf(svc.id);
    expect(l.teamLeader).toBeTruthy();
    expect(l.viceLeader).toBeTruthy();
  });

  it('a member can be removed (the team is then short and says so)', () => {
    const svc = protocolService.servicesForMonth(M)[0]!;
    const who = protocolService.teamForService(svc.id).find((s) => s.role === 'MEMBER' && !s.recommendedRole)!;
    const r = protocolService.removeTeamMember(svc.id, who.personId, coordinator);
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/Add or replace/);
    expect(protocolService.teamForService(svc.id).some((s) => s.personId === who.personId)).toBe(false);
    expect(protocolService.validateMonthDetailed(M).issues.some((i) => i.code === 'TEAM_SHORT' && i.serviceId === svc.id)).toBe(true);
  });

  it('participation lists duties, load and record for a person', () => {
    const svc = protocolService.servicesForMonth(M)[0]!;
    const who = protocolService.teamForService(svc.id)[0]!.personId;
    const p = protocolService.personParticipation(who, M);
    expect(p.name).toBeTruthy();
    expect(p.duties.some((d) => d.serviceId === svc.id)).toBe(true);
    expect(p.officialThisMonth).toBeGreaterThan(0);
    expect(p.target).toBe(3);
  });
});

describe('Music change log and the Coordinator inbox', () => {
  const Q = ['2026-11', '2026-12', '2027-01'];
  const mine = () => PROTOCOL_NOTIFICATIONS.filter((n) => n.personId === coordinator);
  function confirmed() {
    musicScheduleService._resetForTests();
    musicScheduleService.buildCalendar(Q[0], 'QUARTER');
    musicScheduleService.buildChoirSchedule();
    const d = musicScheduleService.saveDraft('p-music', 'q');
    musicScheduleService.confirmDraftMonths(d.draft!.id, 'p-music');
  }

  it('records each confirmation', () => {
    confirmed();
    const log = musicScheduleService.listLog();
    expect(log.map((e) => e.periodKey).sort()).toEqual(Q);
    expect(log.every((e) => e.action === 'CONFIRMED' && e.stage === 'CONFIRMED' && e.byPersonId === 'p-music')).toBe(true);
  });

  it('records a release, and tells the Coordinator', () => {
    confirmed();
    musicScheduleService.publishMonths([Q[0]], 'p-music', []);
    const e = musicScheduleService.listLog(Q[0])[0]!;
    expect(e).toMatchObject({ action: 'PUBLISHED', stage: 'PUBLISHED' });
    const n = mine()[0]!;
    expect(n.kind).toBe('MUSIC_PUBLISHED');
    expect(n.href).toBe('/systems/protocol/music');
  });

  it('records exactly which choir moved, on a confirmed month and on a published one', () => {
    confirmed();
    const stage = (m: string) => musicScheduleService.getConfirmed(m) ?? musicScheduleService.getPublished(m)!;
    const month = Q[1];
    const cur = stage(month);
    const svc = cur.services.find((s) => s.kind === 'SS1')!;
    const unit = cur.assignments.find((a) => a.serviceId === svc.id)!.unitId;

    expect(musicScheduleService.removePublishedUnit(month, 'p-music', svc.id, unit, []).ok).toBe(true);
    const e1 = musicScheduleService.listLog(month)[0]!;
    expect(e1).toMatchObject({ action: 'EDITED', stage: 'CONFIRMED' });
    expect(e1.changes).toHaveLength(1);
    expect(e1.changes[0]).toMatchObject({ kind: 'REMOVED', serviceId: svc.id });
    expect(e1.changes[0]!.text).toContain('removed from');
    expect(mine()[0]!.kind).toBe('MUSIC_EDITED');
    expect(mine()[0]!.title).toContain('confirmed month');
    expect(mine()[0]!.body).toContain(e1.summary);

    // after release, the same edit is logged against the published copy
    musicScheduleService.publishMonths([month], 'p-music', []);
    const svc2 = musicScheduleService.getPublished(month)!.services.find((s) => s.kind === 'SS2')!;
    const u2 = musicScheduleService.getPublished(month)!.assignments.find((a) => a.serviceId === svc2.id)!.unitId;
    expect(musicScheduleService.removePublishedUnit(month, 'p-music', svc2.id, u2, []).ok).toBe(true);
    const e2 = musicScheduleService.listLog(month)[0]!;
    expect(e2).toMatchObject({ action: 'EDITED', stage: 'PUBLISHED' });
    expect(e2.changes[0]).toMatchObject({ kind: 'REMOVED' });
    expect(mine()[0]!.kind).toBe('MUSIC_EDITED');
    expect(mine()[0]!.title).toContain('published schedule');
    // the trail keeps everything, oldest last
    expect(musicScheduleService.listLog(month).map((e) => e.action)).toEqual(['EDITED', 'PUBLISHED', 'EDITED', 'CONFIRMED']);
  });

  it('the trail survives a save and reload', () => {
    confirmed();
    const saved = JSON.parse(JSON.stringify(musicScheduleService.exportLocalState()));
    musicScheduleService._resetForTests();
    expect(musicScheduleService.listLog()).toHaveLength(0);
    musicScheduleService.importLocalState(saved);
    expect(musicScheduleService.listLog()).toHaveLength(3);
  });
});

describe('Availability: the Coordinator sets who serves which services', () => {
  const target = () => PROTOCOL_ROSTER.find((m) => m.office === 'MEMBER' && m.status === 'ACTIVE')!;

  it('limits a member to chosen services, and the team builder honours it', async () => {
    const { canServeKind } = await import('../domain/teamEngine');
    const m = target();
    expect(protocolService.rosterUpdate(m.id, { allowedServiceKinds: ['SS1', 'TUESDAY'] }, coordinator).ok).toBe(true);
    const row = PROTOCOL_ROSTER.find((x) => x.id === m.id)!;
    expect(row.allowedServiceKinds).toEqual(['SS1', 'TUESDAY']);
    expect(row.serveDays).toBe('BOTH');
    expect(canServeKind(row, 'SS1')).toBe(true);
    expect(canServeKind(row, 'SS2')).toBe(false);
    expect(canServeKind(row, 'IGABURO')).toBe(false);
  });

  it('Sunday-family only maps to Sundays; picking every service lifts the limit', () => {
    const m = target();
    protocolService.rosterUpdate(m.id, { allowedServiceKinds: ['SS2', 'IGABURO'] }, coordinator);
    expect(PROTOCOL_ROSTER.find((x) => x.id === m.id)!.serveDays).toBe('SUNDAY');
    protocolService.rosterUpdate(m.id, { allowedServiceKinds: ['SS1', 'SS2', 'TUESDAY', 'IGABURO'] }, coordinator);
    const row = PROTOCOL_ROSTER.find((x) => x.id === m.id)!;
    expect(row.allowedServiceKinds).toBeUndefined();
    expect(row.serveDays).toBe('BOTH');
  });

  it('refuses an empty choice and non-coordinators', () => {
    const m = target();
    expect(protocolService.rosterUpdate(m.id, { allowedServiceKinds: [] }, coordinator).ok).toBe(false);
    expect(protocolService.rosterUpdate(m.id, { allowedServiceKinds: ['SS1'] }, president).ok).toBe(false);
  });

  it('saving other details does not wipe the service choice', () => {
    const m = target();
    protocolService.rosterUpdate(m.id, { allowedServiceKinds: ['SS1'] }, coordinator);
    const row = PROTOCOL_ROSTER.find((x) => x.id === m.id)!;
    protocolService.rosterUpdate(m.id, { serveDays: row.serveDays, notes: 'x', status: 'LEAVE' }, coordinator);
    const after = PROTOCOL_ROSTER.find((x) => x.id === m.id)!;
    expect(after.allowedServiceKinds).toEqual(['SS1']);
    expect(after.status).toBe('LEAVE');
    protocolService.rosterUpdate(m.id, { status: 'ACTIVE', allowedServiceKinds: ['SS1', 'SS2', 'TUESDAY', 'IGABURO'] }, coordinator);
  });

  it('particular services: only the ticked ones in a month, usual rule in other months', async () => {
    const { canServeKind } = await import('../domain/teamEngine');
    const m = target();
    const r = protocolService.rosterUpdate(
      m.id,
      {
        onlyServices: [
          { date: '2026-10-11', kind: 'SS2' },
          { date: '2026-10-04', kind: 'SS1' },
          { date: '2026-10-04', kind: 'SS1' },
        ],
      },
      coordinator,
    );
    expect(r.ok).toBe(true);
    const row = PROTOCOL_ROSTER.find((x) => x.id === m.id)!;
    expect(row.onlyServices).toEqual([
      { date: '2026-10-04', kind: 'SS1' },
      { date: '2026-10-11', kind: 'SS2' },
    ]);
    expect(canServeKind(row, 'SS1', '2026-10-04')).toBe(true);
    expect(canServeKind(row, 'SS2', '2026-10-11')).toBe(true);
    expect(canServeKind(row, 'SS2', '2026-10-04')).toBe(false); // not ticked
    expect(canServeKind(row, 'SS1', '2026-10-18')).toBe(false); // not ticked, same month
    expect(canServeKind(row, 'TUESDAY', '2026-10-13')).toBe(false);
    expect(canServeKind(row, 'SS1', '2026-11-01')).toBe(true); // no picks in November
    // clearing returns to the usual rule
    expect(protocolService.rosterUpdate(m.id, { onlyServices: [] }, coordinator).ok).toBe(true);
    expect(PROTOCOL_ROSTER.find((x) => x.id === m.id)!.onlyServices).toBeUndefined();
    expect(canServeKind(PROTOCOL_ROSTER.find((x) => x.id === m.id)!, 'SS1', '2026-10-18')).toBe(true);
  });

  it('rejects an invalid service and non-coordinators', () => {
    const m = target();
    expect(protocolService.rosterUpdate(m.id, { onlyServices: [{ date: '4 Oct', kind: 'SS1' }] }, coordinator).ok).toBe(false);
    expect(protocolService.rosterUpdate(m.id, { onlyServices: [{ date: '2026-10-04', kind: 'FRIDAY' as never }] }, coordinator).ok).toBe(false);
    expect(protocolService.rosterUpdate(m.id, { onlyServices: [{ date: '2026-10-04', kind: 'SS1' }] }, president).ok).toBe(false);
  });

  it('the team builder only places a member on the services picked for that month', () => {
    const month = '2027-01';
    musicScheduleService._resetForTests();
    musicScheduleService.buildCalendar(month, 'MONTH');
    expect(musicScheduleService.buildChoirSchedule().ok).toBe(true);
    const d = musicScheduleService.saveDraft('p-music', 'picks');
    expect(musicScheduleService.confirmDraftMonths(d.draft!.id, 'p-music').ok).toBe(true);

    const dutiesOf = (personId: string) =>
      PROTOCOL_TEAM_SLOTS.filter((x) => x.personId === personId)
        .map((x) => protocolService.servicesForMonth(month).find((s) => s.id === x.serviceId))
        .filter((s): s is NonNullable<typeof s> => !!s);

    // Baseline: build with no picks; find someone with several duties.
    expect(protocolService.generateTeams(month, coordinator).ok).toBe(true);
    const row = PROTOCOL_ROSTER.filter((m) => m.office === 'MEMBER' && m.status === 'ACTIVE').find(
      (m) => dutiesOf(m.personId).length >= 2,
    )!;
    expect(row).toBeTruthy();
    const keep = dutiesOf(row.personId)[0]!;

    // Pick only that one service, rebuild: the member serves it and nothing else.
    expect(
      protocolService.rosterUpdate(row.id, { onlyServices: [{ date: keep.date, kind: keep.kind }] }, coordinator).ok,
    ).toBe(true);
    expect(protocolService.generateTeams(month, coordinator).ok).toBe(true);
    const after = dutiesOf(row.personId).map((s) => `${s.date}|${s.kind}`);
    expect(after.every((k) => k === `${keep.date}|${keep.kind}`)).toBe(true);
    expect(PROTOCOL_ROSTER.find((x) => x.id === row.id)!.onlyServices).toHaveLength(1);

    // A built team that breaks the picks is flagged until rebuilt or replaced.
    const other = protocolService.servicesForMonth(month).find((s) => s.id !== keep.id && s.kind === 'TUESDAY')!;
    const slot = PROTOCOL_TEAM_SLOTS.find((x) => x.serviceId === other.id)!;
    const old = slot.personId;
    slot.personId = row.personId;
    expect(
      protocolService.validateMonthDetailed(month).issues.some((i) => i.code === 'CANNOT_SERVE' && i.serviceId === other.id),
    ).toBe(true);
    slot.personId = old;
    protocolService.rosterUpdate(row.id, { onlyServices: [] }, coordinator);
  });

  it('a member\'s choir is stored on the roster and must be a real Music choir', () => {
    const m = target();
    expect(protocolService.rosterUpdate(m.id, { choirUnitId: 'mu-elim' }, coordinator).ok).toBe(true);
    expect(PROTOCOL_ROSTER.find((x) => x.id === m.id)!.choirUnitId).toBe('mu-elim');
    expect(protocolService.rosterUpdate(m.id, { choirUnitId: 'mu-nope' }, coordinator).ok).toBe(false);
    expect(protocolService.rosterUpdate(m.id, { choirUnitId: '' }, coordinator).ok).toBe(true);
    expect(PROTOCOL_ROSTER.find((x) => x.id === m.id)!.choirUnitId).toBeUndefined();
  });
});
