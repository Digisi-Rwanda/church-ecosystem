import type { DirectoryPerson } from '../api/frontDoorApi';

/** Read CSV text (commas or semicolons, quoted cells, blank lines ignored) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** The columns the import understands, with the headings people tend to use for them. */
export const IMPORT_FIELDS = ['fullName', 'phone', 'email', 'dateOfBirth', 'gender', 'status', 'joinedChurchOn', 'address'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
const ALIASES: Record<ImportField, string[]> = {
  fullName: ['fullname', 'name', 'names', 'izina', 'nom', 'full name'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'telefoni', 'téléphone'],
  email: ['email', 'e-mail', 'mail'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate', 'birth date', 'date of birth', 'birthday', 'itariki y amavuko'],
  gender: ['gender', 'sex', 'igitsina', 'sexe'],
  status: ['status', 'statut'],
  joinedChurchOn: ['joinedchurchon', 'joined', 'joined on', 'date joined', 'membership date'],
  address: ['address', 'adresse', 'aderesi'],
};

export type Mapped = { rows: Array<Record<string, string>>; unknown: string[]; hasName: boolean };

/** Turn the cells under their headings into rows the server understands. Unknown headings are reported, not guessed. */
export function mapImport(cells: string[][]): Mapped {
  const [head = [], ...body] = cells;
  const norm = (h: string) => h.normalize('NFC').trim().toLowerCase();
  const field = (h: string): ImportField | null => IMPORT_FIELDS.find((f) => norm(h) === f.toLowerCase() || ALIASES[f].includes(norm(h))) ?? null;
  const cols = head.map(field);
  const unknown = head.filter((_, i) => !cols[i] && head[i].trim() !== '');
  const rows = body.map((r) => {
    const o: Record<string, string> = {};
    cols.forEach((f, i) => {
      if (f && (r[i] ?? '') !== '') o[f] = f === 'gender' ? genderOf(r[i]) : f === 'status' ? r[i].toUpperCase() : r[i];
    });
    return o;
  });
  return { rows, unknown, hasName: cols.includes('fullName') };
}

const genderOf = (v: string): string => {
  const x = v.trim().toLowerCase();
  if (['m', 'male', 'gabo', 'homme'].includes(x)) return 'MALE';
  if (['f', 'female', 'gore', 'femme'].includes(x)) return 'FEMALE';
  return v.toUpperCase();
};

const cell = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r;]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};

/** The listed people as a spreadsheet file (CSV). Only what the directory already shows. */
export function peopleToCsv(list: DirectoryPerson[], head: string[]): string {
  return [head, ...list.map((p) => [p.memberCode, p.fullName, p.status, p.phone, p.email])].map((r) => r.map(cell).join(',')).join('\r\n');
}

/* Saved views: a name and a search, kept only in this browser. */
export type SavedView = { name: string; q: string; status: string; archived: boolean };
const KEY = 'moriah.people.views';
export function loadViews(): SavedView[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}
export function storeViews(v: SavedView[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v.slice(0, 12)));
  } catch {
    /* private window: the views just last for this visit */
  }
}

/** "Oct 12": a day shown without the year, from YYYY-MM-DD. */
export const shortDay = (day: string, locale: string): string => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

export type TimelineEvent = { day: string; kind: 'JOINED' | 'MEMBER' | 'OFFICE' | 'BAPTISM' | 'MARRIAGE'; name: string };

/** Everything that happened to a person, newest first, from the facts the page already has. */
export function timelineOf(input: {
  joinedChurchOn?: string | null;
  memberships: Array<{ label: string; unit?: { name: string } | null; since: string }>;
  offices: Array<{ title: string; officeName?: string; unit?: { name: string } | null; since: string }>;
  records?: Array<{ section: string; day: string | null }>;
}): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const ok = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d);
  if (ok(input.joinedChurchOn)) out.push({ day: input.joinedChurchOn.slice(0, 10), kind: 'JOINED', name: '' });
  for (const m of input.memberships) if (ok(m.since)) out.push({ day: m.since.slice(0, 10), kind: 'MEMBER', name: m.unit?.name ?? m.label });
  for (const o of input.offices) if (ok(o.since)) out.push({ day: o.since.slice(0, 10), kind: 'OFFICE', name: `${o.officeName ?? o.title}${o.unit ? ` · ${o.unit.name}` : ''}` });
  for (const r of input.records ?? []) if ((r.section === 'BAPTISM' || r.section === 'MARRIAGE') && ok(r.day)) out.push({ day: r.day.slice(0, 10), kind: r.section, name: '' });
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
