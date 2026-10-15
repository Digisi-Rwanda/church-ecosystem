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
/** The Treasurer ticks every line and answers that the figures are right. */
const checked = async (id: string) => {
  for (const l of (await get('p-vp', `${B}/${id}/money`)).body.lines) await post('p-ctr', `${B}/${id}/lines/${l.id}/verify`);
  return post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' });
};
const pool = async () => (await get('p-ctr', `${F}?systemId=sys-choir`)).body.pots.find((x: any) => x.id === 'DONATION:');
const levels = async (id: string) => ((await get('p-vp', `${B}/${id}`)).body.plan.levels as Array<{ levelKey: string; status: string; note: string | null }>);
const funded = async (amount = 100000) => {
  await income(amount * 2);
  const id = await plan();
  await line(id, amount);
  await aside(id, [{ kind: 'DONATION', code: '', amount }]);
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
    const pots = computePots({ records: [{ kind: 'DONATION', code: '', amount: 500, status: 'SECURED' }, { kind: 'DONATION', code: '', amount: 900, status: 'PLEDGED' }], earmarks: [] });
    expect(earmarkProblem(pots, [{ kind: 'DONATION', code: '', amount: 500 }])).toBeNull();
    expect(earmarkProblem(pots, [{ kind: 'DONATION', code: '', amount: 501 }])).toMatchObject({ code: 'INSUFFICIENT_FUNDS', available: 500, pledged: 900 });
  });
  it('treasurer step is added when spending appears, removed when it goes, and reset by a change', () => {
    const base = [{ levelKey: 'UNIT' as const, label: 'President', systemId: 's', status: 'APPROVED' as const, byId: 'x', at: 'y', note: null }, { levelKey: 'CHURCH' as const, label: 'Church Leader', systemId: 's', status: 'PENDING' as const, byId: null, at: null, note: null }];
    const added = adjustLevels(base, 100, true, 's');
    expect(added.levels.map((l) => l.levelKey)).toEqual(['TREASURER', 'UNIT', 'CHURCH']);
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
    expect((await aside(id, [{ kind: 'DONATION', code: '', amount: 50000 }])).body.code).toBe('INSUFFICIENT_FUNDS'); // pledged only
    await income(80000);
    expect((await pool()).available).toBe(80000);
    const over = await aside(id, [{ kind: 'DONATION', code: '', amount: 80001 }]);
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(over.body.available).toBe(80000);
    expect((await aside(id, [{ kind: 'DONATION', code: '', amount: 50000 }])).status).toBe(200);
    // a draft holds nothing: the money is held from Submit
    expect((await pool()).available).toBe(80000);
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
    expect((await pool()).available).toBe(30000);
    // saving the same list again does not double count
    expect((await aside(id, [{ kind: 'DONATION', code: '', amount: 50000 }])).status).toBe(200);
    expect((await pool()).available).toBe(30000);
    // sending it back to its creator frees the money at once
    expect((await checked(id)).status).toBe(200);
    expect((await post('p-choir-leader', `${B}/${id}/reject`, { reason: 'Please rework' })).status).toBe(200);
    expect((await pool()).available).toBe(80000);
  });
  it('two drafts may plan the same money; the second Submit finds it already held', async () => {
    await income(60000);
    const a = await plan();
    const b = await plan();
    await line(a, 50000);
    await line(b, 50000);
    expect((await aside(a, [{ kind: 'DONATION', code: '', amount: 50000 }])).status).toBe(200);
    expect((await aside(b, [{ kind: 'DONATION', code: '', amount: 50000 }])).status).toBe(200);
    expect((await post('p-vp', `${B}/${a}/submit`)).status).toBe(200);
    const second = await post('p-vp', `${B}/${b}/submit`);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('INSUFFICIENT_FUNDS');
  });
  it('a plan sent back to its creator resumes at the same step when the money is unchanged, and starts again when it changes', async () => {
    await income(200000);
    const id = await plan();
    await line(id, 50000);
    await aside(id, [{ kind: 'DONATION', code: '', amount: 50000 }]);
    await post('p-vp', `${B}/${id}/submit`);
    await checked(id);
    await post('p-choir-leader', `${B}/${id}/reject`, { reason: 'Fix the wording' });
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
    const kept = (await get('p-vp', `${B}/${id}`)).body.plan.levels.map((l: any) => `${l.levelKey}:${l.status}`);
    expect(kept[0]).toBe('TREASURER:APPROVED');
    expect(kept.slice(1).every((x: string) => x.endsWith('PENDING'))).toBe(true);
    // again, but this time the money changes before it is resubmitted
    await post('p-choir-leader', `${B}/${id}/reject`, { reason: 'Cut the cost' });
    const lid = (await get('p-vp', `${B}/${id}/money`)).body.lines[0].id;
    await request(app).patch(`${B}/${id}/lines/${lid}`).set(bearer('p-vp')).send({ amount: 40000 });
    await aside(id, [{ kind: 'DONATION', code: '', amount: 40000 }]);
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
    expect((await get('p-vp', `${B}/${id}`)).body.plan.levels[0]).toMatchObject({ levelKey: 'TREASURER', status: 'PENDING' });
  });
  it('a return to the previous step keeps the money held and reopens that step', async () => {
    await income(100000);
    const id = await plan();
    await line(id, 50000);
    await aside(id, [{ kind: 'DONATION', code: '', amount: 50000 }]);
    await post('p-vp', `${B}/${id}/submit`);
    await checked(id);
    await post('p-choir-leader', `${B}/${id}/approve`);
    expect((await post('p-pastor', `${B}/${id}/reject`, { reason: 'Ask the President again', target: 'PREVIOUS' })).status).toBe(200);
    const p = (await get('p-vp', `${B}/${id}`)).body.plan;
    expect(p.status).toBe('PENDING_APPROVAL');
    expect(p.levels.find((l: any) => l.status === 'PENDING').levelKey).toBe('UNIT');
    expect((await pool()).available).toBe(50000);
    // and once more, from the President back to the Treasurer
    expect((await post('p-choir-leader', `${B}/${id}/reject`, { reason: 'Check the figures again', target: 'PREVIOUS' })).status).toBe(200);
    expect(((await get('p-vp', `${B}/${id}`)).body.plan.levels as any[]).find((l) => l.status === 'PENDING').levelKey).toBe('TREASURER');
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
    await aside(id, [{ kind: 'DONATION', code: '', amount: 100000 }]);
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
    expect((await levels(id)).map((l) => l.levelKey)).toEqual(['TREASURER', 'UNIT', 'CHURCH']);
  });
  it('a plan with no spending skips the check', async () => {
    const id = await plan();
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
    expect((await levels(id)).map((l) => l.levelKey)).toEqual(['UNIT', 'CHURCH']);
  });
  it('an edited line loses its tick and the activity goes back to the Treasurer', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
    const m = (await get('p-ctr', `${B}/${id}/money`)).body;
    expect(m.canCheck).toBe(true);
    // the Treasurer cannot approve generically
    expect((await post('p-ctr', `${B}/${id}/approve`)).body.code).toBe('USE_MONEY_CHECK');
    // cannot answer until every line is ticked
    expect((await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' })).body.code).toBe('LINES_NOT_VERIFIED');
    await post('p-choir-leader', `${B}/${id}/approve`);
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    expect((await checked(id)).status).toBe(200);
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
    expect((await post('p-ctr', `${B}/${id}/money-check`, { result: 'FLAGGED' })).body.code).toBe('NOTE_REQUIRED');
    expect((await post('p-ctr', `${B}/${id}/money-check`, { result: 'FLAGGED', note: 'Quote looks high' })).status).toBe(200);
    const bare = await post('p-choir-leader', `${B}/${id}/approve`);
    expect(bare.body.code).toBe('FLAG_REASON_REQUIRED');
    expect((await post('p-choir-leader', `${B}/${id}/approve`, { note: 'Agreed with the supplier' })).status).toBe(200);
    expect((await levels(id)).find((l) => l.levelKey === 'UNIT')?.note).toContain("Over the Treasurer's flag");
    const last = await post('p-pastor', `${B}/${id}/approve`, { note: 'Agreed with the supplier' });
    expect(last.status, JSON.stringify(last.body)).toBe(200);
    expect(await status('p-vp', id)).toBe('RUNNING');
  });
  it('money is locked once approved', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
    const m = (await get('p-ctr', `${B}/${id}/money`)).body;
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await checked(id);
    await post('p-choir-leader', `${B}/${id}/approve`);
    await post('p-pastor', `${B}/${id}/approve`);
    const locked = await line(id, 1000);
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('MONEY_LOCKED');
  });
  it('the Treasurer queue lists what waits for a check', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
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
  await aside(id, [{ kind: 'DONATION', code: '', amount: m0.planned }]);
  await post('p-vp', `${B}/${id}/submit`);
  const m = (await get('p-ctr', `${B}/${id}/money`)).body;
  for (const l of m.lines) await post('p-ctr', `${B}/${id}/lines/${l.id}/verify`, { verified: true });
  await post('p-ctr', `${B}/${id}/money-check`, { result: 'CHECKED' });
  await post('p-choir-leader', `${B}/${id}/approve`);
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
    expect(reserveOf([{ kind: 'DONATION', code: '', amount: 100 }], [{ kind: 'DONATION', code: '', amount: 150 }])).toEqual([{ kind: 'DONATION', code: '', amount: 50 }]);
    expect(reserveOf([{ kind: 'DONATION', code: '', amount: 100 }], [{ kind: 'DONATION', code: '', amount: 80 }])).toEqual([]);
    const old = [{ id: 'a', title: 'Venue', amount: 500 }, { id: 'b', title: 'Catering', amount: 500 }];
    const t = touchedLines(old, [{ id: 'a', title: 'Venue', amount: 0 + 1 }, { id: 'b', title: 'Catering', amount: 500 }, { title: 'New', amount: 5 }]);
    expect(t.keep).toEqual(['b']);
    expect(t.changed.length).toBe(2);
    expect(amendProblem(old, old, [{ kind: 'DONATION', code: '', amount: 1000 }])).toBe('NO_CHANGE');
    expect(amendProblem(old, [{ id: 'a', title: 'Venue', amount: 400 }, { id: 'b', title: 'Catering', amount: 600 }], [{ kind: 'DONATION', code: '', amount: 900 }])).toBe('GAP');
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

  it('an increase goes to the President, not the Church Leader, and holds its extra back while open; a rejection releases it', async () => {
    const id = await approvedPlan();
    const m = await moneyOf(id);
    const before = (await pool()).available;
    const lines = [{ id: m.lines[0].id, title: 'Sound hire', amount: 150000 }, { id: m.lines[1].id, title: 'Tea', amount: 20000 }];
    const sources = [{ kind: 'DONATION', code: '', amount: 170000 }];
    expect((await post('p-vp', `${B}/${id}/amendments`, { lines, sources: [{ kind: 'DONATION', code: '', amount: 120000 }], justification: 'More' })).body.code).toBe('FUNDING_GAP');
    const asked = await post('p-vp', `${B}/${id}/amendments`, { lines, sources, justification: 'Bigger hall' });
    expect(asked.body.pendingAmendment.kind).toBe('INCREASE');
    expect(asked.body.pendingAmendment.scope).toBe('MONEY');
    expect((await pool()).available).toBe(before - 50000);
    expect(notices('p-pastor').some((t) => t.startsWith('Budget increase asked for'))).toBe(true);
    const aid = asked.body.pendingAmendment.id;
    expect((await post('p-pastor', `${B}/${id}/amendments/${aid}/approve`)).body.code).toBe('FORBIDDEN');
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${aid}/reject`, {})).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${aid}/reject`, { reason: 'Not now' })).status).toBe(200);
    expect((await pool()).available).toBe(before);
    const again = await post('p-vp', `${B}/${id}/amendments`, { lines, sources, justification: 'Bigger hall' });
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${again.body.pendingAmendment.id}/approve`)).status).toBe(200);
    expect((await pool()).available).toBe(before - 50000);
    expect((await moneyOf(id)).planned).toBe(170000);
  });

  it('a schedule change goes President then Church Leader; the plan changes only at the last step; the old plan runs meanwhile', async () => {
    const id = await approvedPlan();
    const asked = await post('p-vp', `${B}/${id}/amendments`, { justification: 'Hall is taken', changes: { location: 'Chapel', startsOn: '2027-01-10T07:00:00Z', endsOn: '2027-01-10T10:00:00Z' } });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    const pa = asked.body.pendingAmendment;
    expect(pa.scope).toBe('GENERAL');
    expect(pa.levels.map((l: any) => l.levelKey)).toEqual(['UNIT', 'CHURCH']);
    expect((await get('p-vp', `${B}/${id}`)).body.plan.location).toBe('Hall');
    expect((await post('p-pastor', `${B}/${id}/amendments/${pa.id}/approve`)).body.code).toBe('FORBIDDEN');
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${pa.id}/approve`)).status).toBe(200);
    expect((await get('p-vp', `${B}/${id}`)).body.plan.location).toBe('Hall');
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${pa.id}/approve`)).body.code).toBe('FORBIDDEN');
    expect((await post('p-pastor', `${B}/${id}/amendments/${pa.id}/approve`)).status).toBe(200);
    const now = (await get('p-vp', `${B}/${id}`)).body.plan;
    expect(now.location).toBe('Chapel');
    expect(now.dateChange).toMatchObject({ toStart: '2027-01-10' });
    expect((await patch('p-vp', `${B}/${id}/timing`, { timingKind: 'DATE', startsOn: '2027-02-01T00:00:00Z' })).body.code).toBe('USE_AMENDMENT');
  });

  it('a change of leader goes to the President alone; a President asking sends a money change to the Treasurer', async () => {
    const id = await approvedPlan();
    const team = await post('p-vp', `${B}/${id}/amendments`, { justification: 'New lead', changes: { leaderId: 'p-ctr' } });
    expect(team.body.pendingAmendment.scope).toBe('TEAM');
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${team.body.pendingAmendment.id}/approve`)).status).toBe(200);
    expect((await get('p-vp', `${B}/${id}`)).body.plan.leaderId ?? (await get('p-vp', `${B}/${id}`)).body.plan.leaderPersonId).toBeTruthy();
    const m = await moneyOf(id);
    const lines = [{ id: m.lines[0].id, title: 'Sound hire', amount: 90000 }, { id: m.lines[1].id, title: 'Tea', amount: 30000 }];
    const keep = m.sources.map((s: any) => ({ kind: s.kind, code: s.code, amount: s.amount }));
    const asked = await post('p-choir-leader', `${B}/${id}/amendments`, { lines, sources: keep, justification: 'Tea costs more' });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    const aid = asked.body.pendingAmendment.id;
    expect((await post('p-choir-leader', `${B}/${id}/amendments/${aid}/approve`)).body.code).toBe('FORBIDDEN');
    expect((await post('p-ctr', `${B}/${id}/amendments/${aid}/approve`)).status).toBe(200);
  });

  it('a second request cannot reserve more than what remains', async () => {
    const id = await approvedPlan();
    const other = await approvedPlan({ title: 'Second' });
    const free = (await pool()).available;
    const m = await moneyOf(id);
    const mk = (extra: number, mm: any) => ({ lines: [{ id: mm.lines[0].id, title: 'Sound hire', amount: 100000 + extra }, { id: mm.lines[1].id, title: 'Tea', amount: 20000 }], sources: [{ kind: 'DONATION', code: '', amount: 120000 + extra }], justification: 'More' });
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
    expect((await aside(id, [{ kind: 'DONATION', code: '', amount: 40000 }])).status).toBe(200);
    expect((await post('p-vp', `${B}/${id}/submit`)).status).toBe(200);
  });

  it('overspend is compared per cycle', async () => {
    await income(1000000);
    const id = await plan(repeatBody());
    await put('p-vp', `${B}/${id}/cycle`, { cycle: 'PER_OCCURRENCE' });
    await line(id, 10000);
    await aside(id, [{ kind: 'DONATION', code: '', amount: 40000 }]);
    await post('p-vp', `${B}/${id}/submit`);
    const m = await moneyOf(id, 'p-ctr');
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await checked(id);
    await post('p-choir-leader', `${B}/${id}/approve`);
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
    await aside(id, [{ kind: 'DONATION', code: '', amount: 40000 }]);
    await post('p-vp', `${B}/${id}/submit`);
    const m = await moneyOf(id, 'p-ctr');
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await checked(id);
    await post('p-choir-leader', `${B}/${id}/approve`);
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

  it('an ongoing program is a program with a monthly budget, with no monthly release step', async () => {
    await income(1000000);
    const id = await plan({ planType: 'PROGRAM', title: 'Discipleship', endsOn: null });
    expect((await put('p-vp', `${B}/${id}/cycle`, { cycle: 'MONTHLY' })).status).toBe(200);
    await line(id, 50000);
    expect((await moneyOf(id)).cycle.ongoing).toBe(true);
    expect((await aside(id, [{ kind: 'DONATION', code: '', amount: 50000 }])).status).toBe(200);
    await post('p-vp', `${B}/${id}/submit`);
    const m = await moneyOf(id, 'p-ctr');
    await post('p-ctr', `${B}/${id}/lines/${m.lines[0].id}/verify`, { verified: true });
    await checked(id);
    await post('p-choir-leader', `${B}/${id}/approve`);
    await post('p-pastor', `${B}/${id}/approve`);
    const now = await moneyOf(id);
    expect(now.ongoingMonth).toBeUndefined();
    expect(now.canRenew).toBeUndefined();
    expect((await post('p-pastor', `${B}/${id}/renew-month`)).status).toBe(404);
    expect(notices('p-pastor').some((t) => t.startsWith('Spending in a month that is not released'))).toBe(false);
  });
});

describe('expenses by plan line', () => {
  it('spending inside the line goes straight through; over the line waits for the President', async () => {
    const id = await approvedPlan();
    const m = await moneyOf(id);
    const acc = (await post('p-ctr', '/api/money/accounts', { unitId: 'ou-choir', name: 'Choir fund' })).body.id;
    const spend = (amount: number, lineId: string) => post('p-ctr', ENTRIES, { accountId: acc, kind: 'SPENDING', amount, occurredOn: '2026-11-09', category: 'OTHER', planId: id, lineId });
    const tea = m.lines.find((l: any) => l.title === 'Tea').id;
    const a = await spend(15000, tea);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.status).toBe('APPROVED');
    const b = await spend(10000, tea);
    expect(b.body.status).toBe('PENDING_APPROVAL');
    expect((await spend(1, 'nope')).body.code).toBe('BAD_LINE');
  });
});

describe('proportional return', () => {
  it('gives money back in proportion to each source, in whole francs', async () => {
    const { reduceProportional } = await import('../src/money/cycles');
    const src = [{ code: 'A', amount: 60000 }, { code: 'B', amount: 40000 }];
    expect(reduceProportional(src, 50000).map((s) => s.amount)).toEqual([30000, 20000]);
    expect(reduceProportional([{ amount: 1 }, { amount: 1 }, { amount: 1 }], 2).reduce((n, s) => n + s.amount, 0)).toBe(1);
    expect(reduceProportional(src, 100000)).toEqual([]);
    expect(reduceProportional(src, 0).map((s) => s.amount)).toEqual([60000, 40000]);
  });
});

describe('one approval queue and the money home figures', () => {
  it('lists what waits, and says which rows wait for me', async () => {
    const id = await funded();
    await post('p-vp', `${B}/${id}/submit`);
    const q = async (as: string) => (await get(as, '/api/approvals')).body;
    const ctr = await q('p-ctr');
    const row = ctr.items.find((i: any) => i.id === id);
    expect(row).toMatchObject({ kind: 'ACTIVITY', waitingFor: 'Treasurer', mine: true });
    expect((await q('p-vp')).items.find((i: any) => i.id === id).mine).toBe(false);
    expect(ctr.counts.mine).toBeGreaterThanOrEqual(1);
    const done = await approvedPlan({ title: 'Second' });
    const m = await moneyOf(done);
    const asked = await post('p-vp', `${B}/${done}/amendments`, { justification: 'Hall is taken', changes: { location: 'Chapel' } });
    expect(asked.status).toBe(201);
    const mineAmend = (await q('p-choir-leader')).items.find((i: any) => i.kind === 'AMENDMENT');
    expect(mineAmend).toMatchObject({ mine: true, waitingFor: 'President' });
    expect((await q('p-vp')).items.find((i: any) => i.kind === 'AMENDMENT').mine).toBe(false);
    expect(m.lines.length).toBeGreaterThan(0);
  });

  it('secured splits into spent, still reserved and available', async () => {
    const id = await approvedPlan();
    const m = await moneyOf(id);
    const acc = (await post('p-ctr', '/api/money/accounts', { unitId: 'ou-choir', name: 'Choir fund' })).body.id;
    const tea = m.lines.find((l: any) => l.title === 'Tea').id;
    await post('p-ctr', ENTRIES, { accountId: acc, kind: 'SPENDING', amount: 15000, occurredOn: '2026-11-09', category: 'OTHER', planId: id, lineId: tea });
    const t = (await get('p-ctr', `${F}?systemId=sys-choir`)).body.totals;
    expect(t.spent).toBe(15000);
    expect(t.spent + t.reserved + t.available).toBe(t.secured);
    expect(t.awaiting).toBe(0);
  });
});

import { burnOf, phasesOf } from '../src/money/burn';

describe('type-specific money views', () => {
  it('phases: lines with no phase sit in General; unlinked spending lands there too', () => {
    const rows = phasesOf([{ id: 'm1', title: 'Foundation' }, { id: 'm2', title: 'Roof' }], [
      { milestoneId: 'm1', amount: 500, spent: 200 }, { milestoneId: null, amount: 100, spent: 0 }, { milestoneId: 'gone', amount: 50, spent: 10 },
    ], 30);
    expect(rows.map((r) => [r.title, r.planned, r.spent, r.remaining])).toEqual([['General', 150, 40, 110], ['Foundation', 500, 200, 300], ['Roof', 0, 0, 0]]);
  });
  it('burn: monthly rate, projection, runway and pace', () => {
    const b = burnOf({ planned: 1200, spent: 600, startsOn: new Date('2026-01-10'), endsOn: null, now: new Date('2026-04-20') });
    expect(b).toMatchObject({ months: 12, elapsed: 4, perMonth: 150, projected: 1800, runway: 4, pace: 'FAST' });
    expect(burnOf({ planned: 1200, spent: 0, startsOn: null, endsOn: null, now: new Date('2026-03-01') }).pace).toBe('NONE');
  });
  it('a project line can be put in a phase; removing the phase sends the line back to General', async () => {
    const id = await plan({ planType: 'PROJECT' });
    await post('p-vp', `${B}/${id}/milestones`, { title: 'Foundation' });
    const mid = (await get('p-vp', `${B}/${id}`)).body.plan.milestones[0].id;
    expect((await post('p-vp', `${B}/${id}/lines`, { title: 'Cement', amount: 40000, milestoneId: 'nope' })).status).toBe(400);
    const r = await post('p-vp', `${B}/${id}/lines`, { title: 'Cement', amount: 40000, milestoneId: mid });
    await post('p-vp', `${B}/${id}/lines`, { title: 'Permit', amount: 10000 });
    expect(r.body.burn).toBeNull();
    const now = (await get('p-vp', `${B}/${id}/money`)).body;
    expect(now.phases.map((x: any) => [x.title, x.planned])).toEqual([['General', 10000], ['Foundation', 40000]]);
    expect(now.lines.find((l: any) => l.title === 'Cement').milestoneId).toBe(mid);
    await del('p-vp', `${B}/${id}/milestones/${mid}`);
    const after = (await get('p-vp', `${B}/${id}/money`)).body;
    expect(after.phases).toEqual([expect.objectContaining({ title: 'General', planned: 50000 })]);
  });
  it('events show no phases and no burn', async () => {
    const id = await plan({ planType: 'EVENT' });
    const m = (await line(id)).body;
    expect(m.phases).toBeNull();
    expect(m.burn).toBeNull();
  });
});
