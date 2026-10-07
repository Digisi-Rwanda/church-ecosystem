import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { watchTimesProblem } from '../src/caring/rules';

describe('caring rules', () => {
  it('watch times', () => {
    expect(watchTimesProblem('05:00', '06:00')).toBeNull();
    expect(watchTimesProblem('06:00', '05:00')).toBe('BAD_TIMES');
    expect(watchTimesProblem('5:00', '06:00')).toBe('BAD_TIMES');
    expect(watchTimesProblem('22:00', '24:00')).toBe('BAD_TIMES');
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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'couplePair', 'visitLog', 'prayerWatch', 'prayerWatchMember']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.position.push({ id: 'pos-int', personId: 'p-outsider', systemId: 'sys-intercessors', title: 'Intercessors Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('couples', () => {
  it('the Church Leader adds a pair; the same person cannot be in two', async () => {
    const r = await post('p-pastor', '/api/caring/couples', { aId: 'p-treasurer', bId: 'p-member', marriedOn: '2015-05-01' });
    expect(r.status).toBe(201);
    const list = await get('p-pastor', '/api/caring/couples');
    expect(list.body.pairs).toHaveLength(1);
    expect(list.body.pairs[0].aName).toBeTruthy();
    expect((await post('p-pastor', '/api/caring/couples', { aId: 'p-treasurer', bId: 'p-youth-member' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post('p-pastor', '/api/caring/couples', { aId: 'p-member', bId: 'p-member' })).body.code).toBe('SAME_PERSON');
    expect((await post('p-pastor', '/api/caring/couples', { aId: 'p-youth-member', bId: 'p-choir-member', marriedOn: '2999-01-01' })).body.code).toBe('BAD_DATE');
  });
  it('people without a People letter see and change nothing', async () => {
    expect((await get('p-member', '/api/caring/couples')).status).toBe(404);
    expect((await post('p-member', '/api/caring/couples', { aId: 'p-treasurer', bId: 'p-youth-member' })).status).toBe(403);
  });
  it('removing keeps the record but leaves the list, and is audited', async () => {
    const id = (await post('p-pastor', '/api/caring/couples', { aId: 'p-treasurer', bId: 'p-member' })).body.id;
    expect((await post('p-pastor', `/api/caring/couples/${id}/end`)).status).toBe(200);
    expect((await post('p-pastor', `/api/caring/couples/${id}/end`)).status).toBe(409);
    expect((await get('p-pastor', '/api/caring/couples')).body.pairs).toHaveLength(0);
    expect(fake.__db.couplePair).toHaveLength(1);
    expect(fake.__db.auditEvent.map((a: any) => a.action)).toEqual(['COUPLE_ADDED', 'COUPLE_REMOVED']);
  });
});

describe('elderly visits', () => {
  const visit = (o: object = {}) => ({ elderId: 'p-member', visitedOn: '2026-10-05', visitorIds: ['p-treasurer'], note: 'Brought food', ...o });
  it('records and lists visits for those who may change people records', async () => {
    expect((await post('p-pastor', '/api/caring/visits', visit())).status).toBe(201);
    const list = await get('p-pastor', '/api/caring/visits');
    expect(list.body.visits[0]).toMatchObject({ elderId: 'p-member', visitedOn: '2026-10-05', note: 'Brought food' });
    expect(list.body.visits[0].visitorNames).toHaveLength(1);
    expect((await get('p-pastor', '/api/caring/visits?elderId=p-outsider')).body.visits).toHaveLength(0);
  });
  it('visits are private', async () => {
    expect((await get('p-member', '/api/caring/visits')).status).toBe(404);
    expect((await post('p-member', '/api/caring/visits', visit())).status).toBe(403);
  });
  it('rejects future days and bad people', async () => {
    expect((await post('p-pastor', '/api/caring/visits', visit({ visitedOn: '2026-10-20' }))).body.code).toBe('FUTURE_DATE');
    expect((await post('p-pastor', '/api/caring/visits', visit({ visitedOn: 'x' }))).body.code).toBe('BAD_DATE');
    expect((await post('p-pastor', '/api/caring/visits', visit({ elderId: 'nobody' }))).body.code).toBe('PERSON_NOT_ACTIVE');
  });
});

describe('prayer watches', () => {
  const watch = (o: object = {}) => ({ name: 'Dawn watch', weekday: 5, startTime: '05:00', endTime: '06:00', ...o });
  it('creates a watch and manages its members', async () => {
    const id = (await post('p-outsider', '/api/caring/watches', watch())).body.id;
    expect(id).toBeTruthy();
    expect((await post('p-outsider', `/api/caring/watches/${id}/members`, { personId: 'p-member' })).status).toBe(201);
    expect((await post('p-outsider', `/api/caring/watches/${id}/members`, { personId: 'p-member' })).body.code).toBe('ALREADY_EXISTS');
    let list = await get('p-outsider', '/api/caring/watches');
    expect(list.body.watches[0].members).toHaveLength(1);
    expect((await del('p-outsider', `/api/caring/watches/${id}/members/p-member`)).status).toBe(200);
    expect((await del('p-outsider', `/api/caring/watches/${id}/members/p-member`)).status).toBe(404);
    expect((await post('p-outsider', `/api/caring/watches/${id}/close`)).status).toBe(200);
    expect((await post('p-outsider', `/api/caring/watches/${id}/members`, { personId: 'p-member' })).body.code).toBe('WRONG_STATE');
    list = await get('p-outsider', '/api/caring/watches');
    expect(list.body.watches).toHaveLength(0);
  });
  it('checks times and weekday', async () => {
    expect((await post('p-outsider', '/api/caring/watches', watch({ startTime: '07:00' }))).body.code).toBe('BAD_TIMES');
    expect((await post('p-outsider', '/api/caring/watches', watch({ weekday: 9 }))).body.code).toBe('BAD_INPUT');
  });
  it('the Church Leader may read the roster but not change it', async () => {
    expect((await get('p-pastor', '/api/caring/watches')).body.canWrite).toBe(false);
    expect((await post('p-pastor', '/api/caring/watches', watch())).status).toBe(403);
  });
  it('outsiders cannot read or change', async () => {
    expect((await get('p-choir-leader', '/api/caring/watches')).status).toBe(404);
    expect((await post('p-choir-leader', '/api/caring/watches', watch())).status).toBe(403);
  });
});

describe('own blocks', () => {
  it('the Church Leader sees Couples, Visits and Watches in their systems', async () => {
    const caps = await get('p-pastor', '/api/me/capabilities');
    const keys = (id: string) => caps.body.systems.find((s: any) => s.id === id)?.own.map((o: any) => o.key) ?? [];
    expect(keys('sys-couples')).toContain('couples');
    expect(keys('sys-elderly')).toContain('visits');
    expect(keys('sys-intercessors')).toContain('watches');
  });
});
