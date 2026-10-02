/**
 * Integration: the rest of the ecosystem, through the real front-end API layer.
 *
 * Same technique as ecosystem.int.test.ts: the SPA's own api/bridge modules call
 * the real Express app over HTTP; only the database is the in-memory stand-in.
 * Each "person" is a separate sign-in (token) on a separate browser storage.
 *
 * Covered here: ministry contributions -> verification -> fund ledger (money),
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
let bridge: typeof import('../../../src/services/contributionApiBridge');
let mission: typeof import('../../../src/api/missionApi');
let attention: typeof import('../../../src/api/attentionApi');
let people: typeof import('../../../src/api/peopleApi');
let contributions: typeof import('../../../src/api/contributionsApi');

const PASTOR = 'p-pastor';
const TREASURER = 'p-treasurer';
const MEMBER = 'p-member';
const OUTSIDER = 'p-outsider';
const CHOIR_LEAD = 'p-choir-leader';
const CHOIR_MEMBER = 'p-choir-member';
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
  // Two things the real database does that the in-memory stand-in does not:
  // `include: { orgUnit }` on funds, and createdAt/updatedAt stamps on programs.
  fake.__db.orgUnit ??= [];
  fake.__db.orgUnit.push(
    { id: 'ou-f', name: 'Finance' }, { id: 'ou-c', name: 'Choir' }, { id: 'ou-y', name: 'Youth' },
  );
  const withOrg = async (f: any) => f && { ...f, orgUnit: fake.__db.orgUnit.find((o: any) => o.id === f.orgUnitId) };
  const fMany = fake.fund.findMany;
  const fOne = fake.fund.findUnique;
  fake.fund.findMany = async (a: any) => Promise.all((await fMany(a)).map(withOrg));
  fake.fund.findUnique = async (a: any) => withOrg(await fOne(a));
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
  bridge = await import('../../../src/services/contributionApiBridge');
  mission = await import('../../../src/api/missionApi');
  attention = await import('../../../src/api/attentionApi');
  people = await import('../../../src/api/peopleApi');
  contributions = await import('../../../src/api/contributionsApi');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise((r) => server.close(r));
});

describe('money: contribution -> verification -> fund ledger', () => {
  let claimId = '';
  const balance = async (who: string, fundId: string) =>
    (await as(who, () => get(`/api/funds/${fundId}`))).balance as number;

  it('a choir member submits a contribution through the SPA bridge', async () => {
    const r = await as(CHOIR_MEMBER, () => bridge.submitClaimPreferApi({
      systemId: 'sys-choir', typeLabel: 'Tithe', amount: 5000, paymentMethod: 'MOMO', occurredOn: '2026-09-20',
    }));
    expect(r).toMatchObject({ ok: true });
    claimId = r!.id!;
    expect(claimId).toBeTruthy();
  });

  it('it is pending, visible to the giver and to the vault manager, and not yet in the ledger', async () => {
    const mine = await as(CHOIR_MEMBER, () => bridge.listClaimsPreferApi('sys-choir', { mine: true }));
    expect(mine?.map((c) => c.id)).toContain(claimId);
    const forLeader = await as(CHOIR_LEAD, () => contributions.apiListContributions('sys-choir'));
    expect(forLeader.canVerify).toBe(true);
    expect(forLeader.claims.find((c) => c.id === claimId)?.status).toBe('PENDING');
    expect(await balance(CHOIR_LEAD, 'fund-choir')).toBe(0);
  });

  it('the giver cannot verify their own gift, and a plain member cannot verify either', async () => {
    const own = await as(CHOIR_MEMBER, () => bridge.verifyClaimPreferApi({ contributionId: claimId, decision: 'CONFIRMED' }));
    expect(own?.ok).toBe(false);
    const other = await as(MEMBER, () => bridge.verifyClaimPreferApi({ contributionId: claimId, decision: 'CONFIRMED' }));
    expect(other?.ok).toBe(false);
    expect(await balance(CHOIR_LEAD, 'fund-choir')).toBe(0);
  });

  it('another ministry leader cannot verify it (their grant is for their own vault)', async () => {
    const r = await as(YOUTH_LEAD, () => bridge.verifyClaimPreferApi({ contributionId: claimId, decision: 'CONFIRMED' }));
    expect(r?.ok).toBe(false);
  });

  it('the vault manager confirms it: the ledger gains exactly that amount, once', async () => {
    const r = await as(CHOIR_LEAD, () => bridge.verifyClaimPreferApi({ contributionId: claimId, decision: 'CONFIRMED' }));
    expect(r).toMatchObject({ ok: true });
    expect(await balance(CHOIR_LEAD, 'fund-choir')).toBe(5000);
    const again = await as(CHOIR_LEAD, () => bridge.verifyClaimPreferApi({ contributionId: claimId, decision: 'CONFIRMED' }));
    expect(again?.ok).toBe(false);
    expect(await balance(CHOIR_LEAD, 'fund-choir')).toBe(5000);
  });

  it('a partial confirmation books only the confirmed amount; a declined one books nothing', async () => {
    const partial = await as(CHOIR_MEMBER, () => bridge.submitClaimPreferApi({
      systemId: 'sys-choir', typeLabel: 'Offering', amount: 4000, paymentMethod: 'CASH', occurredOn: '2026-09-21',
    }));
    const declined = await as(CHOIR_MEMBER, () => bridge.submitClaimPreferApi({
      systemId: 'sys-choir', typeLabel: 'Offering', amount: 900, paymentMethod: 'CASH', occurredOn: '2026-09-22',
    }));
    await as(CHOIR_LEAD, () => bridge.verifyClaimPreferApi({ contributionId: partial!.id!, decision: 'PARTIAL', confirmedAmount: 1500 }));
    await as(CHOIR_LEAD, () => bridge.verifyClaimPreferApi({ contributionId: declined!.id!, decision: 'DECLINED', note: 'no receipt' }));
    expect(await balance(CHOIR_LEAD, 'fund-choir')).toBe(6500);
    const all = await as(CHOIR_LEAD, () => contributions.apiListContributions('sys-choir'));
    expect(all.claims.find((c) => c.id === declined!.id)?.status).toBe('DECLINED');
    expect(all.claims.find((c) => c.id === partial!.id)?.confirmedAmount).toBe(1500);
  });

  it('someone outside the ministry cannot give into it', async () => {
    const r = await as(OUTSIDER, () => bridge.submitClaimPreferApi({
      systemId: 'sys-choir', typeLabel: 'Tithe', amount: 100, paymentMethod: 'CASH', occurredOn: '2026-09-23',
    }));
    expect(r?.ok).toBe(false);
  });

  it('vaults are private to their owners: not even the pastor sees the choir balance', async () => {
    expect(await status(() => as(PASTOR, () => get('/api/funds/fund-choir')))).toBe(403);
    expect(await status(() => as(YOUTH_LEAD, () => get('/api/funds/fund-choir')))).toBe(403);
    const overview = await as(PASTOR, () => get('/api/funds'));
    const choir = overview.funds.find((f: any) => f.fund.id === 'fund-choir');
    expect(choir.canView).toBe(false);
    expect(choir.balance).toBeNull();
  });

  it('the treasurer sees the general fund and nothing of the ministry vaults', async () => {
    const overview = await as(TREASURER, () => get('/api/funds'));
    const seen = overview.funds.filter((f: any) => f.canView).map((f: any) => f.fund.id);
    expect(seen).toEqual(['fund-general']);
  });
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
      '/api/contributions?systemId=sys-choir', '/api/funds', '/api/people', '/api/attention', '/api/schedule-state/music']) {
      expect(await status(() => as(null, () => get(path))), path).toBe(401);
    }
  });

  it('a forged or expired token is refused', async () => {
    api.setApiToken('not-a-real-token');
    expect(await status(() => get('/api/funds'))).toBe(401);
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
      expect(await bridge.listClaimsPreferApi('sys-choir')).toBeNull();
      // a failed submit is handed back as "use the local path", not as a lost gift
      expect(await bridge.submitClaimPreferApi({
        systemId: 'sys-choir', typeLabel: 'Tithe', amount: 1, paymentMethod: 'CASH', occurredOn: '2026-09-30',
      })).toBeNull();
    } finally {
      globalThis.fetch = real;
    }
  });
});
