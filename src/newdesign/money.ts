import type { CountStatus, MoneyEntryItem, MoneyStatus } from '../api/frontDoorApi';

const ERROR_KEYS: Record<string, string> = {
  AMOUNT: 'door.money.err.amount',
  BAD_PLAN: 'door.money.err.plan',
  BAD_DATE: 'door.money.err.date',
  ACCOUNT_CLOSED: 'door.money.err.closed',
  PENDING_SPENDING: 'door.money.err.pending',
  REASON_REQUIRED: 'door.money.err.reason',
  WRONG_STATE: 'door.money.err.wrongState',
  OWN_ENTRY: 'door.money.err.ownEntry',
  NEEDS_TWO_COUNTERS: 'door.money.err.twoCounters',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
  UNIT_HAS_NO_SYSTEM: 'door.gov.err.noSystem',
  BUDGET_APPROVED: 'door.money.err.budgetApproved',
  EMPTY_BUDGET: 'door.money.err.emptyBudget',
  EMPTY_LIST: 'door.money.err.emptyList',
  LIST_EXISTS: 'door.money.err.listExists',
  UNKNOWN_TYPE: 'door.money.err.unknownType',
  UNKNOWN_TEAM: 'door.money.err.unknownTeam',
  NOTHING_TO_COMBINE: 'door.money.err.nothingToCombine',
  LINE_NAME: 'door.money.lines.err.name',
  ACCOUNT: 'door.money.err.account',
};
export const moneyErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

export const moneyStatusKey = (s: MoneyStatus) => `door.money.status.${s}` as const;
export const countStatusKey = (s: CountStatus) => `door.money.count.status.${s}` as const;
export const categoryKey = (c: string) => `door.money.cat.${c}` as const;

/** "12,500 RWF": whole francs, grouped by thousands. */
export const formatRwf = (n: number): string => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} RWF`;

/** Whole francs from what was typed ("12 500", "12,500"); null when it is not a positive whole number. */
export function parseAmount(v: string): number | null {
  const clean = v.replace(/[\s,]/g, '');
  if (!/^\d{1,10}$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 ? n : null;
}

/** Spending waiting for a decision first, then newest day first. */
export function queueFirst(list: MoneyEntryItem[]): MoneyEntryItem[] {
  const rank = (e: MoneyEntryItem) => (e.status === 'PENDING_APPROVAL' ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || b.occurredOn.localeCompare(a.occurredOn));
}

export const currentMonth = (now = new Date()): string => new Date(now.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 7);

const csvCell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};

/** The entries as a spreadsheet file (CSV). Amounts are whole francs; a cancelled entry keeps its reason. */
export function entriesToCsv(list: MoneyEntryItem[], head: string[]): string {
  const rows = list.map((e) => [e.occurredOn, e.accountName, e.kind, e.category, e.amount, e.status, e.note, e.planTitle, e.recordedByName, e.decidedByName, e.decisionNote]);
  return [head, ...rows].map((r) => r.map((c) => csvCell(c as string | number | null)).join(',')).join('\r\n');
}
