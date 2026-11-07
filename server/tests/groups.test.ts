import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { ageOn, agesProblem, attendanceOf, outsideAge } from '../src/groups/rules';

describe('group rules', () => {
  it('ages in whole years', () => {
    expect(ageOn('2010-06-15', '2026-06-14')).toBe(15);
    expect(ageOn('2010-06-15', '2026-06-15')).toBe(16);
    expect(ageOn(null, '2026-01-01')).toBeNull();
    expect(ageOn('junk', '2026-01-01')).toBeNull();
  });
  it('age ranges are a guide: flagged only when known and outside', () => {
    expect(outsideAge(15, 12, 17)).toBe(false);
    expect(outsideAge(18, 12, 17)).toBe(true);
    expect(outsideAge(null, 12, 17)).toBe(false);
    expect(agesProblem(12, 8)).toBe('BAD_AGES');
    expect(agesProblem(null, null)).toBeNull();
    expect(agesProblem(-1, 4)).toBe('BAD_AGES');
  });
  it('attendance per member over the sessions given', () => {
    const s = [{ presentJson: '["a","b"]' }, { presentJson: '["a"]' }, { presentJson: 'bad' }];
    const m = attendanceOf(['a', 'b', 'c'], s);
    expect(m.get('a')).toEqual({ came: 2, of: 3, rate: 67 });
    expect(m.get('b')).toEqual({ came: 1, of: 3, rate: 33 });
    expect(m.get('c')?.came).toBe(0);
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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'unitGroup', 'groupMember', 'groupSession']) db[k] ??= [];
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
  db.person.find((p: any) => p.id === 'p-youth-member').dateOfBirth = '2005-03-01';
  db.person.find((p: any) => p.id === 'p-member').dateOfBirth = '2012-03-01';
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const body = (o: object = {}) => ({ unitId: 'ou-youth', name: 'Teens', ageFrom: 13, ageTo: 17, meetsOn: 'Saturday 4pm', ...o });
const group = async (o: object = {}, as = 'p-youth-leader') => (await post(as, '/api/groups', body(o))).body.id as string;

describe('groups', () => {
  it('only the youth president creates youth groups; the kind follows the system', async () => {
    expect((await post('p-youth-leader', '/api/groups', body())).status).toBe(201);
    expect((await post('p-choir-leader', '/api/groups', body())).status).toBe(403);
    expect((await post('p-youth-member', '/api/groups', body())).status).toBe(403);
    expect((await post('p-youth-leader', '/api/groups', body({ unitId: 'ou-choir' }))).status).toBe(404);
    const list = await get('p-youth-leader', '/api/groups?systemId=sys-youth');
    expect(list.body.kind).toBe('AGE_GROUP');
    expect(list.body.groups[0].name).toBe('Teens');
  });
  it('a plain member sees nothing of the groups', async () => {
    await group();
    expect((await get('p-youth-member', '/api/groups?systemId=sys-youth')).status).toBe(404);
    expect((await get('p-choir-leader', '/api/groups?systemId=sys-youth')).status).toBe(404);
  });
  it('bad ages and unknown leaders are refused', async () => {
    expect((await post('p-youth-leader', '/api/groups', body({ ageFrom: 20, ageTo: 10 }))).body.code).toBe('BAD_AGES');
    expect((await post('p-youth-leader', '/api/groups', body({ leaderId: 'nobody' }))).body.code).toBe('PERSON_NOT_ACTIVE');
  });
  it('members join once, leave with history, and an age outside the range is only flagged', async () => {
    const g = await group();
    expect((await post('p-youth-leader', `/api/groups/${g}/members`, { personId: 'p-youth-member' })).status).toBe(201);
    expect((await post('p-youth-leader', `/api/groups/${g}/members`, { personId: 'p-youth-member' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post('p-youth-leader', `/api/groups/${g}/members`, { personId: 'p-member' })).status).toBe(201);
    const d = (await get('p-youth-leader', `/api/groups/${g}`)).body;
    expect(d.members.map((m: any) => [m.personId, m.outsideAge])).toEqual(expect.arrayContaining([['p-youth-member', true], ['p-member', false]]));
    expect((await del('p-youth-leader', `/api/groups/${g}/members/p-member`)).status).toBe(200);
    expect((await get('p-youth-leader', `/api/groups/${g}`)).body.members.length).toBe(1);
    expect(fake.__db.groupMember.find((m: any) => m.personId === 'p-member').status).toBe('LEFT');
  });
  it('sessions: only members present, one per day, not in the future; attendance adds up', async () => {
    const g = await group();
    await post('p-youth-leader', `/api/groups/${g}/members`, { personId: 'p-youth-member' });
    await post('p-youth-leader', `/api/groups/${g}/members`, { personId: 'p-member' });
    expect((await post('p-youth-leader', `/api/groups/${g}/sessions`, { heldOn: '2026-10-03', presentIds: ['p-outsider'] })).body.code).toBe('NOT_A_MEMBER');
    expect((await post('p-youth-leader', `/api/groups/${g}/sessions`, { heldOn: '2999-01-01', presentIds: [] })).body.code).toBe('FUTURE_DATE');
    expect((await post('p-youth-leader', `/api/groups/${g}/sessions`, { heldOn: '2026-10-03', presentIds: ['p-youth-member', 'p-member'] })).status).toBe(201);
    expect((await post('p-youth-leader', `/api/groups/${g}/sessions`, { heldOn: '2026-10-03', presentIds: [] })).body.code).toBe('ALREADY_EXISTS');
    expect((await post('p-youth-leader', `/api/groups/${g}/sessions`, { heldOn: '2026-10-05', presentIds: ['p-youth-member'] })).status).toBe(201);
    const d = (await get('p-youth-leader', `/api/groups/${g}`)).body;
    expect(d.sessions.map((s: any) => s.present)).toEqual([1, 2]);
    expect(d.members.find((m: any) => m.personId === 'p-youth-member')).toMatchObject({ came: 2, of: 2, rate: 100 });
    expect(d.members.find((m: any) => m.personId === 'p-member')).toMatchObject({ came: 1, rate: 50 });
  });
  it('a closed group takes no changes; editing keeps history in the audit log', async () => {
    const g = await group();
    expect((await patch('p-youth-leader', `/api/groups/${g}`, { name: 'Teens 13-17', ageFrom: 13, ageTo: 17 })).status).toBe(200);
    expect((await post('p-youth-leader', `/api/groups/${g}/close`)).status).toBe(200);
    expect((await post('p-youth-leader', `/api/groups/${g}/members`, { personId: 'p-youth-member' })).body.code).toBe('WRONG_STATE');
    expect((await post('p-youth-leader', `/api/groups/${g}/close`)).body.code).toBe('WRONG_STATE');
    expect(fake.__db.auditEvent.filter((e: any) => String(e.action).startsWith('GROUP_')).length).toBe(3);
  });
  it('capabilities offer the groups block only where the system has one', async () => {
    const youth = (await get('p-youth-leader', '/api/me/capabilities')).body.systems.find((s: any) => s.id === 'sys-youth');
    expect(youth.own).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'groups', variant: 'AGE_GROUP' })]));
    const choir = (await get('p-choir-leader', '/api/me/capabilities')).body.systems.find((s: any) => s.id === 'sys-choir');
    expect(choir.own.some((o: any) => o.key === 'groups')).toBe(false);
  });
});
