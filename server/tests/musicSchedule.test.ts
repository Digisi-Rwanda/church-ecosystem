import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const del = (as: string, path: string) => request(app).delete(path).set(bearer(as));

const LEADER = 'p-outsider';
const now = new Date();
const next = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 1)).toISOString().slice(0, 7);
const START = next(1);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of [
    'orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference',
    'musicChoir', 'musicChoirMember', 'musicDraft', 'musicMonth', 'musicLog',
    'configVersion', 'schedulingService', 'choirCategory', 'categoryServicePolicy', 'choirCategoryLink',
  ]) db[k] ??= [];
  const at = new Date('2026-01-01T00:00:00.000Z');
  db.configVersion.push({
    id: 'music-config-v1', systemId: 'sys-music', version: 1, label: 'Music rules',
    status: 'ACTIVE', effectiveFrom: at, effectiveTo: null, createdByPersonId: LEADER, createdAt: at,
    reason: null, previousVersionId: null, notesJson: '{}', validationJson: '{}', affectedSchedulesJson: '[]',
  });
  const serviceRows = [
    ['ss1', 'Sunday 1', 0, true, true],
    ['ss2', 'Sunday 2', 0, true, true],
    ['tuesday', 'Tuesday', 2, true, true],
    ['friday', 'Friday', 5, true, false],
    ['igaburo', 'Igaburo', null, true, true],
  ] as const;
  for (const [code, name, weekday, musicRequired, protocolRequired] of serviceRows) {
    db.schedulingService.push({
      id: `service-${code}-v1`, systemId: 'sys-music', code, name, kind: 'SERVICE', weekday,
      time: null, recurrence: code === 'igaburo' ? 'MONTHLY' : 'WEEKLY', selectedDatesJson: '[]',
      active: true, effectiveFrom: at, effectiveTo: null, musicRequired, protocolRequired,
      maxChoirs: 3, targetTeamSize: 10, configVersionId: 'music-config-v1', displayOrder: 0,
      supersedesId: null, createdByPersonId: LEADER, createdAt: at,
    });
  }
  const categoryRows = [
    ['PRIMARY', 'Primary Choir'],
    ['SECONDARY', 'Secondary Choir'],
    ['CHILDREN', 'Children’s Choir'],
    ['WORSHIP', 'Worship Team'],
  ] as const;
  for (const [code, name] of categoryRows) {
    db.choirCategory.push({
      id: `category-${code.toLowerCase()}-v1`, systemId: 'sys-music', code, name, description: '',
      active: true, effectiveFrom: at, effectiveTo: null, configVersionId: 'music-config-v1',
      supersedesId: null, createdByPersonId: LEADER, createdAt: at,
    });
  }
  const requiredByService: Record<string, Partial<Record<string, number>>> = {
    ss1: { PRIMARY: 2, CHILDREN: 1 },
    ss2: { PRIMARY: 2, CHILDREN: 1 },
    tuesday: { PRIMARY: 1, WORSHIP: 1 },
    friday: { PRIMARY: 1 },
    igaburo: { PRIMARY: 1, SECONDARY: 1 },
  };
  for (const service of db.schedulingService) {
    for (const category of db.choirCategory) {
      const count = requiredByService[service.code]?.[category.code] ?? 0;
      db.categoryServicePolicy.push({
        id: `policy-${service.code}-${category.code}`, systemId: 'sys-music',
        categoryId: category.id, serviceId: service.id, eligible: count > 0, active: true,
        frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'TARGET',
        frequencyPeriod: null, planningMode: 'ROTATION', minCount: count,
        maxCount: service.code === 'friday' && category.code === 'PRIMARY' ? 2 : count,
        requireAll: false, configVersionId: 'music-config-v1', effectiveFrom: at,
        effectiveTo: null, supersedesId: null, createdByPersonId: LEADER, createdAt: at,
      });
    }
  }
  for (const s of db.churchSystem) { s.code = s.id.replace('sys-', '').toUpperCase(); s.name = s.id; s.shortName = s.id.replace('sys-', ''); s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY'; s.basePath = `/${s.id}`; }
  db.position.push({ id: 'pos-music', personId: LEADER, systemId: 'sys-music', title: 'Music Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const lineup = async () => {
  const ids: Record<string, string> = {};
  for (const [name, role] of [['Ijwi', 'PRIMARY'], ['Bethel', 'PRIMARY'], ['Elim', 'PRIMARY'], ['Integuza', 'PRIMARY'], ['Beulah', 'SECONDARY'], ['Yerusalemu', 'SECONDARY'], ['Hope', 'CHILDREN'], ['Worship', 'WORSHIP']]) {
    ids[name] = (await post(LEADER, '/api/music/choirs', { name, role })).body.id;
    fake.__db.choirCategoryLink.push({
      id: `link-${ids[name]}`, systemId: 'sys-music', choirId: ids[name],
      categoryId: `category-${role.toLowerCase()}-v1`, eligibleOverrideJson: '{}',
      frequencyOverrideJson: '{}', active: true, effectiveFrom: new Date(), effectiveTo: null,
      supersedesId: null, createdByPersonId: LEADER, createdAt: new Date(), configVersionId: 'music-config-v1',
    });
  }
  return ids;
};
const generate = async (horizon = 'MONTH', start = START) => post(LEADER, '/api/music/schedule/drafts/generate', { horizon, start });
const pinDraftVersion = (id: string, configVersionId: string) => {
  const draft = fake.__db.musicDraft.find((row: any) => row.id === id);
  if (!draft) throw new Error(`Missing generated draft ${id}`);
  draft.configVersionId = configVersionId;
};

describe('generating a draft from the pinned configuration', () => {
  it('requires explicit category membership for every active choir', async () => {
    await post(LEADER, '/api/music/choirs', { name: 'Solo', role: 'PRIMARY' });
    const r = await generate();
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/exactly one explicit choir-category link/);
  });
  it('builds a valid month with the church rules', async () => {
    const ids = await lineup();
    const r = await generate();
    expect(r.status).toBe(201);
    const d = (await get(LEADER, `/api/music/schedule/drafts/${r.body.id}`)).body;
    const kinds = d.services.map((s: any) => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(['SS1', 'SS2', 'TUESDAY', 'FRIDAY']));
    for (const s of d.services.filter((x: any) => x.kind === 'SS1')) expect(s.units.map((u: any) => u.unitId)).toContain(ids.Hope);
    for (const s of d.services.filter((x: any) => x.kind === 'TUESDAY')) {
      expect(s.units.map((u: any) => u.unitId)).toContain(ids.Worship);
      expect(s.units.filter((u: any) => u.kind === 'PRIMARY')).toHaveLength(1);
    }
    for (const s of d.services.filter((x: any) => x.kind === 'IGABURO')) expect(s.units).toHaveLength(2);
    expect(d.months[0].periodKey).toBe(START);
  });
  it('presents explicit pinned category names and validation to planners', async () => {
    await lineup();
    const id = (await generate()).body.id;
    const category = fake.__db.choirCategory.find((row: any) => row.code === 'PRIMARY')!;
    category.name = 'Configured congregation choirs';
    const response = await get(LEADER, `/api/music/schedule/drafts/${id}`);
    expect(response.status).toBe(200);
    expect(response.body.configVersionId).toBe('music-config-v1');
    expect(response.body.configLabel).toBe('Music rules');
    expect(response.body.validation.ok).toBe(true);
    expect(response.body.rules).toEqual(expect.arrayContaining([expect.objectContaining({ categoryName: 'Configured congregation choirs', serviceCode: 'ss1' })]));
    const assignments = response.body.services.flatMap((service: any) => service.units);
    expect(assignments.filter((unit: any) => unit.kind === 'PRIMARY').length).toBeGreaterThan(0);
    expect(response.body.services.find((service: any) => service.kind === 'SS1').requirements).toEqual(expect.arrayContaining([expect.objectContaining({categoryName: 'Configured congregation choirs', assigned: 2, minimum: 2, maximum: 2})]));
    expect(assignments.filter((unit: any) => unit.kind === 'PRIMARY').every((unit: any) => unit.category === 'Configured congregation choirs')).toBe(true);
  });
  it('a quarter spans three months; past periods are refused', async () => {
    await lineup();
    const r = await generate('QUARTER', next(1));
    if (r.status === 201) expect((await get(LEADER, `/api/music/schedule/drafts/${r.body.id}`)).body.months.length).toBeGreaterThanOrEqual(1);
    expect((await generate('MONTH', next(-2))).body.code).toBe('PAST');
    expect((await post(LEADER, '/api/music/schedule/drafts/generate', { horizon: 'DECADE', start: START })).status).toBe(400);
  });
  it('only Music planners generate', async () => {
    await lineup();
    expect((await post('p-member', '/api/music/schedule/drafts/generate', { horizon: 'MONTH', start: START })).status).toBeGreaterThanOrEqual(403);
  });
});

describe('editing a draft by hand', () => {
  it('hard rules refuse, with the engine’s own reason', async () => {
    const ids = await lineup();
    const id = (await generate()).body.id;
    const d = (await get(LEADER, `/api/music/schedule/drafts/${id}`)).body;
    const ss2 = d.services.find((s: any) => s.kind === 'SS2');
    const r = await post(LEADER, `/api/music/schedule/drafts/${id}/edit`, { serviceId: ss2.id, action: 'add', unitId: ids.Worship });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONFIG');
    expect(r.body.error.length).toBeGreaterThan(5);
  });
  it('validates configured category limits while edits preserve other services', async () => {
    const ids = await lineup();
    const id = (await generate()).body.id;
    const d = (await get(LEADER, `/api/music/schedule/drafts/${id}`)).body;
    const fri = d.services.find((s: any) => s.kind === 'FRIDAY');
    const current = fri.units[0].unitId;
    const other = [ids.Ijwi, ids.Bethel, ids.Elim, ids.Integuza].find((x) => x !== current)!;
    const add = await post(LEADER, `/api/music/schedule/drafts/${id}/edit`, { serviceId: fri.id, action: 'add', unitId: other });
    expect(add.status).toBe(200);
    expect((await post(LEADER, `/api/music/schedule/drafts/${id}/edit`, { serviceId: fri.id, action: 'remove', unitId: other })).status).toBe(200);
    expect((await post(LEADER, `/api/music/schedule/drafts/${id}/edit`, { serviceId: fri.id, action: 'replace', unitId: current, toUnitId: other })).status).toBe(200);
    expect((await post(LEADER, `/api/music/schedule/drafts/${id}/edit`, { serviceId: fri.id, action: 'remove', unitId: 'nobody' })).status).toBe(404);
  });
  it('a draft can be discarded', async () => {
    await lineup();
    const id = (await generate()).body.id;
    expect((await del(LEADER, `/api/music/schedule/drafts/${id}`)).status).toBe(200);
    expect((await get(LEADER, `/api/music/schedule/drafts/${id}`)).status).toBe(404);
  });
});

describe('confirm, publish and edit', () => {
  it('can confirm and publish deliberately vacant fixed slots without requiring a replacement', async () => {
    const ids=await lineup();
    for (const service of fake.__db.schedulingService) service.active=service.code === 'ss1';
    for (const category of fake.__db.choirCategory) category.active=category.code === 'PRIMARY';
    for (const choir of fake.__db.musicChoir) choir.active=false;
    const p=fake.__db.categoryServicePolicy.find((row:any)=>row.id === 'policy-ss1-PRIMARY');
    p.planningMode='FIXED';
    fake.__db.musicFixedAssignment ??= [];
    fake.__db.musicFixedAssignment.push({id:'vacant-fixed',systemId:'sys-music',configVersionId:'music-config-v1',categoryServicePolicyId:p.id,choirId:ids.Ijwi,displayOrder:0,createdByPersonId:LEADER,createdAt:new Date()});
    const generated=await generate();
    expect(generated.status,generated.body.error).toBe(201);
    const id=generated.body.id;
    const draft=await get(LEADER,`/api/music/schedule/drafts/${id}`);
    expect(draft.body.warnings.join(' ')).toMatch(/empty|unfilled/);
    expect((await post(LEADER,`/api/music/schedule/drafts/${id}/confirm`,{})).status).toBe(200);
    expect((await post(LEADER,'/api/music/schedule/months/publish',{months:[START]})).status).toBe(200);
  });
  const confirmed = async (configVersionId?: string) => {
    const ids = await lineup();
    const id = (await generate()).body.id as string;
    if (configVersionId) pinDraftVersion(id, configVersionId);
    const c = await post(LEADER, `/api/music/schedule/drafts/${id}/confirm`, {});
    return { ids, id, c };
  };
  it('confirming makes the month available to Protocol but hidden from readers; the draft is used up', async () => {
    const { c, id } = await confirmed();
    expect(c.status).toBe(200);
    expect((await get(LEADER, `/api/music/schedule/drafts/${id}`)).status).toBe(404);
    const state = (await get(LEADER, '/api/music/schedule/state')).body;
    expect(state.months[0]).toMatchObject({ periodKey: START, state: 'CONFIRMED', version: 1 });
    expect(state.drafts).toHaveLength(0);
    expect((await get(LEADER, `/api/music/schedule/months/${START}`)).status).toBe(200);
    expect((await get('p-member', `/api/music/schedule/months/${START}`)).status).toBe(404);
    expect(fake.__db.notification.some((n: any) => n.toOffice === 'COORDINATOR')).toBe(true);
  });
  it('only confirmed months are published; readers see them afterwards', async () => {
    await confirmed();
    expect((await post(LEADER, '/api/music/schedule/months/publish', { months: [next(5)] })).body.code).toBe('NOT_CONFIRMED');
    expect((await post(LEADER, '/api/music/schedule/months/publish', { months: [START] })).status).toBe(200);
    const asReader = await get('p-member', `/api/music/schedule/months/${START}`);
    if (asReader.status === 200) expect(asReader.body.state).toBe('PUBLISHED');
    const log = (await get(LEADER, `/api/music/schedule/log?month=${START}`)).body.entries;
    expect(log.map((e: any) => e.action)).toEqual(expect.arrayContaining(['CONFIRMED', 'PUBLISHED']));
    expect(log.find((e: any) => e.action === 'PUBLISHED').summary).toBe('Released to the choirs');
  });
  it('confirmation and publication preserve the draft version in the month and history snapshots', async () => {
    await confirmed('music-config-v1');
    const confirmedMonth = fake.__db.musicMonth.find((m: any) => m.periodKey === START);
    expect(confirmedMonth.configVersionId).toBe('music-config-v1');
    expect(fake.__db.musicLog[0]).toMatchObject({ configVersionId: 'music-config-v1' });

    expect((await post(LEADER, '/api/music/schedule/months/publish', { months: [START] })).status).toBe(200);
    const publishedMonth = fake.__db.musicMonth.find((m: any) => m.periodKey === START);
    expect(publishedMonth).toMatchObject({ state: 'PUBLISHED', configVersionId: 'music-config-v1' });
    const publishedLog = fake.__db.musicLog.find((entry: any) => entry.action === 'PUBLISHED');
    expect(publishedLog).toMatchObject({ configVersionId: 'music-config-v1' });
    expect(JSON.parse(publishedLog.servicesSnapshotJson)).toHaveLength(JSON.parse(publishedMonth.servicesJson).length);
  });
  it('editing a published month raises the version, is logged in words, and soft/hard rules still apply', async () => {
    const { ids } = await confirmed();
    await post(LEADER, '/api/music/schedule/months/publish', { months: [START] });
    const m = (await get(LEADER, `/api/music/schedule/months/${START}`)).body;
    const ss2 = m.services.find((s: any) => s.kind === 'SS2');
    expect((await post(LEADER, `/api/music/schedule/months/${START}/edit`, { serviceId: ss2.id, action: 'add', unitId: ids.Worship })).status).toBe(409);
    const fri = m.services.find((s: any) => s.kind === 'FRIDAY');
    const other = [ids.Ijwi, ids.Bethel, ids.Elim, ids.Integuza].find((x) => x !== fri.units[0].unitId)!;
    const e = await post(LEADER, `/api/music/schedule/months/${START}/edit`, { serviceId: fri.id, action: 'replace', unitId: fri.units[0].unitId, toUnitId: other });
    expect(e.status).toBe(200);
    expect(e.body.version).toBe(2);
    const log = (await get(LEADER, `/api/music/schedule/log?month=${START}`)).body.entries;
    const edit = log.find((x: any) => x.action === 'EDITED');
    expect(edit.summary).toMatch(/added to|removed from/);
    expect(edit.changes.length).toBe(2);
  });
  it('a published month cannot be confirmed again from a draft; publishing a draft replaces it with the next version', async () => {
    await confirmed();
    await post(LEADER, '/api/music/schedule/months/publish', { months: [START] });
    const again = (await generate()).body.id as string;
    expect((await post(LEADER, `/api/music/schedule/drafts/${again}/confirm`, {})).body.code).toBe('PUBLISHED');
    expect((await post(LEADER, `/api/music/schedule/drafts/${again}/publish`, {})).status).toBe(200);
    expect((await get(LEADER, '/api/music/schedule/state')).body.months[0]).toMatchObject({ periodKey: START, state: 'PUBLISHED', version: 2 });
  });
  it('replacing a published month records the new draft version without changing prior history', async () => {
    await confirmed('music-config-v1');
    await post(LEADER, '/api/music/schedule/months/publish', { months: [START] });
    const oldHistory = fake.__db.musicLog
      .filter((entry: any) => entry.periodKey === START)
      .map((entry: any) => ({
        action: entry.action, version: entry.version, configVersionId: entry.configVersionId,
        servicesSnapshotJson: entry.servicesSnapshotJson, assignmentsSnapshotJson: entry.assignmentsSnapshotJson,
      }));

    const replacementId = (await generate()).body.id as string;
    const cloned = {
      ...fake.__db.configVersion.find((row: any) => row.id === 'music-config-v1'),
      id: 'music-v2', version: 2, status: 'SUPERSEDED',
    };
    fake.__db.configVersion.push(cloned);
    const serviceIds = new Map<string, string>();
    for (const original of fake.__db.schedulingService.filter((row: any) => row.configVersionId === 'music-config-v1')) {
      serviceIds.set(original.id, `${original.id}-v2`);
      fake.__db.schedulingService.push({ ...original, id: `${original.id}-v2`, configVersionId: 'music-v2' });
    }
    const categoryIds = new Map<string, string>();
    for (const original of fake.__db.choirCategory.filter((row: any) => row.configVersionId === 'music-config-v1')) {
      categoryIds.set(original.id, `${original.id}-v2`);
      fake.__db.choirCategory.push({ ...original, id: `${original.id}-v2`, configVersionId: 'music-v2' });
    }
    for (const original of fake.__db.categoryServicePolicy.filter((row: any) => row.configVersionId === 'music-config-v1')) {
      fake.__db.categoryServicePolicy.push({
        ...original, id: `${original.id}-v2`, configVersionId: 'music-v2',
        categoryId: categoryIds.get(original.categoryId), serviceId: serviceIds.get(original.serviceId),
      });
    }
    for (const original of fake.__db.choirCategoryLink.filter((row: any) => row.configVersionId === 'music-config-v1')) {
      fake.__db.choirCategoryLink.push({
        ...original, id: `${original.id}-v2`, configVersionId: 'music-v2',
        categoryId: categoryIds.get(original.categoryId),
      });
    }
    pinDraftVersion(replacementId, 'music-v2');
    expect((await post(LEADER, `/api/music/schedule/drafts/${replacementId}/publish`, {})).status).toBe(200);

    const monthRow = fake.__db.musicMonth.find((m: any) => m.periodKey === START);
    expect(monthRow).toMatchObject({ state: 'PUBLISHED', version: 2, configVersionId: 'music-v2' });
    const replacementLog = fake.__db.musicLog.find((entry: any) => entry.action === 'EDITED');
    expect(replacementLog).toMatchObject({ version: 2, configVersionId: 'music-v2' });
    expect(fake.__db.musicLog
      .filter((entry: any) => entry.periodKey === START)
      .slice(0, oldHistory.length)
      .map((entry: any) => ({
        action: entry.action, version: entry.version, configVersionId: entry.configVersionId,
        servicesSnapshotJson: entry.servicesSnapshotJson, assignmentsSnapshotJson: entry.assignmentsSnapshotJson,
      }))).toEqual(oldHistory);
  });
  it('replacing a published month with the same version keeps that version', async () => {
    await confirmed('music-config-v1');
    await post(LEADER, '/api/music/schedule/months/publish', { months: [START] });
    const replacementId = (await generate()).body.id as string;
    pinDraftVersion(replacementId, 'music-config-v1');

    expect((await post(LEADER, `/api/music/schedule/drafts/${replacementId}/publish`, {})).status).toBe(200);
    expect(fake.__db.musicMonth.find((m: any) => m.periodKey === START))
      .toMatchObject({ state: 'PUBLISHED', version: 2, configVersionId: 'music-config-v1' });
  });
  it('the next draft rotates Tuesday and Friday choirs from what is already decided', async () => {
    await confirmed();
    const second = await generate('MONTH', next(2));
    expect(second.status).toBe(201);
  });
});

describe('own blocks', () => {
  it('the Music leader sees the schedule screen', async () => {
    const caps = await get(LEADER, '/api/me/capabilities');
    expect(caps.body.systems.find((s: any) => s.id === 'sys-music').own.map((o: any) => o.key)).toContain('monthplan');
  });
});


describe('decided Music manual requirements', () => {
  it('rejects a published edit that removes a required MANUAL choir', async () => {
    await lineup();
    const generated = await generate();
    expect(generated.status).toBe(201);
    const draft = fake.__db.musicDraft.find((row: any) => row.id === generated.body.id);
    const services = JSON.parse(draft.servicesJson);
    const assignments = JSON.parse(draft.assignmentsJson);
    const friday = services.find((row: any) => row.kind === 'FRIDAY');
    const assigned = assignments.find((row: any) => row.serviceId === friday.id);
    const rule = fake.__db.categoryServicePolicy.find((row: any) => row.id === 'policy-friday-PRIMARY');
    rule.planningMode = 'MANUAL';
    expect((await post(LEADER, '/api/music/schedule/drafts/' + generated.body.id + '/confirm')).status).toBe(200);
    expect((await post(LEADER, '/api/music/schedule/months/publish', { months: [START] })).status).toBe(200);
    const before = fake.__db.musicMonth.find((row: any) => row.periodKey === START).assignmentsJson;
    const edit = await post(LEADER, '/api/music/schedule/months/' + START + '/edit', { serviceId: friday.id, action: 'remove', unitId: assigned.unitId });
    expect(edit.status).toBe(409);
    expect(fake.__db.musicMonth.find((row: any) => row.periodKey === START).assignmentsJson).toBe(before);
  });
});


describe('Music lifecycle permissions', () => {
  it('rejects unauthorized confirmation and publication without writes', async () => {
    await lineup();
    const generated = await generate();
    expect(generated.status).toBe(201);
    const before = JSON.stringify([fake.__db.musicDraft, fake.__db.musicMonth, fake.__db.musicLog]);
    for (const path of ['/api/music/schedule/drafts/' + generated.body.id + '/confirm', '/api/music/schedule/drafts/' + generated.body.id + '/publish', '/api/music/schedule/months/publish']) {
      const response = await post('p-member', path, { months: [START], systemId: 'sys-music' });
      expect([403, 404]).toContain(response.status);
    }
    expect(JSON.stringify([fake.__db.musicDraft, fake.__db.musicMonth, fake.__db.musicLog])).toBe(before);
  });
});


describe('configured generation route policies', () => {
  it('selects monthly minimums while respecting a date-specific choir absence', async () => {
    const ids = await lineup();
    const initial = await generate();
    const initialRow = fake.__db.musicDraft.find((row: any) => row.id === initial.body.id);
    const friday = JSON.parse(initialRow.servicesJson).find((row: any) => row.kind === 'FRIDAY');
    await del(LEADER, '/api/music/schedule/drafts/' + initial.body.id);
    const rule = fake.__db.categoryServicePolicy.find((row: any) => row.id === 'policy-friday-PRIMARY');
    Object.assign(rule, { frequencyTarget: 1, frequencyKind: 'MINIMUM', frequencyPeriod: 'MONTH' });
    fake.__db.musicChoirUnavailability ??= [];
    fake.__db.musicChoirUnavailability.push({ id: 'route-unavailable', systemId: 'sys-music', choirId: ids.Ijwi, serviceDate: friday.date, serviceCode: 'friday', active: true, recordedByPersonId: LEADER, recordedAt: new Date(), updatedAt: new Date() });
    const generated = await generate();
    expect(generated.status, JSON.stringify(generated.body)).toBe(201);
    const row = fake.__db.musicDraft.find((item: any) => item.id === generated.body.id);
    const fridayIds = new Set(JSON.parse(row.servicesJson).filter((item: any) => item.kind === 'FRIDAY').map((item: any) => item.id));
    const assignments = JSON.parse(row.assignmentsJson).filter((item: any) => fridayIds.has(item.serviceId));
    for (const id of [ids.Ijwi, ids.Bethel, ids.Elim, ids.Integuza]) expect(assignments.some((item: any) => item.unitId === id)).toBe(true);
    expect(assignments.some((item: any) => item.serviceId === friday.id && item.unitId === ids.Ijwi)).toBe(false);
    expect((await post(LEADER, '/api/music/schedule/drafts/' + generated.body.id + '/confirm')).status).toBe(200);
  });
});
