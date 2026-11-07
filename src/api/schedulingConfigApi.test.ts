import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(async () => ({})),
}));

import { apiFetch } from './client';
import {
  acquireConfigLock,
  createChoirCategory,
  createMusicRule,
  createProtocolDutyPolicy,
  createProtocolServiceRule,
  createSchedulingService,
  deleteMusicRule,
  fetchChoirCategories,
  fetchConfigChoirs,
  fetchConfigValidation,
  fetchMusicRules,
  fetchProtocolDutyPolicy,
  fetchProtocolServiceRules,
  fetchSchedulingServices,
  releaseConfigLock,
  retireSchedulingService,
  setChoirCategory,
  updateChoirCategory,
  updateMusicRule,
  updateProtocolDutyPolicy,
  updateProtocolServiceRule,
  updateSchedulingService,
} from './frontDoorApi';

const SC = '/api/scheduling/config';

describe('scheduling configuration API paths (live configuration, no versions)', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear());

  it('reads every section from the registered endpoints', async () => {
    await fetchSchedulingServices('sys-music');
    await fetchChoirCategories('sys-music');
    await fetchMusicRules();
    await fetchConfigChoirs();
    await fetchProtocolServiceRules('sys-protocol');
    await fetchProtocolDutyPolicy('sys-protocol');
    await fetchConfigValidation('sys-music');
    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      `${SC}/services?systemId=sys-music`,
      `${SC}/categories?systemId=sys-music`,
      `${SC}/rules?systemId=sys-music`,
      `${SC}/choirs?systemId=sys-music`,
      `${SC}/protocol/rules?systemId=sys-protocol`,
      `${SC}/protocol/policy?systemId=sys-protocol`,
      `${SC}/validation?systemId=sys-music`,
    ]);
  });

  it('combines optional active-only filters with the system query parameter', async () => {
    await fetchSchedulingServices('sys-music', true);
    await fetchChoirCategories('sys-music', true);
    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      `${SC}/services?systemId=sys-music&active=true`,
      `${SC}/categories?systemId=sys-music&active=true`,
    ]);
  });

  it('never sends a configuration version', async () => {
    await fetchSchedulingServices('sys-music');
    await updateSchedulingService('service/1', { active: false });
    const calls = JSON.stringify(vi.mocked(apiFetch).mock.calls);
    expect(calls).not.toContain('configVersionId');
    expect(calls).not.toContain('versions');
  });

  it('uses the registered POST endpoints for configuration writes', async () => {
    const body = { systemId: 'sys-music' };
    await createSchedulingService(body);
    await createChoirCategory(body);
    await createProtocolServiceRule(body);
    await createProtocolDutyPolicy(body);
    await retireSchedulingService('service/id');
    expect(vi.mocked(apiFetch).mock.calls).toEqual([
      [`${SC}/services`, { method: 'POST', body }],
      [`${SC}/categories`, { method: 'POST', body }],
      [`${SC}/protocol/rules`, { method: 'POST', body }],
      [`${SC}/protocol/policy`, { method: 'POST', body }],
      [`${SC}/services/service%2Fid/retire`, { method: 'POST', body: {} }],
    ]);
  });

  it('sends PATCH requests with just the patch', async () => {
    const patch = { active: false };
    await updateSchedulingService('service/1', patch);
    await updateChoirCategory('category/1', patch);
    await updateProtocolServiceRule('rule/1', patch);
    await updateProtocolDutyPolicy('duty/1', patch);
    expect(vi.mocked(apiFetch).mock.calls).toEqual([
      [`${SC}/services/service%2F1`, { method: 'PATCH', body: { patch } }],
      [`${SC}/categories/category%2F1`, { method: 'PATCH', body: { patch } }],
      [`${SC}/protocol/rules/rule%2F1`, { method: 'PATCH', body: { patch } }],
      [`${SC}/protocol/policy/duty%2F1`, { method: 'PATCH', body: { patch } }],
    ]);
  });

  it('writes Rules and a choir\'s category through the Rule endpoints', async () => {
    const rule = { scope: ['s1'], target: { kind: 'category' as const, categoryId: 'c1' }, arrangement: 'ROTATION' as const };
    await createMusicRule(rule);
    await updateMusicRule('cat~p1~p2', { maxCount: 1 });
    await deleteMusicRule('cat~p1~p2');
    await setChoirCategory('choir/1', 'c1');
    expect(vi.mocked(apiFetch).mock.calls).toEqual([
      [`${SC}/rules`, { method: 'POST', body: rule }],
      [`${SC}/rules/cat~p1~p2`, { method: 'PATCH', body: { patch: { maxCount: 1 } } }],
      [`${SC}/rules/cat~p1~p2`, { method: 'DELETE' }],
      [`${SC}/choirs/choir%2F1/category`, { method: 'PUT', body: { categoryId: 'c1' } }],
    ]);
  });

  it('takes and gives back the edit lock', async () => {
    await acquireConfigLock('sys-music');
    await releaseConfigLock('sys-music');
    expect(vi.mocked(apiFetch).mock.calls.map(([path, init]) => [path, (init as { method?: string }).method])).toEqual([
      [`${SC}/lock?systemId=sys-music`, 'POST'],
      [`${SC}/lock?systemId=sys-music`, 'DELETE'],
    ]);
  });
});
