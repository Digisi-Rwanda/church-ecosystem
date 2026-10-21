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
  /** Name and birth date of a person who may be named in a family record (used only to count children once). */
  person(id: string): { fullName: string; dateOfBirth: string | null } | undefined;
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
 * How many different children are recorded. A child written down by name and also linked to their own member
 * record counts once; so does the same name and birth date written twice. Two records that share a name but
 * carry different birth dates are two children. A child recorded with a name only is taken to be the linked
 * child of that name, if there is one. Only persons the viewer's scope lets us read can lend their name to this
 * matching; the count itself is all that ever leaves.
 */
export function childCount(row: PersonRow, ctx: PeopleCtx): number {
  const clusters: Array<Set<string>> = [];
  for (const d of row.rec('FAMILY')) {
    if (d.relation !== 'CHILD') continue;
    const keys: string[] = [];
    const linked = typeof d.relatedPersonId === 'string' && d.relatedPersonId ? d.relatedPersonId : null;
    if (linked) {
      keys.push(`id:${linked}`);
      const p = ctx.person(linked);
      if (p) { keys.push(`nm:${norm(p.fullName)}|${dayOf(p.dateOfBirth) ?? ''}`, `nmo:${norm(p.fullName)}`); }
      else if (d.name) keys.push(`nm:${norm(d.name)}|${dayOf(d.dateOfBirth) ?? ''}`);
    } else if (d.name) {
      const dob = dayOf(d.dateOfBirth);
      keys.push(dob ? `nm:${norm(d.name)}|${dob}` : `nmo:${norm(d.name)}`);
    } else continue;
    const hit = clusters.filter((c) => keys.some((k) => c.has(k)));
    const merged = new Set<string>(keys);
    for (const c of hit) { for (const k of c) merged.add(k); clusters.splice(clusters.indexOf(c), 1); }
    clusters.push(merged);
  }
  return clusters.length;
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
/**
 * Years in the current work: whole years since the work began, over the person's current employed or
 * self-employed records (the longest running if there are two). Study, unemployment and retirement have none,
 * and a start date in the future does not count.
 */
export function workYears(r: PersonRow, today: string): number | null {
  let best: number | null = null;
  for (const d of r.rec('EMPLOYMENT')) {
    if (d.status !== 'EMPLOYED' && d.status !== 'SELF_EMPLOYED') continue;
    const y = yearsBetween(typeof d.since === 'string' ? d.since : null, today);
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}
const ageOf = (r: PersonRow, today: string) => yearsBetween(r.dateOfBirth, today);
const levelsOf = (r: PersonRow) => r.rec('EDUCATION').map((d) => LEVEL_ALIAS[String(d.level)] ?? String(d.level)).filter(Boolean);

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
  def('EMPLOYMENT', { key: 'employmentStatus', type: 'choice', choices: EMPLOYMENT, read: (r) => r.rec('EMPLOYMENT').map((d) => d.status) }),
  def('EMPLOYMENT', { key: 'employmentSector', type: 'choice', choices: SECTORS, read: (r) => r.rec('EMPLOYMENT').map((d) => d.sector) }),
  def('EMPLOYMENT', { key: 'employmentField', type: 'text', read: (r) => r.rec('EMPLOYMENT').map((d) => d.field) }),
  def('EMPLOYMENT', { key: 'employedYears', type: 'number', min: 0, max: 80, read: (r, c) => workYears(r, c.today) }),
  def('EDUCATION', { key: 'educationLevel', type: 'ordinal', choices: EDU_LEVELS, rank: EDU_RANK, read: (r) => levelsOf(r) }),
  def('EDUCATION', { key: 'educationField', type: 'text', read: (r) => r.rec('EDUCATION').map((d) => d.field) }),
  def('FAMILY', { key: 'childCount', type: 'number', min: 0, max: 30, read: (r, c) => childCount(r, c) }),
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
