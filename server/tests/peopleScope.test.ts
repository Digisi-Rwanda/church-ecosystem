import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

/** People block by system: each system lists only its own members and leaders; Central lists the whole church. */
const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const names = (r: any) => (r.body.people ?? []).map((p: any) => p.id).sort();

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'setting', 'notification', 'notificationRead', 'preference', 'auditEvent']) db[k] ??= [];
  for (const s of db.churchSystem) { s.code = s.id; s.name = s.id; s.shortName = s.id; s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY'; s.basePath = `/${s.id}`; }
  db.orgUnit.push(
    { id: 'ou-church', name: 'Church', code: 'K', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-music', name: 'Music', code: 'K-M', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-music' },
    { id: 'ou-choir', name: 'Choirs', code: 'K-C', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-music', systemId: 'sys-choir' },
    { id: 'ou-youth', name: 'Youth', code: 'K-Y', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
  );
  const add = (id: string) => db.person.push({ id, fullName: id, status: 'ACTIVE' });
  for (const id of ['p-music-pres', 'p-music-mem', 'p-choir-mem2']) add(id);
  const mem = (id: string, sys: string, unit: string) => db.membership.push({ id: `m-${id}`, personId: id, systemId: sys, orgUnitId: unit, type: 'MINISTRY_MEMBER', label: 'Member', status: 'ACTIVE', startDate: new Date('2021-01-01') });
  db.membership.push({ id: 'mc1', personId: 'p-music-pres', systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'Church member', status: 'ACTIVE', startDate: new Date('2020-01-01') });
  mem('p-music-mem', 'sys-music', 'ou-music');
  mem('p-choir-mem2', 'sys-choir', 'ou-choir');
  db.membership.find((m: any) => m.id === 'mem-ym').orgUnitId = 'ou-youth';
  db.position.push({ id: 'pos-mp', personId: 'p-music-pres', systemId: 'sys-music', orgUnitId: 'ou-music', title: 'Music President', office: 'PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') });
  db.position.find((p: any) => p.id === 'pos-youth').orgUnitId = 'ou-youth';
  db.position.find((p: any) => p.id === 'pos-choir').orgUnitId = 'ou-choir';
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('the directory of a system', () => {
  it('Music lists its own members and leaders, not the choirs, not Youth', async () => {
    const r = await get('p-music-pres', '/api/people?systemId=sys-music');
    expect(r.status).toBe(200);
    expect(names(r)).toEqual(['p-music-mem', 'p-music-pres']);
  });
  it('Youth lists only Youth', async () => {
    const r = await get('p-youth-leader', '/api/people?systemId=sys-youth');
    expect(names(r)).toEqual(['p-youth-leader', 'p-youth-member']);
  });
  it('nobody opens another system\'s people', async () => {
    expect((await get('p-youth-leader', '/api/people?systemId=sys-music')).status).toBe(403);
    expect((await get('p-music-pres', '/api/people?systemId=sys-main')).status).toBe(403);
    expect((await get('p-choir-member', '/api/people?systemId=sys-choir')).status).toBe(403);
  });
  it('Central lists the whole church', async () => {
    const r = await get('p-pastor', '/api/people?systemId=sys-main');
    expect(r.status).toBe(200);
    expect(names(r).length).toBe(fake.__db.person.length);
  });
  it('a unit below a system can be named from it (Music opens a choir member by id)', async () => {
    const r = await get('p-music-pres', '/api/people?systemId=sys-music&ids=p-choir-mem2,p-youth-member');
    expect(names(r)).toEqual(['p-choir-mem2']);
  });
  it('with no system named, a president still sees only their own system\'s people', async () => {
    const r = await get('p-music-pres', '/api/people');
    expect(names(r)).toEqual(['p-music-mem', 'p-music-pres']);
  });
});

describe('the organisation of a system', () => {
  const unitIds = (r: any) => r.body.orgUnits.map((u: any) => u.id).sort();
  it('Music sees its own unit and the choirs under it; Youth only itself', async () => {
    expect(unitIds(await get('p-music-pres', '/api/participation/records?systemId=sys-music'))).toEqual(['ou-choir', 'ou-music']);
    expect(unitIds(await get('p-youth-leader', '/api/participation/records?systemId=sys-youth'))).toEqual(['ou-youth']);
  });
  it('Central sees the whole organisation; a president cannot ask for Central', async () => {
    expect(unitIds(await get('p-pastor', '/api/participation/records?systemId=sys-main')).length).toBe(4);
    expect((await get('p-music-pres', '/api/participation/records?systemId=sys-main')).status).toBe(403);
  });
  it('memberships and offices follow the same limit', async () => {
    const r = await get('p-music-pres', '/api/participation/records?systemId=sys-music');
    const who = new Set([...r.body.memberships, ...r.body.positions].map((x: any) => x.personId));
    expect(who.has('p-youth-member')).toBe(false);
    expect(who.has('p-youth-leader')).toBe(false);
    expect(who.has('p-music-mem')).toBe(true);
  });
});

describe('the leaders of a system', () => {
  const holders = (r: any) => r.body.appointments.map((a: any) => a.personId).sort();
  it('Music lists only its own leaders', async () => {
    const r = await get('p-music-pres', '/api/access/appointments?systemId=sys-music');
    expect(r.status).toBe(200);
    expect(holders(r)).toEqual(['p-music-pres']);
  });
  it('Central lists every leader of the church', async () => {
    const r = await get('p-pastor', '/api/access/appointments?systemId=sys-main');
    expect(holders(r)).toEqual(expect.arrayContaining(['p-pastor', 'p-music-pres', 'p-youth-leader', 'p-choir-leader']));
  });
  it('a president cannot list another system\'s leaders', async () => {
    expect((await get('p-youth-leader', '/api/access/appointments?systemId=sys-music')).status).toBe(403);
  });
});
