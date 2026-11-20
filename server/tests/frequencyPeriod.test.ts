import { describe, expect, it } from 'vitest';
import { validatePolicyValues } from '../src/scheduling/musicConfigRules.js';
import { periodForHorizon } from '../src/scheduling/configLoader.js';

/* A frequency rule says "at least N". Which period it is counted over comes from the horizon chosen at generation. */
const policy = (over: Record<string, unknown> = {}) => ({
  eligible: true, frequencyTarget: 2, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'MINIMUM', frequencyPeriod: null as string | null,
  planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false, ...over,
});

describe('frequency rules without a stored period', () => {
  it('are valid: setup no longer asks for a period', () => {
    expect(validatePolicyValues(policy())).toEqual([]);
  });
  it('can still set a period of their own', () => {
    expect(validatePolicyValues(policy({ frequencyPeriod: 'QUARTER' }))).toEqual([]);
  });
  it('refuse an unknown period', () => {
    expect(validatePolicyValues(policy({ frequencyPeriod: 'DECADE' })).length).toBe(1);
  });
  it('refuse a period with no target', () => {
    expect(validatePolicyValues(policy({ frequencyTarget: null, frequencyPeriod: 'MONTH' })).length).toBe(1);
  });
});

describe('the period a generation horizon implies', () => {
  it('month, quarter, half-year and year', () => {
    expect(periodForHorizon('MONTH')).toBe('MONTH');
    expect(periodForHorizon('QUARTER')).toBe('QUARTER');
    expect(periodForHorizon('HALF')).toBe('HALF_YEAR');
    expect(periodForHorizon('YEAR')).toBe('YEAR');
  });
});
