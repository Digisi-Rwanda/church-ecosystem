import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { ScheduleService } from '../api/frontDoorApi';
import { addableUnits, mayServe, musicErrorKey, scheduleErrorText, servicesOfMonth, shiftMonth, thisMonth } from './music';

describe('music helpers', () => {
  it('mirrors the server rule', () => {
    expect(mayServe('CHILDREN', 'SS1')).toBe(true);
    expect(mayServe('CHILDREN', 'FRIDAY')).toBe(false);
    expect(mayServe('WORSHIP', 'TUESDAY')).toBe(true);
    expect(mayServe('WORSHIP', 'SS2')).toBe(false);
    expect(mayServe('PRIMARY', 'FRIDAY')).toBe(true);
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

describe('schedule helpers', () => {
  const svc = (id: string, kind: ScheduleService['kind'], month: string, units: string[] = []): ScheduleService => ({ id, periodKey: month, date: `${month}-01`, kind, label: id, units: units.map((u) => ({ unitId: u, name: u, kind: 'PRIMARY' as const })) });
  it('offers only choirs that may serve and are not already there', () => {
    const units = [{ id: 'a', kind: 'PRIMARY' as const }, { id: 'k', kind: 'CHILDREN' as const }, { id: 'w', kind: 'WORSHIP' as const }];
    expect(addableUnits(units, svc('x', 'SS1', '2026-10', ['a'])).map((u) => u.id)).toEqual(['k']);
    expect(addableUnits(units, svc('x', 'TUESDAY', '2026-10')).map((u) => u.id)).toEqual(['a', 'w']);
    expect(addableUnits(units, svc('x', 'SS2', '2026-10')).map((u) => u.id)).toEqual(['a']);
  });
  it('filters a draft by month', () => {
    const all = [svc('a', 'SS1', '2026-10'), svc('b', 'SS1', '2026-11')];
    expect(servicesOfMonth(all, '2026-11').map((s) => s.id)).toEqual(['b']);
  });
  it('shows the server sentence only for rule-specific codes', () => {
    expect(scheduleErrorText(new ApiError('x', 422, { code: 'ENGINE', error: 'At least 2 active primary choirs are needed' }))).toMatch(/2 active primary/);
    expect(scheduleErrorText(new ApiError('x', 409, { code: 'ALREADY_EXISTS', error: 'dup' }))).toBeNull();
    expect(scheduleErrorText(new Error('x'))).toBeNull();
  });
});
