import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { amountProblem, balances, inMonth, isDay } from '../src/money/rules';

describe('money rules', () => {
  it('amounts are whole francs above zero', () => {
    expect(amountProblem(5000)).toBeNull();
    expect(amountProblem(0)).toBe('AMOUNT');
    expect(amountProblem(-1)).toBe('AMOUNT');
    expect(amountProblem(10.5)).toBe('AMOUNT');
    expect(amountProblem('9' as never)).toBe('AMOUNT');
  });
  it('balance counts recorded income minus approved spending; pending is apart', () => {
    const b = balances([
      { kind: 'INCOME', amount: 1000, status: 'RECORDED' },
      { kind: 'INCOME', amount: 500, status: 'VOIDED' },
      { kind: 'SPENDING', amount: 300, status: 'APPROVED' },
      { kind: 'SPENDING', amount: 200, status: 'PENDING_APPROVAL' },
      { kind: 'SPENDING', amount: 100, status: 'REJECTED' },
    ]);
    expect(b).toEqual({ income: 1000, spent: 300, pending: 200, balance: 700 });
  });
  it('days and months', () => {
    expect(isDay('2026-10-07')).toBe(true);
    expect(isDay('2026-13-40')).toBe(false);
    expect(inMonth('2026-10-31T23:30:00Z', '2026-11')).toBe(true);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'moneyAccount', 'moneyEntry', 'offeringCount']) db[k] ??= [];
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
  );
  db.membership.find((m: any) => m.id === 'mem-cm').orgUnitId = 'ou-choir';
  db.person.push(
    { id: 'p-ctr', fullName: 'Choir Treasurer', status: 'ACTIVE' },
    { id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' },
  );
  const at = new Date('2022-01-01');
  db.position.push(
    { id: 'pos-ctr', personId: 'p-ctr', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Treasurer', office: 'TREASURER', status: 'ACTIVE', startDate: at },
    { id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: at },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const openAccount = async () => (await post('p-ctr', '/api/money/accounts', { unitId: 'ou-choir', name: 'Choir fund' })).body.id as string;
const entry = (accountId: string, o: object = {}) => ({ accountId, kind: 'INCOME', amount: 10000, occurredOn: '2026-10-04', category: 'DONATION', ...o });

describe('money', () => {
  it('the treasurer opens an account and records income directly', async () => {
    const a = await openAccount();
    const r = await post('p-ctr', '/api/money/entries', entry(a));
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('RECORDED');
    const list = await get('p-ctr', '/api/money/accounts?systemId=sys-choir');
    expect(list.body.accounts[0].balance).toBe(10000);
  });
  it('the president and vice president cannot record; members cannot see', async () => {
    const a = await openAccount();
    expect((await post('p-choir-leader', '/api/money/entries', entry(a))).status).toBe(403);
    expect((await post('p-vp', '/api/money/entries', entry(a))).status).toBe(403);
    expect((await get('p-vp', '/api/money/accounts?systemId=sys-choir')).status).toBe(200);
    expect((await get('p-choir-member', '/api/money/accounts?systemId=sys-choir')).status).toBe(404);
    expect((await get('p-outsider', '/api/money/entries?systemId=sys-choir')).status).toBe(404);
  });
  it('rejects bad amounts and dates', async () => {
    const a = await openAccount();
    expect((await post('p-ctr', '/api/money/entries', entry(a, { amount: 0 }))).body.code).toBe('AMOUNT');
    expect((await post('p-ctr', '/api/money/entries', entry(a, { amount: 12.5 }))).body.code).toBe('AMOUNT');
    expect((await post('p-ctr', '/api/money/entries', entry(a, { occurredOn: 'soon' }))).body.code).toBe('BAD_DATE');
  });
  it('spending waits for the president; approval moves the balance; nobody approves their own entry', async () => {
    const a = await openAccount();
    await post('p-ctr', '/api/money/entries', entry(a));
    const s = await post('p-ctr', '/api/money/entries', entry(a, { kind: 'SPENDING', amount: 4000, category: 'SUPPLIES' }));
    expect(s.body.status).toBe('PENDING_APPROVAL');
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-choir-leader' && n.kind === 'WAITING_FOR_ME')).toBe(true);
    let acc = (await get('p-ctr', '/api/money/accounts?systemId=sys-choir')).body.accounts[0];
    expect(acc.balance).toBe(10000);
    expect(acc.pending).toBe(4000);
    expect((await post('p-ctr', `/api/money/entries/${s.body.id}/approve`)).status).toBe(403);
    expect((await post('p-vp', `/api/money/entries/${s.body.id}/approve`)).status).toBe(403);
    expect((await post('p-choir-leader', `/api/money/entries/${s.body.id}/approve`)).status).toBe(200);
    acc = (await get('p-ctr', '/api/money/accounts?systemId=sys-choir')).body.accounts[0];
    expect(acc.balance).toBe(6000);
    expect((await post('p-choir-leader', `/api/money/entries/${s.body.id}/approve`)).status).toBe(409);
    expect(fake.__db.auditEvent.some((e: any) => e.resource === 'MONEY' && e.action === 'MONEY_SPENDING_APPROVED')).toBe(true);
  });
  it('declining needs a reason and spends nothing', async () => {
    const a = await openAccount();
    const s = await post('p-ctr', '/api/money/entries', entry(a, { kind: 'SPENDING', category: 'AID' }));
    expect((await post('p-choir-leader', `/api/money/entries/${s.body.id}/reject`)).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-choir-leader', `/api/money/entries/${s.body.id}/reject`, { reason: 'Not planned' })).status).toBe(200);
    expect((await get('p-ctr', '/api/money/accounts?systemId=sys-choir')).body.accounts[0].spent).toBe(0);
  });
  it('voiding needs a reason; approved spending is final', async () => {
    const a = await openAccount();
    const i = await post('p-ctr', '/api/money/entries', entry(a));
    expect((await post('p-ctr', `/api/money/entries/${i.body.id}/void`)).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-ctr', `/api/money/entries/${i.body.id}/void`, { reason: 'Typed twice' })).status).toBe(200);
    const s = await post('p-ctr', '/api/money/entries', entry(a, { kind: 'SPENDING' }));
    await post('p-choir-leader', `/api/money/entries/${s.body.id}/approve`);
    expect((await post('p-ctr', `/api/money/entries/${s.body.id}/void`, { reason: 'x' })).status).toBe(409);
  });
  it('a closed account takes no entries, and cannot close with spending waiting', async () => {
    const a = await openAccount();
    await post('p-ctr', '/api/money/entries', entry(a, { kind: 'SPENDING' }));
    expect((await post('p-ctr', `/api/money/accounts/${a}/close`)).body.code).toBe('PENDING_SPENDING');
    const b = (await post('p-ctr', '/api/money/accounts', { unitId: 'ou-choir', name: 'Old' })).body.id;
    expect((await post('p-ctr', `/api/money/accounts/${b}/close`)).status).toBe(200);
    expect((await post('p-ctr', '/api/money/entries', entry(b))).body.code).toBe('ACCOUNT_CLOSED');
  });
});

describe('collections', () => {
  const count = (o: object = {}) => ({ unitId: 'ou-choir', serviceOn: '2026-10-04', label: 'Sunday service', amount: 85000, counterIds: ['p-vp', 'p-choir-member'], ...o });
  it('needs two different counters', async () => {
    expect((await post('p-vp', '/api/collections', count({ counterIds: ['p-vp'] }))).status).toBe(400);
    expect((await post('p-vp', '/api/collections', count({ counterIds: ['p-vp', 'p-vp'] }))).body.code).toBe('NEEDS_TWO_COUNTERS');
  });
  it('the treasurer (no governance write) cannot record; a vice president can', async () => {
    expect((await post('p-ctr', '/api/collections', count())).status).toBe(403);
    expect((await post('p-vp', '/api/collections', count())).status).toBe(201);
  });
  it('someone who counted cannot confirm; the president does; then it is handed over and the treasurer is told', async () => {
    const c = (await post('p-vp', '/api/collections', count())).body.id;
    expect((await post('p-vp', `/api/collections/${c}/confirm`)).status).toBe(403);
    expect((await post('p-choir-leader', `/api/collections/${c}/handover`, { toPersonId: 'p-ctr' })).status).toBe(409);
    expect((await post('p-choir-leader', `/api/collections/${c}/confirm`)).status).toBe(200);
    expect((await post('p-vp', `/api/collections/${c}/void`, { reason: 'x' })).status).toBe(409);
    expect((await post('p-vp', `/api/collections/${c}/handover`, { toPersonId: 'p-ctr' })).status).toBe(200);
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-ctr')).toBe(true);
    expect(fake.__db.moneyEntry.length).toBe(0);
    expect((await post('p-vp', `/api/collections/${c}/handover`, { toPersonId: 'p-ctr' })).status).toBe(409);
  });
  it('a recorded count can be voided with a reason; members cannot see counts', async () => {
    const c = (await post('p-vp', '/api/collections', count())).body.id;
    expect((await post('p-vp', `/api/collections/${c}/void`)).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-vp', `/api/collections/${c}/void`, { reason: 'Wrong day' })).status).toBe(200);
    expect((await get('p-choir-member', '/api/collections?systemId=sys-choir')).status).toBe(404);
    expect((await get('p-vp', '/api/collections?systemId=sys-choir')).body.counts[0].status).toBe('VOIDED');
  });
});
