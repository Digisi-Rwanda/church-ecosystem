import type { P360Record, P360Section } from '../api/frontDoorApi';

export type FieldType = 'text' | 'date' | 'number' | 'select' | 'person' | 'unit';
export type FieldDef = { key: string; type: FieldType; options?: string[]; required?: boolean; max?: number };

const EDU_LEVELS = ['NONE', 'PRIMARY', 'SECONDARY_O', 'SECONDARY_A', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER'];
export const SECTORS = ['FINANCE', 'EDUCATION', 'HEALTH', 'AGRICULTURE', 'TECHNOLOGY', 'BUSINESS', 'CONSTRUCTION', 'TRANSPORT', 'GOVERNMENT', 'CHURCH', 'OTHER'];
const WORK_STATUS = ['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED', 'RETIRED'];

/** What each section asks for. The server checks the same shapes again. */
const BASE: Record<P360Section, FieldDef[]> = {
  CONTACT: [{ key: 'label', type: 'text', required: true, max: 60 }, { key: 'value', type: 'text', required: true, max: 200 }],
  EMPLOYMENT: [{ key: 'status', type: 'select', required: true, options: WORK_STATUS }],
  EDUCATION: [{ key: 'level', type: 'select', required: true, options: EDU_LEVELS }],
  /** What the person does (singer, bassist, protocol, deacon, men leader…) and in which unit. */
  CALLING: [{ key: 'name', type: 'text', required: true, max: 80 }, { key: 'orgUnitId', type: 'unit' }, { key: 'since', type: 'date' }, { key: 'note', type: 'text', max: 300 }],
  FAMILY: [
    { key: 'relation', type: 'select', required: true, options: ['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'OTHER'] },
    { key: 'relatedPersonId', type: 'person' }, { key: 'name', type: 'text', max: 120 },
  ],
  BAPTISM: [{ key: 'date', type: 'date', required: true }, { key: 'place', type: 'text', max: 120 }, { key: 'baptisedBy', type: 'text', max: 120 }],
  MARRIAGE: [
    { key: 'date', type: 'date', required: true }, { key: 'spousePersonId', type: 'person' }, { key: 'spouseName', type: 'text', max: 120 },
    { key: 'place', type: 'text', max: 120 }, { key: 'blessedBy', type: 'text', max: 120 }, { key: 'certificateRef', type: 'text', max: 80 },
    { key: 'endedBy', type: 'select', options: ['DEATH'] },
  ],
};
export const FIELDS = BASE;

const text = (key: string): FieldDef => ({ key, type: 'text', max: 120 });
const when = (key: string): FieldDef => ({ key, type: 'date' });
const yr = (key: string): FieldDef => ({ key, type: 'number' });
const sector: FieldDef = { key: 'sector', type: 'select', options: SECTORS };

/**
 * The fields to ask once the first answer is known: the education level decides about school, field and years,
 * the work situation decides about employer, business, role and dates. Nothing irrelevant is asked.
 */
export function fieldsFor(section: P360Section, values: Record<string, string>): FieldDef[] {
  const head = BASE[section];
  if (section === 'EDUCATION') {
    const level = values.level ?? '';
    if (!level || level === 'NONE') return head;
    if (level === 'PRIMARY' || level === 'SECONDARY_O') return [...head, text('school')];
    // Legacy levels written before the list was refined still open with all their fields.
    return [...head, text('field'), text('school'), yr('startYear'), yr('endYear')];
  }
  if (section === 'EMPLOYMENT') {
    switch (values.status ?? '') {
      case 'EMPLOYED': return [...head, sector, text('employer'), text('role'), when('since')];
      case 'SELF_EMPLOYED': return [...head, sector, text('business'), when('since')];
      case 'STUDENT': return [...head, text('school'), text('field'), when('since')];
      case 'UNEMPLOYED': return [...head, when('since')];
      case 'RETIRED': return [...head, sector, text('role'), when('since')];
      default: return head;
    }
  }
  if (section === 'FAMILY' && values.relation === 'CHILD') return [...head, when('dateOfBirth'), { key: 'gender', type: 'select', options: ['MALE', 'FEMALE'] }, { key: 'note', type: 'text', max: 300 }];
  // The spouse passing away is recorded on the marriage; the date of it is then needed.
  if (section === 'MARRIAGE' && values.endedBy) return [...head, { key: 'endedOn', type: 'date', required: true }];
  return head;
}

export const SECTION_ORDER: P360Section[] = ['CONTACT', 'EMPLOYMENT', 'EDUCATION', 'CALLING', 'FAMILY', 'BAPTISM', 'MARRIAGE'];
export const SINGLE_SECTIONS: P360Section[] = ['BAPTISM', 'MARRIAGE'];
export const sectionKey = (s: P360Section) => `door.p360.section.${s}` as const;
export const fieldKey = (k: string) => `door.p360.f.${k}` as const;
/** The label of a field; in work records a few labels follow the situation ("Retired since", "Former work"). */
export const labelKey = (section: P360Section, k: string, values: Record<string, unknown>): string =>
  section === 'EMPLOYMENT' && (k === 'since' || (k === 'role' && values.status === 'RETIRED')) && typeof values.status === 'string' ? `door.p360.f.${k}.${values.status}` : `door.p360.f.${k}`;
export const valueKey = (v: string) => `door.p360.v.${v}` as const;
/** The values a select field can hold (including older ones). Anything else, such as an employer called "BK", is shown as typed. */
const ENUM_VALUES = new Set<string>([
  ...Object.values(BASE).flatMap((fs) => fs.flatMap((f) => f.options ?? [])), ...SECTORS, ...EDU_LEVELS, ...WORK_STATUS,
  'SECONDARY', 'TVET', 'UNIVERSITY', 'POSTGRAD', 'MALE', 'FEMALE', 'DEATH',
]);
export const isEnumValue = (v: unknown): v is string => typeof v === 'string' && ENUM_VALUES.has(v);
/** A stored value in words: enumerated values are translated, free text stays as typed. */
export const valueText = (t: (k: never) => string, v: unknown): string => (isEnumValue(v) ? t(valueKey(v) as never) : String(v));

/** The fields a form still needs before it can be sent, as the cleaned data to send (or null). */
export function formData(section: P360Section, values: Record<string, string>): Record<string, string | number> | null {
  const out: Record<string, string | number> = {};
  for (const f of fieldsFor(section, values)) {
    const v = (values[f.key] ?? '').trim();
    if (!v) {
      if (f.required) return null;
      continue;
    }
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1930 || n > 2100) return null;
      out[f.key] = n;
    } else out[f.key] = v;
  }
  if (section === 'FAMILY' && !out.relatedPersonId && !out.name) return null;
  if (section === 'MARRIAGE' && out.endedOn && out.endedBy !== 'DEATH') return null;
  if (section === 'MARRIAGE' && typeof out.endedOn === 'string' && typeof out.date === 'string' && out.endedOn < out.date) return null;
  if (typeof out.startYear === 'number' && typeof out.endYear === 'number' && out.endYear < out.startYear) return null;
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
