import { describe, expect, it } from 'vitest';
import { activitiesByDay, activityTime, emptyWhen, whenChanged, whenOf, whenProblem, whenSummary, whenToInput } from './when';
import { en } from '../i18n/messages/en';
import { fill } from '../i18n/translate';

const say = (k: keyof typeof en, v?: Record<string, string | number>) => fill(en[k], v ?? {});
const base = { timingKind: 'DATE' as const, startsOn: null, endsOn: null, startTime: null, endTime: null, repeat: null };

describe('when block', () => {
  it('sends one day with no last day, and a repeat with its rule', () => {
    const one = { ...emptyWhen(), kind: 'DATE' as const, start: '2026-11-14', end: '2026-11-20', startTime: '09:00' };
    expect(whenToInput(one)).toMatchObject({ timingKind: 'DATE', endsOn: null, startTime: '09:00', endTime: null, repeat: null });
    const rep = { ...emptyWhen(), kind: 'REPEAT' as const, start: '2026-11-01', days: [3, 0] };
    expect(whenToInput(rep).repeat).toEqual({ kind: 'WEEKLY', days: [0, 3] });
    const mon = { ...rep, repeat: 'MONTHLY' as const, nth: 5, day: 0 };
    expect(whenToInput(mon).repeat).toEqual({ kind: 'MONTHLY', nth: 5, day: 0 });
  });
  it('catches what the server would refuse', () => {
    expect(whenProblem({ ...emptyWhen(), kind: 'RANGE', start: '2026-11-20', end: '2026-11-14' })).toBe('BAD_DATES');
    expect(whenProblem({ ...emptyWhen(), start: '2026-11-14', startTime: '10:00', endTime: '09:00' })).toBe('BAD_TIME');
    expect(whenProblem({ ...emptyWhen(), kind: 'REPEAT', start: '2026-11-14', days: [] })).toBe('BAD_REPEAT');
    expect(whenProblem(emptyWhen())).toBeNull();
    expect(whenProblem(emptyWhen(), { needDate: true })).toBe('DATE_REQUIRED');
  });
  it('reads a saved activity back, and an old two-day plan as a range', () => {
    expect(whenOf({ ...base, timingKind: 'RANGE', startsOn: '2026-11-13T22:00:00.000Z', endsOn: '2026-11-19T22:00:00.000Z' })).toMatchObject({ kind: 'RANGE', start: '2026-11-14', end: '2026-11-20' });
    expect(whenOf({ ...base, timingKind: 'RANGE', startsOn: '2026-11-13T22:00:00.000Z', endsOn: null })).toMatchObject({ kind: 'DATE', start: '2026-11-14', end: '' });
    expect(whenOf({ ...base, timingKind: 'REPEAT', startsOn: '2026-11-13T22:00:00.000Z', repeat: { kind: 'MONTHLY', nth: 1, day: 0 } })).toMatchObject({ kind: 'REPEAT', repeat: 'MONTHLY', nth: 1, day: 0 });
  });
  it('knows when the time changed', () => {
    const a = { ...emptyWhen(), start: '2026-11-14' };
    expect(whenChanged(a, { ...a })).toBe(false);
    expect(whenChanged(a, { ...a, start: '2026-11-21' })).toBe(true);
    expect(whenChanged(a, { ...a, startTime: '09:00' })).toBe(true);
  });
  it('says it in words', () => {
    expect(whenSummary({ ...base }, say, 'en')).toBe('No date yet');
    expect(whenSummary({ ...base, startsOn: '2026-11-13T22:00:00.000Z', startTime: '09:00', endTime: '11:00' }, say, 'en')).toMatch(/Nov 14, 2026, 09:00–11:00/);
    expect(whenSummary({ ...base, timingKind: 'REPEAT', startsOn: '2026-11-01T22:00:00.000Z', repeat: { kind: 'MONTHLY', nth: 1, day: 0 } }, say, 'en')).toMatch(/First Sunday of each month/);
  });
  it('groups the schedule activities by day', () => {
    const a = (planId: string, date: string, startTime: string | null) => ({ planId, title: planId, planType: 'EVENT' as const, unitId: 'u', unitName: 'U', systemId: 's', date, startTime, endTime: null, location: null, status: 'RUNNING' });
    const days = activitiesByDay([a('b', '2026-11-15', null), a('a', '2026-11-14', '09:00'), a('c', '2026-11-14', null)]);
    expect(days.map((d) => d.day)).toEqual(['2026-11-14', '2026-11-15']);
    expect(days[0].items).toHaveLength(2);
    expect(activityTime({ startTime: '09:00', endTime: '11:00' })).toBe('09:00–11:00');
    expect(activityTime({ startTime: null, endTime: null })).toBe('');
  });
});
