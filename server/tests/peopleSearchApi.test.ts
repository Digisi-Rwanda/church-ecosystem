import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const post = (as: string, body: object) => request(app).post('/api/people/search').set(bearer(as)).send(body);
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const ids = (r: any) => (r.body.people ?? []).map((p: any) => p.id);
const c = (field: string, op: string, value?: unknown) => ({ field, op, ...(value === undefined ? {} : { value }) });
const all = (...conditions: object[]) => ({ match: { all: conditions } });

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'setting', 'notification', 'notificationRead', 'preference', 'auditEvent', 'personRecord']) db[k] ??= [];
  for (const s of db.churchSystem) { s.code = s.id; s.name = s.id; s.shortName = s.id; s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY'; s.basePath = `/${s.id}`; }
  db.orgUnit.push(
    { id: 'ou-church', name: 'Church', code: 'K', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-music', name: 'Music', code: 'K-M', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-music' },
    { id: 'ou-youth', name: 'Youth', code: 'K-Y', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
  );
  const at = new Date('2022-01-01');
  const person = (id: string, over: object = {}) => db.person.push({ id, fullName: id, status: 'ACTIVE', ...over });
  // The people we search: three in Music, one in Youth (hidden from the Music president), one archived.
  person('p-a', { fullName: 'Aaron', gender: 'MALE', dateOfBirth: '1980-01-01', memberCode: 'K-001' });
  person('p-b', { fullName: 'Bella', gender: 'FEMALE', dateOfBirth: '1985-01-01' });
  person('p-c', { fullName: 'Carine', gender: 'FEMALE', dateOfBirth: '1995-05-05', status: 'INACTIVE' });
  person('p-y', { fullName: 'Yves Hidden', gender: 'MALE', dateOfBirth: '1990-01-01' });
  person('p-old', { fullName: 'Archie Retired', gender: 'MALE', archivedAt: new Date('2025-01-01') });
  // Offices.
  person('p-sec'); person('p-cat'); person('p-admin'); person('p-music-pres');
  db.position.push(
    { id: 'pos-sec', personId: 'p-sec', systemId: 'sys-main', orgUnitId: 'ou-church', title: 'Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: at },
    { id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', orgUnitId: 'ou-church', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: at },
    { id: 'pos-ad', personId: 'p-admin', systemId: 'sys-music', orgUnitId: 'ou-music', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: at },
    { id: 'pos-mp', personId: 'p-music-pres', systemId: 'sys-music', orgUnitId: 'ou-music', title: 'Music President', office: 'PRESIDENT', status: 'ACTIVE', startDate: at },
  );
  const m = (id: string, unit: string, system: string) => db.membership.push({ id: `m-${id}`, personId: id, systemId: system, orgUnitId: unit, type: 'MINISTRY_MEMBER', status: 'ACTIVE', startDate: new Date('2020-01-01') });
  for (const id of ['p-a', 'p-b', 'p-c']) m(id, 'ou-music', 'sys-music');
  m('p-y', 'ou-youth', 'sys-youth');
  m('p-a', 'ou-youth', 'sys-youth'); // Aaron is in both: Music's president must not learn this
  const rec = (personId: string, section: string, data: object, status = 'CURRENT') => db.personRecord.push({ id: `r-${db.personRecord.length}`, personId, section, dataJson: JSON.stringify(data), status, recordedById: 'p-pastor', recordedAt: new Date() });
  rec('p-a', 'BAPTISM', { date: '2005-01-01' });
  rec('p-a', 'EMPLOYMENT', { status: 'EMPLOYED', sector: 'FINANCE', since: '2015-01-01' });
  rec('p-a', 'EDUCATION', { level: 'BACHELOR', field: 'Accounting' });
  rec('p-a', 'FAMILY', { relation: 'CHILD', name: 'Kid One' }); rec('p-a', 'FAMILY', { relation: 'CHILD', name: 'Kid Two' });
  rec('p-a', 'FAMILY', { relation: 'SPOUSE', name: 'Bella' });
  rec('p-a', 'MARRIAGE', { date: '2008-01-01' });
  rec('p-a', 'CALLING', { name: 'Treasurer', orgUnitId: 'ou-youth' });
  rec('p-b', 'BAPTISM', { date: '2022-01-01' });
  rec('p-b', 'BAPTISM', { date: '1990-01-01' }, 'SUPERSEDED'); // old, replaced: must not count
  rec('p-b', 'EMPLOYMENT', { status: 'STUDENT', since: '2010-01-01' });
  rec('p-b', 'MARRIAGE', { date: '2008-01-01', endedOn: '2023-01-01', endedBy: 'DEATH' });
  rec('p-c', 'BAPTISM', { date: '1980-01-01' }, 'VOIDED'); // voided: must not count
  rec('p-y', 'BAPTISM', { date: '2000-01-01' });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('POST /api/people/search: new request shape', () => {
  it('chains conditions with AND, lists each person once, and reports an exact total and page', async () => {
    const r = await post('p-pastor', all(c('gender', 'is', 'MALE'), c('unit', 'includesAny', ['ou-music']), c('baptismYears', 'atLeast', 10), c('childCount', 'atLeast', 2), c('educationLevel', 'atLeast', 'BACHELOR'), c('employedYears', 'atLeast', 5)));
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(['p-a']);
    expect(r.body).toMatchObject({ total: 1, offset: 0, limit: 50, page: { limit: 50, offset: 0, hasMore: false } });
    expect(r.body.people[0]).toMatchObject({ id: 'p-a', children: 2, marital: 'MARRIED' });
  });
  it('grouped OR, combined with AND', async () => {
    const r = await post('p-pastor', { match: { all: [c('unit', 'includesAny', ['ou-music'])], anyGroups: [{ any: [c('marital', 'is', 'WIDOWED'), c('employmentSector', 'is', 'FINANCE')] }] } });
    expect(ids(r)).toEqual(['p-a', 'p-b']);
    const two = await post('p-pastor', { match: { anyGroups: [{ any: [c('marital', 'is', 'WIDOWED'), c('employmentSector', 'is', 'FINANCE')] }, { any: [c('gender', 'is', 'FEMALE')] }] } });
    expect(ids(two)).toEqual(['p-b']);
  });
  it('missing values: "is not" includes people with no value, positive comparisons do not', async () => {
    expect(ids(await post('p-pastor', all(c('unit', 'includesAny', ['ou-music']), c('employmentSector', 'isNot', 'FINANCE'))))).toEqual(['p-b', 'p-c']);
    expect(ids(await post('p-pastor', all(c('unit', 'includesAny', ['ou-music']), c('baptismYears', 'atLeast', 0))))).toEqual(['p-a', 'p-b']); // p-c: voided baptism is not a baptism
    expect(ids(await post('p-pastor', all(c('unit', 'includesAny', ['ou-music']), c('childCount', 'equals', 0))))).toEqual(['p-b', 'p-c']);
  });
  it('a superseded or voided record never counts', async () => {
    expect(ids(await post('p-pastor', all(c('baptismYears', 'atLeast', 30))))).toEqual([]);
    expect(ids(await post('p-pastor', all(c('baptised', 'isNo'), c('unit', 'includesAny', ['ou-music']))))).toEqual(['p-c']);
  });
  it('callings: role and unit in one condition belong to the same calling', async () => {
    expect(ids(await post('p-pastor', all(c('calling', 'anyMatch', { name: 'treasurer', unitId: 'ou-youth' }))))).toEqual(['p-a']);
    expect(ids(await post('p-pastor', all(c('calling', 'anyMatch', { name: 'treasurer', unitId: 'ou-music' }))))).toEqual([]);
  });
  it('sorts, and pages with a true total', async () => {
    const r = await post('p-pastor', { ...all(c('unit', 'includesAny', ['ou-music'])), sort: { field: 'age', dir: 'asc' }, page: { limit: 2, offset: 0 } });
    expect(ids(r)).toEqual(['p-c', 'p-b']);
    expect(r.body).toMatchObject({ total: 3, page: { hasMore: true } });
    expect(ids(await post('p-pastor', { ...all(c('unit', 'includesAny', ['ou-music'])), sort: { field: 'age', dir: 'asc' }, page: { limit: 2, offset: 2 } }))).toEqual(['p-a']);
    expect(ids(await post('p-pastor', { ...all(c('unit', 'includesAny', ['ou-music'])), sort: { field: 'name', dir: 'desc' } }))).toEqual(['p-c', 'p-b', 'p-a']);
    expect(ids(await post('p-pastor', { ...all(c('unit', 'includesAny', ['ou-music'])), sort: { field: 'name', dir: 'asc' } }))).toEqual(['p-a', 'p-b', 'p-c']);
  });
  it('the quick search and status filter keep working', async () => {
    expect(ids(await post('p-pastor', { q: 'aar' }))).toEqual(['p-a']);
    expect(ids(await post('p-pastor', { q: 'k-001' }))).toEqual(['p-a']);
    expect(ids(await post('p-pastor', all(c('status', 'is', 'INACTIVE'), c('unit', 'includesAny', ['ou-music']))))).toEqual(['p-c']);
  });
  it('archived people stay out unless asked for', async () => {
    expect(ids(await post('p-pastor', { q: 'archie' }))).toEqual([]);
    expect(ids(await post('p-pastor', { q: 'archie', archived: true }))).toEqual(['p-old']);
  });
  it('bad requests are 400 and never echo what was sent', async () => {
    for (const body of [
      { match: { all: [c('secretField', 'is', 'x')] } }, { match: { all: [c('name', 'regex', 'x')] } }, { match: { all: [c('childCount', 'atLeast', 'many')] } },
      { page: { limit: 101 } }, { page: { limit: 0 } }, { page: { offset: -5 } }, { sort: { field: 'password', dir: 'asc' } }, { sort: { field: 'childCount', dir: 'asc' } },
      { match: { all: Array(13).fill(c('name', 'contains', 'a')) } }, { match: { anyGroups: Array(5).fill({ any: [c('name', 'contains', 'a')] }) } },
      { match: { anyGroups: [{ any: [{ any: [] }] }] } },
      { where: { fullName: 'x' } }, { orderBy: { fullName: 'asc' } }, { select: { email: true } }, { criteria: { gender: 'MALE' }, match: {} }, { q: 'x'.repeat(81) }, { systemId: 5 }, { archived: 'yes' },
    ]) {
      const r = await post('p-pastor', body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.code).toBe('BAD_INPUT');
      expect(JSON.stringify(r.body)).not.toMatch(/secretField|password|fullName|email/);
    }
  });
  it('request values never reach the database as field names, paths or SQL', async () => {
    const before = JSON.stringify(fake.__db.person);
    for (const value of ["'; DROP TABLE \"Person\"; --", '{"$gt":""}', '../../etc/passwd', '%', '\\u0000']) {
      const r = await post('p-pastor', all(c('name', 'contains', value)));
      expect(r.status).toBe(200);
      expect(ids(r)).toEqual([]);
    }
    expect(JSON.stringify(fake.__db.person)).toBe(before);
    for (const field of ['name"; DROP TABLE x;--', 'person.email', 'dataJson', 'id', '$where', '__proto__', 'constructor']) {
      expect((await post('p-pastor', all(c(field, 'contains', 'a')))).status).toBe(400);
    }
    const proto = await request(app).post('/api/people/search').set(bearer('p-pastor')).set('Content-Type', 'application/json').send('{"match":{"all":[{"field":"name","op":"contains","value":{"__proto__":"x"}}]}}');
    expect(proto.status).toBe(400);
  });
});

describe('POST /api/people/search: old request shape still works, with the same answers', () => {
  const legacy = (as: string, criteria: object, extra: object = {}) => post(as, { criteria, ...extra });
  it('answers identically in both shapes', async () => {
    const pairs: Array<[object, object]> = [
      [{ gender: 'MALE', unitIds: ['ou-music'], baptismYearsMin: 10 }, all(c('gender', 'is', 'MALE'), c('unit', 'includesAny', ['ou-music']), c('baptismYears', 'atLeast', 10))],
      [{ marital: ['WIDOWED'] }, all(c('marital', 'isAny', ['WIDOWED']))],
      [{ childrenMin: 2 }, all(c('childCount', 'atLeast', 2))],
      [{ childrenMax: 0, unitIds: ['ou-music'] }, all(c('childCount', 'atMost', 0), c('unit', 'includesAny', ['ou-music']))],
      [{ sector: ['FINANCE'], educationMin: 'BACHELOR' }, all(c('employmentSector', 'isAny', ['FINANCE']), c('educationLevel', 'atLeast', 'BACHELOR'))],
      [{ status: ['INACTIVE'] }, all(c('status', 'isAny', ['INACTIVE']))],
      [{ ageMin: 35, ageMax: 50 }, all(c('age', 'atLeast', 35), c('age', 'atMost', 50))],
      [{ callingName: 'treas', callingUnitId: 'ou-youth' }, all(c('calling', 'anyMatch', { name: 'treas', unitId: 'ou-youth' }))],
      [{ q: 'bel' }, { q: 'bel' }],
    ];
    for (const [old, fresh] of pairs) {
      const a = await legacy('p-pastor', old), b = await post('p-pastor', fresh);
      expect([a.status, b.status], JSON.stringify(old)).toEqual([200, 200]);
      expect(ids(a), JSON.stringify(old)).toEqual(ids(b));
      expect(a.body.total).toBe(b.body.total);
    }
  });
  it('keeps its response fields, its limits and its refusals', async () => {
    const r = await legacy('p-pastor', { unitIds: ['ou-music'] }, { limit: 2, offset: 1 });
    expect(r.body).toMatchObject({ total: 3, offset: 1, limit: 2 });
    expect(r.body.people).toHaveLength(2);
    expect((await legacy('p-pastor', { secret: 1 })).status).toBe(400);
    expect((await legacy('p-pastor', { childrenMin: -1 })).status).toBe(400);
    expect((await legacy('p-pastor', {}, { limit: 200 })).status).toBe(200);
    expect((await legacy('p-pastor', {}, { limit: 201 })).status).toBe(400);
    const f = await legacy('p-sec', { gender: 'MALE' });
    expect(f.status).toBe(403);
    expect(f.body).toMatchObject({ code: 'FIELD_NOT_ALLOWED', fields: ['gender'] });
    expect((await legacy('p-music-pres', { unitIds: ['ou-youth'] }, { systemId: 'sys-music' })).body.code).toBe('UNIT_NOT_ALLOWED');
  });
});

describe('who may use which field (manually constructed requests)', () => {
  const body = (...conditions: object[]) => all(...conditions);
  const refused = async (as: string, b: object, systemId?: string) => {
    const r = await post(as, systemId ? { ...b, systemId } : b);
    return [r.status, r.body.code, r.body.fields] as const;
  };
  it('the Church Leader may use every field, including marital status, age and gender', async () => {
    for (const cond of [c('gender', 'is', 'MALE'), c('age', 'atLeast', 1), c('marital', 'is', 'MARRIED'), c('calling', 'anyMatch', { name: 'x' }), c('childCount', 'atLeast', 0), c('hasSpouseRecorded', 'isYes')]) {
      expect((await post('p-pastor', body(cond))).status).toBe(200);
    }
  });
  it('the secretary and the catechist may use work, education, baptism, family and calling, but not marital status, age or gender', async () => {
    for (const as of ['p-sec', 'p-cat']) {
      for (const cond of [c('baptismYears', 'atLeast', 1), c('employmentSector', 'is', 'FINANCE'), c('educationLevel', 'atLeast', 'BACHELOR'), c('childCount', 'atLeast', 1), c('calling', 'anyMatch', { name: 'x' })]) {
        expect((await post(as, body(cond))).status, `${as} ${cond.field}`).toBe(200);
      }
      expect(await refused(as, body(c('marital', 'is', 'MARRIED')))).toEqual([403, 'FIELD_NOT_ALLOWED', ['marital']]);
      expect(await refused(as, body(c('gender', 'is', 'MALE')))).toEqual([403, 'FIELD_NOT_ALLOWED', ['gender']]);
      expect(await refused(as, body(c('age', 'atLeast', 1)))).toEqual([403, 'FIELD_NOT_ALLOWED', ['age']]);
      expect((await post(as, { sort: { field: 'age', dir: 'asc' } })).status).toBe(403);
    }
  });
  it('a unit president may only filter on name, code, status and unit, whichever way the condition is written', async () => {
    const attempts = [c('gender', 'is', 'MALE'), c('age', 'atLeast', 1), c('baptised', 'isYes'), c('baptismYears', 'atLeast', 1), c('employmentSector', 'isNot', 'FINANCE'), c('educationLevel', 'atLeast', 'BACHELOR'), c('childCount', 'atLeast', 0), c('marital', 'isNot', 'WIDOWED'), c('hasSpouseRecorded', 'isNo'), c('calling', 'noneMatch', { name: 'x' })];
    for (const cond of attempts) {
      expect(await refused('p-music-pres', body(cond), 'sys-music'), `all ${cond.field}`).toEqual([403, 'FIELD_NOT_ALLOWED', [cond.field]]);
      expect((await post('p-music-pres', { match: { anyGroups: [{ any: [c('name', 'contains', 'a'), cond] }] }, systemId: 'sys-music' })).body.code, `group ${cond.field}`).toBe('FIELD_NOT_ALLOWED');
    }
    for (const field of ['age', 'baptismDate']) expect((await post('p-music-pres', { sort: { field, dir: 'asc' }, systemId: 'sys-music' })).status).toBe(403);
    expect((await post('p-music-pres', { ...body(c('name', 'contains', 'a'), c('status', 'is', 'ACTIVE'), c('unit', 'includesAny', ['ou-music'])), systemId: 'sys-music' })).status).toBe(200);
    expect(JSON.stringify((await post('p-music-pres', { systemId: 'sys-music' })).body)).not.toMatch(/marital|children/);
  });
  it('an administrator searching names to appoint someone may use only the open fields', async () => {
    expect((await post('p-admin', body(c('name', 'contains', 'a')))).status).toBe(200);
    expect((await post('p-admin', body(c('gender', 'is', 'MALE')))).body.code).toBe('FIELD_NOT_ALLOWED');
    expect((await post('p-admin', body(c('baptised', 'isYes')))).body.code).toBe('FIELD_NOT_ALLOWED');
  });
  it('an ordinary member may not search the people list at all', async () => {
    expect((await post('p-member', body(c('name', 'contains', 'a')))).status).toBe(403);
    expect((await get('p-member', '/api/people/filter-schema')).status).toBe(403);
  });
  it('the Church Leader work-and-money offices are untouched: the treasurer has no people search', async () => {
    expect((await post('p-treasurer', {})).status).toBe(403);
  });
});

describe('record and unit scope (manually constructed requests)', () => {
  const music = (extra: object = {}) => post('p-music-pres', { systemId: 'sys-music', ...extra });
  it('counts, pages and results only ever describe the viewer\'s own people', async () => {
    const r = await music();
    expect(r.status).toBe(200);
    expect(ids(r).sort()).toEqual(['p-a', 'p-admin', 'p-b', 'p-c', 'p-music-pres']);
    expect(ids(r)).not.toContain('p-y');
    expect(r.body.total).toBe(ids(r).length);
    expect(r.body.total).toBeLessThan((await post('p-pastor', {})).body.total);
    expect(ids(await music({ q: 'Yves' }))).toEqual([]);
    expect((await music({ q: 'Yves' })).body.total).toBe(0);
    expect(ids(await music({ match: { all: [c('status', 'isNot', 'ACTIVE')] } }))).toEqual(['p-c']);
    expect(ids(await music({ page: { limit: 1, offset: 0 } }))).toHaveLength(1);
    expect((await music({ page: { limit: 1, offset: 0 } })).body.total).toBe(r.body.total);
    expect(ids(await music({ page: { limit: 1, offset: 500 } }))).toEqual([]);
  });
  it('the same is true when no system is named', async () => {
    const r = await post('p-music-pres', {});
    expect(ids(r)).not.toContain('p-y');
    expect(r.status).toBe(200);
  });
  it('another system, or the whole church, cannot be asked for', async () => {
    for (const systemId of ['sys-main', 'sys-youth']) {
      const r = await post('p-music-pres', { systemId });
      expect([r.status, r.body.code]).toEqual([403, 'NOT_ALLOWED']);
    }
  });
  it('a unit outside the viewer scope cannot be a condition, whatever the operator, field or place in the request', async () => {
    const hidden = [
      c('unit', 'includesAny', ['ou-youth']), c('unit', 'includesNone', ['ou-youth']), c('unit', 'includesAny', ['ou-music', 'ou-youth']),
      c('unit', 'includesAny', ['ou-church']), c('unit', 'includesAny', ['ou-does-not-exist']),
    ];
    for (const cond of hidden) {
      const direct = await music({ match: { all: [cond] } });
      expect([direct.status, direct.body.code], JSON.stringify(cond)).toEqual([403, 'UNIT_NOT_ALLOWED']);
      const grouped = await music({ match: { anyGroups: [{ any: [c('name', 'contains', 'a'), cond] }] } });
      expect([grouped.status, grouped.body.code]).toEqual([403, 'UNIT_NOT_ALLOWED']);
      expect(JSON.stringify(direct.body)).not.toMatch(/Youth|ou-youth|p-y|Aaron/);
    }
    expect((await music({ match: { all: [c('unit', 'includesAny', ['ou-music'])] } })).status).toBe(200);
  });
  it('a calling in a hidden unit is refused too (here already because Music may not use callings at all)', async () => {
    for (const cond of [c('calling', 'anyMatch', { unitId: 'ou-youth' }), c('calling', 'noneMatch', { name: 'Treasurer', unitId: 'ou-youth' })]) {
      const r = await music({ match: { all: [cond] } });
      expect([r.status, r.body.people]).toEqual([403, undefined]);
      expect(JSON.stringify(r.body)).not.toMatch(/Youth|ou-youth|Aaron/);
    }
  });
  it('Music cannot tell that Aaron also belongs to Youth', async () => {
    const r = await music({ match: { all: [c('unit', 'includesAny', ['ou-music'])] } });
    expect(ids(r)).toContain('p-a');
    expect(JSON.stringify(r.body)).not.toMatch(/ou-youth|Youth/);
  });
  it('archived people are as visible as before: only within scope, only when asked', async () => {
    expect(ids(await music({ q: 'Archie', archived: true }))).toEqual([]); // not Music's person
    expect(ids(await post('p-pastor', { q: 'Archie', archived: true }))).toEqual(['p-old']);
    expect(ids(await post('p-pastor', { q: 'Archie' }))).toEqual([]);
  });
  it('filter-schema offers only what the viewer may use, and only units in scope', async () => {
    const music = await get('p-music-pres', '/api/people/filter-schema?systemId=sys-music');
    expect(music.status).toBe(200);
    expect(music.body.fields.map((f: any) => f.key)).toEqual(['name', 'memberCode', 'status', 'unit']);
    expect(music.body.units).toEqual([{ id: 'ou-music', name: 'Music' }]);
    expect(music.body.sortable).toEqual(['name', 'memberCode', 'status']);
    for (const hiddenWord of ['gender', 'marital', 'baptism', 'childCount', 'Youth', 'ou-youth', 'ou-church']) expect(JSON.stringify(music.body)).not.toContain(hiddenWord);
    expect((await get('p-music-pres', '/api/people/filter-schema?systemId=sys-main')).status).toBe(403);
    const sec = await get('p-sec', '/api/people/filter-schema');
    const secKeys = sec.body.fields.map((f: any) => f.key);
    expect(secKeys).toEqual(expect.arrayContaining(['baptismYears', 'employedYears', 'educationLevel', 'childCount', 'calling']));
    for (const k of ['gender', 'age', 'marital']) expect(secKeys).not.toContain(k);
    const lead = await get('p-pastor', '/api/people/filter-schema');
    expect(lead.body.fields.map((f: any) => f.key)).toEqual(expect.arrayContaining(['gender', 'age', 'marital']));
    expect(lead.body.units.map((u: any) => u.id).sort()).toEqual(['ou-church', 'ou-music', 'ou-youth']);
    expect(lead.body.limits).toMatchObject({ conditions: 12, groups: 4, pageSize: 100 });
  });
  it('every field in a viewer schema is usable by that viewer, and nothing outside it is', async () => {
    for (const as of ['p-pastor', 'p-sec', 'p-cat', 'p-music-pres', 'p-admin']) {
      const s = await get(as, '/api/people/filter-schema');
      const keys: string[] = s.body.fields.map((f: any) => f.key);
      for (const f of s.body.fields) {
        const op = f.operators[0];
        const value = f.type === 'text' ? 'a' : f.type === 'boolean' ? undefined : f.type === 'choice' || f.type === 'ordinal' ? (op === 'is' || op === 'isNot' ? f.choices[0] : [f.choices[0]]) : f.type === 'number' ? 1 : f.type === 'date' ? '2020-01-01' : f.type === 'multi' ? [s.body.units[0].id] : { name: 'x' };
        const r = await post(as, all(c(f.key, op, value)));
        expect(r.status, `${as} ${f.key}`).toBe(200);
      }
      const every = ['name', 'memberCode', 'status', 'unit', 'gender', 'age', 'baptised', 'baptismDate', 'baptismYears', 'employmentStatus', 'employmentSector', 'employmentField', 'employedYears', 'educationLevel', 'educationField', 'childCount', 'hasSpouseRecorded', 'marital', 'calling'];
      for (const k of every.filter((k) => !keys.includes(k))) {
        const sample = k === 'calling' ? c(k, 'anyMatch', { name: 'x' }) : c(k, 'isNot', 'x');
        const r = await post(as, all(sample));
        expect([403, 400], `${as} ${k}`).toContain(r.status);
        expect(r.status === 403 ? r.body.code : 'BAD_INPUT').toMatch(/FIELD_NOT_ALLOWED|BAD_INPUT/);
        expect(r.body.people).toBeUndefined();
      }
    }
  });
});
