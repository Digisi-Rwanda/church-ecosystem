/**
 * The parts of the SPA that live only in the browser: Board, Church finance
 * (service collections), Deacons, Pastoral pathways.
 *
 * Two "browsers" = two separate storages. The tests prove (1) the write works
 * and survives a refresh, and (2) a second browser does NOT see it. (2) is a
 * documented limitation, not a goal: these modules have no server copy yet.
 * If one of them gains a server document, flip its assertion and keep the test.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

type B = 'a' | 'b';
const stores: Record<B, Map<string, string>> = { a: new Map(), b: new Map() };
let active: B = 'a';
const storage = {
  getItem: (k: string) => stores[active].get(k) ?? null,
  setItem: (k: string, v: string) => void stores[active].set(k, String(v)),
  removeItem: (k: string) => void stores[active].delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);
vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
vi.stubGlobal('window', {
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  localStorage: storage, sessionStorage: storage, addEventListener: () => {}, dispatchEvent: () => true,
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00'));
});
afterAll(() => vi.useRealTimers());

/** Open the app in a browser: fresh modules, hydrate from that browser's storage. */
async function open(b: B) {
  active = b;
  vi.resetModules();
  const store = await import('../data/localDomainStore');
  (await import('../data/registerLocalDomain')).bootLocalDomainPersistence();
  const seed = await import('../data/seed');
  return {
    flush: () => { active = b; store.flushLocalDomainPersist(); },
    board: (await import('./boardService')).boardService,
    finance: (await import('./churchFinanceService')).churchFinanceService,
    deacon: (await import('./deaconService')).deaconService,
    pastoral: (await import('./pastoralOpsService')).pastoralOpsService,
    positions: seed.POSITIONS,
    people: seed.PEOPLE,
  };
}

describe('browser-only modules: work, survive a refresh, are not shared', () => {
  it('Board: a meeting is scheduled, survives refresh, is invisible to another browser', async () => {
    const a = await open('a');
    const before = a.board.list().length;
    const m = a.board.schedule({
      title: 'October board', scheduledAt: '2026-10-05T15:00:00.000Z',
      calledByPersonId: a.people[0]!.id, agenda: ['Budget', 'Youth van'], attendeePersonIds: [a.people[0]!.id],
    });
    expect(a.board.list().length).toBe(before + 1);
    a.flush();

    const refreshed = await open('a');
    expect(refreshed.board.get(m.id)?.title).toBe('October board');

    const other = await open('b');
    expect(other.board.get(m.id)).toBeFalsy();
  });

  it('Church finance: the treasurer posts a service collection; it survives refresh, other browser sees none', async () => {
    const a = await open('a');
    const treasurer = a.positions.find((p) => p.systemRole === 'CHURCH_TREASURER' && p.status === 'ACTIVE')?.personId;
    expect(treasurer, 'a seeded church treasurer').toBeTruthy();
    const before = a.finance.listCollections().length;
    const r = a.finance.postServiceCollection({
      actorPersonId: treasurer!, serviceDate: '2026-09-13', serviceLabel: 'Sunday 13 Sep',
      titheAmount: 120000, offeringAmount: 45000, givingAmount: 5000,
    });
    expect(r.ok, r.reason).toBe(true);
    expect(a.finance.listCollections().length).toBe(before + 1);
    a.flush();

    const refreshed = await open('a');
    expect(refreshed.finance.listCollections().length).toBe(before + 1);
    const other = await open('b');
    expect(other.finance.listCollections().length).toBe(before);
  });

  it('Church finance: only the treasurer can post, and an empty collection is refused', async () => {
    const a = await open('a');
    const treasurer = a.positions.find((p) => p.systemRole === 'CHURCH_TREASURER' && p.status === 'ACTIVE')!.personId;
    const stranger = a.people.find((p) => p.id !== treasurer && !a.positions.some((x) => x.personId === p.id && x.status === 'ACTIVE'))!.id;
    const base = { serviceDate: '2026-09-20', serviceLabel: 'x', titheAmount: 1, offeringAmount: 0, givingAmount: 0 };
    expect(a.finance.postServiceCollection({ ...base, actorPersonId: stranger }).ok).toBe(false);
    expect(a.finance.postServiceCollection({ ...base, actorPersonId: treasurer, titheAmount: 0 }).ok).toBe(false);
  });

  it('Pastoral pathways: opened, survive refresh, not shared', async () => {
    const a = await open('a');
    const person = a.people[1]!.id;
    const p = a.pastoral.openPathway({ personId: person, kind: 'BAPTISM' as any, label: 'Baptism class' });
    a.flush();
    const refreshed = await open('a');
    expect(refreshed.pastoral.listPathways({ personId: person } as any).some((x: any) => x.id === p.id)).toBe(true);
    const other = await open('b');
    expect(other.pastoral.listPathways({ personId: person } as any).some((x: any) => x.id === p.id)).toBe(false);
  });
});
