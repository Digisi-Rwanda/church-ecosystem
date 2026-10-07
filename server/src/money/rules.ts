/**
 * Money (slice 3.4). The treasurer records directly (W); the president and other oversight offices
 * see every entry (V, which includes R); the president approves spending (A) but never their own entry.
 * Money is never deleted: an entry is voided with a reason, and approved spending is final.
 * Collections (offering counts) are a separate record with no money letters and no link to money.
 */
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const CATEGORIES = ['TITHE', 'OFFERING', 'DONATION', 'EVENT', 'SUPPLIES', 'SERVICES', 'TRANSPORT', 'AID', 'OTHER'] as const;
export const KINDS = ['INCOME', 'SPENDING'] as const;
export type EntryKind = (typeof KINDS)[number];
export const NAME_MAX = 80;
export const NOTE_MAX = 500;
export const AMOUNT_MAX = 2_000_000_000;

const held = (me: string, systemId: string, data: AccessData, now: Date) => lettersInSystem(me, systemId, data, now).MONEY as string[];
export const canReadMoney = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('R');
export const canRecord = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('W');
export const canApproveSpending = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('A');

export function amountProblem(n: unknown): 'AMOUNT' | null {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= AMOUNT_MAX ? null : 'AMOUNT';
}

export interface EntryLike { kind: string; amount: number; status: string }

/** Income recorded minus spending approved; pending spending is shown apart and is not yet spent. */
export function balances(entries: EntryLike[]): { income: number; spent: number; pending: number; balance: number } {
  let income = 0, spent = 0, pending = 0;
  for (const e of entries) {
    if (e.kind === 'INCOME' && e.status === 'RECORDED') income += e.amount;
    else if (e.kind === 'SPENDING' && e.status === 'APPROVED') spent += e.amount;
    else if (e.kind === 'SPENDING' && e.status === 'PENDING_APPROVAL') pending += e.amount;
  }
  return { income, spent, pending, balance: income - spent };
}

export const isDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
export const inMonth = (d: Date | string, month: string): boolean => new Date(new Date(d).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 7) === month;
