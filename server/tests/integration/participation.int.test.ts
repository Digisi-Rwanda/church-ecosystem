/**
 * Integration: belonging and authority on the server (step 4, slice 2), through the SPA's own
 * participationService + sync, against the real Express app (in-memory database).
 */
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../fakePrisma';
import { seedWorld, tokenFor } from '../world';

const fake = createFakePrisma();
vi.mock('../../src/lib/prisma.js', () => ({ prisma: fake }));

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);
vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
vi.stubGlobal('window', {
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  localStorage: storage, sessionStorage: storage, addEventListener: () => {}, dispatchEvent: () => true,
});

let server: import('node:http').Server;
let api: typeof import('../../../src/api');
let sync: typeof import('../../../src/services/participationServerSync');
let peopleSync: typeof import('../../../src/services/peopleServerSync');
let part: typeof import('../../../src/services/participationService');
let org: typeof import('../../../src/services/orgService');
let seed: typeof import('../../../src/data/seed');
const db = () => fake.__db as Record<string, any[]>;
const signIn = (id: string) => api.setApiToken(tokenFor(id));
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10));
};

beforeAll(async () => {
  seedWorld(db());
  db().auditEvent ??= [];
  db().orgUnit ??= [];
  db().orgUnit.push({ id: 'ou-choir', name: 'Choir', type: 'MINISTRY', systemId: 'sys-choir' });
  db().person.push({ id: 'p-catechist', fullName: 'Catechist', status: 'ACTIVE' });
  db().membership.push({ id: 'm-ca', personId: 'p-catechist', systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'x', status: 'ACTIVE', startDate: new Date('2020-01-01') });
  db().position.push({ id: 'pos-ca', personId: 'p-catechist', systemId: 'sys-main', title: 'Catechist', systemRole: 'CATECHIST', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2020-01-01') });
  const { createApp } = await import('../../src/app.js');
  await new Promise<void>((r) => { server = createApp().listen(0, '127.0.0.1', r); });
  vi.stubEnv('VITE_API_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  vi.stubEnv('VITE_SERVER_MODULES', 'participation');
  api = await import('../../../src/api');
  sync = await import('../../../src/services/participationServerSync');
  peopleSync = await import('../../../src/services/peopleServerSync');
  part = await import('../../../src/services/participationService');
  org = await import('../../../src/services/orgService');
  seed = await import('../../../src/data/seed');
  (await import('../../../src/data/registerLocalDomain')).registerAllLocalDomain();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise((r) => server.close(r));
});

describe('belonging and authority on the server', () => {
  it('Leader: local lists become exactly the server\'s', async () => {
    signIn('p-pastor');
    expect(await sync.refreshParticipationFromServer()).toBe(true);
    expect(seed.MEMBERSHIPS.map((m) => m.id).sort()).toEqual(db().membership.map((m) => m.id).sort());
    expect(seed.POSITIONS.map((p) => p.id).sort()).toEqual(db().position.map((p) => p.id).sort());
    expect(seed.ORG_UNITS.map((u) => u.id)).toContain('ou-choir');
  });

  it('Leader enrols, appoints and creates a unit: all reach the server', async () => {
    const m = part.participationService.createMembership({ personId: 'p-member', type: 'MINISTRY_MEMBER', label: 'Choir', systemId: 'sys-choir' });
    const p = part.participationService.createPosition({ personId: 'p-member', title: 'Treasurer', orgUnitId: 'ou-choir', systemId: 'sys-finance', systemRole: 'CHURCH_TREASURER' });
    const u = org.orgService.create({ name: 'Ushers', type: 'TEAM' });
    await until(() => [m.id, p.id, u.id].every((id) => [...db().membership, ...db().position, ...db().orgUnit].some((r) => r.id === id)));
    expect(db().membership.find((r) => r.id === m.id)!.personId).toBe('p-member');
    expect(db().position.find((r) => r.id === p.id)!.systemRole).toBe('CHURCH_TREASURER');
    expect(db().orgUnit.find((r) => r.id === u.id)!.name).toBe('Ushers');
  });

  it('a second device sees them after a refresh', async () => {
    seed.MEMBERSHIPS.length = 0; seed.POSITIONS.length = 0; seed.ORG_UNITS.length = 0;
    await sync.refreshParticipationFromServer();
    expect(part.participationService.membershipsFor('p-member').some((m) => m.label === 'Choir')).toBe(true);
    expect(org.orgService.list().some((u) => u.name === 'Ushers')).toBe(true);
  });

  it('Leader ends the appointment; it ends on the server too', async () => {
    const pos = seed.POSITIONS.find((p) => p.title === 'Treasurer' && p.personId === 'p-member')!;
    part.participationService.endPosition(pos.id);
    await until(() => db().position.find((r) => r.id === pos.id)?.status === 'ENDED');
    expect(db().position.find((r) => r.id === pos.id)!.status).toBe('ENDED');
  });

  it('an ordinary member sees only their own memberships, and others\' positions without authority flags', async () => {
    signIn('p-member');
    await sync.refreshParticipationFromServer();
    expect(seed.MEMBERSHIPS.every((m) => m.personId === 'p-member')).toBe(true);
    const pastor = seed.POSITIONS.find((p) => p.id === 'pos-pastor')!;
    expect(pastor.title).toBe('Senior Pastor');
    expect(pastor.systemRole).toBeUndefined();
  });

  it('a member cannot appoint themselves: refused by the server and rolled back here', async () => {
    const p = part.participationService.createPosition({ personId: 'p-member', title: 'Self-appointed', orgUnitId: 'ou-choir', systemId: 'sys-main', systemRole: 'CHURCH_LEADER', grantsAllSystems: true });
    expect(seed.POSITIONS.some((x) => x.id === p.id)).toBe(true); // optimistic
    await until(() => peopleSync.peopleSyncError() !== null);
    expect(peopleSync.peopleSyncError()).toBeTruthy();
    expect(db().position.some((x) => x.title === 'Self-appointed')).toBe(false);
    expect(seed.POSITIONS.some((x) => x.id === p.id)).toBe(false); // rolled back
  });

  it('signing out removes the lists from this browser', async () => {
    const auth = await import('../../../src/services/authService');
    auth.authService.logout();
    expect(seed.MEMBERSHIPS.length + seed.POSITIONS.length + seed.ORG_UNITS.length).toBe(0);
  });
});
