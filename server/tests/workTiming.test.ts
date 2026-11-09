import { describe, expect, it } from 'vitest';
import { normalizeTiming, occurrencesIn, postponedOverSixMonths, repeatOf, timingProblem, timingText } from '../src/work/timing';

const days = (t: Parameters<typeof occurrencesIn>[0], m: string) => occurrencesIn(t, m).map((o) => o.date.slice(8));

describe('timing: the three ways of saying when', () => {
  it('a date shows on its church day only (church time is UTC+2)', () => {
    const t = { timingKind: 'DATE', startsOn: '2026-11-14T23:30:00Z' }; // already the 15th in Kigali
    expect(days(t, '2026-11')).toEqual(['15']);
    expect(days(t, '2026-12')).toEqual([]);
  });
  it('a range shows on every day it covers, within the month', () => {
    const t = { timingKind: 'RANGE', startsOn: '2026-10-29T00:00:00Z', endsOn: '2026-11-02T00:00:00Z' };
    expect(days(t, '2026-10')).toEqual(['29', '30', '31']);
    expect(days(t, '2026-11')).toEqual(['01', '02']);
    expect(days(t, '2026-12')).toEqual([]);
  });
  it('a range with no last day (an older plan) shows on its first day only', () => {
    expect(days({ timingKind: 'RANGE', startsOn: '2026-11-08T07:00:00Z' }, '2026-11')).toEqual(['08']);
  });
  it('a weekly repeat falls on its chosen days, from the first day to the last, or to the end of the month with no last day', () => {
    const t = { timingKind: 'REPEAT', startsOn: '2026-11-05T00:00:00Z', endsOn: null, repeatJson: JSON.stringify({ kind: 'WEEKLY', days: [2, 4] }) };
    expect(days(t, '2026-11')).toEqual(['05', '10', '12', '17', '19', '24', '26']); // Tuesdays and Thursdays from the 5th
    expect(days({ ...t, endsOn: '2026-11-17T00:00:00Z' }, '2026-11')).toEqual(['05', '10', '12', '17']);
    expect(days(t, '2026-10')).toEqual([]);
  });
  it('a monthly repeat falls on the nth weekday, or the last one', () => {
    const second = { timingKind: 'REPEAT', startsOn: '2026-01-01T00:00:00Z', repeatJson: JSON.stringify({ kind: 'MONTHLY', nth: 2, day: 6 }) }; // second Saturday
    expect(days(second, '2026-11')).toEqual(['14']);
    const last = { ...second, repeatJson: JSON.stringify({ kind: 'MONTHLY', nth: 5, day: 0 }) }; // last Sunday
    expect(days(last, '2026-11')).toEqual(['29']);
    expect(days(last, '2026-10')).toEqual(['25']);
  });
  it('times travel with every occurrence; a repeat without a valid rule shows nothing', () => {
    const t = { timingKind: 'REPEAT', startsOn: '2026-11-01T00:00:00Z', startTime: '18:00', endTime: '19:00', repeatJson: JSON.stringify({ kind: 'WEEKLY', days: [0] }) };
    expect(occurrencesIn(t, '2026-11')[0]).toEqual({ date: '2026-11-01', startTime: '18:00', endTime: '19:00' });
    expect(occurrencesIn({ ...t, repeatJson: 'nonsense' }, '2026-11')).toEqual([]);
    expect(occurrencesIn(t, 'nov')).toEqual([]);
  });
});

describe('timing: what can be saved', () => {
  it('refuses an end before the start, bad or reversed times and a repeat without days', () => {
    expect(timingProblem({ timingKind: 'RANGE', startsOn: '2026-11-10T00:00:00Z', endsOn: '2026-11-01T00:00:00Z' })).toBe('BAD_DATES');
    expect(timingProblem({ timingKind: 'DATE', startsOn: '2026-11-10T00:00:00Z', startTime: '25:00' })).toBe('BAD_TIME');
    expect(timingProblem({ timingKind: 'DATE', startsOn: '2026-11-10T00:00:00Z', startTime: '10:00', endTime: '09:00' })).toBe('BAD_TIME');
    expect(timingProblem({ timingKind: 'REPEAT', startsOn: '2026-11-10T00:00:00Z' })).toBe('BAD_REPEAT');
    expect(timingProblem({ timingKind: 'REPEAT', startsOn: '2026-11-10T00:00:00Z', repeatJson: JSON.stringify({ kind: 'WEEKLY', days: [1] }) })).toBeNull();
    expect(timingProblem({}, { needDate: true })).toBe('DATE_REQUIRED');
    expect(timingProblem({})).toBeNull(); // a draft may have no date yet
  });
  it('normalises: a single date has the same last day; only a repeat keeps its rule', () => {
    expect(normalizeTiming({ timingKind: 'DATE', startsOn: '2026-11-10T00:00:00Z', endsOn: '2026-11-12T00:00:00Z' }).endsOn?.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(normalizeTiming({ timingKind: 'RANGE', startsOn: '2026-11-10T00:00:00Z', repeatJson: JSON.stringify({ kind: 'WEEKLY', days: [1] }) }).repeatJson).toBeNull();
    expect(normalizeTiming({ timingKind: 'wat' }).timingKind).toBe('RANGE');
    expect(repeatOf(JSON.stringify({ kind: 'WEEKLY', days: [3, 1, 3] }))).toEqual({ kind: 'WEEKLY', days: [1, 3] });
  });
  it('postponing is judged against six months from the old start; the words name the date and times', () => {
    expect(postponedOverSixMonths('2026-11-14T00:00:00Z', '2027-05-14T00:00:00Z')).toBe(false);
    expect(postponedOverSixMonths('2026-11-14T00:00:00Z', '2027-05-15T00:00:00Z')).toBe(true);
    expect(postponedOverSixMonths(null, '2027-05-15T00:00:00Z')).toBe(false);
    expect(timingText({ timingKind: 'DATE', startsOn: '2026-11-14T07:00:00Z', startTime: '09:00', endTime: '12:00' })).toBe('2026-11-14 09:00–12:00');
    expect(timingText({ timingKind: 'RANGE', startsOn: '2026-11-14T00:00:00Z', endsOn: '2026-11-20T00:00:00Z' })).toBe('2026-11-14 to 2026-11-20');
  });
});
