import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let srv: import('node:http').Server;

beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  for (const k of ['digestLog', 'preference', 'notification', 'notificationRead', 'position']) fake.__db[k] ??= [];
  fake.__db.position.push({ id: 'pos-admin', personId: 'p-treasurer', systemId: 'sys-media', office: 'ADMINISTRATOR', title: 'Administrator', status: 'ACTIVE', startDate: new Date('2021-01-01') });
  process.env.DIGEST_SECRET = 'cron-secret';
  delete process.env.DIGEST_WEBHOOK_URL;
  const { createApp } = await import('../src/app.js');
  srv?.close();
  srv = createApp().listen(0);
});
afterAll(() => { srv?.close(); delete process.env.DIGEST_SECRET; });

describe('daily digest routes', () => {
  it('a person chooses a digest channel and reads it back; a bad channel is refused', async () => {
    const put = await request(srv).put('/api/me/preferences').set(bearer('p-member')).send({ digestChannel: 'WHATSAPP' });
    expect(put.status).toBe(200);
    expect(put.body.digestChannel).toBe('WHATSAPP');
    expect((await request(srv).get('/api/me/preferences').set(bearer('p-member'))).body.digestChannel).toBe('WHATSAPP');
    expect((await request(srv).put('/api/me/preferences').set(bearer('p-member')).send({ digestChannel: 'PIGEON' })).status).toBe(400);
  });

  it('the preview needs a sign-in and is only about the person asking', async () => {
    expect((await request(srv).get('/api/digest/preview')).status).toBe(401);
    const r = await request(srv).get('/api/digest/preview').set(bearer('p-member'));
    expect(r.status).toBe(200);
    expect(r.body.channel).toBe('OFF');
  });

  it('only the scheduler secret or an Administrator can start the job', async () => {
    expect((await request(srv).post('/api/digest/run')).status).toBe(401);
    expect((await request(srv).post('/api/digest/run').set('x-cron-secret', 'wrong')).status).toBe(401);
    expect((await request(srv).post('/api/digest/run').set(bearer('p-member'))).status).toBe(403);
    const byCron = await request(srv).post('/api/digest/run').set('x-cron-secret', 'cron-secret');
    expect(byCron.status).toBe(200);
    expect(byCron.body.considered).toBe(0);
    expect((await request(srv).post('/api/digest/run').set(bearer('p-treasurer'))).status).toBe(200);
  });
});
