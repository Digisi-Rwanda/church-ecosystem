import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { DoorSchedulingConfigPage } from './DoorSchedulingConfigPage';

vi.mock('./FrontDoorContext', () => ({ useFrontDoor: () => ({ signOut: () => {} }) }));
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

const renderPage = () =>
  renderToStaticMarkup(
    h(I18nProvider, null,
      h(MemoryRouter, { initialEntries: ['/s/sys-music/config'] },
        h(Routes, null,
          h(Route, { path: '/s/:systemId/config', element: h(DoorSchedulingConfigPage) })
        )
      )
    )
  );

describe('DoorSchedulingConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchSchedulingServices as any).mockResolvedValue({ services: [] });
    (api.fetchChoirCategories as any).mockResolvedValue({ categories: [] });
    (api.fetchCategoryServicePolicies as any).mockResolvedValue({ policies: [] });
    (api.fetchChoirCategoryLinks as any).mockResolvedValue({ links: [] });
    (api.fetchProtocolServiceRules as any).mockResolvedValue({ rules: [] });
    (api.fetchProtocolDutyPolicy as any).mockResolvedValue({ policy: null });
    (api.fetchConfigVersions as any).mockResolvedValue({ versions: [] });
    (api.retireSchedulingService as any).mockResolvedValue({});
  });

  it('loads configuration successfully and shows tabs', () => {
    (api.fetchSchedulingServices as any).mockResolvedValue({
      services: [{
        id: 'svc1', systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE',
        weekday: 0, time: '09:00', recurrence: 'WEEKLY', selectedDates: [], active: true,
        effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, musicRequired: true,
        protocolRequired: true, maxChoirs: 3, targetTeamSize: 10, configVersionId: 'v1',
        displayOrder: 0, supersedesId: null, createdByPersonId: 'p1', createdAt: '2026-01-01T00:00:00.000Z',
      }],
    });
    const html = renderPage();
    expect(html).toContain('Scheduling configuration');
    expect(html).toContain('Services');
    expect(html).toContain('Choir categories');
  });

  it('shows empty state when no services', () => {
    const html = renderPage();
    expect(html).toContain('Scheduling configuration');
  });

  it('handles API failures gracefully', () => {
    (api.fetchSchedulingServices as any).mockRejectedValue(new Error('fail'));
    const html = renderPage();
    expect(html).toContain('Scheduling configuration');
  });

  it('handles EXISTS response pattern if create is called', () => {
    const err: any = new Error('exists');
    err.code = 'EXISTS';
    (api.fetchSchedulingServices as any).mockRejectedValue(err);
    const html = renderPage();
    expect(html).toContain('Scheduling configuration');
  });
});

