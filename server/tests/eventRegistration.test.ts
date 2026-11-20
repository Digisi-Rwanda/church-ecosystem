import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'workPlan', 'workPlanNote', 'workPlanCheck', 'workPlanMilestone', 'workPlanRegistration', 'workPlanReview', 'workPlanIndicator', 'workPlanMeasure', 'workPlanRegistration']) db[k] ??= [];
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

const running = async (as = 'p-vp') => {
  const id = await draft({ planType: 'EVENT' });
  await post('p-vp', `${B}/${id}/submit`);
  await post('p-choir-leader', `${B}/${id}/approve`);
  await post('p-pastor', `${B}/${id}/approve`);
  return id;
};

describe('rules', () => {
  it('only a Google Form address over https is accepted', async () => {
    const { formUrlProblem } = await import('../src/routes/workPlans');
    expect(formUrlProblem('https://docs.google.com/forms/d/e/abc/viewform')).toBe(false);
    expect(formUrlProblem('https://forms.gle/AbC123')).toBe(false);
    expect(formUrlProblem('http://forms.gle/AbC123')).toBe(true);
    expect(formUrlProblem('https://evil.example.com/forms')).toBe(true);
    expect(formUrlProblem('https://docs.google.com/document/d/1')).toBe(true);
    expect(formUrlProblem('not a url')).toBe(true);
  });
  it('the attendance code works only while the event runs, on one of its days', async () => {
    const { checkinOpen } = await import('../src/routes/workPlans');
    const now = new Date('2026-11-29T10:00:00Z');
    expect(checkinOpen({ status: 'RUNNING', startsOn: '2026-11-29T05:00:00Z' }, now)).toBe(true);
    expect(checkinOpen({ status: 'RUNNING', startsOn: '2026-11-30T05:00:00Z' }, now)).toBe(false);
    expect(checkinOpen({ status: 'RUNNING', startsOn: '2026-11-27T05:00:00Z', endsOn: '2026-11-30T05:00:00Z' }, now)).toBe(true);
    expect(checkinOpen({ status: 'SETUP', startsOn: '2026-11-29T05:00:00Z' }, now)).toBe(false);
    expect(checkinOpen({ status: 'RUNNING' }, now)).toBe(true);
  });
});

describe('checklist words can be changed', () => {
  it('the manager edits an item; the words stay, the tick stays', async () => {
    const id = await running();
    await post('p-vp', `${B}/${id}/checks`, { label: 'Book the hal' });
    const k = fake.__db.workPlanCheck[0];
    const r = await patch('p-vp', `${B}/${id}/checks/${k.id}`, { label: 'Book the hall' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.plan.checks[0].label).toBe('Book the hall');
    expect((await patch('p-vp', `${B}/${id}/checks/${k.id}`, { label: '  ' })).status).toBe(400);
    expect((await patch('p-vp', `${B}/${id}/checks/${k.id}`, {})).status).toBe(400);
    expect((await patch('p-vp', `${B}/${id}/checks/${k.id}`, { done: true })).body.plan.checks[0]).toMatchObject({ label: 'Book the hall', done: true });
  });
  it('someone who may not change the checklist cannot reword it', async () => {
    const id = await running();
    await post('p-vp', `${B}/${id}/checks`, { label: 'Sound' });
    const k = fake.__db.workPlanCheck[0];
    expect((await patch('p-choir-member', `${B}/${id}/checks/${k.id}`, { label: 'Hacked' })).status).toBeGreaterThanOrEqual(403);
  });
});

describe('registration: the team registers people, a Google Form or a QR code brings the rest', () => {
  it('the team registers a member from the list of people, and a guest by name; none twice', async () => {
    const id = await running();
    await patch('p-vp', `${B}/${id}/registration`, { open: true });
    expect((await post('p-vp', `${B}/${id}/registrations`, { personId: 'p-choir-member' })).status).toBe(201);
    expect((await post('p-vp', `${B}/${id}/registrations`, { personId: 'p-choir-member' })).body.code).toBe('ALREADY_REGISTERED');
    expect((await post('p-vp', `${B}/${id}/registrations`, { name: 'Visitor One', phone: '0788000001' })).status).toBe(201);
    const reg = (await get('p-vp', `${B}/${id}`)).body.plan.registration;
    expect(reg.count).toBe(2);
    expect(reg.items.map((i: any) => i.name)).toContain('Visitor One');
  });
  it('a Google Form can be set, replaced and cleared; anything else is refused', async () => {
    const id = await running();
    expect((await patch('p-vp', `${B}/${id}/registration`, { formUrl: 'https://evil.example.com/x' })).body.code).toBe('BAD_FORM_URL');
    const ok = await patch('p-vp', `${B}/${id}/registration`, { open: true, formUrl: 'https://forms.gle/AbC123' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.plan.registration.formUrl).toBe('https://forms.gle/AbC123');
    expect(ok.body.plan.registration.publicToken).toBeTruthy();
    const token = ok.body.plan.registration.publicToken;
    const pub = await request(app).get(`/api/public/events/${token}`);
    expect(pub.body.event.formUrl).toBe('https://forms.gle/AbC123');
    expect((await patch('p-vp', `${B}/${id}/registration`, { formUrl: null })).body.plan.registration.formUrl).toBeNull();
    expect((await request(app).get(`/api/public/events/${token}`)).body.event.formUrl).toBeNull();
  });
  it('the code at the door marks a registered person here, adds a walk-in with a name, and asks for the name when unknown', async () => {
    const id = await running();
    const on = await patch('p-vp', `${B}/${id}/registration`, { open: true, publicLink: true });
    const token = on.body.plan.registration.publicToken;
    await post('p-vp', `${B}/${id}/registrations`, { name: 'Visitor One', phone: '0788 000 001' });
    const row = fake.__db.workPlan.find((p: any) => p.id === id);
    row.startsOn = new Date(Date.now() - 3600 * 1000);
    row.endsOn = new Date(Date.now() + 3600 * 1000);
    const url = `/api/public/events/${token}/checkin`;
    expect((await request(app).post(url).send({ phone: '0788000001' })).body).toMatchObject({ ok: true, name: 'Visitor One', walkIn: false });
    expect(fake.__db.workPlanRegistration.find((r: any) => r.name === 'Visitor One').attended).toBe(true);
    expect((await request(app).post(url).send({ phone: '0788999999' })).body.code).toBe('NOT_REGISTERED');
    const walk = await request(app).post(url).send({ phone: '0788999999', name: 'Walk In' });
    expect(walk.status).toBe(201);
    expect(fake.__db.workPlanRegistration.find((r: any) => r.name === 'Walk In')).toMatchObject({ attended: true, source: 'PUBLIC' });
    // another day: closed
    row.startsOn = new Date(Date.now() + 5 * 86400000);
    row.endsOn = null;
    expect((await request(app).post(url).send({ phone: '0788000001' })).body.code).toBe('CHECKIN_CLOSED');
    expect((await request(app).post(`/api/public/events/${'x'.repeat(24)}/checkin`).send({ phone: '0788000001' })).status).toBe(404);
  });
});
