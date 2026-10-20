/**
 * Person 360 (slice 3.6): what each church-wide office may read and write about a person.
 * Church Leader reads and writes everything. Catechist records baptism. Church Secretary records the
 * everyday facts (contact, work, education, callings, family). Marriage is the Church Leader's alone.
 * Presidents and other unit offices never reach Person 360: it is church-wide.
 */
import { liveHoldings, type AccessData } from '../capabilities/engine.js';
import { z } from 'zod';

export const SECTIONS = ['CONTACT', 'EMPLOYMENT', 'EDUCATION', 'CALLING', 'FAMILY', 'BAPTISM', 'MARRIAGE'] as const;
export type Section = (typeof SECTIONS)[number];
type Office = 'CHURCH_LEADER' | 'PASTOR' | 'CATECHIST' | 'CHURCH_SECRETARY';

const EVERYDAY: Section[] = ['CONTACT', 'EMPLOYMENT', 'EDUCATION', 'CALLING', 'FAMILY'];
const READERS: Record<Section, Office[]> = {
  ...(Object.fromEntries(SECTIONS.map((s) => [s, ['CHURCH_LEADER', 'PASTOR', 'CATECHIST', 'CHURCH_SECRETARY']])) as Record<Section, Office[]>),
  MARRIAGE: ['CHURCH_LEADER', 'PASTOR'],
};
const WRITERS: Record<Section, Office[]> = {
  ...(Object.fromEntries(EVERYDAY.map((s) => [s, ['CHURCH_LEADER', 'PASTOR', 'CHURCH_SECRETARY']])) as Record<Section, Office[]>),
  BAPTISM: ['CHURCH_LEADER', 'PASTOR', 'CATECHIST'],
  MARRIAGE: ['CHURCH_LEADER', 'PASTOR'],
};
/** Sections of which a person has one current record at a time. */
export const SINGLE: Section[] = ['BAPTISM', 'MARRIAGE'];

export interface Access { read: Section[]; write: Section[]; leader: boolean }

export function accessFor(me: string, data: AccessData, now = new Date()): Access {
  const held = liveHoldings(me, data, now).filter((h) => h.scope === 'CHURCH' && (h.letters.PERSON_360 as string[] | undefined)?.includes('R'));
  const offices = (write: boolean) =>
    new Set(held.filter((h) => !write || (h.letters.PERSON_360 as string[]).includes('W')).map((h) => h.office as string));
  const r = offices(false), w = offices(true);
  return {
    read: SECTIONS.filter((s) => READERS[s].some((o) => r.has(o))),
    write: SECTIONS.filter((s) => WRITERS[s].some((o) => w.has(o))),
    leader: r.has('CHURCH_LEADER') || r.has('PASTOR'),
  };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()));
const year = z.number().int().min(1930).max(2100);
const txt = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

/** The kinds of work the church can filter on. */
export const SECTORS = ['FINANCE', 'EDUCATION', 'HEALTH', 'AGRICULTURE', 'TECHNOLOGY', 'BUSINESS', 'CONSTRUCTION', 'TRANSPORT', 'GOVERNMENT', 'CHURCH', 'OTHER'] as const;

const SHAPES = {
  CONTACT: z.object({ label: txt(60), value: txt(200) }),
  EMPLOYMENT: z.object({ status: z.enum(['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED', 'RETIRED']), sector: z.enum(SECTORS).optional(), employer: opt(120), business: opt(120), role: opt(120), school: opt(120), field: opt(120), since: day.optional() }),
  EDUCATION: z.object({
    level: z.enum(['NONE', 'PRIMARY', 'SECONDARY_O', 'SECONDARY_A', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER', 'SECONDARY', 'TVET', 'UNIVERSITY', 'POSTGRAD']),
    field: opt(120), school: opt(120), startYear: year.optional(), endYear: year.optional(), year: year.optional(),
  }).refine((v) => v.startYear === undefined || v.endYear === undefined || v.endYear >= v.startYear, { message: 'years' }),
  /** What the person does (singer, bassist, protocol, deacon, men leader…) and in which unit. */
  CALLING: z.object({ name: txt(80), orgUnitId: opt(80), since: day.optional(), note: opt(300) }),
  /** A child also carries a birth date and gender, so the church can count and care for them. */
  FAMILY: z.object({
    relation: z.enum(['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'OTHER']), relatedPersonId: opt(80), name: opt(120),
    dateOfBirth: day.optional(), gender: z.enum(['MALE', 'FEMALE']).optional(), note: opt(300),
  }).refine((v) => !!v.relatedPersonId || !!v.name, { message: 'who' }),
  BAPTISM: z.object({ date: day, place: opt(120), baptisedBy: opt(120) }),
  /** `endedOn` + `endedBy: 'DEATH'` marks the spouse's passing: the person is then widowed. */
  MARRIAGE: z.object({
    date: day, spousePersonId: opt(80), spouseName: opt(120), place: opt(120), blessedBy: opt(120), certificateRef: opt(80),
    endedOn: day.optional(), endedBy: z.enum(['DEATH']).optional(),
  }).refine((v) => (v.endedBy === undefined) === (v.endedOn === undefined) && (v.endedOn === undefined || v.endedOn >= v.date), { message: 'ended' }),
} as const;

/** Which fields still mean something for the chosen level or situation; the rest are dropped. */
const KEEP: Partial<Record<Section, { by: string; fields: Record<string, string[]>; fallback: string[] }>> = {
  EDUCATION: {
    by: 'level',
    fields: { NONE: [], PRIMARY: ['school'], SECONDARY_O: ['school'] },
    fallback: ['field', 'school', 'startYear', 'endYear', 'year'],
  },
  EMPLOYMENT: {
    by: 'status',
    fields: { EMPLOYED: ['sector', 'employer', 'role', 'since'], SELF_EMPLOYED: ['sector', 'business', 'since'], STUDENT: ['school', 'field', 'since'], UNEMPLOYED: ['since'], RETIRED: ['sector', 'role', 'since'] },
    fallback: [],
  },
};

/** The cleaned fields for a section, or null when they do not fit. Unknown fields are dropped. */
export function cleanData(section: Section, input: unknown): Record<string, string | number> | null {
  const r = SHAPES[section].safeParse(input);
  if (!r.success) return null;
  const out: Record<string, string | number> = {};
  const rule = KEEP[section];
  const keep = rule ? ((rule.fields[String((r.data as Record<string, unknown>)[rule.by])] ?? rule.fallback) as string[]).concat(rule.by) : null;
  for (const [k, v] of Object.entries(r.data as Record<string, unknown>)) if (v !== undefined && v !== '' && (!keep || keep.includes(k))) out[k] = v as string | number;
  return out;
}

export const isSection = (s: unknown): s is Section => typeof s === 'string' && (SECTIONS as readonly string[]).includes(s);
