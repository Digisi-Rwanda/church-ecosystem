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
