import { describe, expect, it } from 'vitest';
import { closeGaps, endOf, nextStart, runFlags } from './runSheetLogic';

describe('run-sheet logic on screen', () => {
  const sheet = [
    { startTime: '06:00', minutes: 10 }, { startTime: '06:10', minutes: 15 },
    { startTime: '06:20', minutes: 10 }, { startTime: '07:45', minutes: 30 },
  ];
  it('works out the end of a line', () => expect(endOf({ startTime: '06:25', minutes: 20 })).toBe('06:45'));
  it('flags overlap and running past the planned end', () => {
    expect(runFlags(sheet, '08:00')).toEqual([[], [], ['OVERLAP'], ['OVERRUN']]);
    expect(runFlags(sheet.slice(0, 2), '')).toEqual([[], []]);
  });
  it('lays lines one after another from the first start', () => {
    expect(closeGaps(sheet).map((i) => i.startTime)).toEqual(['06:00', '06:10', '06:25', '06:35']);
  });
  it('starts a new line where the last one ends, or at the service start', () => {
    expect(nextStart(sheet, '06:00')).toBe('08:15');
    expect(nextStart([], '07:30')).toBe('07:30');
    expect(nextStart([], null)).toBe('09:00');
  });
});
