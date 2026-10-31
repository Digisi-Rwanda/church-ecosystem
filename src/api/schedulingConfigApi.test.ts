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
  updateCategoryServicePolicy,
  updateChoirCategory,
  updateChoirCategoryLink,
  updateProtocolDutyPolicy,
  updateProtocolServiceRule,
  updateSchedulingService,
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

  it('passes the selected configuration version through every row-list request', async () => {
    await fetchSchedulingServices('sys-music', false, 'music-draft');
    await fetchChoirCategories('sys-music', false, 'music-draft');
    await fetchCategoryServicePolicies('sys-music', 'music-draft');
    await fetchChoirCategoryLinks('sys-music', 'music-draft');
    await fetchProtocolServiceRules('sys-protocol', 'protocol-draft');
    await fetchProtocolDutyPolicy('sys-protocol', 'protocol-draft');

    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      '/api/scheduling/config/services?systemId=sys-music&configVersionId=music-draft',
      '/api/scheduling/config/categories?systemId=sys-music&configVersionId=music-draft',
      '/api/scheduling/config/policies?systemId=sys-music&configVersionId=music-draft',
      '/api/scheduling/config/links?systemId=sys-music&configVersionId=music-draft',
      '/api/scheduling/config/protocol/rules?systemId=sys-protocol&configVersionId=protocol-draft',
      '/api/scheduling/config/protocol/policy?systemId=sys-protocol&configVersionId=protocol-draft',
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

  it('sends draft-scoped PATCH requests for every editable row type', async () => {
    const versionId = 'draft-1';
    const patch = { active: false };
    await updateSchedulingService('service/1', versionId, patch);
    await updateChoirCategory('category/1', versionId, patch);
    await updateCategoryServicePolicy('policy/1', versionId, patch);
    await updateChoirCategoryLink('link/1', versionId, patch);
    await updateProtocolServiceRule('rule/1', versionId, patch);
    await updateProtocolDutyPolicy('duty/1', versionId, patch);

    expect(vi.mocked(apiFetch).mock.calls).toEqual([
      ['/api/scheduling/config/services/service%2F1', { method: 'PATCH', body: { configVersionId: versionId, patch } }],
      ['/api/scheduling/config/categories/category%2F1', { method: 'PATCH', body: { configVersionId: versionId, patch } }],
      ['/api/scheduling/config/policies/policy%2F1', { method: 'PATCH', body: { configVersionId: versionId, patch } }],
      ['/api/scheduling/config/links/link%2F1', { method: 'PATCH', body: { configVersionId: versionId, patch } }],
      ['/api/scheduling/config/protocol/rules/rule%2F1', { method: 'PATCH', body: { configVersionId: versionId, patch } }],
      ['/api/scheduling/config/protocol/policy/duty%2F1', { method: 'PATCH', body: { configVersionId: versionId, patch } }],
    ]);
  });
});
