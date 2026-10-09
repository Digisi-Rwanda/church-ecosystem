import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { isMonth } from '../src/music/rules';

describe('music rules', () => {
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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'musicChoir', 'musicChoirMember', 'musicPlan', 'musicService', 'musicAssignment', 'musicMonth', 'musicDraft', 'musicLog']) db[k] ??= [];
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

describe('Music and Choir are different systems', () => {
  it('Music holds the register of every choir; a choir system shows only its own and cannot add or retire', async () => {
    await choir('Elim', 'PRIMARY');
    await choir('Praise team', 'WORSHIP');
    const all = await get('p-pastor', '/api/music/choirs');
    expect(all.body.choirs.map((c: any) => c.name).sort()).toEqual(['Elim', 'Praise team']);
    expect(all.body.canManage).toBe(true);
    const inMusic = await get('p-pastor', '/api/music/choirs?systemId=sys-music');
    expect(inMusic.body.choirs).toHaveLength(2);
    expect(inMusic.body.canManage).toBe(true);
    const inChoir = await get('p-pastor', '/api/music/choirs?systemId=sys-choir');
    expect(inChoir.body.choirs.map((c: any) => c.name)).toEqual(['Elim']);
    expect(inChoir.body.canManage).toBe(false);
    const inWorship = await get('p-pastor', '/api/music/choirs?systemId=sys-worship');
    expect(inWorship.body.choirs.map((c: any) => c.name)).toEqual(['Praise team']);
    const picks = await get('p-pastor', '/api/choir/choirs?systemId=sys-choir');
    expect(picks.body.choirs.map((c: any) => c.name)).toEqual(['Elim']);
  });
});

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

describe('oversight and menu', () => {
  it('flags choirs without members or without a service this month, and empty services', async () => {
    const elim = await choir('Elim');
    await choir('Quiet');
    await post(MUSIC_LEADER, `/api/music/choirs/${elim}/members`, { personId: 'p-member' });
    const services = [{ id: 'msvc-2026-10-11-SS2', periodKey: '2026-10', date: '2026-10-11', kind: 'SS2', label: 'Sunday Service 2' }, { id: 'msvc-2026-10-18-SS2', periodKey: '2026-10', date: '2026-10-18', kind: 'SS2', label: 'Sunday Service 2' }];
    fake.__db.musicMonth.push({ id: 'mm1', periodKey: '2026-10', state: 'PUBLISHED', version: 1, servicesJson: JSON.stringify(services), assignmentsJson: JSON.stringify([{ id: 'a1', serviceId: services[0].id, unitId: elim, source: 'ENGINE' }]), warningsJson: '[]' });
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
