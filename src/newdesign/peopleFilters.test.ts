import { describe, expect, it } from 'vitest';
import { cleanFilters, dropFilter, isComplete, offeredKinds, setFilter, toCriteria, type ActiveFilter } from './peopleFilters';

describe('people filter builder', () => {
  it('builds the request from chained filters, in any order', () => {
    let f: ActiveFilter[] = [];
    f = setFilter(f, 'gender', { gender: 'MALE' });
    f = setFilter(f, 'unit', { unit: 'ou-elim' });
    f = setFilter(f, 'baptism', { years: '10' });
    f = setFilter(f, 'workYears', { years: '5' });
    f = setFilter(f, 'sector', { sector: 'FINANCE' });
    f = setFilter(f, 'education', { level: 'BACHELOR' });
    f = setFilter(f, 'children', { min: '2', max: '' });
    expect(toCriteria(f)).toEqual({ gender: 'MALE', unitIds: ['ou-elim'], baptismYearsMin: 10, employedYearsMin: 5, sector: ['FINANCE'], educationMin: 'BACHELOR', childrenMin: 2 });
  });
  it('ignores half-filled filters and bad numbers', () => {
    expect(toCriteria([{ kind: 'age', values: { min: '', max: '' } }, { kind: 'baptism', values: { years: '-3' } }, { kind: 'unit', values: { unit: '' } }])).toEqual({});
    expect(isComplete({ kind: 'calling', values: { name: '  ' } })).toBe(false);
  });
  it('widowed and exact education levels', () => {
    expect(toCriteria([{ kind: 'marital', values: { marital: 'WIDOWED' } }, { kind: 'education', values: { level: 'MASTER', exact: 'yes' } }])).toEqual({ marital: ['WIDOWED'], educationIs: ['MASTER'] });
  });
  it('replaces a kind in place and drops it again', () => {
    const f = setFilter(setFilter([], 'age', { min: '20' }), 'gender', { gender: 'FEMALE' });
    expect(setFilter(f, 'age', { min: '30' }).map((x) => x.kind)).toEqual(['age', 'gender']);
    expect(dropFilter(f, 'age').map((x) => x.kind)).toEqual(['gender']);
  });
  it('offers only what the viewer may use', () => {
    expect(offeredKinds(['unitIds', 'status']).map((k) => k.kind)).toEqual(['unit', 'status']);
    expect(offeredKinds([])).toEqual([]);
  });
  it('cleans views kept in the browser', () => {
    expect(cleanFilters([{ kind: 'age', values: { min: '5' } }, { kind: 'nope', values: {} }, null, { kind: 'unit', values: { unit: 3 } }])).toEqual([{ kind: 'age', values: { min: '5' } }, { kind: 'unit', values: {} }]);
    expect(cleanFilters('x')).toEqual([]);
  });
});
