import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { accounting, combine, counts, goalGroups, linesProblem, moneyByPlan, yearOf } from '../src/money/block';

describe('money block rules', () => {
  it('planned and actual side by side; totals are computed', () => {
    const r = accounting(
      [{ kind: 'INCOME', category: 'TITHE', planned: 5000 }, { kind: 'SPENDING', category: 'SUPPLIES', planned: 2000 }],
      [
        { kind: 'INCOME', amount: 3000, status: 'RECORDED', category: 'TITHE', occurredOn: '2026-03-01' },
        { kind: 'INCOME', amount: 999, status: 'VOIDED', category: 'TITHE', occurredOn: '2026-03-01' },
        { kind: 'INCOME', amount: 700, status: 'RECORDED', category: 'DONATION', occurredOn: '2026-04-01' },
        { kind: 'INCOME', amount: 800, status: 'RECORDED', category: 'TITHE', occurredOn: '2025-04-01' },
        { kind: 'SPENDING', amount: 2500, status: 'APPROVED', category: 'SUPPLIES', occurredOn: '2026-05-01' },
        { kind: 'SPENDING', amount: 400, status: 'PENDING_APPROVAL', category: 'SUPPLIES', occurredOn: '2026-05-02' },
      ],
      2026,
    );
    expect(r.income.rows.map((x) => [x.category, x.planned, x.actual, x.difference])).toEqual([['TITHE', 5000, 3000, -2000], ['DONATION', 0, 700, 700]]);
    expect([r.income.planned, r.income.actual, r.spending.planned, r.spending.actual]).toEqual([5000, 3700, 2000, 2500]);
    expect(r.net).toEqual({ planned: 3000, actual: 1200 });
  });
  it('money by plan: planned from live activities, income recorded, spending approved or waiting', () => {
    const r = moneyByPlan(
      [{ planId: 'a', amount: 500, status: 'PLANNED' }, { planId: 'a', amount: 300, status: 'DROPPED' }, { planId: 'b', amount: 100, status: 'DONE' }, { amount: 999, status: 'PLANNED' }],
      [
        { planId: 'a', kind: 'INCOME', amount: 200, status: 'RECORDED' },
        { planId: 'a', kind: 'SPENDING', amount: 400, status: 'APPROVED' },
        { planId: 'a', kind: 'SPENDING', amount: 50, status: 'PENDING_APPROVAL' },
        { planId: 'a', kind: 'SPENDING', amount: 70, status: 'REJECTED' },
        { kind: 'SPENDING', amount: 9, status: 'APPROVED' },
      ],
    );
    expect(r.find((x) => x.planId === 'a')).toEqual({ planId: 'a', planned: 500, income: 200, spending: 400, pending: 50 });
    expect(r.find((x) => x.planId === 'b')).toEqual({ planId: 'b', planned: 100, income: 0, spending: 0, pending: 0 });
    expect(r).toHaveLength(2);
  });
  it('a day belongs to the year it is in Kigali', () => {
    expect(yearOf('2026-12-31T23:30:00Z')).toBe(2027);
  });
  it('goals per member or per team, and none when no goal is set', () => {
    const lines = [{ name: 'Ann', personId: 'p1', team: 'A', amount: 600 }, { name: 'Ann', personId: 'p1', team: 'A', amount: 500 }, { name: 'Bob', team: 'B', amount: 200 }];
    expect(goalGroups({}, lines)).toEqual([]);
    expect(goalGroups({ goalAmount: 1000, goalPer: 'MEMBER' }, lines).map((g) => [g.label, g.total, g.met])).toEqual([['Ann', 1100, true], ['Bob', 200, false]]);
    expect(goalGroups({ goalAmount: 1000, goalPer: 'TEAM' }, lines).map((g) => [g.label, g.total, g.met])).toEqual([['A', 1100, true], ['B', 200, false]]);
  });
  it('combining puts a Team column on every line', () => {
    const r = combine([{ id: 'b', teamName: 'B', lines: [{ name: 'Bob', amount: 5 }] }, { id: 'a', teamName: 'A', lines: [{ name: 'Ann', amount: 7 }] }]);
    expect(r.lines.map((l) => [l.team, l.name])).toEqual([['A', 'Ann'], ['B', 'Bob']]);
    expect(r.sourceListIds).toEqual(['b', 'a']);
  });
  it('a combined team list is not counted twice', () => {
    expect(counts({ level: 'TEAM', status: 'SUBMITTED' })).toBe(true);
    expect(counts({ level: 'TEAM', status: 'COMBINED' })).toBe(false);
    expect(counts({ level: 'TEAM', status: 'DRAFT' })).toBe(false);
    expect(counts({ level: 'UNIT', status: 'DRAFT' })).toBe(true);
  });
  it('lines need a name and a whole amount above zero', () => {
    expect(linesProblem([{ name: 'A', amount: 5 }])).toBeNull();
    expect(linesProblem([{ name: ' ', amount: 5 }])).toBe('LINE_NAME');
    expect(linesProblem([{ name: 'A', amount: 0 }])).toBe('AMOUNT');
    expect(linesProblem([{ name: 'A', amount: 1.5 }])).toBe('AMOUNT');
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const put = (as: string, path: string, body: object = {}) => request(app).put(path).set(bearer(as)).send(body);
const patch = (as: string, path: string, body: object = {}) => request(app).patch(path).set(bearer(as)).send(body);
const S = 'systemId=sys-choir';

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'moneyAccount', 'moneyEntry', 'offeringCount', 'systemSetting', 'moneyBudget', 'moneyBudgetLine', 'moneyPlanItem', 'contributionList', 'contributionLine', 'donation']) db[k] ??= [];
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
    { id: 'ou-sop', name: 'Sopranos', code: 'KAC-MUS-CHO-S', kind: 'TEAM', type: 'TEAM', parentId: 'ou-choir', systemId: 'sys-choir', leaderPersonId: 'p-tl1' },
    { id: 'ou-alto', name: 'Altos', code: 'KAC-MUS-CHO-A', kind: 'TEAM', type: 'TEAM', parentId: 'ou-choir', systemId: 'sys-choir', leaderPersonId: 'p-tl2' },
  );
  db.membership.find((m: any) => m.id === 'mem-cm').orgUnitId = 'ou-choir';
  const at = new Date('2022-01-01');
  db.person.push(
    { id: 'p-ctr', fullName: 'Choir Treasurer', status: 'ACTIVE' },
    { id: 'p-tl1', fullName: 'Soprano Leader', status: 'ACTIVE' },
    { id: 'p-tl2', fullName: 'Alto Leader', status: 'ACTIVE' },
  );
  db.membership.push(
    { id: 'mem-tl1', personId: 'p-tl1', systemId: 'sys-choir', type: 'MINISTRY_MEMBER', label: 'Choir member', status: 'ACTIVE', startDate: at },
    { id: 'mem-tl2', personId: 'p-tl2', systemId: 'sys-choir', type: 'MINISTRY_MEMBER', label: 'Choir member', status: 'ACTIVE', startDate: at },
  );
  db.position.push({ id: 'pos-ctr', personId: 'p-ctr', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Treasurer', office: 'TREASURER', status: 'ACTIVE', startDate: at });
  db.systemSetting.push({ id: 'ss1', systemId: 'sys-choir', detailsJson: '{}', moneyJson: JSON.stringify({ types: [{ code: 'TITHE', name: 'Tithe', goalAmount: 1000, goalPer: 'MEMBER' }], methods: ['CASH'] }) });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('budget', () => {
  it('the treasurer plans, totals are computed, and non-readers see nothing', async () => {
    expect((await put('p-ctr', '/api/money/budget/lines', { systemId: 'sys-choir', year: 2026, kind: 'INCOME', category: 'TITHE', planned: 5000 })).status).toBe(200);
    expect((await put('p-ctr', '/api/money/budget/lines', { systemId: 'sys-choir', year: 2026, kind: 'SPENDING', category: 'SUPPLIES', planned: 1500 })).status).toBe(200);
    const r = await get('p-ctr', `/api/money/budget?${S}&year=2026`);
    expect(r.body.totals).toEqual({ income: 5000, spending: 1500, net: 3500 });
    expect(r.body.canWrite).toBe(true);
    expect((await get('p-choir-member', `/api/money/budget?${S}&year=2026`)).status).toBe(404);
    expect((await get('p-ctr', `/api/money/budget?systemId=sys-youth&year=2026`)).status).toBe(404);
  });
  it('zero removes a line; the president approves; an approved budget is locked until reopened', async () => {
    const line = (planned: number) => put('p-ctr', '/api/money/budget/lines', { systemId: 'sys-choir', year: 2026, kind: 'INCOME', category: 'TITHE', planned });
    await line(5000);
    await line(0);
    expect((await get('p-ctr', `/api/money/budget?${S}&year=2026`)).body.lines).toHaveLength(0);
    expect((await post('p-choir-leader', '/api/money/budget/approve', { systemId: 'sys-choir', year: 2026 })).status).toBe(409);
    await line(4000);
    expect((await post('p-ctr', '/api/money/budget/approve', { systemId: 'sys-choir', year: 2026 })).status).toBe(403);
    expect((await post('p-choir-leader', '/api/money/budget/approve', { systemId: 'sys-choir', year: 2026 })).status).toBe(200);
    expect((await line(4500)).status).toBe(409);
    expect((await post('p-choir-leader', '/api/money/budget/reopen', { systemId: 'sys-choir', year: 2026 })).status).toBe(200);
    expect((await line(4500)).status).toBe(200);
  });
});

describe('action plan and accounting', () => {
  it('plans activities with a cost, and a dropped one leaves the total', async () => {
    const a = (await post('p-ctr', '/api/money/plan', { systemId: 'sys-choir', year: 2026, title: 'New uniforms', amount: 300000, dueMonth: '2026-11', category: 'SUPPLIES' })).body.id;
    await post('p-ctr', '/api/money/plan', { systemId: 'sys-choir', year: 2026, title: 'Tour fuel', amount: 50000 });
    expect((await get('p-ctr', `/api/money/plan?${S}&year=2026`)).body.totals.planned).toBe(350000);
    expect((await patch('p-ctr', `/api/money/plan/${a}`, { status: 'DROPPED' })).status).toBe(200);
    const r = await get('p-ctr', `/api/money/plan?${S}&year=2026`);
    expect(r.body.totals.planned).toBe(50000);
    expect(r.body.items).toHaveLength(2);
    expect((await post('p-ctr', '/api/money/plan', { systemId: 'sys-choir', year: 2026, title: 'x', amount: 1, dueMonth: '2026-13' })).status).toBe(400);
    expect((await patch('p-choir-leader', `/api/money/plan/${a}`, { title: 'Nope' })).status).toBe(403);
  });
  it('accounting reads planned against what was recorded and approved', async () => {
    await put('p-ctr', '/api/money/budget/lines', { systemId: 'sys-choir', year: 2026, kind: 'INCOME', category: 'DONATION', planned: 50000 });
    const acc = (await post('p-ctr', '/api/money/accounts', { unitId: 'ou-choir', name: 'Fund' })).body.id;
    await post('p-ctr', '/api/money/entries', { accountId: acc, kind: 'INCOME', amount: 20000, occurredOn: '2026-10-04', category: 'DONATION' });
    const sp = (await post('p-ctr', '/api/money/entries', { accountId: acc, kind: 'SPENDING', amount: 8000, occurredOn: '2026-10-05', category: 'SUPPLIES' })).body.id;
    let r = await get('p-ctr', `/api/money/accounting?${S}&year=2026`);
    expect([r.body.income.planned, r.body.income.actual, r.body.spending.actual]).toEqual([50000, 20000, 0]);
    await post('p-choir-leader', `/api/money/entries/${sp}/approve`);
    r = await get('p-ctr', `/api/money/accounting?${S}&year=2026`);
    expect(r.body.spending.actual).toBe(8000);
    expect(r.body.net.actual).toBe(12000);
  });
});

describe('contribution lists', () => {
  const team = (as: string, unit: string, month = '2026-10') => post(as, '/api/money/lists', { systemId: 'sys-choir', level: 'TEAM', typeCode: 'TITHE', month, teamUnitId: unit });
  it('a team leader writes only their own team’s list', async () => {
    expect((await team('p-tl1', 'ou-sop')).status).toBe(201);
    expect((await team('p-tl1', 'ou-alto')).status).toBe(403);
    expect((await team('p-tl1', 'ou-sop')).status).toBe(409);
    expect((await team('p-choir-member', 'ou-sop')).status).toBe(403);
    expect((await post('p-tl1', '/api/money/lists', { systemId: 'sys-choir', level: 'TEAM', typeCode: 'NOPE', month: '2026-10', teamUnitId: 'ou-sop' })).status).toBe(400);
  });
  it('team → treasurer → president, with the lists combined and a Team column', async () => {
    const a = (await team('p-tl1', 'ou-sop')).body.id;
    const b = (await team('p-tl2', 'ou-alto')).body.id;
    expect((await put('p-tl1', `/api/money/lists/${a}`, { lines: [{ name: 'Ann', personId: 'p-choir-member', amount: 1200 }, { name: 'Eve', amount: 300 }] })).status).toBe(200);
    await put('p-tl2', `/api/money/lists/${b}`, { lines: [{ name: 'Bob', amount: 500 }] });
    expect((await post('p-tl1', `/api/money/lists/${a}/submit`)).status).toBe(200);
    expect((await put('p-tl1', `/api/money/lists/${a}`, { lines: [{ name: 'Late', amount: 1 }] })).status).toBe(403);
    // the other team has not submitted yet, so only the first combines
    expect((await post('p-tl1', '/api/money/lists/combine', { systemId: 'sys-choir', typeCode: 'TITHE', month: '2026-10' })).status).toBe(404);
    const first = await post('p-ctr', '/api/money/lists/combine', { systemId: 'sys-choir', typeCode: 'TITHE', month: '2026-10' });
    expect(first.body.combined).toBe(1);
    await post('p-tl2', `/api/money/lists/${b}/submit`);
    const second = await post('p-ctr', '/api/money/lists/combine', { systemId: 'sys-choir', typeCode: 'TITHE', month: '2026-10' });
    expect(second.body.id).toBe(first.body.id);
    const all = (await get('p-ctr', `/api/money/lists?${S}&month=2026-10`)).body;
    const unit = all.lists.find((l: any) => l.level === 'UNIT');
    expect(unit.lines.map((l: any) => [l.team, l.name])).toEqual([['Sopranos', 'Ann'], ['Sopranos', 'Eve'], ['Altos', 'Bob']]);
    expect(unit.total).toBe(2000);
    expect(unit.fromTeams).toBe(2);
    expect(all.lists.filter((l: any) => l.level === 'TEAM').every((l: any) => l.status === 'COMBINED')).toBe(true);
    // the treasurer submits to the president; the treasurer cannot approve; the president can
    expect((await post('p-ctr', `/api/money/lists/${unit.id}/submit`)).status).toBe(200);
    expect((await post('p-ctr', `/api/money/lists/${unit.id}/approve`)).status).toBe(403);
    expect((await post('p-choir-leader', `/api/money/lists/${unit.id}/return`, {})).status).toBe(400);
    expect((await post('p-choir-leader', `/api/money/lists/${unit.id}/return`, { reason: 'Check Eve' })).status).toBe(200);
    expect((await get('p-ctr', `/api/money/lists?${S}`)).body.lists.find((l: any) => l.id === unit.id).status).toBe('RETURNED');
    await post('p-ctr', `/api/money/lists/${unit.id}/submit`);
    expect((await post('p-choir-leader', `/api/money/lists/${unit.id}/approve`)).status).toBe(200);
    expect((await get('p-ctr', `/api/money/lists?${S}`)).body.lists.find((l: any) => l.id === unit.id).status).toBe('APPROVED');
  });
  it('a unit with no teams: the treasurer records the list and submits it', async () => {
    const id = (await post('p-ctr', '/api/money/lists', { systemId: 'sys-choir', level: 'UNIT', typeCode: 'TITHE', month: '2026-09' })).body.id;
    await put('p-ctr', `/api/money/lists/${id}`, { lines: [{ name: 'Ann', amount: 1500 }] });
    const l = (await get('p-ctr', `/api/money/lists?${S}&month=2026-09`)).body.lists[0];
    expect(l.goals).toEqual([{ label: 'Ann', total: 1500, goal: 1000, met: true }]);
    expect((await post('p-ctr', `/api/money/lists/${id}/submit`)).status).toBe(200);
    expect((await post('p-tl1', '/api/money/lists', { systemId: 'sys-choir', level: 'UNIT', typeCode: 'TITHE', month: '2026-08' })).status).toBe(403);
  });
  it('a team draft is private to its leader and the treasurer', async () => {
    const a = (await team('p-tl1', 'ou-sop')).body.id;
    await put('p-tl1', `/api/money/lists/${a}`, { lines: [{ name: 'Ann', amount: 5 }] });
    expect((await get('p-choir-leader', `/api/money/lists?${S}`)).body.lists).toHaveLength(0);
    expect((await get('p-tl2', `/api/money/lists?${S}`)).body.lists).toHaveLength(0);
    expect((await get('p-tl1', `/api/money/lists?${S}`)).body.lists).toHaveLength(1);
    expect((await get('p-ctr', `/api/money/lists?${S}`)).body.lists).toHaveLength(1);
    await post('p-tl1', `/api/money/lists/${a}/submit`);
    expect((await get('p-choir-leader', `/api/money/lists?${S}`)).body.lists).toHaveLength(1);
  });
});

describe('my contribution', () => {
  it('a member sees only their own lines, counted once, against their goal; others see nothing of them', async () => {
    const a = (await post('p-tl1', '/api/money/lists', { systemId: 'sys-choir', level: 'TEAM', typeCode: 'TITHE', month: '2026-10', teamUnitId: 'ou-sop' })).body.id;
    await put('p-tl1', `/api/money/lists/${a}`, { lines: [{ name: 'Choir member', personId: 'p-choir-member', amount: 800 }, { name: 'Other', personId: 'p-pastor', amount: 9999 }] });
    let r = (await get('p-choir-member', `/api/money/mine?${S}&year=2026`)).body;
    expect(r.grandTotal).toBe(0); // still a draft with the team leader
    await post('p-tl1', `/api/money/lists/${a}/submit`);
    r = (await get('p-choir-member', `/api/money/mine?${S}&year=2026`)).body;
    expect(r.grandTotal).toBe(800);
    expect(r.types[0]).toMatchObject({ code: 'TITHE', total: 800, goal: 1000, reached: false });
    // combined into the unit list: still counted once
    await post('p-ctr', '/api/money/lists/combine', { systemId: 'sys-choir', typeCode: 'TITHE', month: '2026-10' });
    r = (await get('p-choir-member', `/api/money/mine?${S}&year=2026`)).body;
    expect(r.grandTotal).toBe(1600 / 2);
    expect(r.history.map((h: any) => h.amount)).toEqual([800, 800]);
    expect((await get('p-choir-member', `/api/money/mine?${S}&year=2026`)).body.teams).toEqual([]);
    expect((await get('p-tl1', `/api/money/mine?${S}&year=2026`)).body.teams).toEqual([{ id: 'ou-sop', name: 'Sopranos' }]);
    expect((await get('p-outsider', `/api/money/mine?${S}&year=2026`)).status).toBe(404);
  });
});

describe('donations', () => {
  it('the treasurer records, the president approves, and only then it is income', async () => {
    const acc = (await post('p-ctr', '/api/money/accounts', { unitId: 'ou-choir', name: 'Fund' })).body.id;
    const id = (await post('p-ctr', '/api/money/donations', { systemId: 'sys-choir', accountId: acc, donorName: 'A friend', amount: 40000, receivedOn: '2026-10-03' })).body.id;
    expect(fake.__db.moneyEntry).toHaveLength(0);
    expect((await post('p-ctr', `/api/money/donations/${id}/approve`)).status).toBe(403);
    expect((await post('p-choir-leader', `/api/money/donations/${id}/reject`)).status).toBe(400);
    expect((await post('p-choir-leader', `/api/money/donations/${id}/approve`)).status).toBe(200);
    expect(fake.__db.moneyEntry).toHaveLength(1);
    expect(fake.__db.moneyEntry[0]).toMatchObject({ kind: 'INCOME', category: 'DONATION', amount: 40000, status: 'RECORDED' });
    expect((await post('p-choir-leader', `/api/money/donations/${id}/approve`)).status).toBe(409);
    expect((await post('p-choir-member', '/api/money/donations', { systemId: 'sys-choir', accountId: acc, donorName: 'x', amount: 1, receivedOn: '2026-10-03' })).status).toBe(404);
  });
});

describe('report', () => {
  it('brings plan, actual, months, contributions and donations together', async () => {
    await put('p-ctr', '/api/money/budget/lines', { systemId: 'sys-choir', year: 2026, kind: 'INCOME', category: 'TITHE', planned: 9000 });
    const acc = (await post('p-ctr', '/api/money/accounts', { unitId: 'ou-choir', name: 'Fund' })).body.id;
    await post('p-ctr', '/api/money/entries', { accountId: acc, kind: 'INCOME', amount: 7000, occurredOn: '2026-10-04', category: 'TITHE' });
    const l = (await post('p-ctr', '/api/money/lists', { systemId: 'sys-choir', level: 'UNIT', typeCode: 'TITHE', month: '2026-10' })).body.id;
    await put('p-ctr', `/api/money/lists/${l}`, { lines: [{ name: 'Ann', amount: 3000 }] });
    await post('p-ctr', `/api/money/lists/${l}/submit`);
    await post('p-choir-leader', `/api/money/lists/${l}/approve`);
    const r = (await get('p-ctr', `/api/money/report?${S}&year=2026`)).body;
    expect(r.income.rows[0]).toMatchObject({ category: 'TITHE', planned: 9000, actual: 7000 });
    expect(r.months[9]).toEqual({ month: '2026-10', income: 7000, spending: 0 });
    expect(r.contributions).toEqual([{ code: 'TITHE', name: 'Tithe', approved: 3000, inProgress: 0 }]);
    expect((await get('p-choir-member', `/api/money/report?${S}&year=2026`)).status).toBe(404);
  });
});

describe('money tied to a program, project or event', () => {
  beforeEach(() => {
    const db = fake.__db;
    db.workPlan ??= [];
    db.workPlan.push(
      { id: 'wp1', systemId: 'sys-choir', title: 'Christmas concert', planType: 'EVENT', status: 'RUNNING' },
      { id: 'wp-old', systemId: 'sys-choir', title: 'Cancelled trip', planType: 'PROJECT', status: 'CANCELLED' },
      { id: 'wp-other', systemId: 'sys-youth', title: 'Youth camp', planType: 'PROGRAM', status: 'RUNNING' },
    );
    db.moneyAccount.push({ id: 'acc1', orgUnitId: 'ou-choir', systemId: 'sys-choir', name: 'Cash', status: 'ACTIVE' });
  });
  const entry = (planId: string | null, kind = 'INCOME', amount = 1000) =>
    post('p-ctr', '/api/money/entries', { accountId: 'acc1', kind, amount, occurredOn: '2026-05-10', category: 'EVENT', planId });

  it('lists the plans of this system (not cancelled) for the pickers', async () => {
    const r = await get('p-ctr', `/api/money/plan-links?${S}`);
    expect(r.body.plans.map((p: { id: string }) => p.id)).toEqual(['wp1']);
    expect((await get('p-choir-member', `/api/money/plan-links?${S}`)).status).toBe(404);
  });
  it('an entry and an activity can be linked; a plan of another system is refused', async () => {
    expect((await entry('wp1')).status).toBe(201);
    expect((await entry('wp-other')).status).toBe(400);
    expect((await entry('nope')).status).toBe(400);
    expect((await post('p-ctr', '/api/money/plan', { systemId: 'sys-choir', year: 2026, title: 'Hire sound', amount: 300, planId: 'wp1' })).status).toBe(201);
    expect((await post('p-ctr', '/api/money/plan', { systemId: 'sys-choir', year: 2026, title: 'Bad', amount: 1, planId: 'wp-other' })).status).toBe(400);
    const list = await get('p-ctr', `/api/money/entries?${S}`);
    expect(list.body.entries[0]).toMatchObject({ planId: 'wp1', planTitle: 'Christmas concert' });
    const plan = await get('p-ctr', `/api/money/plan?${S}&year=2026`);
    expect(plan.body.items[0]).toMatchObject({ planId: 'wp1', planTitle: 'Christmas concert' });
  });
  it('the plan shows what it costs and earns, and the report lists every plan', async () => {
    await post('p-ctr', '/api/money/plan', { systemId: 'sys-choir', year: 2026, title: 'Hire sound', amount: 300, planId: 'wp1' });
    await entry('wp1', 'INCOME', 1000);
    const sp = await entry('wp1', 'SPENDING', 400);
    const m1 = await get('p-ctr', `/api/money/plan-money?${S}&planId=wp1`);
    expect(m1.body).toMatchObject({ planned: 300, income: 1000, spending: 0, pending: 400 });
    await post('p-choir-leader', `/api/money/entries/${sp.body.id}/approve`);
    const m2 = await get('p-ctr', `/api/money/plan-money?${S}&planId=wp1`);
    expect(m2.body).toMatchObject({ spending: 400, pending: 0 });
    const rep = await get('p-ctr', `/api/money/report?${S}&year=2026`);
    expect(rep.body.byPlan).toEqual([{ planId: 'wp1', title: 'Christmas concert', planned: 300, income: 1000, spending: 400, pending: 0 }]);
    expect((await get('p-ctr', `/api/money/plan-money?${S}&planId=wp-other`)).status).toBe(404);
    expect((await get('p-choir-member', `/api/money/plan-money?${S}&planId=wp1`)).status).toBe(404);
  });
});
