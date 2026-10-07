import { describe, expect, it } from 'vitest';
import { cleanMoney, suggestTypeCode, toDraft, typesProblem, type TypeDraft } from './systemSettings';

const d = (o: Partial<TypeDraft> = {}): TypeDraft => ({ code: '', name: 'Tithe', goalAmount: '', goalPer: '', ...o });

describe('contribution types', () => {
  it('suggests a code from the name', () => {
    expect(suggestTypeCode('Dîme & offrandes')).toBe('DIME_OFFRANDES');
    expect(suggestTypeCode('  Special offering 2026 ')).toBe('SPECIAL_OFFERING_2026');
  });
  it('finds the first problem', () => {
    expect(typesProblem([d()])).toBeNull();
    expect(typesProblem([d({ name: ' ' })])).toBe('door.sset.err.name');
    expect(typesProblem([d({ code: 'a b' })])).toBe('door.sset.err.code');
    expect(typesProblem([d(), d({ name: 'tithe' })])).toBe('door.sset.err.duplicate');
    expect(typesProblem([d({ goalAmount: '12x', goalPer: 'TEAM' })])).toBe('door.sset.err.amount');
    expect(typesProblem([d({ goalAmount: '500' })])).toBe('door.sset.err.goal');
    expect(typesProblem([d({ goalPer: 'MEMBER' })])).toBe('door.sset.err.goal');
    expect(typesProblem(Array.from({ length: 13 }, (_, i) => d({ name: `T${i}` })))).toBe('door.sset.err.tooMany');
  });
  it('cleans the list for the server and keeps Cash when no method is chosen', () => {
    const out = cleanMoney([d({ goalAmount: '1000', goalPer: 'MEMBER' }), d({ name: 'Building', code: 'BUILD' })], []);
    expect(out).toEqual({ types: [{ code: 'TITHE', name: 'Tithe', goalAmount: 1000, goalPer: 'MEMBER' }, { code: 'BUILD', name: 'Building' }], methods: ['CASH'] });
  });
  it('turns a stored type into an editable draft and back', () => {
    const t = { code: 'TITHE', name: 'Tithe', goalAmount: 800, goalPer: 'TEAM' as const };
    expect(cleanMoney([toDraft(t)], ['MOMO']).types[0]).toEqual(t);
  });
});
