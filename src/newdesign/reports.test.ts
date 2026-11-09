import { describe, expect, it } from 'vitest';
import type { ReportItem } from '../api/frontDoorApi';
import { cellText, lastMonth, periodLabel, reportErrorKey, sortReports } from './reports';

const r = (id: string, status: ReportItem['status'], periodKey: string, kind: ReportItem['kind'] = 'MEETINGS') => ({ id, status, periodKey, kind }) as ReportItem;

describe('report helpers', () => {
  it('labels periods', () => {
    expect(periodLabel('2026', 'en')).toBe('2026');
    expect(periodLabel('2026-10', 'en')).toBe('October 2026');
  });
  it('drafts first, then newest period', () => {
    expect(sortReports([r('a', 'PUBLISHED', '2026-09'), r('b', 'PUBLISHED', '2026-10'), r('c', 'DRAFT', '2026-08')]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('formats cells', () => {
    expect(cellText(1500, 'money')).toBe('1,500 RWF');
    expect(cellText(50, 'percent')).toBe('50%');
    expect(cellText(null, 'text')).toBe('—');
    expect(cellText('2026-10-04', 'date')).toBe('2026-10-04');
  });
  it('last month crosses the year', () => {
    expect(lastMonth(new Date('2027-01-10T10:00:00Z'))).toBe('2026-12');
  });
  it('errors fall back', () => {
    expect(reportErrorKey('ALREADY_EXISTS')).toBe('door.reports.err.exists');
    expect(reportErrorKey(undefined)).toBe('door.people.actionFailed');
  });
});
