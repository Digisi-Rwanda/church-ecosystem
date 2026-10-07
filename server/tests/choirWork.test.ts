import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'musicChoir', 'musicChoirMember', 'choirRehearsal', 'choirSong', 'choirSponsor', 'sponsorPledge']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.position.push({ id: 'pos-music', personId: 'p-outsider', systemId: 'sys-music', title: 'Music Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  db.musicChoir.push({ id: 'ch-elim', name: 'Elim', role: 'PRIMARY', systemId: 'sys-choir', active: true, createdById: 'x' }, { id: 'ch-old', name: 'Old', role: 'PRIMARY', systemId: 'sys-choir', active: false, createdById: 'x' });
  db.musicChoirMember.push({ id: 'm1', choirId: 'ch-elim', personId: 'p-choir-member', status: 'ACTIVE' }, { id: 'm2', choirId: 'ch-elim', personId: 'p-member', status: 'ACTIVE' });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const LEADER = 'p-choir-leader';
const reh = (o: object = {}) => ({ choirId: 'ch-elim', heldOn: '2026-10-03', presentIds: ['p-choir-member'], note: 'Cantata', ...o });

describe('rehearsals', () => {
  it('the choir leader records a rehearsal; attendance per singer follows', async () => {
    expect((await post(LEADER, '/api/choir/rehearsals', reh())).status).toBe(201);
    expect((await post(LEADER, '/api/choir/rehearsals', reh({ heldOn: '2026-10-05', presentIds: ['p-choir-member', 'p-member'] }))).status).toBe(201);
    const v = (await get(LEADER, '/api/choir/rehearsals?choirId=ch-elim')).body;
    expect(v.rehearsals.map((r: any) => r.heldOn)).toEqual(['2026-10-05', '2026-10-03']);
    const by = Object.fromEntries(v.members.map((m: any) => [m.personId, m]));
    expect(by['p-choir-member']).toMatchObject({ came: 2, of: 2, rate: 100 });
    expect(by['p-member']).toMatchObject({ came: 1, of: 2, rate: 50 });
  });
  it('rules: members only, one per day, no future, not for retired choirs', async () => {
    expect((await post(LEADER, '/api/choir/rehearsals', reh({ presentIds: ['p-pastor'] }))).body.code).toBe('NOT_A_MEMBER');
    await post(LEADER, '/api/choir/rehearsals', reh());
    expect((await post(LEADER, '/api/choir/rehearsals', reh())).body.code).toBe('ALREADY_EXISTS');
    expect((await post(LEADER, '/api/choir/rehearsals', reh({ heldOn: '2026-10-20' }))).body.code).toBe('FUTURE_DATE');
    expect((await post(LEADER, '/api/choir/rehearsals', reh({ choirId: 'ch-old' }))).body.code).toBe('WRONG_STATE');
  });
  it('plain singers and outsiders cannot see rehearsals or record them', async () => {
    expect((await get('p-choir-member', '/api/choir/rehearsals?choirId=ch-elim')).status).toBe(404);
    expect((await post('p-choir-member', '/api/choir/rehearsals', reh())).status).toBe(404);
    expect((await get('p-youth-leader', '/api/choir/rehearsals?choirId=ch-elim')).status).toBe(404);
  });
  it('the Music leader may also record', async () => {
    expect((await post('p-outsider', '/api/choir/rehearsals', reh())).status).toBe(201);
  });
});

describe('choir list', () => {
  it('leaders see their choirs; singers only for the repertoire', async () => {
    expect((await get(LEADER, '/api/choir/choirs')).body.choirs.map((c: any) => c.name)).toEqual(['Elim']);
    expect((await get('p-choir-member', '/api/choir/choirs')).body.choirs).toHaveLength(0);
    expect((await get('p-choir-member', '/api/choir/choirs?for=repertoire')).body.choirs.map((c: any) => c.name)).toEqual(['Elim']);
  });
});

describe('repertoire', () => {
  it('leaders add songs; singers can read the list; last sung and retire work', async () => {
    const id = (await post(LEADER, '/api/choir/songs', { choirId: 'ch-elim', title: 'Amazing Grace', composer: 'Newton', songKey: 'G' })).body.id;
    expect(id).toBeTruthy();
    expect((await post(LEADER, '/api/choir/songs', { choirId: 'ch-elim', title: 'amazing grace' })).body.code).toBe('ALREADY_EXISTS');
    expect((await post(LEADER, `/api/choir/songs/${id}/sung`, { day: '2026-10-04' })).status).toBe(200);
    expect((await post(LEADER, `/api/choir/songs/${id}/sung`, { day: '2026-12-04' })).body.code).toBe('FUTURE_DATE');
    const asSinger = await get('p-choir-member', '/api/choir/songs?choirId=ch-elim');
    expect(asSinger.status).toBe(200);
    expect(asSinger.body.canWrite).toBe(false);
    expect(asSinger.body.songs[0]).toMatchObject({ title: 'Amazing Grace', lastSungOn: '2026-10-04', songKey: 'G' });
    expect((await post('p-choir-member', '/api/choir/songs', { choirId: 'ch-elim', title: 'X' })).status).toBeGreaterThanOrEqual(403);
    expect((await post(LEADER, `/api/choir/songs/${id}/retire`)).status).toBe(200);
    expect((await get(LEADER, '/api/choir/songs?choirId=ch-elim')).body.songs).toHaveLength(0);
    expect(fake.__db.choirSong).toHaveLength(1);
  });
});

describe('sponsorship', () => {
  const sponsor = async () => (await post(LEADER, '/api/choir/sponsors', { choirId: 'ch-elim', name: 'Mr Kamali', kind: 'PERSON', contact: '0788000000' })).body.id as string;
  it('logs sponsors and pledges with totals, kept apart from money', async () => {
    const s = await sponsor();
    const p1 = (await post(LEADER, `/api/choir/sponsors/${s}/pledges`, { amount: 50000, pledgedOn: '2026-10-01' })).body.id;
    const p2 = (await post(LEADER, `/api/choir/sponsors/${s}/pledges`, { amount: 20000, pledgedOn: '2026-10-02', note: 'Uniforms' })).body.id;
    expect((await post(LEADER, `/api/choir/pledges/${p1}/received`, { day: '2026-10-05' })).status).toBe(200);
    expect((await post(LEADER, `/api/choir/pledges/${p1}/received`, { day: '2026-10-05' })).body.code).toBe('WRONG_STATE');
    expect((await post(LEADER, `/api/choir/pledges/${p2}/cancel`)).status).toBe(200);
    const v = (await get(LEADER, '/api/choir/sponsors?choirId=ch-elim')).body;
    expect(v.totals).toEqual({ pledged: 50000, received: 50000 });
    expect(v.sponsors[0].pledges).toHaveLength(1);
    expect(fake.__db.sponsorPledge).toHaveLength(2);
    expect(fake.__db.money ?? []).toHaveLength(0);
  });
  it('validates amounts and dates; ended sponsors take no pledges; singers see nothing', async () => {
    const s = await sponsor();
    expect((await post(LEADER, `/api/choir/sponsors/${s}/pledges`, { amount: 0, pledgedOn: '2026-10-01' })).body.code).toBe('AMOUNT');
    expect((await post(LEADER, `/api/choir/sponsors/${s}/pledges`, { amount: 100, pledgedOn: '2026-10-30' })).body.code).toBe('BAD_DATE');
    expect((await post(LEADER, `/api/choir/sponsors/${s}/end`)).status).toBe(200);
    expect((await post(LEADER, `/api/choir/sponsors/${s}/pledges`, { amount: 100, pledgedOn: '2026-10-01' })).body.code).toBe('WRONG_STATE');
    expect((await get('p-choir-member', '/api/choir/sponsors?choirId=ch-elim')).status).toBe(404);
  });
});

describe('own blocks', () => {
  it('leaders see rehearsals, repertoire and sponsorship; singers only the repertoire', async () => {
    const keys = async (who: string) => (await get(who, '/api/me/capabilities')).body.systems.find((s: any) => s.id === 'sys-choir').own.map((o: any) => o.key);
    expect(await keys(LEADER)).toEqual(expect.arrayContaining(['rehearsals', 'repertoire', 'sponsorship']));
    expect(await keys('p-choir-member')).toEqual(['repertoire']);
  });
});
