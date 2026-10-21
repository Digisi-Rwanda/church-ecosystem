/**
 * The People field registry: every criterion a viewer can filter or sort people by, with the type, operators,
 * the permission it needs and how its value is read from one person's facts. Nothing is offered just because
 * the data exists: each field names the access it needs, and the same access rules that open a Person 360
 * section (or the identity details) decide whether a viewer may use it.
 */
import { z } from 'zod';
import { SECTORS, type Section } from '../person360/rules.js';
import { dayOf, yearsBetween } from '../filters/dates.js';
import type { FieldDef } from '../filters/types.js';

/** What a field needs: nothing, the identity details (Church Leader and Pastor), or the right to read one Person 360 section. */
export type Need = 'OPEN' | 'IDENTITY' | Section;
export interface PeopleViewer { identity: boolean; read: Section[] }
export const mayUseNeed = (need: Need, v: PeopleViewer): boolean => need === 'OPEN' || (need === 'IDENTITY' ? v.identity : v.read.includes(need));

export const EDU_LEVELS = ['NONE', 'PRIMARY', 'SECONDARY_O', 'SECONDARY_A', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER'] as const;
/** Older records may still carry the previous level names; they count as the level they were replaced by. */
const LEVEL_ALIAS: Record<string, string> = { SECONDARY: 'SECONDARY_A', TVET: 'ASSOCIATE', UNIVERSITY: 'BACHELOR', POSTGRAD: 'MASTER' };
export const EDU_RANK: Record<string, number> = { NONE: 0, PRIMARY: 1, SECONDARY_O: 2, SECONDARY_A: 3, ASSOCIATE: 4, BACHELOR: 5, MASTER: 6, DOCTORATE: 7 };
export const MARITAL = ['SINGLE', 'MARRIED', 'WIDOWED'] as const;
export type Marital = (typeof MARITAL)[number];
export const STATUSES = ['ACTIVE', 'INACTIVE', 'VISITOR'] as const;
export const EMPLOYMENT = ['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED', 'RETIRED'] as const;

type Data = Record<string, unknown>;
/** One person as the filters see them: the person row and their current records, parsed only when a field reads them. */
export interface PersonRow {
  id: string; fullName: string; memberCode: string | null; status: string;
  gender: string | null; dateOfBirth: string | null;
  /** Organisation units the person is a live member of. */
  unitIds: string[];
  rec(section: Section): Data[];
}
export interface PeopleCtx {
  /** Today in Kigali, YYYY-MM-DD. */
  today: string;
  /** A unit and every unit below it. */
  below(unitId: string): Set<string>;
}

type Base = Omit<PersonRow, 'rec'>;
const parse = (json: string): Data => { try { const v = JSON.parse(json); return v && typeof v === 'object' ? (v as Data) : {}; } catch { return {}; } };
/** A row whose records are still JSON text (as stored); they are parsed the first time a field needs that section. */
export function rowFromJson(base: Base, json: Partial<Record<Section, string[]>>): PersonRow {
  const cache = new Map<Section, Data[]>();
  return { ...base, rec: (s) => cache.get(s) ?? (cache.set(s, (json[s] ?? []).map(parse)), cache.get(s)!) };
}
/** A row from already parsed records (tests and benchmarks). */
export function rowFromData(base: Base, records: Array<{ section: Section; data: Data }> = []): PersonRow {
  return { ...base, rec: (s) => records.filter((r) => r.section === s).map((r) => r.data) };
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * How many different children are recorded, using only what the family records themselves say (nothing is read
 * from the linked person, so a person the viewer cannot see can never change a count or be probed through it):
 *  - records linked to the same member count once;
 *  - records without a link count once per full identity, which is name AND birth date together (case, spacing
 *    and accents ignored): the same name and birth date written twice is one child, two birth dates are two children;
 *  - an unlinked record also counts as the linked child when its name and birth date equal the ones written on that
 *    linked record, unless two different members carry that same name and birth date (conflicting identifiers:
 *    nothing is merged);
 *  - a record with only a name, or a name and no birth date, is never merged on a name alone: weak evidence is not
 *    identity, so it counts by itself. A child entered once by link and once by bare name therefore counts twice
 *    until a birth date or the link is added.
 * The result does not depend on the order of the records.
 */
export function childCount(row: PersonRow): number {
  const linked = new Set<string>();
  const idsOfKey = new Map<string, Set<string>>();
  const unlinkedKeys = new Set<string>();
  let anonymous = 0;
  for (const d of row.rec('FAMILY')) {
    if (d.relation !== 'CHILD') continue;
    const id = typeof d.relatedPersonId === 'string' && d.relatedPersonId ? d.relatedPersonId : null;
    const dob = dayOf(d.dateOfBirth);
    const name = norm(d.name);
    const key = name && dob ? `${name}|${dob}` : null;
    if (id) {
      linked.add(id);
      if (key) idsOfKey.set(key, (idsOfKey.get(key) ?? new Set<string>()).add(id));
    } else if (key) {
      unlinkedKeys.add(key);
    } else if (name) anonymous++;
  }
  let extra = 0;
  for (const key of unlinkedKeys) {
    const ids = idsOfKey.get(key);
    // Folded into the linked child only when exactly one member carries this name and birth date.
    if (!ids || ids.size !== 1) extra++;
  }
  return linked.size + extra + anonymous;
}

/** Married, widowed (the spouse passed away) or single (no marriage recorded). */
export function maritalOf(row: PersonRow): Marital {
  const m = row.rec('MARRIAGE')[0];
  if (!m) return 'SINGLE';
  return m.endedBy === 'DEATH' ? 'WIDOWED' : 'MARRIED';
}

/** Baptised means a baptism date that has already happened; the date field itself shows the date as recorded, even a planned one. */
const baptismDay = (r: PersonRow, today: string): string | null => {
  const d = dayOf(r.rec('BAPTISM')[0]?.date);
  return d && d <= today ? d : null;
};
const employmentValue = z.object({
  status: z.array(z.enum(EMPLOYMENT)).min(1).max(EMPLOYMENT.length).optional(),
  sector: z.array(z.enum(SECTORS)).min(1).max(SECTORS.length).optional(),
  field: z.string().trim().min(1).max(80).optional(),
  yearsAtLeast: z.number().int().min(0).max(80).optional(),
}).strict().refine((v) => Object.keys(v).length > 0);
type EmploymentValue = z.infer<typeof employmentValue>;
const educationValue = z.object({
  levelAtLeast: z.enum(Object.keys(EDU_RANK) as [string, ...string[]]).optional(),
  levelIn: z.array(z.enum(EDU_LEVELS)).min(1).max(EDU_LEVELS.length).optional(),
  field: z.string().trim().min(1).max(80).optional(),
}).strict().refine((v) => Object.keys(v).length > 0);
type EducationValue = z.infer<typeof educationValue>;

const ageOf = (r: PersonRow, today: string) => yearsBetween(r.dateOfBirth, today);

const callingValue = z.object({ name: z.string().trim().min(1).max(80).optional(), unitId: z.string().min(1).max(80).optional() }).strict()
  .refine((v) => v.name !== undefined || v.unitId !== undefined);
type CallingValue = z.infer<typeof callingValue>;

type F = FieldDef<PersonRow, PeopleCtx, PeopleViewer>;
const def = (need: Need, f: Omit<F, 'allowed'>): F & { need: Need } => ({ ...f, need, allowed: (v) => mayUseNeed(need, v) });

export const PEOPLE_FIELDS = [
  def('OPEN', { key: 'name', type: 'text', read: (r) => r.fullName, sortKey: (r) => r.fullName.toLowerCase(), baseOrder: true }),
  def('OPEN', { key: 'memberCode', type: 'text', read: (r) => r.memberCode, sortKey: (r) => r.memberCode?.toLowerCase() ?? null }),
  def('OPEN', { key: 'status', type: 'choice', choices: STATUSES, read: (r) => r.status, sortKey: (r) => r.status }),
  def('OPEN', {
    key: 'unit', type: 'multi', read: (r) => r.unitIds,
    expand: (v, c) => c.below(v), unitRefs: (v: string[]) => v,
  }),
  def('IDENTITY', { key: 'gender', type: 'choice', choices: ['MALE', 'FEMALE'], read: (r) => r.gender }),
  def('IDENTITY', { key: 'age', type: 'number', min: 0, max: 120, read: (r, c) => ageOf(r, c.today), sortKey: (r, c) => ageOf(r, c.today) }),
  def('BAPTISM', { key: 'baptised', type: 'boolean', read: (r, c) => baptismDay(r, c.today) !== null }),
  def('BAPTISM', { key: 'baptismDate', type: 'date', read: (r) => dayOf(r.rec('BAPTISM')[0]?.date), sortKey: (r) => dayOf(r.rec('BAPTISM')[0]?.date) }),
  def('BAPTISM', { key: 'baptismYears', type: 'number', min: 0, max: 100, read: (r, c) => yearsBetween(baptismDay(r, c.today), c.today) }),
  def('EMPLOYMENT', {
    key: 'employment', type: 'records', valueSchema: employmentValue,
    valueParts: [
      { key: 'status', kind: 'choices', choices: EMPLOYMENT }, { key: 'sector', kind: 'choices', choices: SECTORS },
      { key: 'field', kind: 'text' }, { key: 'yearsAtLeast', kind: 'number', min: 0, max: 80 },
    ],
    read: (r) => r.rec('EMPLOYMENT'),
    // Every part is tested on the SAME work record: Finance for 5+ years means a Finance job of 5+ years.
    itemMatches: (raw: unknown, value: never, c: PeopleCtx) => {
      const item = raw as Data, v = value as EmploymentValue;
      if (v.status && !v.status.includes(String(item.status) as never)) return false;
      if (v.sector && !v.sector.includes(String(item.sector) as never)) return false;
      if (v.field !== undefined && !String(item.field ?? '').toLowerCase().includes(v.field.toLowerCase())) return false;
      if (v.yearsAtLeast !== undefined) {
        const y = item.status === 'EMPLOYED' || item.status === 'SELF_EMPLOYED' ? yearsBetween(typeof item.since === 'string' ? item.since : null, c.today) : null;
        if (y === null || y < v.yearsAtLeast) return false;
      }
      return true;
    },
  }),
  def('EDUCATION', {
    key: 'education', type: 'records', valueSchema: educationValue,
    valueParts: [
      { key: 'levelAtLeast', kind: 'choice', choices: Object.keys(EDU_RANK) }, { key: 'levelIn', kind: 'choices', choices: EDU_LEVELS },
      { key: 'field', kind: 'text' },
    ],
    read: (r) => r.rec('EDUCATION'),
    // Level and field are tested on the SAME education record: a bachelor in Law is a record that is both.
    itemMatches: (raw: unknown, value: never) => {
      const item = raw as Data, v = value as EducationValue;
      const level = LEVEL_ALIAS[String(item.level)] ?? String(item.level);
      if (v.levelAtLeast !== undefined && !(EDU_RANK[level] !== undefined && EDU_RANK[level]! >= EDU_RANK[v.levelAtLeast]!)) return false;
      if (v.levelIn && !v.levelIn.includes(level as never)) return false;
      if (v.field !== undefined && !String(item.field ?? '').toLowerCase().includes(v.field.toLowerCase())) return false;
      return true;
    },
  }),
  def('FAMILY', { key: 'childCount', type: 'number', min: 0, max: 30, read: (r) => childCount(r) }),
  def('FAMILY', { key: 'hasSpouseRecorded', type: 'boolean', read: (r) => r.rec('FAMILY').some((d) => d.relation === 'SPOUSE') }),
  def('MARRIAGE', { key: 'marital', type: 'choice', choices: MARITAL, read: (r) => maritalOf(r) }),
  def('CALLING', {
    key: 'calling', type: 'records', valueSchema: callingValue,
    valueParts: [{ key: 'name', kind: 'text' }, { key: 'unitId', kind: 'unit' }],
    read: (r) => r.rec('CALLING'),
    // A calling's role and unit are tested on the same calling: both must hold for one record.
    itemMatches: (raw: unknown, value: never, c: PeopleCtx) => {
      const item = raw as Data, v = value as CallingValue;
      return (v.name === undefined || String(item.name ?? '').toLowerCase().includes(v.name.toLowerCase())) &&
        (v.unitId === undefined || (typeof item.orgUnitId === 'string' && c.below(v.unitId).has(item.orgUnitId)));
    },
    unitRefs: (v: CallingValue) => (v.unitId ? [v.unitId] : []),
  }),
] as unknown as Array<F & { need: Need }>;

/** The access each field needs, by field key (the old request shape maps its criteria onto these). */
export const NEED_OF: Record<string, Need> = Object.fromEntries(PEOPLE_FIELDS.map((f) => [f.key, f.need]));
