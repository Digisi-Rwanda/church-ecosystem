/**
 * The invariant that makes live configuration safe: a confirmed or published month is frozen.
 * Generating over it is refused with 409 SCHEDULE_FROZEN and nothing is built or written.
 *
 * The router runs for real on a throwaway express app; every collaborator is mocked, so no database is needed.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  months: [] as Array<{ periodKey: string; state: string }>,
  built: 0,
  canWrite: true,
}));

vi.mock('../src/lib/prisma.js', async () => {
  const { createFakePrisma } = await import('./fakePrisma.js');
  return { prisma: createFakePrisma() };
});
vi.mock('../src/middleware/http.js', () => ({ requireAuth: (req: any, _res: any, next: any) => { req.auth = { personId: 'p-admin' }; next(); } }));
vi.mock('../src/notifications/feed.js', () => ({ loadAccessData: async () => ({ data: {} }) }));
vi.mock('../src/lib/notify.js', () => ({ notifySafely: async () => {} }));
vi.mock('../src/music/rules.js', async (original) => ({
  ...await original<typeof import('../src/music/rules.js')>(), canReadPlan: () => true, canWritePlan: () => h.canWrite,
}));
vi.mock('../src/music/store.js', async (original) => ({
  ...await original<typeof import('../src/music/store.js')>(), loadChoirs: async () => [], loadMonths: async () => h.months,
}));
vi.mock('../src/music/engine.js', () => ({
  buildMusicCalendar: (start: string) => [{ periodKey: start, date: `${start}-07`, serviceId: 's1' }],
  periodOptionsForHorizon: () => [],
}));
vi.mock('../src/music/configuredEngine.js', () => ({
  generateConfiguredMusicSchedule: () => { h.built += 1; return { services: [], warnings: [] }; },
  validateConfiguredMusicSchedule: () => ({ ok: true, errors: [] }),
}));
vi.mock('../src/scheduling/configLoader.js', () => ({
  loadMusicConfig: async () => ({ services: [{ id: 's1', active: true, musicRequired: true }], categories: [], policies: [], links: [], fixedAssignments: [] }),
}));

import { musicScheduleRouter } from '../src/routes/musicSchedule.js';
import { prisma } from '../src/lib/prisma.js';
const db = prisma as unknown as { __reset(): void; __db: Record<string, Array<Record<string, unknown>>> };

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/music/schedule', musicScheduleRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/music/schedule`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { h.months = []; h.built = 0; h.canWrite = true; db.__reset(); });

const generate = (start: string) => fetch(`${base}/drafts/generate`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ horizon: 'MONTH', start }),
});

describe('generate over a frozen month', () => {
  for (const state of ['CONFIRMED', 'PUBLISHED']) {
    it(`${state} month -> 409 SCHEDULE_FROZEN, nothing built`, async () => {
      h.months = [{ periodKey: '2099-01', state }];
      const res = await generate('2099-01');
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: 'SCHEDULE_FROZEN',
        message: 'This schedule is already confirmed. Edits to configuration do not rebuild confirmed or published schedules.',
      });
      expect(h.built).toBe(0);
    });
  }
});

describe('delete a decided Music month', () => {
  const month = '2099-01';
  const seed = (state: 'CONFIRMED' | 'PUBLISHED') => prisma.musicMonth.create({ data: {
    periodKey: month, state, version: 3, confirmedById: 'p-admin',
    confirmedAt: new Date('2098-12-01'), updatedAt: new Date('2098-12-01'),
    servicesJson: '[{"id":"s1"}]', assignmentsJson: '[]',
  } });
  const remove = (state: 'CONFIRMED' | 'PUBLISHED', version = 3) => fetch(`${base}/months/${month}`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, version }),
  });

  for (const state of ['CONFIRMED', 'PUBLISHED'] as const) {
    it(`removes a ${state} month and saves its history`, async () => {
      await seed(state);
      expect((await remove(state)).status).toBe(204);
      expect(db.__db.musicMonth).toEqual([]);
      expect(db.__db.musicLog).toMatchObject([{ periodKey: month, action: 'DELETED', stage: state, version: 3, servicesSnapshotJson: '[{"id":"s1"}]' }]);
      expect(db.__db.auditEvent).toMatchObject([{ action: 'MONTH_DELETED' }]);
    });
  }

  it('protects a newer or published revision from a stale confirmation', async () => {
    await seed('PUBLISHED');
    for (const res of [await remove('PUBLISHED', 2), await remove('CONFIRMED')]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'SCHEDULE_CHANGED' });
    }
    expect(db.__db.musicMonth).toHaveLength(1);
  });

  it('keeps version numbers increasing when the deleted month is confirmed again', async () => {
    await seed('CONFIRMED');
    expect((await remove('CONFIRMED')).status).toBe(204);
    const draft = await prisma.musicDraft.create({ data: {
      label: 'Replacement', horizon: 'MONTH', startMonth: month, createdById: 'p-admin',
      servicesJson: JSON.stringify([{ id: 's1', periodKey: month, musicRequired: false }]), assignmentsJson: '[]',
    } });
    const res = await fetch(`${base}/drafts/${draft.id}/confirm`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ months: [month] }),
    });
    expect(res.status).toBe(200);
    expect(db.__db.musicMonth).toMatchObject([{ periodKey: month, version: 4, state: 'CONFIRMED' }]);
    expect((await remove('CONFIRMED')).status).toBe(409);
  });

  it('keeps the schedule if a Protocol plan depends on it', async () => {
    await seed('CONFIRMED');
    await prisma.protocolPlan.create({ data: { monthKey: month, status: 'DRAFT', musicVersionBuiltOn: 3 } });
    const res = await remove('CONFIRMED');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'PROTOCOL_DEPENDENCY' });
    expect(db.__db.musicMonth).toHaveLength(1);
  });

  it('requires permission to edit the Music schedule', async () => {
    await seed('PUBLISHED');
    h.canWrite = false;
    expect((await remove('PUBLISHED')).status).toBe(403);
    expect(db.__db.musicMonth).toHaveLength(1);
  });
});
