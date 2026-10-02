/**
 * Integration: the real front-end code talking to the real API.
 *
 * Each "browser" is its own copy of the SPA's modules (login, Music and
 * Protocol services, the sync layer) with its own storage and token. They talk
 * over real HTTP to the real Express app (routes, auth, guards, versioning),
 * backed by the in-memory database used by the other server tests. Nothing in
 * the SPA or the server is mocked except that database.
 *
 * What it proves: a schedule built and published in one browser reaches the
 * other, availability and notifications travel the same way, concurrent edits
 * are merged, and a person without the right role cannot overwrite the schedule.
 * What it does not cover: the screens themselves (clicks, layout) and the real
 * database engine / hosting settings (CORS_ORIGIN, VITE_API_URL).
 */
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../fakePrisma';
import { seedWorld } from '../world';

const fake = createFakePrisma();
vi.mock('../../src/lib/prisma.js', () => ({ prisma: fake }));

// ---- per-browser storage; "active" is the browser whose code is running ------
type Name = 'music' | 'proto' | 'proto2' | 'choir';
const stores: Record<Name, Map<string, string>> = {
  music: new Map(), proto: new Map(), proto2: new Map(), choir: new Map(),
};
const events: Record<Name, any[]> = { music: [], proto: [], proto2: [], choir: [] };
let active: Name = 'music';
const storage = {
  getItem: (k: string) => stores[active].get(k) ?? null,
  setItem: (k: string, v: string) => void stores[active].set(k, String(v)),
  removeItem: (k: string) => void stores[active].delete(k),
};
const sessions: Record<Name, Map<string, string>> = {
  music: new Map(), proto: new Map(), proto2: new Map(), choir: new Map(),
};
const session = {
  getItem: (k: string) => sessions[active].get(k) ?? null,
  setItem: (k: string, v: string) => void sessions[active].set(k, String(v)),
  removeItem: (k: string) => void sessions[active].delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', session);
vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
vi.stubGlobal('window', {
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  localStorage: storage,
  sessionStorage: session,
  addEventListener: () => {},
  dispatchEvent: (e: any) => { events[active].push(e.detail); return true; },
});

let server: import('node:http').Server;

type Client = Awaited<ReturnType<typeof makeClient>>;
async function makeClient(name: Name) {
  active = name;
  vi.resetModules();
  const auth = await import('../../../src/services/authService');
  const music = await import('../../../src/services/musicScheduleService');
  const proto = await import('../../../src/services/protocolService');
  const seed = await import('../../../src/data/protocolSeed');
  const sync = await import('../../../src/data/scheduleServerSync');
  const api = await import('../../../src/api');
  // what main.tsx does at start-up: register the shared collections
  (await import('../../../src/data/registerLocalDomain')).bootLocalDomainPersistence();
  proto.setProtocolDemoMusic(false);
  return {
    name,
    authService: auth.authService,
    music: music.musicScheduleService,
    protocol: proto.protocolService,
    notifications: seed.PROTOCOL_NOTIFICATIONS,
    syncNow: sync.syncNow,
    syncStatus: sync.getSyncStatus,
    token: api.getScheduleSyncToken,
  };
}
/** Run something as this browser (its storage and token). */
async function as<T>(c: { name: Name }, fn: () => T | Promise<T>): Promise<T> {
  active = c.name;
  return await fn();
}
/** Sync until nothing changes any more (pull, push, pull). */
async function settle(c: Client) {
  for (let i = 0; i < 4; i++) await as(c, () => c.syncNow());
}

const M = '2026-10';
const MUSIC_LEAD = 'p-music-leader';
const COORD = 'p-proto-coord';

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00'));
  seedWorld(fake.__db);
  fake.__db.account ??= [];
  fake.__db.auditEvent ??= [];
  // The demo role accounts, as `SEED_DEMO_ACCOUNTS=true` creates them on a server:
  // a person and a sign-in, with no roles on the server.
  const demo = JSON.parse(readFileSync(new URL('../../prisma/demoAccounts.json', import.meta.url), 'utf8'));
  for (const d of demo) {
    fake.__db.person.push({ ...d.person, status: 'ACTIVE' });
    fake.__db.account.push({
      id: d.accountId, personId: d.person.id, username: d.username,
      passwordHash: bcrypt.hashSync(d.password, 4),
    });
  }
  // the login route asks for the person together with the account
  const find = fake.account.findUnique;
  fake.account.findUnique = async (a: any) => {
    const acc = await find(a);
    return acc && { ...acc, person: fake.__db.person.find((p: any) => p.id === acc.personId) };
  };
  const { createApp } = await import('../../src/app.js');
  await new Promise<void>((resolve) => { server = createApp().listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as AddressInfo).port;
  vi.stubEnv('VITE_API_URL', `http://127.0.0.1:${port}`);
  vi.stubEnv('VITE_API_FALLBACK', 'false');
});
afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  if (server) await new Promise((r) => server.close(r));
});

describe('two browsers, one real API', () => {
  let music: Client;
  let proto: Client;
  let proto2: Client;

  it('sign-in goes through the server and the sync badge says so', async () => {
    music = await makeClient('music');
    expect(await as(music, () => music.authService.login('music', 'music123'))).toBeTruthy();
    expect(music.token()).toBeTruthy();
    await settle(music);
    expect(music.syncStatus()).toMatchObject({ state: 'ok' });
  });

  it('a wrong password does not sign in, and never falls back to a browser-only session', async () => {
    const c = await makeClient('choir');
    expect(await as(c, () => c.authService.login('music', 'wrong-password'))).toBeNull();
    expect(c.token()).toBeFalsy();
    expect(c.syncStatus().state).toBe('no-token');
  });

  it('Music builds, confirms and publishes October; it is saved on the server', async () => {
    await as(music, () => {
      music.music._resetForTests();
      music.music.buildCalendar(M, 'MONTH');
      const built = music.music.buildChoirSchedule();
      expect(built.ok, built.reason).toBe(true);
      const draft = music.music.saveDraft(MUSIC_LEAD, 'October');
      expect(draft.ok).toBe(true);
      expect(music.music.confirmDraftMonths(draft.draft!.id, MUSIC_LEAD).ok).toBe(true);
      expect(music.music.publishMonths([M], MUSIC_LEAD, []).ok).toBe(true);
    });
    await settle(music);
    const doc = await (await fetch(`${process.env.VITE_API_URL}/api/schedule-state/music`, {
      headers: { Authorization: `Bearer ${music.token()}` },
    })).json();
    expect(doc.version).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(doc.data)).toContain(M);
  });

  it('the Protocol Coordinator, in another browser, sees the published month', async () => {
    proto = await makeClient('proto');
    expect(await as(proto, () => proto.authService.login('protocol', 'proto123'))).toBeTruthy();
    await settle(proto);
    expect(proto.syncStatus()).toMatchObject({ state: 'ok' });
    await as(proto, () => {
      expect(proto.music.publishedMonths()).toContain(M);
      const row = proto.protocol.monthsOverview().find((r) => r.monthKey === M)!;
      expect(row.musicState).toBe('PUBLISHED');
      expect(proto.protocol.servicesForMonth(M).length).toBeGreaterThan(8);
    });
  });

  it('the Coordinator plans the teams from it and sets availability; another device sees all of it', async () => {
    let onLeave = '';
    let tuesdayOnly = '';
    await as(proto, () => {
      expect(proto.protocol.generateTeams(M, COORD).ok).toBe(true);
      const people = proto.protocol.listRoster().filter((m) => m.office === 'MEMBER' && m.status === 'ACTIVE');
      onLeave = people[0]!.id;
      tuesdayOnly = people[1]!.id;
      expect(proto.protocol.rosterUpdate(onLeave, { status: 'LEAVE' }, COORD).ok).toBe(true);
      expect(proto.protocol.rosterUpdate(tuesdayOnly, { allowedServiceKinds: ['TUESDAY'] }, COORD).ok).toBe(true);
      expect(proto.protocol.generateTeams(M, COORD).ok).toBe(true);
    });
    await settle(proto);

    proto2 = await makeClient('proto2');
    expect(await as(proto2, () => proto2.authService.login('protocol', 'proto123'))).toBeTruthy();
    await settle(proto2);
    await as(proto2, () => {
      const roster = proto2.protocol.listRoster();
      expect(roster.find((m) => m.id === onLeave)!.status).toBe('LEAVE');
      expect(roster.find((m) => m.id === tuesdayOnly)!.allowedServiceKinds).toEqual(['TUESDAY']);
      const services = proto2.protocol.servicesForMonth(M);
      const teams = services.map((s) => proto2.protocol.teamForService(s.id));
      expect(teams.flat().length).toBeGreaterThan(50);
      const leaveP = roster.find((m) => m.id === onLeave)!.personId;
      const tueP = roster.find((m) => m.id === tuesdayOnly)!.personId;
      services.forEach((s, i) => {
        expect(teams[i]!.some((t) => t.personId === leaveP), 'on leave').toBe(false);
        if (s.kind !== 'TUESDAY') expect(teams[i]!.some((t) => t.personId === tueP), 'Tuesday-only').toBe(false);
      });
    });
  });

  it('a change Music makes after publishing reaches Protocol, and the Coordinator is alerted', async () => {
    await as(music, () => {
      const pub = music.music.getPublished(M)!;
      const svc = pub.services.find((s) => s.kind === 'SS2')!;
      const units = music.music.assignmentsForService(pub.assignments, svc.id);
      expect(music.music.removePublishedUnit(M, MUSIC_LEAD, svc.id, units[0]!, []).ok).toBe(true);
    });
    await settle(music);
    await settle(proto);
    await as(proto, () => {
      expect(proto.protocol.musicSync(M).state).toBe('STALE');
      const mine = proto.protocol.notificationsFor(COORD);
      expect(mine.some((n) => n.kind === 'MUSIC_EDITED' || n.kind === 'MUSIC_CHANGED')).toBe(true);
      expect(proto.music.listLog(M).length).toBeGreaterThanOrEqual(3); // confirmed, published, edited
    });
  });

  it('two devices editing at once: both changes survive (merged), nothing is lost', async () => {
    let a = '';
    let b = '';
    await as(proto, () => {
      const people = proto.protocol.listRoster().filter((m) => m.office === 'MEMBER' && m.status === 'ACTIVE');
      a = people[2]!.id;
      b = people[3]!.id;
      expect(proto.protocol.rosterUpdate(a, { notes: 'edited on device 1' }, COORD).ok).toBe(true);
    });
    await as(proto2, () => {
      expect(proto2.protocol.rosterUpdate(b, { status: 'INACTIVE' }, COORD).ok).toBe(true);
    });
    await as(proto, () => proto.syncNow()); // device 1 saves first
    await as(proto2, () => proto2.syncNow()); // device 2 is out of date -> merged
    await settle(proto);
    await settle(proto2);
    for (const c of [proto, proto2]) {
      await as(c, () => {
        const roster = c.protocol.listRoster();
        expect(roster.find((m) => m.id === a)!.notes).toBe('edited on device 1');
        expect(roster.find((m) => m.id === b)!.status).toBe('INACTIVE');
      });
    }
  });

  it('someone without a Music role cannot overwrite the published schedule (guard on enforce)', async () => {
    const was = process.env.SCHEDULE_GUARD;
    process.env.SCHEDULE_GUARD = 'enforce';
    try {
      const choir = await makeClient('choir');
      expect(await as(choir, () => choir.authService.login('choir', 'choir123'))).toBeTruthy();
      const url = `${process.env.VITE_API_URL}/api/schedule-state/music`;
      const auth = { Authorization: `Bearer ${choir.token()}`, 'Content-Type': 'application/json' };
      const cur = await (await fetch(url, { headers: auth })).json();
      // the collections live under the module's name; wipe the released and confirmed months
      const tampered = structuredClone(cur.data);
      const ms = tampered.musicSchedule ?? tampered;
      expect(Array.isArray(ms.published) && ms.published.length > 0, 'the published month is in the document').toBe(true);
      ms.published = [];
      ms.confirmed = [];
      const res = await fetch(url, { method: 'PUT', headers: auth, body: JSON.stringify({ baseVersion: cur.version, data: tampered }) });
      expect(res.status).toBe(403);
      const after = await (await fetch(url, { headers: auth })).json();
      expect(after.version).toBe(cur.version);
      expect(JSON.stringify(after.data)).toContain(M);
    } finally {
      if (was === undefined) delete process.env.SCHEDULE_GUARD;
      else process.env.SCHEDULE_GUARD = was;
    }
  });

  it('with the read filter on, a person with no Music or Protocol role is not sent the confirmed months', async () => {
    const was = process.env.SCHEDULE_READ_FILTER;
    process.env.SCHEDULE_READ_FILTER = 'on';
    try {
      const choir = await makeClient('choir');
      expect(await as(choir, () => choir.authService.login('choir', 'choir123'))).toBeTruthy();
      const res = await fetch(`${process.env.VITE_API_URL}/api/schedule-state/music`, {
        headers: { Authorization: `Bearer ${choir.token()}` },
      });
      expect(res.status).toBe(200);
      const doc = await res.json();
      const ms = doc.data?.musicSchedule ?? doc.data ?? {};
      expect(ms.confirmed ?? []).toHaveLength(0);
      expect(ms.drafts ?? []).toHaveLength(0);
      expect(ms.log ?? []).toHaveLength(0);
      // while the unfiltered document (what the Music team holds) does have them
      expect(music.music.confirmedMonths().concat(music.music.publishedMonths())).toContain(M);
    } finally {
      if (was === undefined) delete process.env.SCHEDULE_READ_FILTER;
      else process.env.SCHEDULE_READ_FILTER = was;
    }
  });

  it('signing out clears the connection; the badge falls back to "this device only"', async () => {
    await as(proto2, () => proto2.authService.logout());
    expect(proto2.token()).toBeFalsy();
    expect(proto2.syncStatus().state).toBe('no-token');
  });
});
