import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { detailsSchema, moneySchema, parseStored, EMPTY_MONEY } from '../src/systemSettings/rules';

describe('the rules', () => {
  it('details are trimmed and bounded', () => {
    expect(detailsSchema.parse({ displayName: '  Choir  ' }).displayName).toBe('Choir');
    expect(detailsSchema.safeParse({ place: 'x'.repeat(121) }).success).toBe(false);
  });
  it('money types need their own code, and a goal needs an amount and who it is per', () => {
    const t = (o: object) => ({ code: 'TITHE', name: 'Tithe', ...o });
    expect(moneySchema.safeParse({ types: [t({})] }).success).toBe(true);
    expect(moneySchema.safeParse({ types: [t({}), t({})] }).success).toBe(false);
    expect(moneySchema.safeParse({ types: [t({ goalAmount: 500 })] }).success).toBe(false);
    expect(moneySchema.safeParse({ types: [t({ goalAmount: 500, goalPer: 'TEAM' })] }).success).toBe(true);
    expect(moneySchema.safeParse({ types: [t({ code: 'bad code' })] }).success).toBe(false);
    expect(moneySchema.safeParse({ methods: ['CHEQUE'] }).success).toBe(false);
  });
  it('a stored value that is missing or broken falls back to empty', () => {
    expect(parseStored(undefined, moneySchema, EMPTY_MONEY)).toEqual(EMPTY_MONEY);
    expect(parseStored('not json', moneySchema, EMPTY_MONEY)).toEqual(EMPTY_MONEY);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, sys: string) => request(app).get(`/api/system-settings/${sys}`).set(bearer(as));
const put = (as: string, sys: string, part: string, body: unknown) => request(app).put(`/api/system-settings/${sys}/${part}`).set(bearer(as)).send(body as object);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'systemSetting']) db[k] ??= [];
  db.person.push({ id: 'p-ctreas', fullName: 'Choir Treasurer', status: 'ACTIVE' }, { id: 'p-csec', fullName: 'Choir Secretary', status: 'ACTIVE' });
  db.position.push(
    { id: 'pos-ct', personId: 'p-ctreas', systemId: 'sys-choir', title: 'Treasurer', office: 'TREASURER', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-cs', personId: 'p-csec', systemId: 'sys-choir', title: 'Secretary', office: 'SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('reading', () => {
  it('needs sign-in and access to the system', async () => {
    expect((await request(app).get('/api/system-settings/sys-choir')).status).toBe(401);
    expect((await get('p-outsider', 'sys-choir')).status).toBe(403);
    expect((await get('p-pastor', 'sys-nope')).status).toBe(404);
  });
  it('a member reads, with empty defaults and no power to edit', async () => {
    const r = await get('p-choir-member', 'sys-choir');
    expect(r.status).toBe(200);
    expect(r.body.details.displayName).toBe('');
    expect(r.body.money.methods).toEqual(['CASH']);
    expect(r.body.canEditDetails).toBe(false);
    expect(r.body.canEditMoney).toBe(false);
  });
  it('who may edit what', async () => {
    const lead = (await get('p-choir-leader', 'sys-choir')).body;
    expect([lead.canEditDetails, lead.canEditMoney]).toEqual([true, true]);
    const tr = (await get('p-ctreas', 'sys-choir')).body;
    expect([tr.canEditDetails, tr.canEditMoney]).toEqual([false, true]);
    const sec = (await get('p-csec', 'sys-choir')).body;
    expect([sec.canEditDetails, sec.canEditMoney]).toEqual([true, false]);
    // the church leader may enter but holds no office inside this system
    const pastor = (await get('p-pastor', 'sys-choir')).body;
    expect([pastor.canEditDetails, pastor.canEditMoney]).toEqual([false, false]);
    // an office in one system gives nothing in another
    expect((await get('p-choir-leader', 'sys-youth')).status).toBe(403);
  });
});

describe('saving', () => {
  it('the president saves unit details, and each change is audited with before and after', async () => {
    const r = await put('p-choir-leader', 'sys-choir', 'details', { displayName: 'Hallelujah Choir', meetingDay: 'Saturday 16:00' });
    expect(r.status).toBe(200);
    expect(r.body.details.displayName).toBe('Hallelujah Choir');
    expect((await get('p-choir-member', 'sys-choir')).body.details.meetingDay).toBe('Saturday 16:00');
    const ev = fake.__db.auditEvent.find((e: any) => e.action === 'system.details.changed');
    expect(ev.systemId).toBe('sys-choir');
    expect(JSON.parse(ev.metaJson).after.displayName).toBe('Hallelujah Choir');
  });
  it('the treasurer saves money options but not details; the secretary the reverse', async () => {
    const money = { types: [{ code: 'TITHE', name: 'Tithe', goalAmount: 1000, goalPer: 'MEMBER' }], methods: ['CASH', 'MOMO'] };
    expect((await put('p-ctreas', 'sys-choir', 'money', money)).status).toBe(200);
    expect((await put('p-ctreas', 'sys-choir', 'details', { displayName: 'X' })).status).toBe(403);
    expect((await put('p-csec', 'sys-choir', 'details', { displayName: 'Y' })).status).toBe(200);
    expect((await put('p-csec', 'sys-choir', 'money', money)).status).toBe(403);
    const now = (await get('p-choir-member', 'sys-choir')).body;
    expect(now.details.displayName).toBe('Y');
    expect(now.money.types[0].code).toBe('TITHE');
    expect(fake.__db.systemSetting).toHaveLength(1);
  });
  it('a member, the church leader and a leader of another system cannot save', async () => {
    for (const who of ['p-choir-member', 'p-pastor', 'p-youth-leader']) expect((await put(who, 'sys-choir', 'details', { displayName: 'Z' })).status, who).toBe(403);
  });
  it('rejects values that do not pass', async () => {
    expect((await put('p-choir-leader', 'sys-choir', 'money', { types: [{ code: 'a b', name: 'x' }] })).status).toBe(400);
    expect((await put('p-choir-leader', 'sys-choir', 'details', { place: 'x'.repeat(200) })).status).toBe(400);
  });
});
