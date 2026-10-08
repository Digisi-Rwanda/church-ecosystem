import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { buildLevels, publishProblem, stateProblem } from '../src/work/plan';

describe('plan rules', () => {
  it('levels: the unit, plus the church when the work reaches beyond the unit; central work needs only the church', () => {
    expect(buildLevels('sys-choir', false, 'Choir').map((l) => l.levelKey)).toEqual(['UNIT']);
    expect(buildLevels('sys-choir', true, 'Choir').map((l) => l.levelKey)).toEqual(['UNIT', 'CHURCH']);
    expect(buildLevels('sys-main', false, 'Central').map((l) => l.levelKey)).toEqual(['CHURCH']);
  });
  it('moves are allowed only from the right state', () => {
    expect(stateProblem('submit', 'DRAFT')).toBeNull();
    expect(stateProblem('submit', 'SETUP')).toBe('WRONG_STATE');
    expect(stateProblem('start', 'SETUP')).toBeNull();
    expect(stateProblem('close', 'DRAFT')).toBe('WRONG_STATE');
    expect(stateProblem('cancel', 'ENDED')).toBe('WRONG_STATE');
    expect(stateProblem('delete', 'PENDING_APPROVAL')).toBe('WRONG_STATE');
  });
  it('the report needs all three parts and a finished checklist', () => {
    const full = { planningSummary: 'a', executionSummary: 'b', outcome: 'c' };
    expect(publishProblem({ ...full, outcome: ' ' }, [])).toBe('REPORT_INCOMPLETE');
    expect(publishProblem(full, [{ done: true }, { done: false }])).toBe('CHECKLIST_OPEN');
    expect(publishProblem(full, [{ done: true }])).toBeNull();
  });
});

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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'workPlan', 'workPlanNote', 'workPlanCheck']) db[k] ??= [];
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
  db.person.push({ id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' }, { id: 'p-admin', fullName: 'Administrator', status: 'ACTIVE' });
  db.position.push(
    { id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-admin', personId: 'p-admin', systemId: 'sys-media', title: 'Administrator', office: 'ADMINISTRATOR', status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  // The Vice President may create work only while the President lends the Write letter.
  db.delegation.push({ id: 'del-vp', positionId: 'pos-choir', fromPersonId: 'p-choir-leader', toPersonId: 'p-vp', lettersJson: JSON.stringify({ MISSION: ['W'] }), status: 'ACTIVE', startDate: new Date('2022-01-01'), endDate: new Date('2099-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const body = (o: object = {}) => ({
  unitId: 'ou-choir', title: 'Harvest concert', aim: 'Thank God for the harvest', needs: 'Sound system', location: 'Main hall',
  startsOn: '2026-11-08T07:00:00Z', endsOn: '2026-11-08T10:00:00Z', leaderId: 'p-vp',
  team: [{ personId: 'p-choir-member', role: 'Lead singer' }], beyondUnit: false, visibility: 'SYSTEM', ...o,
});
const draft = async (o: object = {}, as = 'p-vp') => (await post(as, B, body(o))).body.plan?.id as string;
const approved = async (o: object = {}) => {
  const id = await draft(o);
  await post('p-vp', `${B}/${id}/submit`);
  await post('p-choir-leader', `${B}/${id}/approve`);
  if ((o as { beyondUnit?: boolean }).beyondUnit) await post('p-pastor', `${B}/${id}/approve`);
  return id;
};
const running = async (o: object = {}) => {
  const id = await approved(o);
  await post('p-vp', `${B}/${id}/start`);
  return id;
};
const closing = async () => {
  const id = await running();
  await post('p-vp', `${B}/${id}/close`);
  return id;
};
const status = async (as: string, id: string) => (await get(as, `${B}/${id}`)).body.plan?.status;

describe('drafting', () => {
  it('needs sign-in, a unit with a system, W, active people and sane dates', async () => {
    expect((await request(app).post(B).send({})).status).toBe(401);
    expect((await post('p-vp', B, {})).status).toBe(400);
    expect((await post('p-vp', B, body({ unitId: 'ou-zzz' }))).status).toBe(404);
    expect((await post('p-choir-member', B, body())).status).toBe(403);
    expect((await post('p-vp', B, body({ endsOn: '2026-11-01T00:00:00Z' }))).body.code).toBe('BAD_DATES');
    expect((await post('p-vp', B, body({ leaderId: 'p-zzz' }))).body.code).toBe('PERSON_NOT_ACTIVE');
  });
  it('creates a draft, audited, with the team and a leader', async () => {
    const r = await post('p-vp', B, body());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.plan).toMatchObject({ status: 'DRAFT', unitName: 'Choir', canEdit: true, canSubmit: true, canApprove: false });
    expect(r.body.plan.team).toHaveLength(1);
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'WORKPLAN_CREATED')).toBe(true);
  });
  it('a plan is a Program, an Event or a Project; lists filter by type and an edit keeps the type', async () => {
    const ev = await draft({ planType: 'EVENT', title: 'Concert night' });
    await draft({ planType: 'PROGRAM', title: 'Discipleship' });
    await draft({ title: 'Plain' });
    expect((await post('p-vp', B, body({ planType: 'PARTY' }))).status).toBe(400);
    expect((await get('p-vp', `${B}?view=all&type=EVENT`)).body.items.map((i: any) => i.title)).toEqual(['Concert night']);
    expect((await get('p-vp', `${B}?view=all&type=PROJECT`)).body.items.map((i: any) => i.title)).toEqual(['Plain']);
    const { planType: _omit, ...noType } = body({ title: 'Concert night 2' }) as Record<string, unknown>;
    expect((await patch('p-vp', `${B}/${ev}`, noType)).body.plan.planType).toBe('EVENT');
  });
  it('only a draft can be changed; a draft can be deleted softly and an Administrator restores it', async () => {
    const id = await draft();
    expect((await patch('p-vp', `${B}/${id}`, body({ title: 'Harvest concert 2' }))).status).toBe(200);
    expect((await patch('p-choir-member', `${B}/${id}`, body())).status).toBe(403); // the member sees it but may not change it
    expect((await del('p-vp', `${B}/${id}`)).status).toBe(200);
    expect((await get('p-vp', `${B}/${id}`)).status).toBe(404);
    expect((await get('p-vp', `${B}/deleted`)).status).toBe(404);
    expect((await get('p-admin', `${B}/deleted`)).body.items).toHaveLength(1);
    expect((await post('p-admin', `${B}/${id}/restore`)).status).toBe(200);
    expect(await status('p-vp', id)).toBe('DRAFT');
  });
});

describe('approval', () => {
  it('submitting asks the approvers; nobody approves their own plan; those without A cannot', async () => {
    const id = await draft();
    expect((await post('p-vp', `${B}/${id}/submit`)).body.plan).toMatchObject({ status: 'PENDING_APPROVAL', waitingLevel: 'choir' });
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-choir-leader' && n.kind === 'WAITING_FOR_ME')).toBe(true);
    expect((await post('p-vp', `${B}/${id}/approve`)).body.code).toBe('OWN_ENTRY');
    expect((await post('p-choir-member', `${B}/${id}/approve`)).status).toBe(403);
    expect((await patch('p-vp', `${B}/${id}`, body())).body.code).toBe('PLAN_LOCKED');
    expect((await post('p-choir-leader', `${B}/${id}/approve`)).body.plan.status).toBe('SETUP');
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-choir-member' && n.title.startsWith('Approved'))).toBe(true);
  });
  it('work beyond the unit needs the church too, in order', async () => {
    const id = await draft({ beyondUnit: true });
    await post('p-vp', `${B}/${id}/submit`);
    expect((await post('p-pastor', `${B}/${id}/approve`)).status).toBe(200); // the church leader covers every unit, so he may decide the first level
    const mid = (await get('p-vp', `${B}/${id}`)).body.plan;
    expect(mid.status).toBe('PENDING_APPROVAL');
    expect(mid.levels.map((l: any) => l.status)).toEqual(['APPROVED', 'PENDING']);
    expect((await post('p-choir-leader', `${B}/${id}/approve`)).status).toBe(403); // a president cannot decide the church level
    expect((await post('p-pastor', `${B}/${id}/approve`, { note: 'Go ahead' })).body.plan.status).toBe('SETUP');
  });
  it('a president who wrote the plan cannot approve it, but the church leader can', async () => {
    const id = await draft({}, 'p-choir-leader');
    await post('p-choir-leader', `${B}/${id}/submit`);
    expect((await post('p-choir-leader', `${B}/${id}/approve`)).body.code).toBe('OWN_ENTRY');
    expect((await post('p-pastor', `${B}/${id}/approve`)).body.plan.status).toBe('SETUP');
  });
  it('sending back needs a reason, tells the author and returns it to a draft that can be changed', async () => {
    const id = await draft();
    await post('p-vp', `${B}/${id}/submit`);
    expect((await post('p-choir-leader', `${B}/${id}/reject`, {})).body.code).toBe('REASON_REQUIRED');
    const r = await post('p-choir-leader', `${B}/${id}/reject`, { reason: 'Add a budget note' });
    expect(r.body.plan).toMatchObject({ status: 'DRAFT', rejectedReason: 'Add a budget note' });
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-vp' && n.title.startsWith('Sent back'))).toBe(true);
    expect((await patch('p-vp', `${B}/${id}`, body())).status).toBe(200);
  });
  it('the author may withdraw a submission, and reopen an approved plan for changes', async () => {
    const id = await draft();
    await post('p-vp', `${B}/${id}/submit`);
    expect((await post('p-vp', `${B}/${id}/withdraw`)).body.plan.status).toBe('DRAFT');
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const r = await post('p-vp', `${B}/${id}/reopen`);
    expect(r.body.plan).toMatchObject({ status: 'DRAFT', levels: [] });
  });
});

describe('running the work', () => {
  it('start, notes by the team, a checklist, and no changes to a plan that is not draft', async () => {
    const id = await approved();
    expect((await post('p-choir-member', `${B}/${id}/start`)).status).toBe(403);
    expect((await post('p-vp', `${B}/${id}/notes`, { text: 'too early' })).status).toBe(403);
    expect((await post('p-vp', `${B}/${id}/start`)).body.plan.status).toBe('RUNNING');
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-choir-member' && n.title.startsWith('Started'))).toBe(true);
    expect((await post('p-choir-member', `${B}/${id}/notes`, { text: 'Rehearsal one done' })).status).toBe(201);
    expect((await post('p-youth-member', `${B}/${id}/notes`, { text: 'hi' })).status).toBe(404);
    const withCheck = await post('p-vp', `${B}/${id}/checks`, { label: 'Hall cleaned' });
    const checkId = withCheck.body.plan.checks[0].id;
    expect((await patch('p-choir-member', `${B}/${id}/checks/${checkId}`, { done: true })).body.plan.checks[0].done).toBe(true);
    expect((await get('p-vp', `${B}/${id}`)).body.plan.notes).toHaveLength(1);
  });
  it('visibility keeps outsiders out of the plan', async () => {
    const id = await draft();
    expect((await get('p-choir-member', `${B}/${id}`)).status).toBe(200);
    expect((await get('p-youth-member', `${B}/${id}`)).status).toBe(404);
    expect((await get('p-youth-member', `${B}?view=all&status=all`)).body.items).toHaveLength(0);
    expect((await get('p-choir-member', `${B}?status=all`)).body.items).toHaveLength(1); // on the team
  });
  it('cancelling needs a reason and keeps the record', async () => {
    const id = await running();
    expect((await post('p-vp', `${B}/${id}/cancel`, {})).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-vp', `${B}/${id}/cancel`, { reason: 'Hall unavailable' })).body.plan).toMatchObject({ status: 'CANCELLED', cancelReason: 'Hall unavailable' });
    expect((await post('p-vp', `${B}/${id}/cancel`, { reason: 'again' })).body.code).toBe('WRONG_STATE');
    expect(fake.__db.workPlan).toHaveLength(1);
  });
});

describe('closing and the report', () => {
  it('the report is written in Closing, needs everything and a finished checklist, then publishing ends and freezes it', async () => {
    const id = await running();
    const k = (await post('p-vp', `${B}/${id}/checks`, { label: 'Hall cleaned' })).body.plan.checks[0].id;
    expect((await put('p-vp', `${B}/${id}/report`, {})).body.code).toBe('WRONG_STATE');
    await post('p-vp', `${B}/${id}/close`);
    expect((await post('p-choir-leader', `${B}/${id}/publish`)).body.code).toBe('REPORT_INCOMPLETE');
    expect((await put('p-choir-member', `${B}/${id}/report`, { planningSummary: 'x', executionSummary: 'y', outcome: 'z' })).status).toBe(403);
    expect((await put('p-vp', `${B}/${id}/report`, { planningSummary: 'We planned a concert', executionSummary: 'It happened', outcome: '300 people came' })).status).toBe(200);
    expect((await post('p-choir-leader', `${B}/${id}/publish`)).body.code).toBe('CHECKLIST_OPEN');
    await patch('p-vp', `${B}/${id}/checks/${k}`, { done: true });
    expect((await post('p-vp', `${B}/${id}/publish`)).status).toBe(403); // a vice president writes but cannot publish
    const done = await post('p-choir-leader', `${B}/${id}/publish`);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.plan).toMatchObject({ status: 'ENDED', canPublish: false, canCompose: false });
    expect(done.body.plan.report).toMatchObject({ frozen: true, outcome: '300 people came' });
    const snap = JSON.parse(fake.__db.workPlan[0].reportJson);
    expect(snap).toMatchObject({ title: 'Harvest concert', outcome: '300 people came', leaderName: 'Choir VP' });
    expect(snap.checks).toHaveLength(1);
    expect((await put('p-vp', `${B}/${id}/report`, { planningSummary: 'x', executionSummary: 'y', outcome: 'z' })).body.code).toBe('WRONG_STATE');
    expect((await post('p-vp', `${B}/${id}/cancel`, { reason: 'x' })).body.code).toBe('WRONG_STATE');
  });
  it('a closing plan cannot be started again, and an ended plan cannot be deleted', async () => {
    const id = await closing();
    expect((await post('p-vp', `${B}/${id}/start`)).body.code).toBe('WRONG_STATE');
    expect((await del('p-vp', `${B}/${id}`)).body.code).toBe('PLAN_LOCKED');
  });
});
