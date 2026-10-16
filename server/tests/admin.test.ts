import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'account']) db[k] ??= [];
  db.orgUnit.push({ id: 'ou-media', name: 'Media', code: 'KAC-MED', kind: 'MINISTRY', type: 'MINISTRY', parentId: null, systemId: 'sys-media' });
  for (const id of ['p-admin1', 'p-admin2', 'p-new']) db.person.push({ id, fullName: id, status: 'ACTIVE' });
  db.person.push({ id: 'p-gone', fullName: 'Gone', status: 'ACTIVE', archivedAt: new Date('2025-01-01') });
  db.position.push(
    { id: 'pos-ad1', personId: 'p-admin1', systemId: 'sys-media', orgUnitId: 'ou-media', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: new Date('2024-01-01') },
    { id: 'pos-ad2', personId: 'p-admin2', systemId: 'sys-media', orgUnitId: 'ou-media', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: new Date('2024-01-01') },
  );
  db.account.push({ id: 'acc-p-member', personId: 'p-member', username: 'member', passwordHash: await bcrypt.hash('old-password-1', 4), createdAt: new Date(), updatedAt: new Date() });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const as = (who: string) => ({ get: (p: string) => request(app).get(p).set(bearer(who)), post: (p: string, b: object = {}) => request(app).post(p).set(bearer(who)).send(b) });

describe('the Administrator console is for Administrators only', () => {
  it('turns away everyone else, on every route', async () => {
    for (const who of ['p-member', 'p-pastor', 'p-treasurer', 'p-choir-leader']) {
      expect((await as(who).get('/api/admin/overview')).status, who).toBe(403);
      expect((await as(who).get('/api/admin/accounts')).status, who).toBe(403);
      expect((await as(who).post('/api/admin/accounts/p-member/reset-password')).status, who).toBe(403);
      expect((await as(who).get('/api/admin/audit')).status, who).toBe(403);
    }
    expect((await request(app).get('/api/admin/overview')).status).toBe(401);
  });
  it('shows an Administrator the count and the accounts', async () => {
    const o = await as('p-admin1').get('/api/admin/overview');
    expect(o.status).toBe(200);
    expect(o.body.administrators).toEqual({ count: 2, minimum: 2 });
    expect(o.body.accounts).toBe(1);
    expect(o.body.backup).toBeNull();
    const a = await as('p-admin1').get('/api/admin/accounts?q=mem');
    expect(a.body.accounts).toHaveLength(1);
    expect(a.body.accounts[0]).toMatchObject({ username: 'member', personId: 'p-member', locked: false });
    expect(JSON.stringify(a.body)).not.toContain('passwordHash');
  });
});

describe('accounts', () => {
  it('resets a password to a temporary one, shown once, and writes the audit trail', async () => {
    const r = await as('p-admin1').post('/api/admin/accounts/p-member/reset-password');
    expect(r.status).toBe(200);
    expect(r.body.temporaryPassword).toHaveLength(12);
    const row = fake.__db.account.find((x: any) => x.personId === 'p-member');
    expect(await bcrypt.compare(r.body.temporaryPassword, row.passwordHash)).toBe(true);
    expect(await bcrypt.compare('old-password-1', row.passwordHash)).toBe(false);
    const log = await as('p-admin1').get('/api/admin/audit');
    expect(log.body.events[0]).toMatchObject({ action: 'PASSWORD_RESET', actorName: 'p-admin1' });
    expect(JSON.stringify(log.body)).not.toContain(r.body.temporaryPassword);
  });
  it('never resets your own password or a missing one', async () => {
    expect((await as('p-admin1').post('/api/admin/accounts/p-admin1/reset-password')).status).toBe(409);
    expect((await as('p-admin1').post('/api/admin/accounts/p-new/reset-password')).status).toBe(404);
  });
  it('creates a sign-in for a person who has none, once', async () => {
    const r = await as('p-admin1').post('/api/admin/accounts', { personId: 'p-new', username: 'New.Person' });
    expect(r.status).toBe(201);
    expect(r.body.username).toBe('new.person');
    expect((await as('p-admin1').post('/api/admin/accounts', { personId: 'p-new', username: 'other' })).body.code).toBe('ALREADY_HAS_ACCOUNT');
    expect((await as('p-admin1').post('/api/admin/accounts', { personId: 'p-member', username: 'member' })).body.code).toBe('ALREADY_HAS_ACCOUNT');
    expect((await as('p-admin1').post('/api/admin/accounts', { personId: 'p-admin2', username: 'new.person' })).body.code).toBe('USERNAME_TAKEN');
    expect((await as('p-admin1').post('/api/admin/accounts', { personId: 'p-gone', username: 'gone' })).body.code).toBe('PERSON_NOT_ACTIVE');
    expect((await as('p-admin1').post('/api/admin/accounts', { personId: 'p-admin2', username: 'x y' })).status).toBe(400);
  });
  it('unlocks a locked sign-in', async () => {
    for (let i = 0; i < 8; i++) await request(app).post('/api/auth/login').send({ username: 'member', password: 'wrong' });
    expect((await request(app).post('/api/auth/login').send({ username: 'member', password: 'old-password-1' })).status).toBe(429);
    expect((await as('p-admin1').get('/api/admin/accounts')).body.accounts[0].locked).toBe(true);
    expect((await as('p-admin1').post('/api/admin/accounts/p-member/unlock')).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ username: 'member', password: 'old-password-1' })).status).not.toBe(429);
  });
});
