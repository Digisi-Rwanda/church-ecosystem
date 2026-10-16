/**
 * Type-specific money views (Phase 3). Pure.
 * A project's cost lines belong to phases (its milestones); lines with no phase sit in an automatic "General" phase.
 * A program watches its burn rate: how fast the budget goes against how much of the year has passed.
 */
export interface PhaseLine { milestoneId?: string | null; amount: number; spent: number }
export interface PhaseRow { id: string | null; title: string; planned: number; spent: number; remaining: number; lines: number }

/** Planned and spent per phase. General comes first and also carries spending that was not tied to any line. `unlinkedSpent` is spending with no cost line. */
export function phasesOf(milestones: Array<{ id: string; title: string }>, lines: PhaseLine[], unlinkedSpent: number): PhaseRow[] {
  const known = new Set(milestones.map((m) => m.id));
  const slot = (id: string | null) => lines.filter((l) => (l.milestoneId && known.has(l.milestoneId) ? l.milestoneId : null) === id);
  const row = (id: string | null, title: string, extra: number): PhaseRow => {
    const ls = slot(id);
    const planned = ls.reduce((n, l) => n + l.amount, 0);
    const spent = ls.reduce((n, l) => n + l.spent, 0) + extra;
    return { id, title, planned, spent, remaining: Math.max(0, planned - spent), lines: ls.length };
  };
  const out = [row(null, 'General', unlinkedSpent), ...milestones.map((m) => row(m.id, m.title, 0))];
  return out.filter((r) => r.id !== null || r.lines > 0 || r.spent > 0 || milestones.length === 0);
}

export interface Burn { months: number; elapsed: number; spent: number; planned: number; perMonth: number; projected: number; runway: number | null; pace: 'NONE' | 'ON_TRACK' | 'FAST' | 'SLOW' }

const monthsFrom = (a: Date, b: Date) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();

/** How the program is spending. `months` is the length of the budget (to its end, else twelve); `elapsed` counts the current month. */
export function burnOf(input: { planned: number; spent: number; startsOn: Date | null; endsOn: Date | null; now: Date }): Burn {
  const start = input.startsOn ?? new Date(Date.UTC(input.now.getUTCFullYear(), 0, 1));
  const months = Math.max(1, input.endsOn ? monthsFrom(start, input.endsOn) + 1 : 12);
  const elapsed = Math.min(months, Math.max(1, monthsFrom(start, input.now) + 1));
  const perMonth = Math.round(input.spent / elapsed);
  const projected = perMonth * months;
  const runway = perMonth > 0 ? Math.max(0, Math.floor((input.planned - input.spent) / perMonth)) : null;
  const expected = (input.planned * elapsed) / months;
  const pace = input.spent === 0 ? 'NONE' : input.spent > expected * 1.1 ? 'FAST' : input.spent < expected * 0.5 ? 'SLOW' : 'ON_TRACK';
  return { months, elapsed, spent: input.spent, planned: input.planned, perMonth, projected, runway, pace };
}
