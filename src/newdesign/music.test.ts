import { describe, expect, it } from 'vitest';
import { mayServe, musicErrorKey, shiftMonth, thisMonth } from './music';

describe('music helpers', () => {
  it('mirrors the server rule', () => {
    expect(mayServe('CHILDREN', 'SS1')).toBe(true);
    expect(mayServe('CHILDREN', 'FRIDAY')).toBe(false);
    expect(mayServe('WORSHIP', 'TUESDAY')).toBe(true);
    expect(mayServe('WORSHIP', 'SS2')).toBe(false);
  });
  it('moves between months across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(thisMonth(new Date('2026-10-07T00:00:00Z'))).toBe('2026-10');
  });
  it('error keys', () => {
    expect(musicErrorKey('CHOIR_NOT_ALLOWED')).toBe('door.music.err.notAllowed');
    expect(musicErrorKey(undefined)).toBe('door.people.actionFailed');
  });
});
