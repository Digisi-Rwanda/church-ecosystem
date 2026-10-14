/**
 * Sending a plan back (pure). A plan returned to its creator remembers which step returned it, who had approved before that step,
 * and what the money looked like. When the creator submits again with the same money, those earlier approvals still stand and the
 * plan resumes at the step that returned it. A change to the money lines or the money set aside starts again from the Treasurer.
 */
import type { Level } from '../work/plan.js';

export interface MoneyLine { title?: string | null; amount: number; category?: string | null; status?: string | null; milestoneId?: string | null }
export interface MoneySource { kind: string; code: string; amount: number }
export interface ReturnMark { atKey: Level['levelKey']; levels: Level[]; sig: string }

/** The money of a plan in one comparable string: cost lines and the money set aside, in any order. */
export function moneySig(lines: MoneyLine[], sources: MoneySource[]): string {
  const l = lines.filter((x) => x.status !== 'DROPPED').map((x) => `${x.title ?? ''}|${x.amount}|${x.category ?? ''}|${x.milestoneId ?? ''}`).sort();
  const s = sources.filter((x) => x.amount > 0).map((x) => `${x.kind}|${x.code}|${x.amount}`).sort();
  return JSON.stringify([l, s]);
}

export function parseReturn(raw: string | null | undefined): ReturnMark | null {
  try {
    const v = JSON.parse(raw ?? 'null') as ReturnMark | null;
    return v && typeof v.sig === 'string' && Array.isArray(v.levels) && typeof v.atKey === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** The levels of a fresh submission, with the approvals that still stand: those before the returning step, when the money is unchanged. */
export function carryOver(fresh: Level[], saved: ReturnMark | null, sig: string): Level[] {
  if (!saved || saved.sig !== sig) return fresh;
  const stop = fresh.findIndex((l) => l.levelKey === saved.atKey);
  return fresh.map((l, i) => {
    if (stop >= 0 && i >= stop) return l;
    const was = saved.levels.find((x) => x.levelKey === l.levelKey && x.status === 'APPROVED');
    return was ? { ...l, status: 'APPROVED' as const, byId: was.byId, at: was.at, note: was.note } : l;
  });
}
