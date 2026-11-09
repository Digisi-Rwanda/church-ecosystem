import { describe, expect, it } from 'vitest';
import { blankLine, cleanLines, draftTotal, listsInOrder, progress, yearChoices } from './moneyBlock';

describe('money block helpers', () => {
  it('years: next year first, then this one and two before', () => {
    expect(yearChoices(new Date('2026-10-07T00:00:00Z'))).toEqual([2027, 2026, 2025, 2024]);
  });
  it('progress is a capped share and never divides by zero', () => {
    expect(progress(50, 200)).toBe(25);
    expect(progress(300, 200)).toBe(100);
    expect(progress(0, 0)).toBe(0);
    expect(progress(10, 0)).toBe(100);
    expect(progress(-5, 100)).toBe(0);
  });
  it('lines: empty rows are dropped, a name and a whole amount are needed', () => {
    const row = (name: string, amount: string) => ({ ...blankLine(), name, amount });
    expect(cleanLines([row('', ''), row(' Ann ', '1,200')])).toEqual({ ok: true, lines: [{ name: 'Ann', personId: null, team: null, amount: 1200 }] });
    expect(cleanLines([row('', '500')])).toEqual({ ok: false, error: 'door.money.lines.err.name' });
    expect(cleanLines([row('Ann', '0')])).toEqual({ ok: false, error: 'door.money.lines.err.amount' });
    expect(cleanLines([row('Ann', '12.5')])).toEqual({ ok: false, error: 'door.money.lines.err.amount' });
    expect(draftTotal([row('a', '1 000'), row('b', 'x'), row('c', '250')])).toBe(1250);
  });
  it('lists waiting for a step come first, then newest month', () => {
    const l = (status: 'DRAFT' | 'SUBMITTED' | 'APPROVED', month: string) => ({ status, month });
    expect(listsInOrder([l('APPROVED', '2026-10'), l('DRAFT', '2026-09'), l('SUBMITTED', '2026-08'), l('DRAFT', '2026-10')])).toEqual([l('SUBMITTED', '2026-08'), l('DRAFT', '2026-10'), l('DRAFT', '2026-09'), l('APPROVED', '2026-10')]);
  });
});
