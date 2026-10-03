/** Step 4 · slice 2 — memberships, positions, org units: who may change them, who may see them. */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: any;
const db = () => fake.__db as Record<string, any[]>;
const as = (who: string) => ({
  post: (url: string, body: object) => request(app).post(url).set(bearer(who)).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set(bearer(who)).send(body),
  get: (url: string) => request(app).get(url).set(bearer(who)),
});

beforeEach(async () => {
  fake.__reset();
  seedWorld(db());
  db().auditEvent ??= [];
  db().orgUnit ??= [];
  db().person.push({ id: 'p-catechist', fullName: 'Catechist', status: 'ACTIVE' });
  db().membership.push({ id: 'm-ca', personId: 'p-catechist', systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'x', status: 'ACTIVE', startDate: new Date('2020-01-01') });
  db().position.push({ id: 'pos-ca', personId: 'p-catechist', systemId: 'sys-main', title: 'Catechist', systemRole: 'CATECHIST', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2020-01-01') });
  db().orgUnit.push({ id: 'ou-choir', name: 'Choir', type: 'MINISTRY', systemId: 'sys-choir' });
  app = (await import('../src/app.js')).createApp();
});

describe('who may change belonging and authority', () => {
  it('Church Leader adds an org unit, a member and an appointment — all audited', async () => {
    const L = as('p-pastor');
    expect((await L.post('/api/participation/org-units', { name: 'Ushers', type: 'TEAM' })).status).toBe(201);
    expect((await L.post('/api/participation/memberships', { personId: 'p-member', type: 'CHURCH_MEMBER', systemId: 'sys-main' })).status).toBe(201);
    const pos = await L.post('/api/participation/positions', { personId: 'p-member', title: 'Treasurer', systemId: 'sys-finance', systemRole: 'CHURCH_TREASURER' });
    expect(pos.status).toBe(201);
    const actions = db().auditEvent.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['ORG_UNIT_CREATE', 'MEMBERSHIP_CREATE', 'POSITION_CREATE']));
  });

  it('an ordinary member and a treasurer change nothing', async () => {
    for (const who of ['p-member', 'p-treasurer', 'p-outsider']) {
      const c = as(who);
      expect((await c.post('/api/participation/org-units', { name: 'X', type: 'TEAM' })).status, who).toBe(403);
      expect((await c.post('/api/participation/memberships', { personId: 'p-member', type: 'CHURCH_MEMBER', systemId: 'sys-main' })).status, who).toBe(403);
      expect((await c.post('/api/participation/positions', { personId: who, title: 'Boss' })).status, who).toBe(403);
    }
  });

  it('Catechist may enrol church members but not other ministries, appointments or org units', async () => {
    const K = as('p-catechist');
    expect((await K.post('/api/participation/memberships', { personId: 'p-outsider', type: 'CHURCH_MEMBER', systemId: 'sys-main' })).status).toBe(201);
    expect((await K.post('/api/participation/memberships', { personId: 'p-member', type: 'MINISTRY_MEMBER', systemId: 'sys-choir' })).status).toBe(403);
    expect((await K.post('/api/participation/positions', { personId: 'p-member', title: 'Boss' })).status).toBe(403);
    expect((await K.post('/api/participation/org-units', { name: 'X', type: 'TEAM' })).status).toBe(403);
  });

  it('a ministry president cannot change belonging or authority through this door', async () => {
    const C = as('p-choir-leader');
    expect((await C.post('/api/participation/memberships', { personId: 'p-member', type: 'MINISTRY_MEMBER', systemId: 'sys-choir' })).status).toBe(403);
    expect((await C.post('/api/participation/positions', { personId: 'p-choir-member', title: 'Secretary', systemId: 'sys-choir', ministryOffice: 'SECRETARY' })).status).toBe(403);
  });

  it('nobody but church leadership can grant church-wide authority', async () => {
    for (const who of ['p-catechist', 'p-choir-leader', 'p-member']) {
      for (const extra of [{ systemRole: 'CHURCH_LEADER' }, { grantsAllSystems: true }, { systemAdmin: true }]) {
        const r = await as(who).post('/api/participation/positions', { personId: who, title: 'Self-appointed', systemId: 'sys-main', ...extra });
        expect(r.status, `${who} ${JSON.stringify(extra)}`).toBe(403);
      }
    }
    expect(db().position.some((p) => p.title === 'Self-appointed')).toBe(false);
  });

  it('only leadership may end a church-wide position', async () => {
    const r = await as('p-catechist').patch('/api/participation/positions/pos-pastor', { status: 'ENDED' });
    expect(r.status).toBe(403);
    expect(db().position.find((p) => p.id === 'pos-pastor')!.status).toBe('ACTIVE');
  });

  it('ending a position takes effect in the access engine at once', async () => {
    const grantsOf = async () => {
      const { grantsForPerson } = await import('../src/policy/index.js');
      return (await grantsForPerson('p-treasurer')).filter((g: any) => g.source === 'POSITION');
    };
    expect((await grantsOf()).length).toBeGreaterThan(0);
    const end = await as('p-pastor').patch('/api/participation/positions/pos-treas', { status: 'ENDED', endDate: '2026-10-01' });
    expect(end.status).toBe(200);
    expect(db().position.find((p) => p.id === 'pos-treas')!.status).toBe('ENDED');
    expect(await grantsOf()).toEqual([]);
  });

  it('refuses an unknown person, a duplicate id and a malformed body', async () => {
    const L = as('p-pastor');
    expect((await L.post('/api/participation/memberships', { personId: 'nobody', type: 'CHURCH_MEMBER', systemId: 'sys-main' })).status).toBe(404);
    const body = { id: 'mem-dup-1', personId: 'p-member', type: 'CHURCH_MEMBER', systemId: 'sys-main' };
    expect((await L.post('/api/participation/memberships', body)).status).toBe(201);
    expect((await L.post('/api/participation/memberships', body)).status).toBe(409);
    expect((await L.post('/api/participation/memberships', { personId: 'p-member' })).status).toBe(400);
  });

  it('anonymous callers are refused', async () => {
    expect((await request(app).get('/api/participation/records')).status).toBe(401);
    expect((await request(app).post('/api/participation/positions').send({})).status).toBe(401);
  });
});

describe('who may see belonging and authority', () => {
  it('everyone sees the structure; a member sees only their own memberships', async () => {
    const r = await as('p-member').get('/api/participation/records');
    expect(r.status).toBe(200);
    expect(r.body.orgUnits.length).toBeGreaterThan(0);
    expect(r.body.memberships.every((m: any) => m.personId === 'p-member')).toBe(true);
  });
  it('others\' positions show who holds which office, but not the authority flags', async () => {
    const r = await as('p-member').get('/api/participation/records');
    const pastor = r.body.positions.find((p: any) => p.id === 'pos-pastor');
    expect(pastor.title).toBe('Senior Pastor');
    expect(pastor).not.toHaveProperty('systemRole');
    expect(pastor).not.toHaveProperty('grantsAllSystems');
  });
  it('the Church Leader and the Catechist see everyone\'s records in full', async () => {
    for (const who of ['p-pastor', 'p-catechist']) {
      const r = await as(who).get('/api/participation/records');
      expect(r.body.memberships.length, who).toBe(db().membership.length);
      expect(r.body.positions.find((p: any) => p.id === 'pos-pastor').systemRole, who).toBe('CHURCH_LEADER');
    }
  });
  it('a ministry president does not see other people\'s memberships', async () => {
    const r = await as('p-choir-leader').get('/api/participation/records');
    expect(r.body.memberships.every((m: any) => m.personId === 'p-choir-leader')).toBe(true);
  });
});
