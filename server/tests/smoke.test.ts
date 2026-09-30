import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

describe('harness sanity', () => {
  beforeEach(() => { fake.__reset(); seedWorld(fake.__db); });
  it('rejects missing token', async () => {
    const { createApp } = await import('../src/app.js');
    const r = await request(createApp()).get('/api/people');
    expect(r.status).toBe(401);
  });
  it('accepts a valid token', async () => {
    const { createApp } = await import('../src/app.js');
    const r = await request(createApp()).get('/api/people').set(bearer('p-member'));
    expect(r.status).toBe(200);
  });
  it('pastor can ENTER any system, member cannot ENTER sys-deacon', async () => {
    const { createApp } = await import('../src/app.js');
    const app = createApp();
    const a = await request(app).post('/api/authorize/probe').set(bearer('p-pastor')).send({ systemId: 'sys-youth', resource: 'SYSTEM', action: 'ENTER' });
    const b = await request(app).post('/api/authorize/probe').set(bearer('p-member')).send({ systemId: 'sys-deacon', resource: 'SYSTEM', action: 'ENTER' });
    expect(a.body.allowed).toBe(true);
    expect(b.body.allowed).toBe(false);
  });
});
