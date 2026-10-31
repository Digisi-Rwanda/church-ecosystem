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
  fetchChoirs: vi.fn(),
  createConfigVersion: vi.fn(),
  cloneConfigVersion: vi.fn(),
  activateConfigVersion: vi.fn(),
  retireSchedulingService: vi.fn(),
  createSchedulingService: vi.fn(),
  createChoirCategory: vi.fn(),
  createCategoryServicePolicy: vi.fn(),
  createChoirCategoryLink: vi.fn(),
  createProtocolServiceRule: vi.fn(),
  createProtocolDutyPolicy: vi.fn(),
  updateSchedulingService: vi.fn(),
  updateChoirCategory: vi.fn(),
  updateCategoryServicePolicy: vi.fn(),
  updateChoirCategoryLink: vi.fn(),
  updateProtocolServiceRule: vi.fn(),
  updateProtocolDutyPolicy: vi.fn(),
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
    (api.fetchChoirs as any).mockResolvedValue({ choirs: [] });
    (api.fetchConfigVersions as any).mockResolvedValue({ versions: [] });
    (api.createConfigVersion as any).mockResolvedValue({ version: 'v1' });
    loadStates.results['sched-config-versions|sys-music'] = {
      loading: false, failed: false, data: { versions: [{ id: 'v1', systemId: 'sys-music', version: 1, label: 'Initial setup', status: 'ACTIVE' }] }, reload: () => {},
    };
    loadStates.results['sched-config-versions|sys-protocol'] = {
      loading: false, failed: false, data: { versions: [{ id: 'p1', systemId: 'sys-protocol', version: 1, label: 'Protocol setup', status: 'ACTIVE' }] }, reload: () => {},
    };
    (api.cloneConfigVersion as any).mockResolvedValue({ version: {} });
    (api.activateConfigVersion as any).mockResolvedValue({ version: {} });
    (api.retireSchedulingService as any).mockResolvedValue({});
  });

  it('shows the selected section and its content for each tab URL', () => {
    const cases = [
      ['services', 'Services', 'Sunday Service 1', 'sched-config-services|sys-music|v1', { services: [{
        id: 'svc1', systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE',
        weekday: 0, time: '09:00', recurrence: 'WEEKLY', selectedDates: [], active: true,
        effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, musicRequired: true,
        protocolRequired: true, maxChoirs: 3, targetTeamSize: 10, configVersionId: 'v1',
        displayOrder: 0, supersedesId: null, createdByPersonId: 'p1', createdAt: '2026-01-01T00:00:00.000Z',
      }] }],
      ['categories', 'Choir categories', 'Youth Choir', 'sched-config-cats|sys-music|v1', { categories: [{
        id: 'cat1', name: 'Youth Choir', code: 'YOUTH', description: 'Youth singers',
      }] }],
      ['policies', 'Category × service policies', 'Target 2', 'sched-config-policies|sys-music|v1', { policies: [{
        id: 'policy1', eligible: true, frequencyKind: 'TARGET', frequencyTarget: 2, planningMode: 'ROTATION',
      }] }],
      ['links', 'Choir ↔ category links', 'choir-youth', 'sched-config-links|sys-music|v1', { links: [{
        id: 'link1', choirId: 'choir-youth', categoryId: 'cat1', active: true,
      }] }],
      ['versions', 'Config versions', 'Initial setup', 'sched-config-versions|sys-music', { versions: [{
        id: 'v1', label: 'Initial setup', status: 'ACTIVE', version: 1,
      }] }],
    ] as const;

    for (const [tab, label, content, key, data] of cases) {
      loadStates.results[key] = { loading: false, failed: false, data, reload: () => {} };
      const html = renderPage(`/s/sys-music/config?tab=${tab}&version=v1`);
      const selectedButton = html.match(/<button[^>]*aria-current="page"[^>]*>(.*?)<\/button>/)?.[1];
      expect(selectedButton).toBe(label);
      expect(html).toContain(content);
    }
  });

  it('shows the services empty state when there are no services', () => {
    const html = renderPage('/s/sys-music/config?version=v1');
    expect(html).toContain('No services yet.');
  });

  it('keeps active versions read-only and exposes editors for a selected draft', () => {
    loadStates.results['sched-config-versions|sys-music'] = {
      loading: false, failed: false, data: { versions: [
        { id: 'v0', systemId: 'sys-music', version: 0, label: 'Historical', status: 'SUPERSEDED' },
        { id: 'v1', systemId: 'sys-music', version: 1, label: 'Active', status: 'ACTIVE' },
        { id: 'v2', systemId: 'sys-music', version: 2, label: 'Draft', status: 'DRAFT' },
      ] }, reload: () => {},
    };
    loadStates.results['sched-config-services|sys-music|v2'] = {
      loading: false, failed: false, data: { services: [] }, reload: () => {},
    };

    const activeHtml = renderPage('/s/sys-music/config?version=v1');
    expect(activeHtml).toContain('This Active version is read-only.');
    expect(activeHtml).not.toContain('Add configuration row');

    const historicalHtml = renderPage('/s/sys-music/config?version=v0');
    expect(historicalHtml).toContain('This Superseded version is read-only.');
    expect(historicalHtml).not.toContain('Add configuration row');

    const draftHtml = renderPage('/s/sys-music/config?version=v2');
    expect(draftHtml).toContain('Editing a draft.');
    expect(draftHtml).toContain('Add configuration row');
  });

  it('shows API not-found errors rather than an empty state', () => {
    loadStates.results['sched-config-services|sys-music|v1'] = {
      loading: false, failed: 'notFound', reload: () => {},
    };
    const html = renderPage('/s/sys-music/config?version=v1');
    expect(html).toContain('We could not find this');
    expect(html).not.toContain('No services yet.');
  });

  it('preserves explicit authorization errors from the API', () => {
    loadStates.results['sched-config-services|sys-music|v1'] = {
      loading: false, failed: 'forbidden', reload: () => {},
    };
    expect(renderPage('/s/sys-music/config?version=v1')).toContain('You do not have access to this');
  });

  it('renders the configuration page title and tabs', () => {
    loadStates.results['sched-config-services|sys-music|v1'] = {
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
    const html = renderPage('/s/sys-music/config?version=v1');
    expect(html).toContain('Scheduling configuration');
    expect(html).toContain('Services');
    expect(html).toContain('Choir categories');
  });

  it('keeps Protocol duty policy out of Music configuration', () => {
    const html = renderPage('/s/sys-music/config?tab=duty&version=v1');
    expect(html).not.toContain('Duty policy');
    expect(html).toContain('Services');
  });

  it('shows Protocol rules and duty policy only for sys-protocol', () => {
    loadStates.results['sched-config-protocol|sys-protocol|p1'] = {
      loading: false, failed: false, data: { rules: [{ id: 'r1', serviceId: 'ss1', defaultTeamSize: 10, required: true }] }, reload: () => {},
    };
    loadStates.results['sched-config-protocol-services'] = { loading: false, failed: false, data: { services: [] }, reload: () => {} };
    loadStates.results['sched-config-duty|sys-protocol|p1'] = { loading: false, failed: false, data: { policy: null }, reload: () => {} };
    const rulesHtml = renderPage('/s/sys-protocol/config?tab=protocol&version=p1');
    expect(rulesHtml).toContain('Protocol rules');
    expect(rulesHtml).toContain('ss1');
    const dutyHtml = renderPage('/s/sys-protocol/config?tab=duty&version=p1');
    expect(dutyHtml).toContain('Duty policy');
  });
});
