/**
 * People filters: "all men of the Elim choir, baptised more than 10 years ago, five years in finance,
 * with a bachelor degree and at least two children". Pure rules: the route loads the facts and says what the
 * viewer may read; this file decides who matches and which criteria a viewer may use at all.
 */
import { z } from 'zod';
import { SECTORS, type Section } from '../person360/rules.js';

export const EDU_RANK: Record<string, number> = {
  NONE: 0, PRIMARY: 1, SECONDARY_O: 2, SECONDARY: 3, SECONDARY_A: 3, TVET: 4, ASSOCIATE: 4, UNIVERSITY: 5, BACHELOR: 5, POSTGRAD: 6, MASTER: 6, DOCTORATE: 7,
};
export const EDU_LEVELS = ['NONE', 'PRIMARY', 'SECONDARY_O', 'SECONDARY_A', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER'] as const;
export const MARITAL = ['SINGLE', 'MARRIED', 'WIDOWED'] as const;
export type Marital = (typeof MARITAL)[number];

const n = (max = 120) => z.number().int().min(0).max(max);
export const CriteriaSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.array(z.enum(['ACTIVE', 'INACTIVE', 'VISITOR'])).max(3).optional(),
  unitIds: z.array(z.string().max(80)).max(20).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  ageMin: n().optional(),
  ageMax: n().optional(),
  baptismYearsMin: n(100).optional(),
  employmentStatus: z.array(z.enum(['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED', 'RETIRED'])).max(5).optional(),
  sector: z.array(z.enum(SECTORS)).max(SECTORS.length).optional(),
  employedYearsMin: n(80).optional(),
  educationMin: z.enum(EDU_LEVELS).optional(),
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

/** What a criterion needs: nothing, the identity details (Church Leader), or the right to read one Person 360 section. */
export type Need = 'OPEN' | 'IDENTITY' | Section;
export const NEEDS: Record<CriterionKey, Need> = {
  q: 'OPEN', status: 'OPEN', unitIds: 'OPEN',
  gender: 'IDENTITY', ageMin: 'IDENTITY', ageMax: 'IDENTITY',
  baptismYearsMin: 'BAPTISM',
  employmentStatus: 'EMPLOYMENT', sector: 'EMPLOYMENT', employedYearsMin: 'EMPLOYMENT',
  educationMin: 'EDUCATION', educationIs: 'EDUCATION', educationField: 'EDUCATION',
  childrenMin: 'FAMILY', childrenMax: 'FAMILY',
  marital: 'MARRIAGE',
  callingName: 'CALLING', callingUnitId: 'CALLING',
};

export interface Viewer { identity: boolean; read: Section[] }
export const mayUse = (key: CriterionKey, v: Viewer): boolean => {
  const need = NEEDS[key];
  return need === 'OPEN' || (need === 'IDENTITY' ? v.identity : v.read.includes(need));
};
/** The criteria in this request that the viewer may not use (set, not undefined). */
export const forbiddenKeys = (c: Criteria, v: Viewer): CriterionKey[] =>
  (Object.keys(c) as CriterionKey[]).filter((k) => c[k] !== undefined && !mayUse(k, v));
/** Every criterion this viewer may use, so the panel offers nothing else. */
export const usableKeys = (v: Viewer): CriterionKey[] => (Object.keys(NEEDS) as CriterionKey[]).filter((k) => mayUse(k, v));

/** One person's facts, from the current records only. `undefined` sections were not loaded because the viewer may not read them. */
export interface Facts {
  id: string; fullName: string; memberCode?: string | null; status: string; gender?: string | null; dateOfBirth?: string | null;
  unitIds: string[];
  records: Array<{ section: Section; data: Record<string, unknown> }>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function yearsBetween(from: string | null | undefined, now: Date): number | null {
  if (!from || !DAY.test(from.slice(0, 10))) return null;
  const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let y = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) y--;
  return y;
}

const of = (f: Facts, s: Section) => f.records.filter((r) => r.section === s).map((r) => r.data);
export const childrenOf = (f: Facts): number => of(f, 'FAMILY').filter((d) => d.relation === 'CHILD').length;
/** Married, widowed (the spouse passed away) or single (no marriage recorded). */
export function maritalOf(f: Facts): Marital {
  const m = of(f, 'MARRIAGE')[0];
  if (!m) return 'SINGLE';
  return m.endedBy === 'DEATH' ? 'WIDOWED' : 'MARRIED';
}
const lc = (v: unknown) => String(v ?? '').toLowerCase();

export function matches(f: Facts, c: Criteria, now: Date, descendants: (unitId: string) => Set<string>): boolean {
  if (c.q) {
    const q = c.q.toLowerCase();
    if (!lc(f.fullName).includes(q) && !lc(f.memberCode).includes(q)) return false;
  }
  if (c.status?.length && !(c.status as string[]).includes(f.status)) return false;
  if (c.unitIds?.length) {
    const inside = new Set<string>();
    for (const u of c.unitIds) for (const x of descendants(u)) inside.add(x);
    if (!f.unitIds.some((u) => inside.has(u))) return false;
  }
  if (c.gender && f.gender !== c.gender) return false;
  if (c.ageMin !== undefined || c.ageMax !== undefined) {
    const age = yearsBetween(f.dateOfBirth, now);
    if (age === null || (c.ageMin !== undefined && age < c.ageMin) || (c.ageMax !== undefined && age > c.ageMax)) return false;
  }
  if (c.baptismYearsMin !== undefined) {
    const y = yearsBetween(String(of(f, 'BAPTISM')[0]?.date ?? ''), now);
    if (y === null || y < c.baptismYearsMin) return false;
  }
  const work = of(f, 'EMPLOYMENT')[0];
  if (c.employmentStatus?.length && !(work && (c.employmentStatus as string[]).includes(String(work.status)))) return false;
  if (c.sector?.length && !(work && c.sector.includes(String(work.sector) as never))) return false;
  if (c.employedYearsMin !== undefined) {
    const y = work && (work.status === 'EMPLOYED' || work.status === 'SELF_EMPLOYED') ? yearsBetween(String(work.since ?? ''), now) : null;
    if (y === null || y < c.employedYearsMin) return false;
  }
  if (c.educationMin || c.educationIs?.length || c.educationField) {
    const edu = of(f, 'EDUCATION');
    const ok = edu.some((d) => {
      const level = String(d.level);
      if (c.educationMin && !((EDU_RANK[level] ?? -1) >= EDU_RANK[c.educationMin]!)) return false;
      if (c.educationIs?.length && !c.educationIs.includes(level as never)) return false;
      if (c.educationField && !lc(d.field).includes(c.educationField.toLowerCase())) return false;
      return true;
    });
    if (!ok) return false;
  }
  if (c.childrenMin !== undefined && childrenOf(f) < c.childrenMin) return false;
  if (c.childrenMax !== undefined && childrenOf(f) > c.childrenMax) return false;
  if (c.marital?.length && !c.marital.includes(maritalOf(f))) return false;
  if (c.callingName || c.callingUnitId) {
    const ok = of(f, 'CALLING').some((d) =>
      (!c.callingName || lc(d.name).includes(c.callingName.toLowerCase())) &&
      (!c.callingUnitId || (!!d.orgUnitId && descendants(c.callingUnitId).has(String(d.orgUnitId)))));
    if (!ok) return false;
  }
  return true;
}
