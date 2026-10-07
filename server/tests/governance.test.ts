import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { canRead, canWrite, dayStart, dueIsFuture, mayApprove, workProblem } from '../src/governance/rules';
import type { AccessData } from '../src/capabilities/engine';

const NOW = new Date('2026-10-06T12:00:00Z');
const pos = (id: string, personId: string, office: string, systemId: string) => ({ id, personId, office, systemId, orgUnitId: null as string | null, status: 'ACTIVE', startDate: '2020-01-01', endDate: null as string | null });
const data: AccessData = {
  positions: [
    pos('a', 'lead', 'CHURCH_LEADER', 'sys-main'),
    pos('b', 'cat', 'CATECHIST', 'sys-main'),
    pos('c', 'sec', 'CHURCH_SECRETARY', 'sys-main'),
    pos('d', 'pres', 'PRESIDENT', 'sys-choir'),
    pos('e', 'vp', 'VICE_PRESIDENT', 'sys-choir'),
    pos('f', 'treas', 'TREASURER', 'sys-choir'),
  ],
  memberships: [{ id: 'm1', personId: 'mc', systemId: 'sys-choir', type: 'MINISTRY_MEMBER', status: 'ACTIVE', startDate: '2020-01-01', endDate: null } as any],
  delegations: [],
};

describe('who reads, drafts and approves', () => {
  it('reading follows Governance R in the unit’s own system', () => {
    for (const who of ['lead', 'cat', 'sec']) expect(canRead(who, 'sys-main', data, NOW), who).toBe(true);
    expect(canRead('pres', 'sys-choir', data, NOW)).toBe(true);
    expect(canRead('pres', 'sys-main', data, NOW)).toBe(false);
    expect(canRead('pres', 'sys-youth', data, NOW)).toBe(false);
    expect(canRead('mc', 'sys-choir', data, NOW)).toBe(false);
    expect(canRead('lead', 'sys-youth', data, NOW)).toBe(true);
  });
  it('drafting needs W: the Treasurer, who holds no Governance letter, cannot', () => {
    expect(canWrite('vp', 'sys-choir', data, NOW)).toBe(true);
    expect(canWrite('sec', 'sys-main', data, NOW)).toBe(true);
    expect(canWrite('treas', 'sys-choir', data, NOW)).toBe(false);
    expect(canWrite('mc', 'sys-choir', data, NOW)).toBe(false);
  });
  it('approving needs A and is never your own entry', () => {
    expect(mayApprove('pres', 'sys-choir', 'vp', data, NOW)).toEqual({ allowed: true, reason: 'OK' });
    expect(mayApprove('pres', 'sys-choir', 'pres', data, NOW)).toEqual({ allowed: false, reason: 'OWN_ENTRY' });
    expect(mayApprove('vp', 'sys-choir', 'pres', data, NOW)).toEqual({ allowed: false, reason: 'NO_LETTER' });
    expect(mayApprove('cat', 'sys-main', 'sec', data, NOW)).toEqual({ allowed: false, reason: 'NO_LETTER' });
    expect(mayApprove('lead', 'sys-main', 'cat', data, NOW).allowed).toBe(true);
  });
  it('a decision about work needs an owner and a date', () => {
    expect(workProblem(undefined)).toBeNull();
    expect(workProblem({ dueDate: '2026-11-01' })).toMatch(/owner/);
    expect(workProblem({ ownerPersonId: 'x' })).toMatch(/date/);
    expect(workProblem({ ownerPersonId: 'x', dueDate: '2026-11-01' })).toBeNull();
  });
  it('days are real days, and today is not yet past', () => {
    expect(dayStart('2026-02-30')).toBeNull();
    expect(dayStart('06/10/2026')).toBeNull();
    expect(dayStart('2026-10-06')?.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(dueIsFuture(dayStart('2026-10-06')!, NOW)).toBe(true);
    expect(dueIsFuture(dayStart('2026-10-05')!, NOW)).toBe(false);
  });
});

/* ───────────── the routes ───────────── */

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const soon = () => new Date(Date.now() + 3 * 86400000).toISOString();

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'meeting', 'decision', 'notification', 'notificationRead', 'preference']) db[k] ??= [];
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
    { id: 'ou-youth', name: 'Youth', code: 'KAC-YOU', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
    { id: 'ou-loose', name: 'Loose', code: 'KAC-LOO', kind: 'TEAM', type: 'TEAM', parentId: 'ou-church', systemId: null },
  );
  db.person.push(
    { id: 'p-cat', fullName: 'Catechist', status: 'ACTIVE' },
    { id: 'p-sec', fullName: 'Church Secretary', status: 'ACTIVE' },
    { id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' },
    { id: 'p-gone', fullName: 'Gone', status: 'ACTIVE', archivedAt: new Date('2025-01-01') },
  );
  db.position.push(
    { id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-sec', personId: 'p-sec', systemId: 'sys-main', title: 'Church Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const plan = (as: string, body: object = {}) =>
  post(as, '/api/governance/meetings', { orgUnitId: 'ou-choir', typeCode: 'UNIT', scheduledAt: soon(), ...body });

describe('meetings', () => {
  it('need sign-in, a known unit, a known kind and a real time', async () => {
    expect((await request(app).post('/api/governance/meetings').send({})).status).toBe(401);
    expect((await plan('p-choir-leader', { orgUnitId: 'ou-zzz' })).status).toBe(404);
    expect((await plan('p-choir-leader', { orgUnitId: 'ou-loose' })).body.code).toBe('UNIT_HAS_NO_SYSTEM');
    expect((await plan('p-choir-leader', { typeCode: 'PARTY' })).body.code).toBe('BAD_TYPE');
    expect((await plan('p-choir-leader', { scheduledAt: 'sometime soon' })).body.code).toBe('BAD_DATES');
    expect((await post('p-choir-leader', '/api/governance/meetings', {})).status).toBe(400);
  });
  it('a president or vice president drafts a meeting for their own unit, audited; the title defaults', async () => {
    for (const who of ['p-choir-leader', 'p-vp']) {
      const r = await plan(who);
      expect(r.status, `${who} ${JSON.stringify(r.body)}`).toBe(201);
    }
    expect(fake.__db.meeting[0]).toMatchObject({ title: 'Unit meeting, Choir', systemId: 'sys-choir', status: 'PLANNED', createdById: 'p-choir-leader' });
    expect(fake.__db.auditEvent.filter((e: any) => e.action === 'MEETING_PLANNED')).toHaveLength(2);
  });
  it('nobody drafts for a unit they hold no Write letter in', async () => {
    expect((await plan('p-choir-member')).status).toBe(403);
    expect((await plan('p-choir-leader', { orgUnitId: 'ou-youth' })).status).toBe(403);
    expect((await plan('p-treasurer')).status).toBe(403);
    expect(fake.__db.meeting).toHaveLength(0);
  });
  it('the Board is a Central Administration meeting: its officers see it, a unit president does not', async () => {
    const r = await post('p-sec', '/api/governance/meetings', { orgUnitId: 'ou-church', typeCode: 'BOARD', scheduledAt: soon() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    for (const who of ['p-pastor', 'p-cat', 'p-sec']) {
      expect((await get(who, '/api/governance/meetings')).body.meetings.map((m: any) => m.typeName), who).toEqual(['Board meeting']);
    }
    expect((await get('p-choir-leader', '/api/governance/meetings')).body.meetings).toEqual([]);
    expect((await get('p-choir-leader', `/api/governance/meetings/${r.body.meeting.id}`)).status).toBe(404);
  });
  it('each person lists only what they may read, filtered and newest first', async () => {
    await plan('p-choir-leader', { title: 'Older', scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    await plan('p-choir-leader', { title: 'Newer', scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString() });
    await post('p-pastor', '/api/governance/meetings', { orgUnitId: 'ou-youth', typeCode: 'UNIT', scheduledAt: soon() });
    expect((await get('p-choir-leader', '/api/governance/meetings')).body.meetings.map((m: any) => m.title)).toEqual(['Newer', 'Older']);
    expect((await get('p-pastor', '/api/governance/meetings')).body.meetings).toHaveLength(3);
    expect((await get('p-pastor', '/api/governance/meetings?unitId=ou-youth')).body.meetings).toHaveLength(1);
    expect((await get('p-pastor', '/api/governance/meetings?systemId=sys-choir')).body.meetings).toHaveLength(2);
    expect((await get('p-choir-member', '/api/governance/meetings')).body.meetings).toEqual([]);
    expect((await get('p-choir-leader', '/api/governance/meetings')).body.meetings[0].canWrite).toBe(true);
  });
  it('marking held records minutes and who came; only a planned meeting, only by someone who may write', async () => {
    const id = (await plan('p-choir-leader')).body.meeting.id;
    expect((await post('p-choir-member', `/api/governance/meetings/${id}/held`, {})).status).toBe(404);
    expect((await post('p-choir-leader', `/api/governance/meetings/${id}/held`, { attendeeIds: ['p-nobody'] })).body.code).toBe('UNKNOWN_ATTENDEE');
    const ok = await post('p-choir-leader', `/api/governance/meetings/${id}/held`, { minutes: 'We agreed to rehearse.', attendeeIds: ['p-choir-leader', 'p-vp', 'p-vp'] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(fake.__db.meeting[0]).toMatchObject({ status: 'HELD', minutes: 'We agreed to rehearse.' });
    const full = (await get('p-vp', `/api/governance/meetings/${id}`)).body.meeting;
    expect(full.attendees.map((a: any) => a.id).sort()).toEqual(['p-choir-leader', 'p-vp']);
    expect(full.minutes).toBe('We agreed to rehearse.');
    expect((await post('p-choir-leader', `/api/governance/meetings/${id}/held`, {})).body.code).toBe('NOT_PLANNED');
  });
  it('cancelling needs a reason and a planned meeting', async () => {
    const id = (await plan('p-choir-leader')).body.meeting.id;
    expect((await post('p-choir-leader', `/api/governance/meetings/${id}/cancel`, {})).status).toBe(400);
    expect((await post('p-choir-leader', `/api/governance/meetings/${id}/cancel`, { reason: 'Hall is closed' })).status).toBe(200);
    expect(fake.__db.meeting[0]).toMatchObject({ status: 'CANCELLED', cancelledReason: 'Hall is closed' });
    expect((await post('p-choir-leader', `/api/governance/meetings/${id}/cancel`, { reason: 'again' })).body.code).toBe('NOT_PLANNED');
  });
});

describe('the form options', () => {
  it('offer only units the person may draft in, and the meeting kinds from Settings', async () => {
    const choirLead = (await get('p-choir-leader', '/api/governance/options')).body;
    expect(choirLead.units.map((u: any) => u.id)).toEqual(['ou-choir']);
    expect(choirLead.meetingTypes.map((t: any) => t.code)).toContain('BOARD');
    expect((await get('p-pastor', '/api/governance/options')).body.units.map((u: any) => u.id).sort()).toEqual(['ou-choir', 'ou-church', 'ou-youth']);
    expect((await get('p-choir-member', '/api/governance/options')).body.units).toEqual([]);
  });
  it('follow a changed meeting-type setting', async () => {
    await request(app).put('/api/settings/meetings.types').set(bearer('p-pastor')).send({ value: [{ code: 'VIGIL', name: 'Prayer vigil' }] });
    expect((await get('p-choir-leader', '/api/governance/options')).body.meetingTypes).toEqual([{ code: 'VIGIL', name: 'Prayer vigil' }]);
    expect((await plan('p-choir-leader')).body.code).toBe('BAD_TYPE');
    expect((await plan('p-choir-leader', { typeCode: 'VIGIL' })).status).toBe(201);
  });
});

const draft = (as: string, body: object = {}) =>
  post(as, '/api/governance/decisions', { orgUnitId: 'ou-choir', title: 'Buy new robes', ...body });

describe('decisions', () => {
  it('are drafted by someone with Write, against a unit or a meeting', async () => {
    expect((await draft('p-choir-member')).status).toBe(403);
    expect((await draft('p-vp', { title: 'ab' })).status).toBe(400);
    expect((await draft('p-vp', { orgUnitId: 'ou-zzz' })).status).toBe(404);
    const ok = await draft('p-vp', { detail: 'Twenty robes.' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(fake.__db.decision[0]).toMatchObject({ title: 'Buy new robes', status: 'DRAFT', systemId: 'sys-choir', createdById: 'p-vp' });
    const mid = (await plan('p-choir-leader')).body.meeting.id;
    const viaMeeting = await post('p-vp', '/api/governance/decisions', { meetingId: mid, title: 'Rehearse on Fridays' });
    expect(viaMeeting.status).toBe(201);
    expect(fake.__db.decision[1]).toMatchObject({ meetingId: mid, orgUnitId: 'ou-choir' });
    expect((await get('p-vp', `/api/governance/meetings/${mid}`)).body.decisions.map((d: any) => d.title)).toEqual(['Rehearse on Fridays']);
  });
  it('a cancelled meeting takes none, and a meeting you cannot read does not exist', async () => {
    const mid = (await plan('p-choir-leader')).body.meeting.id;
    await post('p-choir-leader', `/api/governance/meetings/${mid}/cancel`, { reason: 'Hall closed' });
    expect((await post('p-vp', '/api/governance/decisions', { meetingId: mid, title: 'Whatever' })).body.code).toBe('MEETING_CANCELLED');
    expect((await post('p-choir-member', '/api/governance/decisions', { meetingId: mid, title: 'Whatever' })).status).toBe(404);
  });
  it('one about work must name an owner and a date that is real, not past, and an active person', async () => {
    expect((await draft('p-vp', { work: { dueDate: inDays(5) } })).body.code).toBe('WORK_NEEDS_OWNER_AND_DATE');
    expect((await draft('p-vp', { work: { ownerPersonId: 'p-choir-member' } })).body.code).toBe('WORK_NEEDS_OWNER_AND_DATE');
    expect((await draft('p-vp', { work: { ownerPersonId: 'p-choir-member', dueDate: '2020-01-01' } })).body.code).toBe('BAD_DATES');
    expect((await draft('p-vp', { work: { ownerPersonId: 'p-nobody', dueDate: inDays(5) } })).status).toBe(404);
    expect((await draft('p-vp', { work: { ownerPersonId: 'p-gone', dueDate: inDays(5) } })).body.code).toBe('PERSON_NOT_ACTIVE');
    expect(fake.__db.decision).toHaveLength(0);
    expect((await draft('p-vp', { work: { ownerPersonId: 'p-choir-member', dueDate: inDays(5) } })).status).toBe(201);
  });
});

describe('approving', () => {
  const make = async (work = true) => (await draft('p-vp', work ? { work: { ownerPersonId: 'p-choir-member', dueDate: inDays(10) } } : {})).body.decision.id as string;
  it('a decision about work becomes a task with its owner and date, and the owner is told', async () => {
    const id = await make();
    const r = await post('p-choir-leader', `/api/governance/decisions/${id}/approve`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.taskId).toBeTruthy();
    expect(fake.__db.workTask[0]).toMatchObject({ title: 'Buy new robes', ownerPersonId: 'p-choir-member', systemId: 'sys-choir', contextType: 'DECISION', contextId: id, status: 'TODO', createdByPersonId: 'p-choir-leader' });
    expect(new Date(fake.__db.workTask[0].dueDate).toISOString().slice(0, 10)).toBe(inDays(10));
    expect(fake.__db.decision[0]).toMatchObject({ status: 'APPROVED', decidedById: 'p-choir-leader', taskId: r.body.taskId });
    expect(fake.__db.auditEvent.find((e: any) => e.action === 'DECISION_APPROVED')).toMatchObject({ actorId: 'p-choir-leader' });
    const info = (await get('p-choir-member', '/api/notifications?tab=info')).body.items;
    expect(info.map((i: any) => i.title)).toContain('A decision gave you a task');
    expect((await get('p-choir-member', '/api/notifications?tab=waiting')).body.items.map((i: any) => i.title)).toContain('Buy new robes');
  });
  it('a decision with no work makes no task', async () => {
    const id = await make(false);
    expect((await post('p-choir-leader', `/api/governance/decisions/${id}/approve`)).body.taskId).toBeNull();
    expect(fake.__db.workTask ?? []).toHaveLength(0);
  });
  it('nobody approves their own, and nobody without an A letter approves at all', async () => {
    const mine = (await draft('p-choir-leader')).body.decision.id;
    expect((await post('p-choir-leader', `/api/governance/decisions/${mine}/approve`)).body.code).toBe('OWN_ENTRY');
    expect((await post('p-choir-leader', `/api/governance/decisions/${mine}/reject`, { reason: 'changed my mind' })).body.code).toBe('OWN_ENTRY');
    const id = await make();
    expect((await post('p-vp', `/api/governance/decisions/${id}/approve`)).body.code).toBe('NOT_ALLOWED');
    const board = (await post('p-sec', '/api/governance/decisions', { orgUnitId: 'ou-church', title: 'Open a savings account' })).body.decision.id;
    expect((await post('p-cat', `/api/governance/decisions/${board}/approve`)).body.code).toBe('NOT_ALLOWED');
    expect((await post('p-choir-member', `/api/governance/decisions/${id}/approve`)).status).toBe(404);
    expect((await post('p-pastor', `/api/governance/decisions/${board}/approve`)).status).toBe(200);
  });
  it('only a draft can be approved, turned down or withdrawn, and only once', async () => {
    const id = await make();
    await post('p-choir-leader', `/api/governance/decisions/${id}/approve`);
    expect((await post('p-choir-leader', `/api/governance/decisions/${id}/approve`)).body.code).toBe('NOT_DRAFT');
    expect((await post('p-choir-leader', `/api/governance/decisions/${id}/reject`, { reason: 'too late' })).body.code).toBe('NOT_DRAFT');
    expect((await post('p-vp', `/api/governance/decisions/${id}/withdraw`, { reason: 'too late' })).body.code).toBe('NOT_DRAFT');
    expect(fake.__db.workTask).toHaveLength(1);
  });
  it('turning down needs a reason and makes no task; withdrawing is the author’s alone', async () => {
    const id = await make();
    expect((await post('p-choir-leader', `/api/governance/decisions/${id}/reject`, {})).status).toBe(400);
    expect((await post('p-choir-leader', `/api/governance/decisions/${id}/reject`, { reason: 'No budget' })).status).toBe(200);
    expect(fake.__db.decision[0]).toMatchObject({ status: 'REJECTED', rejectReason: 'No budget' });
    expect(fake.__db.workTask ?? []).toHaveLength(0);
    const other = await make();
    expect((await post('p-choir-leader', `/api/governance/decisions/${other}/withdraw`, { reason: 'not mine' })).body.code).toBe('NOT_ALLOWED');
    expect((await post('p-vp', `/api/governance/decisions/${other}/withdraw`, { reason: 'Drafted too early' })).status).toBe(200);
    expect(fake.__db.decision[1]).toMatchObject({ status: 'WITHDRAWN', withdrawnReason: 'Drafted too early' });
  });
});

describe('the register', () => {
  beforeEach(async () => {
    await draft('p-vp', { title: 'Buy new robes', detail: 'Twenty robes' });
    await draft('p-vp', { title: 'Rehearse on Fridays' });
    await post('p-pastor', '/api/governance/decisions', { orgUnitId: 'ou-youth', title: 'Youth camp in December' });
    const first = fake.__db.decision[0].id;
    await post('p-choir-leader', `/api/governance/decisions/${first}/approve`);
  });
  const titles = (r: any) => r.body.decisions.map((d: any) => d.title).sort();
  it('lists what the reader may see, and searches and filters', async () => {
    expect(titles(await get('p-choir-leader', '/api/governance/decisions'))).toEqual(['Buy new robes', 'Rehearse on Fridays']);
    expect(titles(await get('p-pastor', '/api/governance/decisions'))).toHaveLength(3);
    expect(titles(await get('p-pastor', '/api/governance/decisions?status=APPROVED'))).toEqual(['Buy new robes']);
    expect(titles(await get('p-pastor', '/api/governance/decisions?q=fridays'))).toEqual(['Rehearse on Fridays']);
    expect(titles(await get('p-pastor', '/api/governance/decisions?q=twenty'))).toEqual(['Buy new robes']);
    expect(titles(await get('p-pastor', '/api/governance/decisions?unitId=ou-youth'))).toEqual(['Youth camp in December']);
    expect(titles(await get('p-pastor', '/api/governance/decisions?systemId=sys-choir'))).toEqual(['Buy new robes', 'Rehearse on Fridays']);
    expect((await get('p-choir-member', '/api/governance/decisions')).body.decisions).toEqual([]);
  });
  it('tells each reader whether they may approve or withdraw', async () => {
    const mine = (await get('p-choir-leader', '/api/governance/decisions')).body.decisions;
    const fridays = mine.find((d: any) => d.title === 'Rehearse on Fridays');
    expect(fridays).toMatchObject({ status: 'DRAFT', canApprove: true, canWithdraw: false, authorName: 'Choir VP' });
    const asVp = (await get('p-vp', '/api/governance/decisions')).body.decisions.find((d: any) => d.title === 'Rehearse on Fridays');
    expect(asVp).toMatchObject({ canApprove: false, canWithdraw: true });
    const done = mine.find((d: any) => d.title === 'Buy new robes');
    expect(done).toMatchObject({ status: 'APPROVED', canApprove: false, decidedByName: 'p-choir-leader' });
  });
});

describe('the Governance and Settings blocks in the menu', () => {
  const own = async (who: string, sys: string) => {
    const r = await get(who, '/api/me/capabilities');
    return r.body.systems.find((s: any) => s.id === sys)?.own;
  };
  it('Governance shows in every system where the person holds a Governance letter', async () => {
    expect((await own('p-choir-leader', 'sys-choir')).map((o: any) => o.key)).toEqual(['governance']);
    expect((await own('p-choir-leader', 'sys-choir'))[0].letters).toEqual(['R', 'W', 'A', 'S']);
    expect((await own('p-choir-member', 'sys-choir'))).toEqual([]);
    expect((await own('p-pastor', 'sys-youth')).map((o: any) => o.key)).toEqual(['governance', 'groups']);
  });
  it('Settings shows only in Central Administration, to the three offices (write) and Administrators (read)', async () => {
    expect((await own('p-pastor', 'sys-main')).map((o: any) => o.key)).toEqual(['central', 'governance', 'pulpit', 'collections', 'settings']);
    expect((await own('p-cat', 'sys-main')).find((o: any) => o.key === 'settings').letters).toEqual(['R', 'W']);
    expect((await own('p-sec', 'sys-main')).map((o: any) => o.key)).toContain('settings');
    expect((await own('p-choir-leader', 'sys-main')) ?? []).toEqual([]);
    fake.__db.person.push({ id: 'p-adm', fullName: 'Admin', status: 'ACTIVE' });
    fake.__db.position.push({ id: 'pos-adm', personId: 'p-adm', systemId: 'sys-media', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: new Date('2022-01-01') });
    expect((await own('p-adm', 'sys-main')).find((o: any) => o.key === 'settings').letters).toEqual(['R']);
  });
});
