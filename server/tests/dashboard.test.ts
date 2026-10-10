import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { percentChange } from '../src/glance/rules';

describe('percent change', () => {
  it('compares with the earlier figure and says nothing when there is none', () => {
    expect(percentChange(12, 10)).toBe(20);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const keys = (r: { body: { kpis: Array<{ key: string }> } }) => r.body.kpis.map((k) => k.key);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'workTask', 'workPlan', 'unitGroup', 'groupSession', 'moneyEntry', 'offeringCount', 'report', 'reportSchedule', 'contributionList', 'contributionLine', 'donation', 'systemSetting']) db[k] ??= [];
  db.orgUnit.push(
    { id: 'ou-church', name: 'ADEPR Kacyiru', code: 'KAC', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-youth', name: 'Youth', code: 'KAC-YOU', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('leader dashboard', () => {
  it('is for leaders of the system or of the church; everyone else gets a plain not found', async () => {
    expect((await get('p-youth-leader', '/api/dashboard?systemId=sys-youth')).status).toBe(200);
    expect((await get('p-pastor', '/api/dashboard?systemId=sys-youth')).status).toBe(200);
    expect((await get('p-youth-member', '/api/dashboard?systemId=sys-youth')).status).toBe(404);
    expect((await get('p-choir-leader', '/api/dashboard?systemId=sys-youth')).status).toBe(404);
    expect((await get('p-outsider', '/api/dashboard?systemId=sys-youth')).status).toBe(404);
    expect((await get('p-pastor', '/api/dashboard')).status).toBe(400);
  });
  it('counts members of the system, newest first, with names', async () => {
    const r = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth');
    const members = r.body.kpis.find((k: { key: string }) => k.key === 'members');
    expect(members.value).toBeGreaterThan(0);
    expect(r.body.members.length).toBeGreaterThan(0);
    expect(r.body.members[0]).toHaveProperty('name');
  });
  it('a ministry shows its own money and never collections', async () => {
    const now = new Date();
    fake.__db.moneyEntry.push({ id: 'e1', accountId: 'a', orgUnitId: 'u', systemId: 'sys-youth', kind: 'INCOME', amount: 5000, occurredOn: now, category: 'DONATION', status: 'RECORDED', recordedById: 'x' });
    fake.__db.offeringCount.push({ id: 'c1', orgUnitId: 'u', systemId: 'sys-youth', serviceOn: now, amount: 99999, status: 'CONFIRMED' });
    const r = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth');
    expect(keys(r)).not.toContain('giving');
    if (r.body.second) {
      expect(r.body.second.kind).toBe('money');
      expect(JSON.stringify(r.body)).not.toContain('99999');
    }
  });
  it('Central Administration shows collections across the church, apart from money', async () => {
    const now = new Date();
    fake.__db.offeringCount.push(
      { id: 'c1', orgUnitId: 'u', systemId: 'sys-main', serviceOn: now, amount: 40000, status: 'CONFIRMED' },
      { id: 'c2', orgUnitId: 'u', systemId: 'sys-youth', serviceOn: now, amount: 10000, status: 'RECORDED' },
      { id: 'c3', orgUnitId: 'u', systemId: 'sys-main', serviceOn: now, amount: 777, status: 'VOIDED' },
    );
    fake.__db.moneyEntry.push({ id: 'e1', accountId: 'a', orgUnitId: 'u', systemId: 'sys-youth', kind: 'INCOME', amount: 5000, occurredOn: now, category: 'DONATION', status: 'RECORDED', recordedById: 'x' });
    const r = await get('p-pastor', '/api/dashboard?systemId=sys-main');
    expect(r.status).toBe(200);
    expect(r.body.central).toBe(true);
    expect(r.body.kpis.find((k: { key: string }) => k.key === 'giving').value).toBe(50000);
    expect(keys(r)).not.toContain('money');
    expect(r.body.second.kind).toBe('giving');
  });
  it('lists upcoming events and the latest work the person may see, and hides the rest', async () => {
    const soon = new Date(Date.now() + 5 * 86400000);
    fake.__db.workPlan.push(
      { id: 'wp1', systemId: 'sys-youth', orgUnitId: 'ou-youth', title: 'Youth camp', planType: 'EVENT', status: 'SETUP', startsOn: soon, endsOn: soon, leaderPersonId: 'p-youth-leader', createdById: 'p-youth-leader', visibility: 'SYSTEM', teamJson: '[]' },
      { id: 'wp2', systemId: 'sys-youth', orgUnitId: 'ou-youth', title: 'Old event', planType: 'EVENT', status: 'SETUP', startsOn: new Date('2020-01-01'), leaderPersonId: 'p-youth-leader', createdById: 'p-youth-leader', visibility: 'SYSTEM', teamJson: '[]' },
      { id: 'wp3', systemId: 'sys-youth', orgUnitId: 'ou-youth', title: 'Private', planType: 'EVENT', status: 'SETUP', startsOn: soon, leaderPersonId: 'p-other', createdById: 'p-other', visibility: 'PERSONS', teamJson: '[]' },
    );
    fake.__db.workTask.push({ id: 'w1', title: 'Book the hall', ownerPersonId: 'p-youth-leader', createdByPersonId: 'p-youth-leader', systemId: 'sys-youth', visibility: 'SYSTEM', status: 'TODO' });
    const r = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth');
    expect(r.body.events.map((e: { title: string }) => e.title)).toEqual(['Youth camp']);
    expect(r.body.work.map((w: { title: string }) => w.title)).toEqual(['Book the hall']);
  });
  it('reports appear only where the REPORTS letter opens them, and only for the system in view', async () => {
    const db = fake.__db;
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    db.report.push(
      { id: 'r1', systemId: 'sys-youth', orgUnitId: 'ou-youth', kind: 'MEETINGS', periodKey: period, title: 'x', status: 'PUBLISHED', snapshotJson: '{}', composedById: 'a', composedAt: now, publishedAt: now },
      { id: 'r2', systemId: 'sys-music', orgUnitId: 'ou-youth', kind: 'MEETINGS', periodKey: period, title: 'y', status: 'PUBLISHED', snapshotJson: '{}', composedById: 'a', composedAt: now, publishedAt: now },
    );
    const r = await get('p-pastor', '/api/dashboard?systemId=sys-youth');
    expect(keys(r)).toContain('reports');
    expect(r.body.reports.map((x: { id: string }) => x.id)).toEqual(['r1']);
    // A leader whose letters do not include People gets no members list and no members figure.
    const y = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth');
    expect(y.body.members === null).toBe(!keys(y).includes('members'));
  });
  it('gives an overview of each part the letters open, with money only in a ministry', async () => {
    const now = new Date();
    fake.__db.moneyEntry.push(
      { id: 'o1', accountId: 'a', orgUnitId: 'u', systemId: 'sys-youth', kind: 'INCOME', amount: 9000, occurredOn: now, category: 'DONATION', status: 'RECORDED', recordedById: 'x' },
      { id: 'o2', accountId: 'a', orgUnitId: 'u', systemId: 'sys-youth', kind: 'SPENDING', amount: 4000, occurredOn: now, category: 'SUPPLIES', status: 'PENDING_APPROVAL', recordedById: 'x' },
    );
    const y = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth');
    expect(y.body.overview.work).toMatchObject({ openTasks: expect.any(Number), plansRunning: expect.any(Number) });
    expect(y.body.overview.money).toMatchObject({ balance: 9000, pendingCount: 1, pendingAmount: 4000 });
    const c = await get('p-pastor', '/api/dashboard?systemId=sys-main');
    expect(c.body.overview.money).toBeUndefined();
  });
});

describe('range, work figures, attention and contributions by unit', () => {
  it('honours the range and sends sparklines for the cards', async () => {
    const r12 = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth&range=12');
    expect(r12.body.range).toBe(12);
    const r = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth&range=5');
    expect(r.body.range).toBe(6);
    const members = r.body.kpis.find((k: { key: string }) => k.key === 'members');
    expect(members.spark).toHaveLength(6);
  });
  it('shows work figures and an attention line for overdue tasks', async () => {
    const now = new Date();
    const long = new Date(now.getTime() - 5 * 86400000);
    fake.__db.workTask.push(
      { id: 't1', title: 'Late', ownerPersonId: 'p-youth-leader', systemId: 'sys-youth', visibility: 'MINISTRY', status: 'TODO', dueDate: long, createdAt: long, updatedAt: long },
      { id: 't2', title: 'Done', ownerPersonId: 'p-youth-leader', systemId: 'sys-youth', visibility: 'MINISTRY', status: 'DONE', createdAt: long, updatedAt: now },
    );
    const r = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth');
    expect(keys(r)).toContain('work');
    expect(r.body.overview.work).toMatchObject({ overdue: 1, doneThisMonth: 1, openTasks: 1 });
    expect(r.body.attention).toContainEqual({ key: 'overdue', count: 1, href: '/s/sys-youth/work' });
    expect(r.body.workSeries.map((x: { key: string }) => x.key)).toEqual(['created', 'done']);
  });
  it('Central shows contributions and donations by unit on church-wide types; ministries do not', async () => {
    const db = fake.__db;
    const year = new Date().getUTCFullYear();
    db.systemSetting.push({ systemId: 'sys-main', moneyJson: JSON.stringify({ types: [{ code: 'BUILD', name: 'Building' }] }) });
    db.contributionList.push(
      { id: 'cl1', systemId: 'sys-youth', level: 'UNIT', status: 'APPROVED', typeCode: 'BUILD', typeName: 'Building', month: `${year}-01` },
      { id: 'cl2', systemId: 'sys-youth', level: 'UNIT', status: 'APPROVED', typeCode: 'OWN1', typeName: 'Camp', month: `${year}-02` },
      { id: 'cl3', systemId: 'sys-youth', level: 'TEAM', status: 'DRAFT', typeCode: 'BUILD', typeName: 'Building', month: `${year}-02` },
    );
    db.contributionLine.push({ id: 'l1', listId: 'cl1', name: 'A', amount: 4000 }, { id: 'l2', listId: 'cl2', name: 'B', amount: 1500 }, { id: 'l3', listId: 'cl3', name: 'C', amount: 9999 });
    db.donation.push({ id: 'd1', systemId: 'sys-youth', accountId: 'a', donorName: 'X', amount: 700, receivedOn: new Date(), status: 'APPROVED' });
    const c = await get('p-pastor', '/api/dashboard?systemId=sys-main');
    expect(c.body.byUnit.types).toEqual(['Building']);
    expect(c.body.byUnit.units[0]).toMatchObject({ systemId: 'sys-youth', byType: { Building: 4000 }, own: 1500, donations: 700, total: 6200 });
    const y = await get('p-youth-leader', '/api/dashboard?systemId=sys-youth');
    expect(y.body.byUnit).toBeNull();
  });
});
