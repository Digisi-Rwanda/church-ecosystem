import { describe, expect, it } from 'vitest';
import { summarizeActivity } from './activitySummary';

describe('summarizeActivity', () => {
  it('counts each kind by state', () => {
    const s = summarizeActivity([
      { planType: 'EVENT', state: 'DRAFT' },
      { planType: 'EVENT', state: 'APPROVED' },
      { planType: 'PROJECT', state: 'WAITING' },
    ]);
    expect(s.EVENT.total).toBe(2);
    expect(s.EVENT.APPROVED).toBe(1);
    expect(s.PROJECT.WAITING).toBe(1);
    expect(s.PROGRAM.total).toBe(0);
  });
});
