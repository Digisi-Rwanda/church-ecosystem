import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { DoorSchedulingConfigPage } from './DoorSchedulingConfigPage';

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
  archiveConfigVersion: vi.fn(),
  restoreConfigVersion: vi.fn(),
  deleteConfigVersion: vi.fn(),
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
    frontDoorState.capabilities.systems = ["sys-music", "sys-protocol"].map((id) => ({
      id, own: [{ key: "config", letters: ["R", "W"] }],
    }));
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
      ['services', 'Church services', 'Sunday Service 1', 'sched-config-services|sys-music|v1', { services: [{
        id: 'svc1', systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', kind: 'SERVICE',
        weekday: 0, time: '09:00', recurrence: 'WEEKLY', selectedDates: [], active: true,
        effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, musicRequired: true,
        protocolRequired: true, maxChoirs: 3, targetTeamSize: 10, configVersionId: 'v1',
        displayOrder: 0, supersedesId: null, createdByPersonId: 'p1', createdAt: '2026-01-01T00:00:00.000Z',
      }] }],
      ['categories', 'Choir categories', 'Youth Choir', 'sched-config-cats|sys-music|v1', { categories: [{
        id: 'cat1', name: 'Youth Choir', code: 'YOUTH', description: 'Youth singers',
      }] }],
      ['policies', 'Scheduling frequency', 'Target: 2 assignments', 'sched-config-policies|sys-music|v1', { policies: [{
        id: 'policy1', eligible: true, active: true, frequencyKind: 'TARGET', frequencyTarget: 2,
        frequencyCounting: 'ASSIGNMENTS', minCount: null, maxCount: null, requireAll: false, planningMode: 'ROTATION',
      }] }],
      ['links', 'Choir participation', 'Choir name unavailable', 'sched-config-links|sys-music|v1', { links: [{
        id: 'link1', choirId: 'choir-youth', categoryId: 'cat1', active: true,
      }] }],
      ['versions', 'Configuration history', 'Initial setup', 'sched-config-versions|sys-music', { versions: [{
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
    expect(html).toContain('No church services yet.');
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
    expect(activeHtml).toContain('This active version is used when new schedules are generated.');
    expect(activeHtml).not.toContain('Add</button>');

    const historicalHtml = renderPage('/s/sys-music/config?version=v0');
    expect(historicalHtml).toContain('This Superseded version is read-only.');
    expect(historicalHtml).not.toContain('Add</button>');

    const draftHtml = renderPage('/s/sys-music/config?version=v2');
    expect(draftHtml).toContain('You are editing a draft.');
    expect(draftHtml).toContain('Add</button>');
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
    expect(html).toContain('Scheduling Setup');
    expect(html).toContain('Church services');
    expect(html).toContain('Choir categories');
  });

  it('keeps Protocol duty policy out of Music configuration', () => {
    const html = renderPage('/s/sys-music/config?tab=duty&version=v1');
    expect(html).not.toContain('Duty policy');
    expect(html).toContain('Church services');
  });

  it('shows Protocol rules and duty policy only for sys-protocol', () => {
    loadStates.results['sched-config-protocol|sys-protocol|p1'] = {
      loading: false, failed: false, data: { rules: [{
        id: 'r1', serviceId: 'ss1', defaultTeamSize: 10, required: true, active: true, teamSizeOverrides: {},
        requireChoir: true, requireWorship: true, relaxableKinds: [],
      }] }, reload: () => {},
    };
    loadStates.results['sched-config-protocol-services'] = { loading: false, failed: false, data: { services: [] }, reload: () => {} };
    loadStates.results['sched-config-duty|sys-protocol|p1'] = { loading: false, failed: false, data: { policy: null }, reload: () => {} };
    const rulesHtml = renderPage('/s/sys-protocol/config?tab=protocol&version=p1');
    expect(rulesHtml).toContain('Team size &amp; service rules');
    expect(rulesHtml).toContain('Service name unavailable');
    expect(rulesHtml).toContain('Team of 10; 0 date-specific adjustments');
    expect(rulesHtml).toContain('date-specific team size');
    expect(rulesHtml).not.toContain('JSON');
    const dutyHtml = renderPage('/s/sys-protocol/config?tab=duty&version=p1');
    expect(dutyHtml).toContain('Duty distribution');
  });

  it('hides draft controls when the user has no configuration write capability', () => {
    frontDoorState.capabilities.systems[0].own[0].letters = ["R"];
    loadStates.results['sched-config-versions|sys-music'] = {
      loading: false, failed: false, data: { versions: [
        { id: 'v1', systemId: 'sys-music', version: 1, label: 'Active', status: 'ACTIVE' },
        { id: 'v2', systemId: 'sys-music', version: 2, label: 'Draft', status: 'DRAFT' },
      ] }, reload: () => {},
    };
    loadStates.results['sched-config-services|sys-music|v2'] = {
      loading: false, failed: false, data: { services: [] }, reload: () => {},
    };

    const html = renderPage('/s/sys-music/config?version=v2');
    expect(html).toContain('This Draft version is read-only.');
    expect(html).not.toContain('Add</button>');
    expect(html).not.toContain('Activate version');
  });

  it('shows the shared service calendar as read-only in Protocol setup', () => {
    loadStates.results['sched-config-services|sys-protocol|active'] = {
      loading: false, failed: false, data: { services: [{
        id: 'svc1', name: 'Sunday Service 1', code: 'ss1', active: true, weekday: 0,
        time: '09:00', recurrence: 'WEEKLY', selectedDates: [], musicRequired: true,
        protocolRequired: true, targetTeamSize: 12,
      }] }, reload: () => {},
    };

    const html = renderPage('/s/sys-protocol/config?tab=services&version=p1');
    expect(html).toContain('This is the shared service calendar.');
    expect(html).toContain('Sunday Service 1');
    expect(html).toContain('Target team size: 12');
    expect(html).not.toContain('Edit service');
  });

  it('labels choir participation and frequency as validation-only instead of displaying raw IDs', () => {
    loadStates.results['sched-config-links|sys-music|v1'] = {
      loading: false, failed: false, data: { links: [{
        id: 'link1', choirId: 'choir-secret-id', categoryId: 'cat1', active: true,
      }] }, reload: () => {},
    };
    loadStates.results['sched-config-link-cats|v1'] = {
      loading: false, failed: false, data: { categories: [{ id: 'cat1', name: 'Youth Choir', active: true }] }, reload: () => {},
    };
    loadStates.results['sched-config-link-choirs'] = {
      loading: false, failed: false, data: { choirs: [{ id: 'choir-secret-id', name: 'Youth Voices', active: true }] }, reload: () => {},
    };
    loadStates.results['sched-config-policies|sys-music|v1'] = {
      loading: false, failed: false, data: { policies: [{
        id: 'policy1', categoryId: 'cat1', serviceId: 'svc1', eligible: true, active: true,
        frequencyKind: 'TARGET', frequencyTarget: 2, frequencyCounting: 'ASSIGNMENTS',
        planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
      }] }, reload: () => {},
    };
    loadStates.results['sched-config-policy-cats|v1'] = {
      loading: false, failed: false, data: { categories: [{ id: 'cat1', name: 'Youth Choir', active: true }] }, reload: () => {},
    };
    loadStates.results['sched-config-policy-services|v1'] = {
      loading: false, failed: false, data: { services: [{ id: 'svc1', name: 'Sunday Service 1', active: true }] }, reload: () => {},
    };

    const linksHtml = renderPage('/s/sys-music/config?tab=links&version=v1');
    expect(linksHtml).toContain('Youth Voices · Youth Choir');
    expect(linksHtml).not.toContain('choir-secret-id');
    expect(linksHtml).toContain('Links determine selection and validation');
    const policiesHtml = renderPage('/s/sys-music/config?tab=policies&version=v1');
    expect(policiesHtml).toContain('Youth Choir · Sunday Service 1');
    expect(policiesHtml).toContain('These rules control choir selection and validation');
  });

  it('separates Protocol duty limits from stored settings not used by automatic assignment', () => {
    loadStates.results['sched-config-duty|sys-protocol|p1'] = {
      loading: false, failed: false, data: { policy: {
        id: 'd1', preferTarget: 3, softMax: 3, hardMax: 4, extraDutyPolicy: 'ALLOW_WHEN_SHORT',
        duplicateSameDayAllowed: false, musicCompatibilityRequired: true, leadershipPriorities: ['LEADER'],
        exceptionsAllowed: true,
      } }, reload: () => {},
    };

    const html = renderPage('/s/sys-protocol/config?tab=duty&version=p1');
    expect(html).toContain('Prefer target guides assignment selection');
    expect(html).toContain('Additional duty settings');
    expect(html).toContain('Settings without an edit control remain preserved');
    expect(html).not.toContain('Extra duty policy</label>');
  });
});


describe('draft version history actions', () => {
  const setup = (status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED', letters: string[]) => {
    frontDoorState.capabilities.systems = [{id:'sys-music',own:[{key:'config',letters}]}];
    loadStates.results = {'sched-config-versions|sys-music':{loading:false,failed:false,data:{versions:[{id:'v1',systemId:'sys-music',version:1,label:'Test setup',status}]},reload:()=>{}}};
  };
  it('offers archive/delete only on writable drafts', () => {
    setup('DRAFT',['R','W']);
    const html=renderPage('/s/sys-music/config?tab=versions&version=v1');
    expect(html).toContain('>Archive draft</button>'); expect(html).toContain('>Delete draft</button>');
    setup('ACTIVE',['R','W']);
    const active=renderPage('/s/sys-music/config?tab=versions&version=v1');
    expect(active).not.toContain('>Archive draft</button>'); expect(active).not.toContain('>Delete draft</button>');
    setup('DRAFT',['R']);
    const reader=renderPage('/s/sys-music/config?tab=versions&version=v1');
    expect(reader).not.toContain('>Archive draft</button>'); expect(reader).not.toContain('>Delete draft</button>');
  });
  it('shows archived versions as read-only with a restore action', () => {
    setup('ARCHIVED',['R','W']);
    const html=renderPage('/s/sys-music/config?tab=versions&version=v1');
    expect(html).toContain('Archived'); expect(html).toContain('>Restore draft</button>');
    expect(html).not.toContain('>Activate version</button>'); expect(html).not.toContain('>Delete draft</button>');
  });
});


it('opens an existing draft from the Choir register link', () => {
  frontDoorState.capabilities.systems=[{id:'sys-music',own:[{key:'config',letters:['R','W']}]}];
  loadStates.results={'sched-config-versions|sys-music':{loading:false,failed:false,data:{versions:[{id:'active',systemId:'sys-music',version:1,label:'Active setup',status:'ACTIVE'},{id:'draft',systemId:'sys-music',version:2,label:'Draft setup',status:'DRAFT'}]},reload:()=>{}}};
  expect(renderPage('/s/sys-music/config?tab=links&draft=1')).toContain('You are editing a draft.');
  expect(renderPage('/s/sys-music/config?tab=links&draft=1&version=active')).toContain('This active version is used');
});
