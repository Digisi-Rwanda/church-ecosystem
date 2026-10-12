import { describe, expect, it } from 'vitest';
import { groupActivities, groupOf } from './activitySummary';

const p = (id: string, state: string, startsOn: string | null = null, endsOn: string | null = null) => ({ id, state, startsOn, endsOn }) as never;

describe('groupActivities', () => {
  it('sorts activities into completed, in progress and upcoming', () => {
    expect(groupOf({ state: 'DONE', startsOn: null }, '2026-10-12')).toBe('DONE');
    expect(groupOf({ state: 'APPROVED', startsOn: '2026-10-01' }, '2026-10-12')).toBe('INPROGRESS');
    expect(groupOf({ state: 'APPROVED', startsOn: '2026-11-01' }, '2026-10-12')).toBe('UPCOMING');
    expect(groupOf({ state: 'WAITING', startsOn: null }, '2026-10-12')).toBe('UPCOMING');
    expect(groupOf({ state: 'DRAFT', startsOn: null }, '2026-10-12')).toBeNull();
    expect(groupOf({ state: 'CANCELLED', startsOn: null }, '2026-10-12')).toBeNull();
  });
  it('puts the most relevant first', () => {
    const g = groupActivities([p('a', 'DONE', null, '2026-01-01'), p('b', 'DONE', null, '2026-03-01'), p('c', 'APPROVED', '2026-09-01', '2026-12-01'), p('d', 'APPROVED', '2026-09-01', '2026-10-30'), p('e', 'WAITING', '2026-12-05'), p('f', 'APPROVED', '2026-11-01')], '2026-10-12');
    expect(g.DONE.map((x) => x.id)).toEqual(['b', 'a']);
    expect(g.INPROGRESS.map((x) => x.id)).toEqual(['d', 'c']);
    expect(g.UPCOMING.map((x) => x.id)).toEqual(['f', 'e']);
  });
});
