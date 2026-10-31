import { describe, expect, it } from 'vitest';
import { makeFormat } from './format';

describe('locale formatting', () => {
  it('groups francs and never shows decimals', () => {
    const f = makeFormat('en');
    expect(f.rwf(12500.4).replace(/[\s  ,]/g, '')).toBe('12500RWF');
    expect(f.number(1234567)).toMatch(/1.234.567/);
  });
  it('formats a date in each language without throwing', () => {
    for (const l of ['en', 'rw', 'fr'] as const) expect(makeFormat(l).date('2026-10-04')).toMatch(/2026/);
  });
  it('picks plural categories', () => {
    expect(makeFormat('en').plural(1)).toBe('one');
    expect(makeFormat('en').plural(2)).toBe('other');
  });
});
