import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { SETTLE_DAYS, fundraisingProblem, netOf, outcomeOf, projectedNet, settleDue, settlementLapsed, underBudget } from '../src/money/settle';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const put = (as: string, path: string, body: object = {}) => request(app).put(path).set(bearer(as)).send(body);
const patch = (as: string, path: string, body: object = {}) => request(app).patch(path).set(bearer(as)).send(body);
const del = (as: string, path: string) => request(app).delete(path).set(bearer(as));
const B = '/api/work-plans';

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'workPlan', 'workPlanNote', 'workPlanCheck', 'workPlanMilestone', 'workPlanRegistration', 'workPlanReview', 'workPlanIndicator', 'workPlanMeasure', 'incomeRecord', 'planSource', 'moneyPlanItem', 'contributionList', 'contributionLine', 'donation', 'systemSetting', 'budgetAmendment', 'planRenewal', 'moneyAccount', 'moneyEntry', 'planRevenue']) db[k] ??= [];
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
  db.person.push({ id: 'p-ctr', fullName: 'Choir Treasurer', status: 'ACTIVE' }, { id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' }, { id: 'p-admin', fullName: 'Administrator', status: 'ACTIVE' });
  db.position.push(
    { id: 'pos-ctr', personId: 'p-ctr', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Treasurer', office: 'TREASURER', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-admin', personId: 'p-admin', systemId: 'sys-media', title: 'Administrator', office: 'ADMINISTRATOR', status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  // The President also lends the Write letter to the Vice President for a few days (a delegation; the office already holds it).
  db.delegation.push({ id: 'del-vp', positionId: 'pos-choir', fromPersonId: 'p-choir-leader', toPersonId: 'p-vp', lettersJson: JSON.stringify({ MISSION: ['W'] }), status: 'ACTIVE', startDate: new Date('2022-01-01'), endDate: new Date('2099-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const status = async (as: string, id: string) => (await get(as, `${B}/${id}`)).body.plan?.status;

const F = '/api/funds';
const income = (amount: number, status = 'SECURED', extra: object = {}) => post('p-ctr', `${F}/income`, { systemId: 'sys-choir', kind: 'OTHER', label: 'Gift', amount, status, ...extra });
const plan = async (o: object = {}) => (await post('p-vp', B, {
  unitId: 'ou-choir', title: 'Harvest concert', aim: 'Thank God', needs: 'Sound', location: 'Hall', startsOn: '2026-11-08T07:00:00Z', endsOn: '2026-11-08T10:00:00Z',
  leaderId: 'p-vp', team: [], beyondUnit: false, visibility: 'SYSTEM', ...o,
})).body.plan.id as string;
const line = (id: string, amount = 100000, as = 'p-vp') => post(as, `${B}/${id}/lines`, { title: 'Sound hire', amount });
const aside = (id: string, sources: object[], as = 'p-vp') => put(as, `${B}/${id}/sources`, { sources });
const pool = async () => (await get('p-ctr', `${F}?systemId=sys-choir`)).body.pool;
const levels = async (id: string) => ((await get('p-vp', `${B}/${id}`)).body.plan.levels as Array<{ levelKey: string; status: string; note: string | null }>);
const funded = async (amount = 100000) => {
  await income(amount * 2);
  const id = await plan();
  await line(id, amount);
  await aside(id, [{ kind: 'OTHER', code: 'POOL', amount }]);
  return id;
};


const ENTRIES = '/api/money/entries';
const approvedPlan = async (o: object = {}, amount = 100000) => {
  await income(amount * 5);
  const id = await plan(o);
  await post('p-vp', `${B}/${id}/lines`, { title: 'Sound hire', amount });
  await post('p-vp', `${B}/${id}/lines`, { title: 'Tea', amount: 20000 });
  const m0 = (await get('p-vp', `${B}/${id}/money`)).body;
  await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: m0.planned }]);
  await post('p-vp', `${B}/${id}/submit`);
  await post('p-choir-leader', `${B}/${id}/approve`);
  const m = (await get('p-ctr', `${B}/${id}/money`)).body;
  for (const l of m.lines) await post('p-ctr', `${B}/${id}/lines/${l.id}/verify`, { verified: true });
  await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' });
  await post('p-pastor', `${B}/${id}/approve`);
  return id;
};
const moneyOf = async (id: string, as = 'p-vp') => (await get(as, `${B}/${id}/money`)).body;
const notices = (to: string) => (fake.__db.notification as any[]).filter((n) => n.toPersonId === to).map((n) => n.title as string);


const done = async (id: string) => { return post('p-vp', `${B}/${id}/close`, { outcome: 'Went well' }); };
const spend = (planId: string, amount: number, status = 'APPROVED') => { const e = { id: `e-${fake.__db.moneyEntry.length + 1}`, planId, kind: 'SPENDING', status, amount, occurredOn: new Date() }; fake.__db.moneyEntry.push(e); return e; };
const fundraiser = (o: object = {}) => approvedPlan({ planType: 'EVENT', fundraising: true, fundTarget: 500000, ...o });
const poolRecords = () => (fake.__db.incomeRecord as any[]).filter((r) => r.planId);
const revenue = (id: string, amount: number, as = 'p-ctr') => post(as, `${B}/${id}/revenue`, { label: 'Tickets', amount });

describe('settlement rules', () => {
  it('works out net, outcome, due date and what goes back', () => {
    expect(projectedNet(500000, 120000)).toBe(380000);
    expect(netOf(300000, 120000)).toBe(180000);
    expect(outcomeOf(1)).toBe('PROFIT');
    expect(outcomeOf(-1)).toBe('DEFICIT');
    expect(outcomeOf(0)).toBe('EVEN');
    expect(underBudget(120000, 50000)).toBe(70000);
    expect(underBudget(100, 150)).toBe(0);
    const at = new Date('2026-01-01T00:00:00Z');
    expect(SETTLE_DAYS).toBe(30);
    expect(settleDue(at).toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(settlementLapsed({ doneAt: at }, new Date('2026-02-01T00:00:00Z'))).toBe(true);
    expect(settlementLapsed({ doneAt: at, settledAt: at }, new Date('2026-03-01T00:00:00Z'))).toBe(false);
    expect(fundraisingProblem(true, 0, 'EVENT')).toBe('TARGET_NEEDED');
    expect(fundraisingProblem(true, 10, 'PROJECT')).toBe('FUNDRAISING_EVENT_ONLY');
    expect(fundraisingProblem(false, null, 'PROJECT')).toBeNull();
  });
});

describe('fundraising (slice 7 gate)', () => {
  it('an event can be a fundraiser only with a target', async () => {
    const base = { unitId: 'ou-choir', title: 'Gala', aim: 'x', leaderId: 'p-vp', team: [], beyondUnit: false, visibility: 'SYSTEM', planType: 'EVENT', fundraising: true };
    expect((await post('p-vp', B, base)).body.code).toBe('TARGET_NEEDED');
    expect((await post('p-vp', B, { ...base, planType: 'PROJECT', fundTarget: 100 })).body.code).toBe('FUNDRAISING_EVENT_ONLY');
    const ok = await post('p-vp', B, { ...base, fundTarget: 100 });
    expect(ok.status).toBe(201);
    expect(ok.body.plan.fundraising).toBe(true);
    expect(ok.body.plan.fundTarget).toBe(100);
  });

  it('the Church Leader sees target minus expenses as the projected net', async () => {
    await income(600000);
    const id = await plan({ planType: 'EVENT', fundraising: true, fundTarget: 500000 });
    await line(id, 100000);
    const v = (await get('p-vp', `${B}/${id}/money`)).body;
    expect(v.fundraising.target).toBe(500000);
    expect(v.fundraising.projectedNet).toBe(500000 - v.planned);
  });

  it('only the Treasurer logs revenue, and only on an approved fundraiser', async () => {
    const id = await fundraiser();
    expect((await revenue(id, 1000, 'p-vp')).status).toBe(403);
    expect((await revenue(id, 0)).body.code).toBe('AMOUNT');
    expect((await revenue(id, 1000)).status).toBe(201);
    const plain = await approvedPlan({ title: 'Plain' });
    expect((await revenue(plain, 1000)).body.code).toBe('NOT_FUNDRAISING');
    expect((await moneyOf(id)).fundraising.revenueTotal).toBe(1000);
  });

  it('net profit is added to the general pool when the event is Done', async () => {
    const id = await fundraiser();
    await revenue(id, 300000);
    spend(id, 120000);
    const before = (await pool()).secured;
    expect((await done(id)).status).toBe(200);
    const rec = poolRecords();
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ kind: 'OTHER', code: 'POOL', status: 'SECURED', amount: 180000 });
    expect(rec[0].label).toContain('Fundraising profit');
    expect((await pool()).secured).toBe(before + 180000);
    // revenue logged later while the period is open moves the net
    await revenue(id, 20000);
    expect(poolRecords()[0].amount).toBe(200000);
  });

  it('a deficit is flagged and taken from the pool', async () => {
    const id = await fundraiser();
    await revenue(id, 50000);
    spend(id, 120000);
    const before = (await pool()).secured;
    await done(id);
    expect(poolRecords()[0].amount).toBe(-70000);
    expect(poolRecords()[0].label).toContain('Fundraising deficit');
    expect((await pool()).secured).toBe(before - 70000);
    expect(notices('p-pastor').some((t) => t.startsWith('Fundraising deficit'))).toBe(true);
  });

  it('a pool that cannot cover the loss shows negative and tells the Church Leader, never refusing', async () => {
    const id = await fundraiser();
    spend(id, 900000);
    expect((await done(id)).status).toBe(200);
    expect((await pool()).secured).toBeLessThan(0);
    expect(notices('p-pastor').some((t) => t.startsWith('The general pool is negative'))).toBe(true);
  });

  it('spending recorded while the period is open keeps the net up to date', async () => {
    const { flagOverspend } = await import('../src/routes/planMoney.js');
    const id = await fundraiser();
    await revenue(id, 300000);
    spend(id, 100000);
    await done(id);
    expect(poolRecords()[0].amount).toBe(200000);
    const e = spend(id, 10000);
    await flagOverspend(id, 'p-ctr', e);
    expect(poolRecords()).toHaveLength(1);
    expect(poolRecords()[0].amount).toBe(190000);
  });
});

describe('settlement (slice 7 gate)', () => {
  const sourcesTotal = (id: string) => (fake.__db.planSource as any[]).filter((s) => s.planId === id).reduce((n, s) => n + s.amount, 0);

  it('a Done activity stays open; the Treasurer finalizes and unspent money returns to its sources', async () => {
    const id = await approvedPlan();
    expect((await post('p-ctr', `${B}/${id}/finalize`)).body.code).toBe('NOT_DONE');
    spend(id, 50000);
    await done(id);
    const open = await moneyOf(id, 'p-ctr');
    expect(open.settlement.open).toBe(true);
    expect(open.settlement.canFinalize).toBe(true);
    expect(open.settlement.toRelease).toBe(70000);
    expect((await post('p-vp', `${B}/${id}/finalize`)).status).toBe(403);
    const before = (await pool()).available;
    const r = await post('p-ctr', `${B}/${id}/finalize`);
    expect(r.body.released).toBe(70000);
    expect(sourcesTotal(id)).toBe(50000);
    expect((await pool()).available).toBe(before + 70000);
    expect(notices('p-pastor').some((t) => t.startsWith('Closed under budget'))).toBe(true);
    expect((await post('p-ctr', `${B}/${id}/finalize`)).body.code).toBe('SETTLED');
    expect((await moneyOf(id, 'p-ctr')).settlement.settled).toBe(true);
  });

  it('the Treasurer can still record while the period is open, and the period ending settles by itself', async () => {
    const id = await approvedPlan();
    await done(id);
    (fake.__db.workPlan as any[]).find((p) => p.id === id).doneAt = new Date(Date.now() - 40 * 86_400_000);
    expect((await pool()).secured).toBeGreaterThan(0);
    const row = (fake.__db.workPlan as any[]).find((p) => p.id === id);
    expect(row.settledAt).toBeTruthy();
    expect(sourcesTotal(id)).toBe(0);
  });

  it('an invoice after settlement is recorded, flagged, charged to the pool and told to the Church Leader', async () => {
    const { flagOverspend } = await import('../src/routes/planMoney.js');
    const id = await approvedPlan();
    spend(id, 100000);
    await done(id);
    await post('p-ctr', `${B}/${id}/finalize`);
    const before = (await pool()).secured;
    const e = spend(id, 20000);
    await flagOverspend(id, 'p-ctr', e);
    const rec = poolRecords().filter((r) => r.label.startsWith('Post-settlement invoice'));
    expect(rec).toHaveLength(1);
    expect(rec[0].amount).toBe(-20000);
    expect((await pool()).secured).toBe(before - 20000);
    expect(notices('p-pastor').some((t) => t.startsWith('Post-settlement invoice'))).toBe(true);
  });
});
