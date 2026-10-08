import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));

beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  fake.__db.account ??= [];
  for (const id of ['p-pastor', 'p-member', 'p-youth-leader']) {
    // The fake database does not join tables, so the person comes attached to the account row.
    fake.__db.account.push({ id: `acc-${id}`, username: id, personId: id, person: { id, fullName: id, status: 'ACTIVE', memberships: [], positions: [] } });
  }
  for (const s of fake.__db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.kind = s.id === 'sys-main' ? 'MAIN' : s.id === 'sys-finance' ? 'SHARED' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('GET /api/me/bootstrap', () => {
  it('needs sign-in', async () => {
    expect((await request(app).get('/api/me/bootstrap')).status).toBe(401);
  });

  it('answers exactly what the portal and the capabilities calls answer, in one response', async () => {
    for (const who of ['p-pastor', 'p-member', 'p-youth-leader']) {
      const [boot, portal, caps] = await Promise.all([
        get(who, '/api/me/bootstrap'),
        get(who, '/api/portal'),
        get(who, '/api/me/capabilities'),
      ]);
      expect(boot.status, who).toBe(200);
      expect(boot.body.portal, who).toEqual(portal.body);
      expect(boot.body.capabilities, who).toEqual(caps.body);
      expect(boot.body.me.account.personId, who).toBe(who);
    }
  });

  it('shows a person only what their own letters open, never another person’s', async () => {
    const member = await get('p-member', '/api/me/bootstrap');
    const pastor = await get('p-pastor', '/api/me/bootstrap');
    expect(member.body.capabilities.personId).toBe('p-member');
    expect(member.body.portal.systems.length).toBeLessThan(pastor.body.portal.systems.length);
    expect(JSON.stringify(member.body)).not.toContain('p-pastor');
  });

  it('is a plain not found when the account is gone', async () => {
    fake.__db.account.length = 0;
    expect((await get('p-pastor', '/api/me/bootstrap')).status).toBe(404);
  });
});
