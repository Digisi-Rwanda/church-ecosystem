import { describe, expect, it } from 'vitest';
import { byWeekday, caringErrorKey } from './caring';

describe('caring helpers', () => {
  it('groups watches Monday first with Sunday last, sorted by start', () => {
    const w = (weekday: number, startTime: string) => ({ weekday, startTime });
    const out = byWeekday([w(0, '05:00'), w(1, '18:00'), w(1, '05:00'), w(5, '09:00')]);
    expect(out.map((d) => d.weekday)).toEqual([1, 5, 0]);
    expect(out[0].items.map((x) => x.startTime)).toEqual(['05:00', '18:00']);
  });
  it('error keys fall back', () => {
    expect(caringErrorKey('BAD_TIMES')).toBe('door.caring.err.times');
    expect(caringErrorKey('???')).toBe('door.people.actionFailed');
  });
});
