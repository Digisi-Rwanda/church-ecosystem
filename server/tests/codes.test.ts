/** Slice 1.2a — member codes, unit codes, duplicate national IDs, one Church Leader. */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backfillCodes, isValidUnitCode, nextMemberCode, normaliseNationalId, suggestUnitCode } from '../src/lib/codes';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: any;
const db = () => fake.__db as Record<string, any[]>;
const as = (who: string) => ({
  post: (url: string, body: object) => request(app).post(url).set(bearer(who)).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set(bearer(who)).send(body),
  get: (url: string) => request(app).get(url).set(bearer(who)),
});

beforeEach(async () => {
  fake.__reset();
  seedWorld(db());
  db().auditEvent ??= [];
  db().orgUnit ??= [];
  app = (await import('../src/app.js')).createApp();
});

describe('code helpers', () => {
  it('issues member codes in order and never twice', async () => {
    const a = await nextMemberCode(fake);
    const b = await nextMemberCode(fake);
    expect([a, b]).toEqual(['M-00001', 'M-00002']);
    expect(new Set(await Promise.all(Array.from({ length: 20 }, () => nextMemberCode(fake)))).size).toBe(20);
  });
  it('compares national IDs without spaces or dashes', () => {
    expect(normaliseNationalId('1 1990 8 0012345 1 23')).toBe('1199080012345123');
    expect(normaliseNationalId('  ')).toBe('');
  });
  it('suggests valid, free unit codes', () => {
    expect(suggestUnitCode('Ijwi ry’Ihumure', 'KAC-MUS', new Set())).toBe('KAC-MUS-IJWIRYIH');
    const taken = new Set(['KAC-MUS-IJWI']);
    const next = suggestUnitCode('Ijwi', 'KAC-MUS', taken);
    expect(next).toBe('KAC-MUS-IJWI2');
    expect(isValidUnitCode(next)).toBe(true);
    expect(isValidUnitCode('kac mus')).toBe(false);
    expect(isValidUnitCode('KAC')).toBe(true);
  });
  it('keeps very deep units valid', () => {
    expect(isValidUnitCode(suggestUnitCode('Deep', 'KAC-AA-BB-CC', new Set()))).toBe(true);
  });
  it('backfills only what has no code, parents first, and is safe to repeat', async () => {
    db().person.push({ id: 'p-a', fullName: 'A', createdAt: new Date('2020-01-01') }, { id: 'p-b', fullName: 'B', createdAt: new Date('2019-01-01'), memberCode: 'M-00500' });
    db().orgUnit.push(
      { id: 'ou-church', name: 'ADEPR Kacyiru', type: 'ORGANISATION' },
      { id: 'ou-choir', name: 'Choir', type: 'MINISTRY', parentId: 'ou-church' },
      { id: 'ou-ijwi', name: 'Ijwi', type: 'TEAM', parentId: 'ou-choir' },
    );
    const first = await backfillCodes(fake);
    expect(first.units).toBe(3);
    const codes = Object.fromEntries(db().orgUnit.map((u) => [u.id, u.code]));
    expect(codes['ou-church']).toBe('KAC');
    expect(codes['ou-choir']).toBe('KAC-CHOIR');
    expect(codes['ou-ijwi']).toBe('KAC-CHOIR-IJWI');
    expect(db().person.find((p) => p.id === 'p-b')!.memberCode).toBe('M-00500');
    const before = JSON.stringify(db());
    expect(await backfillCodes(fake)).toEqual({ people: 0, units: 0 });
    expect(JSON.stringify(db())).toBe(before);
  });
});

describe('people', () => {
  it('gives each new person the next code, and the code cannot be changed', async () => {
    const L = as('p-pastor');
    const a = await L.post('/api/people', { fullName: 'Aline One' });
    const b = await L.post('/api/people', { fullName: 'Bosco Two' });
    expect(a.status).toBe(201);
    expect(a.body.person.memberCode).toMatch(/^M-\d{5}$/);
    expect(b.body.person.memberCode).not.toBe(a.body.person.memberCode);
    const patch = await L.patch(`/api/people/${a.body.person.id}`, { memberCode: 'M-99999' });
    expect(patch.status).toBe(400);
    expect(patch.body.code).toBe('CODE_IS_FIXED');
  });
  it('refuses a repeated national ID, however it is typed', async () => {
    const L = as('p-pastor');
    const a = await L.post('/api/people', { fullName: 'Aline One', nationalId: '1 1990 8 0012345 1 23' });
    expect(a.status).toBe(201);
    const dup = await L.post('/api/people', { fullName: 'Someone Else', nationalId: '1199080012345123' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_NATIONAL_ID');
    const c = await L.post('/api/people', { fullName: 'Carine', nationalId: '1199080099999999' });
    expect(c.status).toBe(201);
    const move = await L.patch(`/api/people/${c.body.person.id}`, { nationalId: '1199080012345123' });
    expect(move.status).toBe(409);
    const same = await L.patch(`/api/people/${a.body.person.id}`, { nationalId: '1199080012345123' });
    expect(same.status).toBe(200);
  });
  it('people without an ID never collide', async () => {
    const L = as('p-pastor');
    expect((await L.post('/api/people', { fullName: 'No Id One' })).status).toBe(201);
    expect((await L.post('/api/people', { fullName: 'No Id Two' })).status).toBe(201);
  });
});

describe('units', () => {
  it('suggests a code, accepts a chosen one, refuses repeats, and never changes it', async () => {
    const L = as('p-pastor');
    const a = await L.post('/api/participation/org-units', { name: 'Ushers', type: 'TEAM' });
    expect(a.status).toBe(201);
    expect(isValidUnitCode(a.body.orgUnit.code)).toBe(true);
    const b = await L.post('/api/participation/org-units', { name: 'Youth', type: 'MINISTRY', code: 'kac-yth' });
    expect(b.body.orgUnit.code).toBe('KAC-YTH');
    const dup = await L.post('/api/participation/org-units', { name: 'Youth 2', type: 'MINISTRY', code: 'KAC-YTH' });
    expect(dup.status).toBe(409);
    const bad = await L.post('/api/participation/org-units', { name: 'Odd', type: 'TEAM', code: 'x y' });
    expect(bad.status).toBe(400);
    const change = await L.patch(`/api/participation/org-units/${b.body.orgUnit.id}`, { code: 'KAC-NEW' });
    expect(change.status).toBe(400);
    expect(change.body.code).toBe('CODE_IS_FIXED');
  });
  it('keeps the code when the unit moves', async () => {
    const L = as('p-pastor');
    const parent = await L.post('/api/participation/org-units', { name: 'Parent', type: 'ORGANISATION' });
    const kid = await L.post('/api/participation/org-units', { name: 'Kid', type: 'TEAM' });
    const code = kid.body.orgUnit.code;
    const moved = await L.patch(`/api/participation/org-units/${kid.body.orgUnit.id}`, { parentId: parent.body.orgUnit.id });
    expect(moved.status).toBe(200);
    expect(moved.body.orgUnit.code).toBe(code);
  });
});

describe('one active Church Leader', () => {
  it('refuses a second active Church Leader but allows one after the first ends', async () => {
    const L = as('p-pastor');
    // seedWorld already has the pastor as Church Leader.
    const second = await L.post('/api/participation/positions', { personId: 'p-member', title: 'Church Leader', systemId: 'sys-main', systemRole: 'CHURCH_LEADER' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ONE_CHURCH_LEADER');
    const leaderPos = db().position.find((p) => p.systemRole === 'CHURCH_LEADER')!;
    expect((await L.patch(`/api/participation/positions/${leaderPos.id}`, { status: 'ENDED' })).status).toBe(200);
  });
  it('a past appointment (ended) is history and never blocks', async () => {
    const L = as('p-pastor');
    const past = await L.post('/api/participation/positions', { personId: 'p-member', title: 'Church Leader', systemId: 'sys-main', systemRole: 'CHURCH_LEADER', status: 'ENDED' });
    expect(past.status, JSON.stringify(past.body)).toBe(201);
    const revive = await L.patch(`/api/participation/positions/${past.body.position.id}`, { status: 'ACTIVE' });
    expect(revive.status).toBe(409);
  });
});
