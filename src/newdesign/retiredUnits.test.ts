import { describe, expect, it } from 'vitest';
import { isRetiredUnit } from './retiredUnits';

describe('retired units', () => {
  it('hides the five first-seed units and keeps the rest', () => {
    for (const id of ['ou-church', 'ou-leadership', 'ou-admin', 'ou-worship', 'ou-finance']) expect(isRetiredUnit(id)).toBe(true);
    expect(isRetiredUnit('ou-youth')).toBe(false);
  });
});
