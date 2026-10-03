/** Step 4 · slice 1 — People record privacy: Leader full, Catechist basic, others own profile only. */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { filterPerson, tierFor } from '../src/policy/personFields';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: any;
const db = () => fake.__db as Record<string, any[]>;

const SECRET = { dateOfBirth: '1990-02-03', nationalId: '1199080012345678', address: 'Kacyiru', pastoralNotes: 'private', gender: 'F', joinedChurchOn: '2015-01-01' };

beforeEach(async () => {
  fake.__reset();
  seedWorld(db());
  const d = db();
  d.auditEvent ??= [];
  d.person.push(
    { id: 'p-catechist', fullName: 'Catechist', status: 'ACTIVE' },
    { id: 'p-realpastor', fullName: 'Real Pastor', status: 'ACTIVE' },
  );
  d.membership.push(
    { id: 'm-ca', personId: 'p-catechist', systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'x', status: 'ACTIVE', startDate: new Date('2020-01-01') },
    { id: 'm-rp', personId: 'p-realpastor', systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'x', status: 'ACTIVE', startDate: new Date('2020-01-01') },
  );
  d.position.push(
    { id: 'pos-ca', personId: 'p-catechist', systemId: 'sys-main', title: 'Catechist', systemRole: 'CATECHIST', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2020-01-01') },
    { id: 'pos-rp', personId: 'p-realpastor', systemId: 'sys-main', title: 'Pastor', systemRole: 'PASTOR', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2020-01-01') },
  );
  Object.assign(d.person.find((p) => p.id === 'p-member')!, SECRET);
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('person field filter', () => {
  it('tiers', () => {
    expect(tierFor({ viewerId: 'a', targetId: 'b', canViewFull: true, canViewBasic: true })).toBe('FULL');
    expect(tierFor({ viewerId: 'a', targetId: 'b', canViewFull: false, canViewBasic: true })).toBe('BASIC');
    expect(tierFor({ viewerId: 'a', targetId: 'a', canViewFull: false, canViewBasic: false })).toBe('SELF');
    expect(tierFor({ viewerId: 'a', targetId: 'b', canViewFull: false, canViewBasic: false })).toBe('NONE');
  });
  it('basic drops identity data', () => {
    const out = filterPerson({ id: 'x', fullName: 'X', nationalId: '1', pastoralNotes: 'n' }, 'BASIC')!;
    expect(out).toEqual({ id: 'x', fullName: 'X' });
    expect(filterPerson({ id: 'x' }, 'NONE')).toBeNull();
  });
});

describe('GET /api/people/:id', () => {
  it('Church Leader sees every field', async () => {
    const r = await request(app).get('/api/people/p-member').set(bearer('p-pastor'));
    expect(r.status).toBe(200);
    expect(r.body.tier).toBe('FULL');
    expect(r.body.person.nationalId).toBe(SECRET.nationalId);
    expect(r.body.person.pastoralNotes).toBe('private');
  });
  it('Catechist sees contact and status only', async () => {
    const r = await request(app).get('/api/people/p-member').set(bearer('p-catechist'));
    expect(r.status).toBe(200);
    expect(r.body.tier).toBe('BASIC');
    expect(r.body.person.fullName).toBe('p-member');
    for (const k of Object.keys(SECRET)) expect(r.body.person, k).not.toHaveProperty(k);
  });
  it('Pastor cannot open another person, but can open own profile', async () => {
    expect((await request(app).get('/api/people/p-member').set(bearer('p-realpastor'))).status).toBe(403);
    const own = await request(app).get('/api/people/p-realpastor').set(bearer('p-realpastor'));
    expect(own.status).toBe(200);
    expect(own.body.tier).toBe('SELF');
  });
  it('an ordinary member opens only their own profile', async () => {
    expect((await request(app).get('/api/people/p-treasurer').set(bearer('p-member'))).status).toBe(403);
    const own = await request(app).get('/api/people/p-member').set(bearer('p-member'));
    expect(own.status).toBe(200);
    expect(own.body.person.nationalId).toBe(SECRET.nationalId);
  });
  it('the directory list never carries identity data', async () => {
    const r = await request(app).get('/api/people').set(bearer('p-pastor'));
    expect(r.status).toBe(200);
    for (const p of r.body.people) for (const k of Object.keys(SECRET)) expect(p).not.toHaveProperty(k);
  });
});

describe('PATCH /api/people/:id', () => {
  it('Church Leader edits identity data and it is audited', async () => {
    const r = await request(app).patch('/api/people/p-member').set(bearer('p-pastor')).send({ address: 'Remera', status: 'INACTIVE' });
    expect(r.status).toBe(200);
    expect(db().person.find((p) => p.id === 'p-member')!.address).toBe('Remera');
    expect(db().auditEvent.some((a) => a.resource === 'PERSON' && a.action === 'UPDATE')).toBe(true);
  });
  it('Catechist cannot edit anyone', async () => {
    const r = await request(app).patch('/api/people/p-member').set(bearer('p-catechist')).send({ phone: '1' });
    expect(r.status).toBe(403);
  });
  it('a member edits own contact details but not own status or national ID', async () => {
    const ok = await request(app).patch('/api/people/p-member').set(bearer('p-member')).send({ phone: '0788111222' });
    expect(ok.status).toBe(200);
    expect(db().person.find((p) => p.id === 'p-member')!.phone).toBe('0788111222');
    for (const body of [{ status: 'VISITOR' }, { nationalId: '9' }, { fullName: 'Hacker' }]) {
      const bad = await request(app).patch('/api/people/p-member').set(bearer('p-member')).send(body);
      expect(bad.status, JSON.stringify(body)).toBe(403);
    }
  });
  it('a member cannot edit someone else', async () => {
    const r = await request(app).patch('/api/people/p-treasurer').set(bearer('p-member')).send({ phone: '1' });
    expect(r.status).toBe(403);
  });
  it('oversized photo is refused', async () => {
    const r = await request(app).patch('/api/people/p-member').set(bearer('p-member')).send({ photoUrl: 'x'.repeat(50_000) });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/people/records', () => {
  it('Leader gets everyone with every field, paged', async () => {
    const all = await request(app).get('/api/people/records').set(bearer('p-pastor'));
    expect(all.body.tier).toBe('FULL');
    expect(all.body.total).toBe(db().person.length);
    const m = all.body.people.find((p: any) => p.id === 'p-member');
    expect(m.nationalId).toBe(SECRET.nationalId);
    const page = await request(app).get('/api/people/records?limit=3&offset=2').set(bearer('p-pastor'));
    expect(page.body.people).toHaveLength(3);
    expect(page.body.offset).toBe(2);
  });
  it('Catechist gets everyone, basic fields only', async () => {
    const r = await request(app).get('/api/people/records').set(bearer('p-catechist'));
    expect(r.body.tier).toBe('BASIC');
    expect(r.body.people.length).toBe(db().person.length);
    for (const p of r.body.people) {
      if (p.id === 'p-catechist') continue;
      for (const k of Object.keys(SECRET)) expect(p, k).not.toHaveProperty(k);
    }
  });
  it('Pastor and members get only their own record', async () => {
    for (const who of ['p-realpastor', 'p-member']) {
      const r = await request(app).get('/api/people/records').set(bearer(who));
      expect(r.body.tier).toBe('SELF');
      expect(r.body.people.map((p: any) => p.id)).toEqual([who]);
    }
  });
  it('anonymous is refused', async () => {
    expect((await request(app).get('/api/people/records')).status).toBe(401);
  });
});

describe('ministry leaders get names only', () => {
  it('records and directory carry no phone or email for a ministry president', async () => {
    const rec = await request(app).get('/api/people/records').set(bearer('p-choir-leader'));
    expect(rec.body.tier).toBe('DIRECTORY');
    const other = rec.body.people.find((p: any) => p.id === 'p-member');
    expect(Object.keys(other).sort()).toEqual(['fullName', 'id', 'status']);
    const list = await request(app).get('/api/people').set(bearer('p-choir-leader'));
    expect(Object.keys(list.body.people[0]).every((k) => ['id', 'fullName', 'preferredName', 'status'].includes(k))).toBe(true);
    expect((await request(app).patch('/api/people/p-member').set(bearer('p-choir-leader')).send({ phone: '1' })).status).toBe(403);
  });
});
