import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { recurrenceLabel } from './config';
import { MonthlyWeeks } from './SchedulingConfigEditors';

const words: Record<string, string> = {
  'door.config.recurrence.WEEKLY': 'Every week', 'door.config.recurrence.MONTHLY': 'Every month',
  'door.config.week.1': '1st', 'door.config.week.2': '2nd', 'door.config.week.3': '3rd', 'door.config.week.4': '4th',
  'door.config.week.last': 'Last', 'door.config.week.none': 'choose which week',
};
const t = ((key: string) => words[key] ?? key) as never;
const monthly = (over: Record<string, unknown>) => ({ recurrence: 'MONTHLY' as const, weekday: 6, selectedDates: [], monthlyOccurrences: [], ...over });

describe('recurrenceLabel', () => {
  it('names the weeks of a monthly service, in calendar order', () => {
    expect(recurrenceLabel(monthly({ monthlyOccurrences: [-1] }), t)).toBe('Every month · Last');
    expect(recurrenceLabel(monthly({ monthlyOccurrences: [-1, 3, 1] }), t)).toBe('Every month · 1st, 3rd, Last');
  });
  it('says so when a monthly service with a day has no week chosen', () => {
    expect(recurrenceLabel(monthly({}), t)).toBe('Every month · choose which week');
  });
  it('leaves other repeats, and monthly services on exact dates, as they were', () => {
    expect(recurrenceLabel({ recurrence: 'WEEKLY', weekday: 0, selectedDates: [] }, t)).toBe('Every week');
    expect(recurrenceLabel(monthly({ selectedDates: ['2026-12-25'] }), t)).toBe('Every month');
    expect(recurrenceLabel(monthly({ weekday: null }), t)).toBe('Every month');
  });
});

describe('MonthlyWeeks', () => {
  const render = (props: { hasWeekday: boolean; value: number[] }) =>
    renderToStaticMarkup(h(I18nProvider, null, h(MonthlyWeeks, { ...props, onChange: () => {} })));

  it('offers 1st, 2nd, 3rd, 4th and Last, with the chosen ones ticked', () => {
    const html = render({ hasWeekday: true, value: [1, -1] });
    for (const label of ['1st', '2nd', '3rd', '4th', 'Last']) expect(html).toContain(label);
    expect(html.match(/type="checkbox"/g)).toHaveLength(5);
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });
  it('asks for a day first when there is none', () => {
    const html = render({ hasWeekday: false, value: [] });
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('Choose a day first');
  });
});
