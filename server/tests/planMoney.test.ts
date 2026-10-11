import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { adjustLevels, afterEdit, figures, submitProblem } from '../src/money/planMoney';
import { earmarkProblem, computePots } from '../src/money/funds';

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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'workPlan', 'workPlanNote', 'workPlanCheck', 'workPlanMilestone', 'workPlanRegistration', 'workPlanReview', 'workPlanIndicator', 'workPlanMeasure', 'incomeRecord', 'planSource', 'moneyPlanItem', 'contributionList', 'contributionLine', 'donation', 'systemSetting']) db[k] ??= [];
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
  // The Vice President may create work only while the President lends the Write letter.
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
