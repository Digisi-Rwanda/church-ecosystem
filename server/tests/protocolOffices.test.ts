import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

describe('GET /api/protocol/offices', () => {
  beforeEach(() => {
    fake.__reset();
    seedWorld(fake.__db);
    fake.__db.person.push({ id: 'p-coord', fullName: 'Iryayo Jean Wiclef', preferredName: 'Wiclef', status: 'ACTIVE', email: 'w@x.org' });
    const base = { systemId: 'sys-protocol', status: 'ACTIVE', startDate: new Date('2024-01-01'), grantsAllSystems: false };
    fake.__db.position.push(
      { id: 'pp-c', personId: 'p-coord', title: 'Protocol Coordinator', protocolOffice: 'COORDINATOR', ...base },
      { id: 'pp-ended', personId: 'p-member', title: 'Old VP', protocolOffice: 'VP', ...base, endDate: new Date('2025-01-01') },
      { id: 'pp-none', personId: 'p-member', title: 'No office', ...base },
    );
  });
  const app = async () => (await import('../src/app.js')).createApp();

  it('needs sign-in', async () => {
    expect((await request(await app()).get('/api/protocol/offices')).status).toBe(401);
  });

  it('lists only current Protocol offices, with the person', async () => {
    const r = await request(await app()).get('/api/protocol/offices').set(bearer('p-member'));
    expect(r.status).toBe(200);
    expect(r.body.offices).toHaveLength(1);
    expect(r.body.offices[0]).toMatchObject({
      personId: 'p-coord',
      protocolOffice: 'COORDINATOR',
      person: { fullName: 'Iryayo Jean Wiclef', preferredName: 'Wiclef' },
    });
  });
});
