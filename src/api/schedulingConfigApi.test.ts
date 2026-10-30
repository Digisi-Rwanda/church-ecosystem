import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(async () => ({})),
}));

import { apiFetch } from './client';
import {
  createCategoryServicePolicy,
  createChoirCategory,
  createChoirCategoryLink,
  createConfigVersion,
  createProtocolDutyPolicy,
  createProtocolServiceRule,
  createSchedulingService,
  fetchCategoryServicePolicies,
  fetchChoirCategories,
  fetchChoirCategoryLinks,
  fetchConfigVersions,
  fetchProtocolDutyPolicy,
  fetchProtocolServiceRules,
  fetchSchedulingServices,
  retireSchedulingService,
} from './frontDoorApi';

describe('scheduling configuration API paths', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear());

  it('uses the registered GET endpoints for all seven configuration sections', async () => {
    await fetchConfigVersions('sys-music');
    await fetchSchedulingServices('sys-music');
    await fetchChoirCategories('sys-music');
    await fetchCategoryServicePolicies('sys-music');
    await fetchChoirCategoryLinks('sys-music');
    await fetchProtocolServiceRules('sys-music');
    await fetchProtocolDutyPolicy('sys-music');

    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      '/api/scheduling/config/versions?systemId=sys-music',
      '/api/scheduling/config/services?systemId=sys-music',
      '/api/scheduling/config/categories?systemId=sys-music',
      '/api/scheduling/config/policies?systemId=sys-music',
      '/api/scheduling/config/links?systemId=sys-music',
      '/api/scheduling/config/protocol/rules?systemId=sys-music',
      '/api/scheduling/config/protocol/policy?systemId=sys-music',
    ]);
  });

  it('combines optional active-only filters with the system query parameter', async () => {
    await fetchSchedulingServices('sys-music', true);
    await fetchChoirCategories('sys-music', true);

    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      '/api/scheduling/config/services?systemId=sys-music&active=true',
      '/api/scheduling/config/categories?systemId=sys-music&active=true',
    ]);
  });

  it('uses the registered POST endpoints for configuration writes', async () => {
    const body = { systemId: 'sys-music' };
    await createConfigVersion(body);
    await createSchedulingService(body);
    await createChoirCategory(body);
    await createCategoryServicePolicy(body);
    await createChoirCategoryLink(body);
    await createProtocolServiceRule(body);
    await createProtocolDutyPolicy(body);
    await retireSchedulingService('service/id');

    expect(vi.mocked(apiFetch).mock.calls).toEqual([
      ['/api/scheduling/config/versions', { method: 'POST', body }],
      ['/api/scheduling/config/services', { method: 'POST', body }],
      ['/api/scheduling/config/categories', { method: 'POST', body }],
      ['/api/scheduling/config/policies', { method: 'POST', body }],
      ['/api/scheduling/config/links', { method: 'POST', body }],
      ['/api/scheduling/config/protocol/rules', { method: 'POST', body }],
      ['/api/scheduling/config/protocol/policy', { method: 'POST', body }],
      ['/api/scheduling/config/services/service%2Fid/retire', { method: 'POST', body: {} }],
    ]);
  });
});
