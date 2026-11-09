import { describe, expect, it } from 'vitest';
import { addMonths, dayOf, fromLocalInput, groupByDay, planActions, scheduleErrorKey, thisMonth, toLocalInput } from './schedule';

describe('schedule helpers', () => {
  it('steps months across years and reads church time', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(thisMonth(new Date('2026-09-30T23:00:00Z'))).toBe('2026-10');
    expect(dayOf('2026-10-11T22:30:00Z')).toBe('2026-10-12');
  });
  it('converts form times as UTC+2 both ways', () => {
    expect(fromLocalInput('2026-10-11T08:30')).toBe('2026-10-11T06:30:00.000Z');
    expect(toLocalInput('2026-10-11T06:30:00.000Z')).toBe('2026-10-11T08:30');
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput(null)).toBe('');
  });
  it('groups slots by day in time order', () => {
    const g = groupByDay([{ startsAt: '2026-10-12T05:00:00Z' }, { startsAt: '2026-10-11T07:00:00Z' }, { startsAt: '2026-10-11T05:00:00Z' }]);
    expect(g.map((x) => [x.day, x.slots.length])).toEqual([['2026-10-11', 2], ['2026-10-12', 1]]);
    expect(g[0].slots[0].startsAt).toBe('2026-10-11T05:00:00Z');
  });
  it('offers only the steps a person may take', () => {
    expect(planActions('DRAFT', { confirm: true, publish: false }, 0)).toEqual([]);
    expect(planActions('DRAFT', { confirm: true, publish: false }, 2)).toEqual(['confirm']);
    expect(planActions('CONFIRMED', { confirm: false, publish: true }, 2)).toEqual(['publish', 'reopen']);
    expect(planActions('PUBLISHED', { confirm: false, publish: false }, 2)).toEqual([]);
    expect(planActions(null, { confirm: true, publish: true }, 0)).toEqual([]);
  });
  it('maps error codes to messages', () => {
    expect(scheduleErrorKey('PLAN_LOCKED')).toBe('door.sched.err.locked');
    expect(scheduleErrorKey('???')).toBe('door.people.actionFailed');
  });
});
