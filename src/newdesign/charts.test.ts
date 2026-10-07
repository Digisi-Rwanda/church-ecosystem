import { describe, expect, it } from 'vitest';
import { chartBars, shortDay } from './charts';

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
