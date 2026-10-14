import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { descendantsOf, indicatorPercent, parentProblem, buildLevels, catechistStepApplies, publishProblem, stateOf, stateProblem, typeProblem } from '../src/work/plan';

describe('plan rules', () => {
  it('levels: the President, then always the Church Leader; the President is skipped when they wrote it; central work needs only the church', () => {
    expect(buildLevels('sys-choir').map((l) => l.levelKey)).toEqual(['UNIT', 'CHURCH']);
    expect(buildLevels('sys-choir', true).map((l) => l.levelKey)).toEqual(['CHURCH']);
    expect(buildLevels('sys-main').map((l) => l.levelKey)).toEqual(['CHURCH']);
    expect(buildLevels('sys-choir').map((l) => l.label)).toEqual(['President', 'Church Leader']);
    expect(buildLevels('sys-choir', false, true).map((l) => l.levelKey)).toEqual(['TREASURER', 'UNIT', 'CHURCH']);
    expect(buildLevels('sys-choir', true, true).map((l) => l.levelKey)).toEqual(['TREASURER', 'CHURCH']);
    expect(buildLevels('sys-choir', false, false, true).map((l) => l.levelKey)).toEqual(['UNIT', 'CATECHIST', 'CHURCH']);
    expect(buildLevels('sys-choir', false, true, true).map((l) => l.levelKey)).toEqual(['TREASURER', 'UNIT', 'CATECHIST', 'CHURCH']);
    expect(buildLevels('sys-main', false, false, true).map((l) => l.levelKey)).toEqual(['CHURCH']);
  });
  it('the five states people see; pause, resume and renew belong to certain types', () => {
    expect(['DRAFT', 'PENDING_APPROVAL', 'SETUP', 'RUNNING', 'PAUSED', 'CLOSING', 'ENDED', 'CANCELLED'].map(stateOf)).toEqual(['DRAFT', 'WAITING', 'APPROVED', 'APPROVED', 'APPROVED', 'DONE', 'DONE', 'CANCELLED']);
    expect(typeProblem('pause', 'EVENT')).toBe('WRONG_STATE');
    expect(typeProblem('pause', 'PROJECT')).toBeNull();
    expect(typeProblem('renew', 'PROJECT')).toBe('WRONG_STATE');
    expect(typeProblem('renew', 'PROGRAM')).toBeNull();
    expect(stateProblem('pause', 'RUNNING')).toBeNull();
    expect(stateProblem('resume', 'PAUSED')).toBeNull();
    expect(stateProblem('cancel', 'PAUSED')).toBeNull();
    expect(stateProblem('renew', 'CLOSING')).toBeNull();
  });
  it('parents: a project under a program, an event under either, never the other way', () => {
    expect(parentProblem('PROJECT', 'PROGRAM')).toBeNull();
    expect(parentProblem('PROJECT', 'EVENT')).toBe('BAD_PARENT');
    expect(parentProblem('EVENT', 'PROJECT')).toBeNull();
    expect(parentProblem('EVENT', 'PROGRAM')).toBeNull();
    expect(parentProblem('PROGRAM', 'PROGRAM')).toBe('BAD_PARENT');
    expect(descendantsOf('a', [{ id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }, { id: 'x' }]).sort()).toEqual(['b', 'c']);
    expect(indicatorPercent(50, 200)).toBe(25);
    expect(indicatorPercent(null, 200)).toBeNull();
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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'workPlan', 'workPlanNote', 'workPlanCheck', 'workPlanMilestone', 'workPlanRegistration', 'workPlanReview', 'workPlanIndicator', 'workPlanMeasure']) db[k] ??= [];
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
  // The President also lends the Write letter to the Vice President for a few days (a delegation; the office already holds it).
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
  await post('p-pastor', `${B}/${id}/approve`);
  return id;
};
/** Approval leads straight to running now; this is the same plan under its older name. */
const running = approved;
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
  it('submitting asks the President; nobody approves their own plan; those without A cannot', async () => {
    const id = await draft();
    expect((await post('p-vp', `${B}/${id}/submit`)).body.plan).toMatchObject({ status: 'PENDING_APPROVAL', state: 'WAITING', waitingLevel: 'President' });
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-choir-leader' && n.kind === 'WAITING_FOR_ME')).toBe(true);
    expect((await post('p-vp', `${B}/${id}/approve`)).body.code).toBe('OWN_ENTRY');
    expect((await post('p-choir-member', `${B}/${id}/approve`)).status).toBe(403);
    expect((await patch('p-vp', `${B}/${id}`, body())).body.code).toBe('PLAN_LOCKED');
    expect((await post('p-choir-leader', `${B}/${id}/approve`)).body.plan).toMatchObject({ status: 'PENDING_APPROVAL', waitingLevel: 'Church Leader' });
    expect((await post('p-pastor', `${B}/${id}/approve`)).body.plan).toMatchObject({ status: 'RUNNING', state: 'APPROVED' });
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-choir-member' && n.title.startsWith('Approved'))).toBe(true);
  });
  it('the Church Leader approves every kind of work, last: an event within its unit too', async () => {
    for (const planType of ['EVENT', 'PROJECT', 'PROGRAM']) {
      const id = await draft({ planType });
      expect((await post('p-vp', `${B}/${id}/submit`)).body.plan.status).toBe('PENDING_APPROVAL');
      expect((await post('p-pastor', `${B}/${id}/approve`)).status).toBe(403); // the unit's President goes first; the Church Leader does not enter the unit
      expect((await post('p-choir-leader', `${B}/${id}/approve`)).status).toBe(200);
      const mid = (await get('p-vp', `${B}/${id}`)).body.plan;
      expect(mid.status).toBe('PENDING_APPROVAL');
      expect(mid.levels.map((l: any) => l.status)).toEqual(['APPROVED', 'PENDING']);
      expect((await post('p-choir-leader', `${B}/${id}/approve`)).status).toBe(403); // a president cannot decide the church level
      expect((await post('p-pastor', `${B}/${id}/approve`, { note: 'Go ahead' })).body.plan.status).toBe('RUNNING');
    }
  });
  it('the Church Leader does it all from Central: sees the unit plan there, is told there, and the Catechist stands in there', async () => {
    const id = await draft();
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const list = (await get('p-pastor', `${B}?systemId=sys-main&view=all`)).body.items;
    expect(list.map((x: any) => x.id)).toContain(id);
    const notices = (await get('p-pastor', '/api/notifications?tab=waiting')).body.items;
    const ask = notices.find((n: any) => n.title.includes('Harvest concert'));
    expect(ask?.href).toBe(`/s/sys-main/work/plans/${id}`);
    expect(ask?.systemId).toBe('sys-main');
    expect((await get('p-pastor', `${B}/${id}`)).status).toBe(200);
  });
  it('a president who wrote the plan skips their own step, goes straight to the Church Leader and cannot approve it', async () => {
    const id = await draft({}, 'p-choir-leader');
    const sent = (await post('p-choir-leader', `${B}/${id}/submit`)).body.plan;
    expect(sent.levels.map((l: any) => l.levelKey)).toEqual(['CHURCH']);
    expect(sent.waitingLevel).toBe('Church Leader');
    expect((await post('p-choir-leader', `${B}/${id}/approve`)).body.code).toBe('OWN_ENTRY');
    expect((await post('p-pastor', `${B}/${id}/approve`)).body.plan.status).toBe('RUNNING');
  });
  it('the Church Leader approves their own activity, and the history says so', async () => {
    const id = await draft({ unitId: 'ou-church' }, 'p-pastor'); // his own activity is planned in Central
    const sent = (await post('p-pastor', `${B}/${id}/submit`)).body.plan;
    expect(sent.levels.map((l: any) => l.levelKey)).toEqual(['CHURCH']);
    const done = (await post('p-pastor', `${B}/${id}/approve`)).body.plan;
    expect(done.status).toBe('RUNNING');
    expect(done.levels[0].note).toContain('own activity');
  });
  it('with no President in the unit the step is skipped', async () => {
    fake.__db.position.find((x: any) => x.id === 'pos-choir').status = 'ENDED';
    const id = await draft();
    expect((await post('p-vp', `${B}/${id}/submit`)).body.plan.levels.map((l: any) => l.levelKey)).toEqual(['CHURCH']);
  });
  it('a unit activity goes to the Catechist to be verified, and only then to the Church Leader to approve', async () => {
    fake.__db.person.push({ id: 'p-cat', fullName: 'The Catechist', status: 'ACTIVE' });
    fake.__db.position.push({ id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: new Date('2022-01-01') });
    const id = await draft();
    const sub = await post('p-vp', `${B}/${id}/submit`);
    expect(sub.body.plan.levels.map((l: any) => l.levelKey)).toEqual(['UNIT', 'CATECHIST', 'CHURCH']);
    await post('p-choir-leader', `${B}/${id}/approve`); // the President
    expect((await post('p-pastor', `${B}/${id}/approve`)).status).toBe(403); // the Church Leader must wait for the Catechist
    expect((await post('p-choir-leader', `${B}/${id}/approve`)).status).not.toBe(200); // nobody else can verify
    const verified = await post('p-cat', `${B}/${id}/approve`);
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body.plan.status).not.toBe('RUNNING');
    expect((await post('p-cat', `${B}/${id}/approve`)).status).not.toBe(200); // the Catechist cannot approve in the Church Leader's place
    expect((await post('p-pastor', `${B}/${id}/approve`)).body.plan.status).toBe('RUNNING');
  });
  it('the Catechist creates an activity in Central Administration and submits it straight to the Church Leader', async () => {
    fake.__db.person.push({ id: 'p-cat', fullName: 'The Catechist', status: 'ACTIVE' });
    fake.__db.position.push({ id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: new Date('2022-01-01') });
    const opts = await get('p-cat', `${B}/options`);
    expect(opts.body.units.some((u: any) => u.id === 'ou-church'), JSON.stringify(opts.body)).toBe(true);
    const made = await post('p-cat', B, body({ unitId: 'ou-church', leaderId: 'p-cat', team: [], visibility: 'SYSTEM' }));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const id = made.body.plan.id;
    const sub = await post('p-cat', `${B}/${id}/submit`);
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);
    expect(sub.body.plan.levels.map((l: any) => l.levelKey)).toEqual(['CHURCH']);
    expect((await post('p-cat', `${B}/${id}/approve`)).status).not.toBe(200); // not his own
    expect((await post('p-pastor', `${B}/${id}/approve`)).body.plan.status).toBe('RUNNING');
  });
  it('the step is skipped when the Catechist wrote the activity themselves', async () => {
    fake.__db.person.push({ id: 'p-cat', fullName: 'The Catechist', status: 'ACTIVE' });
    fake.__db.position.push({ id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: new Date('2022-01-01') });
    expect(catechistStepApplies('p-vp', 'sys-choir', { positions: fake.__db.position, memberships: [], delegations: [] } as never)).toBe(true);
    expect(catechistStepApplies('p-cat', 'sys-choir', { positions: fake.__db.position, memberships: [], delegations: [] } as never)).toBe(false);
    expect(catechistStepApplies('p-vp', 'sys-main', { positions: fake.__db.position, memberships: [], delegations: [] } as never)).toBe(false);
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
  it('the author may withdraw a submission, and reopen an older approved plan (set up) for changes', async () => {
    const id = await draft();
    await post('p-vp', `${B}/${id}/submit`);
    expect((await post('p-vp', `${B}/${id}/withdraw`)).body.plan.status).toBe('DRAFT');
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    await post('p-pastor', `${B}/${id}/approve`);
    expect((await post('p-vp', `${B}/${id}/reopen`)).status).toBe(409); // approved plans now run at once; only an older plan sits in set-up
    fake.__db.workPlan.find((x: any) => x.id === id).status = 'SETUP';
    const r = await post('p-vp', `${B}/${id}/reopen`);
    expect(r.body.plan).toMatchObject({ status: 'DRAFT', levels: [] });
  });
});

describe('the Activities board', () => {
  it('lists each activity with its approval steps, who decided them, and its money; the plain list stays plain', async () => {
    const id = await draft({ planType: 'EVENT' });
    await post('p-vp', `${B}/${id}/submit`);
    await post('p-choir-leader', `${B}/${id}/approve`);
    const plain = (await get('p-pastor', `${B}?systemId=sys-main&view=all`)).body.items.find((x: any) => x.id === id);
    expect(plain.levels).toBeUndefined();
    const row = (await get('p-pastor', `${B}?systemId=sys-main&view=all&status=all&board=1`)).body.items.find((x: any) => x.id === id);
    expect(row).toMatchObject({ planType: 'EVENT', state: 'WAITING', perMonth: false, amount: 0 });
    expect(row.levels.map((l: any) => [l.levelKey, l.status])).toEqual([['UNIT', 'APPROVED'], ['CHURCH', 'PENDING']]);
    expect(row.levels[0].byName).toBeTruthy();
    expect(row.createdByName).toBeTruthy();
    expect(row.levels[1].byName).toBeNull();
  });
});

describe('running the work', () => {
  it('an older plan waiting in set-up starts; notes by the team, a checklist, and no changes to a plan that is not draft', async () => {
    const id = await approved();
    fake.__db.workPlan.find((x: any) => x.id === id).status = 'SETUP';
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

describe('lifecycles by type', () => {
  it('every kind of work, an event within its unit included, waits for approval after it is submitted', async () => {
    for (const planType of ['EVENT', 'PROJECT', 'PROGRAM']) {
      const id = await draft({ planType });
      expect((await post('p-vp', `${B}/${id}/submit`)).body.plan.status).toBe('PENDING_APPROVAL');
    }
  });
  it('projects and programs pause and resume; events cannot; a paused plan can be cancelled', async () => {
    const p = await running({ planType: 'PROJECT' });
    expect((await post('p-vp', `${B}/${p}/pause`)).body.plan.status).toBe('PAUSED');
    expect((await post('p-vp', `${B}/${p}/resume`)).body.plan.status).toBe('RUNNING');
    await post('p-vp', `${B}/${p}/pause`);
    expect((await post('p-vp', `${B}/${p}/cancel`, { reason: 'Funding stopped' })).body.plan.status).toBe('CANCELLED');
    const e = await running({ planType: 'EVENT' });
    expect((await post('p-vp', `${B}/${e}/pause`)).status).toBe(409);
  });
  it('only a program in review can be renewed', async () => {
    const g = await running({ planType: 'PROGRAM' });
    await post('p-vp', `${B}/${g}/close`);
    expect((await post('p-vp', `${B}/${g}/renew`)).body.plan.status).toBe('RUNNING');
    const j = await running({ planType: 'PROJECT' });
    await post('p-vp', `${B}/${j}/close`);
    expect((await post('p-vp', `${B}/${j}/renew`)).status).toBe(409);
  });
});

describe('event registration and attendance', () => {
  const ev = async () => running({ planType: 'EVENT' });
  const reg = (as: string, id: string, b: object) => patch(as, `${B}/${id}/registration`, b);
  it('only the team opens registration, and only while the event is set up or running', async () => {
    const d = await draft({ planType: 'EVENT' });
    expect((await reg('p-vp', d, { open: true })).status).toBe(403);
    const id = await ev();
    expect((await reg('p-choir-member', id, { open: true })).status).toBe(403);
    const r = (await reg('p-vp', id, { open: true, capacity: 2 })).body.plan.registration;
    expect(r).toMatchObject({ open: true, capacity: 2, spotsLeft: 2, canRegister: true });
  });
  it('a member registers once, cancels, and the places run out', async () => {
    const id = await ev();
    await reg('p-vp', id, { open: true, capacity: 2 });
    expect((await post('p-choir-member', `${B}/${id}/register`)).status).toBe(201);
    expect((await post('p-choir-member', `${B}/${id}/register`)).body.code).toBe('ALREADY_REGISTERED');
    expect((await post('p-vp', `${B}/${id}/registrations`, { name: 'Guest One', phone: '0788000001' })).status).toBe(201);
    expect((await post('p-vp', `${B}/${id}/registrations`, { name: 'Guest Two', phone: '0788000002' })).body.code).toBe('EVENT_FULL');
    const mine = (await get('p-choir-member', `${B}/${id}`)).body.plan.registration;
    expect(mine.count).toBe(2);
    expect(mine.mine).toBeTruthy();
    expect((await del('p-choir-member', `${B}/${id}/register`)).body.plan.registration.count).toBe(1);
  });
  it('closed registration refuses; projects have none', async () => {
    const id = await ev();
    expect((await post('p-choir-member', `${B}/${id}/register`)).body.code).toBe('REGISTRATION_CLOSED');
    const pj = await running({ planType: 'PROJECT' });
    expect((await reg('p-vp', pj, { open: true })).status).toBe(403);
  });
  it('the team marks attendance while the event runs; others cannot, and the list stays with the team', async () => {
    const id = await ev();
    await reg('p-vp', id, { open: true });
    await post('p-youth-member', `${B}/${id}/register`).catch(() => null);
    await post('p-vp', `${B}/${id}/registrations`, { name: 'Guest', phone: '0788111111' });
    const items = (await get('p-vp', `${B}/${id}`)).body.plan.registration.items;
    expect(items).toHaveLength(1);
    expect((await patch('p-choir-member', `${B}/${id}/registrations/${items[0].id}`, { attended: true })).body.plan.registration.attended).toBe(1);
    expect((await get('p-choir-member', `${B}/${id}`)).body.plan.registration.attended).toBe(1);
  });
  it('the public link shows an invitation, takes a name and a phone, and nothing else', async () => {
    const id = await ev();
    await reg('p-vp', id, { open: true, capacity: 1 });
    const token = (await reg('p-vp', id, { publicLink: true })).body.plan.registration.publicToken;
    expect(token).toBeTruthy();
    expect((await get('p-choir-member', `${B}/${id}`)).body.plan.registration.publicToken).toBeNull();
    const view = await request(app).get(`/api/public/events/${token}`);
    expect(view.status).toBe(200);
    expect(Object.keys(view.body.event).sort()).toEqual(['aim', 'checkin', 'endsOn', 'formUrl', 'full', 'location', 'open', 'startsOn', 'title']);
    expect((await request(app).get('/api/public/events/not-a-real-token-abcdef')).status).toBe(404);
    expect((await request(app).post(`/api/public/events/${token}`).send({ name: 'Bot', phone: '0788222222', website: 'x' })).status).toBe(201);
    expect(fake.__db.workPlanRegistration).toHaveLength(0);
    expect((await request(app).post(`/api/public/events/${token}`).send({ name: 'Mary K', phone: '0788333333' })).status).toBe(201);
    expect((await request(app).post(`/api/public/events/${token}`).send({ name: 'Other', phone: '0788444444' })).body.code).toBe('EVENT_FULL');
    await reg('p-vp', id, { publicLink: false });
    expect((await request(app).get(`/api/public/events/${token}`)).status).toBe(404);
  });
  it('attendance is still counted while the event is closing', async () => {
    const id = await ev();
    await reg('p-vp', id, { open: true });
    await post('p-vp', `${B}/${id}/registrations`, { name: 'Guest', phone: '0788555555' });
    const rid = (await get('p-vp', `${B}/${id}`)).body.plan.registration.items[0].id;
    await patch('p-vp', `${B}/${id}/registrations/${rid}`, { attended: true });
    await post('p-vp', `${B}/${id}/close`);
    expect((await get('p-vp', `${B}/${id}`)).body.plan.registration).toMatchObject({ count: 1, attended: 1 });
  });
});

describe('project milestones', () => {
  it('the team adds milestones and ticks them; events have none', async () => {
    const id = await running({ planType: 'PROJECT' });
    expect((await post('p-vp', `${B}/${id}/milestones`, { title: 'Foundation poured', dueOn: '2026-12-01T00:00:00Z' })).status).toBe(201);
    const m = (await get('p-vp', `${B}/${id}`)).body.plan.milestones;
    expect(m).toHaveLength(1);
    expect((await patch('p-choir-member', `${B}/${id}/milestones/${m[0].id}`, { done: true })).body.plan.milestones[0].done).toBe(true);
    expect((await post('p-choir-member', `${B}/${id}/milestones`, { title: 'x' })).status).toBe(403);
    expect((await del('p-vp', `${B}/${id}/milestones/${m[0].id}`)).body.plan.milestones).toHaveLength(0);
    const e = await running({ planType: 'EVENT' });
    expect((await post('p-vp', `${B}/${e}/milestones`, { title: 'x' })).status).toBe(403);
  });
});

describe('the named screens keep their answers', () => {
  it('a new event needs only a name and a unit: the writer leads it until another is chosen', async () => {
    const full = body({ planType: 'EVENT' }) as Record<string, unknown>;
    const { leaderId: _l, ...rest } = full;
    const res = await post('p-vp', B, rest);
    expect(res.status).toBe(201);
    expect(res.body.plan.leaderId).toBe('p-vp');
  });
  it('a draft keeps the event details; unknown keys and locked plans are refused', async () => {
    const e = await draft({ planType: 'EVENT' });
    const saved = await put('p-vp', `${B}/${e}/details`, { details: { type: 'CONCERT', agenda: '09:00 Welcome' } });
    expect(saved.status).toBe(200);
    expect(saved.body.plan.details).toEqual({ type: 'CONCERT', agenda: '09:00 Welcome' });
    const more = await put('p-vp', `${B}/${e}/details`, { details: { outcomes: '200 guests' } });
    expect(more.body.plan.details).toEqual({ type: 'CONCERT', agenda: '09:00 Welcome', outcomes: '200 guests' });
    expect((await put('p-vp', `${B}/${e}/details`, { details: { hack: 'x' } })).status).toBe(400);
    expect((await put('p-member', `${B}/${e}/details`, { details: { agenda: 'x' } })).status).toBeGreaterThanOrEqual(403);
  });
});

describe('optional links and program governance', () => {
  const link = (id: string, parentId: string | null, as = 'p-vp') => patch(as, `${B}/${id}/parent`, { parentId });
  it('plans stand alone; links are optional, typed, same-system and never loop', async () => {
    const g = await draft({ planType: 'PROGRAM' });
    const pj = await draft({ planType: 'PROJECT', parentId: g });
    const e = await draft({ planType: 'EVENT' });
    expect((await get('p-vp', `${B}/${e}`)).body.plan.parent).toBeNull();
    expect((await link(e, pj)).body.plan.parent).toMatchObject({ id: pj, planType: 'PROJECT' });
    const prog = (await get('p-vp', `${B}/${g}`)).body.plan;
    expect(prog.children.map((x: any) => x.id)).toEqual([pj]);
    expect((await link(g, pj)).status).toBe(403); // a program has no parent
    expect((await link(pj, e)).body.code).toBe('BAD_PARENT'); // a project cannot sit under an event
    expect((await link(pj, pj)).body.code).toBe('BAD_PARENT');
    expect((await link(e, null)).body.plan.parent).toBeNull();
    expect((await post('p-vp', B, body({ planType: 'PROJECT', parentId: e }))).body.code).toBe('BAD_PARENT');
    expect((await get('p-vp', `${B}/${pj}/parent-options`)).body.items.map((x: any) => x.id)).toEqual([g]);
  });
  it('a program keeps a steering committee, reviews and indicators with readings', async () => {
    const g = await running({ planType: 'PROGRAM' });
    expect((await put('p-vp', `${B}/${g}/steering`, { members: [{ personId: 'p-choir-member', role: 'Chair' }] })).body.plan.program.steering).toHaveLength(1);
    expect((await post('p-vp', `${B}/${g}/reviews`, { heldOn: '2026-12-01T10:00:00Z', summary: 'On track', decision: 'CONTINUE' })).status).toBe(201);
    expect((await post('p-vp', `${B}/${g}/reviews`, { heldOn: '2026-12-01T10:00:00Z', summary: 'x', decision: 'MAYBE' })).status).toBe(400);
    await post('p-vp', `${B}/${g}/indicators`, { name: 'Families visited', unit: 'families', target: 200 });
    const ind = (await get('p-vp', `${B}/${g}`)).body.plan.program.indicators[0];
    expect((await post('p-choir-member', `${B}/${g}/indicators/${ind.id}/readings`, { value: 50 })).body.plan.program.indicators[0]).toMatchObject({ current: 50, percent: 25 });
    expect((await post('p-choir-member', `${B}/${g}/indicators`, { name: 'x', target: 1 })).status).toBe(403);
    const full = (await get('p-vp', `${B}/${g}`)).body.plan.program;
    expect(full.reviews).toHaveLength(1);
    const pj = await running({ planType: 'PROJECT' });
    expect((await put('p-vp', `${B}/${pj}/steering`, { members: [] })).status).toBe(403);
  });
  it('a review needs the program to be running', async () => {
    const g = await draft({ planType: 'PROGRAM' });
    expect((await post('p-vp', `${B}/${g}/reviews`, { heldOn: '2026-12-01T10:00:00Z', summary: 'x', decision: 'CONTINUE' })).status).toBe(403);
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

describe('closing with one line of result', () => {
  it('a running plan closes with one line and is done; without it the older report route still applies', async () => {
    const id = await running();
    expect((await post('p-choir-member', `${B}/${id}/close`, { outcome: 'x' })).status).toBe(403);
    const r = await post('p-vp', `${B}/${id}/close`, { outcome: 'Two hundred came and the hall was full' });
    expect(r.body.plan).toMatchObject({ status: 'ENDED', state: 'DONE' });
    expect(r.body.plan.report.planningSummary).toBe('');
    expect(fake.__db.workPlan.find((x: any) => x.id === id).outcome).toBe('Two hundred came and the hall was full');
    const old = await running();
    expect((await post('p-vp', `${B}/${old}/close`)).body.plan.status).toBe('CLOSING');
  });
});

describe('when it happens', () => {
  const repeat = { timingKind: 'REPEAT', repeat: { kind: 'WEEKLY', days: [2] }, startTime: '18:00', endTime: '19:30', startsOn: '2026-11-01T00:00:00Z', endsOn: null };
  it('a draft saves a date, a range or a repeat with optional times, and refuses nonsense', async () => {
    const ok = await post('p-vp', B, body(repeat));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.plan).toMatchObject({ timingKind: 'REPEAT', startTime: '18:00', endTime: '19:30', repeat: { kind: 'WEEKLY', days: [2] } });
    expect((await post('p-vp', B, body({ ...repeat, repeat: null }))).body.code).toBe('BAD_REPEAT');
    expect((await post('p-vp', B, body({ ...repeat, endTime: '17:00' }))).body.code).toBe('BAD_TIME');
    expect((await post('p-vp', B, body({ timingKind: 'DATE', startsOn: '2026-11-14T00:00:00Z', endsOn: '2026-11-20T00:00:00Z' }))).body.plan).toMatchObject({ timingKind: 'DATE' });
    const date = await draft({ timingKind: 'DATE', startsOn: '2026-11-14T00:00:00Z', endsOn: null });
    expect((await get('p-vp', `${B}/${date}`)).body.plan.endsOn).toBe('2026-11-14T00:00:00.000Z'); // a single date has the same last day
  });
  it('an approved activity shows on the month view: a repeat on every Tuesday, a date on its day; drafts and waiting ones do not', async () => {
    const weekly = await approved({ title: 'Prayer meeting', ...repeat });
    await approved({ title: 'Youth day', timingKind: 'DATE', startsOn: '2026-11-14T00:00:00Z', endsOn: null });
    await draft({ title: 'Only a draft', timingKind: 'DATE', startsOn: '2026-11-15T00:00:00Z', endsOn: null });
    const waiting = await draft({ title: 'Waiting one', timingKind: 'DATE', startsOn: '2026-11-16T00:00:00Z', endsOn: null });
    await post('p-vp', `${B}/${waiting}/submit`);
    const month = (await get('p-vp', '/api/schedule/month?systemId=sys-choir&month=2026-11')).body.activities;
    expect(month.filter((a: any) => a.title === 'Prayer meeting').map((a: any) => a.date)).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
    expect(month.find((a: any) => a.title === 'Prayer meeting')).toMatchObject({ startTime: '18:00', endTime: '19:30', planId: weekly });
    expect(month.filter((a: any) => a.title === 'Youth day').map((a: any) => a.date)).toEqual(['2026-11-14']);
    expect(month.map((a: any) => a.title)).not.toContain('Only a draft');
    expect(month.map((a: any) => a.title)).not.toContain('Waiting one');
    expect((await get('p-vp', '/api/schedule/month?systemId=sys-choir&month=2026-12')).body.activities.filter((a: any) => a.title === 'Prayer meeting')).toHaveLength(4 + 1); // Tuesdays 1, 8, 15, 22, 29
  });
  it('changing the date moves it on the schedule, writes the old and new date, and tells the Secretary, the Vice President and the Treasurer', async () => {
    const db = fake.__db;
    db.person.push({ id: 'p-sec', fullName: 'Choir Secretary', status: 'ACTIVE' }, { id: 'p-tre', fullName: 'Choir Treasurer', status: 'ACTIVE' });
    db.position.push(
      { id: 'pos-sec', personId: 'p-sec', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Secretary', office: 'SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') },
      { id: 'pos-tre', personId: 'p-tre', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Treasurer', office: 'TREASURER', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    );
    const id = await approved({ title: 'Youth day', timingKind: 'DATE', startsOn: '2026-11-14T00:00:00Z', endsOn: null });
    const move = (as: string, b: object) => patch(as, `${B}/${id}/timing`, { timingKind: 'DATE', startsOn: '2026-11-21T00:00:00Z', ...b });
    expect((await move('p-choir-member', {})).status).toBe(403);
    const r = await move('p-sec', { location: 'Chapel' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.plan.dateChange).toMatchObject({ fromStart: '2026-11-14', toStart: '2026-11-21' });
    expect(r.body.plan.location).toBe('Chapel');
    const titles = (to: string) => db.notification.filter((n: any) => n.toPersonId === to && n.title.startsWith('Date changed')).length;
    expect(titles('p-vp')).toBe(1);
    expect(titles('p-tre')).toBe(1);
    expect(titles('p-sec')).toBe(0); // not told of their own change
    const month = (await get('p-vp', '/api/schedule/month?systemId=sys-choir&month=2026-11')).body.activities;
    expect(month.filter((a: any) => a.title === 'Youth day').map((a: any) => a.date)).toEqual(['2026-11-21']);
    expect((await move('p-sec', { startsOn: null })).body.code).toBe('DATE_REQUIRED');
    expect(db.auditEvent.some((e: any) => e.action === 'WORKPLAN_TIMING')).toBe(true);
  });
  it('postponing by more than six months asks the Church Leader to confirm whether the money stays reserved', async () => {
    const id = await approved({ title: 'Youth day', timingKind: 'DATE', startsOn: '2026-11-14T00:00:00Z', endsOn: null });
    const near = await patch('p-vp', `${B}/${id}/timing`, { timingKind: 'DATE', startsOn: '2027-03-01T00:00:00Z' });
    expect(near.body.plan.reviewDue).toBe(false);
    const far = await patch('p-vp', `${B}/${id}/timing`, { timingKind: 'DATE', startsOn: '2027-10-01T00:00:00Z' });
    expect(far.body.plan.reviewDue).toBe(true);
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-pastor' && n.kind === 'WAITING_FOR_ME' && n.title.startsWith('Date changed'))).toBe(true);
    expect((await post('p-vp', `${B}/${id}/review-seen`)).status).toBe(403);
    const seen = await get('p-pastor', `${B}/${id}`);
    expect(seen.body.plan.canClearReview).toBe(true);
    expect((await get('p-choir-leader', `${B}/${id}`)).body.plan.canClearReview).toBe(false);
    expect((await post('p-pastor', `${B}/${id}/review-seen`)).body.plan.reviewDue).toBe(false);
    expect((await post('p-pastor', `${B}/${id}/review-seen`)).status).toBe(409);
  });
});

describe('files on an activity', () => {
  const png = Buffer.from('hello').toString('base64');
  const add = (as: string, id: string, o: object = {}) => post(as, `${B}/${id}/files`, { name: 'plan.pdf', mime: 'application/pdf', data: png, ...o });
  it('the leader adds, anyone who sees it downloads, only managers remove; the list shows the count and the aim', async () => {
    const id = await draft();
    const r = await add('p-vp', id);
    expect(r.status).toBe(201);
    expect((await add('p-choir-member', id)).status).toBe(403);
    expect((await add('p-vp', id, { mime: 'application/x-msdownload' })).body.code).toBe('BAD_TYPE');
    expect((await add('p-vp', id, { data: 'not base64!' })).body.code).toBe('BAD_INPUT');
    expect((await add('p-vp', id, { data: Buffer.alloc(1_600_000).toString('base64') })).body.code).toBe('TOO_BIG');
    const list = await get('p-vp', `${B}/${id}/files`);
    expect(list.body.canWrite).toBe(true);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).not.toHaveProperty('dataBase64');
    const file = await get('p-choir-member', `${B}/${id}/files/${r.body.id}/file`);
    expect(file.body).toMatchObject({ name: 'plan.pdf', mime: 'application/pdf', data: png });
    expect((await get('p-choir-member', `${B}/${id}/files`)).body.canWrite).toBe(false);
    const board = (await get('p-vp', `${B}?board=1&view=all&status=all`)).body.items.find((x: any) => x.id === id);
    expect(board).toMatchObject({ files: 1, aim: 'Thank God for the harvest' });
    expect((await del('p-choir-member', `${B}/${id}/files/${r.body.id}`)).status).toBe(403);
    expect((await del('p-vp', `${B}/${id}/files/${r.body.id}`)).status).toBe(200);
    expect((await get('p-vp', `${B}/${id}/files`)).body.items).toHaveLength(0);
    expect((await get('p-vp', `${B}/${id}/files/${r.body.id}/file`)).status).toBe(404);
  });
});
