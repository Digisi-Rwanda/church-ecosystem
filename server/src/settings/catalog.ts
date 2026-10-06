/**
 * Central Administration's six settings (slice 2.1): what each one is, its default, and
 * how a new value is checked. Pure, so the rules are tested without a database.
 *
 * Only the Church Leader, the Catechist and the Church Secretary change them.
 */
import { z } from 'zod';

export const SETTING_KEYS = [
  'church.profile',
  'church.language',
  'letters.types',
  'meetings.types',
  'access.termReminderDays',
  'access.delegationMaxDays',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const isSettingKey = (v: string): v is SettingKey => (SETTING_KEYS as readonly string[]).includes(v);

export interface TypeItem {
  code: string;
  name: string;
}
export interface ChurchProfile {
  name: string;
  shortName: string;
  address: string;
  phone: string;
  email: string;
}

export interface SettingValues {
  'church.profile': ChurchProfile;
  'church.language': 'en' | 'rw' | 'fr';
  'letters.types': TypeItem[];
  'meetings.types': TypeItem[];
  'access.termReminderDays': number;
  'access.delegationMaxDays': number;
}

/** The six letter types a church starts with; the Letters desk (2.3) offers these. */
export const DEFAULT_LETTER_TYPES: TypeItem[] = [
  { code: 'INVITATION', name: 'Invitation' },
  { code: 'RECOMMENDATION', name: 'Recommendation' },
  { code: 'INTRODUCTION', name: 'Introduction' },
  { code: 'TRANSFER', name: 'Transfer' },
  { code: 'REQUEST', name: 'Request' },
  { code: 'THANKS', name: 'Thank-you' },
];

/** The kinds of meeting Governance (2.2) offers; the Board is one of them. */
export const DEFAULT_MEETING_TYPES: TypeItem[] = [
  { code: 'BOARD', name: 'Board meeting' },
  { code: 'COMMITTEE', name: 'Committee meeting' },
  { code: 'ASSEMBLY', name: 'General assembly' },
  { code: 'UNIT', name: 'Unit meeting' },
  { code: 'PLANNING', name: 'Planning meeting' },
];

export const DEFAULTS: SettingValues = {
  'church.profile': { name: 'ADEPR Kacyiru', shortName: 'Kacyiru', address: '', phone: '', email: '' },
  'church.language': 'en',
  'letters.types': DEFAULT_LETTER_TYPES,
  'meetings.types': DEFAULT_MEETING_TYPES,
  'access.termReminderDays': 60,
  'access.delegationMaxDays': 90,
};

export const LIST_MAX = 30;
export const TERM_REMINDER_RANGE = { min: 14, max: 180 } as const;
export const DELEGATION_RANGE = { min: 7, max: 180 } as const;

const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
const typeList = z
  .array(
    z.object({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z][A-Z0-9_]{1,23}$/, 'Codes use capital letters, digits and _, from 2 to 24 characters'),
      name: text(60, 2),
    }),
  )
  .min(1, 'Keep at least one')
  .max(LIST_MAX, `At most ${LIST_MAX}`)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((it, i) => {
      if (seen.has(it.code)) ctx.addIssue({ code: 'custom', message: `Two entries share the code ${it.code}`, path: [i, 'code'] });
      seen.add(it.code);
    });
  });

const SCHEMAS: Record<SettingKey, z.ZodType> = {
  'church.profile': z.object({
    name: text(120, 2),
    shortName: text(40, 2),
    address: text(300),
    phone: text(40),
    email: z.union([z.literal(''), z.string().trim().email().max(120)]),
  }),
  'church.language': z.enum(['en', 'rw', 'fr']),
  'letters.types': typeList,
  'meetings.types': typeList,
  'access.termReminderDays': z.number().int().min(TERM_REMINDER_RANGE.min).max(TERM_REMINDER_RANGE.max),
  'access.delegationMaxDays': z.number().int().min(DELEGATION_RANGE.min).max(DELEGATION_RANGE.max),
};

export type Checked<K extends SettingKey> = { ok: true; value: SettingValues[K] } | { ok: false; message: string };

/** Check a new value for one setting; the message names the first thing wrong. */
export function check<K extends SettingKey>(key: K, value: unknown): Checked<K> {
  const r = SCHEMAS[key].safeParse(value);
  if (r.success) return { ok: true, value: r.data as SettingValues[K] };
  const first = r.error.issues[0];
  return { ok: false, message: first?.message || 'That value is not allowed' };
}

/** Stored rows laid over the defaults. A stored value that no longer passes is ignored, never trusted. */
export function resolve(rows: Array<{ key: string; valueJson: string }>): SettingValues {
  const out: SettingValues = structuredClone(DEFAULTS);
  for (const row of rows) {
    if (!isSettingKey(row.key)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.valueJson);
    } catch {
      continue;
    }
    const c = check(row.key, parsed);
    if (c.ok) (out as unknown as Record<string, unknown>)[row.key] = c.value;
  }
  return out;
}

/** Who may change settings: the three offices that run the church's administration. */
export const SETTINGS_EDITORS = ['CHURCH_LEADER', 'CATECHIST', 'CHURCH_SECRETARY'] as const;
