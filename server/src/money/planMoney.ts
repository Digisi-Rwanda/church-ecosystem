/**
 * Money on an activity's page (slice 4). Pure rules: the figures, the live gap, the Treasurer check and what an edit does to it.
 *   Planned spending   the activity's spending lines (the planned items stored against it)
 *   Money set aside    what it has earmarked from the unit's pots
 *   Gap                planned minus set aside; Submit stays off until it is zero
 * An activity with no spending has no Treasurer step. A flag from the Treasurer never stops anything: the approver reads it
 * and decides, and says why when going ahead over it.
 */
import type { Level } from '../work/plan.js';

export interface LineLike { id: string; amount: number; status: string; checkState?: string | null }
export interface SourceLike { amount: number }

/** Lines that count: a dropped one is out. */
export const liveLines = <T extends { status: string }>(lines: T[]): T[] => lines.filter((l) => l.status !== 'DROPPED');

export function figures(lines: LineLike[], sources: SourceLike[], multiplier = 1) {
  const planned = liveLines(lines).reduce((n, l) => n + l.amount, 0) * multiplier;
  const earmarked = sources.reduce((n, s) => n + s.amount, 0);
  return { planned, earmarked, gap: planned - earmarked };
}

export type SubmitProblem = 'FUNDING_GAP' | null;
/** Spending needs money set aside to the franc. No spending, no condition. */
export const submitProblem = (planned: number, earmarked: number): SubmitProblem => (planned > 0 && planned !== earmarked ? 'FUNDING_GAP' : planned === 0 && earmarked > 0 ? 'FUNDING_GAP' : null);

/** Whether the Treasurer may answer: every live line is ticked. A line changed after its tick is Modified and not ticked. */
export const allVerified = (lines: LineLike[]): boolean => liveLines(lines).length > 0 && liveLines(lines).every((l) => l.checkState === 'VERIFIED');

export type CheckResult = 'CHECKED' | 'FLAGGED';
export interface MoneyCheck { result: CheckResult; note: string | null; byId: string; at: string }

/** What an edit does to one line's tick: a verified line becomes Modified; others stay as they are. */
export const afterEdit = (state: string | null | undefined): string | null => (state === 'VERIFIED' || state === 'MODIFIED' ? 'MODIFIED' : null);

/**
 * The approval levels after money changed while the activity waits. Spending where there was none adds the Treasurer's step
 * before the Church Leader's; no spending left removes it. A change to figures the Treasurer had already answered pulls the
 * activity back to the Treasurer.
 */
export function adjustLevels(levels: Level[], planned: number, changed: boolean, systemId: string): { levels: Level[]; pulledBack: boolean; added: boolean } {
  const idx = levels.findIndex((l) => l.levelKey === 'TREASURER');
  const out = levels.map((l) => ({ ...l }));
  if (planned > 0 && idx < 0) {
    // The Treasurer checks the figures first, before anyone above decides.
    out.splice(0, 0, { levelKey: 'TREASURER', label: 'Treasurer', systemId, status: 'PENDING', byId: null, at: null, note: null });
    return { levels: out, pulledBack: false, added: true };
  }
  if (planned === 0 && idx >= 0) return { levels: out.filter((l) => l.levelKey !== 'TREASURER'), pulledBack: false, added: false };
  if (planned > 0 && idx >= 0 && changed && out[idx]!.status === 'APPROVED') {
    out[idx] = { ...out[idx]!, status: 'PENDING', byId: null, at: null, note: null };
    return { levels: out, pulledBack: true, added: false };
  }
  return { levels: out, pulledBack: false, added: false };
}

export const checkNote = (result: CheckResult, note: string | null): string => (result === 'CHECKED' ? (note ? `Figures checked: ${note}` : 'Figures checked') : `Flagged: ${note ?? ''}`);
