import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import request from 'supertest';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

let app: import('express').Express;
let S: any;
let L: any;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);

const LEADER = 'p-outsider';
const MUSIC_LEADER = 'p-choir-leader';
const PROTOCOL_LEADER = 'p-protocol-leader';
const TREASURER = 'p-treasurer';
const MEMBER = 'p-member';

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of [
    'orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference',
    'musicChoir', 'musicChoirMember', 'musicDraft', 'musicMonth', 'musicLog',
    'configVersion', 'schedulingService', 'choirCategory', 'categoryServicePolicy',
    'choirCategoryLink', 'protocolServiceRule', 'protocolDutyPolicy', 'protocolPlan',
  ]) db[k] ??= [];
  db.person.push({ id: PROTOCOL_LEADER, fullName: PROTOCOL_LEADER, status: 'ACTIVE', email: `${PROTOCOL_LEADER}@x.org`, phone: '0780000000' });
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.position.push({
    id: 'pos-pastor-main', personId: LEADER, systemId: 'sys-main',
    title: 'Senior Pastor', systemRole: 'CHURCH_LEADER', office: 'CHURCH_LEADER',
    grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2019-01-01'),
  });
  db.position.push({
    id: 'pos-music-pres', personId: MUSIC_LEADER, systemId: 'sys-music',
    title: 'Music President', ministryOffice: 'PRESIDENT', grantsAllSystems: false,
    status: 'ACTIVE', startDate: new Date('2021-01-01'),
  });
  db.position.push({
    id: 'pos-protocol-pres', personId: PROTOCOL_LEADER, systemId: 'sys-protocol',
    title: 'Protocol President', protocolOffice: 'PRESIDENT', grantsAllSystems: false,
    status: 'ACTIVE', startDate: new Date('2021-01-01'),
  });
  // Treasurer: church-wide office, SCHEDULING R in every system (read-only).
  db.position.push({
    id: 'pos-treas-main', personId: TREASURER, systemId: 'sys-finance',
    title: 'Church Treasurer', office: 'CHURCH_TREASURER', grantsAllSystems: false,
    status: 'ACTIVE', startDate: new Date('2019-01-01'),
  });
  db.membership.push(
    { id: 'mem-member-music', personId: MEMBER, systemId: 'sys-music', type: 'MINISTRY_MEMBER', label: 'Member', status: 'ACTIVE', startDate: new Date('2021-01-01') },
  );
  S = await import('../src/scheduling/store.js');
  L = await import('../src/scheduling/configLoader.js');
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

function configPath(systemId: string, path: string) {
  return `/api/scheduling/config${path}?systemId=${encodeURIComponent(systemId)}`;
}

const createVersion = (systemId: string, version: number, status: 'DRAFT' | 'ACTIVE' = 'DRAFT') =>
  S.createConfigVersion({ systemId, version, label: `${systemId} v${version}`, status, createdByPersonId: LEADER });

/* ─── Store-level: direct persistence + versioning ─── */

describe('scheduling config store — tenant scoping', () => {
  it('config versions are scoped to systemId', async () => {
    await S.createConfigVersion({ systemId: 'sys-music', version: 1, label: 'Music v1', createdByPersonId: LEADER });
    await S.createConfigVersion({ systemId: 'sys-protocol', version: 1, label: 'Protocol v1', createdByPersonId: LEADER });
    const music = await S.listConfigVersions('sys-music');
    const proto = await S.listConfigVersions('sys-protocol');
    expect(music).toHaveLength(1);
    expect(music[0].label).toBe('Music v1');
    expect(proto).toHaveLength(1);
    expect(proto[0].label).toBe('Protocol v1');
  });

  it('services are scoped to systemId', async () => {
    await S.createSchedulingService({ systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: LEADER });
    await S.createSchedulingService({ systemId: 'sys-protocol', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: LEADER });
    const music = await S.listSchedulingServices('sys-music');
    const proto = await S.listSchedulingServices('sys-protocol');
    expect(music).toHaveLength(1);
    expect(proto).toHaveLength(1);
  });

  it('get by code returns null when not found', async () => {
    expect(await S.getSchedulingServiceByCode('sys-music', 'nonexistent')).toBeNull();
    expect(await S.getChoirCategoryByCode('sys-music', 'nonexistent')).toBeNull();
  });
});

describe('scheduling config store — versioning / supersession', () => {
  it('supersedeConfigVersion sets effectiveTo and status', async () => {
    const v = await S.createConfigVersion({ systemId: 'sys-music', version: 1, label: 'v1', status: 'ACTIVE', createdByPersonId: LEADER });
    await S.supersedeConfigVersion(v.id, new Date('2026-01-15'));
    const row = await S.getConfigVersion(v.id);
    expect(row?.status).toBe('SUPERSEDED');
    expect(row?.effectiveTo).toBe('2026-01-15T00:00:00.000Z');
  });

  it('service supersession: retire marks inactive with effectiveTo', async () => {
    const svc = await S.createSchedulingService({ systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: LEADER });
    await S.supersedeSchedulingService(svc.id, new Date('2026-02-01'));
    const row = await S.getSchedulingServiceByCode('sys-music', 'ss1');
    expect(row?.active).toBe(false);
    expect(row?.effectiveTo).toBe('2026-02-01T00:00:00.000Z');
  });

  it('category policies: list policies for a category', async () => {
    const cat = await S.createChoirCategory({ systemId: 'sys-music', code: 'primary', name: 'Primary', createdByPersonId: LEADER });
    const svc = await S.createSchedulingService({ systemId: 'sys-music', code: 'ss1', name: 'SS1', createdByPersonId: LEADER });
    await S.createCategoryServicePolicy({
      systemId: 'sys-music', categoryId: cat.id, serviceId: svc.id, eligible: true, frequencyTarget: 1, createdByPersonId: LEADER,
    });
    const policies = await S.getPoliciesForCategory('sys-music', cat.id);
    expect(policies).toHaveLength(1);
    expect(policies[0].eligible).toBe(true);
  });

  it('choir category link: one link per choir per system', async () => {
    const cat = await S.createChoirCategory({ systemId: 'sys-music', code: 'primary', name: 'Primary', createdByPersonId: LEADER });
    const link = await S.createChoirCategoryLink({
      systemId: 'sys-music', choirId: 'choir-1', categoryId: cat.id, createdByPersonId: LEADER,
    });
    const byChoir = await S.getChoirCategoryLinkByChoir('sys-music', 'choir-1');
    expect(byChoir?.id).toBe(link.id);
  });

  it('protocol duty policy: one per system', async () => {
    const pol = await S.createProtocolDutyPolicy({ systemId: 'sys-protocol', preferTarget: 3, softMax: 3, hardMax: 4, createdByPersonId: LEADER });
    const bySystem = await S.getProtocolDutyPolicyBySystem('sys-protocol');
    expect(bySystem?.id).toBe(pol.id);
    expect(bySystem?.preferTarget).toBe(3);
    expect(bySystem?.hardMax).toBe(4);
  });

  it('protocol service rule: one per service per system', async () => {
    const svc = await S.createSchedulingService({ systemId: 'sys-protocol', code: 'tuesday', name: 'Tuesday', createdByPersonId: LEADER });
    const rule = await S.createProtocolServiceRule({
      systemId: 'sys-protocol', serviceId: svc.id, required: true, defaultTeamSize: 10, createdByPersonId: LEADER,
    });
    const byService = await S.getProtocolServiceRuleByService('sys-protocol', svc.id);
    expect(byService?.id).toBe(rule.id);
    expect(byService?.defaultTeamSize).toBe(10);
  });

  it('clones policy and link references to the new Music service and category rows', async () => {
    const active = await createVersion('sys-music', 1, 'ACTIVE');
    const service = await S.createSchedulingService({
      systemId: 'sys-music', code: 'ss1', name: 'Sunday', configVersionId: active.id, createdByPersonId: LEADER,
    });
    const category = await S.createChoirCategory({
      systemId: 'sys-music', code: 'primary', name: 'Primary', configVersionId: active.id, createdByPersonId: LEADER,
    });
    await S.createCategoryServicePolicy({
      systemId: 'sys-music', categoryId: category.id, serviceId: service.id, configVersionId: active.id, createdByPersonId: LEADER,
    });
    await S.createChoirCategoryLink({
      systemId: 'sys-music', choirId: 'choir-1', categoryId: category.id, configVersionId: active.id, createdByPersonId: LEADER,
    });

    const draft = await S.cloneActiveConfigVersion('sys-music', { label: 'draft', createdByPersonId: LEADER });
    const draftService = (await S.listSchedulingServices('sys-music', false, draft.id))[0];
    const draftCategory = (await S.listChoirCategories('sys-music', false, draft.id))[0];
    const draftPolicy = (await S.listCategoryServicePolicies('sys-music', draft.id))[0];
    const draftLink = (await S.listChoirCategoryLinks('sys-music', draft.id))[0];
    expect(draftService.id).not.toBe(service.id);
    expect(draftCategory.id).not.toBe(category.id);
    expect(draftPolicy).toMatchObject({ categoryId: draftCategory.id, serviceId: draftService.id });
    expect(draftLink.categoryId).toBe(draftCategory.id);
  });
});

describe('scheduling configuration loaders — version pinning', () => {
  it('loads Music rows from the requested immutable version, not the current active rows', async () => {
    const v1 = await createVersion('sys-music', 1, 'ACTIVE');
    const oldService = await S.createSchedulingService({
      systemId: 'sys-music', code: 'ss1', name: 'Old Sunday', weekday: 0, configVersionId: v1.id, createdByPersonId: LEADER,
    });
    await S.createChoirCategory({
      systemId: 'sys-music', code: 'PRIMARY', name: 'Old category', configVersionId: v1.id, createdByPersonId: LEADER,
    });
    const v2 = await createVersion('sys-music', 2);
    const newService = await S.createSchedulingService({
      systemId: 'sys-music', code: 'ss1', name: 'New Sunday', weekday: 1, configVersionId: v2.id, createdByPersonId: LEADER,
    });
    await S.createChoirCategory({
      systemId: 'sys-music', code: 'PRIMARY', name: 'New category', configVersionId: v2.id, createdByPersonId: LEADER,
    });
    await S.activateConfigVersion(v2.id, 'sys-music');

    const historical = await L.loadMusicConfig(v1.id);
    const current = await L.loadMusicConfig();
    expect(historical.services[0]).toMatchObject({ id: oldService.id, name: 'Old Sunday' });
    expect(historical.categories[0].name).toBe('Old category');
    expect(current.services[0]).toMatchObject({ id: newService.id, name: 'New Sunday' });
    expect(current.categories[0].name).toBe('New category');
  });

  it('keeps Protocol duty policy and service rules isolated to the selected Protocol version', async () => {
    const calendar = await createVersion('sys-music', 1, 'ACTIVE');
    const service = await S.createSchedulingService({
      systemId: 'sys-music', code: 'ss1', name: 'Sunday', configVersionId: calendar.id, createdByPersonId: LEADER,
    });
    const p1 = await createVersion('sys-protocol', 1, 'ACTIVE');
    const rule1 = await S.createProtocolServiceRule({
      systemId: 'sys-protocol', serviceId: service.id, configVersionId: p1.id, defaultTeamSize: 8, createdByPersonId: LEADER,
    });
    await S.createProtocolDutyPolicy({
      systemId: 'sys-protocol', configVersionId: p1.id, preferTarget: 2, softMax: 2, hardMax: 3, createdByPersonId: LEADER,
    });
    const p2 = await createVersion('sys-protocol', 2);
    await S.createProtocolServiceRule({
      systemId: 'sys-protocol', serviceId: service.id, configVersionId: p2.id, defaultTeamSize: 12, createdByPersonId: LEADER,
    });
    await S.createProtocolDutyPolicy({
      systemId: 'sys-protocol', configVersionId: p2.id, preferTarget: 4, softMax: 4, hardMax: 5, createdByPersonId: LEADER,
    });
    await S.activateConfigVersion(p2.id, 'sys-protocol');

    const historical = await L.loadProtocolConfig(p1.id, calendar.id);
    const current = await L.loadProtocolConfig(undefined, calendar.id);
    expect(historical.version.id).toBe(p1.id);
    expect(historical.rules[0]).toMatchObject({ id: rule1.id, defaultTeamSize: 8, serviceId: service.id });
    expect(historical.dutyPolicy?.preferTarget).toBe(2);
    expect(current.rules[0].defaultTeamSize).toBe(12);
    expect(current.dutyPolicy?.preferTarget).toBe(4);
    expect(await L.loadMusicConfig(calendar.id)).toMatchObject({ version: { id: calendar.id } });
  });
});

/* ─── Route-level: authorization ─── */

describe('scheduling config routes — authorization', () => {
  it('church leader (CHURCH_LEADER) can read config in any system', async () => {
    const r = await get(LEADER, configPath('sys-music', '/versions'));
    expect(r.status).toBe(200);
  });

  it('music president can read and write config in sys-music', async () => {
    const version = await createVersion('sys-music', 1);
    const r = await post(MUSIC_LEADER, configPath('sys-music', '/services'), {
      systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', configVersionId: version.id,
    });
    expect(r.status).toBe(201);
    expect(r.body.service).toBeTruthy();
    const saved = await S.getSchedulingServiceByCodeInVersion('sys-music', 'ss1', version.id);
    expect(saved?.createdByPersonId).toBe(MUSIC_LEADER);
  });

  it('music president cannot write config in sys-protocol (wrong tenant)', async () => {
    const r = await post(MUSIC_LEADER, configPath('sys-protocol', '/services'), {
      systemId: 'sys-protocol', code: 'ss1', name: 'Sunday Service 1', configVersionId: 'v1', createdByPersonId: MUSIC_LEADER,
    });
    expect(r.status).toBe(403);
  });

  it('church leader can read but not write config (SCHEDULING R only, church-wide reach)', async () => {
    const read = await get(LEADER, configPath('sys-music', '/versions'));
    expect(read.status).toBe(200);
    const write = await post(LEADER, configPath('sys-music', '/services'), {
      systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: LEADER,
    });
    expect(write.status).toBe(403);
  });

  it('missing systemId returns 400', async () => {
    const r = await get(LEADER, '/api/scheduling/config/versions?systemId=');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BAD_INPUT');
  });

  it('unknown person gets 401', async () => {
    const r = await get('nobody', configPath('sys-music', '/versions'));
    expect(r.status).toBe(401);
  });
});

/* ─── Route-level: idempotency ─── */

describe('scheduling config routes — idempotency', () => {
  it('creating the same service twice returns the existing id (EXISTS status)', async () => {
    const version = await createVersion('sys-music', 1);
    const body = { systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', configVersionId: version.id, createdByPersonId: MUSIC_LEADER };
    const r1 = await post(MUSIC_LEADER, configPath('sys-music', '/services'), body);
    expect(r1.status).toBe(201);
    const id1 = r1.body.service;
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/services'), body);
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('EXISTS');
    expect(r2.body.service).toBe(id1);
    const all = await S.listSchedulingServices('sys-music');
    expect(all).toHaveLength(1);
  });

  it('creating the same config version twice returns EXISTS', async () => {
    const body = { systemId: 'sys-music', version: 1, label: 'v1', createdByPersonId: MUSIC_LEADER };
    const r1 = await post(MUSIC_LEADER, configPath('sys-music', '/versions'), body);
    expect(r1.status).toBe(201);
    const id1 = r1.body.version;
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/versions'), body);
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('EXISTS');
    expect(r2.body.version).toBe(id1);
  });

  it('creating the same category twice returns EXISTS', async () => {
    const version = await createVersion('sys-music', 1);
    const body = { systemId: 'sys-music', code: 'primary', name: 'Primary Choir', configVersionId: version.id, createdByPersonId: MUSIC_LEADER };
    const r1 = await post(MUSIC_LEADER, configPath('sys-music', '/categories'), body);
    expect(r1.status).toBe(201);
    const id1 = r1.body.category;
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/categories'), body);
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('EXISTS');
    expect(r2.body.category).toBe(id1);
  });

  it('creating the same policy twice returns EXISTS', async () => {
    const version = await createVersion('sys-music', 1);
    await post(MUSIC_LEADER, configPath('sys-music', '/categories'), {
      systemId: 'sys-music', code: 'primary', name: 'Primary Choir', configVersionId: version.id, createdByPersonId: MUSIC_LEADER,
    });
    await post(MUSIC_LEADER, configPath('sys-music', '/services'), {
      systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', configVersionId: version.id, createdByPersonId: MUSIC_LEADER,
    });
    const cats = await S.listChoirCategories('sys-music', false, version.id);
    const svcs = await S.listSchedulingServices('sys-music', false, version.id);
    const catId = cats[0].id;
    const svcId = svcs[0].id;
    const body = { systemId: 'sys-music', categoryId: catId, serviceId: svcId, configVersionId: version.id, eligible: true, frequencyTarget: 1, createdByPersonId: MUSIC_LEADER };
    const r1 = await post(MUSIC_LEADER, configPath('sys-music', '/policies'), body);
    expect(r1.status).toBe(201);
    const id1 = r1.body.policy;
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/policies'), body);
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('EXISTS');
    expect(r2.body.policy).toBe(id1);
  });
});

describe('scheduling config routes — draft row editing', () => {
  it('creates editor rows with creator identity taken from the authenticated actor', async () => {
    const musicDraftResponse = await post(MUSIC_LEADER, configPath('sys-music', '/versions'), {
      systemId: 'sys-music', version: 1, label: 'Music draft',
    });
    expect(musicDraftResponse.status).toBe(201);
    const musicVersionId = musicDraftResponse.body.version as string;
    const serviceResponse = await post(MUSIC_LEADER, configPath('sys-music', '/services'), {
      systemId: 'sys-music', configVersionId: musicVersionId, code: 'ss1', name: 'Sunday',
    });
    expect(serviceResponse.status).toBe(201);
    const categoryResponse = await post(MUSIC_LEADER, configPath('sys-music', '/categories'), {
      systemId: 'sys-music', configVersionId: musicVersionId, code: 'primary', name: 'Primary',
    });
    expect(categoryResponse.status).toBe(201);

    const policyResponse = await post(MUSIC_LEADER, configPath('sys-music', '/policies'), {
      systemId: 'sys-music', configVersionId: musicVersionId,
      categoryId: categoryResponse.body.category, serviceId: serviceResponse.body.service,
    });
    expect(policyResponse.status).toBe(201);
    fake.__db.musicChoir.push({ id: 'choir-1', name: 'Choir One', role: 'PRIMARY', systemId: 'sys-choir', active: true, createdById: MUSIC_LEADER });
    const linkResponse = await post(MUSIC_LEADER, configPath('sys-music', '/links'), {
      systemId: 'sys-music', configVersionId: musicVersionId, choirId: 'choir-1',
      categoryId: categoryResponse.body.category,
    });
    expect(linkResponse.status).toBe(201);
    const storedService = await S.getSchedulingServiceByCodeInVersion('sys-music', 'ss1', musicVersionId);
    expect(storedService?.createdByPersonId).toBe(MUSIC_LEADER);

    const calendarVersion = await createVersion('sys-music', 2, 'ACTIVE');
    const calendarService = await S.createSchedulingService({
      systemId: 'sys-music', configVersionId: calendarVersion.id, code: 'sun', name: 'Sunday', createdByPersonId: LEADER,
    });
    const protocolVersionResponse = await post(PROTOCOL_LEADER, configPath('sys-protocol', '/versions'), {
      systemId: 'sys-protocol', version: 1, label: 'Protocol draft',
    });
    expect(protocolVersionResponse.status).toBe(201);
    const protocolVersionId = protocolVersionResponse.body.version as string;
    const ruleResponse = await post(PROTOCOL_LEADER, configPath('sys-protocol', '/protocol/rules'), {
      systemId: 'sys-protocol', configVersionId: protocolVersionId, serviceId: calendarService.id,
    });
    expect(ruleResponse.status).toBe(201);
    const dutyResponse = await post(PROTOCOL_LEADER, configPath('sys-protocol', '/protocol/policy'), {
      systemId: 'sys-protocol', configVersionId: protocolVersionId,
    });
    expect(dutyResponse.status).toBe(201);
  });

  it('creates and edits every row type only within its selected draft', async () => {
    const musicActive = await createVersion('sys-music', 1, 'ACTIVE');
    const calendarService = await S.createSchedulingService({
      systemId: 'sys-music', code: 'ss1', name: 'Sunday', configVersionId: musicActive.id, createdByPersonId: LEADER,
    });
    const category = await S.createChoirCategory({
      systemId: 'sys-music', code: 'primary', name: 'Primary', configVersionId: musicActive.id, createdByPersonId: LEADER,
    });
    const musicDraft = await S.cloneActiveConfigVersion('sys-music', { label: 'Music draft', createdByPersonId: LEADER });
    const draftService = (await S.listSchedulingServices('sys-music', false, musicDraft.id))[0];
    const draftCategory = (await S.listChoirCategories('sys-music', false, musicDraft.id))[0];
    const servicePatch = await request(app).patch(`/api/scheduling/config/services/${draftService.id}`).set(bearer(MUSIC_LEADER))
      .send({ configVersionId: musicDraft.id, patch: { name: 'Sunday Gathering', active: true } });
    expect(servicePatch.status).toBe(200);
    expect(servicePatch.body.service.name).toBe('Sunday Gathering');
    const categoryPatch = await request(app).patch(`/api/scheduling/config/categories/${draftCategory.id}`).set(bearer(MUSIC_LEADER))
      .send({ configVersionId: musicDraft.id, patch: { name: 'Primary Choir' } });
    expect(categoryPatch.status).toBe(200);
    expect(categoryPatch.body.category.name).toBe('Primary Choir');

    const policyCreate = await post(MUSIC_LEADER, configPath('sys-music', '/policies'), {
      systemId: 'sys-music', configVersionId: musicDraft.id, categoryId: draftCategory.id, serviceId: draftService.id,
      eligible: true, planningMode: 'FIXED', createdByPersonId: MUSIC_LEADER,
    });
    expect(policyCreate.status).toBe(201);
    const policyPatch = await request(app).patch(`/api/scheduling/config/policies/${policyCreate.body.policy}`).set(bearer(MUSIC_LEADER))
      .send({ configVersionId: musicDraft.id, patch: { planningMode: 'MANUAL', frequencyTarget: 2 } });
    expect(policyPatch.status).toBe(200);
    expect(policyPatch.body.policy).toMatchObject({ planningMode: 'MANUAL', frequencyTarget: 2 });

    fake.__db.musicChoir.push({ id: 'choir-1', name: 'Choir One', role: 'PRIMARY', systemId: 'sys-choir', active: true, createdById: LEADER });
    const linkCreate = await post(MUSIC_LEADER, configPath('sys-music', '/links'), {
      systemId: 'sys-music', configVersionId: musicDraft.id, choirId: 'choir-1', categoryId: draftCategory.id,
      eligibleOverride: {}, frequencyOverride: {}, createdByPersonId: MUSIC_LEADER,
    });
    expect(linkCreate.status).toBe(201);
    const linkPatch = await request(app).patch(`/api/scheduling/config/links/${linkCreate.body.link}`).set(bearer(MUSIC_LEADER))
      .send({ configVersionId: musicDraft.id, patch: { eligibleOverride: { ss1: false } } });
    expect(linkPatch.status).toBe(200);
    expect(linkPatch.body.link.eligibleOverride).toEqual({ ss1: false });

    const protocolActive = await createVersion('sys-protocol', 1, 'ACTIVE');
    const protocolRule = await S.createProtocolServiceRule({
      systemId: 'sys-protocol', serviceId: calendarService.id, configVersionId: protocolActive.id, createdByPersonId: LEADER,
    });
    await S.createProtocolDutyPolicy({
      systemId: 'sys-protocol', configVersionId: protocolActive.id, createdByPersonId: LEADER,
    });
    const protocolDraft = await S.cloneActiveConfigVersion('sys-protocol', { label: 'Protocol draft', createdByPersonId: LEADER });
    const draftRule = (await S.listProtocolServiceRules('sys-protocol', protocolDraft.id))[0];
    const rulePatch = await request(app).patch(`/api/scheduling/config/protocol/rules/${draftRule.id}`).set(bearer(PROTOCOL_LEADER))
      .send({ configVersionId: protocolDraft.id, patch: { defaultTeamSize: 12, required: true } });
    expect(rulePatch.status).toBe(200);
    expect(rulePatch.body.rule).toMatchObject({ defaultTeamSize: 12, required: true });

    const duty = await S.getProtocolDutyPolicyBySystem('sys-protocol', protocolDraft.id);
    const dutyPatch = await request(app).patch(`/api/scheduling/config/protocol/policy/${duty!.id}`).set(bearer(PROTOCOL_LEADER))
      .send({ configVersionId: protocolDraft.id, patch: { preferTarget: 2, softMax: 3, hardMax: 4 } });
    expect(dutyPatch.status).toBe(200);
    expect(dutyPatch.body.policy.preferTarget).toBe(2);
    expect(protocolRule.configVersionId).toBe(protocolActive.id);
    expect((await S.getSchedulingServiceByCodeInVersion('sys-music', 'ss1', musicActive.id))?.name).toBe('Sunday');
    expect(category.id).not.toBe(draftCategory.id);
  });

  it('rejects edits to an active row and cross-system draft references', async () => {
    const active = await createVersion('sys-music', 1, 'ACTIVE');
    const service = await S.createSchedulingService({
      systemId: 'sys-music', code: 'ss1', name: 'Sunday', configVersionId: active.id, createdByPersonId: LEADER,
    });
    const immutable = await request(app).patch(`/api/scheduling/config/services/${service.id}`).set(bearer(MUSIC_LEADER))
      .send({ configVersionId: active.id, patch: { name: 'Changed' } });
    expect(immutable.status).toBe(409);
    expect(immutable.body.code).toBe('CONFIG_VERSION_NOT_DRAFT');

    const draft = await createVersion('sys-music', 2);
    const crossSystemCategory = await S.createChoirCategory({
      systemId: 'sys-music', code: 'foreign', name: 'Foreign', configVersionId: active.id, createdByPersonId: LEADER,
    });
    const invalid = await post(MUSIC_LEADER, configPath('sys-music', '/policies'), {
      systemId: 'sys-music', configVersionId: draft.id, categoryId: crossSystemCategory.id, serviceId: service.id,
      createdByPersonId: MUSIC_LEADER,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('CONFIG_REFERENCE');
  });
});

/* ─── Route-level: effective dates / status / supersession ─── */

describe('scheduling config routes — version lifecycle', () => {
  it('activating a draft supersedes the active version atomically', async () => {
    const v1 = await createVersion('sys-music', 1, 'ACTIVE');
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/versions/clone'), {
      systemId: 'sys-music', label: 'v2',
    });
    expect(r2.status).toBe(201);
    const draftId = r2.body.version.id;
    const activated = await post(MUSIC_LEADER, `/api/scheduling/config/versions/${draftId}/activate`);
    expect(activated.status).toBe(200);
    const active = await S.getActiveConfigVersion('sys-music');
    expect(active?.version).toBe(2);
    expect(active?.status).toBe('ACTIVE');
    const all = await S.listConfigVersions('sys-music');
    const v1row = await S.getConfigVersion(v1.id);
    expect(v1row?.status).toBe('SUPERSEDED');
    expect(all.find((v: any) => v.id === draftId)?.status).toBe('ACTIVE');
  });

  it('retiring a service creates and activates a new version without changing the prior snapshot', async () => {
    const activeVersion = await createVersion('sys-music', 1, 'ACTIVE');
    const created = await S.createSchedulingService({
      systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', configVersionId: activeVersion.id, createdByPersonId: MUSIC_LEADER,
    });
    const svc = created;
    const r = await post(MUSIC_LEADER, `/api/scheduling/config/services/${svc.id}/retire`, {});
    expect(r.status).toBe(200);
    const active = await S.getActiveConfigVersion('sys-music');
    expect(active?.id).not.toBe(activeVersion.id);
    const row = await S.getSchedulingServiceByCodeInVersion('sys-music', 'ss1', active!.id);
    expect(row?.active).toBe(false);
    expect(row?.effectiveTo).not.toBeNull();
    expect((await S.getSchedulingServiceByCodeInVersion('sys-music', 'ss1', activeVersion.id))?.active).toBe(true);
  });

  it('config version stores notes/validation/affectedSchedules as JSON', async () => {
    const r = await post(MUSIC_LEADER, configPath('sys-music', '/versions'), {
      systemId: 'sys-music', version: 1, label: 'v1', status: 'DRAFT',
      notes: { source: 'legacy', slice: '3.17' }, validation: { checks: [] }, affectedSchedules: [],
    });
    expect(r.status).toBe(201);
    const v = await S.getConfigVersion(r.body.version);
    expect(v?.notes).toMatchObject({ source: 'legacy', slice: '3.17' });
    expect(v?.affectedSchedules).toEqual([]);
  });
});

/* ─── MusicMonth / ProtocolPlan configVersionId reference ─── */

describe('scheduling config — MusicMonth and ProtocolPlan reference', () => {
  it('MusicMonth can store configVersionId', async () => {
    const v = await S.createConfigVersion({ systemId: 'sys-music', version: 1, label: 'v1', status: 'ACTIVE', createdByPersonId: LEADER });
    const store = fake.__db.musicMonth;
    store.push({ id: 'mm-1', periodKey: '2026-10', state: 'PUBLISHED', version: 1,
      servicesJson: '[]', assignmentsJson: '[]', warningsJson: '[]',
      configVersionId: v.id, createdById: LEADER, createdAt: new Date(), updatedAt: new Date() });
    const row = store.find((r: any) => r.id === 'mm-1');
    expect(row.configVersionId).toBe(v.id);
  });

  it('ProtocolPlan can store configVersionId', async () => {
    const v = await S.createConfigVersion({ systemId: 'sys-protocol', version: 1, label: 'v1', status: 'ACTIVE', createdByPersonId: LEADER });
    const store = fake.__db.protocolPlan;
    store.push({ id: 'pp-1', monthKey: '2026-10', status: 'PUBLISHED', version: 1,
      notesJson: '{}', overridesJson: '[]', relaxTuesday: false,
      configVersionId: v.id, createdById: LEADER, createdAt: new Date(), updatedAt: new Date() });
    const row = store.find((r: any) => r.id === 'pp-1');
    expect(row.configVersionId).toBe(v.id);
  });

  it('configVersionId is nullable — existing rows without it still work', async () => {
    const store = fake.__db.musicMonth;
    store.push({ id: 'mm-2', periodKey: '2026-11', state: 'CONFIRMED', version: 1,
      servicesJson: '[]', assignmentsJson: '[]', warningsJson: '[]',
      configVersionId: null, createdById: LEADER, createdAt: new Date(), updatedAt: new Date() });
    const row = store.find((r: any) => r.id === 'mm-2');
    expect(row.configVersionId).toBeNull();
  });
});
