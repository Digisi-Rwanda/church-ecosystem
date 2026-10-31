import type { PeopleCriteria } from '../api/frontDoorApi';
import { emptyState, type Condition } from './filterModel';
import { serializeFilterState } from './filterUrl';
import { cleanFilters, toCriteria } from './peopleFilters';
import { loadViews, type SavedView } from './peopleTools';

/** A kept view is just a name and the address query it stands for, so opening it is the same as following a link. */
export type PeopleView = { name: string; query: string };
const KEY = 'moriah.people.views.v2';
const MAX = 12;

const range = (field: string, min?: number, max?: number): Condition[] =>
  min !== undefined && max !== undefined ? [{ field, op: 'between', value: [min, max] }]
    : min !== undefined ? [{ field, op: 'atLeast', value: min }] : max !== undefined ? [{ field, op: 'atMost', value: max }] : [];
const choice = (field: string, list: string[]): Condition[] => (list.length === 0 ? [] : list.length === 1 ? [{ field, op: 'is', value: list[0] }] : [{ field, op: 'isAny', value: list }]);

/** The first version's criteria, as grouped-search conditions (several employment or education criteria stay on one record). */
export function criteriaToConditions(c: PeopleCriteria): Condition[] {
  const out: Condition[] = [];
  if (c.unitIds?.length) out.push({ field: 'unit', op: 'includesAny', value: c.unitIds });
  out.push(...choice('status', c.status ?? []));
  if (c.gender) out.push({ field: 'gender', op: 'is', value: c.gender });
  out.push(...range('age', c.ageMin, c.ageMax));
  if (c.baptismYearsMin !== undefined) out.push({ field: 'baptismYears', op: 'atLeast', value: c.baptismYearsMin });
  const job: Record<string, unknown> = {};
  if (c.employmentStatus?.length) job.status = c.employmentStatus;
  if (c.sector?.length) job.sector = c.sector;
  if (c.employedYearsMin !== undefined) job.yearsAtLeast = c.employedYearsMin;
  if (Object.keys(job).length) out.push({ field: 'employment', op: 'anyMatch', value: job });
  const study: Record<string, unknown> = {};
  if (c.educationMin) study.levelAtLeast = c.educationMin;
  if (c.educationIs?.length) study.levelIn = c.educationIs;
  if (c.educationField) study.field = c.educationField;
  if (Object.keys(study).length) out.push({ field: 'education', op: 'anyMatch', value: study });
  out.push(...range('childCount', c.childrenMin, c.childrenMax));
  out.push(...choice('marital', c.marital ?? []));
  const call: Record<string, unknown> = {};
  if (c.callingName) call.name = c.callingName;
  if (c.callingUnitId) call.unitId = c.callingUnitId;
  if (Object.keys(call).length) out.push({ field: 'calling', op: 'anyMatch', value: call });
  return out;
}

/** An older kept view as the query it now stands for. */
export function legacyViewQuery(v: SavedView, defaultSize = 50): string {
  const criteria = toCriteria(cleanFilters(v.filters));
  const status = v.status && !criteria.status ? [v.status as 'ACTIVE'] : criteria.status;
  const all = criteriaToConditions({ ...criteria, ...(status ? { status } : {}) });
  return serializeFilterState({ ...emptyState(defaultSize), q: v.q ?? '', archived: !!v.archived, all }, { size: defaultSize }).toString();
}

export function loadPeopleViews(): PeopleView[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is PeopleView => !!x && typeof x.name === 'string' && typeof x.query === 'string').slice(0, MAX) : [];
    }
  } catch {
    return [];
  }
  // First time on this screen since the grouped filters: bring the kept views over.
  const moved = loadViews().map((v) => ({ name: v.name, query: legacyViewQuery(v) }));
  if (moved.length) storePeopleViews(moved);
  return moved.slice(0, MAX);
}

export function storePeopleViews(v: PeopleView[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v.slice(0, MAX)));
  } catch {
    /* private window: the views just last for this visit */
  }
}
