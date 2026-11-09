import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { DoorSchedulingConfigPage } from './DoorSchedulingConfigPage';

/*
 * Configuration is live: no versions, drafts or activation. These are static-render tests, so effects
 * (lock acquire, heartbeat, release) do not run here; they are covered by the server tests for editLock.
 * What a static render does show: the page shell, the tabs, the intro copy per tab, the read-only and
 * validation notices, and the editors' loaded or error states.
 */
const loadStates = vi.hoisted(() => ({
  results: {} as Record<string, { loading: boolean; failed: boolean | string; data?: unknown; reload: () => void }>,
}));
const frontDoorState = vi.hoisted(() => ({
  capabilities: {
    systems: [] as Array<{ id: string; own: Array<{ key: string; letters: string[] }> }>,
  },
}));

vi.mock('./FrontDoorContext', () => ({
  useFrontDoor: () => ({ signOut: () => {}, capabilities: frontDoorState.capabilities }),
}));
vi.mock('./useLoad', () => ({
  useLoad: (_load: unknown, key: string) =>
    loadStates.results[key] ?? { loading: false, failed: false, data: undefined, reload: () => {} },
}));
vi.mock('../api/frontDoorApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/frontDoorApi')>()),
  acquireConfigLock: vi.fn(),
  refreshConfigLock: vi.fn(),
  releaseConfigLock: vi.fn(),
  fetchConfigValidation: vi.fn(),
}));

const setAccess = (letters: string[]) => {
  frontDoorState.capabilities.systems = ['sys-music', 'sys-protocol'].map((id) => ({
    id, own: [{ key: 'config', letters }],
  }));
};

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

const selectedTab = (html: string) =>
  html.match(/<button[^>]*aria-current="page"[^>]*>(.*?)<\/button>/)?.[1]?.replace(/<[^>]*>/g, '').trim();
const tabCount = (html: string) => (html.match(/class="door-menu-link/g) ?? []).length;
const sectionHeading = (html: string) => html.match(/<h3>(.*?)<\/h3>/)?.[1];

const service = {
  id: 'svc1', systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE',
  weekday: 0, time: '09:00', recurrence: 'WEEKLY', selectedDates: [], active: true,
  musicRequired: true, protocolRequired: true, maxChoirs: 3, targetTeamSize: 10,
  displayOrder: 0, createdByPersonId: 'p1', createdAt: '2026-01-01T00:00:00.000Z',
};

describe('DoorSchedulingConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadStates.results = {};
    setAccess(['R']); // read-only: a static render then shows the editors, not the lock-pending state
  });

  it('renders the page title and the live-configuration notice, with no draft or version controls', () => {
    const html = renderPage();
    expect(html).toContain('Scheduling Setup');
    expect(html).toContain('Changes apply as soon as you save.');
    expect(html).toContain('You can view this configuration but not edit it.');
    for (const gone of ['Activate version', 'Working draft', 'Configuration history', 'Add or Change opens a working draft']) {
      expect(html).not.toContain(gone);
    }
  });

  it('Music has four tabs and each tab shows its own heading and intro', () => {
    const cases = [
      ['services', 'Services', 'The recurring events.'],
      ['categories', 'Choir categories', 'The groups a choir can belong to.'],
      ['choirs', 'Choirs', 'Put each choir in one category.'],
      ['rules', 'Rules', 'For each service, say which category or choir is scheduled, and how.'],
    ] as const;
    for (const [tab, label, intro] of cases) {
      const html = renderPage(`/s/sys-music/config?tab=${tab}`);
      expect(tabCount(html)).toBe(4);
      expect(selectedTab(html)).toBe(label);
      expect(sectionHeading(html)).toBe(label);
      expect(html).toContain(intro);
    }
  });

  it('Protocol has three tabs and keeps its own sections', () => {
    const cases = [
      ['services', 'Services'],
      ['protocol', 'Team size &amp; service rules'],
      ['duty', 'Duty distribution'],
    ] as const;
    for (const [tab, label] of cases) {
      const html = renderPage(`/s/sys-protocol/config?tab=${tab}`);
      expect(tabCount(html)).toBe(3);
      expect(selectedTab(html)).toBe(label);
      expect(sectionHeading(html)).toBe(label);
    }
  });

  it('keeps Protocol duty policy out of Music configuration', () => {
    const html = renderPage('/s/sys-music/config?tab=duty');
    expect(html).not.toContain('Duty distribution');
    expect(selectedTab(html)).toBe('Services');
  });

  it('old bookmarks land on the tab that now owns the content', () => {
    const landing: Array<[string, string]> = [
      ['links', 'Choirs'], ['availability', 'Choirs'], ['policies', 'Rules'], ['fixed', 'Rules'],
      ['review', 'Services'], ['versions', 'Services'],
    ];
    for (const [old, label] of landing) {
      expect(selectedTab(renderPage(`/s/sys-music/config?tab=${old}&version=v1`))).toBe(label);
    }
  });

  it('lists the services in the Services tab', () => {
    loadStates.results['sched-config-services|sys-music'] = { loading: false, failed: false, data: { services: [service] }, reload: () => {} };
    const html = renderPage('/s/sys-music/config?tab=services');
    expect(html).toContain('Sunday Service 1');
    expect(html).toContain('ss1');
  });

  it('shows the services empty state when there are no services', () => {
    expect(renderPage('/s/sys-music/config')).toContain('No church services yet.');
  });

  it('shows the shared service calendar as read-only in Protocol setup', () => {
    loadStates.results['sched-config-services|sys-protocol'] = { loading: false, failed: false, data: { services: [service] }, reload: () => {} };
    const html = renderPage('/s/sys-protocol/config?tab=services');
    expect(html).toContain('This is the shared service calendar.');
    expect(html).toContain('Sunday Service 1');
    expect(html).not.toContain('>Add</button>');
  });

  it('shows API not-found errors rather than an empty state', () => {
    loadStates.results['sched-config-services|sys-music'] = { loading: false, failed: 'notFound', reload: () => {} };
    const html = renderPage('/s/sys-music/config');
    expect(html).toContain('We could not find this');
    expect(html).not.toContain('No church services yet.');
  });

  it('preserves explicit authorization errors from the API', () => {
    loadStates.results['sched-config-services|sys-music'] = { loading: false, failed: 'forbidden', reload: () => {} };
    expect(renderPage('/s/sys-music/config')).toContain('You do not have access to this');
  });

  it('lists what stops this configuration from generating a schedule', () => {
    loadStates.results['sched-config-validation|sys-music'] = {
      loading: false, failed: false, data: { ok: false, errors: ['Sunday Service 1 needs a weekday.'] }, reload: () => {},
    };
    const html = renderPage('/s/sys-music/config');
    expect(html).toContain('This configuration cannot generate a schedule yet:');
    expect(html).toContain('Sunday Service 1 needs a weekday.');
  });

  it('shows no validation panel when the configuration is ready', () => {
    loadStates.results['sched-config-validation|sys-music'] = { loading: false, failed: false, data: { ok: true, errors: [] }, reload: () => {} };
    expect(renderPage('/s/sys-music/config')).not.toContain('cannot generate a schedule yet');
  });

  it('holds back the editors until the edit lock is taken, and shows no lock notices before that', () => {
    setAccess(['R', 'W']);
    loadStates.results['sched-config-services|sys-music'] = { loading: false, failed: false, data: { services: [service] }, reload: () => {} };
    const html = renderPage('/s/sys-music/config');
    expect(html).not.toContain('Sunday Service 1');
    expect(html).not.toContain('You are editing.');
    expect(html).not.toContain('is currently editing configuration');
    expect(html).not.toContain('You can view this configuration but not edit it.');
  });
});
