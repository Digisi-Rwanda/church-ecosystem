import type { P360Record, P360Section } from '../api/frontDoorApi';

export type FieldType = 'text' | 'date' | 'number' | 'select' | 'person';
export type FieldDef = { key: string; type: FieldType; options?: string[]; required?: boolean; max?: number };

/** What each section asks for. The server checks the same shapes again. */
export const FIELDS: Record<P360Section, FieldDef[]> = {
  CONTACT: [{ key: 'label', type: 'text', required: true, max: 60 }, { key: 'value', type: 'text', required: true, max: 200 }],
  EMPLOYMENT: [
    { key: 'status', type: 'select', required: true, options: ['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED', 'RETIRED'] },
    { key: 'employer', type: 'text', max: 120 }, { key: 'role', type: 'text', max: 120 }, { key: 'since', type: 'date' },
  ],
  EDUCATION: [
    { key: 'level', type: 'select', required: true, options: ['PRIMARY', 'SECONDARY', 'TVET', 'UNIVERSITY', 'POSTGRAD', 'OTHER'] },
    { key: 'field', type: 'text', max: 120 }, { key: 'school', type: 'text', max: 120 }, { key: 'year', type: 'number' },
  ],
  GIFT: [{ key: 'name', type: 'text', required: true, max: 80 }, { key: 'note', type: 'text', max: 300 }],
  SKILL: [{ key: 'name', type: 'text', required: true, max: 80 }, { key: 'level', type: 'select', options: ['BASIC', 'GOOD', 'EXPERT'] }],
  CALLING: [{ key: 'name', type: 'text', required: true, max: 80 }, { key: 'note', type: 'text', max: 300 }],
  FAMILY: [
    { key: 'relation', type: 'select', required: true, options: ['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'OTHER'] },
    { key: 'relatedPersonId', type: 'person' }, { key: 'name', type: 'text', max: 120 },
  ],
  BAPTISM: [{ key: 'date', type: 'date', required: true }, { key: 'place', type: 'text', max: 120 }, { key: 'baptisedBy', type: 'text', max: 120 }],
  MARRIAGE: [
    { key: 'date', type: 'date', required: true }, { key: 'spousePersonId', type: 'person' }, { key: 'spouseName', type: 'text', max: 120 },
    { key: 'place', type: 'text', max: 120 }, { key: 'blessedBy', type: 'text', max: 120 }, { key: 'certificateRef', type: 'text', max: 80 },
  ],
};

export const SECTION_ORDER: P360Section[] = ['CONTACT', 'EMPLOYMENT', 'EDUCATION', 'GIFT', 'SKILL', 'CALLING', 'FAMILY', 'BAPTISM', 'MARRIAGE'];
export const SINGLE_SECTIONS: P360Section[] = ['BAPTISM', 'MARRIAGE'];
export const sectionKey = (s: P360Section) => `door.p360.section.${s}` as const;
export const fieldKey = (k: string) => `door.p360.f.${k}` as const;
export const valueKey = (v: string) => `door.p360.v.${v}` as const;

/** The fields a form still needs before it can be sent, as the cleaned data to send (or null). */
export function formData(section: P360Section, values: Record<string, string>): Record<string, string | number> | null {
  const out: Record<string, string | number> = {};
  for (const f of FIELDS[section]) {
    const v = (values[f.key] ?? '').trim();
    if (!v) {
      if (f.required) return null;
      continue;
    }
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isInteger(n)) return null;
      out[f.key] = n;
    } else out[f.key] = v;
  }
  if (section === 'FAMILY' && !out.relatedPersonId && !out.name) return null;
  return out;
}

export function groupBySection(records: P360Record[]): Array<{ section: P360Section; items: P360Record[] }> {
  return SECTION_ORDER.map((section) => ({ section, items: records.filter((r) => r.section === section) })).filter((g) => g.items.length > 0);
}

const ERROR_KEYS: Record<string, string> = {
  BAD_INPUT: 'door.p360.err.input',
  ALREADY_EXISTS: 'door.p360.err.exists',
  WRONG_STATE: 'door.p360.err.wrongState',
  REASON_REQUIRED: 'door.money.err.reason',
  PERSON_NOT_FOUND: 'door.gov.err.personNotFound',
  PERSON_ARCHIVED: 'door.p360.err.archived',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
};
export const p360ErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';
