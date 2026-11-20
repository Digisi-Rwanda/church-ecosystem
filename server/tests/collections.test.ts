import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

let app: import('express').Express;
beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  for (const k of ['auditEvent', 'serviceCollection', 'notification', 'notificationRead', 'setting', 'delegation', 'orgUnit']) fake.__db[k] ??= [];
  fake.__db.person.push({ id: 'p-ctreas', fullName: 'Church Treasurer', status: 'ACTIVE' });
  fake.__db.position.push({ id: 'pos-ctreas', personId: 'p-ctreas', systemId: 'sys-main', title: 'Church Treasurer', office: 'CHURCH_TREASURER', status: 'ACTIVE', startDate: new Date('2024-01-01'), grantsAllSystems: false });
  fake.__db.account ??= [];
  for (const id of ['p-pastor', 'p-ctreas', 'p-member', 'p-outsider', 'p-youth-leader', 'p-choir-leader']) fake.__db.account.push({ id: `acc-${id}`, personId: id, username: id, person: { id, fullName: id } });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const good = { kind: 'SERVICE', title: 'Sunday service', heldOn: '2026-09-27', startsAt: '09:00', tithe: 120000, offering: 45000, other: 5000, note: '' };
const post = (who: string, b: object = good) => request(app).post('/api/collections').set(bearer(who)).send(b);
const list = (who: string, q = '?year=2026') => request(app).get(`/api/collections${q}`).set(bearer(who));

describe('collections', () => {
  it('the Church Treasurer records a service with tithe, offering and other givings', async () => {
    const r = await post('p-ctreas');
    expect(r.status).toBe(201);
    const got = (await list('p-ctreas')).body;
    expect(got.canWrite).toBe(true);
    expect(got.items[0]).toMatchObject({ title: 'Sunday service', heldOn: '2026-09-27', startsAt: '09:00', tithe: 120000, offering: 45000, other: 5000, total: 170000 });
    expect(got.totals).toEqual({ tithe: 120000, offering: 45000, other: 5000, all: 170000, count: 1 });
    expect(fake.__db.auditEvent.some((a: any) => a.action === 'COLLECTION_RECORDED')).toBe(true);
  });
  it('an event is recorded the same way, with its own time', async () => {
    expect((await post('p-ctreas', { ...good, kind: 'EVENT', title: 'Youth convention', startsAt: '14:30', tithe: 0, offering: 80000, other: 0 })).status).toBe(201);
    expect((await list('p-ctreas')).body.items[0]).toMatchObject({ kind: 'EVENT', startsAt: '14:30', total: 80000 });
  });
  it('the Church Leader reads and cannot record, change or cancel', async () => {
    const id = (await post('p-ctreas')).body.id;
    const got = (await list('p-pastor')).body;
    expect(got.canWrite).toBe(false);
    expect(got.items).toHaveLength(1);
    expect((await post('p-pastor')).status).toBe(403);
    expect((await request(app).patch(`/api/collections/${id}`).set(bearer('p-pastor')).send(good)).status).toBe(403);
    expect((await request(app).post(`/api/collections/${id}/void`).set(bearer('p-pastor')).send({ reason: 'x' })).status).toBe(403);
  });
  it('nobody else sees collections at all', async () => {
    await post('p-ctreas');
    for (const who of ['p-member', 'p-outsider', 'p-youth-leader', 'p-choir-leader']) expect((await list(who)).status).toBe(404);
  });
  it('refuses a collection with no amount, a negative amount or a bad day', async () => {
    expect((await post('p-ctreas', { ...good, tithe: 0, offering: 0, other: 0 })).status).toBe(400);
    expect((await post('p-ctreas', { ...good, tithe: -5 })).status).toBe(400);
    expect((await post('p-ctreas', { ...good, heldOn: '27/09/2026' })).status).toBe(400);
    expect((await post('p-ctreas', { ...good, startsAt: '25:99' })).status).toBe(400);
    expect((await post('p-ctreas', { ...good, title: '  ' })).status).toBe(400);
  });
  it('a change keeps the old figures in the audit; a cancelled one leaves the totals and cannot be changed', async () => {
    const id = (await post('p-ctreas')).body.id;
    expect((await request(app).patch(`/api/collections/${id}`).set(bearer('p-ctreas')).send({ ...good, tithe: 130000 })).status).toBe(200);
    const changed = fake.__db.auditEvent.find((a: any) => a.action === 'COLLECTION_CHANGED');
    expect(JSON.parse(changed.metaJson).before.tithe).toBe(120000);
    expect((await request(app).post(`/api/collections/${id}/void`).set(bearer('p-ctreas')).send({})).status).toBe(400);
    expect((await request(app).post(`/api/collections/${id}/void`).set(bearer('p-ctreas')).send({ reason: 'Entered twice' })).status).toBe(200);
    const got = (await list('p-ctreas')).body;
    expect(got.totals.all).toBe(0);
    expect(got.items[0]).toMatchObject({ status: 'VOIDED', voidReason: 'Entered twice' });
    expect((await request(app).patch(`/api/collections/${id}`).set(bearer('p-ctreas')).send(good)).status).toBe(409);
  });
  it('adds up by month and by year, newest first', async () => {
    await post('p-ctreas', { ...good, heldOn: '2026-08-30', tithe: 1000, offering: 0, other: 0 });
    await post('p-ctreas', { ...good, heldOn: '2026-09-06', tithe: 2000, offering: 0, other: 0 });
    await post('p-ctreas', { ...good, heldOn: '2026-09-13', tithe: 3000, offering: 0, other: 0 });
    await post('p-ctreas', { ...good, heldOn: '2025-12-28', tithe: 9000, offering: 0, other: 0 });
    const got = (await list('p-ctreas')).body;
    expect(got.byMonth.map((m: any) => [m.month, m.total])).toEqual([['2026-08', 1000], ['2026-09', 5000]]);
    expect(got.items.map((i: any) => i.heldOn)).toEqual(['2026-09-13', '2026-09-06', '2026-08-30']);
    expect(got.years).toContain(2025);
    expect((await list('p-ctreas', '?year=2025')).body.totals.all).toBe(9000);
  });
  it('a lent letter never opens collections: only the office itself does', async () => {
    fake.__db.delegation.push({ id: 'd1', positionId: 'pos-ctreas', fromPersonId: 'p-ctreas', toPersonId: 'p-member', lettersJson: JSON.stringify({ MONEY: ['R', 'W'] }), startDate: new Date('2024-01-01'), endDate: new Date('2030-01-01'), status: 'ACTIVE' });
    expect((await post('p-member')).status).toBe(403);
    expect((await list('p-member')).status).toBe(404);
  });
});
