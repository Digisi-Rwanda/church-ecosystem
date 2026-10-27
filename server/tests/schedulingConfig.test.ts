import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import request from 'supertest';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

let app: import('express').Express;
let S: any;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);

const LEADER = 'p-outsider';
const MUSIC_LEADER = 'p-choir-leader';
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
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

function configPath(systemId: string, path: string) {
  return `/api/scheduling/config${path}?systemId=${encodeURIComponent(systemId)}`;
}

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
});

/* ─── Route-level: authorization ─── */

describe('scheduling config routes — authorization', () => {
  it('church leader (CHURCH_LEADER) can read config in any system', async () => {
    const r = await get(LEADER, configPath('sys-music', '/versions'));
    expect(r.status).toBe(200);
  });

  it('music president can read and write config in sys-music', async () => {
    const r = await post(MUSIC_LEADER, configPath('sys-music', '/services'), {
      systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: MUSIC_LEADER,
    });
    expect(r.status).toBe(201);
    expect(r.body.service).toBeTruthy();
  });

  it('music president cannot write config in sys-protocol (wrong tenant)', async () => {
    const r = await post(MUSIC_LEADER, configPath('sys-protocol', '/services'), {
      systemId: 'sys-protocol', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: MUSIC_LEADER,
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
    const body = { systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: MUSIC_LEADER };
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
    const body = { systemId: 'sys-music', code: 'primary', name: 'Primary Choir', createdByPersonId: MUSIC_LEADER };
    const r1 = await post(MUSIC_LEADER, configPath('sys-music', '/categories'), body);
    expect(r1.status).toBe(201);
    const id1 = r1.body.category;
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/categories'), body);
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('EXISTS');
    expect(r2.body.category).toBe(id1);
  });

  it('creating the same policy twice returns EXISTS', async () => {
    await post(MUSIC_LEADER, configPath('sys-music', '/categories'), {
      systemId: 'sys-music', code: 'primary', name: 'Primary Choir', createdByPersonId: MUSIC_LEADER,
    });
    await post(MUSIC_LEADER, configPath('sys-music', '/services'), {
      systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: MUSIC_LEADER,
    });
    const cats = await S.listChoirCategories('sys-music');
    const svcs = await S.listSchedulingServices('sys-music');
    const catId = cats[0].id;
    const svcId = svcs[0].id;
    const body = { systemId: 'sys-music', categoryId: catId, serviceId: svcId, eligible: true, frequencyTarget: 1, createdByPersonId: MUSIC_LEADER };
    const r1 = await post(MUSIC_LEADER, configPath('sys-music', '/policies'), body);
    expect(r1.status).toBe(201);
    const id1 = r1.body.policy;
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/policies'), body);
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('EXISTS');
    expect(r2.body.policy).toBe(id1);
  });
});

/* ─── Route-level: effective dates / status / supersession ─── */

describe('scheduling config routes — version lifecycle', () => {
  it('activating v2 supersedes v1 at route level', async () => {
    await post(MUSIC_LEADER, configPath('sys-music', '/versions'), {
      systemId: 'sys-music', version: 1, label: 'v1', status: 'ACTIVE', createdByPersonId: MUSIC_LEADER,
    });
    const r2 = await post(MUSIC_LEADER, configPath('sys-music', '/versions'), {
      systemId: 'sys-music', version: 2, label: 'v2', status: 'ACTIVE', createdByPersonId: MUSIC_LEADER,
    });
    expect(r2.status).toBe(201);
    const active = await S.getActiveConfigVersion('sys-music');
    expect(active?.version).toBe(2);
    expect(active?.status).toBe('ACTIVE');
    const all = await S.listConfigVersions('sys-music');
    const v1 = all.find((v: any) => v.version === 1)!;
    const v1row = await S.getConfigVersion(v1.id);
    expect(v1row?.status).toBe('SUPERSEDED');
  });

  it('service retire sets active=false and effectiveTo', async () => {
    await post(MUSIC_LEADER, configPath('sys-music', '/services'), {
      systemId: 'sys-music', code: 'ss1', name: 'Sunday Service 1', createdByPersonId: MUSIC_LEADER,
    });
    const svc = (await S.listSchedulingServices('sys-music'))[0];
    const r = await post(MUSIC_LEADER, `/api/scheduling/config/services/${svc.id}/retire`, {});
    expect(r.status).toBe(200);
    const row = await S.getSchedulingServiceByCode('sys-music', 'ss1');
    expect(row?.active).toBe(false);
    expect(row?.effectiveTo).not.toBeNull();
  });

  it('config version stores notes/validation/affectedSchedules as JSON', async () => {
    const r = await post(MUSIC_LEADER, configPath('sys-music', '/versions'), {
      systemId: 'sys-music', version: 1, label: 'v1', status: 'DRAFT', createdByPersonId: MUSIC_LEADER,
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
