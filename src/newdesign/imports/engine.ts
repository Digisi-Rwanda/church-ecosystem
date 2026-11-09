/**
 * The import engine: pure steps shared by every spreadsheet import. A file becomes records (columns matched by
 * name), each record is checked against what already exists, and the good ones are saved one by one through the
 * same calls the screens use, so every rule (who may write, limits, audit) applies exactly as for a typed entry.
 */
import { parseCsv } from '../peopleTools';

export { parseCsv };

export interface FieldDef {
  key: string;
  /** The column title written in the template. */
  header: string;
  /** Other titles people use for it (lower case; Kinyarwanda and French welcome). */
  aliases?: string[];
  required?: boolean;
  /** An example value for the template. */
  example?: string;
}

export type IssueCode = 'required' | 'badDate' | 'badNumber' | 'notFound' | 'ambiguous' | 'badChoice' | 'tooLong' | 'duplicate';
export interface Issue { code: IssueCode; field?: string; value?: string }

export const MAX_ROWS = 500;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface Mapping { columns: Array<string | null>; unknown: string[]; missing: string[] }

/** Match the file's column titles to the fields: by the template title or any alias, ignoring case and accents. */
export function mapHeaders(headers: string[], fields: FieldDef[]): Mapping {
  const byName = new Map<string, string>();
  for (const f of fields) {
    byName.set(norm(f.header), f.key);
    byName.set(norm(f.key), f.key);
    for (const a of f.aliases ?? []) byName.set(norm(a), f.key);
  }
  const used = new Set<string>();
  const unknown: string[] = [];
  const columns = headers.map((h) => {
    const key = byName.get(norm(h)) ?? null;
    if (!key || used.has(key)) { if (h.trim()) unknown.push(h.trim()); return null; }
    used.add(key);
    return key;
  });
  return { columns, unknown, missing: fields.filter((f) => f.required && !used.has(f.key)).map((f) => f.header) };
}

/** Rows of the file as records keyed by field; blank lines are dropped. `line` is the line number in the file. */
export function toRecords(table: string[][], mapping: Mapping): Array<{ line: number; values: Record<string, string> }> {
  const out: Array<{ line: number; values: Record<string, string> }> = [];
  table.slice(1).forEach((cells, i) => {
    const values: Record<string, string> = {};
    mapping.columns.forEach((key, c) => { if (key) values[key] = (cells[c] ?? '').trim(); });
    if (Object.values(values).some((v) => v !== '')) out.push({ line: i + 2, values });
  });
  return out;
}

/** YYYY-MM-DD from 2026-10-04, 04/10/2026, 4-10-2026 or 2026/10/04 (day first, as people write it here). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (hit) { y = +hit[1]!; m = +hit[2]!; d = +hit[3]!; }
  else if ((hit = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) { d = +hit[1]!; m = +hit[2]!; y = +hit[3]!; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A date and time as an ISO instant in Kigali time (UTC+2): "2026-10-04 09:30" or "04/10/2026 9h30". */
export function parseDateTime(raw: string): string | null {
  const m = /^(.*?)[\sT]+(\d{1,2})[:h.](\d{2})$/.exec(raw.trim());
  const date = parseDate(m ? m[1]! : raw);
  if (!date) return null;
  const hh = m ? +m[2]! : 0;
  const mm = m ? +m[3]! : 0;
  if (hh > 23 || mm > 59) return null;
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, hh - 2, mm)).toISOString();
}

/** Whole francs: "12,500", "12 500 RWF", "12500". Zero, negatives and decimals are refused. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/rwf|frw|fr/gi, '').replace(/[\s,  ']/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

export const parseMonth = (raw: string): string | null => (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.trim()) ? raw.trim() : null);

export type Found<T> = { kind: 'one'; item: T } | { kind: 'none' } | { kind: 'many' };

/** One match by name, ignoring case and accents. */
export function matchName<T>(items: T[], name: (t: T) => string, value: string): Found<T> {
  const v = norm(value);
  if (!v) return { kind: 'none' };
  const hits = items.filter((t) => norm(name(t)) === v);
  return hits.length === 1 ? { kind: 'one', item: hits[0]! } : hits.length === 0 ? { kind: 'none' } : { kind: 'many' };
}

export interface PersonLite { id: string; fullName: string; memberCode?: string | null; email?: string | null; phone?: string | null }
const digits = (s: string) => s.replace(/\D/g, '').replace(/^250/, '').replace(/^0/, '');

/** A person from what the sheet says: member code, email, phone or full name (the first that matches exactly one). */
export function resolvePerson(people: PersonLite[], value: string): Found<PersonLite> {
  const v = value.trim();
  if (!v) return { kind: 'none' };
  const tries: Array<(p: PersonLite) => boolean> = [
    (p) => !!p.memberCode && p.memberCode.toLowerCase() === v.toLowerCase(),
    (p) => !!p.email && p.email.toLowerCase() === v.toLowerCase(),
    (p) => digits(v).length >= 8 && !!p.phone && digits(p.phone) === digits(v),
    (p) => norm(p.fullName) === norm(v),
  ];
  for (const test of tries) {
    const hits = people.filter(test);
    if (hits.length === 1) return { kind: 'one', item: hits[0]! };
    if (hits.length > 1) return { kind: 'many' };
  }
  return { kind: 'none' };
}

export type RowState = 'OK' | 'DUPLICATE' | 'ERROR';
export interface Checked<Row> { line: number; label: string; state: RowState; issue?: Issue; row?: Row }

/** What a target says about one line of the file. */
export interface Verdict<Row> { label: string; row?: Row; issue?: Issue; duplicate?: boolean }

/** Check every line, and mark a line that repeats an earlier line of the same file as a duplicate. */
export function checkAll<Row>(
  records: Array<{ line: number; values: Record<string, string> }>,
  judge: (values: Record<string, string>) => Verdict<Row>,
  sameKey: (row: Row) => string,
): Array<Checked<Row>> {
  const seen = new Set<string>();
  return records.map(({ line, values }) => {
    const v = judge(values);
    if (v.issue || !v.row) return { line, label: v.label, state: 'ERROR', issue: v.issue };
    const key = sameKey(v.row);
    if (v.duplicate || seen.has(key)) return { line, label: v.label, state: 'DUPLICATE' };
    seen.add(key);
    return { line, label: v.label, state: 'OK', row: v.row };
  });
}

export interface SaveResult { line: number; label: string; ok: boolean; code?: string }

/** Save the good lines a few at a time; one failure never stops the others. */
export async function saveAll<Row>(
  rows: Array<Checked<Row>>,
  save: (row: Row) => Promise<void>,
  errorCode: (e: unknown) => string,
  onProgress: (done: number, total: number) => void,
  concurrency = 3,
): Promise<SaveResult[]> {
  const todo = rows.filter((r) => r.state === 'OK' && r.row !== undefined);
  const out: SaveResult[] = [];
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < todo.length) {
      const r = todo[next++]!;
      try {
        await save(r.row as Row);
        out.push({ line: r.line, label: r.label, ok: true });
      } catch (e) {
        out.push({ line: r.line, label: r.label, ok: false, code: errorCode(e) });
      }
      onProgress(++done, todo.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return out.sort((a, b) => a.line - b.line);
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
/** A CSV (with a byte-order mark so Excel reads accents) from a header row and rows. */
export const toCsv = (head: string[], rows: string[][]): string => '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
