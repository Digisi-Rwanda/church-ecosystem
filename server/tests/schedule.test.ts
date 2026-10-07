import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { canSeePlan, isMonthKey, monthOf, monthRange, moveProblem, rangeProblem } from '../src/schedule/rules';
import type { AccessData } from '../src/capabilities/engine';

const NOW = new Date('2026-10-06T12:00:00Z');
const pos = (id: string, personId: string, office: string, systemId: string, orgUnitId: string | null = null) => ({ id, personId, office, systemId, orgUnitId, status: 'ACTIVE', startDate: '2020-01-01', endDate: null as string | null });
const data: AccessData = {
  positions: [pos('a', 'pres', 'PRESIDENT', 'sys-choir'), pos('b', 'vp', 'VICE_PRESIDENT', 'sys-choir')],
  memberships: [],
  delegations: [],
};

describe('schedule rules', () => {
  it('months are read in church time (UTC+2)', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(monthOf('2026-09-30T22:30:00Z')).toBe('2026-10');
    expect(monthOf('2026-10-31T21:59:00Z')).toBe('2026-10');
    expect(monthOf('2026-10-31T22:00:00Z')).toBe('2026-11');
    const r = monthRange('2026-10');
    expect(r.from.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-31T21:59:59.999Z');
  });
  it('drafts are for planners only, published plans for readers', () => {
    expect(canSeePlan('DRAFT', 'vp', 'sys-choir', data, NOW)).toBe(true);
    expect(canSeePlan('DRAFT', 'nobody', 'sys-choir', data, NOW)).toBe(false);
    expect(canSeePlan('PUBLISHED', 'pres', 'sys-choir', data, NOW)).toBe(true);
  });
  it('moves need the right state, and confirming needs a slot', () => {
    expect(moveProblem('confirm', { status: 'DRAFT' }, 0)).toBe('EMPTY_PLAN');
    expect(moveProblem('confirm', { status: 'DRAFT' }, 2)).toBeNull();
    expect(moveProblem('publish', { status: 'DRAFT' }, 2)).toBe('WRONG_STATE');
    expect(moveProblem('publish', { status: 'CONFIRMED' }, 2)).toBeNull();
    expect(moveProblem('reopen', { status: 'DRAFT' }, 2)).toBe('WRONG_STATE');
    expect(rangeProblem(new Date('2026-10-06T10:00:00Z'), new Date('2026-10-06T09:00:00Z'))).toBe(true);
    expect(rangeProblem(new Date('2026-10-06T10:00:00Z'), null)).toBe(false);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const patch = (as: string, path: string, body: object = {}) => request(app).patch(path).set(bearer(as)).send(body);
const del = (as: string, path: string) => request(app).delete(path).set(bearer(as));

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'monthPlan', 'scheduleSlot', 'slotAssignment']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.orgUnit.push(
    { id: 'ou-church', name: 'ADEPR Kacyiru', code: 'KAC', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-choir', name: 'Choir', code: 'KAC-MUS-CHO', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-choir' },
    { id: 'ou-youth', name: 'Youth', code: 'KAC-YOU', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
  );
  db.person.push(
    { id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' },
    { id: 'p-usec', fullName: 'Choir Secretary', status: 'ACTIVE' },
  );
  db.position.push(
    { id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-usec', personId: 'p-usec', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Secretary', office: 'SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const slot = (o: object = {}) => ({ unitId: 'ou-choir', title: 'Sunday service', kind: 'SERVICE', startsAt: '2026-10-11T06:30:00Z', endsAt: '2026-10-11T09:00:00Z', churchWide: false, ...o });
const addSlot = async (o: object = {}, as = 'p-vp') => (await post(as, '/api/schedule/slots', slot(o))).body as { slotId: string; planId: string };
const publish = async (planId: string) => {
  await post('p-vp', `/api/schedule/plans/${planId}/confirm`);
  return post('p-choir-leader', `/api/schedule/plans/${planId}/publish`);
};

describe('building a month', () => {
  it('needs sign-in and a Write letter; a plan is created with the first slot', async () => {
    expect((await request(app).post('/api/schedule/slots').send({})).status).toBe(401);
    expect((await post('p-choir-member', '/api/schedule/slots', slot())).status).toBe(403);
    expect((await post('p-vp', '/api/schedule/slots', {})).status).toBe(400);
    expect((await post('p-vp', '/api/schedule/slots', slot({ unitId: 'ou-zzz' }))).status).toBe(404);
    expect((await post('p-vp', '/api/schedule/slots', slot({ endsAt: '2026-10-11T05:00:00Z' }))).body.code).toBe('BAD_RANGE');
    const r = await post('p-vp', '/api/schedule/slots', slot());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.month).toBe('2026-10');
    expect(fake.__db.monthPlan).toHaveLength(1);
    await addSlot({ title: 'Rehearsal', kind: 'REHEARSAL', startsAt: '2026-10-14T15:00:00Z' });
    expect(fake.__db.monthPlan).toHaveLength(1);
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'SCHEDULE_SLOT_ADDED')).toBe(true);
  });
  it('slots can be edited and removed while the plan is a draft, with their assignments', async () => {
    const { slotId } = await addSlot();
    expect((await patch('p-vp', `/api/schedule/slots/${slotId}`, { ...slot(), title: 'Morning service' })).status).toBe(200);
    expect((await patch('p-vp', `/api/schedule/slots/${slotId}`, { ...slot(), startsAt: '2026-11-02T06:00:00Z', endsAt: null })).body.code).toBe('WRONG_MONTH');
    await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-choir-member', role: 'Lead singer' });
    expect((await del('p-vp', `/api/schedule/slots/${slotId}`)).status).toBe(200);
    expect(fake.__db.scheduleSlot).toHaveLength(0);
    expect(fake.__db.slotAssignment).toHaveLength(0);
  });
  it('an assignment needs a real person, once per slot', async () => {
    const { slotId } = await addSlot();
    expect((await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-zzz', role: 'Piano' })).status).toBe(404);
    expect((await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-choir-member', role: 'Piano' })).status).toBe(201);
    expect((await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-choir-member', role: 'Piano' })).body.code).toBe('ALREADY_ASSIGNED');
    expect((await post('p-choir-member', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-vp', role: 'x' })).status).toBe(404);
  });
});

describe('who sees a draft', () => {
  it('only planners see a draft; the team sees it once published', async () => {
    const { planId } = await addSlot();
    const month = '/api/schedule/month?systemId=sys-choir&month=2026-10';
    const mine = (await get('p-vp', month)).body;
    expect(mine.canWrite).toBe(true);
    expect(mine.units[0].slots).toHaveLength(1);
    const member = await get('p-choir-member', month);
    expect(member.status).toBe(200);
    expect(member.body.units).toHaveLength(0);
    expect((await get('p-outsider', month)).status).toBe(404);
    await publish(planId);
    const after = (await get('p-choir-member', month)).body;
    expect(after.units[0].slots).toHaveLength(1);
    expect(after.units[0].plan.status).toBe('PUBLISHED');
    expect(after.canWrite).toBe(false);
  });
});

describe('confirming and publishing', () => {
  it('confirm needs C and a slot; publish needs P, after confirming', async () => {
    const { planId } = await addSlot();
    expect((await post('p-usec', `/api/schedule/plans/${planId}/confirm`)).status).toBe(403);
    expect((await post('p-choir-leader', `/api/schedule/plans/${planId}/publish`)).body.code).toBe('WRONG_STATE');
    expect((await post('p-vp', `/api/schedule/plans/${planId}/confirm`)).status).toBe(200);
    expect((await post('p-vp', `/api/schedule/plans/${planId}/publish`)).status).toBe(403);
    expect((await post('p-vp', `/api/schedule/plans/${planId}/confirm`)).body.code).toBe('WRONG_STATE');
    expect((await post('p-choir-leader', `/api/schedule/plans/${planId}/publish`)).status).toBe(200);
    expect(fake.__db.auditEvent.map((e: any) => e.action)).toEqual(expect.arrayContaining(['SCHEDULE_PLAN_CONFIRM', 'SCHEDULE_PLAN_PUBLISH']));
  });
  it('a confirmed or published plan is locked until reopened', async () => {
    const { slotId, planId } = await addSlot();
    await post('p-vp', `/api/schedule/plans/${planId}/confirm`);
    expect((await patch('p-vp', `/api/schedule/slots/${slotId}`, slot())).body.code).toBe('PLAN_LOCKED');
    expect((await post('p-vp', '/api/schedule/slots', slot({ title: 'Another' }))).body.code).toBe('PLAN_LOCKED');
    expect((await post('p-vp', `/api/schedule/plans/${planId}/reopen`)).status).toBe(200);
    expect(fake.__db.monthPlan[0].status).toBe('DRAFT');
    expect((await post('p-vp', `/api/schedule/plans/${planId}/reopen`)).body.code).toBe('WRONG_STATE');
    expect((await patch('p-vp', `/api/schedule/slots/${slotId}`, slot())).status).toBe(200);
  });
  it('publishing tells each assignee once', async () => {
    const { slotId, planId } = await addSlot();
    await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-choir-member', role: 'Lead singer' });
    expect(fake.__db.notification).toHaveLength(0);
    await publish(planId);
    expect(fake.__db.notification).toHaveLength(1);
    expect(fake.__db.notification[0]).toMatchObject({ toPersonId: 'p-choir-member', kind: 'FOR_INFORMATION' });
    await post('p-vp', `/api/schedule/plans/${planId}/reopen`);
    await publish(planId);
    expect(fake.__db.notification).toHaveLength(1);
  });
});

describe('declining and replacing', () => {
  const published = async () => {
    const { slotId, planId } = await addSlot();
    const a = await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-choir-member', role: 'Lead singer' });
    await publish(planId);
    return { slotId, planId, asgId: a.body.assignmentId as string };
  };
  it('only the assignee declines, with a reason, and the planner is asked to fill the place', async () => {
    const { asgId } = await published();
    expect((await post('p-vp', `/api/schedule/assignments/${asgId}/decline`, { reason: 'Away' })).status).toBe(403);
    expect((await post('p-choir-member', `/api/schedule/assignments/${asgId}/decline`, {})).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-choir-member', `/api/schedule/assignments/${asgId}/decline`, { reason: 'I am travelling' })).status).toBe(200);
    expect(fake.__db.slotAssignment[0]).toMatchObject({ status: 'DECLINED', declineReason: 'I am travelling' });
    const waiting = fake.__db.notification.filter((n: any) => n.kind === 'WAITING_FOR_ME');
    expect(waiting.some((n: any) => n.toPersonId === 'p-vp')).toBe(true);
    expect((await post('p-choir-member', `/api/schedule/assignments/${asgId}/decline`, { reason: 'again' })).body.code).toBe('WRONG_STATE');
  });
  it('cannot decline before publishing', async () => {
    const { slotId } = await addSlot();
    const a = await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-choir-member', role: 'Piano' });
    expect((await post('p-choir-member', `/api/schedule/assignments/${a.body.assignmentId}/decline`, { reason: 'x' })).status).toBe(404);
  });
  it('a planner replaces a declined place even after publishing; the new person is told', async () => {
    const { asgId } = await published();
    await post('p-choir-member', `/api/schedule/assignments/${asgId}/decline`, { reason: 'Sick' });
    expect((await post('p-vp', `/api/schedule/assignments/${asgId}/replace`, { personId: 'p-youth-member' })).status).toBe(201);
    expect(fake.__db.slotAssignment.map((a: any) => a.status).sort()).toEqual(['ASSIGNED', 'REPLACED']);
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-youth-member')).toBe(true);
    expect((await post('p-vp', `/api/schedule/assignments/${asgId}/replace`, { personId: 'p-youth-member' })).body.code).toBe('WRONG_STATE');
  });
  it('the planner cannot remove a published assignment directly', async () => {
    const { asgId } = await published();
    expect((await del('p-vp', `/api/schedule/assignments/${asgId}`)).body.code).toBe('PLAN_LOCKED');
  });
});

describe('my duties and the church calendar', () => {
  it('my duties list published, upcoming, still-assigned places across units', async () => {
    const { slotId, planId } = await addSlot({ startsAt: new Date(Date.now() + 5 * 86400000).toISOString(), endsAt: null });
    await post('p-vp', `/api/schedule/slots/${slotId}/assign`, { personId: 'p-choir-member', role: 'Reader' });
    expect((await get('p-choir-member', '/api/schedule/mine')).body.duties).toHaveLength(0);
    await publish(planId);
    const d = (await get('p-choir-member', '/api/schedule/mine')).body.duties;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ role: 'Reader', title: 'Sunday service', unitName: 'Choir' });
  });
  it('the church calendar shows only published slots marked for the whole church, with no names', async () => {
    const a = await addSlot({ title: 'Harvest concert', churchWide: true });
    await addSlot({ title: 'Choir rehearsal', startsAt: '2026-10-14T15:00:00Z', endsAt: null });
    const cal = '/api/schedule/church?month=2026-10';
    expect((await get('p-member', cal)).body.slots).toHaveLength(0);
    await publish(a.planId);
    const r = (await get('p-member', cal)).body;
    expect(r.slots.map((s: any) => s.title)).toEqual(['Harvest concert']);
    expect(r.slots[0].unitName).toBe('Choir');
    expect(JSON.stringify(r)).not.toContain('personName');
    expect((await get('p-outsider', cal)).status).toBe(404);
    expect((await get('p-member', '/api/schedule/church?month=oct')).status).toBe(400);
  });
});
