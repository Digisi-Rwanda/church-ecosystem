/**
 * The first People filter request shape (`{ criteria: { gender, ageMin, … } }`), kept for one release so the
 * current screens keep working while the new one is built. It no longer has rules of its own: each criterion is
 * translated into a condition of the shared framework, so both shapes answer identically and share one set of
 * permission and missing-value rules. See people/fields.ts for the rules and the field registry.
 */
import { z } from 'zod';
import { SECTORS } from '../person360/rules.js';
import type { Condition, MatchRequest } from '../filters/types.js';
import { EDU_LEVELS, EDU_RANK, EMPLOYMENT, MARITAL, NEED_OF, STATUSES, mayUseNeed, type Need, type PeopleViewer } from './fields.js';

const RANKED_LEVELS = Object.keys(EDU_RANK) as [string, ...string[]];
const n = (max = 120) => z.number().int().min(0).max(max);
export const CriteriaSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.array(z.enum(STATUSES)).max(3).optional(),
  unitIds: z.array(z.string().max(80)).max(20).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  ageMin: n().optional(),
  ageMax: n().optional(),
  baptismYearsMin: n(100).optional(),
  employmentStatus: z.array(z.enum(EMPLOYMENT)).max(5).optional(),
  sector: z.array(z.enum(SECTORS)).max(SECTORS.length).optional(),
  employedYearsMin: n(80).optional(),
  educationMin: z.enum(RANKED_LEVELS).optional(),
  educationIs: z.array(z.enum(EDU_LEVELS)).max(EDU_LEVELS.length).optional(),
  educationField: z.string().trim().max(80).optional(),
  childrenMin: n(30).optional(),
  childrenMax: n(30).optional(),
  marital: z.array(z.enum(MARITAL)).max(3).optional(),
  callingName: z.string().trim().max(80).optional(),
  callingUnitId: z.string().max(80).optional(),
}).strict();
export type Criteria = z.infer<typeof CriteriaSchema>;
export type CriterionKey = keyof Criteria;

/** The registry field each old criterion is a condition on. `q` is the quick search, not a field. */
const FIELD_OF: Record<Exclude<CriterionKey, 'q'>, string> = {
  status: 'status', unitIds: 'unit', gender: 'gender', ageMin: 'age', ageMax: 'age', baptismYearsMin: 'baptismYears',
  employmentStatus: 'employment', sector: 'employment', employedYearsMin: 'employment',
  educationMin: 'education', educationIs: 'education', educationField: 'education',
  childrenMin: 'childCount', childrenMax: 'childCount', marital: 'marital', callingName: 'calling', callingUnitId: 'calling',
};
const needOf = (k: CriterionKey): Need => (k === 'q' ? 'OPEN' : NEED_OF[FIELD_OF[k]] ?? 'IDENTITY');

export type Viewer = PeopleViewer;
export const mayUse = (key: CriterionKey, v: Viewer): boolean => mayUseNeed(needOf(key), v);
/** The criteria in this request that the viewer may not use (set, not undefined). */
export const forbiddenKeys = (c: Criteria, v: Viewer): CriterionKey[] =>
  (Object.keys(c) as CriterionKey[]).filter((k) => c[k] !== undefined && !mayUse(k, v));
/** Every criterion this viewer may use, so the panel offers nothing else. */
export const usableKeys = (v: Viewer): CriterionKey[] => (Object.keys(CriteriaSchema.shape) as CriterionKey[]).filter((k) => mayUse(k, v));

/** The same request in the new shape. Everything is AND, as it always was. */
export function criteriaToMatch(c: Criteria): MatchRequest {
  const all: Condition[] = [];
  const add = (field: string, op: string, value?: unknown) => all.push({ field, op, ...(value === undefined ? {} : { value }) });
  if (c.status?.length) add('status', 'isAny', c.status);
  if (c.unitIds?.length) add('unit', 'includesAny', c.unitIds);
  if (c.gender) add('gender', 'is', c.gender);
  if (c.ageMin !== undefined) add('age', 'atLeast', c.ageMin);
  if (c.ageMax !== undefined) add('age', 'atMost', c.ageMax);
  if (c.baptismYearsMin !== undefined) add('baptismYears', 'atLeast', c.baptismYearsMin);
  // Status, sector and years describe one job, and level and field one education record, as they always did.
  if (c.employmentStatus?.length || c.sector?.length || c.employedYearsMin !== undefined) {
    add('employment', 'anyMatch', {
      ...(c.employmentStatus?.length ? { status: c.employmentStatus } : {}),
      ...(c.sector?.length ? { sector: c.sector } : {}),
      ...(c.employedYearsMin !== undefined ? { yearsAtLeast: c.employedYearsMin } : {}),
    });
  }
  if (c.educationMin || c.educationIs?.length || c.educationField) {
    add('education', 'anyMatch', {
      ...(c.educationMin ? { levelAtLeast: c.educationMin } : {}),
      ...(c.educationIs?.length ? { levelIn: c.educationIs } : {}),
      ...(c.educationField ? { field: c.educationField } : {}),
    });
  }
  if (c.childrenMin !== undefined) add('childCount', 'atLeast', c.childrenMin);
  if (c.childrenMax !== undefined) add('childCount', 'atMost', c.childrenMax);
  if (c.marital?.length) add('marital', 'isAny', c.marital);
  if (c.callingName || c.callingUnitId) add('calling', 'anyMatch', { ...(c.callingName ? { name: c.callingName } : {}), ...(c.callingUnitId ? { unitId: c.callingUnitId } : {}) });
  return { all };
}
