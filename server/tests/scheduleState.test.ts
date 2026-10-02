import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

async function app() {
  const { createApp } = await import('../src/app.js');
  return createApp();
}

describe('schedule state documents', () => {
  beforeEach(() => {
    fake.__reset();
    seedWorld(fake.__db);
  });

  it('requires sign-in and rejects unknown keys', async () => {
    const a = await app();
    expect((await request(a).get('/api/schedule-state/music')).status).toBe(401);
    expect((await request(a).put('/api/schedule-state/music').send({})).status).toBe(401);
    expect((await request(a).get('/api/schedule-state/secrets').set(bearer('p-member'))).status).toBe(404);
  });

  it('starts empty at version 0', async () => {
    const r = await request(await app()).get('/api/schedule-state/music').set(bearer('p-member'));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 0, data: null });
  });

  it('saves, versions and shares between people', async () => {
    const a = await app();
    const first = await request(a)
      .put('/api/schedule-state/music')
      .set(bearer('p-pastor'))
      .send({ baseVersion: 0, data: { confirmed: [{ periodKey: '2026-11' }] } });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(1);
    // another person (another browser) sees it
    const seen = await request(a).get('/api/schedule-state/music').set(bearer('p-member'));
    expect(seen.body.version).toBe(1);
    expect(seen.body.data.confirmed[0].periodKey).toBe('2026-11');
    expect(seen.body.updatedByPersonId).toBe('p-pastor');
    const poll = await request(a).get('/api/schedule-state/music/version').set(bearer('p-member'));
    expect(poll.body.version).toBe(1);
  });

  it('refuses a save made from an out-of-date version, and keeps the old one', async () => {
    const a = await app();
    await request(a).put('/api/schedule-state/protocol').set(bearer('p-pastor')).send({ baseVersion: 0, data: { n: 1 } });
    await request(a).put('/api/schedule-state/protocol').set(bearer('p-pastor')).send({ baseVersion: 1, data: { n: 2 } });
    const stale = await request(a).put('/api/schedule-state/protocol').set(bearer('p-member')).send({ baseVersion: 1, data: { n: 99 } });
    expect(stale.status).toBe(409);
    expect(stale.body.version).toBe(2);
    const now = await request(a).get('/api/schedule-state/protocol').set(bearer('p-member'));
    expect(now.body.data.n).toBe(2);
    expect(fake.__db.scheduleDocumentRevision.map((r: any) => r.version)).toEqual([1]);
  });

  it('rejects a body that is not a document', async () => {
    const r = await request(await app()).put('/api/schedule-state/music').set(bearer('p-pastor')).send({ baseVersion: 0, data: 'x' });
    expect(r.status).toBe(400);
  });
});
