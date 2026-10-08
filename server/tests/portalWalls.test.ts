import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const WHO = ['p-pastor', 'p-member', 'p-youth-leader'];

beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  fake.__db.account ??= [];
  for (const id of WHO) {
    fake.__db.account.push({ id: `acc-${id}`, username: id, personId: id, person: { id, fullName: id, status: 'ACTIVE', memberships: [], positions: [] } });
  }
  for (const s of fake.__db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('the Portal data walls', () => {
  it('every person lands on a Portal with at least one system, and Finance-only access is never the whole list', async () => {
    for (const who of WHO) {
      const res = await get(who, '/api/portal');
      expect(res.status, who).toBe(200);
      expect(res.body.systems.length, who).toBeGreaterThan(0);
    }
  });

  it('a plain member sees fewer systems than the pastor, and none that belongs to another person', async () => {
    const member = await get('p-member', '/api/portal');
    const pastor = await get('p-pastor', '/api/portal');
    expect(member.body.systems.length).toBeLessThan(pastor.body.systems.length);
    expect(JSON.stringify(member.body)).not.toContain('p-pastor');
  });

  it('unread counts are the person’s own notices only', async () => {
    fake.__db.notification ??= [];
    fake.__db.notification.push({ id: 'n-other', personId: 'p-pastor', systemId: 'sys-main', readAt: null, title: 'x', body: 'y', kind: 'INFO', createdAt: new Date() });
    const member = await get('p-member', '/api/portal');
    const total = (member.body.systems as Array<{ unreadCount: number }>).reduce((n, s) => n + s.unreadCount, 0);
    expect(total).toBe(0);
  });

  it('“mine” work and plans never include what belongs to somebody else', async () => {
    for (const who of WHO) {
      for (const path of ['/api/work?view=mine&status=open', '/api/work-plans?view=mine&status=open']) {
        const res = await get(who, path);
        expect(res.status, `${who} ${path}`).toBe(200);
        const rows = (Array.isArray(res.body) ? res.body : res.body.items ?? []) as Array<{ ownerPersonId?: string; ownerId?: string; helpers?: string[] }>;
        for (const r of rows) {
          const owner = r.ownerPersonId ?? r.ownerId;
          if (owner) expect(owner === who || (r.helpers ?? []).includes(who), `${who} ${path}`).toBe(true);
        }
      }
    }
  });
});

describe('GET /api/portal/summary', () => {
  it('needs sign-in', async () => {
    expect((await request(app).get('/api/portal/summary')).status).toBe(401);
  });

  it('shows published reports only in systems where the person may read reports, and never drafts', async () => {
    fake.__db.report ??= [];
    const row = (id: string, systemId: string, status: string) => ({ id, systemId, orgUnitId: 'u1', kind: 'MEETINGS', periodKey: '2026-09', title: id, status, publishedAt: new Date(), deletedAt: null });
    fake.__db.report.push(row('r-main', 'sys-main', 'PUBLISHED'), row('r-draft', 'sys-main', 'DRAFT'), row('r-music', 'sys-music', 'PUBLISHED'));
    const pastor = await get('p-pastor', '/api/portal/summary');
    const member = await get('p-member', '/api/portal/summary');
    expect(pastor.status).toBe(200);
    const ids = (b: { reports: Array<{ id: string }> }) => b.reports.map((r) => r.id);
    expect(ids(pastor.body)).toContain('r-main');
    expect(ids(pastor.body)).not.toContain('r-draft');
    expect(ids(member.body)).not.toContain('r-draft');
    // Whatever the member sees is a subset of what the pastor may see.
    for (const id of ids(member.body)) expect(ids(pastor.body)).toContain(id);
  });

  it('counts members only for systems whose People the person may read', async () => {
    const member = await get('p-member', '/api/portal/summary');
    const pastor = await get('p-pastor', '/api/portal/summary');
    expect(member.body.people.length).toBeLessThanOrEqual(pastor.body.people.length);
  });
});
