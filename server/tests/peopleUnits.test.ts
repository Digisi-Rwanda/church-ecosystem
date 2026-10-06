/** Slice 1.2 — archive, duplicate names, one office record, unit kind, membership without type. */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normaliseName, normalisePhone } from '../src/lib/codes';
import { backfillStructure, legacyColumnsFor, officeOf, unitKindOf } from '../src/lib/offices';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: any;
const db = () => fake.__db as Record<string, any[]>;
const as = (who: string) => ({
  post: (url: string, body: object = {}) => request(app).post(url).set(bearer(who)).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set(bearer(who)).send(body),
  get: (url: string) => request(app).get(url).set(bearer(who)),
});

beforeEach(async () => {
  fake.__reset();
  seedWorld(db());
  db().auditEvent ??= [];
  db().orgUnit ??= [];
  app = (await import('../src/app.js')).createApp();
});

describe('office record and unit kind helpers', () => {
  it('reads one office code from the old columns, and the new record wins', () => {
    expect(officeOf({ systemRole: 'CHURCH_LEADER' })).toBe('CHURCH_LEADER');
    expect(officeOf({ systemRole: 'PASTOR' })).toBe('CHURCH_LEADER');
    expect(officeOf({ ministryOffice: 'VP' })).toBe('VICE_PRESIDENT');
    expect(officeOf({ choirOffice: 'SECRETARY' })).toBe('SECRETARY');
    expect(officeOf({ protocolOffice: 'COORDINATOR' })).toBe('COORDINATOR');
    expect(officeOf({ systemAdmin: true })).toBe('ADMINISTRATOR');
    expect(officeOf({ systemRole: 'CHURCH_TREASURER' })).toBe(null);
    expect(officeOf({ office: 'TREASURER', ministryOffice: 'PRESIDENT' })).toBe('TREASURER');
  });
  it('writes the old columns for a new office code', () => {
    expect(legacyColumnsFor('CATECHIST')).toEqual({ systemRole: 'CATECHIST' });
    expect(legacyColumnsFor('VICE_PRESIDENT')).toEqual({ ministryOffice: 'VP' });
    expect(legacyColumnsFor('ADMINISTRATOR')).toEqual({});
  });
  it('works out a unit kind from the older type and place in the tree', () => {
    expect(unitKindOf({ type: 'ORGANISATION' })).toBe('CENTRAL');
    expect(unitKindOf({ type: 'ORGANISATION', parentId: 'ou-church' })).toBe('ORGANISATION');
    expect(unitKindOf({ type: 'MINISTRY' })).toBe('MINISTRY');
    expect(unitKindOf({ type: 'OFFICE' })).toBe('TEAM');
    expect(unitKindOf({ kind: 'MINISTRY', type: 'TEAM' })).toBe('MINISTRY');
  });
  it('fills in missing offices and kinds once, and never overwrites', async () => {
    db().position.push({ id: 'pos-x', personId: 'p-member', ministryOffice: 'VP', status: 'ACTIVE' });
    db().orgUnit.push({ id: 'ou-1', name: 'A', type: 'MINISTRY' }, { id: 'ou-2', name: 'B', type: 'TEAM', kind: 'MINISTRY' });
    const first = await backfillStructure(fake);
    expect(first.kinds).toBe(1);
    expect(db().orgUnit.find((u) => u.id === 'ou-2')!.kind).toBe('MINISTRY');
    expect(db().position.find((p) => p.id === 'pos-x')!.office).toBe('VICE_PRESIDENT');
    expect(await backfillStructure(fake)).toEqual({ offices: 0, kinds: 0 });
  });
  it('compares names and phones loosely', () => {
    expect(normaliseName('Mukamana  Aline')).toBe(normaliseName('aline MUKAMANA'));
    expect(normaliseName('Éric')).toBe(normaliseName('eric'));
    expect(normalisePhone('+250 788 123 456')).toBe(normalisePhone('0788123456'));
  });
});

describe('duplicate names', () => {
  it('warns about a same-name person and lets the user confirm', async () => {
    const L = as('p-pastor');
    const a = await L.post('/api/people', { fullName: 'Aline Mukamana', phone: '0788123456' });
    expect(a.status).toBe(201);
    const again = await L.post('/api/people', { fullName: 'mukamana aline', phone: '+250788123456' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('POSSIBLE_DUPLICATE');
    expect(again.body.candidates[0].id).toBe(a.body.person.id);
    const ok = await L.post('/api/people', { fullName: 'mukamana aline', phone: '+250788123456', confirmDuplicate: true });
    expect(ok.status).toBe(201);
  });
  it('does not warn when the phone or birth date clearly differ', async () => {
    const L = as('p-pastor');
    await L.post('/api/people', { fullName: 'Aline Mukamana', phone: '0788123456', dateOfBirth: '1990-01-01' });
    const other = await L.post('/api/people', { fullName: 'Aline Mukamana', phone: '0799000111', dateOfBirth: '2001-05-05' });
    expect(other.status).toBe(201);
  });
  it('can be checked before the form is sent', async () => {
    const L = as('p-pastor');
    await L.post('/api/people', { fullName: 'Aline Mukamana' });
    const r = await L.get('/api/people/check-duplicate?fullName=Aline%20Mukamana');
    expect(r.status).toBe(200);
    expect(r.body.candidates).toHaveLength(1);
    expect((await as('p-member').get('/api/people/check-duplicate?fullName=x')).status).toBe(403);
  });
});

describe('archive', () => {
  it('archives a person: out of the directory, memberships ended, code kept, audited', async () => {
    const L = as('p-pastor');
    const made = await L.post('/api/people', { fullName: 'Aline Mukamana' });
    const id = made.body.person.id;
    db().membership.push({ id: 'm-a', personId: id, systemId: 'sys-main', status: 'ACTIVE', startDate: new Date('2020-01-01') });
    const r = await L.post(`/api/people/${id}/archive`, { reason: 'Moved away' });
    expect(r.status).toBe(200);
    expect(r.body.person.archivedAt).toBeTruthy();
    expect(r.body.person.memberCode).toBe(made.body.person.memberCode);
    expect(db().membership.find((m) => m.id === 'm-a')!.status).toBe('ENDED');
    const list = await L.get('/api/people');
    expect(list.body.people.map((p: any) => p.id)).not.toContain(id);
    const archived = await L.get('/api/people?archived=true');
    expect(archived.body.people.map((p: any) => p.id)).toEqual([id]);
    expect(db().auditEvent.some((a) => a.action === 'ARCHIVE' && a.detail === id)).toBe(true);
    const back = await L.post(`/api/people/${id}/unarchive`);
    expect(back.body.person.archivedAt).toBeNull();
    expect((await L.get('/api/people')).body.people.map((p: any) => p.id)).toContain(id);
  });
  it('refuses while the person holds an active office, and refuses archiving yourself', async () => {
    const L = as('p-pastor');
    const holds = await L.post('/api/people/p-choir-leader/archive');
    expect(holds.status).toBe(409);
    expect(holds.body.code).toBe('HOLDS_OFFICE');
    const self = await L.post('/api/people/p-pastor/archive');
    expect(self.status).toBe(409);
    expect(self.body.code).toBe('CANNOT_ARCHIVE_SELF');
  });
  it('is for people managers only', async () => {
    for (const who of ['p-member', 'p-choir-leader', 'p-treasurer']) {
      expect((await as(who).post('/api/people/p-youth-member/archive')).status, who).toBe(403);
    }
  });
});

describe('one office record', () => {
  it('stores the office code, and fills the old columns for the old app', async () => {
    const L = as('p-pastor');
    const r = await L.post('/api/participation/positions', { personId: 'p-member', title: 'Vice President', systemId: 'sys-choir', office: 'VICE_PRESIDENT' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.position.office).toBe('VICE_PRESIDENT');
    expect(r.body.position.ministryOffice).toBe('VP');
    const list = await L.get('/api/participation/records');
    expect(list.body.positions.find((p: any) => p.id === r.body.position.id).office).toBe('VICE_PRESIDENT');
  });
  it('reports the office of an older record that only has the old columns', async () => {
    const list = await as('p-pastor').get('/api/participation/records');
    expect(list.body.positions.find((p: any) => p.id === 'pos-choir').office).toBe('PRESIDENT');
    expect(list.body.positions.find((p: any) => p.id === 'pos-pastor').office).toBe('CHURCH_LEADER');
  });
  it('treats church-wide offices as church-wide authority', async () => {
    const K = as('p-choir-leader');
    const r = await K.post('/api/participation/positions', { personId: 'p-member', title: 'Leader', systemId: 'sys-choir', office: 'CHURCH_LEADER' });
    expect(r.status).toBe(403);
    const admin = await as('p-pastor').post('/api/participation/positions', { personId: 'p-member', title: 'Administrator', systemId: 'sys-media', office: 'ADMINISTRATOR' });
    expect(admin.status).toBe(201);
  });
  it('still refuses a second active Church Leader given as an office code', async () => {
    const r = await as('p-pastor').post('/api/participation/positions', { personId: 'p-member', title: 'Church Leader', systemId: 'sys-main', office: 'CHURCH_LEADER' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('ONE_CHURCH_LEADER');
  });
});

describe('units and memberships', () => {
  it('gives each new unit a kind, chosen or worked out', async () => {
    const L = as('p-pastor');
    const a = await L.post('/api/participation/org-units', { name: 'Ushers', type: 'TEAM' });
    expect(a.body.orgUnit.kind).toBe('TEAM');
    const b = await L.post('/api/participation/org-units', { name: 'Youth', type: 'MINISTRY' });
    expect(b.body.orgUnit.kind).toBe('MINISTRY');
    const c = await L.post('/api/participation/org-units', { name: 'Odd', type: 'TEAM', kind: 'ORGANISATION' });
    expect(c.body.orgUnit.kind).toBe('ORGANISATION');
    const list = await L.get('/api/participation/records');
    expect(list.body.orgUnits.find((u: any) => u.id === a.body.orgUnit.id).kind).toBe('TEAM');
  });
  it('adds a membership without any type', async () => {
    const r = await as('p-pastor').post('/api/participation/memberships', { personId: 'p-outsider', systemId: 'sys-main' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.membership.status).toBe('ACTIVE');
  });
});
