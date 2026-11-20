import { describe, expect, it } from 'vitest';
import { chartBars, compactNumber, roundedTopBar, shortDay, shortMonth } from './charts';

describe('chart helpers', () => {
  it('scales bars to the ceiling and ignores bad values', () => {
    expect(chartBars([0, 5, 10, 20], 10, 100).map((b) => b.height)).toEqual([0, 50, 100, 100]);
    expect(chartBars([-3, Number.NaN], 10, 100).map((b) => b.height)).toEqual([0, 0]);
    expect(chartBars([3], 0, 100)[0].height).toBe(100);
  });
  it('short day does not shift with the time zone', () => {
    expect(shortDay('2026-10-05', 'en')).toMatch(/05/);
  });
});

describe('dashboard chart helpers', () => {
  it('shortens numbers', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(12_500)).toBe('12.5k');
    expect(compactNumber(1_200_000)).toBe('1.2M');
  });
  it('draws a rounded-top bar and nothing for an empty one', () => {
    expect(roundedTopBar(0, 10, 20, 50)).toContain('Q0,10');
    expect(roundedTopBar(0, 10, 20, 0)).toBe('');
  });
  it('never rounds more than the bar allows', () => {
    expect(roundedTopBar(0, 0, 20, 2)).toContain('V2');
  });
  it('names months in UTC', () => {
    expect(shortMonth('2026-10', 'en')).toBe('Oct');
  });
});
