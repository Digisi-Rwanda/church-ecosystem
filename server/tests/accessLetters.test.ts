import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import {
  MEMBER_LETTERS,
  MIN_ADMINISTRATORS,
  MODULE_KEYS,
  OFFICE_LETTERS,
  OFFICE_SCOPE,
  REQUIRED_OFFICES,
  SOLE_OFFICES,
  withRead,
} from '../src/shared/accessMatrix';
import { MODULE_LETTERS, OFFICE_CODES, type OfficeCode } from '../src/shared/vocabulary';
import { decide, isLive, lettersInSystem, liveHoldings, type AccessData } from '../src/capabilities/engine';
import { computeVacancies, findClash } from '../src/lib/appointments';

/* ───────────── the engine alone ───────────── */

const NOW = new Date('2026-10-06T12:00:00Z');
const pos = (id: string, personId: string, office: OfficeCode, systemId: string | null, extra: object = {}) => ({
  id, personId, office, systemId, orgUnitId: null as string | null, status: 'ACTIVE', startDate: '2020-01-01', endDate: null as string | null, ...extra,
});
const world = (positions: any[], delegations: any[] = [], memberships: any[] = []): AccessData => ({ positions, memberships, delegations });

describe('the rule matrix', () => {
  it('every office uses only letters its module allows, and every letter above R keeps R', () => {
    for (const office of OFFICE_CODES) {
      for (const [module, letters] of Object.entries(OFFICE_LETTERS[office])) {
        for (const l of letters!) expect(MODULE_LETTERS[module as keyof typeof MODULE_LETTERS], `${office} ${module} ${l}`).toContain(l);
        expect(letters, `${office} ${module} carries R`).toContain('R');
      }
    }
    expect(withRead(['A'])).toEqual(['R', 'A']);
    expect(withRead([])).toEqual([]);
  });
  it('the treasurer records money, the president oversees and approves it, nobody gets both W and A there by default', () => {
    expect(OFFICE_LETTERS.TREASURER.MONEY).toEqual(['R', 'W']);
    expect(OFFICE_LETTERS.PRESIDENT.MONEY).toEqual(['R', 'V', 'A']);
    for (const o of OFFICE_CODES) {
      const m = OFFICE_LETTERS[o].MONEY ?? [];
      expect(m.includes('W') && m.includes('A'), o).toBe(false);
    }
  });
  it('only the Church Leader and the Church Secretary can send letters out church-wide, and only presidents and secretaries inside a unit', () => {
    const senders = OFFICE_CODES.filter((o) => OFFICE_LETTERS[o].GOVERNANCE?.includes('S'));
    expect(senders.sort()).toEqual(['CHURCH_LEADER', 'CHURCH_SECRETARY', 'PRESIDENT', 'SECRETARY'].sort());
  });
  it('every required office is a real, sole-or-coordinator office', () => {
    for (const offices of Object.values(REQUIRED_OFFICES)) for (const o of offices) expect(OFFICE_CODES).toContain(o);
    expect(SOLE_OFFICES).not.toContain('ADMINISTRATOR');
    expect(SOLE_OFFICES).not.toContain('COORDINATOR');
  });
});

describe('a rule matrix per office', () => {
  for (const office of OFFICE_CODES) {
    it(`${office}: letters in its own system match the matrix, nothing in another`, () => {
      const d = world([pos('p1', 'x', office, 'sys-choir')]);
      const own = lettersInSystem('x', 'sys-choir', d, NOW);
      const other = lettersInSystem('x', 'sys-youth', d, NOW);
      for (const k of MODULE_KEYS) {
        expect(own[k]).toEqual(withRead(OFFICE_LETTERS[office][k] ?? []));
        if (OFFICE_SCOPE[office] === 'UNIT') expect(other[k]).toEqual([]);
        else expect(other[k], 'only the Church Leader reaches other systems').toEqual(office === 'CHURCH_LEADER' ? own[k] : []);
      }
    });
  }
  it('a plain member can only read the basics', () => {
    const d = world([], [], [{ personId: 'm', systemId: 'sys-choir', status: 'ACTIVE', startDate: '2020-01-01' }]);
    const l = lettersInSystem('m', 'sys-choir', d, NOW);
    expect(l.COMMUNICATION).toEqual(['R']);
    for (const k of MODULE_KEYS) expect(l[k]).toEqual(withRead(MEMBER_LETTERS[k] ?? []));
    expect(lettersInSystem('m', 'sys-youth', d, NOW).COMMUNICATION).toEqual([]);
  });
});

describe('terms and ending', () => {
  it('an office not yet started, ended, or past its term gives nothing; a bare end date is the whole day', () => {
    expect(isLive({ status: 'ACTIVE', startDate: '2026-12-01' }, NOW)).toBe(false);
    expect(isLive({ status: 'ENDED', startDate: '2020-01-01' }, NOW)).toBe(false);
    expect(isLive({ status: 'ACTIVE', startDate: '2020-01-01', endDate: '2026-10-05' }, NOW)).toBe(false);
    expect(isLive({ status: 'ACTIVE', startDate: '2020-01-01', endDate: '2026-10-06' }, NOW)).toBe(true);
    const d = world([pos('p1', 'x', 'TREASURER', 's', { endDate: '2026-10-05' })]);
    expect(liveHoldings('x', d, NOW)).toEqual([]);
  });
});

describe('delegation', () => {
  const base = [pos('p1', 'pres', 'PRESIDENT', 'sys-choir')];
  const del = (extra: object = {}) => ({
    id: 'd1', positionId: 'p1', fromPersonId: 'pres', toPersonId: 'vp', status: 'ACTIVE',
    startDate: '2026-10-01', endDate: '2026-11-01', lettersJson: JSON.stringify({ MONEY: ['R', 'A'], MISSION: ['W'] }), ...extra,
  });
  it('lends exactly the letters lent, in the lender’s system only', () => {
    const d = world(base, [del()]);
    const l = lettersInSystem('vp', 'sys-choir', d, NOW);
    expect(l.MONEY).toEqual(['R', 'A']);
    expect(l.MISSION).toEqual(['R', 'W']);
    expect(l.GOVERNANCE).toEqual([]);
    expect(lettersInSystem('vp', 'sys-youth', d, NOW).MONEY).toEqual([]);
  });
  it('never lends a letter the office does not carry', () => {
    const d = world(base, [del({ lettersJson: JSON.stringify({ MONEY: ['W'], PEOPLE: ['R', 'W'] }) })]);
    const l = lettersInSystem('vp', 'sys-choir', d, NOW);
    expect(l.MONEY).toEqual([]);
    expect(l.PEOPLE).toEqual(['R', 'W']);
  });
  it('stops when it expires, is revoked, or the lender’s office ends', () => {
    expect(lettersInSystem('vp', 'sys-choir', world(base, [del({ endDate: '2026-10-05' })]), NOW).MONEY).toEqual([]);
    expect(lettersInSystem('vp', 'sys-choir', world(base, [del({ status: 'REVOKED' })]), NOW).MONEY).toEqual([]);
    const ended = [pos('p1', 'pres', 'PRESIDENT', 'sys-choir', { status: 'ENDED' })];
    expect(lettersInSystem('vp', 'sys-choir', world(ended, [del()]), NOW).MONEY).toEqual([]);
  });
  it('a delegation cannot be passed on: it lends nothing to a third person', () => {
    const d = world(base, [del()]);
    expect(lettersInSystem('third', 'sys-choir', d, NOW).MONEY).toEqual([]);
  });
});

describe('deciding', () => {
  it('allows what is held and refuses what is not', () => {
    const d = world([pos('p1', 'tre', 'TREASURER', 'sys-choir')]);
    expect(decide('tre', 'sys-choir', 'MONEY', 'W', d, { now: NOW }).allowed).toBe(true);
    expect(decide('tre', 'sys-choir', 'MONEY', 'A', d, { now: NOW }).allowed).toBe(false);
  });
  it('nobody approves their own request', () => {
    const d = world([pos('p1', 'pres', 'PRESIDENT', 'sys-choir')]);
    expect(decide('pres', 'sys-choir', 'MONEY', 'A', d, { now: NOW, ownerPersonId: 'someone' }).allowed).toBe(true);
    const own = decide('pres', 'sys-choir', 'MONEY', 'A', d, { now: NOW, ownerPersonId: 'pres' });
    expect(own.allowed).toBe(false);
    expect(own.reason).toMatch(/own request/);
  });
});

describe('office rules and vacancies', () => {
  const P = [
    pos('a', 'ann', 'PRESIDENT', 'sys-choir', { orgUnitId: 'ou-choir' }),
    pos('b', 'bob', 'TREASURER', 'sys-choir', { orgUnitId: 'ou-choir' }),
  ];
  it('refuses a second president in one unit, a repeat holder, and a president who is also treasurer', () => {
    expect(findClash(P as any, { personId: 'cy', office: 'PRESIDENT', orgUnitId: 'ou-choir', systemId: 'sys-choir' }, NOW)?.code).toBe('OFFICE_TAKEN');
    expect(findClash(P as any, { personId: 'ann', office: 'PRESIDENT', orgUnitId: 'ou-choir', systemId: 'sys-choir' }, NOW)?.code).toBe('ALREADY_HOLDS');
    expect(findClash(P as any, { personId: 'ann', office: 'TREASURER', orgUnitId: 'ou-choir', systemId: 'sys-choir' }, NOW)?.code).toBe('OFFICE_TAKEN');
    expect(findClash([P[0]] as any, { personId: 'ann', office: 'TREASURER', orgUnitId: 'ou-choir', systemId: 'sys-choir' }, NOW)?.code).toBe('SEPARATION_OF_DUTIES');
  });
  it('allows the same office in another unit, and many coordinators and administrators', () => {
    expect(findClash(P as any, { personId: 'cy', office: 'PRESIDENT', orgUnitId: 'ou-youth', systemId: 'sys-youth' }, NOW)).toBeNull();
    const co = [pos('c', 'dee', 'COORDINATOR', 'sys-choir', { orgUnitId: 'ou-choir' })];
    expect(findClash(co as any, { personId: 'eve', office: 'COORDINATOR', orgUnitId: 'ou-choir', systemId: 'sys-choir' }, NOW)).toBeNull();
    const ad = [pos('d', 'f', 'ADMINISTRATOR', 'sys-media', { orgUnitId: 'ou-media' })];
    expect(findClash(ad as any, { personId: 'g', office: 'ADMINISTRATOR', orgUnitId: 'ou-media', systemId: 'sys-media' }, NOW)).toBeNull();
  });
  it('an ended holder leaves the seat free', () => {
    const ended = [pos('a', 'ann', 'PRESIDENT', 'sys-choir', { orgUnitId: 'ou-choir', status: 'ENDED' })];
    expect(findClash(ended as any, { personId: 'cy', office: 'PRESIDENT', orgUnitId: 'ou-choir', systemId: 'sys-choir' }, NOW)).toBeNull();
  });
  it('lists empty seats, terms ending soon and double holders', () => {
    const units = [
      { id: 'ou-church', name: 'Church', kind: 'CENTRAL', systemId: 'sys-main' },
      { id: 'ou-choir', name: 'Choir', kind: 'MINISTRY', systemId: 'sys-choir' },
    ];
    const positions = [
      pos('l', 'lead', 'CHURCH_LEADER', 'sys-main'),
      pos('c', 'cat', 'CATECHIST', 'sys-main', { endDate: '2026-11-15' }),
      pos('a', 'ann', 'PRESIDENT', 'sys-choir', { orgUnitId: 'ou-choir' }),
      pos('a2', 'amy', 'PRESIDENT', 'sys-choir', { orgUnitId: 'ou-choir' }),
    ];
    const r = computeVacancies(units as any, positions as any, NOW);
    expect(r.vacancies.filter((v) => v.reason === 'EMPTY').map((v) => `${v.unitId}:${v.office}`).sort()).toEqual([
      'ou-choir:SECRETARY', 'ou-choir:TREASURER', 'ou-church:CHURCH_SECRETARY',
    ]);
    expect(r.vacancies.find((v) => v.reason === 'ENDS_SOON')).toMatchObject({ office: 'CATECHIST', endsOn: '2026-11-15' });
    expect(r.conflicts).toEqual([{ unitId: 'ou-choir', unitName: 'Choir', office: 'PRESIDENT', positionIds: ['a', 'a2'] }]);
  });
});

/* ───────────── the routes ───────────── */

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.kind = s.id === 'sys-main' ? 'MAIN' : s.id === 'sys-finance' ? 'SHARED' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.orgUnit.push(
    { id: 'ou-church', name: 'ADEPR Kacyiru', code: 'KAC', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-choir', name: 'Choir', code: 'KAC-MUS-CHO', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-choir' },
    { id: 'ou-youth', name: 'Youth', code: 'KAC-YOU', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
    { id: 'ou-media', name: 'Media', code: 'KAC-MED', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-media' },
  );
  for (const id of ['p-admin1', 'p-admin2', 'p-new', 'p-vp']) {
    db.person.push({ id, fullName: id, status: 'ACTIVE', email: `${id}@x.org` });
  }
  db.person.push({ id: 'p-visitor', fullName: 'Visitor', status: 'VISITOR' });
  db.person.push({ id: 'p-gone', fullName: 'Gone', status: 'ACTIVE', archivedAt: new Date('2025-01-01') });
  db.position.push(
    { id: 'pos-ad1', personId: 'p-admin1', systemId: 'sys-media', orgUnitId: 'ou-media', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: new Date('2024-01-01') },
    { id: 'pos-ad2', personId: 'p-admin2', systemId: 'sys-media', orgUnitId: 'ou-media', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: new Date('2024-01-01') },
  );
  db.membership.push({ id: 'mem-vp', personId: 'p-vp', systemId: 'sys-choir', type: 'MINISTRY_MEMBER', label: 'Choir member', status: 'ACTIVE', startDate: new Date('2021-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const appoint = (as: string, body: object) => request(app).post('/api/access/appointments').set(bearer(as)).send(body);
const caps = async (as: string, sys: string) => {
  const r = await request(app).get('/api/me/capabilities').set(bearer(as));
  return r.body.systems.find((s: any) => s.id === sys);
};

describe('appointments', () => {
  it('need sign-in, and only an Administrator assigns offices', async () => {
    expect((await request(app).post('/api/access/appointments').send({})).status).toBe(401);
    const r = await appoint('p-choir-leader', { personId: 'p-new', orgUnitId: 'ou-choir', office: 'SECRETARY' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NOT_ALLOWED');
  });
  it('an Administrator assigns, the person gets the matrix letters at once, and it is audited', async () => {
    expect(await caps('p-new', 'sys-choir')).toBeUndefined();
    const r = await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-choir', office: 'SECRETARY' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const row = fake.__db.position.find((p: any) => p.id === r.body.appointment.id);
    expect(row).toMatchObject({ office: 'SECRETARY', ministryOffice: 'SECRETARY', systemId: 'sys-choir', orgUnitId: 'ou-choir', status: 'ACTIVE' });
    const a = fake.__db.auditEvent.find((e: any) => e.action === 'APPOINTED');
    expect(a).toMatchObject({ actorId: 'p-admin1' });
    expect(JSON.parse(a.metaJson)).toMatchObject({ office: 'SECRETARY', personId: 'p-new' });
  });
  it('one live holder per office per unit, and no president who is also treasurer', async () => {
    const r = await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-choir', office: 'PRESIDENT' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('OFFICE_TAKEN');
    const sod = await appoint('p-admin1', { personId: 'p-choir-leader', orgUnitId: 'ou-choir', office: 'TREASURER' });
    expect(sod.body.code).toBe('SEPARATION_OF_DUTIES');
  });
  it('only an active person, and only an office that fits the unit', async () => {
    expect((await appoint('p-admin1', { personId: 'p-visitor', orgUnitId: 'ou-youth', office: 'SECRETARY' })).body.code).toBe('PERSON_NOT_ACTIVE');
    expect((await appoint('p-admin1', { personId: 'p-gone', orgUnitId: 'ou-youth', office: 'SECRETARY' })).body.code).toBe('PERSON_NOT_ACTIVE');
    expect((await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-youth', office: 'CATECHIST' })).body.code).toBe('OFFICE_NOT_IN_UNIT');
    expect((await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-choir', office: 'ADMINISTRATOR' })).body.code).toBe('OFFICE_NOT_IN_UNIT');
    expect((await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-nope', office: 'SECRETARY' })).status).toBe(404);
    expect((await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-youth', office: 'SECRETARY', startDate: '2026-05-01', endDate: '2026-04-01' })).body.code).toBe('BAD_DATES');
  });
  it('an Administrator assigns Administrators in Media', async () => {
    const r = await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-media', office: 'ADMINISTRATOR' });
    expect(r.status).toBe(201);
    expect(fake.__db.position.find((p: any) => p.id === r.body.appointment.id).systemAdmin).toBe(true);
  });
  it('the Church Leader cannot assign or end anything, their own seat included', async () => {
    const mine = await appoint('p-pastor', { personId: 'p-new', orgUnitId: 'ou-choir', office: 'SECRETARY' });
    expect(mine.status).toBe(403);
    const end = await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-pastor')).send({ reason: 'stepping down' });
    expect(end.body.code).toBe('NOT_ALLOWED');
    const own = await request(app).post('/api/access/appointments/pos-pastor/end').set(bearer('p-pastor')).send({ reason: 'stepping down' });
    expect(own.body.code).toBe('NOT_ALLOWED');
  });
  it('the Church Leader seat is handed over by an Administrator: end the old holder, assign the new one', async () => {
    const taken = await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-church', office: 'CHURCH_LEADER' });
    expect(taken.body.code).toBe('OFFICE_TAKEN');
    const ended = await request(app).post('/api/access/appointments/pos-pastor/end').set(bearer('p-admin1')).send({ reason: 'term finished' });
    expect(ended.status, JSON.stringify(ended.body)).toBe(200);
    const filled = await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-church', office: 'CHURCH_LEADER' });
    expect(filled.status, JSON.stringify(filled.body)).toBe(201);
    expect(fake.__db.position.find((p: any) => p.id === filled.body.appointment.id)).toMatchObject({ systemRole: 'CHURCH_LEADER', grantsAllSystems: true });
  });
  it('an Administrator cannot end their own appointment', async () => {
    const r = await request(app).post('/api/access/appointments/pos-ad1/end').set(bearer('p-admin1')).send({ reason: 'stepping down' });
    expect(r.body.code).toBe('CANNOT_END_OWN_OFFICE');
  });
});

describe('ending an office', () => {
  it('removes access at once, keeps the record, and is audited with the reason', async () => {
    expect((await caps('p-choir-leader', 'sys-choir')).blocks.money).toContain('A');
    const r = await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-admin1')).send({ reason: 'moved away' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await caps('p-choir-leader', 'sys-choir')).toBeUndefined();
    const row = fake.__db.position.find((p: any) => p.id === 'pos-choir');
    expect(row.status).toBe('ENDED');
    expect(row.endDate).toBeInstanceOf(Date);
    const ev = fake.__db.auditEvent.find((e: any) => e.action === 'OFFICE_ENDED');
    expect(JSON.parse(ev.metaJson)).toMatchObject({ office: 'PRESIDENT', reason: 'moved away' });
  });
  it('needs a reason, an Administrator, and an office that is still live', async () => {
    expect((await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-admin1')).send({})).status).toBe(400);
    expect((await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-choir-leader')).send({ reason: 'no' + 'pe' })).status).toBe(403);
    await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-admin1')).send({ reason: 'done here' });
    expect((await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-admin1')).send({ reason: 'done here' })).body.code).toBe('ALREADY_ENDED');
    expect((await request(app).post('/api/access/appointments/pos-zzz/end').set(bearer('p-admin1')).send({ reason: 'done here' })).status).toBe(404);
  });
  it('the church keeps at least two Administrators', async () => {
    expect(MIN_ADMINISTRATORS).toBe(2);
    const r = await request(app).post('/api/access/appointments/pos-ad1/end').set(bearer('p-admin2')).send({ reason: 'left the church' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NEEDS_TWO_ADMINISTRATORS');
    await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-media', office: 'ADMINISTRATOR' });
    const ok = await request(app).post('/api/access/appointments/pos-ad1/end').set(bearer('p-admin2')).send({ reason: 'left the church' });
    expect(ok.status).toBe(200);
  });
  it('a term can be set or moved, but only into the future', async () => {
    const ok = await request(app).post('/api/access/appointments/pos-choir/term').set(bearer('p-admin1')).send({ endDate: '2027-12-31' });
    expect(ok.body.endDate).toBe('2027-12-31');
    expect((await request(app).post('/api/access/appointments/pos-choir/term').set(bearer('p-admin1')).send({ endDate: '2020-01-01' })).body.code).toBe('BAD_DATES');
    expect((await request(app).post('/api/access/appointments/pos-choir/term').set(bearer('p-choir-leader')).send({ endDate: '2027-12-31' })).status).toBe(403);
  });
});

describe('the old position routes obey the same rules', () => {
  it('refuse a second president and a president who is also treasurer', async () => {
    const r = await request(app).post('/api/participation/positions').set(bearer('p-pastor')).send({
      personId: 'p-new', title: 'President', systemId: 'sys-choir', orgUnitId: 'ou-choir', office: 'PRESIDENT',
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('OFFICE_TAKEN');
  });
});

describe('delegation', () => {
  const lend = (as: string, body: object) => request(app).post('/api/access/delegations').set(bearer(as)).send(body);
  const ok = { positionId: 'pos-choir', toPersonId: 'p-vp', letters: { MONEY: ['A'], MISSION: ['W'] }, endDate: '2099-01-01' };
  const soon = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  it('lends the letters named, only to an active person, and the delegate sees them at once', async () => {
    const r = await lend('p-choir-leader', { ...ok, endDate: soon() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.delegation.letters).toEqual({ MONEY: ['A', 'R'], MISSION: ['W', 'R'] });
    const c = await caps('p-vp', 'sys-choir');
    expect(c.blocks.money).toEqual(['R', 'A']);
    expect(c.blocks.work).toEqual(['R', 'W']);
    expect(c.blocks.people).toEqual([]);
    expect(fake.__db.auditEvent.some((e: any) => e.action === 'DELEGATED')).toBe(true);
  });
  it('refuses letters the office does not carry, too long, past the term, to oneself, or from an office not held', async () => {
    expect((await lend('p-choir-leader', { ...ok, endDate: soon(), letters: {} })).body.code).toBe('NO_LETTERS');
    expect((await lend('p-choir-leader', { ...ok, endDate: soon(), letters: { MONEY: ['W'] } })).body.code).toBe('LETTERS_NOT_HELD');
    expect((await lend('p-choir-leader', { ...ok })).body.code).toBe('DELEGATION_TOO_LONG');
    fake.__db.position.find((p: any) => p.id === 'pos-choir').endDate = new Date(Date.now() + 5 * 86400000);
    expect((await lend('p-choir-leader', { ...ok, endDate: soon() })).body.code).toBe('PAST_TERM');
    expect((await lend('p-choir-leader', { ...ok, toPersonId: 'p-choir-leader', endDate: soon() })).body.code).toBe('SELF');
    expect((await lend('p-vp', { ...ok, endDate: soon() })).body.code).toBe('NOT_YOUR_OFFICE');
    expect((await lend('p-choir-leader', { ...ok, toPersonId: 'p-gone', endDate: soon() })).body.code).toBe('PERSON_NOT_ACTIVE');
  });
  it('an Administrator’s duties cannot be lent', async () => {
    expect((await lend('p-admin1', { positionId: 'pos-ad1', toPersonId: 'p-new', letters: { PEOPLE: ['W'] }, endDate: soon() })).body.code).toBe('NOT_DELEGABLE');
  });
  it('ending the lender’s office ends the delegation at once', async () => {
    await lend('p-choir-leader', { ...ok, endDate: soon() });
    await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-admin1')).send({ reason: 'moved away' });
    const c = await caps('p-vp', 'sys-choir');
    expect(c.blocks.money).toEqual([]);
    expect(fake.__db.delegation[0].status).toBe('REVOKED');
  });
  it('the lender or an Administrator takes letters back; others cannot', async () => {
    const r = await lend('p-choir-leader', { ...ok, endDate: soon() });
    const id = fake.__db.delegation[0].id;
    expect((await request(app).post(`/api/access/delegations/${id}/revoke`).set(bearer('p-youth-leader'))).status).toBe(403);
    expect((await request(app).post(`/api/access/delegations/${id}/revoke`).set(bearer('p-admin1'))).status).toBe(200);
    expect((await request(app).post(`/api/access/delegations/${id}/revoke`).set(bearer('p-admin1'))).body.code).toBe('ALREADY_REVOKED');
    expect(r.status).toBe(201);
  });
  it('lists given and received, and everything only for the Leader and Administrators', async () => {
    await lend('p-choir-leader', { ...ok, endDate: soon() });
    const given = await request(app).get('/api/access/delegations').set(bearer('p-choir-leader'));
    expect(given.body.given).toHaveLength(1);
    expect(given.body.received).toHaveLength(0);
    const got = await request(app).get('/api/access/delegations').set(bearer('p-vp'));
    expect(got.body.received[0]).toMatchObject({ fromName: 'p-choir-leader', live: true });
    const all = await request(app).get('/api/access/delegations?all=true').set(bearer('p-youth-leader'));
    expect(all.body.all).toBeUndefined();
    const lead = await request(app).get('/api/access/delegations?all=true').set(bearer('p-pastor'));
    expect(lead.body.all).toBeUndefined();
    const adm = await request(app).get('/api/access/delegations?all=true').set(bearer('p-admin1'));
    expect(adm.body.all).toHaveLength(1);
  });
});

describe('vacancies and appointments list', () => {
  it('lists empty seats and the Administrator count; hides them from plain members', async () => {
    const r = await request(app).get('/api/access/vacancies').set(bearer('p-pastor'));
    expect(r.status).toBe(200);
    expect(r.body.administrators).toEqual({ count: 2, minimum: 2 });
    const empty = r.body.vacancies.filter((v: any) => v.reason === 'EMPTY').map((v: any) => `${v.unitId}:${v.office}`);
    expect(empty).toContain('ou-choir:SECRETARY');
    expect(empty).not.toContain('ou-choir:PRESIDENT');
    expect((await request(app).get('/api/access/vacancies').set(bearer('p-member'))).status).toBe(403);
  });
  it('filling a seat removes the vacancy', async () => {
    await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-choir', office: 'SECRETARY' });
    const r = await request(app).get('/api/access/vacancies').set(bearer('p-pastor'));
    expect(r.body.vacancies.some((v: any) => v.unitId === 'ou-choir' && v.office === 'SECRETARY')).toBe(false);
  });
  it('lists live appointments with names, units and the powers of the reader', async () => {
    const r = await request(app).get('/api/access/appointments?unitId=ou-choir').set(bearer('p-admin1'));
    expect(r.body.canAppoint).toBe(true);
    expect((await request(app).get('/api/access/appointments?unitId=ou-choir').set(bearer('p-pastor'))).body.canAppoint).toBe(false);
    expect(r.body.appointments).toEqual([expect.objectContaining({ id: 'pos-choir', office: 'PRESIDENT', unitName: 'Choir', live: true })]);
    const t = await request(app).get('/api/access/appointments').set(bearer('p-treasurer'));
    expect(t.status).toBe(403);
    const pres = await request(app).get('/api/access/appointments').set(bearer('p-choir-leader'));
    expect(pres.body.canAppoint).toBe(false);
  });
  it('shows ended appointments only when asked', async () => {
    await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-admin1')).send({ reason: 'moved away' });
    const live = await request(app).get('/api/access/appointments?unitId=ou-choir').set(bearer('p-pastor'));
    expect(live.body.appointments).toHaveLength(0);
    const all = await request(app).get('/api/access/appointments?unitId=ou-choir&ended=true').set(bearer('p-pastor'));
    expect(all.body.appointments[0]).toMatchObject({ id: 'pos-choir', live: false, status: 'ENDED' });
  });
});

describe('the explainer and the audit trail', () => {
  it('serves the matrix to Administrators only', async () => {
    expect((await request(app).get('/api/access/matrix')).status).toBe(401);
    expect((await request(app).get('/api/access/matrix').set(bearer('p-member'))).status).toBe(403);
    expect((await request(app).get('/api/access/matrix').set(bearer('p-pastor'))).status).toBe(403);
    const r = await request(app).get('/api/access/matrix').set(bearer('p-admin1'));
    expect(r.body.offices.map((o: any) => o.code)).toEqual([...OFFICE_CODES]);
    expect(r.body.letters).toHaveLength(7);
    expect(r.body.limits).toEqual({ minAdministrators: 2, delegationMaxDays: 90 });
  });
  it('explains my own access, with where every letter comes from', async () => {
    const r = await request(app).get('/api/access/me').set(bearer('p-choir-leader'));
    const choir = r.body.systems.find((s: any) => s.id === 'sys-choir');
    expect(choir.letters.MONEY).toEqual(['R', 'V', 'A']);
    expect(choir.why.MONEY.find((x: any) => x.letter === 'A')).toMatchObject({ from: 'President', via: 'OFFICE' });
    expect(r.body.systems.find((s: any) => s.id === 'sys-youth')).toBeUndefined();
    expect(r.body.powers).toMatchObject({ canAppoint: false, canReadAudit: false, canExplainOthers: false });
    const lead = await request(app).get('/api/access/me').set(bearer('p-pastor'));
    expect(lead.body.powers).toMatchObject({ canAppoint: false, canAppointLeader: false, canReadAudit: false, canExplainOthers: false });
    const adm = await request(app).get('/api/access/me').set(bearer('p-admin1'));
    expect(adm.body.powers).toMatchObject({ canAppoint: true, canAppointLeader: true, canExplainOthers: true, canReadAudit: true, canReadMatrix: true });
  });
  it('shows a delegate which letters are borrowed', async () => {
    await request(app).post('/api/access/delegations').set(bearer('p-choir-leader')).send({ positionId: 'pos-choir', toPersonId: 'p-vp', letters: { MONEY: ['A'] }, endDate: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10) });
    const r = await request(app).get('/api/access/me').set(bearer('p-vp'));
    const choir = r.body.systems.find((s: any) => s.id === 'sys-choir');
    expect(choir.why.MONEY.find((x: any) => x.letter === 'A')).toMatchObject({ from: 'President (delegated)', via: 'DELEGATION' });
    expect(r.body.delegated).toHaveLength(1);
  });
  it('only Administrators explain other people', async () => {
    expect((await request(app).get('/api/access/explain/p-choir-leader').set(bearer('p-youth-leader'))).status).toBe(403);
    expect((await request(app).get('/api/access/explain/p-choir-leader').set(bearer('p-pastor'))).status).toBe(403);
    expect((await request(app).get('/api/access/explain/p-choir-leader').set(bearer('p-admin1'))).status).toBe(200);
    expect((await request(app).get('/api/access/explain/p-zzz').set(bearer('p-admin1'))).status).toBe(404);
    expect((await request(app).get('/api/access/explain/p-member').set(bearer('p-member'))).status).toBe(200);
  });
  it('shows the audit trail, newest first, to the Leader and Administrators only', async () => {
    await appoint('p-admin1', { personId: 'p-new', orgUnitId: 'ou-choir', office: 'SECRETARY' });
    await new Promise((r) => setTimeout(r, 10));
    await request(app).post('/api/access/appointments/pos-choir/end').set(bearer('p-admin1')).send({ reason: 'moved away' });
    const r = await request(app).get('/api/access/audit').set(bearer('p-admin2'));
    expect(r.status).toBe(200);
    expect(r.body.events.map((e: any) => e.action)).toEqual(['OFFICE_ENDED', 'APPOINTED']);
    expect(r.body.events[0]).toMatchObject({ actorName: 'p-admin1' });
    expect((await request(app).get('/api/access/audit').set(bearer('p-choir-leader'))).status).toBe(403);
  });
});

describe('capabilities now come from the letters engine', () => {
  it('the Church Leader holds the matrix letters in every system, a member only the basics', async () => {
    const lead = await caps('p-pastor', 'sys-youth');
    expect(lead.blocks.money).toEqual(['R', 'V', 'A']);
    expect(lead.blocks.reports).toEqual(['R', 'W', 'P']);
    const member = await caps('p-member', 'sys-main');
    expect(member.blocks.work).toEqual(['R']);
    expect(member.blocks.money).toEqual([]);
  });
});
