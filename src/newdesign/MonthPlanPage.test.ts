import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { MonthPlanPage } from './MonthPlanPage';

const loaded = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('./useLoad', () => ({
  useLoad: (_load: unknown, key: string) => ({ data: loaded.data[key], loading: false, failed: false, reload: () => {} }),
}));
vi.mock('./ScheduleShared', async (original) => ({
  ...await original<typeof import('./ScheduleShared')>(),
  useScheduleView: () => ['bulletin', () => {}],
}));

const service = {
  id: 'ss3', periodKey: '2026-11', kind: 'SS3', date: '2026-11-08', label: 'Sunday Service 3',
  units: [{ unitId: 'elim', name: 'Elim', kind: 'PRIMARY' }],
};
const render = () => renderToStaticMarkup(h(I18nProvider, null, h(MemoryRouter, null, h(MonthPlanPage))));
afterEach(() => { vi.useRealTimers(); loaded.data = {}; });

describe('Music month plan', () => {
  it('shows both months with an empty state and rolls over at midnight in Kigali', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    loaded.data['music-sched'] = { canWrite: false, units: [], drafts: [], options: {}, months: [{ periodKey: '2026-10', state: 'PUBLISHED' }] };
    vi.setSystemTime(new Date('2026-11-30T21:59:00Z'));
    expect(render()).toContain('November 2026');
    expect(render()).toContain('December 2026');
    expect(render()).toContain('No schedule published yet');
    expect(render()).not.toContain('October 2026');
    vi.setSystemTime(new Date('2026-11-30T22:00:00Z'));
    expect(render()).toContain('December 2026');
    expect(render()).toContain('January 2027');
    expect(render()).not.toContain('November 2026');
  });

  it.each(['GENERATED', 'CONFIRMED', 'PUBLISHED'])('renders the shared Bulletin edit entry for a %s schedule', (state) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T10:00:00Z'));
    loaded.data['music-sched'] = {
      canWrite: true, units: [], options: {},
      drafts: state === 'GENERATED' ? [{ id: 'draft1', label: 'November draft' }] : [],
      months: state === 'GENERATED' ? [] : [{ periodKey: '2026-11', state }],
    };
    loaded.data['music-draft|draft1'] = { services: [service], months: [{ periodKey: '2026-11' }], warnings: [] };
    loaded.data['music-month|2026-11'] = { services: [service], canWrite: true, state, version: 1, warnings: [] };
    expect(render()).toContain('aria-label="Edit Sunday Service 3"');
  });
});
