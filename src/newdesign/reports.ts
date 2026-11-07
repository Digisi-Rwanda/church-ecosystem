import type { ReportCell, ReportCellType, ReportItem, ReportKind, ReportScheduleItem } from '../api/frontDoorApi';
import { formatRwf } from './money';

const ERROR_KEYS: Record<string, string> = {
  ALREADY_EXISTS: 'door.reports.err.exists',
  WRONG_STATE: 'door.reports.err.wrongState',
  SOURCE_FORBIDDEN: 'door.reports.err.source',
  BAD_INPUT: 'door.reports.err.input',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
  UNIT_HAS_NO_SYSTEM: 'door.gov.err.noSystem',
};
export const reportErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

export const kindKey = (k: ReportKind) => `door.reports.kind.${k}` as const;
export const stateKey = (s: ReportScheduleItem['state']) => `door.reports.state.${s}` as const;

/** "October 2026" or "2026". */
export function periodLabel(key: string, locale: string): string {
  if (/^\d{4}$/.test(key)) return key;
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Drafts first, then newest period first. */
export function sortReports(list: ReportItem[]): ReportItem[] {
  return [...list].sort((a, b) => (a.status === b.status ? 0 : a.status === 'DRAFT' ? -1 : 1) || b.periodKey.localeCompare(a.periodKey) || a.kind.localeCompare(b.kind));
}

/** How one cell is shown. Codes are translated by the caller. */
export function cellText(v: ReportCell, type: ReportCellType): string {
  if (v === null || v === '') return '—';
  if (type === 'money') return formatRwf(Number(v));
  if (type === 'percent') return `${v}%`;
  return String(v);
}

/** Last month, in Rwanda time: the usual period of a monthly report. */
export function lastMonth(now = new Date()): string {
  const k = new Date(now.getTime() + 2 * 3600 * 1000);
  const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** How many monthly reports are received, due and late. */
export function boardCounts(list: ReportScheduleItem[]): Record<ReportScheduleItem['state'], number> {
  const out = { RECEIVED: 0, DUE: 0, LATE: 0 };
  for (const s of list) out[s.state]++;
  return out;
}

/** The period before a report's period: last month for "2026-10", last year for "2026". */
export function previousPeriod(key: string): string {
  if (/^\d{4}$/.test(key)) return String(Number(key) - 1);
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Change from the last period as text: "+12", "−3" or "=" (numbers only). */
export function deltaText(now: ReportCell, before: ReportCell): string {
  if (typeof now !== 'number' || typeof before !== 'number') return '';
  const d = now - before;
  return d === 0 ? '=' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
}
