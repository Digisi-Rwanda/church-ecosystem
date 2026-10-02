import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkScheduleChange, diffRows, type GuardActor } from '../src/policy/scheduleGuard';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

const pos = (personId: string, protocolOffice: string) => ({
  id: `pos-${personId}`, personId, systemId: 'sys-protocol', title: protocolOffice,
  protocolOffice, status: 'ACTIVE', startDate: '2024-01-01',
});
const actor = (personId: string, office?: string, grants: GuardActor['grants'] = []): GuardActor => ({
  personId,
  grants: [{ systemId: 'sys-protocol', resource: 'PROTOCOL_SCHEDULE', action: 'VIEW', source: 'T', reason: 't' }, ...grants],
  positions: office ? [pos(personId, office)] : [],
});
const coordGrant = { systemId: 'sys-protocol', resource: 'PROTOCOL_SCHEDULE', action: 'MANAGE', source: 'T', reason: 't' };

describe('diffRows', () => {
  it('finds added, changed and removed rows', () => {
    const d = diffRows([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'a', v: 2 }, { id: 'c', v: 1 }]);
    expect(d.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('protocol rules', () => {
  const draft = { protocolMonthPlans: [{ id: 'm1', monthKey: '2026-11', status: 'DRAFT' }] };
  const review = { protocolMonthPlans: [{ id: 'm1', monthKey: '2026-11', status: 'REVIEW' }] };
  const published = { protocolMonthPlans: [{ id: 'm1', monthKey: '2026-11', status: 'PUBLISHED' }] };

  it('coordinator may submit for review but not publish', () => {
    const c = actor('p-c', 'COORDINATOR', [coordGrant]);
    expect(checkScheduleChange('protocol', draft, review, c)).toEqual([]);
    expect(checkScheduleChange('protocol', review, published, c)).toHaveLength(1);
  });
  it('president may publish and send back', () => {
    const p = actor('p-p', 'PRESIDENT');
    expect(checkScheduleChange('protocol', review, published, p)).toEqual([]);
    expect(checkScheduleChange('protocol', review, draft, p)).toEqual([]);
  });
  it('a plain member cannot build or publish', () => {
    const m = actor('p-m');
    expect(checkScheduleChange('protocol', draft, review, m)).toHaveLength(1);
    expect(checkScheduleChange('protocol', {}, { protocolServices: [{ id: 's1' }] }, m)).toHaveLength(1);
  });
  it('a member may only touch their own absence requests', () => {
    const m = actor('p-m');
    const mine = { protocolAbsenceRequests: [{ id: 'r1', personId: 'p-m' }] };
    const theirs = { protocolAbsenceRequests: [{ id: 'r2', personId: 'p-other' }] };
    expect(checkScheduleChange('protocol', {}, mine, m)).toEqual([]);
    expect(checkScheduleChange('protocol', {}, theirs, m)).toHaveLength(1);
  });
  it('someone outside Protocol cannot change member collections', () => {
    const out: GuardActor = { personId: 'p-x', grants: [], positions: [] };
    expect(
      checkScheduleChange('protocol', {}, { protocolAbsenceRequests: [{ id: 'r', personId: 'p-x' }] }, out),
    ).toHaveLength(1);
  });
  it('unchanged documents always pass', () => {
    const out: GuardActor = { personId: 'p-x', grants: [], positions: [] };
    expect(checkScheduleChange('protocol', draft, draft, out)).toEqual([]);
  });
});

describe('music rules', () => {
  const before = { musicSchedule: { drafts: [], published: [], confirmed: [], notifs: [] } };
  const after = { musicSchedule: { drafts: [{ id: 'd1' }], published: [], confirmed: [], notifs: [] } };
  it('needs Music management rights to change drafts', () => {
    const none: GuardActor = { personId: 'p', grants: [], positions: [] };
    const mgr: GuardActor = {
      personId: 'p',
      grants: [{ systemId: 'sys-music', resource: 'MEMBERSHIP', action: 'MANAGE', source: 'T', reason: 't' }],
      positions: [],
    };
    expect(checkScheduleChange('music', before, after, none)).toHaveLength(1);
    expect(checkScheduleChange('music', before, after, mgr)).toEqual([]);
  });
  it('anyone may change notifications (reading marks them)', () => {
    const none: GuardActor = { personId: 'p', grants: [], positions: [] };
    const read = { musicSchedule: { ...before.musicSchedule, notifs: [{ id: 'n', read: true }] } };
    expect(checkScheduleChange('music', before, read, none)).toEqual([]);
  });
});

describe('route modes', () => {
  beforeEach(() => {
    fake.__reset();
    seedWorld(fake.__db);
    delete process.env.SCHEDULE_GUARD;
  });
  const app = async () => (await import('../src/app.js')).createApp();
  const body = { baseVersion: 0, data: { musicSchedule: { drafts: [{ id: 'd1' }] } } };

  it('warn (default): saves but reports', async () => {
    const r = await request(await app()).put('/api/schedule-state/music').set(bearer('p-member')).send(body);
    expect(r.status).toBe(200);
    expect(r.body.guardWarnings?.length).toBeGreaterThan(0);
  });
  it('enforce: refuses a member, allows the church leader', async () => {
    process.env.SCHEDULE_GUARD = 'enforce';
    const a = await app();
    const no = await request(a).put('/api/schedule-state/music').set(bearer('p-member')).send(body);
    expect(no.status).toBe(403);
    const ok = await request(a).put('/api/schedule-state/music').set(bearer('p-pastor')).send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.guardWarnings).toBeUndefined();
  });
  it('off: no checks', async () => {
    process.env.SCHEDULE_GUARD = 'off';
    const r = await request(await app()).put('/api/schedule-state/music').set(bearer('p-member')).send(body);
    expect(r.status).toBe(200);
    expect(r.body.guardWarnings).toBeUndefined();
  });
});
