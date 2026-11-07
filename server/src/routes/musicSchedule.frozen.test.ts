/**
 * The invariant that makes live configuration safe: a confirmed or published month is frozen.
 * Generating over it is refused with 409 SCHEDULE_FROZEN and nothing is built or written.
 *
 * The router runs for real on a throwaway express app; every collaborator is mocked, so no database is needed.
 * TODO(confirm): adapt the mocks to the repo's own test helpers if it has them.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  months: [] as Array<{ periodKey: string; state: string }>,
  built: 0,
}));

vi.mock('../lib/prisma.js', () => ({ prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }) }));
vi.mock('../middleware/http.js', () => ({ requireAuth: (req: any, _res: any, next: any) => { req.auth = { personId: 'p-admin' }; next(); } }));
vi.mock('../notifications/feed.js', () => ({ loadAccessData: async () => ({ data: {} }) }));
vi.mock('../lib/notify.js', () => ({ notifySafely: async () => {} }));
vi.mock('../music/rules.js', () => ({ MUSIC: 'sys-music', canReadPlan: () => true, canWritePlan: () => true, isMonth: (v: string) => /^\d{4}-\d\d$/.test(v) }));
vi.mock('../music/store.js', () => ({ loadChoirs: async () => [], loadMonthRows: async () => [], loadMonths: async () => h.months, toDoc: (x: unknown) => x }));
vi.mock('../music/schedule.js', () => ({ unitsFrom: () => [], historyOutside: () => [] }));
vi.mock('../music/engine.js', () => ({
  buildMusicCalendar: (start: string) => [{ periodKey: start, date: `${start}-07`, serviceId: 's1' }],
  periodOptionsForHorizon: () => [],
}));
vi.mock('../music/configuredEngine.js', () => ({
  generateConfiguredMusicSchedule: () => { h.built += 1; return { services: [], warnings: [] }; },
  validateConfiguredMusicSchedule: () => ({ ok: true, errors: [] }),
}));
vi.mock('../scheduling/configLoader.js', () => ({
  loadMusicConfig: async () => ({ services: [{ id: 's1', active: true, musicRequired: true }], categories: [], policies: [], links: [], fixedAssignments: [] }),
}));

import { musicScheduleRouter } from './musicSchedule.js';

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
beforeEach(() => { h.months = []; h.built = 0; });

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
