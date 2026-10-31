import type { PeopleCriteria, PeopleCriterionKey, PersonStatus } from '../api/frontDoorApi';

/**
 * The filters of the People directory, one narrowing the next. Each kind may be added once; the same builder
 * is meant to serve work lists (tasks, events, projects, programs) by giving them their own kinds.
 */
export type FilterKind =
  | 'unit' | 'status' | 'gender' | 'age' | 'baptism' | 'employment' | 'sector' | 'workYears'
  | 'education' | 'educationField' | 'children' | 'marital' | 'calling' | 'callingUnit';
export type FilterValues = Record<string, string>;
export type ActiveFilter = { kind: FilterKind; values: FilterValues };
export type FieldSpec = { key: string; type: 'select' | 'number' | 'text'; source?: 'units' | 'sectors' | 'education' | 'employment' | 'marital' | 'gender' | 'status' };
export type KindSpec = { kind: FilterKind; needs: PeopleCriterionKey; fields: FieldSpec[] };

export const FILTER_KINDS: KindSpec[] = [
  { kind: 'unit', needs: 'unitIds', fields: [{ key: 'unit', type: 'select', source: 'units' }] },
  { kind: 'status', needs: 'status', fields: [{ key: 'status', type: 'select', source: 'status' }] },
  { kind: 'gender', needs: 'gender', fields: [{ key: 'gender', type: 'select', source: 'gender' }] },
  { kind: 'age', needs: 'ageMin', fields: [{ key: 'min', type: 'number' }, { key: 'max', type: 'number' }] },
  { kind: 'marital', needs: 'marital', fields: [{ key: 'marital', type: 'select', source: 'marital' }] },
  { kind: 'baptism', needs: 'baptismYearsMin', fields: [{ key: 'years', type: 'number' }] },
  { kind: 'employment', needs: 'employmentStatus', fields: [{ key: 'status', type: 'select', source: 'employment' }] },
  { kind: 'sector', needs: 'sector', fields: [{ key: 'sector', type: 'select', source: 'sectors' }] },
  { kind: 'workYears', needs: 'employedYearsMin', fields: [{ key: 'years', type: 'number' }] },
  { kind: 'education', needs: 'educationMin', fields: [{ key: 'level', type: 'select', source: 'education' }] },
  { kind: 'educationField', needs: 'educationField', fields: [{ key: 'field', type: 'text' }] },
  { kind: 'children', needs: 'childrenMin', fields: [{ key: 'min', type: 'number' }, { key: 'max', type: 'number' }] },
  { kind: 'calling', needs: 'callingName', fields: [{ key: 'name', type: 'text' }] },
  { kind: 'callingUnit', needs: 'callingUnitId', fields: [{ key: 'unit', type: 'select', source: 'units' }] },
];

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

/** The kinds this viewer may add: only what the server says they may use. */
export const offeredKinds = (allowed: PeopleCriterionKey[]): KindSpec[] => FILTER_KINDS.filter((k) => allowed.includes(k.needs));

/** A filter counts once it says something; half-filled ones wait without changing the list. */
export function isComplete(f: ActiveFilter): boolean {
  const v = f.values;
  switch (f.kind) {
    case 'age': case 'children': return num(v.min) !== undefined || num(v.max) !== undefined;
    case 'baptism': case 'workYears': return num(v.years) !== undefined;
    case 'educationField': return (v.field ?? '').trim() !== '';
    case 'calling': return (v.name ?? '').trim() !== '';
    default: return Object.values(v).some((x) => x.trim() !== '');
  }
}

/** The request the server understands, from the filters in the order they were added. */
export function toCriteria(filters: ActiveFilter[]): PeopleCriteria {
  const c: PeopleCriteria = {};
  for (const f of filters.filter(isComplete)) {
    const v = f.values;
    switch (f.kind) {
      case 'unit': c.unitIds = [v.unit!]; break;
      case 'status': c.status = [v.status as PersonStatus]; break;
      case 'gender': c.gender = v.gender as 'MALE' | 'FEMALE'; break;
      case 'age': c.ageMin = num(v.min); c.ageMax = num(v.max); break;
      case 'baptism': c.baptismYearsMin = num(v.years); break;
      case 'employment': c.employmentStatus = [v.status!]; break;
      case 'sector': c.sector = [v.sector!]; break;
      case 'workYears': c.employedYearsMin = num(v.years); break;
      case 'education': if (v.exact === 'yes') c.educationIs = [v.level!]; else c.educationMin = v.level; break;
      case 'educationField': c.educationField = v.field!.trim(); break;
      case 'children': c.childrenMin = num(v.min); c.childrenMax = num(v.max); break;
      case 'marital': c.marital = [v.marital as 'SINGLE' | 'MARRIED' | 'WIDOWED']; break;
      case 'calling': c.callingName = v.name!.trim(); break;
      case 'callingUnit': c.callingUnitId = v.unit; break;
    }
  }
  for (const k of Object.keys(c) as PeopleCriterionKey[]) if (c[k] === undefined) delete c[k];
  return c;
}

/** Add or replace the filter of a kind, keeping the order the others were added in. */
export function setFilter(list: ActiveFilter[], kind: FilterKind, values: FilterValues): ActiveFilter[] {
  return list.some((f) => f.kind === kind) ? list.map((f) => (f.kind === kind ? { kind, values } : f)) : [...list, { kind, values }];
}
export const dropFilter = (list: ActiveFilter[], kind: FilterKind): ActiveFilter[] => list.filter((f) => f.kind !== kind);

/** Views kept in the browser may be old or damaged: keep only what is still a known kind with text values. */
export function cleanFilters(raw: unknown): ActiveFilter[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set(FILTER_KINDS.map((k) => k.kind));
  return raw
    .filter((f): f is ActiveFilter => !!f && kinds.has(f.kind) && !!f.values && typeof f.values === 'object')
    .map((f) => ({ kind: f.kind, values: Object.fromEntries(Object.entries(f.values).filter(([, v]) => typeof v === 'string')) as FilterValues }))
    .slice(0, FILTER_KINDS.length);
}
