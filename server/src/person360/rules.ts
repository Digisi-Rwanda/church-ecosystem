/**
 * Person 360 (slice 3.6): what each church-wide office may read and write about a person.
 * Church Leader reads and writes everything. Catechist records baptism. Church Secretary records the
 * everyday facts (contact, work, education, gifts, family). Marriage is the Church Leader's alone.
 * Presidents and other unit offices never reach Person 360: it is church-wide.
 */
import { liveHoldings, type AccessData } from '../capabilities/engine.js';
import { z } from 'zod';

export const SECTIONS = ['CONTACT', 'EMPLOYMENT', 'EDUCATION', 'GIFT', 'SKILL', 'CALLING', 'FAMILY', 'BAPTISM', 'MARRIAGE'] as const;
export type Section = (typeof SECTIONS)[number];
type Office = 'CHURCH_LEADER' | 'PASTOR' | 'CATECHIST' | 'CHURCH_SECRETARY';

const EVERYDAY: Section[] = ['CONTACT', 'EMPLOYMENT', 'EDUCATION', 'GIFT', 'SKILL', 'CALLING', 'FAMILY'];
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
const txt = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

const SHAPES = {
  CONTACT: z.object({ label: txt(60), value: txt(200) }),
  EMPLOYMENT: z.object({ status: z.enum(['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED', 'RETIRED']), employer: opt(120), role: opt(120), since: day.optional() }),
  EDUCATION: z.object({ level: z.enum(['PRIMARY', 'SECONDARY', 'TVET', 'UNIVERSITY', 'POSTGRAD', 'OTHER']), field: opt(120), school: opt(120), year: z.number().int().min(1930).max(2100).optional() }),
  GIFT: z.object({ name: txt(80), note: opt(300) }),
  SKILL: z.object({ name: txt(80), level: z.enum(['BASIC', 'GOOD', 'EXPERT']).optional() }),
  CALLING: z.object({ name: txt(80), note: opt(300) }),
  FAMILY: z.object({ relation: z.enum(['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'OTHER']), relatedPersonId: opt(80), name: opt(120) }).refine((v) => !!v.relatedPersonId || !!v.name, { message: 'who' }),
  BAPTISM: z.object({ date: day, place: opt(120), baptisedBy: opt(120) }),
  MARRIAGE: z.object({ date: day, spousePersonId: opt(80), spouseName: opt(120), place: opt(120), blessedBy: opt(120), certificateRef: opt(80) }),
} as const;

/** The cleaned fields for a section, or null when they do not fit. Unknown fields are dropped. */
export function cleanData(section: Section, input: unknown): Record<string, string | number> | null {
  const r = SHAPES[section].safeParse(input);
  if (!r.success) return null;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r.data as Record<string, unknown>)) if (v !== undefined && v !== '') out[k] = v as string | number;
  return out;
}

export const isSection = (s: unknown): s is Section => typeof s === 'string' && (SECTIONS as readonly string[]).includes(s);
