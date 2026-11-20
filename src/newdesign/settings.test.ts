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

describe('move rules form', () => {
  const ok = { childMaxAge: '12', youthMaxAge: '35', elderlyFromAge: '60', adultTrigger: 'EITHER' };
  it('accepts rising whole ages and a known trigger', async () => {
    const { moveRulesProblem } = await import('./settings');
    expect(moveRulesProblem(ok)).toEqual({ ok: true, value: { childMaxAge: 12, youthMaxAge: 35, elderlyFromAge: 60, adultTrigger: 'EITHER' } });
  });
  it('names the first problem', async () => {
    const { moveRulesProblem } = await import('./settings');
    expect(moveRulesProblem({ ...ok, childMaxAge: '' })).toEqual({ ok: false, problem: 'whole' });
    expect(moveRulesProblem({ ...ok, youthMaxAge: '12' })).toEqual({ ok: false, problem: 'order' });
    expect(moveRulesProblem({ ...ok, adultTrigger: 'NEVER' })).toEqual({ ok: false, problem: 'trigger' });
  });
});
