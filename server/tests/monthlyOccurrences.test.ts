import { describe, expect, it } from 'vitest';
import { buildMusicCalendar } from '../src/music/engine.js';
import { validateForGeneration, type GenerationService } from '../src/scheduling/validateForGeneration.js';

/* The user sets the rule: which weeks of the month a monthly service falls on. Nothing is built in. */
const service = (over: Partial<GenerationService> & { selectedDates?: string[] } = {}) => ({
  code: 'igaburo', name: 'Igaburo', weekday: 6 as number | null, time: null as string | null, recurrence: 'MONTHLY',
  selectedDates: [] as string[], monthlyOccurrences: [] as number[], active: true,
  musicRequired: true, protocolRequired: true, maxChoirs: 3, ...over,
});
const datesFor = (month: string, s: ReturnType<typeof service>) =>
  buildMusicCalendar(month, 'MONTH', [s as never]).map((slot) => slot.date);

// January 2027 has five Saturdays: 2, 9, 16, 23, 30. November 2026 has four: 7, 14, 21, 28.
describe('monthly services on the weeks the user chose', () => {
  it('last Saturday', () => {
    expect(datesFor('2027-01', service({ monthlyOccurrences: [-1] }))).toEqual(['2027-01-30']);
    expect(datesFor('2026-11', service({ monthlyOccurrences: [-1] }))).toEqual(['2026-11-28']);
  });
  it('first and third', () => {
    expect(datesFor('2027-01', service({ monthlyOccurrences: [1, 3] }))).toEqual(['2027-01-02', '2027-01-16']);
  });
  it('4th and last are two dates in a five-Saturday month, and one in a four-Saturday month', () => {
    expect(datesFor('2027-01', service({ monthlyOccurrences: [4, -1] }))).toEqual(['2027-01-23', '2027-01-30']);
    expect(datesFor('2026-11', service({ monthlyOccurrences: [4, -1] }))).toEqual(['2026-11-28']);
  });
  it('nothing chosen means no dates, not a hidden default', () => {
    expect(datesFor('2027-01', service())).toEqual([]);
  });
  it('the code Igaburo gets no special treatment: with no weekday it has no dates', () => {
    expect(datesFor('2027-01', service({ weekday: null, monthlyOccurrences: [-1] }))).toEqual([]);
  });
  it('exact dates still win over the weeks', () => {
    expect(datesFor('2027-01', service({ selectedDates: ['2027-01-12'], monthlyOccurrences: [-1] }))).toEqual(['2027-01-12']);
  });
});

describe('the validator asks for the weeks', () => {
  const check = (s: ReturnType<typeof service>) => validateForGeneration({
    services: [s as GenerationService], categories: [], choirs: [], policies: [], links: [], fixedAssignments: [],
  } as never).errors;

  it('a monthly service with a day but no week is refused', () => {
    expect(check(service()).some((e) => /choose which week/.test(e))).toBe(true);
  });
  it('a monthly service with a day and a week is accepted', () => {
    expect(check(service({ monthlyOccurrences: [-1] })).filter((e) => /Igaburo/.test(e))).toEqual([]);
  });
  it('a monthly service with no day and no dates is refused, whatever its code', () => {
    expect(check(service({ weekday: null, monthlyOccurrences: [-1] })).some((e) => /needs a weekday or specific dates/.test(e))).toBe(true);
  });
  it('a monthly service on exact dates needs no weeks', () => {
    expect(check(service({ weekday: null, selectedDates: ['2027-01-12'] })).filter((e) => /Igaburo/.test(e))).toEqual([]);
  });
  it('an unknown week is refused', () => {
    expect(check(service({ monthlyOccurrences: [5] })).some((e) => /invalid week of the month/.test(e))).toBe(true);
  });
});
