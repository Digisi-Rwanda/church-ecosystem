import type { SettingKey, SettingRow, TypeItem } from '../api/frontDoorApi';

export const SETTING_ORDER: SettingKey[] = [
  'church.profile',
  'church.language',
  'letters.types',
  'meetings.types',
  'access.termReminderDays',
  'access.delegationMaxDays',
];

export const RANGES = {
  'access.termReminderDays': { min: 14, max: 180 },
  'access.delegationMaxDays': { min: 7, max: 180 },
} as const;

export const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,23}$/;
export const LIST_MAX = 30;

/** The six rows in the order the screen shows them, whatever order the server answered in. */
export const orderSettings = (rows: SettingRow[]): SettingRow[] =>
  [...rows].sort((a, b) => SETTING_ORDER.indexOf(a.key) - SETTING_ORDER.indexOf(b.key));

/** Why a type list cannot be saved yet, or null. The server checks again; this only saves a round trip. */
export function typeListProblem(rows: TypeItem[]): 'empty' | 'tooMany' | 'code' | 'name' | 'duplicate' | null {
  if (rows.length === 0) return 'empty';
  if (rows.length > LIST_MAX) return 'tooMany';
  const seen = new Set<string>();
  for (const r of rows) {
    const code = r.code.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) return 'code';
    if (r.name.trim().length < 2) return 'name';
    if (seen.has(code)) return 'duplicate';
    seen.add(code);
  }
  return null;
}

/** The list as it will be sent: trimmed, codes in capitals. */
export const cleanTypeList = (rows: TypeItem[]): TypeItem[] => rows.map((r) => ({ code: r.code.trim().toUpperCase(), name: r.name.trim() }));

/** A code suggested from a name ("Prayer vigil" becomes PRAYER_VIGIL), for the add-a-row shortcut. */
export function suggestCode(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return /^[A-Z]/.test(base) ? base : '';
}

/** Whole days within the setting's range, or null. */
export function daysProblem(key: 'access.termReminderDays' | 'access.delegationMaxDays', raw: string): number | null {
  const n = Number(raw);
  const r = RANGES[key];
  return raw.trim() !== '' && Number.isInteger(n) && n >= r.min && n <= r.max ? n : null;
}

export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
