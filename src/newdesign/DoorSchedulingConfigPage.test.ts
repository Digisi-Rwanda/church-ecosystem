import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { DoorSchedulingConfigPage } from './DoorSchedulingConfigPage';

const loadStates = vi.hoisted(() => ({
  results: {} as Record<string, { loading: boolean; failed: boolean | string; data?: unknown; reload: () => void }>,
}));

vi.mock('./FrontDoorContext', () => ({ useFrontDoor: () => ({ signOut: () => {} }) }));
vi.mock('./useLoad', () => ({
  useLoad: (_load: unknown, key: string) =>
    loadStates.results[key] ?? { loading: false, failed: false, data: undefined, reload: () => {} },
}));
vi.mock('../api/frontDoorApi', () => ({
  fetchSchedulingServices: vi.fn(),
  fetchChoirCategories: vi.fn(),
  fetchCategoryServicePolicies: vi.fn(),
  fetchChoirCategoryLinks: vi.fn(),
  fetchProtocolServiceRules: vi.fn(),
  fetchProtocolDutyPolicy: vi.fn(),
  fetchConfigVersions: vi.fn(),
  retireSchedulingService: vi.fn(),
}));

import * as api from '../api/frontDoorApi';

const renderPage = (initialEntry = '/s/sys-music/config') =>
  renderToStaticMarkup(
    h(I18nProvider, null,
      h(MemoryRouter, { initialEntries: [initialEntry] },
        h(Routes, null,
          h(Route, { path: '/s/:systemId/config', element: h(DoorSchedulingConfigPage) })
        )
      )
    )
  );

describe('DoorSchedulingConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadStates.results = {};
    (api.fetchSchedulingServices as any).mockResolvedValue({ services: [] });
    (api.fetchChoirCategories as any).mockResolvedValue({ categories: [] });
    (api.fetchCategoryServicePolicies as any).mockResolvedValue({ policies: [] });
    (api.fetchChoirCategoryLinks as any).mockResolvedValue({ links: [] });
    (api.fetchProtocolServiceRules as any).mockResolvedValue({ rules: [] });
    (api.fetchProtocolDutyPolicy as any).mockResolvedValue({ policy: null });
    (api.fetchConfigVersions as any).mockResolvedValue({ versions: [] });
    (api.retireSchedulingService as any).mockResolvedValue({});
  });

  it('shows the selected section and its content for each tab URL', () => {
    const cases = [
      ['services', 'Services', 'Sunday Service 1', 'sched-config-services|sys-music', { services: [{
        id: 'svc1', systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE',
        weekday: 0, time: '09:00', recurrence: 'WEEKLY', selectedDates: [], active: true,
        effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, musicRequired: true,
        protocolRequired: true, maxChoirs: 3, targetTeamSize: 10, configVersionId: 'v1',
        displayOrder: 0, supersedesId: null, createdByPersonId: 'p1', createdAt: '2026-01-01T00:00:00.000Z',
      }] }],
      ['categories', 'Choir categories', 'Youth Choir', 'sched-config-cats|sys-music', { categories: [{
        id: 'cat1', name: 'Youth Choir', code: 'YOUTH', description: 'Youth singers',
      }] }],
      ['policies', 'Category × service policies', 'Target 2', 'sched-config-policies|sys-music', { policies: [{
        id: 'policy1', eligible: true, frequencyKind: 'TARGET', frequencyTarget: 2, planningMode: 'ROTATION',
      }] }],
      ['links', 'Choir ↔ category links', 'choir-youth', 'sched-config-links|sys-music', { links: [{
        id: 'link1', choirId: 'choir-youth', categoryId: 'cat1', active: true,
      }] }],
      ['protocol', 'Protocol rules', 'svc1', 'sched-config-protocol|sys-music', { rules: [{
        id: 'rule1', serviceId: 'svc1', defaultTeamSize: 8, required: true,
      }] }],
      ['duty', 'Duty policy', '3', 'sched-config-duty|sys-music', { policy: {
        preferTarget: 3, softMax: 3, hardMax: 4, extraDutyPolicy: 'ALLOW_WHEN_SHORT',
        duplicateSameDayAllowed: false, musicCompatibilityRequired: true, exceptionsAllowed: true,
      } }],
      ['versions', 'Config versions', 'Initial setup', 'sched-config-versions|sys-music', { versions: [{
        id: 'v1', label: 'Initial setup', status: 'ACTIVE', version: 1,
      }] }],
    ] as const;

    for (const [tab, label, content, key, data] of cases) {
      loadStates.results[key] = { loading: false, failed: false, data, reload: () => {} };
      const html = renderPage(`/s/sys-music/config?tab=${tab}`);
      const selectedButton = html.match(/<button[^>]*aria-current="page"[^>]*>(.*?)<\/button>/)?.[1];
      expect(selectedButton).toBe(label);
      expect(html).toContain(content);
    }
  });

  it('shows the services empty state when there are no services', () => {
    const html = renderPage();
    expect(html).toContain('No services yet.');
  });

  it('shows API not-found errors rather than an empty state', () => {
    loadStates.results['sched-config-services|sys-music'] = {
      loading: false, failed: 'notFound', reload: () => {},
    };
    const html = renderPage();
    expect(html).toContain('We could not find this');
    expect(html).not.toContain('No services yet.');
  });

  it('preserves explicit authorization errors from the API', () => {
    loadStates.results['sched-config-services|sys-music'] = {
      loading: false, failed: 'forbidden', reload: () => {},
    };
    expect(renderPage()).toContain('You do not have access to this');
  });

  it('renders the configuration page title and tabs', () => {
    loadStates.results['sched-config-services|sys-music'] = {
      loading: false, failed: false, data: {
      services: [{
        id: 'svc1', systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE',
        weekday: 0, time: '09:00', recurrence: 'WEEKLY', selectedDates: [], active: true,
        effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, musicRequired: true,
        protocolRequired: true, maxChoirs: 3, targetTeamSize: 10, configVersionId: 'v1',
        displayOrder: 0, supersedesId: null, createdByPersonId: 'p1', createdAt: '2026-01-01T00:00:00.000Z',
      }],
      }, reload: () => {},
    };
    const html = renderPage();
    expect(html).toContain('Scheduling configuration');
    expect(html).toContain('Services');
    expect(html).toContain('Choir categories');
  });
});
