import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserData } from './clearBrowserData';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe('clearBrowserData', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('sessionStorage', fakeStorage());
  });
  it('removes what earlier releases saved and keeps interface preferences', () => {
    localStorage.setItem('adepr.session', 'x');
    localStorage.setItem('adepr.kacyiru.domain.local.v1', 'y');
    sessionStorage.setItem('adepr.sso.handoffs', 'z');
    localStorage.setItem('moriah.pinnedSystems', '["sys-music"]');
    clearBrowserData();
    expect(localStorage.getItem('adepr.session')).toBeNull();
    expect(localStorage.getItem('adepr.kacyiru.domain.local.v1')).toBeNull();
    expect(sessionStorage.getItem('adepr.sso.handoffs')).toBeNull();
    expect(localStorage.getItem('moriah.pinnedSystems')).toBe('["sys-music"]');
  });
});
