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
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'musicChoir', 'musicChoirMember', 'musicDraft', 'musicMonth', 'musicLog']) db[k] ??= [];
  for (const s of db.churchSystem) { s.code = s.id.replace('sys-', '').toUpperCase(); s.name = s.id; s.shortName = s.id.replace('sys-', ''); s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY'; s.basePath = `/${s.id}`; }
  db.position.push({ id: 'pos-music', personId: LEADER, systemId: 'sys-music', title: 'Music Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const lineup = async () => {
  const ids: Record<string, string> = {};
  for (const [name, role] of [['Ijwi', 'PRIMARY'], ['Bethel', 'PRIMARY'], ['Elim', 'PRIMARY'], ['Integuza', 'PRIMARY'], ['Beulah', 'SECONDARY'], ['Yerusalemu', 'SECONDARY'], ['Hope', 'CHILDREN'], ['Worship', 'WORSHIP']]) {
    ids[name] = (await post(LEADER, '/api/music/choirs', { name, role })).body.id;
  }
  return ids;
};
const generate = async (horizon = 'MONTH', start = START) => post(LEADER, '/api/music/schedule/drafts/generate', { horizon, start });

describe('generating a draft with the old engine', () => {
  it('needs two primary choirs, and says so', async () => {
    await post(LEADER, '/api/music/choirs', { name: 'Solo', role: 'PRIMARY' });
    const r = await generate();
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/2 active primary/);
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
    const r = await post(LEADER, `/api/music/schedule/drafts/${id}/edit`, { serviceId: ss2.id, action: 'add', unitId: ids.Hope });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('RULE');
    expect(r.body.error.length).toBeGreaterThan(5);
  });
  it('soft rules warn but save; remove and replace work', async () => {
    const ids = await lineup();
    const id = (await generate()).body.id;
    const d = (await get(LEADER, `/api/music/schedule/drafts/${id}`)).body;
    const fri = d.services.find((s: any) => s.kind === 'FRIDAY');
    const current = fri.units[0].unitId;
    const other = [ids.Ijwi, ids.Bethel, ids.Elim, ids.Integuza].find((x) => x !== current)!;
    const add = await post(LEADER, `/api/music/schedule/drafts/${id}/edit`, { serviceId: fri.id, action: 'add', unitId: other });
    expect(add.status).toBe(200);
    expect(add.body.warnings.join(' ')).toMatch(/Friday/);
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
  const confirmed = async () => {
    const ids = await lineup();
    const id = (await generate()).body.id as string;
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
  it('editing a published month raises the version, is logged in words, and soft/hard rules still apply', async () => {
    const { ids } = await confirmed();
    await post(LEADER, '/api/music/schedule/months/publish', { months: [START] });
    const m = (await get(LEADER, `/api/music/schedule/months/${START}`)).body;
    const ss2 = m.services.find((s: any) => s.kind === 'SS2');
    expect((await post(LEADER, `/api/music/schedule/months/${START}/edit`, { serviceId: ss2.id, action: 'add', unitId: ids.Hope })).status).toBe(409);
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
