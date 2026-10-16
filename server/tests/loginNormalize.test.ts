import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

describe('sign-in tolerates what saved-password prompts and phones do', () => {
  let app: any;
  beforeEach(async () => {
    fake.__reset();
    seedWorld(fake.__db);
    const bcrypt = (await import('bcryptjs')).default;
    fake.__db.account ??= [];
    fake.__db.account.push({
      id: 'acc-1', personId: 'p-member', username: 'member',
      passwordHash: await bcrypt.hash('member-pass-1', 4),
      person: fake.__db.person.find((p: any) => p.id === 'p-member'),
    });
    app = (await import('../src/app.js')).createApp();
  });
  const login = (username: string, password = 'member-pass-1') =>
    request(app).post('/api/auth/login').send({ username, password });

  it('exact name works', async () => expect((await login('member')).status).toBe(200));
  it('capital letters and stray spaces are accepted', async () => {
    expect((await login('Member')).status).toBe(200);
    expect((await login('  member ')).status).toBe(200);
    expect((await login('MEMBER')).status).toBe(200);
  });
  it('the password stays exact', async () => {
    expect((await login('member', 'Member-pass-1')).status).toBe(401);
    expect((await login('member', 'member-pass-1 ')).status).toBe(401);
  });
  it('an unknown name is still refused', async () => expect((await login('nobody')).status).toBe(401));
});
