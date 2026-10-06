import { describe, expect, it } from 'vitest';
import { cleanTypeList, sameValue, suggestCode } from './settings';

describe('settings helpers', () => {
  it('suggests an uppercase code from a name', () => {
    expect(suggestCode('Letter of thanks')).toMatch(/^[A-Z][A-Z0-9_]+$/);
  });
  it('cleans a type list by trimming', () => {
    const out = cleanTypeList([{ code: 'A_B', name: '  Thanks ' }]);
    expect(out[0].name).toBe('Thanks');
  });
  it('compares values', () => {
    expect(sameValue(30, 30)).toBe(true);
    expect(sameValue([{ code: 'A', name: 'a' }], [{ code: 'B', name: 'a' }])).toBe(false);
  });
});
