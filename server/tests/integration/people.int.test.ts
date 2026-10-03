/**
 * Integration: People on the server (step 4, slice 1), through the SPA's own sync code.
 * Real Express app over HTTP, in-memory database stand-in, the SPA's real
 * peopleService + peopleServerSync. Switching the token = a different person
 * signing in on the same browser; a fresh storage = a different browser.
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
let sync: typeof import('../../../src/services/peopleServerSync');
let auth: typeof import('../../../src/services/authService');
let seed: typeof import('../../../src/data/seed');
const db = () => fake.__db as Record<string, any[]>;
const signIn = (id: string) => api.setApiToken(tokenFor(id));
const ids = () => seed.PEOPLE.map((p) => p.id).sort();
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10));
};

beforeAll(async () => {
  seedWorld(db());
  db().auditEvent ??= [];
  db().person.push({ id: 'p-catechist', fullName: 'Catechist', status: 'ACTIVE' });
  db().membership.push({ id: 'm-ca', personId: 'p-catechist', systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'x', status: 'ACTIVE', startDate: new Date('2020-01-01') });
  db().position.push({ id: 'pos-ca', personId: 'p-catechist', systemId: 'sys-main', title: 'Catechist', systemRole: 'CATECHIST', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2020-01-01') });
  Object.assign(db().person.find((p) => p.id === 'p-member')!, { nationalId: '1199', address: 'Kacyiru' });
  const { createApp } = await import('../../src/app.js');
  await new Promise<void>((r) => { server = createApp().listen(0, '127.0.0.1', r); });
  vi.stubEnv('VITE_API_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  vi.stubEnv('VITE_SERVER_MODULES', 'people');
  api = await import('../../../src/api');
  sync = await import('../../../src/services/peopleServerSync');
  seed = await import('../../../src/data/seed');
  auth = await import('../../../src/services/authService');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise((r) => server.close(r));
});

describe('people on the server', () => {
  it('Leader: the local list becomes exactly the server list, with every field', async () => {
    signIn('p-pastor');
    expect(sync.peopleSyncEnabled()).toBe(true);
    expect(await sync.refreshPeopleFromServer()).toBe(true);
    expect(ids()).toEqual(db().person.map((p) => p.id).sort());
    expect(auth.peopleService.getById('p-member')?.nationalId).toBe('1199');
  });

  it('Leader creates a person: it reaches the server with the same id', async () => {
    const p = auth.peopleService.create({ fullName: 'New Member', status: 'ACTIVE', phone: '0788000111' } as any);
    await until(() => db().person.some((x) => x.id === p.id));
    const row = db().person.find((x) => x.id === p.id)!;
    expect(row.fullName).toBe('New Member');
    expect(db().auditEvent.some((a) => a.action === 'CREATE' && a.detail === p.id)).toBe(true);
  });

  it('Leader edits identity data: server has it, and a second device sees it', async () => {
    auth.peopleService.update('p-member', { address: 'Remera' });
    await until(() => db().person.find((x) => x.id === 'p-member')!.address === 'Remera');
    // second device: empty storage, fresh list
    seed.PEOPLE.length = 0;
    await sync.refreshPeopleFromServer();
    expect(auth.peopleService.getById('p-member')?.address).toBe('Remera');
    expect(auth.peopleService.search('New Member').length).toBe(1);
  });

  it('Catechist sees everyone but not identity details', async () => {
    signIn('p-catechist');
    await sync.refreshPeopleFromServer();
    const m = auth.peopleService.getById('p-member')!;
    expect(m.fullName).toBe('p-member');
    expect(m.nationalId).toBeUndefined();
    expect(m.address).toBeUndefined();
    expect(seed.PEOPLE.length).toBe(db().person.length);
  });

  it('Catechist edit is refused by the server and rolled back locally', async () => {
    const before = auth.peopleService.getById('p-member')!.phone;
    auth.peopleService.update('p-member', { phone: '0000' });
    expect(auth.peopleService.getById('p-member')!.phone).toBe('0000'); // optimistic
    await until(() => sync.peopleSyncError() !== null);
    expect(sync.peopleSyncError()).toBeTruthy();
    expect(auth.peopleService.getById('p-member')!.phone).toBe(before);
    expect(db().person.find((x) => x.id === 'p-member')!.phone).not.toBe('0000');
  });

  it('an ordinary member keeps only their own record and loses others\' details from this browser', async () => {
    signIn('p-member');
    await sync.refreshPeopleFromServer();
    expect(auth.peopleService.getById('p-member')?.nationalId).toBe('1199');
    for (const p of seed.PEOPLE.filter((x) => x.id !== 'p-member')) {
      expect(p.nationalId, p.id).toBeUndefined();
      expect(p.address, p.id).toBeUndefined();
    }
  });

  it('a member edits own phone and it is saved; own status change is refused', async () => {
    auth.peopleService.update('p-member', { phone: '0788999888' });
    await until(() => db().person.find((x) => x.id === 'p-member')!.phone === '0788999888');
    expect(db().person.find((x) => x.id === 'p-member')!.phone).toBe('0788999888');
    auth.peopleService.update('p-member', { status: 'VISITOR' });
    await until(() => sync.peopleSyncError() !== null);
    expect(db().person.find((x) => x.id === 'p-member')!.status).toBe('ACTIVE');
    expect(auth.peopleService.getById('p-member')!.status).toBe('ACTIVE');
  });
});
