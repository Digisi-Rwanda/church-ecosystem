import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { DEFAULTS, check } from '../src/settings/catalog';
import { canConfirmMove, suggestMove, validTarget } from '../src/moves/rules';

const R = DEFAULTS['moves.rules'];
const facts = (o: Partial<{ dateOfBirth: string | null; gender: string | null; married: boolean }> = {}) => ({ dateOfBirth: null, gender: null, married: false, ...o });

describe('move rules', () => {
  it('children move to Youth above the children limit, and to Elderly from the elderly age', () => {
    expect(suggestMove('sys-children', facts({ dateOfBirth: '2014-01-01' }), R, '2026-10-01')).toBeNull();
    expect(suggestMove('sys-children', facts({ dateOfBirth: '2013-01-01' }), R, '2026-10-01')).toEqual({ toSystemId: 'sys-youth', reason: 'AGE_YOUTH', age: 13 });
    expect(suggestMove('sys-youth', facts({ dateOfBirth: '1960-01-01' }), R, '2026-10-01')?.toSystemId).toBe('sys-elderly');
  });
  it('youth move on age or marriage as the trigger says', () => {
    const old = facts({ dateOfBirth: '1985-01-01', gender: 'Male' });
    const wed = facts({ dateOfBirth: '2000-01-01', gender: 'Female', married: true });
    expect(suggestMove('sys-youth', old, R, '2026-10-01')).toEqual({ toSystemId: 'sys-men', reason: 'AGE_ADULT', age: 41 });
    expect(suggestMove('sys-youth', wed, R, '2026-10-01')?.toSystemId).toBe('sys-couples');
    const ageOnly = { ...R, adultTrigger: 'AGE' as const };
    const marriageOnly = { ...R, adultTrigger: 'MARRIAGE' as const };
    expect(suggestMove('sys-youth', wed, ageOnly, '2026-10-01')).toBeNull();
    expect(suggestMove('sys-youth', old, marriageOnly, '2026-10-01')).toBeNull();
  });
  it('an unknown gender or birth date makes no guess', () => {
    expect(suggestMove('sys-youth', facts({ dateOfBirth: '1985-01-01' }), R, '2026-10-01')).toBeNull();
    expect(suggestMove('sys-children', facts(), R, '2026-10-01')).toBeNull();
  });
  it('only the president, secretary or a church-wide leader confirms', () => {
    const h = (office: string, systemId: string | null, scope = 'UNIT') => [{ office, systemId, scope, via: 'OFFICE' }];
    expect(canConfirmMove(h('PRESIDENT', 'sys-youth'), 'sys-youth')).toBe(true);
    expect(canConfirmMove(h('SECRETARY', 'sys-youth'), 'sys-youth')).toBe(true);
    expect(canConfirmMove(h('TREASURER', 'sys-youth'), 'sys-youth')).toBe(false);
    expect(canConfirmMove(h('PRESIDENT', 'sys-men'), 'sys-youth')).toBe(false);
    expect(canConfirmMove(h('CHURCH_LEADER', 'sys-main', 'CHURCH'), 'sys-youth')).toBe(true);
  });
  it('valid targets follow the chain', () => {
    expect(validTarget('sys-children', 'sys-youth')).toBe(true);
    expect(validTarget('sys-children', 'sys-men')).toBe(false);
    expect(validTarget('sys-youth', 'sys-couples')).toBe(true);
    expect(validTarget('sys-elderly', 'sys-youth')).toBe(false);
  });
  it('the setting needs the limits in order', () => {
    expect(check('moves.rules', R).ok).toBe(true);
    expect(check('moves.rules', { ...R, childMaxAge: 40 }).ok).toBe(false);
    expect(check('moves.rules', { ...R, elderlyFromAge: 30 }).ok).toBe(false);
    expect(check('moves.rules', { ...R, adultTrigger: 'NEVER' }).ok).toBe(false);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);

beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  const db = fake.__db;
  for (const k of ['setting', 'couplePair', 'personRecord', 'orgUnit']) db[k] ??= [];
  db.person.push({ id: 'p-old', fullName: 'Old Youth', status: 'ACTIVE', dateOfBirth: '1980-05-05', gender: 'Female' });
  db.membership.push({ id: 'mem-old', personId: 'p-old', systemId: 'sys-youth', type: 'MEMBER', label: 'Member', status: 'ACTIVE', startDate: new Date('2018-01-01') });
  db.orgUnit.push({ id: 'u-women', systemId: 'sys-women', parentId: null, name: 'Women' });
  const { createApp } = await import('../src/app');
  app = createApp();
});

describe('the Due to move routes', () => {
  it('lists who is due, for those who may read the system', async () => {
    const r = await get('p-youth-leader', '/api/moves?systemId=sys-youth');
    expect(r.status).toBe(200);
    expect(r.body.canConfirm).toBe(true);
    expect(r.body.due.map((d: any) => d.personId)).toEqual(['p-old']);
    expect(r.body.due[0].toSystemId).toBe('sys-women');
    expect((await get('p-member', '/api/moves?systemId=sys-youth')).status).toBe(404);
    expect((await get('p-youth-leader', '/api/moves?systemId=sys-choir')).status).toBe(404);
  });
  it('confirming ends the old membership, starts the new one and is audited', async () => {
    const r = await post('p-youth-leader', '/api/moves/confirm', { personId: 'p-old', fromSystemId: 'sys-youth', toSystemId: 'sys-women' });
    expect(r.status).toBe(200);
    const ms = fake.__db.membership.filter((m: any) => m.personId === 'p-old');
    expect(ms.find((m: any) => m.id === 'mem-old').status).toBe('ENDED');
    expect(ms.some((m: any) => m.systemId === 'sys-women' && m.status === 'ACTIVE' && m.orgUnitId === 'u-women')).toBe(true);
    expect(fake.__db.auditEvent.some((a: any) => a.action === 'MEMBER_MOVED')).toBe(true);
    expect((await get('p-youth-leader', '/api/moves?systemId=sys-youth')).body.due).toEqual([]);
  });
  it('refuses a bad target and anyone who is not president or secretary', async () => {
    expect((await post('p-youth-leader', '/api/moves/confirm', { personId: 'p-old', fromSystemId: 'sys-youth', toSystemId: 'sys-children' })).status).toBe(400);
    expect((await post('p-member', '/api/moves/confirm', { personId: 'p-old', fromSystemId: 'sys-youth', toSystemId: 'sys-women' })).status).toBe(404);
  });
});
