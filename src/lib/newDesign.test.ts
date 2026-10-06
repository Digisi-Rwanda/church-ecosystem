import { describe, expect, it } from 'vitest';
import { isNewDoorPath } from './newDesign';

describe('new front door paths', () => {
  it('recognises the new screens', () => {
    for (const p of ['/signin', '/portal', '/portal/work', '/portal/announcements', '/s/sys-choir', '/s/sys-choir/work']) {
      expect(isNewDoorPath(p), p).toBe(true);
    }
  });
  it('leaves the old app alone', () => {
    for (const p of ['/', '/login', '/people', '/systems/choir', '/sso/handoff', '/schedule']) {
      expect(isNewDoorPath(p), p).toBe(false);
    }
  });
});

describe('the new design switch', () => {
  it('is on unless a site explicitly sets it to false', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.stubEnv('VITE_NEW_DESIGN', '');
    expect((await import('./newDesign')).isNewDesign()).toBe(true);
    vi.resetModules();
    vi.stubEnv('VITE_NEW_DESIGN', 'false');
    expect((await import('./newDesign')).isNewDesign()).toBe(false);
    vi.unstubAllEnvs();
  });
});
