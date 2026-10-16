import { describe, expect, it } from 'vitest';
import { choirWorkErrorKey, daysSince, missingSingers, restedFirst } from './choirWork';

describe('choir work helpers', () => {
  it('flags singers under half attendance with at least two rehearsals', () => {
    const m = (id: string, of: number, rate: number) => ({ id, of, rate });
    expect(missingSingers([m('a', 1, 0), m('b', 4, 25), m('c', 4, 50)]).map((x) => x.id)).toEqual(['b']);
  });
  it('days since a song was sung', () => {
    expect(daysSince('2026-10-01', '2026-10-07')).toBe(6);
    expect(daysSince(null, '2026-10-07')).toBeNull();
    expect(daysSince('2026-10-09', '2026-10-07')).toBe(0);
  });
  it('rests songs: never sung first, then oldest', () => {
    const s = (title: string, lastSungOn: string | null) => ({ title, lastSungOn });
    expect(restedFirst([s('B', '2026-10-01'), s('A', null), s('C', '2026-09-01')]).map((x) => x.title)).toEqual(['A', 'C', 'B']);
  });
  it('error keys', () => {
    expect(choirWorkErrorKey('AMOUNT')).toBe('door.money.err.amount');
    expect(choirWorkErrorKey(undefined)).toBe('door.people.actionFailed');
  });
});
