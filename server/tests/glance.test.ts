import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { lastMonths, monthOf, sumByMonth } from '../src/glance/rules';

describe('glance rules', () => {
  it('lists the last months oldest first, across a year end', () => {
    expect(lastMonths(new Date('2026-02-10T10:00:00Z'), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('uses Kigali time for the month', () => {
    expect(monthOf('2026-09-30T23:00:00Z')).toBe('2026-10');
  });
  it('sums rows into months and ignores others', () => {
    const months = ['2026-09', '2026-10'];
    const rows = [{ d: '2026-09-02', a: 5 }, { d: '2026-10-02', a: 7 }, { d: '2026-10-09', a: 1 }, { d: '2025-01-01', a: 99 }];
    expect(sumByMonth(rows, months, (r) => r.d, (r) => r.a)).toEqual([{ label: '2026-09', value: 5 }, { label: '2026-10', value: 8 }]);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'workTask', 'membership', 'unitGroup', 'groupSession', 'couplePair', 'prayerWatch', 'evangelismContact', 'moneyEntry']) db[k] ??= [];
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('glance endpoint', () => {
  it('needs a system', async () => {
    expect((await get('p-pastor', '/api/glance')).status).toBe(400);
  });
  it('shows money only to those who may read money, and never leaks for a stranger', async () => {
    const now = new Date();
    fake.__db.moneyEntry.push(
      { id: 'e1', accountId: 'a', orgUnitId: 'u', systemId: 'sys-youth', kind: 'INCOME', amount: 5000, occurredOn: now, category: 'OFFERING', status: 'RECORDED', recordedById: 'x' },
      { id: 'e2', accountId: 'a', orgUnitId: 'u', systemId: 'sys-youth', kind: 'SPENDING', amount: 2000, occurredOn: now, category: 'SUPPLIES', status: 'APPROVED', recordedById: 'x' },
    );
    const t = await get('p-treasurer', '/api/glance?systemId=sys-youth');
    expect(t.status).toBe(200);
    const keys = t.body.tiles.map((x: { key: string }) => x.key);
    if (keys.includes('money.balance')) {
      expect(t.body.tiles.find((x: { key: string }) => x.key === 'money.balance').value).toBe(3000);
      expect(t.body.series.find((s: { key: string }) => s.key === 'money.income').points).toHaveLength(6);
    }
    const o = await get('p-outsider', '/api/glance?systemId=sys-youth');
    expect(o.status).toBe(200);
    expect(o.body.tiles.map((x: { key: string }) => x.key)).not.toContain('money.balance');
    expect(o.body.series).toEqual([]);
  });
  it('counts work the person may see and flags overdue', async () => {
    fake.__db.workTask.push(
      { id: 'w1', title: 'a', ownerPersonId: 'p-youth-leader', createdByPersonId: 'p-youth-leader', systemId: 'sys-youth', visibility: 'SYSTEM', status: 'TODO', dueDate: new Date('2020-01-01') },
      { id: 'w2', title: 'b', ownerPersonId: 'p-youth-leader', createdByPersonId: 'p-youth-leader', systemId: 'sys-youth', visibility: 'PERSONS', status: 'TODO' },
    );
    const l = await get('p-youth-leader', '/api/glance?systemId=sys-youth');
    expect(l.body.tiles.find((x: { key: string }) => x.key === 'work.open').value).toBe(2);
    expect(l.body.tiles.find((x: { key: string }) => x.key === 'work.overdue').value).toBe(1);
    const o = await get('p-outsider', '/api/glance?systemId=sys-youth');
    expect(o.body.tiles.find((x: { key: string }) => x.key === 'work.open')).toBeUndefined();
  });
  it('counts evangelism contacts for those with people letters', async () => {
    fake.__db.evangelismContact.push({ id: 'c1', status: 'NEW' }, { id: 'c2', status: 'FOLLOWING' });
    const r = await get('p-pastor', '/api/glance?systemId=sys-evangelism');
    expect(r.status).toBe(200);
    expect(r.body.tiles.find((x: { key: string }) => x.key === 'contacts.new')?.value).toBe(1);
  });
});
