import type { ContributionLineView, ListStatus } from '../api/frontDoorApi';
import { parseAmount } from './money';

export const yearChoices = (now = new Date()): number[] => {
  const y = now.getUTCFullYear();
  return [y + 1, y, y - 1, y - 2];
};

/** Planned against actual as a share, capped for the bar and never dividing by zero. */
export function progress(actual: number, planned: number): number {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((actual / planned) * 100)));
}

/** A line being typed: the amount stays text until it is saved. */
export type LineDraft = { name: string; personId: string | null; team: string | null; amount: string };
export const toLineDraft = (l: ContributionLineView): LineDraft => ({ name: l.name, personId: l.personId, team: l.team, amount: String(l.amount) });
export const blankLine = (): LineDraft => ({ name: '', personId: null, team: null, amount: '' });

/** Lines the server takes, or the message key of the first thing wrong. Empty rows are dropped. */
export function cleanLines(drafts: LineDraft[]): { ok: true; lines: Array<{ name: string; personId: string | null; team: string | null; amount: number }> } | { ok: false; error: string } {
  const lines: Array<{ name: string; personId: string | null; team: string | null; amount: number }> = [];
  for (const d of drafts) {
    if (!d.name.trim() && !d.amount.trim()) continue;
    if (!d.name.trim()) return { ok: false, error: 'door.money.lines.err.name' };
    const n = parseAmount(d.amount);
    if (n === null) return { ok: false, error: 'door.money.lines.err.amount' };
    lines.push({ name: d.name.trim(), personId: d.personId, team: d.team, amount: n });
  }
  return { ok: true, lines };
}

export const draftTotal = (drafts: LineDraft[]): number => drafts.reduce((s, d) => s + (parseAmount(d.amount) ?? 0), 0);

export const listStatusKey = (s: ListStatus) => `door.money.list.status.${s}` as const;
export const donationStatusKey = (s: 'PENDING' | 'APPROVED' | 'REJECTED') => `door.money.donation.status.${s}` as const;

/** Waiting lists first, then newest month. */
export function listsInOrder<T extends { status: ListStatus; month: string }>(lists: T[]): T[] {
  const rank = (s: ListStatus) => (s === 'SUBMITTED' ? 0 : s === 'DRAFT' || s === 'RETURNED' ? 1 : 2);
  return [...lists].sort((a, b) => rank(a.status) - rank(b.status) || b.month.localeCompare(a.month));
}
