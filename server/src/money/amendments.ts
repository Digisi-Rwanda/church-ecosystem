/**
 * Budget amendments (slice 5). After approval an activity's money is locked; only an amendment changes it. The same total (or less) is a
 * transfer that the President decides; a higher total goes to the Church Leader. While one is open its extra amount is held back from
 * the sources, so a second request cannot take more than what remains. Pure.
 */
import { potId } from './funds.js';

export interface AmendLine { id?: string | null; title: string; amount: number; category?: string | null }
export interface AmendSource { kind: string; code: string; amount: number }
export type AmendKind = 'TRANSFER' | 'INCREASE';

export const classify = (oldTotal: number, newTotal: number): AmendKind => (newTotal > oldTotal ? 'INCREASE' : 'TRANSFER');
export const totalOf = (lines: Array<{ amount: number }>): number => lines.reduce((n, l) => n + l.amount, 0);

/** What a change asks for beyond what the activity already holds: the positive differences, by source. */
export function reserveOf(current: AmendSource[], proposed: AmendSource[]): AmendSource[] {
  const had = new Map(current.map((s) => [potId(s.kind, s.code), s.amount]));
  return proposed
    .map((s) => ({ ...s, amount: s.amount - (had.get(potId(s.kind, s.code)) ?? 0) }))
    .filter((s) => s.amount > 0);
}

/** The lines a change touches: edited, added. Their Treasurer tick goes (they show as modified). Lines left alone keep theirs. */
export function touchedLines(current: Array<{ id: string; title: string; amount: number }>, proposed: AmendLine[]): { keep: string[]; changed: AmendLine[]; dropped: string[] } {
  const byId = new Map(current.map((l) => [l.id, l]));
  const keep: string[] = [];
  const changed: AmendLine[] = [];
  for (const l of proposed) {
    const old = l.id ? byId.get(l.id) : undefined;
    if (old && old.title === l.title && old.amount === l.amount) keep.push(old.id);
    else changed.push(l);
  }
  const named = new Set(proposed.map((l) => l.id).filter(Boolean) as string[]);
  return { keep, changed, dropped: current.filter((l) => !named.has(l.id)).map((l) => l.id) };
}

export type AmendProblem = 'NO_CHANGE' | 'GAP' | null;
/** A request must change something, and its sources must cover its lines exactly. */
export function amendProblem(oldLines: Array<{ id: string; title: string; amount: number }>, lines: AmendLine[], sources: AmendSource[], multiplier = 1): AmendProblem {
  const t = touchedLines(oldLines, lines);
  if (t.changed.length === 0 && t.dropped.length === 0) return 'NO_CHANGE';
  return totalOf(lines) * multiplier !== sources.reduce((n, s) => n + s.amount, 0) ? 'GAP' : null;
}

/** How far actual spending is past the plan; zero when within it. */
export const overBy = (planned: number, actual: number): number => Math.max(0, actual - planned);
