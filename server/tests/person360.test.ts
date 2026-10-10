import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { accessFor, cleanData } from '../src/person360/rules';

describe('person 360 rules', () => {
  it('cleans each section and drops unknown fields', () => {
    expect(cleanData('BAPTISM', { date: '2026-05-03', place: ' Kacyiru ', junk: 1 })).toEqual({ date: '2026-05-03', place: 'Kacyiru' });
    expect(cleanData('BAPTISM', { date: 'soon' })).toBeNull();
    expect(cleanData('FAMILY', { relation: 'CHILD' })).toBeNull();
    expect(cleanData('FAMILY', { relation: 'CHILD', name: 'Eric' })).toEqual({ relation: 'CHILD', name: 'Eric' });
    expect(cleanData('EDUCATION', { level: 'TVET', year: 2015 })).toEqual({ level: 'TVET', year: 2015 });
    expect(cleanData('EDUCATION', { level: 'NONE' })).toBeNull();
    expect(cleanData('MARRIAGE', { date: '2020-01-01', spouseName: 'Ann' })).toEqual({ date: '2020-01-01', spouseName: 'Ann' });
  });
  it('nobody without a church-wide office has any access', () => {
    expect(accessFor('x', { positions: [], memberships: [], delegations: [] })).toEqual({ read: [], write: [], leader: false });
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const patch = (as: string, path: string, body: object = {}) => request(app).patch(path).set(bearer(as)).send(body);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'personRecord', 'program', 'programEnrollment']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.orgUnit.push(
    { id: 'ou-church', name: 'ADEPR Kacyiru', code: 'KAC', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-choir', name: 'Choir', code: 'KAC-MUS-CHO', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-choir' },
  );
  db.person.push({ id: 'p-cat', fullName: 'Catechist', status: 'ACTIVE' }, { id: 'p-sec', fullName: 'Secretary', status: 'ACTIVE' });
  const at = new Date('2022-01-01');
  db.position.push(
    { id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', orgUnitId: 'ou-church', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: at },
    { id: 'pos-sec', personId: 'p-sec', systemId: 'sys-main', orgUnitId: 'ou-church', title: 'Church Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: at },
  );
  db.person.find((p: any) => p.id === 'p-member').nationalId = '1199';
  db.program.push({ id: 'prog-b', name: 'Baptism class 2026', programType: 'BAPTISM', cohortLabel: '2026-A', status: 'ACTIVE' });
  db.programEnrollment.push(
    { id: 'e1', programId: 'prog-b', personId: 'p-member', status: 'ACTIVE' },
    { id: 'e2', programId: 'prog-b', personId: 'p-choir-member', status: 'COMPLETED' },
    { id: 'e3', programId: 'prog-b', personId: 'p-youth-member', status: 'WITHDRAWN' },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const rec = (as: string, section: string, data: object, who = 'p-member') => post(as, `/api/person360/${who}/records`, { section, data });

describe('person 360 routes', () => {
  it('only church-wide offices get in; presidents and members are told nothing exists', async () => {
    expect((await get('p-choir-leader', '/api/person360/p-member')).status).toBe(404);
    expect((await get('p-member', '/api/person360/p-member')).status).toBe(404);
    expect((await get('p-choir-leader', '/api/person360/access')).body.allowed).toBe(false);
    expect((await get('p-pastor', '/api/person360/access')).body.allowed).toBe(true);
  });
  it('each office writes its own part; marriage is the Church Leader\'s alone', async () => {
    expect((await rec('p-sec', 'EMPLOYMENT', { status: 'EMPLOYED', employer: 'MTN' })).status).toBe(201);
    expect((await rec('p-sec', 'BAPTISM', { date: '2026-05-03' })).status).toBe(403);
    expect((await rec('p-cat', 'BAPTISM', { date: '2026-05-03' })).status).toBe(201);
    expect((await rec('p-cat', 'EMPLOYMENT', { status: 'EMPLOYED' })).status).toBe(403);
    expect((await rec('p-sec', 'MARRIAGE', { date: '2020-01-01' })).status).toBe(404);
    expect((await rec('p-cat', 'MARRIAGE', { date: '2020-01-01' })).status).toBe(404);
    expect((await rec('p-pastor', 'MARRIAGE', { date: '2020-01-01', spouseName: 'Ann' })).status).toBe(201);
  });
  it('marriage and the national id are hidden from the secretary and catechist', async () => {
    await rec('p-pastor', 'MARRIAGE', { date: '2020-01-01', spouseName: 'Ann' });
    await rec('p-sec', 'GIFT', { name: 'Singing' });
    const sec = (await get('p-sec', '/api/person360/p-member')).body;
    expect(sec.records.map((r: any) => r.section)).toEqual(['GIFT']);
    expect(sec.person.nationalId).toBeNull();
    expect(sec.read).not.toContain('MARRIAGE');
    const lead = (await get('p-pastor', '/api/person360/p-member')).body;
    expect(lead.records.length).toBe(2);
    expect(lead.person.nationalId).toBe('1199');
  });
  it('baptism and marriage are single: a second one must change the first', async () => {
    expect((await rec('p-cat', 'BAPTISM', { date: '2026-05-03' })).status).toBe(201);
    expect((await rec('p-cat', 'BAPTISM', { date: '2026-06-03' })).body.code).toBe('ALREADY_EXISTS');
    expect((await rec('p-sec', 'SKILL', { name: 'Drums' })).status).toBe(201);
    expect((await rec('p-sec', 'SKILL', { name: 'Piano' })).status).toBe(201);
  });
  it('a change keeps the old record in history; a void needs a reason', async () => {
    const a = (await rec('p-sec', 'EMPLOYMENT', { status: 'EMPLOYED', employer: 'MTN' })).body.id;
    const b = await patch('p-sec', `/api/person360/records/${a}`, { data: { status: 'SELF_EMPLOYED', employer: 'Own shop' } });
    expect(b.status).toBe(200);
    expect((await patch('p-sec', `/api/person360/records/${a}`, { data: { status: 'RETIRED' } })).status).toBe(409);
    const page = (await get('p-sec', '/api/person360/p-member')).body;
    expect(page.records.length).toBe(1);
    expect(page.records[0].data.employer).toBe('Own shop');
    const h = (await get('p-sec', `/api/person360/records/${b.body.id}/history`)).body.history;
    expect(h.map((x: any) => x.status)).toEqual(['CURRENT', 'SUPERSEDED']);
    expect((await post('p-sec', `/api/person360/records/${b.body.id}/void`)).body.code).toBe('REASON_REQUIRED');
    expect((await post('p-sec', `/api/person360/records/${b.body.id}/void`, { reason: 'Wrong person' })).status).toBe(200);
    expect((await get('p-sec', '/api/person360/p-member')).body.records.length).toBe(0);
    expect(fake.__db.auditEvent.filter((e: any) => e.resource === 'PERSON_360').length).toBe(3);
  });
  it('family needs a real person when one is named', async () => {
    expect((await rec('p-sec', 'FAMILY', { relation: 'CHILD', relatedPersonId: 'nobody' })).body.code).toBe('PERSON_NOT_FOUND');
    expect((await rec('p-sec', 'FAMILY', { relation: 'SPOUSE', relatedPersonId: 'p-choir-member' })).status).toBe(201);
    expect((await get('p-sec', '/api/person360/p-member')).body.records[0].relatedName).toBeTruthy();
  });
  it('baptism from a cohort: enrolled learners only, once each, the catechist records', async () => {
    const c = await get('p-cat', '/api/person360/cohorts');
    expect(c.body.cohorts[0].learners.length).toBe(2);
    expect((await get('p-sec', '/api/person360/cohorts')).status).toBe(404);
    const r = await post('p-cat', '/api/person360/baptism-cohort', { programId: 'prog-b', date: '2026-05-03', place: 'Kacyiru', personIds: ['p-member', 'p-choir-member', 'p-youth-member', 'p-outsider'] });
    expect(r.body).toEqual({ created: 2, skipped: 2 });
    const rows = fake.__db.personRecord.filter((x: any) => x.section === 'BAPTISM');
    expect(rows.every((x: any) => x.programId === 'prog-b')).toBe(true);
    expect((await post('p-cat', '/api/person360/baptism-cohort', { programId: 'prog-b', date: '2026-05-03', personIds: ['p-member'] })).body).toEqual({ created: 0, skipped: 1 });
    expect((await post('p-sec', '/api/person360/baptism-cohort', { programId: 'prog-b', date: '2026-05-03', personIds: ['p-member'] })).status).toBe(403);
    const m = (await get('p-cat', '/api/person360/p-member')).body.records[0];
    expect(m.programName).toBe('Baptism class 2026');
  });
  it('the Church Leader sees everything a person gave, pledged or donated; nobody else sees it', async () => {
    const db = fake.__db;
    for (const k of ['contributionLine', 'contributionList', 'donation', 'choirSponsor', 'sponsorPledge', 'contributionClaim', 'musicChoir']) db[k] ??= [];
    const year = new Date().toISOString().slice(0, 4);
    db.contributionList.push(
      { id: 'cl1', systemId: 'sys-choir', level: 'UNIT', status: 'APPROVED', typeName: 'Building', month: `${year}-03` },
      { id: 'cl2', systemId: 'sys-choir', level: 'TEAM', status: 'DRAFT', typeName: 'Building', month: `${year}-04` },
    );
    db.contributionLine.push({ id: 'ln1', listId: 'cl1', personId: 'p-member', amount: 5000 }, { id: 'ln2', listId: 'cl2', personId: 'p-member', amount: 9999 });
    db.donation.push(
      { id: 'd1', systemId: 'sys-choir', donorName: 'Member', donorPersonId: 'p-member', amount: 2000, receivedOn: new Date(`${year}-05-02T00:00:00Z`), status: 'APPROVED' },
      { id: 'd2', systemId: 'sys-choir', donorName: 'Member', donorPersonId: 'p-member', amount: 777, receivedOn: new Date(`${year}-05-03T00:00:00Z`), status: 'PENDING' },
    );
    db.musicChoir.push({ id: 'ch1', name: 'Imanzi', systemId: 'sys-choir' });
    db.choirSponsor.push({ id: 'sp1', choirId: 'ch1', name: 'Member', kind: 'PERSON', personId: 'p-member', status: 'ACTIVE' });
    db.sponsorPledge.push(
      { id: 'pl1', sponsorId: 'sp1', amount: 3000, pledgedOn: new Date(`${year}-06-01T00:00:00Z`), status: 'PLEDGED' },
      { id: 'pl2', sponsorId: 'sp1', amount: 1000, pledgedOn: new Date(`${year}-02-01T00:00:00Z`), receivedOn: new Date(`${year}-02-10T00:00:00Z`), status: 'RECEIVED' },
    );
    const r = await get('p-pastor', '/api/person360/p-member/participation');
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: any) => i.kind).sort()).toEqual(['CONTRIBUTION', 'DONATION', 'SPONSORSHIP', 'SPONSORSHIP']);
    expect(r.body.totals).toEqual({ given: 5000 + 2000 + 1000, pledged: 3000 });
    expect((await get('p-sec', '/api/person360/p-member/participation')).status).toBe(404);
    expect((await get('p-choir-leader', '/api/person360/p-member/participation')).status).toBe(404);
    expect((await get('p-pastor', '/api/person360/access')).body.leader).toBe(true);
    expect((await get('p-sec', '/api/person360/access')).body.leader).toBe(false);
  });
});
