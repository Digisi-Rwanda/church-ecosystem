import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { isMonth, roleMayServe } from '../src/music/rules';

describe('music rules', () => {
  it('who may serve where', () => {
    expect(roleMayServe('CHILDREN', 'SS1')).toBe(true);
    expect(roleMayServe('CHILDREN', 'SS2')).toBe(false);
    expect(roleMayServe('WORSHIP', 'TUESDAY')).toBe(true);
    expect(roleMayServe('WORSHIP', 'FRIDAY')).toBe(false);
    expect(roleMayServe('PRIMARY', 'IGABURO')).toBe(true);
    expect(roleMayServe('PRIMARY', 'NOPE')).toBe(false);
  });
  it('months', () => {
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const del = (as: string, path: string) => request(app).delete(path).set(bearer(as));

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'musicChoir', 'musicChoirMember', 'musicPlan', 'musicService', 'musicAssignment']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.position.push({ id: 'pos-music', personId: 'p-outsider', systemId: 'sys-music', title: 'Music Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const MUSIC_LEADER = 'p-outsider';
const choir = async (name = 'Elim', role = 'PRIMARY') => (await post(MUSIC_LEADER, '/api/music/choirs', { name, role })).body.id as string;

describe('choirs and the register', () => {
  it('the Music leader adds choirs; names are unique among active choirs', async () => {
    const id = await choir();
    expect(id).toBeTruthy();
    expect((await post(MUSIC_LEADER, '/api/music/choirs', { name: 'elim', role: 'PRIMARY' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post('p-member', '/api/music/choirs', { name: 'X', role: 'PRIMARY' })).status).toBe(403);
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/active`, { active: false })).status).toBe(200);
    expect(await choir('Elim')).toBeTruthy();
  });
  it('members join and leave; people outside cannot see the register', async () => {
    const id = await choir();
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/members`, { personId: 'p-member' })).status).toBe(201);
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/members`, { personId: 'p-member' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post(MUSIC_LEADER, `/api/music/choirs/${id}/members`, { personId: 'nobody' })).body.code).toBe('PERSON_NOT_ACTIVE');
    expect((await get(MUSIC_LEADER, `/api/music/choirs/${id}`)).body.members).toHaveLength(1);
    expect((await get('p-member', `/api/music/choirs/${id}`)).status).toBe(404);
    expect((await del(MUSIC_LEADER, `/api/music/choirs/${id}/members/p-member`)).status).toBe(200);
    expect((await get(MUSIC_LEADER, `/api/music/choirs/${id}`)).body.members).toHaveLength(0);
    expect(fake.__db.musicChoirMember).toHaveLength(1);
  });
  it("a choir's own leader manages its register and sees only their choirs", async () => {
    const id = await choir('Elim');
    const worship = await choir('Praise', 'WORSHIP');
    const list = (await get('p-choir-leader', '/api/music/choirs')).body;
    expect(list.choirs.map((c: any) => c.name)).toEqual(['Elim']);
    expect(list.canManage).toBe(false);
    expect((await post('p-choir-leader', `/api/music/choirs/${id}/members`, { personId: 'p-member' })).status).toBe(201);
    expect((await get('p-choir-leader', `/api/music/choirs/${worship}`)).status).toBe(404);
  });
});

describe('month plan', () => {
  const start = async () => (await post(MUSIC_LEADER, '/api/music/plan', { month: '2026-10' })).body.id as string;
  it('builds a month with the old rules and publishes it', async () => {
    const elim = await choir();
    const kids = await choir('Kids', 'CHILDREN');
    const praise = await choir('Praise', 'WORSHIP');
    const plan = await start();
    expect((await post(MUSIC_LEADER, '/api/music/plan', { month: '2026-10' })).body.code).toBe('ALREADY_EXISTS');
    const ss1 = (await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-11', kind: 'SS1' })).body.id;
    const ss2 = (await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-11', kind: 'SS2' })).body.id;
    const tue = (await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-13', kind: 'TUESDAY' })).body.id;
    expect((await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-11', kind: 'SS1' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-11-01', kind: 'SS1' })).body.code).toBe('OUTSIDE_MONTH');
    expect((await post(MUSIC_LEADER, `/api/music/services/${ss1}/assignments`, { choirId: kids })).status).toBe(201);
    expect((await post(MUSIC_LEADER, `/api/music/services/${ss2}/assignments`, { choirId: kids })).body.code).toBe('CHOIR_NOT_ALLOWED');
    expect((await post(MUSIC_LEADER, `/api/music/services/${ss1}/assignments`, { choirId: kids })).body.code).toBe('ALREADY_EXISTS');
    expect((await post(MUSIC_LEADER, `/api/music/services/${ss2}/assignments`, { choirId: praise })).body.code).toBe('CHOIR_NOT_ALLOWED');
    expect((await post(MUSIC_LEADER, `/api/music/services/${tue}/assignments`, { choirId: praise })).status).toBe(201);
    expect((await post(MUSIC_LEADER, `/api/music/services/${ss2}/assignments`, { choirId: elim })).status).toBe(201);
    const view = (await get(MUSIC_LEADER, '/api/music/plan?month=2026-10')).body;
    expect(view.plan.services.map((s: any) => s.kind)).toEqual(['SS1', 'SS2', 'TUESDAY']);
    expect(view.plan.services[0].choirs[0].name).toBe('Kids');
    expect((await post(MUSIC_LEADER, `/api/music/plan/${plan}/publish`)).status).toBe(200);
  });
  it('members read only published plans; drafts stay with planners', async () => {
    const plan = await start();
    await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-11', kind: 'SS2' });
    const asMember = await get('p-member', '/api/music/plan?month=2026-10');
    if (asMember.status === 200) {
      expect(asMember.body.plan).toBeNull();
      expect(asMember.body.canWrite).toBe(false);
      await post(MUSIC_LEADER, `/api/music/plan/${plan}/publish`);
      expect((await get('p-member', '/api/music/plan?month=2026-10')).body.plan.services).toHaveLength(1);
    } else {
      expect(asMember.status).toBe(404);
    }
    expect((await post('p-member', `/api/music/plan/${plan}/publish`)).status).toBeGreaterThanOrEqual(403);
  });
  it('an empty plan cannot be published; removing keeps history', async () => {
    const plan = await start();
    expect((await post(MUSIC_LEADER, `/api/music/plan/${plan}/publish`)).body.code).toBe('EMPTY_PLAN');
    const elim = await choir();
    const s = (await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-16', kind: 'FRIDAY' })).body.id;
    await post(MUSIC_LEADER, `/api/music/services/${s}/assignments`, { choirId: elim });
    expect((await del(MUSIC_LEADER, `/api/music/services/${s}/assignments/${elim}`)).status).toBe(200);
    expect((await del(MUSIC_LEADER, `/api/music/services/${s}`)).status).toBe(200);
    expect((await get(MUSIC_LEADER, '/api/music/plan?month=2026-10')).body.plan.services).toHaveLength(0);
    expect(fake.__db.musicService).toHaveLength(1);
  });
});

describe('oversight and menu', () => {
  it('flags choirs without members or without a service this month, and empty services', async () => {
    const elim = await choir('Elim');
    await choir('Quiet');
    await post(MUSIC_LEADER, `/api/music/choirs/${elim}/members`, { personId: 'p-member' });
    const plan = (await post(MUSIC_LEADER, '/api/music/plan', { month: '2026-10' })).body.id;
    const a = (await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-11', kind: 'SS2' })).body.id;
    await post(MUSIC_LEADER, `/api/music/plan/${plan}/services`, { serviceOn: '2026-10-18', kind: 'SS2' });
    await post(MUSIC_LEADER, `/api/music/services/${a}/assignments`, { choirId: elim });
    const o = (await get(MUSIC_LEADER, '/api/music/oversight?month=2026-10')).body;
    const byName = Object.fromEntries(o.choirs.map((c: any) => [c.name, c]));
    expect(byName.Elim).toMatchObject({ members: 1, services: 1, noMembers: false, notScheduled: false });
    expect(byName.Quiet).toMatchObject({ members: 0, services: 0, noMembers: true, notScheduled: true });
    expect(o.emptyServices).toHaveLength(1);
    expect((await get('p-member', '/api/music/oversight?month=2026-10')).status).toBe(404);
  });
  it('own blocks appear for the Music leader', async () => {
    const caps = await get(MUSIC_LEADER, '/api/me/capabilities');
    const keys = caps.body.systems.find((s: any) => s.id === 'sys-music').own.map((o: any) => o.key);
    expect(keys).toEqual(expect.arrayContaining(['monthplan', 'choirs', 'oversight']));
    const choirKeys = (await get('p-choir-leader', '/api/me/capabilities')).body.systems.find((s: any) => s.id === 'sys-choir').own.map((o: any) => o.key);
    expect(choirKeys).toContain('choirs');
  });
});
