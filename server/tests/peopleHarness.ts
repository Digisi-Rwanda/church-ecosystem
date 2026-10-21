/** Helpers for testing the filter rules directly, without the database or the HTTP layer. */
import { runSearch, kigaliDay, type MatchRequest, type SortRequest } from '../src/filters/index';
import { PEOPLE_FIELDS, rowFromData, type PeopleCtx, type PeopleViewer, type PersonRow } from '../src/people/fields';
import { SECTIONS, type Section } from '../src/person360/rules';

export const EVERYTHING: PeopleViewer = { identity: true, read: [...SECTIONS] };
export const NOW = new Date('2026-10-20T10:00:00Z');

export const row = (over: Partial<Omit<PersonRow, 'rec'>> & { records?: Array<{ section: Section; data: Record<string, unknown> }> } = {}): PersonRow => {
  const { records, ...rest } = over;
  return rowFromData({ id: 'x', fullName: 'X', memberCode: null, status: 'ACTIVE', gender: null, dateOfBirth: null, unitIds: [], ...rest }, records ?? []);
};

export interface RunOptions {
  viewer?: PeopleViewer; now?: Date; units?: Record<string, string[]>; sort?: SortRequest; unitScope?: Set<string> | null;
  people?: Record<string, { fullName: string; dateOfBirth: string | null }>; limit?: number; offset?: number; q?: string;
}
export const ctxFor = (o: RunOptions = {}): PeopleCtx => ({
  today: kigaliDay(o.now ?? NOW),
  below: (u) => new Set([u, ...(o.units?.[u] ?? [])]),
  person: (id) => o.people?.[id],
});
export function search(rows: PersonRow[], match: MatchRequest | undefined, o: RunOptions = {}) {
  const q = o.q?.toLowerCase();
  return runSearch({
    registry: PEOPLE_FIELDS, viewer: o.viewer ?? EVERYTHING, ctx: ctxFor(o), rows, unitScope: o.unitScope ?? null, match, sort: o.sort,
    page: { limit: o.limit ?? 100, offset: o.offset ?? 0 },
    quick: q ? (r) => r.fullName.toLowerCase().includes(q) : undefined,
  });
}
export const ids = (rows: PersonRow[], match: MatchRequest | undefined, o: RunOptions = {}) => search(rows, match, o).items.map((r) => r.id);
export const all = (...c: Array<{ field: string; op: string; value?: unknown }>): MatchRequest => ({ all: c });
