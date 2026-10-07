import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { canDelete, canSee, moveProblem, visibilityOf, type WorkRow } from '../src/work/rules';
import type { AccessData } from '../src/capabilities/engine';

const data: AccessData = {
  positions: [{ id: 'a', personId: 'pres', office: 'PRESIDENT', systemId: 'sys-choir', orgUnitId: 'ou-choir', status: 'ACTIVE', startDate: '2020-01-01', endDate: null } as never],
  memberships: [{ id: 'm', personId: 'mem', systemId: 'sys-choir', orgUnitId: 'ou-choir', type: 'MINISTRY_MEMBER', status: 'ACTIVE', startDate: '2020-01-01', endDate: null } as never],
  delegations: [],
};
const row = (o: Partial<WorkRow> = {}): WorkRow => ({ id: 'w', ownerPersonId: 'own', createdByPersonId: 'pres', systemId: 'sys-choir', orgUnitId: 'ou-choir', visibility: 'UNIT', status: 'TODO', ...o });

describe('work rules', () => {
  it('reads older visibility words as the four levels', () => {
    expect(visibilityOf('MINISTRY')).toBe('SYSTEM');
    expect(visibilityOf('GENERAL')).toBe('CHURCH');
    expect(visibilityOf('SELECTED')).toBe('PERSONS');
    expect(visibilityOf('UNIT')).toBe('UNIT');
    expect(visibilityOf(undefined)).toBe('SYSTEM');
  });
  it('named people only means only the named', () => {
    const w = row({ visibility: 'PERSONS', helperPersonIds: JSON.stringify(['helper']) });
    expect(canSee(w, 'own', data)).toBe(true);
    expect(canSee(w, 'helper', data)).toBe(true);
    expect(canSee(w, 'pres', data)).toBe(true); // the creator
    expect(canSee(w, 'mem', data)).toBe(false);
  });
  it('unit work is for the unit; a deleted item is for nobody', () => {
    expect(canSee(row(), 'mem', data)).toBe(true);
    expect(canSee(row(), 'stranger', data)).toBe(false);
    expect(canSee(row({ visibility: 'CHURCH' }), 'stranger', data)).toBe(true);
    expect(canSee(row({ deletedAt: new Date() }), 'own', data)).toBe(false);
  });
  it('finished work cannot be deleted, and closing needs a note', () => {
    expect(canDelete(row(), 'pres', data)).toBe(true);
    expect(canDelete(row({ status: 'DONE' }), 'pres', data)).toBe(false);
    expect(canDelete(row(), 'own', data)).toBe(false);
    expect(moveProblem('TODO', 'DONE', '')).toBe('NOTE_REQUIRED');
    expect(moveProblem('TODO', 'DONE', 'Booklets printed')).toBeNull();
    expect(moveProblem('DONE', 'TODO', null)).toBe('WRONG_STATE');
    expect(moveProblem('DONE', 'IN_PROGRESS', null)).toBeNull();
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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference']) db[k] ??= [];
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
    { id: 'ou-loose', name: 'Loose', code: 'KAC-LOO', kind: 'TEAM', type: 'TEAM', parentId: 'ou-church', systemId: null },
  );
  db.membership.find((m: any) => m.id === 'mem-cm').orgUnitId = 'ou-choir';
  db.person.push({ id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' }, { id: 'p-admin', fullName: 'Administrator', status: 'ACTIVE' }, { id: 'p-gone', fullName: 'Gone', status: 'ARCHIVED' });
  db.position.push(
    { id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-admin', personId: 'p-admin', systemId: 'sys-media', title: 'Administrator', office: 'ADMINISTRATOR', status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const body = (o: object = {}) => ({ unitId: 'ou-choir', title: 'Print the booklets', ownerId: 'p-choir-member', helperIds: [], visibility: 'UNIT', ...o });
const create = async (o: object = {}, as = 'p-choir-leader') => (await post(as, '/api/work', body(o))).body.work?.id as string;

describe('creating and assigning', () => {
  it('needs sign-in, a known unit with a system, W, and active people', async () => {
    expect((await request(app).post('/api/work').send({})).status).toBe(401);
    expect((await post('p-choir-leader', '/api/work', {})).status).toBe(400);
    expect((await post('p-choir-leader', '/api/work', body({ unitId: 'ou-zzz' }))).status).toBe(404);
    expect((await post('p-choir-leader', '/api/work', body({ unitId: 'ou-loose' }))).body.code).toBe('UNIT_HAS_NO_SYSTEM');
    expect((await post('p-choir-member', '/api/work', body())).status).toBe(403);
    expect((await post('p-youth-leader', '/api/work', body())).status).toBe(403);
    expect((await post('p-choir-leader', '/api/work', body({ ownerId: 'p-gone' }))).body.code).toBe('PERSON_NOT_ACTIVE');
  });
  it('creates work, tells the owner and the helpers, audits it', async () => {
    const r = await post('p-vp', '/api/work', body({ helperIds: ['p-youth-member', 'p-choir-member'] }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.work).toMatchObject({ status: 'TODO', ownerName: 'p-choir-member', unitName: 'Choir', canManage: true });
    expect(r.body.work.helpers.map((h: any) => h.id)).toEqual(['p-youth-member']);
    expect(fake.__db.notification.map((n: any) => n.toPersonId).sort()).toEqual(['p-choir-member', 'p-youth-member']);
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'WORK_CREATED')).toBe(true);
  });
  it('reassigning tells only the people who are new', async () => {
    const id = await create();
    fake.__db.notification.length = 0;
    const r = await patch('p-choir-leader', `/api/work/${id}`, body({ ownerId: 'p-choir-member', helperIds: ['p-youth-member'] }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(fake.__db.notification.map((n: any) => n.toPersonId)).toEqual(['p-youth-member']);
    expect((await patch('p-choir-member', `/api/work/${id}`, body())).status).toBe(403);
  });
});

describe('who sees what', () => {
  it('enforces the four levels on every read', async () => {
    const named = await create({ visibility: 'PERSONS', title: 'Named' });
    const unit = await create({ visibility: 'UNIT', title: 'Unit' });
    const system = await create({ visibility: 'SYSTEM', title: 'System' });
    const church = await create({ visibility: 'CHURCH', title: 'Church' });
    const titles = async (as: string) => (await get(as, '/api/work?view=all&status=all')).body.items.map((i: any) => i.title).sort();
    expect(await titles('p-choir-member')).toEqual(['Church', 'Named', 'System', 'Unit']); // the owner of all four
    expect(await titles('p-choir-leader')).toEqual(['Church', 'Named', 'System', 'Unit']); // the creator
    expect(await titles('p-youth-member')).toEqual(['Church']);
    expect(await titles('p-member')).toEqual(['Church']);
    expect((await get('p-youth-member', `/api/work/${named}`)).status).toBe(404);
    expect((await get('p-youth-member', `/api/work/${unit}`)).status).toBe(404);
    expect((await get('p-youth-member', `/api/work/${system}`)).status).toBe(404);
    expect((await get('p-youth-member', `/api/work/${church}`)).status).toBe(200);
    expect((await get('p-choir-leader', `/api/work/${named}`)).status).toBe(200);
  });
  it('"mine" lists work I own or help with, open first by due date', async () => {
    await create({ title: 'Later', dueDate: '2026-12-01T00:00:00Z' });
    await create({ title: 'Sooner', dueDate: '2026-11-01T00:00:00Z' });
    await create({ title: 'Not mine', ownerId: 'p-youth-member', visibility: 'CHURCH' });
    const mine = (await get('p-choir-member', '/api/work')).body.items;
    expect(mine.map((i: any) => i.title)).toEqual(['Sooner', 'Later']);
  });
});

describe('moving work along', () => {
  it('the owner starts it; finishing needs an outcome note', async () => {
    const id = await create();
    expect((await post('p-choir-member', `/api/work/${id}/status`, { status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await post('p-choir-member', `/api/work/${id}/status`, { status: 'DONE' })).body.code).toBe('NOTE_REQUIRED');
    const done = await post('p-choir-member', `/api/work/${id}/status`, { status: 'DONE', note: 'All 200 printed' });
    expect(done.body.work).toMatchObject({ status: 'DONE', outcomeNote: 'All 200 printed', canDelete: false });
    expect((await post('p-youth-member', `/api/work/${id}/status`, { status: 'TODO' })).status).toBe(404);
  });
  it('only a manager reopens finished work, and finished work is locked', async () => {
    const id = await create();
    await post('p-choir-member', `/api/work/${id}/status`, { status: 'DONE', note: 'Done' });
    expect((await post('p-choir-member', `/api/work/${id}/status`, { status: 'IN_PROGRESS' })).status).toBe(403);
    expect((await patch('p-choir-leader', `/api/work/${id}`, body())).body.code).toBe('DONE_LOCKED');
    expect((await post('p-choir-leader', `/api/work/${id}/status`, { status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await post('p-choir-leader', `/api/work/${id}/status`, { status: 'IN_PROGRESS' })).body.code).toBe('WRONG_STATE');
  });
});

describe('deleting is soft: gone for the user, kept for an Administrator', () => {
  it('a manager deletes; it vanishes from every list and every direct read', async () => {
    const id = await create();
    expect((await del('p-choir-member', `/api/work/${id}`)).status).toBe(403);
    expect((await del('p-choir-leader', `/api/work/${id}`)).status).toBe(200);
    expect((await get('p-choir-leader', `/api/work/${id}`)).status).toBe(404);
    expect((await get('p-choir-member', '/api/work?view=all&status=all')).body.items).toHaveLength(0);
    expect((await del('p-choir-leader', `/api/work/${id}`)).status).toBe(404);
    expect(fake.__db.workTask).toHaveLength(1);
    expect(fake.__db.workTask[0]).toMatchObject({ deletedById: 'p-choir-leader' });
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'WORK_DELETED')).toBe(true);
  });
  it('finished work cannot be deleted', async () => {
    const id = await create();
    await post('p-choir-member', `/api/work/${id}/status`, { status: 'DONE', note: 'Done' });
    expect((await del('p-choir-leader', `/api/work/${id}`)).body.code).toBe('DONE_LOCKED');
  });
  it('only an Administrator sees the deleted list and restores', async () => {
    const id = await create();
    await del('p-choir-leader', `/api/work/${id}`);
    expect((await get('p-choir-leader', '/api/work/deleted')).status).toBe(404);
    expect((await post('p-choir-leader', `/api/work/${id}/restore`)).status).toBe(404);
    const list = (await get('p-admin', '/api/work/deleted')).body.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Print the booklets', deletedByName: 'p-choir-leader' });
    expect((await post('p-admin', `/api/work/${id}/restore`)).status).toBe(200);
    expect((await get('p-admin', '/api/work/deleted')).body.items).toHaveLength(0);
    expect((await get('p-choir-member', `/api/work/${id}`)).status).toBe(200);
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'WORK_RESTORED')).toBe(true);
  });
  it('deleted work no longer shows in the older task list either', async () => {
    const id = await create();
    await del('p-choir-leader', `/api/work/${id}`);
    const r = await get('p-choir-leader', '/api/mission/tasks');
    expect(JSON.stringify(r.body)).not.toContain('Print the booklets');
  });
});
