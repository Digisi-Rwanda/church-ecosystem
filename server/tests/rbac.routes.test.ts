/**
 * RBAC route audit. Every test asserts the SECURE behaviour.
 * A failing test = a confirmed access-control defect (ID in the title).
 * Runs against an in-memory Prisma fake, so no DB is needed.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

let app: any;
const db = () => fake.__db as Record<string, any[]>;
const why = (r: any) => `status=${r.status} body=${JSON.stringify(r.body).slice(0, 300)}`;

beforeEach(async () => {
  fake.__reset();
  seedWorld(db());
  const { createApp } = await import('../src/app.js');
  app = createApp();
  const d = db();
  for (const k of ['financeTxn','contributionClaim','ssoHandoffToken','account'])
    d[k] ??= [];
  d.fund.push({ id: 'fund-choir-b', name: 'Choir B', code: 'CHB', kind: 'MINISTRY', orgUnitId: 'ou-cb', ownerSystemId: 'sys-choir', status: 'ACTIVE', currency: 'RWF' });
  d.fundAccessGrant.push({ id: 'fg-b', fundId: 'fund-choir-b', personId: 'p-choir-member', action: 'MANAGE', grantedByPersonId: 'p-choir-leader', reason: 't', status: 'ACTIVE', startDate: new Date('2021-01-01') });
  d.churchProject.push({ id: 'proj-deacon', name: 'Deacon relief', ownerSystemId: 'sys-deacon', status: 'PLANNED', beyondOwnerScope: false, stewardshipJson: null, approvalsJson: null, visibility: 'MINISTRY_PRIVATE', createdByPersonId: 'p-pastor' });
  d.program.push({ id: 'prog-deacon', name: 'Deacon program', ownerSystemId: 'sys-deacon', status: 'ACTIVE', stewardshipJson: null, visibility: 'MINISTRY_PRIVATE' });
  d.churchEvent.push(
    { id: 'ev-deacon', name: 'Deacon retreat', ownerSystemId: 'sys-deacon', status: 'CONFIRMED', visibility: 'MINISTRY_PRIVATE', beyondOwnerScope: false, capacity: null, startsAt: new Date('2026-12-01'), collaboratorSystemIds: '[]', collaboratorPersonIds: '[]', approvalsJson: null, createdByPersonId: 'p-pastor' },
    { id: 'ev-youth-pending', name: 'City crusade', ownerSystemId: 'sys-youth', status: 'PENDING_APPROVAL', visibility: 'CHURCH', beyondOwnerScope: true, capacity: null, startsAt: new Date('2026-12-01'), collaboratorSystemIds: '[]', collaboratorPersonIds: '[]', approvalsJson: null, createdByPersonId: 'p-youth-leader' },
  );
});

/* ───────────── A. Authentication ───────────── */
describe('A. authentication', () => {
  it('A1 every protected route rejects anonymous callers', async () => {
    const routes: [string, string][] = [
      ['get', '/api/people'], ['get', '/api/funds'], ['get', '/api/systems'],
      ['get', '/api/mission/projects'], ['post', '/api/assignments'],
      ['post', '/api/mission/shares'], ['post', '/api/mission/stewardship/used-cost'],
      ['get', '/api/authorize/grants'], ['post', '/api/sso/issue'],
    ];
    for (const [m, p] of routes) {
      const r = await (request(app) as any)[m](p).send({});
      expect(r.status, `${m} ${p}`).toBe(401);
    }
  });
  it('A2 forged token (wrong secret) is rejected', async () => {
    const t = jwt.sign({ sub: 'x', personId: 'p-pastor', username: 'x' }, 'wrong');
    const r = await request(app).get('/api/people').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(401);
  });
  it('A3 unsigned (alg=none) token is rejected', async () => {
    const b = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const t = `${b({ alg: 'none', typ: 'JWT' })}.${b({ sub: 'x', personId: 'p-pastor', username: 'x' })}.`;
    const r = await request(app).get('/api/people').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(401);
  });
  it('A4 expired token is rejected', async () => {
    const t = jwt.sign({ sub: 'x', personId: 'p-pastor', username: 'x' }, 'test-secret', { expiresIn: -10 });
    const r = await request(app).get('/api/people').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(401);
  });
  it('A5 token for an INACTIVE person / deleted account stops working', async () => {
    db().person.find((p) => p.id === 'p-member')!.status = 'INACTIVE';
    const r = await request(app).get('/api/people').set(bearer('p-member'));
    expect(r.status, why(r)).toBeGreaterThanOrEqual(401);
  });
  it('A6 token for a person that does not exist in the DB is rejected', async () => {
    const r = await request(app).get('/api/people').set(bearer('p-ghost'));
    expect(r.status, why(r)).toBeGreaterThanOrEqual(401);
  });
});

/* ───────────── B. Privilege escalation ───────────── */
describe('B. privilege escalation', () => {
  it('B1 a plain member cannot create an Assignment (which grants system ENTER)', async () => {
    const r = await request(app).post('/api/assignments').set(bearer('p-member')).send({
      personId: 'p-member', title: 'Deacon helper', contextType: 'PROJECT',
      contextId: 'proj-deacon', contextLabel: 'x', systemId: 'sys-deacon',
    });
    expect(r.status, why(r)).toBe(403);
  });
  it('B2 …and the escalation chain really works today (member self-assigns, then ENTERs Deacon)', async () => {
    await request(app).post('/api/assignments').set(bearer('p-member')).send({
      personId: 'p-member', title: 'x', contextType: 'PROJECT', contextId: 'proj-deacon', contextLabel: 'x', systemId: 'sys-deacon',
    });
    const probe = await request(app).post('/api/authorize/probe').set(bearer('p-member')).send({ systemId: 'sys-deacon', resource: 'SYSTEM', action: 'ENTER' });
    expect(probe.body.allowed, why(probe)).toBe(false);
  });
  it('B3 a plain member cannot assign someone else', async () => {
    const r = await request(app).post('/api/assignments').set(bearer('p-member')).send({
      personId: 'p-outsider', title: 'x', contextType: 'EVENT', contextId: 'e', contextLabel: 'x', systemId: 'sys-youth',
    });
    expect(r.status, why(r)).toBe(403);
  });
  it('B4 a plain member cannot create a MissionShare (MANAGE on someone else’s project)', async () => {
    const r = await request(app).post('/api/mission/shares').set(bearer('p-member')).send({
      kind: 'PROJECT', resourceId: 'proj-deacon', personId: 'p-member', action: 'MANAGE',
    });
    expect(r.status, why(r)).toBe(403);
  });
  it('B5 a plain member cannot list shares of resources they cannot see', async () => {
    db().missionShare.push({ id: 's1', kind: 'PROJECT', resourceId: 'proj-deacon', personId: 'p-pastor', action: 'VIEW', grantedByPersonId: 'p-pastor', status: 'ACTIVE', startDate: new Date() });
    const r = await request(app).get('/api/mission/shares?resourceId=proj-deacon').set(bearer('p-member'));
    expect(r.status, why(r)).toBe(403);
  });
  it('B6 a member cannot inject stewardship money into a Deacon project (designated-gift)', async () => {
    const r = await request(app).post('/api/mission/stewardship/designated-gift').set(bearer('p-member')).send({
      amount: 5_000_000, label: 'fake gift', fundId: 'fund-general', donationId: 'd-1', projectId: 'proj-deacon',
    });
    expect(r.status, why(r)).toBe(403);
  });
  it('B7 a member cannot inflate used-cost on a Deacon program (used-cost)', async () => {
    const r = await request(app).post('/api/mission/stewardship/used-cost').set(bearer('p-member')).send({
      amount: 1_000_000, programId: 'prog-deacon',
    });
    expect(r.status, why(r)).toBe(403);
  });
  it('B8 a member cannot read people contact details without any ministry role (outsider with no membership)', async () => {
    const r = await request(app).get('/api/people').set(bearer('p-outsider'));
    expect(r.status, why(r)).toBe(403);
  });
  it('B9 a member cannot create a Person record', async () => {
    const r = await request(app).post('/api/people').set(bearer('p-member')).send({ fullName: 'Planted Person' });
    expect(r.status, why(r)).toBe(403);
  });
});

/* ───────────── C. Authorize probe / grants (information disclosure) ───────────── */
describe('C. authorize endpoints', () => {
  it('C1 /authorize/grants refuses another person’s grants to a non-admin', async () => {
    const r = await request(app).get('/api/authorize/grants?personId=p-pastor').set(bearer('p-member'));
    expect(r.status, why(r)).toBe(403);
  });
  it('C2 /authorize/probe refuses probing as another person', async () => {
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-member')).send({ personId: 'p-pastor', systemId: 'sys-main', resource: 'SYSTEM', action: 'ENTER' });
    expect(r.status, why(r)).toBe(403);
  });
});

/* ───────────── D. Finance / vault isolation ───────────── */
describe('D. finance vaults', () => {
  it('D1 member cannot open a ministry vault', async () => {
    const r = await request(app).get('/api/funds/fund-choir').set(bearer('p-member'));
    expect(r.status, why(r)).toBe(403);
  });
  it('D2 pastor has NO implicit access to General Fund without a grant', async () => {
    const r = await request(app).get('/api/funds/fund-general').set(bearer('p-pastor'));
    expect(r.status, why(r)).toBe(403);
  });
  it('D3 treasurer of General cannot open the Choir vault', async () => {
    const r = await request(app).get('/api/funds/fund-choir').set(bearer('p-treasurer'));
    expect(r.status, why(r)).toBe(403);
  });
  it('D4 fund detail does not ship the full grant list (who else has access) to a VIEW-only user', async () => {
    db().fundAccessGrant.push({ id: 'fg-v', fundId: 'fund-choir', personId: 'p-member', action: 'VIEW', grantedByPersonId: 'p-choir-leader', reason: 't', status: 'ACTIVE', startDate: new Date('2021-01-01') });
    const spy = vi.spyOn(fake.fund, 'findUnique');
    const r = await request(app).get('/api/funds/fund-choir').set(bearer('p-member'));
    expect(r.status, why(r)).toBe(200);
    const include = spy.mock.calls[0]?.[0]?.include ?? {};
    expect(include.grants, 'route asks Prisma to include every FundAccessGrant row in the response').toBeFalsy();
  });
  it('D5 an expired fund grant confers nothing', async () => {
    db().fundAccessGrant.push({ id: 'fg-x', fundId: 'fund-choir', personId: 'p-outsider', action: 'MANAGE', grantedByPersonId: 'p-choir-leader', reason: 't', status: 'ACTIVE', startDate: new Date('2020-01-01'), endDate: new Date('2021-01-01') });
    const r = await request(app).get('/api/funds/fund-choir').set(bearer('p-outsider'));
    expect(r.status, why(r)).toBe(403);
  });
  it('D6 a revoked fund grant confers nothing', async () => {
    db().fundAccessGrant.push({ id: 'fg-r', fundId: 'fund-choir', personId: 'p-outsider', action: 'MANAGE', grantedByPersonId: 'p-choir-leader', reason: 't', status: 'REVOKED', startDate: new Date('2020-01-01') });
    const r = await request(app).get('/api/funds/fund-choir').set(bearer('p-outsider'));
    expect(r.status, why(r)).toBe(403);
  });
});

/* ───────────── E. Contribution claims ───────────── */
describe('E. contributions', () => {
  const seedClaims = () => {
    db().contributionClaim.push(
      { id: 'cl-a', systemId: 'sys-choir', fundId: 'fund-choir', orgUnitId: 'ou-c', personId: 'p-choir-leader', typeLabel: 'Tithe', amount: 1000, paymentMethod: 'CASH', occurredOn: new Date(), status: 'PENDING', submittedAt: new Date() },
      { id: 'cl-b', systemId: 'sys-choir', fundId: 'fund-choir-b', orgUnitId: 'ou-cb', personId: 'p-member', typeLabel: 'Tithe', amount: 2000, paymentMethod: 'CASH', occurredOn: new Date(), status: 'PENDING', submittedAt: new Date() },
    );
  };
  it('E1 treasurer of vault B cannot see vault A’s claims', async () => {
    seedClaims();
    const r = await request(app).get('/api/contributions?systemId=sys-choir').set(bearer('p-choir-member'));
    expect(r.status, why(r)).toBe(200);
    const ids = r.body.claims.map((c: any) => c.id);
    expect(ids, 'claims from a vault the caller does not manage').not.toContain('cl-a');
  });
  it('E2 treasurer of vault B cannot verify vault A’s claim', async () => {
    seedClaims();
    const r = await request(app).post('/api/contributions/cl-a/verify').set(bearer('p-choir-member')).send({ decision: 'CONFIRMED' });
    expect(r.status, why(r)).toBe(403);
  });
  it('E3 a manager cannot verify their own claim (separation of duties)', async () => {
    seedClaims();
    const r = await request(app).post('/api/contributions/cl-a/verify').set(bearer('p-choir-leader')).send({ decision: 'CONFIRMED' });
    expect(r.status, why(r)).toBe(403);
  });
  it('E4 concurrent double-verify posts the money only once', async () => {
    seedClaims();
    const [a, b] = await Promise.all([
      request(app).post('/api/contributions/cl-b/verify').set(bearer('p-choir-member')).send({ decision: 'CONFIRMED' }),
      request(app).post('/api/contributions/cl-b/verify').set(bearer('p-choir-member')).send({ decision: 'CONFIRMED' }),
    ]);
    const ok = [a, b].filter((r) => r.status === 200 || r.status === 201).length;
    expect(ok, `${a.status}/${b.status}`).toBe(1);
  });
  it('E5 outsider (no membership) cannot submit a claim into sys-main', async () => {
    const r = await request(app).post('/api/contributions').set(bearer('p-outsider')).send({ systemId: 'sys-choir', typeLabel: 't', amount: 10, paymentMethod: 'CASH', occurredOn: '2026-09-01' });
    expect(r.status, why(r)).toBe(403);
  });
});

/* ───────────── F. Mission lifecycle ───────────── */
describe('F. mission lifecycle', () => {
  it('F1 a MANAGE holder cannot bypass the approval chain by PATCHing status on a beyond-scope event', async () => {
    const r = await request(app).patch('/api/mission/events/ev-youth-pending').set(bearer('p-youth-leader')).send({ status: 'CONFIRMED' });
    expect(r.status, why(r)).toBeGreaterThanOrEqual(400);
  });
  it('F2 creating a beyond-scope event with status=CONFIRMED is forced to PENDING_APPROVAL', async () => {
    const r = await request(app).post('/api/mission/events').set(bearer('p-youth-leader')).send({
      name: 'Sneaky', ownerSystemId: 'sys-youth', startsAt: '2026-12-12', beyondOwnerScope: true, status: 'CONFIRMED',
    });
    expect(r.status, why(r)).toBe(201);
    expect(r.body.event.status).toBe('PENDING_APPROVAL');
  });
  it('F3 a member cannot self-register as ATTENDED', async () => {
    const r = await request(app).post('/api/mission/events/ev-deacon/registrations').set(bearer('p-member')).send({ personId: 'p-member', status: 'ATTENDED' });
    const row = db().eventRegistration.find((x) => x.eventId === 'ev-deacon' && x.personId === 'p-member');
    expect(row?.status, `stored status after self-registration (${r.status})`).not.toBe('ATTENDED');
  });
  it('F4 a member cannot register for a MINISTRY_PRIVATE event of a ministry they are not in', async () => {
    const r = await request(app).post('/api/mission/events/ev-deacon/registrations').set(bearer('p-member')).send({ personId: 'p-member' });
    expect(r.status, why(r)).toBe(403);
    expect(db().eventRegistration.some((x) => x.personId === 'p-member'), 'registration row was stored').toBe(false);
  });
  it('F5 a member cannot read a MINISTRY_PRIVATE event of another ministry', async () => {
    const r = await request(app).get('/api/mission/events/ev-deacon').set(bearer('p-outsider'));
    expect(r.status, why(r)).toBe(403);
  });
  it('F6 mission list endpoints do not leak MINISTRY_PRIVATE items to outsiders', async () => {
    const r = await request(app).get('/api/mission/events').set(bearer('p-outsider'));
    expect(r.status, why(r)).toBeLessThan(500);
    const ids = (r.body.events ?? []).map((e: any) => e.id);
    expect(ids).not.toContain('ev-deacon');
  });
  it('F7 a member cannot approve a project', async () => {
    db().churchProject.find((p) => p.id === 'proj-deacon')!.status = 'PENDING_APPROVAL';
    const r = await request(app).post('/api/mission/projects/proj-deacon/approve').set(bearer('p-member'));
    expect(r.status, why(r)).toBe(403);
  });
  it('F8 a leader whose position has ENDED cannot approve a project', async () => {
    db().position.push({ id: 'pos-old', personId: 'p-member', systemId: 'sys-main', title: 'Former Pastor', systemRole: 'CHURCH_LEADER', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2010-01-01'), endDate: new Date('2012-01-01') });
    db().churchProject.find((p) => p.id === 'proj-deacon')!.status = 'PENDING_APPROVAL';
    const r = await request(app).post('/api/mission/projects/proj-deacon/approve').set(bearer('p-member'));
    expect(r.status, why(r)).toBe(403);
  });
  it('F9 an expired governance position no longer grants ENTER to every system', async () => {
    db().position.push({ id: 'pos-old2', personId: 'p-outsider', systemId: 'sys-main', title: 'Former Pastor', systemRole: 'CHURCH_LEADER', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2010-01-01'), endDate: new Date('2012-01-01') });
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-outsider')).send({ systemId: 'sys-deacon', resource: 'SYSTEM', action: 'ENTER' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
  it('F10 a member without project access cannot read a project’s approval chain', async () => {
    const r = await request(app).get('/api/mission/projects/proj-deacon/approvals').set(bearer('p-outsider'));
    expect(r.status, why(r)).toBe(403);
  });
});

/* ───────────── G. SSO handoff ───────────── */
describe('G. SSO', () => {
  beforeEach(() => {
    db().account.push({ id: 'acc-p-member', personId: 'p-member', username: 'p-member', person: { id: 'p-member', fullName: 'm' } });
  });
  it('G1 cannot mint a handoff token for a system you cannot ENTER', async () => {
    const r = await request(app).post('/api/sso/issue').set(bearer('p-member')).send({ systemId: 'sys-deacon' });
    expect(r.status, why(r)).toBe(403);
  });
  it('G2 a handoff token is single-use even under concurrent redeem', async () => {
    const issued = await request(app).post('/api/sso/issue').set(bearer('p-member')).send({ systemId: 'sys-main' });
    expect(issued.status, why(issued)).toBe(201);
    const tok = issued.body.token;
    const [a, b] = await Promise.all([
      request(app).post('/api/sso/redeem').send({ token: tok }),
      request(app).post('/api/sso/redeem').send({ token: tok }),
    ]);
    expect([a.status, b.status].filter((s) => s === 200).length, `${a.status}/${b.status}`).toBe(1);
  });
});

/* ───────────── H. Login hardening ───────────── */
describe('H. login', () => {
  beforeEach(async () => {
    const bcrypt = (await import('bcryptjs')).default;
    db().account.push({ id: 'acc-p-member', personId: 'p-member', username: 'member', passwordHash: await bcrypt.hash('right-pass', 4), person: { id: 'p-member', fullName: 'm', status: 'ACTIVE' } });
    db().account.push({ id: 'acc-p-out', personId: 'p-outsider', username: 'gone', passwordHash: await bcrypt.hash('right-pass', 4), person: { id: 'p-outsider', fullName: 'o', status: 'INACTIVE' } });
    db().account[0].person = db().person.find((p) => p.id === 'p-member');
    db().account[1].person = db().person.find((p) => p.id === 'p-outsider');
    db().person.find((p) => p.id === 'p-outsider')!.status = 'INACTIVE';
  });
  it('H1 an INACTIVE person cannot log in', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'gone', password: 'right-pass' });
    expect(r.status, why(r)).toBe(401);
  });
  it('H2 repeated wrong passwords are throttled (429) before the 20th attempt', async () => {
    let throttled = false;
    for (let i = 0; i < 20; i++) {
      const r = await request(app).post('/api/auth/login').send({ username: 'nobody-throttle', password: `bad-${i}` });
      if (r.status === 429) { throttled = true; break; }
    }
    expect(throttled, 'no rate limit / lockout on /api/auth/login').toBe(true);
  });
  it('H3 JWT carries no role claims (roles are recomputed per request)', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'member', password: 'right-pass' });
    expect(r.status, why(r)).toBe(200);
    const claims: any = jwt.decode(r.body.token);
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'personId', 'sub', 'username']);
  });
});

/* ───────────── I. Production configuration ───────────── */
describe('I. config', () => {
  it('I1 production refuses to boot with the default JWT secret', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    delete process.env.JWT_SECRET;
    let secret = '';
    let threw = false;
    try { secret = (await import('../src/config.js')).config.jwtSecret; } catch { threw = true; }
    vi.unstubAllEnvs();
    process.env.JWT_SECRET = 'test-secret';
    vi.resetModules();
    expect(threw || secret !== 'dev-only-change-me', `booted in production with secret "${secret}"`).toBe(true);
  });
  it('I2 production refuses CORS_ORIGIN=* with credentials', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'x'.repeat(40));
    vi.stubEnv('CORS_ORIGIN', '*');
    let origin: unknown = null;
    let threw = false;
    try { origin = (await import('../src/config.js')).config.corsOrigin; } catch { threw = true; }
    vi.unstubAllEnvs();
    process.env.JWT_SECRET = 'test-secret';
    vi.resetModules();
    expect(threw || origin !== true, 'CORS reflects any origin with credentials').toBe(true);
  });
});

/* ───────────── P. Policy-engine edge cases ───────────── */
describe('P. policy engine', () => {
  it('P1 grantsAllSystems on a NON-governance role does not grant full Church Leader power', async () => {
    db().position.push({ id: 'pos-x', personId: 'p-outsider', systemId: 'sys-finance', title: 'Treasurer (flagged)', systemRole: 'CHURCH_TREASURER', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2020-01-01') });
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-outsider')).send({ systemId: 'sys-main', resource: 'POSITION', action: 'MANAGE' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
  it('P2 an unrecognised systemRole with grantsAllSystems=false gets no governance', async () => {
    db().position.push({ id: 'pos-y', personId: 'p-outsider', systemId: 'sys-main', title: 'Mystery', systemRole: 'SOMETHING_ELSE', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2020-01-01') });
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-outsider')).send({ systemId: 'sys-deacon', resource: 'SYSTEM', action: 'ENTER' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
  it('P3 a membership with a past endDate confers nothing', async () => {
    db().membership.push({ id: 'mem-old', personId: 'p-outsider', systemId: 'sys-choir', type: 'MINISTRY_MEMBER', label: 'Choir member', status: 'ACTIVE', startDate: new Date('2010-01-01'), endDate: new Date('2012-01-01') });
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-outsider')).send({ systemId: 'sys-choir', resource: 'SYSTEM', action: 'ENTER' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
  it('P4 a membership with a FUTURE startDate confers nothing yet', async () => {
    db().membership.push({ id: 'mem-fut', personId: 'p-outsider', systemId: 'sys-choir', type: 'MINISTRY_MEMBER', label: 'Choir member', status: 'ACTIVE', startDate: new Date('2099-01-01') });
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-outsider')).send({ systemId: 'sys-choir', resource: 'SYSTEM', action: 'ENTER' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
  it('P5 a FINANCE request with a fundId never matches a fund-less system grant', async () => {
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-pastor')).send({ systemId: 'sys-finance', resource: 'FINANCE', action: 'VIEW', fundId: 'fund-choir' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
  it('P6 an ended assignment confers nothing', async () => {
    db().assignment.push({ id: 'as-old', personId: 'p-outsider', systemId: 'sys-deacon', title: 't', contextLabel: 'c', status: 'ENDED', startDate: new Date('2020-01-01') });
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-outsider')).send({ systemId: 'sys-deacon', resource: 'SYSTEM', action: 'ENTER' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
  it('P7 an assignment past its endDate (still status ACTIVE) confers nothing', async () => {
    db().assignment.push({ id: 'as-exp', personId: 'p-outsider', systemId: 'sys-deacon', title: 't', contextLabel: 'c', status: 'ACTIVE', startDate: new Date('2020-01-01'), endDate: new Date('2021-01-01') });
    const r = await request(app).post('/api/authorize/probe').set(bearer('p-outsider')).send({ systemId: 'sys-deacon', resource: 'SYSTEM', action: 'ENTER' });
    expect(r.body.allowed, why(r)).toBe(false);
  });
});
