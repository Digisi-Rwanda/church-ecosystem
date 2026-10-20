import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { matches, maritalOf, yearsBetween, type Facts } from '../src/people/filters';

const NOW = new Date('2026-10-20T00:00:00Z');
const none = (u: string) => new Set([u]);
const person = (over: Partial<Facts> & { records?: Facts['records'] }): Facts => ({ id: 'x', fullName: 'X', status: 'ACTIVE', unitIds: [], records: [], ...over });

describe('people filter rules', () => {
  it('counts whole years', () => {
    expect(yearsBetween('2016-10-21', NOW)).toBe(9);
    expect(yearsBetween('2016-10-20', NOW)).toBe(10);
    expect(yearsBetween('nonsense', NOW)).toBeNull();
  });
  it('chains every criterion: men of a unit, baptised 10+ years, 5+ years in finance, bachelor, 2+ children', () => {
    const base = person({
      gender: 'MALE', unitIds: ['ou-elim'],
      records: [
        { section: 'BAPTISM', data: { date: '2010-01-01' } },
        { section: 'EMPLOYMENT', data: { status: 'EMPLOYED', sector: 'FINANCE', since: '2018-01-01' } },
        { section: 'EDUCATION', data: { level: 'BACHELOR' } },
        { section: 'FAMILY', data: { relation: 'CHILD', name: 'A' } }, { section: 'FAMILY', data: { relation: 'CHILD', name: 'B' } },
      ],
    });
    const c = { gender: 'MALE', unitIds: ['ou-elim'], baptismYearsMin: 10, sector: ['FINANCE'], employedYearsMin: 5, educationMin: 'BACHELOR', childrenMin: 2 } as const;
    expect(matches(base, c as never, NOW, none)).toBe(true);
    for (const worse of [
      { ...base, gender: 'FEMALE' }, { ...base, unitIds: ['ou-other'] },
      { ...base, records: base.records.filter((r) => r.section !== 'BAPTISM') },
      { ...base, records: base.records.map((r) => (r.section === 'BAPTISM' ? { ...r, data: { date: '2020-01-01' } } : r)) },
      { ...base, records: base.records.map((r) => (r.section === 'EMPLOYMENT' ? { ...r, data: { status: 'EMPLOYED', sector: 'HEALTH', since: '2018-01-01' } } : r)) },
      { ...base, records: base.records.map((r) => (r.section === 'EMPLOYMENT' ? { ...r, data: { status: 'EMPLOYED', sector: 'FINANCE', since: '2024-01-01' } } : r)) },
      { ...base, records: base.records.map((r) => (r.section === 'EDUCATION' ? { ...r, data: { level: 'SECONDARY_A' } } : r)) },
      { ...base, records: base.records.filter((r) => r.section !== 'FAMILY').concat([{ section: 'FAMILY', data: { relation: 'CHILD', name: 'A' } }]) },
    ]) expect(matches(worse as Facts, c as never, NOW, none)).toBe(false);
  });
  it('derives married, widowed and single from the marriage record', () => {
    expect(maritalOf(person({}))).toBe('SINGLE');
    expect(maritalOf(person({ records: [{ section: 'MARRIAGE', data: { date: '2015-01-01' } }] }))).toBe('MARRIED');
    expect(maritalOf(person({ records: [{ section: 'MARRIAGE', data: { date: '2015-01-01', endedOn: '2024-01-01', endedBy: 'DEATH' } }] }))).toBe('WIDOWED');
  });
  it('a unit includes the units below it; a calling is matched by name and unit', () => {
    const f = person({ unitIds: ['ou-sub'], records: [{ section: 'CALLING', data: { name: 'Bass guitarist', orgUnitId: 'ou-sub' } }] });
    const down = (u: string) => new Set(u === 'ou-top' ? ['ou-top', 'ou-sub'] : [u]);
    expect(matches(f, { unitIds: ['ou-top'] }, NOW, down)).toBe(true);
    expect(matches(f, { callingName: 'bass', callingUnitId: 'ou-top' }, NOW, down)).toBe(true);
    expect(matches(f, { callingName: 'drum' }, NOW, down)).toBe(false);
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const search = (as: string, criteria: object, extra: object = {}) => request(app).post('/api/people/search').set(bearer(as)).send({ criteria, ...extra });
const ids = (r: any) => (r.body.people ?? []).map((p: any) => p.id).sort();

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
  db.person.push({ id: 'p-a', fullName: 'Aaron', status: 'ACTIVE', gender: 'MALE', dateOfBirth: '1980-01-01' }, { id: 'p-b', fullName: 'Bella', status: 'ACTIVE', gender: 'FEMALE', dateOfBirth: '1985-01-01' });
  db.person.push({ id: 'p-sec', fullName: 'Secretary', status: 'ACTIVE' });
  db.position.push({ id: 'pos-sec', personId: 'p-sec', systemId: 'sys-main', orgUnitId: 'ou-church', title: 'Church Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') });
  db.person.push({ id: 'p-music-pres', fullName: 'Music President', status: 'ACTIVE' });
  db.position.push({ id: 'pos-mp', personId: 'p-music-pres', systemId: 'sys-music', orgUnitId: 'ou-music', title: 'Music President', office: 'PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') });
  db.membership.push(
    { id: 'm-a', personId: 'p-a', systemId: 'sys-music', orgUnitId: 'ou-music', type: 'MINISTRY_MEMBER', status: 'ACTIVE', startDate: new Date('2020-01-01') },
    { id: 'm-b', personId: 'p-b', systemId: 'sys-music', orgUnitId: 'ou-music', type: 'MINISTRY_MEMBER', status: 'ACTIVE', startDate: new Date('2020-01-01') },
  );
  const rec = (personId: string, section: string, data: object) => db.personRecord.push({ id: `r-${personId}-${section}`, personId, section, dataJson: JSON.stringify(data), status: 'CURRENT', recordedById: 'p-pastor', recordedAt: new Date() });
  rec('p-a', 'BAPTISM', { date: '2005-01-01' });
  rec('p-a', 'MARRIAGE', { date: '2008-01-01' });
  rec('p-b', 'BAPTISM', { date: '2022-01-01' });
  rec('p-b', 'MARRIAGE', { date: '2008-01-01', endedOn: '2023-01-01', endedBy: 'DEATH' });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('POST /api/people/search', () => {
  it('the Church Leader chains filters; widowed people are found by the marriage record', async () => {
    expect(ids(await search('p-pastor', { gender: 'MALE', unitIds: ['ou-music'], baptismYearsMin: 10 }))).toEqual(['p-a']);
    expect(ids(await search('p-pastor', { marital: ['WIDOWED'] }))).toEqual(['p-b']);
    const r = await search('p-pastor', { unitIds: ['ou-music'] });
    expect(r.body.total).toBe(2);
    expect(r.body.people.find((p: any) => p.id === 'p-b').marital).toBe('WIDOWED');
  });
  it('the secretary may filter on work and education but not on marital status, age or gender', async () => {
    expect((await search('p-sec', { baptismYearsMin: 10 })).status).toBe(200);
    for (const bad of [{ marital: ['WIDOWED'] }, { gender: 'MALE' }, { ageMin: 30 }]) {
      const r = await search('p-sec', bad);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('FIELD_NOT_ALLOWED');
    }
  });
  it('a unit president may only filter on names, status and unit, and only among their own people', async () => {
    expect((await search('p-music-pres', { baptismYearsMin: 1 })).status).toBe(403);
    const r = await search('p-music-pres', { status: ['ACTIVE'] }, { systemId: 'sys-music' });
    expect(r.status).toBe(200);
    expect(ids(r)).not.toContain('p-youth-member');
    expect(JSON.stringify(r.body)).not.toContain('marital');
    expect((await search('p-music-pres', {}, { systemId: 'sys-main' })).status).toBe(403);
  });
  it('unknown criteria and bad values are refused', async () => {
    expect((await search('p-pastor', { secret: 1 })).status).toBe(400);
    expect((await search('p-pastor', { childrenMin: -1 })).status).toBe(400);
  });
  it('filter options list only what the viewer may use', async () => {
    const lead = await request(app).get('/api/people/filter-options').set(bearer('p-pastor'));
    expect(lead.body.criteria).toEqual(expect.arrayContaining(['gender', 'marital', 'childrenMin', 'sector']));
    const sec = await request(app).get('/api/people/filter-options').set(bearer('p-sec'));
    expect(sec.body.criteria).not.toContain('marital');
    expect(sec.body.criteria).not.toContain('gender');
    expect(sec.body.criteria).toContain('educationMin');
  });
});
