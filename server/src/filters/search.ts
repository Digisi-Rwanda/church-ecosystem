/** Validate, filter, sort and page, in that order, on rows the caller has already limited to what the viewer may see. */
import { matchesPlan } from './engine.js';
import { paginate, sortStable } from './page.js';
import { planRequest, type Plan } from './request.js';
import type { MatchRequest, PageRequest, Registry, SortRequest } from './types.js';

export interface SearchInput<R, C, V> {
  registry: Registry<R, C, V>; viewer: V; ctx: C & { today?: string };
  /** Rows in their base order (name, then id); equal sort keys keep it. */
  rows: R[];
  unitScope: Set<string> | null;
  match?: MatchRequest; sort?: SortRequest; page: PageRequest;
  /** An extra built-in test (the quick text search) applied alongside the conditions. */
  quick?: (row: R) => boolean;
  /** A plan already made (and so already validated) by the caller, to avoid loading data for a bad request. */
  plan?: Plan<R, C, V>;
}

export function runSearch<R, C, V>(i: SearchInput<R, C, V>) {
  const plan = i.plan ?? planRequest(i.registry, i.viewer, i.ctx, i.unitScope, i.match, i.sort);
  let hits = i.rows.filter((r) => (!i.quick || i.quick(r)) && matchesPlan(plan, r, i.ctx));
  if (plan.sort && !plan.sort.def.baseOrder) {
    const key = plan.sort.def.sortKey!;
    hits = sortStable(hits, (r) => key(r, i.ctx), plan.sort.dir);
  }
  return paginate(hits, i.page);
}
