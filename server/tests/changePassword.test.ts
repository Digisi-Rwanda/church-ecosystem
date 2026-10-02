import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

describe('changing your own password', () => {
  let app: any;
  beforeEach(async () => {
    fake.__reset();
    seedWorld(fake.__db);
    const bcrypt = (await import('bcryptjs')).default;
    fake.__db.account ??= [];
    fake.__db.account.push({ id: 'acc-p-member', personId: 'p-member', username: 'member', passwordHash: await bcrypt.hash('temp-pass-123', 4) });
    app = (await import('../src/app.js')).createApp();
  });
  const go = (body: object, who = 'p-member') =>
    request(app).post('/api/auth/change-password').set(bearer(who)).send(body);

  it('needs sign-in', async () => {
    expect((await request(app).post('/api/auth/change-password').send({})).status).toBe(401);
  });
  it('refuses a wrong current password, a short or unchanged new one', async () => {
    expect((await go({ currentPassword: 'nope', newPassword: 'a-long-new-pass' })).status).toBe(401);
    expect((await go({ currentPassword: 'temp-pass-123', newPassword: 'short' })).status).toBe(400);
    expect((await go({ currentPassword: 'temp-pass-123', newPassword: 'temp-pass-123' })).status).toBe(400);
  });
  it('changes it: the new one signs in, the old one no longer does', async () => {
    const ok = await go({ currentPassword: 'temp-pass-123', newPassword: 'my-own-new-pass' });
    expect(ok.status).toBe(200);
    // login looks the person up with the account; give the fake what Prisma's include would
    fake.__db.account[0].person = fake.__db.person.find((p: any) => p.id === 'p-member');
    const fresh = await request(app).post('/api/auth/login').send({ username: 'member', password: 'my-own-new-pass' });
    expect(fresh.status).toBe(200);
    const old = await request(app).post('/api/auth/login').send({ username: 'member', password: 'temp-pass-123' });
    expect(old.status).toBe(401);
  });
});
