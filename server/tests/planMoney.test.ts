import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { adjustLevels, afterEdit, figures, submitProblem } from '../src/money/planMoney';
import { earmarkProblem, computePots } from '../src/money/funds';
import { cycleKey, cycleProblem, cyclesOf, isOngoing, multiplierOf, overspendByCycle, reduceSources, releasedOnShorten } from '../src/money/cycles';
import { amendProblem, classify, reserveOf, touchedLines } from '../src/money/amendments';

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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'workPlan', 'workPlanNote', 'workPlanCheck', 'workPlanMilestone', 'workPlanRegistration', 'workPlanReview', 'workPlanIndicator', 'workPlanMeasure', 'incomeRecord', 'planSource', 'moneyPlanItem', 'contributionList', 'contributionLine', 'donation', 'systemSetting', 'budgetAmendment', 'planRenewal', 'moneyAccount', 'moneyEntry']) db[k] ??= [];
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

describe('money rules', () => {
  it('figures, gap, and the submit condition', () => {
    expect(figures([{ id: 'a', amount: 70, status: 'PLANNED' }, { id: 'b', amount: 30, status: 'DROPPED' }], [{ amount: 50 }])).toEqual({ planned: 70, earmarked: 50, gap: 20 });
    expect(submitProblem(100, 100)).toBeNull();
    expect(submitProblem(100, 60)).toBe('FUNDING_GAP');
    expect(submitProblem(0, 0)).toBeNull();
    expect(afterEdit('VERIFIED')).toBe('MODIFIED');
    expect(afterEdit(null)).toBeNull();
  });
  it('earmarks never exceed what is secured; pledged is not available', () => {
    const pots = computePots({ own: [], donationsSecured: 0, records: [{ kind: 'OTHER', code: 'POOL', amount: 500, status: 'SECURED' }, { kind: 'OTHER', code: 'POOL', amount: 900, status: 'PLEDGED' }], earmarks: [] });
    expect(earmarkProblem(pots, [{ kind: 'OTHER', code: 'POOL', amount: 500 }])).toBeNull();
    expect(earmarkProblem(pots, [{ kind: 'OTHER', code: 'POOL', amount: 501 }])).toMatchObject({ code: 'INSUFFICIENT_FUNDS', available: 500, pledged: 900 });
  });
  it('treasurer step is added when spending appears, removed when it goes, and reset by a change', () => {
    const base = [{ levelKey: 'UNIT' as const, label: 'President', systemId: 's', status: 'APPROVED' as const, byId: 'x', at: 'y', note: null }, { levelKey: 'CHURCH' as const, label: 'Church Leader', systemId: 's', status: 'PENDING' as const, byId: null, at: null, note: null }];
    const added = adjustLevels(base, 100, true, 's');
    expect(added.levels.map((l) => l.levelKey)).toEqual(['UNIT', 'TREASURER', 'CHURCH']);
    const checked = added.levels.map((l) => (l.levelKey === 'TREASURER' ? { ...l, status: 'APPROVED' as const, byId: 't' } : l));
    expect(adjustLevels(checked, 100, true, 's').pulledBack).toBe(true);
    expect(adjustLevels(checked, 0, true, 's').levels.map((l) => l.levelKey)).toEqual(['UNIT', 'CHURCH']);
  });
});

describe('funds (slice 3 gate)', () => {
  it('over-earmark is refused, pledged cannot be earmarked, and the balance updates at once', async () => {
    const pledged = (await income(300000, 'PLEDGED')).body;
    expect(pledged.record?.status ?? 'PLEDGED').toBe('PLEDGED');
    const id = await plan();
    await line(id, 50000);
    expect((await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 50000 }])).body.code).toBe('INSUFFICIENT_FUNDS'); // pledged only
    await income(80000);
    expect((await pool()).available).toBe(80000);
    const over = await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 80001 }]);
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(over.body.available).toBe(80000);
    expect((await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 50000 }])).status).toBe(200);
    expect((await pool()).available).toBe(30000);
    // saving the same list again does not double count
    expect((await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 50000 }])).status).toBe(200);
    expect((await pool()).available).toBe(30000);
  });
  it('a pledge becomes money once it is received; a cancelled pledge is gone', async () => {
    const rec = (await income(40000, 'PLEDGED')).body;
    const rid = rec.record?.id ?? rec.id;
    expect((await pool()).available).toBe(0);
    expect((await post('p-ctr', `${F}/income/${rid}/received`)).status).toBe(200);
    expect((await pool()).available).toBe(40000);
  });
  it('only the treasurer records income', async () => {
    expect((await post('p-vp', `${F}/income`, { systemId: 'sys-choir', kind: 'OTHER', label: 'Gift', amount: 10, status: 'SECURED' })).status).toBe(403);
  });
});

describe('money on the page (slice 4 gates)', () => {
  it('a plan with a gap cannot be submitted; with it closed it can, and the Treasurer step is in the chain', async () => {
    await income(500000);
    const id = await plan();
    await line(id, 100000);
    const gap = await post('p-vp', `${B}/${id}/submit`);
    expect(gap.status).toBe(409);
    expect(gap.body.code).toBe('FUNDING_GAP');
    await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 100000 }]);
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
    expect((await levels(id)).map((l) => l.levelKey)).toEqual(['UNIT', 'TREASURER', 'CHURCH']);
  });
  it('a plan with no spending skips the check', async () => {
    const id = await plan();
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
    expect((await levels(id)).map((l) => l.levelKey)).toEqual(['UNIT', 'CHURCH']);
  });
  it('an edited line loses its tick and the activity goes back to the Treasurer', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const m = (await get('p-ctr', `${B}/${id}/money`)).body;
    expect(m.canCheck).toBe(true);
    // the Treasurer cannot approve generically
    expect((await post('p-ctr', `${B}/${id}/approve`)).body.code).toBe('USE_MONEY_CHECK');
    // cannot answer until every line is ticked
    expect((await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' })).body.code).toBe('LINES_NOT_VERIFIED');
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    expect((await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' })).status).toBe(200);
    expect((await levels(id)).find((l) => l.levelKey === 'TREASURER')?.status).toBe('APPROVED');
    // an edit while it waits for the Church Leader
    const edited = await patch('p-vp', `${B}/${id}/lines/${m.lines[0].id}`, { amount: 90000 });
    expect(edited.status).toBe(200);
    expect(edited.body.lines[0].checkState).toBe('MODIFIED');
    expect((await levels(id)).find((l) => l.levelKey === 'TREASURER')?.status).toBe('PENDING');
    // the Treasurer's step is open again, so the Church Leader cannot decide yet
    expect((await post('p-pastor', `${B}/${id}/approve`)).status).toBe(403);
  });
  it('a flag does not stop approval, but going over it needs a reason in the history', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    expect((await post('p-ctr', `${B}/${id}/money-check`, { result: 'FLAGGED' })).body.code).toBe('NOTE_REQUIRED');
    expect((await post('p-ctr', `${B}/${id}/money-check`, { result: 'FLAGGED', note: 'Quote looks high' })).status).toBe(200);
    const bare = await post('p-pastor', `${B}/${id}/approve`);
    expect(bare.body.code).toBe('FLAG_REASON_REQUIRED');
    expect((await post('p-pastor', `${B}/${id}/approve`, { note: 'Agreed with the supplier' })).status).toBe(200);
    expect((await levels(id)).find((l) => l.levelKey === 'CHURCH')?.note).toContain("Over the Treasurer's flag");
    expect(await status('p-vp', id)).toBe('RUNNING');
  });
  it('money is locked once approved', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const m = (await get('p-ctr', `${B}/${id}/money`)).body;
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' });
    await post('p-pastor', `${B}/${id}/approve`);
    const locked = await line(id, 1000);
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('MONEY_LOCKED');
  });
  it('the Treasurer queue lists what waits for a check', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const q = (await get('p-ctr', `${B}/money-queue`)).body.items;
    expect(q.map((x: { id: string }) => x.id)).toEqual([id]);
    expect((await get('p-vp', `${B}/money-queue`)).body.items).toEqual([]);
  });
});

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

describe('amendment rules', () => {
  it('a transfer keeps the total; an increase raises it; reservations are only the extra', () => {
    expect(classify(100, 100)).toBe('TRANSFER');
    expect(classify(100, 90)).toBe('TRANSFER');
    expect(classify(100, 101)).toBe('INCREASE');
    expect(reserveOf([{ kind: 'OTHER', code: 'POOL', amount: 100 }], [{ kind: 'OTHER', code: 'POOL', amount: 150 }])).toEqual([{ kind: 'OTHER', code: 'POOL', amount: 50 }]);
    expect(reserveOf([{ kind: 'OTHER', code: 'POOL', amount: 100 }], [{ kind: 'OTHER', code: 'POOL', amount: 80 }])).toEqual([]);
    const old = [{ id: 'a', title: 'Venue', amount: 500 }, { id: 'b', title: 'Catering', amount: 500 }];
    const t = touchedLines(old, [{ id: 'a', title: 'Venue', amount: 0 + 1 }, { id: 'b', title: 'Catering', amount: 500 }, { title: 'New', amount: 5 }]);
    expect(t.keep).toEqual(['b']);
    expect(t.changed.length).toBe(2);
    expect(amendProblem(old, old, [{ kind: 'OTHER', code: 'POOL', amount: 1000 }])).toBe('NO_CHANGE');
    expect(amendProblem(old, [{ id: 'a', title: 'Venue', amount: 400 }, { id: 'b', title: 'Catering', amount: 600 }], [{ kind: 'OTHER', code: 'POOL', amount: 900 }])).toBe('GAP');
  });
});

describe('lock and amendments (slice 5 gate)', () => {
  it('an approved plan’s money cannot be edited, only amended: a transfer is approved by the President and listed for the monthly review', async () => {
    const id = await approvedPlan();
    expect((await line(id, 1)).body.code).toBe('MONEY_LOCKED');
    expect((await aside(id, [])).body.code).toBe('MONEY_LOCKED');
    const m = await moneyOf(id);
    expect(m.locked).toBe(true);
    expect(m.canRequestAmendment).toBe(true);
    const moved = [{ id: m.lines[0].id, title: 'Sound hire', amount: 90000 }, { id: m.lines[1].id, title: 'Tea', amount: 30000 }];
    const keep = m.sources.map((s: any) => ({ kind: s.kind, code: s.code, amount: s.amount }));
    expect((await post('p-vp', `${B}/${id}/amendments`, { lines: moved, sources: keep, justification: '' })).status).toBe(400);
    const asked = await post('p-vp', `${B}/${id}/amendments`, { lines: moved, sources: keep, justification: 'Tea costs more' });
    expect(asked.status).toBe(201);
    expect(asked.body.pendingAmendment.kind).toBe('TRANSFER');
    expect((await post('p-vp', `${B}/${id}/amendments`, { lines: moved, sources: keep, justification: 'again' })).body.code).toBe('AMENDMENT_OPEN');
    expect(notices('p-choir-leader').some((t) => t.startsWith('Budget transfer to approve'))).toBe(true);
    const aid = asked.body.pendingAmendment.id;
    expect((await post('p-vp', `${B}/${id}/amendments/${aid}/approve`)).status).toBe(403);
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${aid}/approve`)).status).toBe(200);
    const after = await moneyOf(id);
    expect(after.planned).toBe(120000);
    expect(after.lines.map((l: any) => l.checkState)).toEqual(['MODIFIED', 'MODIFIED']);
    expect(after.pendingAmendment).toBeNull();
    expect(await status('p-vp', id)).toBe('RUNNING');
    const review = (await get('p-pastor', `${B}/transfers-review`)).body.items;
    expect(review.length).toBe(1);
    expect((await get('p-vp', `${B}/transfers-review`)).body.items).toEqual([]);
    expect((await post('p-pastor', `${B}/amendments/${review[0].id}/reviewed`)).status).toBe(200);
    expect((await get('p-pastor', `${B}/transfers-review`)).body.items).toEqual([]);
  });

  it('an increase goes to the Church Leader and holds its extra back while open; a rejection releases it', async () => {
    const id = await approvedPlan();
    const m = await moneyOf(id);
    const before = (await pool()).available;
    const lines = [{ id: m.lines[0].id, title: 'Sound hire', amount: 150000 }, { id: m.lines[1].id, title: 'Tea', amount: 20000 }];
    const sources = [{ kind: 'OTHER', code: 'POOL', amount: 170000 }];
    expect((await post('p-vp', `${B}/${id}/amendments`, { lines, sources: [{ kind: 'OTHER', code: 'POOL', amount: 120000 }], justification: 'More' })).body.code).toBe('FUNDING_GAP');
    const asked = await post('p-vp', `${B}/${id}/amendments`, { lines, sources, justification: 'Bigger hall' });
    expect(asked.body.pendingAmendment.kind).toBe('INCREASE');
    expect((await pool()).available).toBe(before - 50000);
    const aid = asked.body.pendingAmendment.id;
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${aid}/approve`)).body.code).toBe('FORBIDDEN');
    expect((await post('p-pastor', `${B}/${id}/amendments/${aid}/reject`, {})).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-pastor', `${B}/${id}/amendments/${aid}/reject`, { reason: 'Not now' })).status).toBe(200);
    expect((await pool()).available).toBe(before);
    const again = await post('p-vp', `${B}/${id}/amendments`, { lines, sources, justification: 'Bigger hall' });
    expect((await post('p-pastor', `${B}/${id}/amendments/${again.body.pendingAmendment.id}/approve`)).status).toBe(200);
    expect((await pool()).available).toBe(before - 50000);
    expect((await moneyOf(id)).planned).toBe(170000);
  });

  it('a second request cannot reserve more than what remains', async () => {
    const id = await approvedPlan();
    const other = await approvedPlan({ title: 'Second' });
    const free = (await pool()).available;
    const m = await moneyOf(id);
    const mk = (extra: number, mm: any) => ({ lines: [{ id: mm.lines[0].id, title: 'Sound hire', amount: 100000 + extra }, { id: mm.lines[1].id, title: 'Tea', amount: 20000 }], sources: [{ kind: 'OTHER', code: 'POOL', amount: 120000 + extra }], justification: 'More' });
    expect((await post('p-vp', `${B}/${id}/amendments`, mk(free - 1000, m))).status).toBe(201);
    const m2 = await moneyOf(other);
    const second = await post('p-vp', `${B}/${other}/amendments`, mk(5000, m2));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('spending past the total is recorded and flagged, never refused', async () => {
    const id = await approvedPlan();
    (fake.__db.moneyAccount as any[]).push({ id: 'acc-choir', orgUnitId: 'ou-choir', systemId: 'sys-choir', name: 'Cash', status: 'ACTIVE' });
    const spend = (amount: number) => post('p-ctr', ENTRIES, { accountId: 'acc-choir', kind: 'SPENDING', amount, occurredOn: '2026-11-08', category: 'EVENT', planId: id });
    expect((await spend(100000)).status).toBe(201);
    expect(notices('p-choir-leader').some((t) => t.startsWith('Over plan'))).toBe(false);
    expect((await spend(35000)).status).toBe(201);
    expect(notices('p-choir-leader')).toContain('Over plan by 15,000: Harvest concert');
    const m = await moneyOf(id);
    expect(m.actual).toBe(135000);
    expect(m.over).toBe(15000);
  });
});

const repeatBody = (o: object = {}) => ({ timingKind: 'REPEAT', repeat: { kind: 'WEEKLY', days: [2] }, startsOn: '2026-11-03T00:00:00Z', endsOn: '2026-11-24T00:00:00Z', ...o });

describe('cycle rules', () => {
  const base = { timingKind: 'REPEAT', startsOn: '2026-11-03T00:00:00Z', endsOn: '2026-11-24T00:00:00Z', repeatJson: JSON.stringify({ kind: 'WEEKLY', days: [2] }), planType: 'EVENT' };
  it('a repeat needs a cycle and a length; no end means a program with a monthly budget', () => {
    expect(cycleProblem({ ...base })).toBe('CYCLE_REQUIRED');
    expect(cycleProblem({ ...base, budgetCycle: 'PER_OCCURRENCE' })).toBeNull(); // length from its last day
    expect(cycleProblem({ ...base, endsOn: null, budgetCycle: 'PER_OCCURRENCE' })).toBe('ONGOING_NEEDS_PROGRAM');
    expect(cycleProblem({ ...base, endsOn: null, planType: 'PROGRAM', budgetCycle: 'MONTHLY' })).toBeNull();
    expect(cycleProblem({ ...base, endsOn: null, planType: 'PROGRAM', budgetCycle: 'QUARTERLY' })).toBe('CYCLE_REQUIRED');
    expect(cycleProblem({ ...base, timingKind: 'DATE' })).toBeNull();
    expect(isOngoing({ ...base, endsOn: null, planType: 'PROGRAM', budgetCycle: 'MONTHLY' })).toBe(true);
  });
  it('counts cycles from the end date or the stated number; the total is allowance times cycles', () => {
    expect(cyclesOf({ ...base, budgetCycle: 'PER_OCCURRENCE' })).toBe(4);
    expect(cyclesOf({ ...base, budgetCycle: 'MONTHLY' })).toBe(1);
    expect(cyclesOf({ ...base, budgetCycle: 'MONTHLY', budgetCycles: 6 })).toBe(6);
    expect(multiplierOf({ ...base, budgetCycle: 'PER_OCCURRENCE' })).toBe(4);
    expect(multiplierOf({ ...base, timingKind: 'DATE', budgetCycle: 'PER_OCCURRENCE' })).toBe(1);
  });
  it('each spending entry is compared with the allowance of its own cycle', () => {
    const occ = ['2026-11-03', '2026-11-10', '2026-11-17'];
    expect(cycleKey('PER_OCCURRENCE', '2026-11-12', occ)).toBe('2026-11-10');
    expect(cycleKey('MONTHLY', '2026-11-12')).toBe('2026-11');
    expect(cycleKey('QUARTERLY', '2026-11-12')).toBe('2026-Q4');
    const r = overspendByCycle([{ amount: 12000, day: '2026-11-03' }, { amount: 4000, day: '2026-11-10' }], 10000, 'PER_OCCURRENCE', occ);
    expect(r.map((c) => c.over)).toEqual([2000, 0]);
  });
  it('shortening gives back the unused cycles, last source first', () => {
    expect(releasedOnShorten(10000, 6, 4)).toBe(20000);
    expect(reduceSources([{ amount: 30000 }, { amount: 40000 }], 50000)).toEqual([{ amount: 20000 }]);
  });
});

describe('repeats and ongoing programs (slice 6 gate)', () => {
  it('a repeat cannot hold spending without a cycle and a length', async () => {
    await income(1000000);
    const id = await plan(repeatBody({ endsOn: null }));
    expect((await line(id, 10000)).body.code).toBe('CYCLE_REQUIRED');
    expect((await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE' })).body.code).toBe('ONGOING_NEEDS_PROGRAM');
    const withEnd = await plan(repeatBody());
    expect((await put('p-vp', `${B}/${withEnd}/cycle`, { cycle: 'PER_OCCURRENCE' })).status).toBe(200);
    expect((await line(withEnd, 10000)).status).toBe(200);
  });

  it('the budget is the allowance times the cycles; the gap and submit follow', async () => {
    await income(1000000);
    const id = await plan(repeatBody());
    await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE' });
    await line(id, 10000);
    const m = await moneyOf(id);
    expect(m.cycle.cycles).toBe(4);
    expect(m.planned).toBe(40000);
    expect((await post('p-vp', `${B}/${id}/submit`)).body.code).toBe('FUNDING_GAP');
    expect((await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 40000 }])).status).toBe(200);
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
  });

  it('overspend is compared per cycle', async () => {
    await income(1000000);
    const id = await plan(repeatBody());
    await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE' });
    await line(id, 10000);
    await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 40000 }]);
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const m = await moneyOf(id, 'p-ctr');
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' });
    await post('p-pastor', `${B}/${id}/approve`);
    (fake.__db.moneyAccount as any[]).push({ id: 'acc-choir', orgUnitId: 'ou-choir', systemId: 'sys-choir', name: 'Cash', status: 'ACTIVE' });
    const spend = (amount: number, day: string) => post('p-ctr', ENTRIES, { accountId: 'acc-choir', kind: 'SPENDING', amount, occurredOn: day, category: 'EVENT', planId: id });
    expect((await spend(12000, '2026-11-03')).status).toBe(201); // total is under 40000 but this week is over its 10000
    expect(notices('p-choir-leader')).toContain('Over plan by 2,000: Harvest concert');
    const after = await moneyOf(id);
    expect(after.over).toBe(0);
    expect(after.perCycle[0]).toMatchObject({ key: '2026-11-03', spent: 12000, over: 2000 });
  });

  it('shortening asks first, then returns the unused cycles to the pool', async () => {
    await income(1000000);
    const id = await plan(repeatBody());
    await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE', cycles: 4 });
    await line(id, 10000);
    await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 40000 }]);
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const m = await moneyOf(id, 'p-ctr');
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' });
    await post('p-pastor', `${B}/${id}/approve`);
    const before = (await pool()).available;
    expect((await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE', cycles: 5 })).body.code).toBe('MONEY_LOCKED');
    const ask = await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE', cycles: 3 });
    expect(ask.body.code).toBe('CONFIRM_REQUIRED');
    expect(ask.body.release).toBe(10000);
    expect((await pool()).available).toBe(before);
    expect((await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE', cycles: 3, confirm: true })).status).toBe(200);
    expect((await pool()).available).toBe(before + 10000);
    expect((await moneyOf(id)).earmarked).toBe(30000);
  });

  it('an ongoing program is a program with a monthly budget; an unrenewed month shows Not released, and spending in it is flagged', async () => {
    await income(1000000);
    const id = await plan({ planType: 'PROGRAM', title: 'Discipleship', endsOn: null });
    expect((await put('p-vp', `${B}/${id}/cycle`, { cycle: 'MONTHLY' })).status).toBe(200);
    await line(id, 50000);
    expect((await moneyOf(id)).cycle.ongoing).toBe(true);
    expect((await aside(id, [{ kind: 'OTHER', code: 'POOL', amount: 50000 }])).status).toBe(200);
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const m = await moneyOf(id, 'p-ctr');
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' });
    await post('p-pastor', `${B}/${id}/approve`);
    const now = await moneyOf(id);
    expect(now.ongoingMonth.released).toBe(false);
    (fake.__db.moneyAccount as any[]).push({ id: 'acc-choir', orgUnitId: 'ou-choir', systemId: 'sys-choir', name: 'Cash', status: 'ACTIVE' });
    const today = new Date().toISOString().slice(0, 10);
    expect((await post('p-ctr', ENTRIES, { accountId: 'acc-choir', kind: 'SPENDING', amount: 5000, occurredOn: today, category: 'EVENT', planId: id })).status).toBe(201);
    expect(notices('p-pastor').some((t) => t.startsWith('Spending in a month that is not released'))).toBe(true);
    expect((await post('p-vp', `${B}/${id}/renew-month`)).status).toBe(403);
    expect((await post('p-pastor', `${B}/${id}/renew-month`)).status).toBe(200);
    expect((await post('p-pastor', `${B}/${id}/renew-month`)).body.code).toBe('ALREADY_RENEWED');
    expect((await moneyOf(id)).ongoingMonth.released).toBe(true);
  });
});
