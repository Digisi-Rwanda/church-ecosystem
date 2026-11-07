import { describe, expect, it } from 'vitest';
import type { MoneyEntryItem, ReportScheduleItem, ScheduleSlot } from '../api/frontDoorApi';
import { entriesToCsv } from './money';
import { monthKeyOf } from './plans';
import { boardCounts, deltaText, previousPeriod } from './reports';
import { monthGrid, overlapping, personClashes, servingCounts } from './schedule';

const slot = (id: string, startsAt: string, endsAt: string | null, who: string[]): ScheduleSlot => ({
  id, title: id, kind: 'SERVICE', startsAt, endsAt, location: null, notes: null, churchWide: false,
  assignments: who.map((p) => ({ id: `${id}-${p}`, personId: p, personName: p.toUpperCase(), role: 'x', status: 'ASSIGNED', declineReason: null, mine: false })),
});

describe('schedule helpers', () => {
  it('lays a month out in whole weeks, Monday first', () => {
    const g = monthGrid('2026-10');
    expect(g.length % 7).toBe(0);
    expect(g.find((c) => !c.off)?.day).toBe('2026-10-01');
    expect(new Date(`${g[0].day}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(g.filter((c) => !c.off)).toHaveLength(31);
  });
  it('finds overlapping slots and the person double-booked', () => {
    const a = slot('a', '2026-10-04T08:00:00Z', '2026-10-04T10:00:00Z', ['p1', 'p2']);
    const b = slot('b', '2026-10-04T09:00:00Z', '2026-10-04T11:00:00Z', ['p1']);
    const c = slot('c', '2026-10-04T12:00:00Z', null, ['p2']);
    expect([...overlapping([a, b, c])].sort()).toEqual(['a', 'b']);
    expect(personClashes([a, b, c])).toEqual([{ name: 'P1', titles: ['a', 'b'] }]);
  });
  it('counts who serves how often', () => {
    const a = slot('a', '2026-10-04T08:00:00Z', null, ['p1', 'p2']);
    const b = slot('b', '2026-10-11T08:00:00Z', null, ['p1']);
    expect(servingCounts([a, b]).map((x) => [x.name, x.count])).toEqual([['P1', 2], ['P2', 1]]);
  });
});

describe('money export', () => {
  it('writes a safe spreadsheet file', () => {
    const e = { occurredOn: '2026-10-01', accountName: 'Main', kind: 'SPENDING', category: 'RENT', amount: 5000, status: 'APPROVED', note: '=HYPERLINK("x"), a', planTitle: null, recordedByName: 'A', decidedByName: null, decisionNote: null } as unknown as MoneyEntryItem;
    const csv = entriesToCsv([e], ['date', 'note']);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"\'=HYPERLINK(""x""), a"');
    expect(csv).toContain(',5000,');
  });
});

describe('reports and plans helpers', () => {
  it('knows the last period and the change', () => {
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(previousPeriod('2026')).toBe('2025');
    expect(deltaText(12, 10)).toBe('+2');
    expect(deltaText(3, 5)).toBe('−2');
    expect(deltaText(4, 4)).toBe('=');
    expect(deltaText('a', 1)).toBe('');
  });
  it('counts the board', () => {
    const l = [{ state: 'LATE' }, { state: 'LATE' }, { state: 'DUE' }] as ReportScheduleItem[];
    expect(boardCounts(l)).toEqual({ RECEIVED: 0, DUE: 1, LATE: 2 });
  });
  it('files a plan under its month in church time', () => {
    expect(monthKeyOf('2026-10-31T23:30:00Z')).toBe('2026-11');
    expect(monthKeyOf(null)).toBe('none');
  });
});
