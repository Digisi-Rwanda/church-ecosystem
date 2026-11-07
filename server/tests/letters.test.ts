import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { canRead, canSend, canWrite, deliveryProblem, letterReference } from '../src/letters/rules';
import type { AccessData } from '../src/capabilities/engine';

const NOW = new Date('2026-10-06T12:00:00Z');
const pos = (id: string, personId: string, office: string, systemId: string) => ({ id, personId, office, systemId, orgUnitId: null as string | null, status: 'ACTIVE', startDate: '2020-01-01', endDate: null as string | null });
const data: AccessData = {
  positions: [
    pos('a', 'sec', 'CHURCH_SECRETARY', 'sys-main'),
    pos('b', 'cat', 'CATECHIST', 'sys-main'),
    pos('c', 'pres', 'PRESIDENT', 'sys-choir'),
    pos('d', 'vp', 'VICE_PRESIDENT', 'sys-choir'),
    pos('e', 'treas', 'TREASURER', 'sys-choir'),
  ],
  memberships: [],
  delegations: [],
};

describe('who reads, drafts and sends letters out', () => {
  it('S belongs to the Church Secretary and the President, not to the Vice President', () => {
    expect(canSend('sec', 'sys-main', data, NOW)).toBe(true);
    expect(canSend('pres', 'sys-choir', data, NOW)).toBe(true);
    expect(canSend('vp', 'sys-choir', data, NOW)).toBe(false);
    expect(canSend('cat', 'sys-main', data, NOW)).toBe(false);
    expect(canWrite('vp', 'sys-choir', data, NOW)).toBe(true);
    expect(canWrite('treas', 'sys-choir', data, NOW)).toBe(false);
    expect(canRead('treas', 'sys-choir', data, NOW)).toBe(true);
    expect(canRead('pres', 'sys-main', data, NOW)).toBe(false);
  });
  it('references are padded and delivery needs a method and a day not in the future', () => {
    expect(letterReference('KAC', 2026, 7)).toBe('KAC-2026-0007');
    expect(deliveryProblem({ method: 'HAND', deliveredOn: '2026-10-06' }, NOW)).toBeNull();
    expect(deliveryProblem({ method: 'FAX', deliveredOn: '2026-10-06' }, NOW)).toBe('METHOD');
    expect(deliveryProblem({ method: 'POST', deliveredOn: '2026-12-30' }, NOW)).toBe('DATE');
    expect(deliveryProblem({ method: 'POST', deliveredOn: 'soon' }, NOW)).toBe('DATE');
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const patch = (as: string, path: string, body: object = {}) => request(app).patch(path).set(bearer(as)).send(body);
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'letter', 'notification', 'notificationRead', 'preference']) db[k] ??= [];
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
    { id: 'p-sec', fullName: 'Church Secretary', status: 'ACTIVE' },
    { id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' },
  );
  db.position.push(
    { id: 'pos-sec', personId: 'p-sec', systemId: 'sys-main', title: 'Church Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const body = (o: object = {}) => ({ orgUnitId: 'ou-choir', typeCode: 'THANKS', subject: 'Thank you for the concert', body: 'Dear friends, thank you.', recipientName: 'Pastor Jean', ...o });
const draft = async (as = 'p-vp', o: object = {}) => (await post(as, '/api/letters', body(o))).body.letter?.id as string;

describe('drafting', () => {
  it('needs sign-in, a known unit, a type from Settings and a Write letter', async () => {
    expect((await request(app).post('/api/letters').send({})).status).toBe(401);
    expect((await post('p-vp', '/api/letters', {})).status).toBe(400);
    expect((await post('p-vp', '/api/letters', body({ orgUnitId: 'ou-zzz' }))).status).toBe(404);
    expect((await post('p-vp', '/api/letters', body({ orgUnitId: 'ou-loose' }))).body.code).toBe('UNIT_HAS_NO_SYSTEM');
    expect((await post('p-vp', '/api/letters', body({ typeCode: 'PARTY' }))).body.code).toBe('BAD_TYPE');
    expect((await post('p-choir-member', '/api/letters', body())).status).toBe(403);
    expect((await post('p-vp', '/api/letters', body({ orgUnitId: 'ou-youth' }))).status).toBe(403);
  });
  it('a vice president drafts for their own unit, with a reference, audited', async () => {
    const r = await post('p-vp', '/api/letters', body());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.letter.reference).toMatch(/^[A-Z0-9]+-\d{4}-0001$/);
    expect(fake.__db.letter[0]).toMatchObject({ status: 'DRAFT', systemId: 'sys-choir', createdById: 'p-vp' });
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'LETTER_DRAFTED')).toBe(true);
    const second = await post('p-vp', '/api/letters', body());
    expect(second.body.letter.reference).toMatch(/-0002$/);
  });
  it('only the author edits, and only before printing', async () => {
    const id = await draft();
    expect((await patch('p-choir-leader', `/api/letters/${id}`, { subject: 'Changed it' })).status).toBe(403);
    expect((await patch('p-vp', `/api/letters/${id}`, { subject: 'Thank you again' })).status).toBe(200);
    await post('p-choir-leader', `/api/letters/${id}/print`);
    expect((await patch('p-vp', `/api/letters/${id}`, { subject: 'Too late now' })).body.code).toBe('ALREADY_PRINTED');
  });
});

describe('reading', () => {
  it('lists and opens letters only for those with Governance R in the system', async () => {
    const id = await draft();
    expect((await get('p-choir-leader', '/api/letters')).body.letters).toHaveLength(1);
    expect((await get('p-pastor', '/api/letters')).body.letters).toHaveLength(1);
    expect((await get('p-youth-leader', '/api/letters')).body.letters).toHaveLength(0);
    expect((await get('p-youth-leader', `/api/letters/${id}`)).status).toBe(404);
    expect((await get('p-choir-member', `/api/letters/${id}`)).status).toBe(404);
    const one = await get('p-choir-leader', `/api/letters/${id}`);
    expect(one.body.letter).toMatchObject({ subject: 'Thank you for the concert', canSend: true, canEdit: false });
    expect((await get('p-vp', `/api/letters/${id}`)).body.letter).toMatchObject({ canSend: false, canEdit: true });
  });
  it('filters by status and text', async () => {
    await draft();
    await draft('p-vp', { subject: 'Invitation to Easter', recipientName: 'Mayor' });
    expect((await get('p-choir-leader', '/api/letters?q=easter')).body.letters).toHaveLength(1);
    expect((await get('p-choir-leader', '/api/letters?status=DELIVERED')).body.letters).toHaveLength(0);
  });
});

describe('printing and delivery', () => {
  it('only S prints, printing is recorded once, and the copy carries the church and the text', async () => {
    const id = await draft();
    expect((await post('p-vp', `/api/letters/${id}/print`)).status).toBe(403);
    const r = await post('p-choir-leader', `/api/letters/${id}/print`);
    expect(r.status).toBe(200);
    expect(r.body.print).toMatchObject({ subject: 'Thank you for the concert', recipientName: 'Pastor Jean', unitName: 'Choir' });
    expect(r.body.print.church).toBeTruthy();
    await post('p-choir-leader', `/api/letters/${id}/print`);
    expect(fake.__db.auditEvent.filter((e: any) => e.action === 'LETTER_PRINTED')).toHaveLength(1);
  });
  it('delivery needs S, a printed copy, a method and a day not in the future', async () => {
    const id = await draft();
    const deliver = (as: string, b: object) => post(as, `/api/letters/${id}/deliver`, b);
    expect((await deliver('p-choir-leader', { method: 'HAND', deliveredOn: today() })).body.code).toBe('NOT_PRINTED');
    await post('p-choir-leader', `/api/letters/${id}/print`);
    expect((await deliver('p-vp', { method: 'HAND', deliveredOn: today() })).status).toBe(403);
    expect((await deliver('p-choir-leader', { method: 'FAX', deliveredOn: today() })).body.code).toBe('BAD_METHOD');
    expect((await deliver('p-choir-leader', { method: 'HAND', deliveredOn: '2099-01-01' })).body.code).toBe('BAD_DATES');
    expect((await deliver('p-choir-leader', { method: 'HAND', deliveredOn: today(), note: 'Given to his secretary' })).status).toBe(200);
    expect(fake.__db.letter[0]).toMatchObject({ status: 'DELIVERED', deliveryMethod: 'HAND', deliveredById: 'p-choir-leader' });
    expect((await deliver('p-choir-leader', { method: 'HAND', deliveredOn: today() })).body.code).toBe('NOT_DRAFT');
    expect((await post('p-vp', `/api/letters/${id}/withdraw`, { reason: 'Mistake made' })).body.code).toBe('NOT_DRAFT');
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'LETTER_DELIVERED')).toBe(true);
  });
  it('the author or a sender withdraws a draft with a reason; nobody else', async () => {
    const id = await draft();
    expect((await post('p-vp', `/api/letters/${id}/withdraw`, {})).status).toBe(400);
    expect((await post('p-choir-member', `/api/letters/${id}/withdraw`, { reason: 'Because' })).status).toBe(404);
    expect((await post('p-choir-leader', `/api/letters/${id}/withdraw`, { reason: 'Wrong recipient' })).status).toBe(200);
    expect(fake.__db.letter[0]).toMatchObject({ status: 'WITHDRAWN', withdrawnReason: 'Wrong recipient' });
    const other = await draft();
    expect((await post('p-vp', `/api/letters/${other}/withdraw`, { reason: 'Changed my mind' })).status).toBe(200);
  });
});

describe('options', () => {
  it('offers the units the person may draft in, the types from Settings and the delivery methods', async () => {
    const r = await get('p-vp', '/api/letters/options');
    expect(r.body.units.map((u: any) => u.id)).toEqual(['ou-choir']);
    expect(r.body.letterTypes.length).toBeGreaterThan(0);
    expect(r.body.deliveryMethods).toContain('POST');
    expect((await get('p-choir-member', '/api/letters/options')).body.units).toEqual([]);
  });
});
