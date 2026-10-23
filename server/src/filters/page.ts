/** Stable ordering and paging, so a page never repeats or skips a row and the total is the true size of the allowed set. */
import { LIMITS, type PageRequest } from './types.js';

export const defaultPage = (): PageRequest => ({ limit: LIMITS.defaultPageSize, offset: 0 });

/**
 * Sort by a key, missing values last whichever the direction. The sort is stable: rows with equal keys keep the
 * order they came in, which callers set to name then id, so the result is fully determined.
 */
export function sortStable<R>(rows: R[], key: (r: R) => string | number | null, dir: 'asc' | 'desc'): R[] {
  const keyed = rows.map((r) => ({ r, k: key(r) }));
  keyed.sort((a, b) => {
    if (a.k === null && b.k === null) return 0;
    if (a.k === null) return 1;
    if (b.k === null) return -1;
    const c = a.k === b.k ? 0 : a.k < b.k ? -1 : 1;
    return dir === 'desc' ? -c : c;
  });
  return keyed.map((x) => x.r);
}

export function paginate<R>(rows: R[], page: PageRequest): { total: number; items: R[]; page: { limit: number; offset: number; hasMore: boolean } } {
  return {
    total: rows.length,
    items: rows.slice(page.offset, page.offset + page.limit),
    page: { limit: page.limit, offset: page.offset, hasMore: page.offset + page.limit < rows.length },
  };
}
