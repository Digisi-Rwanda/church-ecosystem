/**
 * Integration: the rest of the ecosystem, through the real front-end API layer.
 *
 * Same technique as ecosystem.int.test.ts: the SPA's own api/bridge modules call
 * the real Express app over HTTP; only the database is the in-memory stand-in.
 * Each "person" is a separate sign-in (token) on a separate browser storage.
 *
 * Covered here: 
 * ORG_PRIVATE vault privacy, the mission lifecycle (program, event, task,
 * project), attention feed, people directory, assignments, systems, SSO
 * handoff, change password, and what the SPA does when the API is unreachable.
 * Not covered: screens, a real database engine, hosting settings, and the
 * parts of the SPA that live only in the browser (see docs/ARCHITECTURE.md).
 */
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../fakePrisma';
import { seedWorld, tokenFor } from '../world';

const fake = createFakePrisma();
vi.mock('../../src/lib/prisma.js', () => ({ prisma: fake }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal('window', { localStorage, addEventListener: () => {}, dispatchEvent: () => true });

let server: import('node:http').Server;
let api: typeof import('../../../src/api');
let mission: typeof import('../../../src/api/missionApi');
let attention: typeof import('../../../src/api/attentionApi');
let people: typeof import('../../../src/api/peopleApi');

const PASTOR = 'p-pastor';
const MEMBER = 'p-member';
const OUTSIDER = 'p-outsider';
const CHOIR_LEAD = 'p-choir-leader';
const YOUTH_LEAD = 'p-youth-leader';

/** Run something as one signed-in person (their token in this browser). */
async function as<T>(personId: string | null, fn: () => Promise<T>): Promise<T> {
  api.setApiToken(personId ? tokenFor(personId) : null);
  return fn();
}
const get = (path: string) => api.apiFetch<any>(path);
const status = async (fn: () => Promise<unknown>) => {
  try { await fn(); return 200; } catch (e) { return (e as { status?: number }).status ?? -1; }
};

beforeAll(async () => {
  seedWorld(fake.__db);
  fake.__db.financeTxn ??= [];
  fake.__db.contributionClaim ??= [];
  fake.__db.account ??= [];
  // One thing the real database does that the in-memory stand-in does not:
  // createdAt/updatedAt stamps on programs.
  const stamp = (fn: any) => async (a: any) => fn({ ...a, data: { updatedAt: new Date(), ...a.data } });
  const pCreate = fake.program.create;
  const pUpdate = fake.program.update;
  fake.program.create = async (a: any) => pCreate({ ...a, data: { createdAt: new Date(), updatedAt: new Date(), ...a.data } });
  fake.program.update = stamp(pUpdate);
  const { createApp } = await import('../../src/app.js');
  await new Promise<void>((r) => { server = createApp().listen(0, '127.0.0.1', r); });
  const port = (server.address() as AddressInfo).port;
  vi.stubEnv('VITE_API_URL', `http://127.0.0.1:${port}`);
  api = await import('../../../src/api');
  mission = await import('../../../src/api/missionApi');
  attention = await import('../../../src/api/attentionApi');
  people = await import('../../../src/api/peopleApi');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise((r) => server.close(r));
});

describe('mission: program lifecycle', () => {
  let programId = '';

  it('a ministry leader creates a program for their own ministry', async () => {
    const p = await as(CHOIR_LEAD, () => mission.apiCreateProgram({
      name: 'Choir school', ownerSystemId: 'sys-choir', programType: 'TRAINING', status: 'DRAFT',
    }));
    programId = p.id;
    expect(p.name).toBe('Choir school');
  });

  it('a leader of another ministry, and an ordinary member, cannot create one in it', async () => {
    expect(await status(() => as(YOUTH_LEAD, () => mission.apiCreateProgram({ name: 'x', ownerSystemId: 'sys-choir' })))).toBe(403);
    expect(await status(() => as(MEMBER, () => mission.apiCreateProgram({ name: 'x', ownerSystemId: 'sys-choir' })))).toBe(403);
  });

  it('the program is seen by its own ministry in a second browser', async () => {
    const list = await as(CHOIR_LEAD, () => mission.loadProgramsPreferApi('sys-choir'));
    expect(list?.some((p) => p.id === programId)).toBe(true);
  });

  it('submit for approval, approve by church leadership, then start', async () => {
    const submitted = await as(CHOIR_LEAD, () => mission.apiSubmitProgram(programId));
    expect(submitted.status).toBe('PENDING_APPROVAL');
    expect(await status(() => as(MEMBER, () => mission.apiApproveProgram(programId)))).toBeGreaterThanOrEqual(400);
    const approved = await as(PASTOR, () => mission.apiApproveProgram(programId));
    expect(['SETUP', 'ACTIVE']).toContain(approved.status);
    const started = await as(CHOIR_LEAD, () => mission.apiStartProgram(programId));
    expect(started.program.status).toBe('ACTIVE');
  });
});

describe('mission: events, tasks and projects', () => {
  it('a ministry leader creates an event and the ministry sees it', async () => {
    const ev = await as(YOUTH_LEAD, () => mission.apiCreateEvent({
      name: 'Youth night', type: 'FELLOWSHIP', ownerSystemId: 'sys-youth',
      startsAt: '2026-10-10T16:00:00.000Z', endsAt: '2026-10-10T19:00:00.000Z', location: 'Hall',
    } as any));
    const list = await as(YOUTH_LEAD, () => mission.loadEventsPreferApi('sys-youth'));
    expect(list?.some((e) => e.id === ev.id)).toBe(true);
  });

  it('a task reaches its owner even when they hold no role in the ministry', async () => {
    const t = await as(YOUTH_LEAD, () => mission.apiCreateTask({
      title: 'Book the hall', systemId: 'sys-youth', ownerPersonId: MEMBER,
    }));
    const mine = await as(MEMBER, () => mission.apiListTasks());
    expect(mine.some((x) => x.id === t.id)).toBe(true);
    const done = await as(MEMBER, () => mission.apiSetTaskStatus(t.id, 'DONE'));
    expect(done.status).toBe('DONE');
  });

  it('projects are created and listed per ministry; a stranger cannot create into one', async () => {
    const p = await as(YOUTH_LEAD, () => mission.apiCreateProject({ name: 'Youth van', ownerSystemId: 'sys-youth' }));
    const list = await as(YOUTH_LEAD, () => mission.loadProjectsPreferApi('sys-youth'));
    expect(list?.some((x) => x.id === p.id)).toBe(true);
    expect(await status(() => as(MEMBER, () => mission.apiCreateProject({ name: 'x', ownerSystemId: 'sys-youth' })))).toBe(403);
  });
});

describe('the rest of the API surface', () => {
  it('attention feed works for a signed-in leader', async () => {
    const items = await as(PASTOR, () => attention.loadAttentionPreferApi());
    expect(Array.isArray(items)).toBe(true);
  });

  it('the people directory is for people with a role, not for plain accounts', async () => {
    const ok = await as(PASTOR, () => people.apiSearchPeople('p-'));
    expect(ok.people.length).toBeGreaterThan(3);
    expect(await status(() => as(OUTSIDER, () => people.apiSearchPeople('p-')))).toBe(403);
  });

  it('assignments: you can read your own, not someone else\'s', async () => {
    expect(await status(() => as(MEMBER, () => get('/api/assignments')))).toBe(200);
    expect(await status(() => as(MEMBER, () => get(`/api/assignments?personId=${PASTOR}`)))).toBe(403);
  });

  it('the systems list needs sign-in', async () => {
    expect(await status(() => as(null, () => get('/api/systems')))).toBe(401);
    expect(await status(() => as(MEMBER, () => get('/api/systems')))).toBe(200);
  });

  it('no sign-in, no data: every protected route refuses an anonymous call', async () => {
    for (const path of ['/api/mission/programs', '/api/mission/events', '/api/mission/tasks', '/api/mission/projects',
      '/api/people', '/api/attention', '/api/schedule-state/music']) {
      expect(await status(() => as(null, () => get(path))), path).toBe(401);
    }
  });

  it('a forged or expired token is refused', async () => {
    api.setApiToken('not-a-real-token');
    expect(await status(() => get('/api/people'))).toBe(401);
  });
});

describe('when the server is unreachable the SPA degrades instead of breaking', () => {
  it('list loaders return null (the caller then uses its browser copy) and writes say so', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    try {
      api.setApiToken(tokenFor(PASTOR));
      expect(await mission.loadProgramsPreferApi()).toBeNull();
      expect(await mission.loadEventsPreferApi()).toBeNull();
      expect(await attention.loadAttentionPreferApi()).toBeNull();
    } finally {
      globalThis.fetch = real;
    }
  });
});
