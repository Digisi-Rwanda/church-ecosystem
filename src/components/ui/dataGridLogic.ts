import type { ReactNode } from 'react';

/**
 * Pure logic behind DataGrid: filter → sort → paginate, plus CSV export.
 * Kept free of React so it can be unit-tested.
 */

export type GridColumn<T> = {
  id: string;
  header: string;
  /**
   * Plain text for this cell, used for search, filter, sort and CSV export.
   * Return null when the viewer may not see the value (shown as "Restricted").
   */
  value: (row: T) => string | null;
  /** Custom cell content; defaults to the plain value. */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  /** 'text' = contains box, 'select' = dropdown of the distinct values. */
  filter?: 'text' | 'select' | false;
  /** Hide on first render (user can turn it on from Columns). */
  hiddenByDefault?: boolean;
};

export type SortState = { columnId: string; direction: 'asc' | 'desc' };

export type GridQuery = {
  /** Searches every column that has a value. */
  search: string;
  /** columnId → text (contains) or exact value (select). */
  filters: Record<string, string>;
  sort: SortState | null;
};

export const RESTRICTED_LABEL = 'Restricted';

const norm = (s: string) => s.trim().toLocaleLowerCase();

/** Rows that survive the search box and the per-column filters. */
export function filterRows<T>(
  rows: T[],
  columns: GridColumn<T>[],
  query: Pick<GridQuery, 'search' | 'filters'>,
): T[] {
  const search = norm(query.search);
  const active = Object.entries(query.filters).filter(
    ([, v]) => v.trim() !== '',
  );
  if (!search && active.length === 0) return rows;

  return rows.filter((row) => {
    for (const [colId, wanted] of active) {
      const col = columns.find((c) => c.id === colId);
      if (!col) continue;
      const v = col.value(row);
      if (v === null) return false;
      if (col.filter === 'select') {
        if (v !== wanted) return false;
      } else if (!norm(v).includes(norm(wanted))) {
        return false;
      }
    }
    if (search) {
      return columns.some((c) => {
        const v = c.value(row);
        return v !== null && norm(v).includes(search);
      });
    }
    return true;
  });
}

/** Stable sort; restricted / empty values always sink to the bottom. */
export function sortRows<T>(
  rows: T[],
  columns: GridColumn<T>[],
  sort: SortState | null,
): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.columnId);
  if (!col) return rows;
  const dir = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: col.value(row) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c =
        a.v.localeCompare(b.v, undefined, {
          numeric: true,
          sensitivity: 'base',
        }) * dir;
      return c !== 0 ? c : a.i - b.i;
    })
    .map((x) => x.row);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number) {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const p = clampPage(page, rows.length, pageSize);
  return rows.slice((p - 1) * pageSize, p * pageSize);
}

/**
 * Page buttons to show: first, last, and a window around the current page,
 * with `null` marking a gap ("…").
 */
export function pageWindow(
  page: number,
  pages: number,
  radius = 1,
): Array<number | null> {
  const keep = new Set<number>([1, pages]);
  for (let i = page - radius; i <= page + radius; i++) {
    if (i >= 1 && i <= pages) keep.add(i);
  }
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/** Distinct non-null values of a column, for select filters. */
export function distinctValues<T>(
  rows: T[],
  col: GridColumn<T>,
  max = 40,
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = col.value(r);
    if (v !== null && v !== '') set.add(v);
    if (set.size >= max) break;
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV of the given rows and columns. Restricted cells never leak. */
export function toCsv<T>(rows: T[], columns: GridColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) =>
    columns
      .map((c) => {
        const v = c.value(r);
        return csvCell(v === null ? RESTRICTED_LABEL : v);
      })
      .join(','),
  );
  return [head, ...body].join('\r\n');
}
