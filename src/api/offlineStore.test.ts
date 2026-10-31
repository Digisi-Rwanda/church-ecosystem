import { beforeEach, describe, expect, it } from 'vitest';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  } as Storage;
}
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });

const A = 'header.payload.signature-of-person-A';
const B = 'header.payload.signature-of-person-B';

describe('offline reading', () => {
  beforeEach(() => localStorage.clear());

  it('keeps only the read-only screens that may be read offline', async () => {
    const { isKeptPath } = await import('./offlineStore');
    expect(isKeptPath('/api/schedule/month?month=2026-10')).toBe(true);
    expect(isKeptPath('/api/protocol/roster')).toBe(true);
    expect(isKeptPath('/api/protocol/months/2026-10')).toBe(true);
    expect(isKeptPath('/api/assignments')).toBe(true);
    expect(isKeptPath('/api/money/entries')).toBe(false);
    expect(isKeptPath('/api/people')).toBe(false);
    expect(isKeptPath('/api/schedule/slots')).toBe(false);
  });

  it('gives a saved copy back to the same sign-in, with its time', async () => {
    const { saveOffline, readOffline } = await import('./offlineStore');
    saveOffline('/api/protocol/mine', A, { duties: [1] });
    const got = readOffline<{ duties: number[] }>('/api/protocol/mine', A);
    expect(got?.data.duties).toEqual([1]);
    expect(got!.at).toBeLessThanOrEqual(Date.now());
  });

  it('never shows one person\'s copy to another, and wipes everything at sign-out', async () => {
    const { saveOffline, readOffline, clearOffline } = await import('./offlineStore');
    saveOffline('/api/protocol/mine', A, { secret: 1 });
    expect(readOffline('/api/protocol/mine', B)).toBeNull();
    expect(readOffline('/api/protocol/mine', null)).toBeNull();
    clearOffline();
    expect(readOffline('/api/protocol/mine', A)).toBeNull();
  });

  it('does not save screens outside the list or without a sign-in', async () => {
    const { saveOffline } = await import('./offlineStore');
    saveOffline('/api/money/entries', A, { x: 1 });
    saveOffline('/api/protocol/mine', null, { x: 1 });
    expect(localStorage.length).toBe(0);
  });
});
