import { describe, expect, it } from 'vitest';
import {
  clampPage,
  distinctValues,
  filterRows,
  pageCount,
  pageSlice,
  pageWindow,
  sortRows,
  toCsv,
  type GridColumn,
} from './dataGridLogic';

type R = { id: string; name: string; city: string | null; n: string };
const rows: R[] = [
  { id: '1', name: 'Alice', city: 'Kigali', n: '10' },
  { id: '2', name: 'bob', city: null, n: '9' },
  { id: '3', name: 'Carol', city: 'Huye', n: '100' },
  { id: '4', name: 'Dan', city: 'Kigali', n: '2' },
];
const cols: GridColumn<R>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name, sortable: true },
  { id: 'city', header: 'City', value: (r) => r.city, filter: 'select' },
  { id: 'n', header: 'N', value: (r) => r.n, sortable: true },
];

describe('filterRows', () => {
  it('searches across columns, case-insensitive', () => {
    expect(filterRows(rows, cols, { search: 'KIG', filters: {} })).toHaveLength(2);
  });
  it('select filter is exact, text filter is contains', () => {
    expect(
      filterRows(rows, cols, { search: '', filters: { city: 'Huye' } }).map((r) => r.id),
    ).toEqual(['3']);
    expect(
      filterRows(rows, cols, { search: '', filters: { name: 'a' } }).map((r) => r.id),
    ).toEqual(['1', '3', '4']);
  });
  it('restricted values never match a filter or search', () => {
    expect(filterRows(rows, cols, { search: '', filters: { city: 'Kigali' } })).toHaveLength(2);
    expect(filterRows(rows, [cols[1]!], { search: 'restricted', filters: {} })).toHaveLength(0);
  });
  it('combines filters with AND', () => {
    expect(
      filterRows(rows, cols, { search: '', filters: { city: 'Kigali', name: 'dan' } }).map((r) => r.id),
    ).toEqual(['4']);
  });
});

describe('sortRows', () => {
  it('sorts naturally (numbers inside text) and case-insensitively', () => {
    expect(sortRows(rows, cols, { columnId: 'n', direction: 'asc' }).map((r) => r.n)).toEqual(['2', '9', '10', '100']);
    expect(sortRows(rows, cols, { columnId: 'name', direction: 'asc' }).map((r) => r.name)).toEqual(['Alice', 'bob', 'Carol', 'Dan']);
  });
  it('descending flips order but restricted rows stay last', () => {
    const out = sortRows(rows, cols, { columnId: 'city', direction: 'desc' });
    expect(out[out.length - 1]!.city).toBeNull();
    expect(out[0]!.city).toBe('Kigali');
  });
  it('does not mutate the input and null sort returns it as-is', () => {
    const copy = [...rows];
    sortRows(rows, cols, { columnId: 'name', direction: 'desc' });
    expect(rows).toEqual(copy);
    expect(sortRows(rows, cols, null)).toBe(rows);
  });
});

describe('pagination', () => {
  const many = Array.from({ length: 12 }, (_, i) => i);
  it('counts pages (at least 1)', () => {
    expect(pageCount(0, 5)).toBe(1);
    expect(pageCount(12, 5)).toBe(3);
    expect(pageCount(10, 5)).toBe(2);
  });
  it('slices 5 rows per page and clamps out-of-range pages', () => {
    expect(pageSlice(many, 1, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageSlice(many, 3, 5)).toEqual([10, 11]);
    expect(pageSlice(many, 99, 5)).toEqual([10, 11]);
    expect(clampPage(0, 12, 5)).toBe(1);
  });
  it('builds a window with gaps', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 24)).toEqual([1, 2, null, 24]);
    expect(pageWindow(12, 24)).toEqual([1, null, 11, 12, 13, null, 24]);
    expect(pageWindow(24, 24)).toEqual([1, null, 23, 24]);
  });
});

describe('distinctValues & csv', () => {
  it('lists distinct visible values sorted', () => {
    expect(distinctValues(rows, cols[1]!)).toEqual(['Huye', 'Kigali']);
  });
  it('exports CSV with escaping and no restricted leak', () => {
    const csv = toCsv(
      [{ id: '9', name: 'Say "hi", ok', city: null, n: '1' }],
      cols,
    );
    expect(csv).toBe('Name,City,N\r\n"Say ""hi"", ok",Restricted,1');
  });
});
