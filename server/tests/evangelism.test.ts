import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { phoneOk } from '../src/evangelism/rules';

describe('evangelism rules', () => {
  it('phone numbers', () => {
    expect(phoneOk('')).toBe(true);
    expect(phoneOk(null)).toBe(true);
    expect(phoneOk('+250 788 123 456')).toBe(true);
    expect(phoneOk('12')).toBe(false);
    expect(phoneOk('call me')).toBe(false);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const patch = (as: string, path: string, body: object = {}) => request(app).patch(path).set(bearer(as)).send(body);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'evangelismContact', 'contactFollowUp', 'guestPreacher', 'pulpitSlot']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.position.push({ id: 'pos-evang', personId: 'p-outsider', systemId: 'sys-evangelism', title: 'Evangelism Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const contact = (o: object = {}) => ({ fullName: 'Jean Claude', phone: '0788123456', howMet: 'Market outreach', metOn: '2026-10-01', ...o });

describe('contacts', () => {
  it('the Evangelism leader and the Church Leader add contacts; others cannot see them', async () => {
    expect((await post('p-outsider', '/api/evangelism/contacts', contact())).status).toBe(201);
    expect((await post('p-pastor', '/api/evangelism/contacts', contact({ fullName: 'Marie' }))).status).toBe(201);
    expect((await get('p-pastor', '/api/evangelism/contacts')).body.contacts).toHaveLength(2);
    expect((await get('p-member', '/api/evangelism/contacts')).status).toBe(404);
    expect((await post('p-member', '/api/evangelism/contacts', contact())).status).toBe(403);
  });
  it('checks phone, date and assignee', async () => {
    expect((await post('p-outsider', '/api/evangelism/contacts', contact({ phone: 'abc' }))).body.code).toBe('BAD_PHONE');
    expect((await post('p-outsider', '/api/evangelism/contacts', contact({ metOn: '2999-01-01' }))).body.code).toBe('BAD_DATE');
    expect((await post('p-outsider', '/api/evangelism/contacts', contact({ assignedToId: 'nobody' }))).body.code).toBe('PERSON_NOT_ACTIVE');
  });
  it('a follow-up moves a new contact to following, and an overdue next visit is flagged first', async () => {
    const id = (await post('p-outsider', '/api/evangelism/contacts', contact())).body.id;
    expect((await post('p-outsider', `/api/evangelism/contacts/${id}/followups`, { doneOn: '2026-10-03', note: 'Called, will come Sunday', nextOn: '2026-10-05' })).status).toBe(201);
    const list = (await get('p-outsider', '/api/evangelism/contacts')).body.contacts;
    expect(list[0]).toMatchObject({ status: 'FOLLOWING', lastFollowUpOn: '2026-10-03', nextOn: '2026-10-05', overdue: true });
    const one = await get('p-outsider', `/api/evangelism/contacts/${id}`);
    expect(one.body.followUps).toHaveLength(1);
    expect(one.body.contact.canWrite).toBe(true);
  });
  it('rejects future follow-ups and follow-ups on closed contacts', async () => {
    const id = (await post('p-outsider', '/api/evangelism/contacts', contact())).body.id;
    expect((await post('p-outsider', `/api/evangelism/contacts/${id}/followups`, { doneOn: '2026-10-20', note: 'x' })).body.code).toBe('FUTURE_DATE');
    expect((await post('p-outsider', `/api/evangelism/contacts/${id}/status`, { status: 'JOINED' })).status).toBe(200);
    expect((await post('p-outsider', `/api/evangelism/contacts/${id}/followups`, { doneOn: '2026-10-03', note: 'x' })).body.code).toBe('WRONG_STATE');
    expect((await get('p-outsider', '/api/evangelism/contacts?status=JOINED')).body.contacts).toHaveLength(1);
  });
  it('assigns a contact and audits', async () => {
    const id = (await post('p-outsider', '/api/evangelism/contacts', contact())).body.id;
    expect((await post('p-outsider', `/api/evangelism/contacts/${id}/assign`, { personId: 'p-member' })).status).toBe(200);
    expect((await get('p-outsider', '/api/evangelism/contacts')).body.contacts[0].assignedToId).toBe('p-member');
    expect(fake.__db.auditEvent.some((a: any) => a.action === 'CONTACT_ASSIGNED')).toBe(true);
  });
});

describe('pulpit plan', () => {
  const slot = (o: object = {}) => ({ serviceOn: '2026-10-11', personId: 'p-treasurer', theme: 'Grace', bibleText: 'Eph 2:8', ...o });
  it('plans services; the Church Leader may overwrite what Evangelism planned', async () => {
    const id = (await post('p-outsider', '/api/evangelism/pulpit/slots', slot())).body.id;
    expect(id).toBeTruthy();
    expect((await patch('p-pastor', `/api/evangelism/pulpit/slots/${id}`, { theme: 'Faith', personId: 'p-member' })).status).toBe(200);
    const list = (await get('p-pastor', '/api/evangelism/pulpit/slots')).body;
    expect(list.canWrite).toBe(true);
    expect(list.slots[0]).toMatchObject({ theme: 'Faith', preacherId: 'p-member' });
  });
  it('one service per day, and a member or a guest, not both', async () => {
    await post('p-outsider', '/api/evangelism/pulpit/slots', slot());
    expect((await post('p-outsider', '/api/evangelism/pulpit/slots', slot())).body.code).toBe('ALREADY_EXISTS');
    const g = (await post('p-outsider', '/api/evangelism/pulpit/guests', { name: 'Pastor Eric' })).body.id;
    expect((await post('p-outsider', '/api/evangelism/pulpit/slots', slot({ serviceOn: '2026-10-18', guestId: g }))).body.code).toBe('ONE_PREACHER');
    expect((await post('p-outsider', '/api/evangelism/pulpit/slots', slot({ serviceOn: '2026-10-18', personId: null, guestId: g }))).status).toBe(201);
  });
  it('guest preachers: details need People letters; the plan shows only the name', async () => {
    const g = (await post('p-outsider', '/api/evangelism/pulpit/guests', { name: 'Pastor Eric', church: 'Remera', phone: '0788000111' })).body.id;
    await post('p-outsider', '/api/evangelism/pulpit/slots', slot({ serviceOn: '2026-10-04', personId: null, guestId: g }));
    const guests = (await get('p-pastor', '/api/evangelism/pulpit/guests')).body.guests;
    expect(guests[0]).toMatchObject({ name: 'Pastor Eric', visits: 1, lastVisitOn: '2026-10-04' });
    expect((await get('p-member', '/api/evangelism/pulpit/guests')).status).toBe(404);
    const plan = (await get('p-outsider', '/api/evangelism/pulpit/slots')).body.slots[0];
    expect(plan.preacherName).toBe('Pastor Eric');
    expect(plan.isGuest).toBe(true);
    expect((await post('p-outsider', `/api/evangelism/pulpit/guests/${g}/archive`)).status).toBe(200);
    expect((await get('p-pastor', '/api/evangelism/pulpit/guests')).body.guests).toHaveLength(0);
  });
  it('cancelling frees the day; plain people cannot change the plan', async () => {
    const id = (await post('p-outsider', '/api/evangelism/pulpit/slots', slot())).body.id;
    expect((await patch('p-member', `/api/evangelism/pulpit/slots/${id}`, { status: 'CANCELLED' })).status).toBeGreaterThanOrEqual(403);
    expect((await patch('p-outsider', `/api/evangelism/pulpit/slots/${id}`, { status: 'CANCELLED' })).status).toBe(200);
    expect((await post('p-outsider', '/api/evangelism/pulpit/slots', slot())).status).toBe(201);
  });
});

describe('own blocks', () => {
  it('Contacts, Pulpit and Collections appear in Evangelism; the Church Leader sees Pulpit in Central', async () => {
    const caps = await get('p-pastor', '/api/me/capabilities');
    const keys = (id: string) => caps.body.systems.find((s: any) => s.id === id)?.own.map((o: any) => o.key) ?? [];
    expect(keys('sys-evangelism')).toEqual(expect.arrayContaining(['contacts', 'pulpit', 'collections']));
    expect(keys('sys-main')).toEqual(expect.arrayContaining(['pulpit', 'collections']));
  });
});
