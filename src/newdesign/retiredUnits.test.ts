import { describe, expect, it } from 'vitest';
import { isHiddenOfficeCard, isRetiredUnit } from './retiredUnits';

describe('retired units', () => {
  it('hides the five first-seed units and keeps the rest', () => {
    for (const id of ['ou-church', 'ou-leadership', 'ou-admin', 'ou-worship', 'ou-finance']) expect(isRetiredUnit(id)).toBe(true);
    expect(isRetiredUnit('ou-youth')).toBe(false);
  });
  it('keeps the Church Leadership card on the Appointments page and hides the others', () => {
    expect(isHiddenOfficeCard('ou-leadership')).toBe(false);
    for (const id of ['ou-church', 'ou-admin', 'ou-finance', 'ou-worship']) expect(isHiddenOfficeCard(id)).toBe(true);
    expect(isHiddenOfficeCard('ou-youth')).toBe(false);
  });
});
