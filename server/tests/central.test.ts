import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const day = (n: number) => new Date(Date.now() + n * 86400000);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'meeting', 'decision', 'letter', 'notification', 'notificationRead', 'preference']) db[k] ??= [];
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
  db.person.push({ id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' });
  db.position.push({ id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') });
  db.meeting.push(
    { id: 'm1', orgUnitId: 'ou-choir', systemId: 'sys-choir', typeCode: 'UNIT', title: 'Choir meeting', scheduledAt: day(-3), status: 'PLANNED', createdById: 'p-vp' },
    { id: 'm2', orgUnitId: 'ou-choir', systemId: 'sys-choir', typeCode: 'UNIT', title: 'Later', scheduledAt: day(5), status: 'PLANNED', createdById: 'p-vp' },
  );
  db.decision.push(
    { id: 'd1', orgUnitId: 'ou-choir', systemId: 'sys-choir', title: 'Buy a keyboard', status: 'DRAFT', createdById: 'p-vp', createdAt: day(-1) },
    { id: 'd2', orgUnitId: 'ou-choir', systemId: 'sys-choir', title: 'Old one', status: 'APPROVED', createdById: 'p-vp', createdAt: day(-9) },
  );
  db.letter.push(
    { id: 'l1', reference: 'KAC-2026-0001', orgUnitId: 'ou-choir', systemId: 'sys-choir', typeCode: 'THANKS', subject: 'Thanks', body: 'x', recipientName: 'Jean', status: 'DRAFT', createdById: 'p-vp', createdAt: day(-2), printedAt: day(-1) },
    { id: 'l2', reference: 'KAC-2026-0002', orgUnitId: 'ou-choir', systemId: 'sys-choir', typeCode: 'THANKS', subject: 'Unprinted', body: 'x', recipientName: 'Ann', status: 'DRAFT', createdById: 'p-vp', createdAt: day(-2), printedAt: null },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('Central Administration overview', () => {
  it('needs sign-in and is for the main church leaders only', async () => {
    expect((await request(app).get('/api/central/overview')).status).toBe(401);
    for (const who of ['p-choir-leader', 'p-choir-member', 'p-member', 'p-outsider']) {
      expect((await get(who, '/api/central/overview')).status, who).toBe(403);
    }
    expect((await get('p-pastor', '/api/central/overview')).status).toBe(200);
  });
  it('Urgent lists what this reader must act on, most pressing first', async () => {
    const r = await get('p-pastor', '/api/central/overview');
    const kinds = r.body.urgent.map((u: any) => u.kind);
    expect(kinds[0]).toBe('DECISION_TO_APPROVE');
    expect(kinds).toContain('LETTER_TO_DELIVER');
    expect(kinds).toContain('LETTER_TO_PRINT');
    expect(kinds).toContain('MEETING_OVERDUE');
    expect(kinds.indexOf('LETTER_TO_DELIVER')).toBeLessThan(kinds.indexOf('LETTER_TO_PRINT'));
    expect(r.body.urgent.filter((u: any) => u.kind === 'MEETING_OVERDUE')).toHaveLength(1);
    expect(r.body.urgentTotal).toBeGreaterThanOrEqual(4);
    expect(r.body.urgent.find((u: any) => u.kind === 'DECISION_TO_APPROVE')).toMatchObject({ systemId: 'sys-choir', unitName: 'Choir', subject: 'Buy a keyboard' });
  });
  it('a letter shows as urgent only to someone who may send it out', async () => {
    // The Catechist reads but cannot approve a decision (A) or send letters out (S).
    fake.__db.person.push({ id: 'p-cat', fullName: 'Catechist', status: 'ACTIVE' });
    fake.__db.position.push({ id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: new Date('2022-01-01') });
    const r = await get('p-cat', '/api/central/overview');
    expect(r.status).toBe(200);
    const kinds = r.body.urgent.map((u: any) => u.kind);
    expect(kinds).not.toContain('DECISION_TO_APPROVE');
    expect(kinds).not.toContain('LETTER_TO_PRINT');
    expect(kinds).toContain('MEETING_OVERDUE');
  });
  it('Oversight counts every system the reader may see, the main church first', async () => {
    const r = await get('p-pastor', '/api/central/overview');
    expect(r.body.oversight[0].systemId).toBe('sys-main');
    const choir = r.body.oversight.find((s: any) => s.systemId === 'sys-choir');
    expect(choir).toMatchObject({ plannedMeetings: 2, overdueMeetings: 1, decisionsWaiting: 1, lettersOpen: 2 });
  });
  it('Reports received is empty until systems report', async () => {
    expect((await get('p-pastor', '/api/central/overview')).body.reports).toEqual([]);
  });
  it('the capabilities answer offers the home only to the main church’s leaders', async () => {
    const lead = (await get('p-pastor', '/api/me/capabilities')).body.systems.find((s: any) => s.id === 'sys-main');
    expect(lead.own.map((o: any) => o.key)).toContain('central');
    const pres = (await get('p-choir-leader', '/api/me/capabilities')).body.systems.find((s: any) => s.id === 'sys-choir');
    expect(pres.own.map((o: any) => o.key)).not.toContain('central');
  });
});

describe('collections across the church', () => {
  const count = (id: string, systemId: string, serviceOn: Date, amount: number, status = 'CONFIRMED', handedToId: string | null = null) =>
    fake.__db.offeringCount.push({ id, orgUnitId: 'ou-choir', systemId, serviceOn, amount, status, handedToId });
  beforeEach(() => { fake.__db.offeringCount ??= []; fake.__db.musicMonth ??= []; });
  it('adds counted offerings by month and ministry, leaves out voided ones, and counts what is still open', async () => {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0);
    count('c1', 'sys-choir', d, 10000, 'RECORDED');
    count('c2', 'sys-choir', d, 5000, 'CONFIRMED');
    count('c3', 'sys-main', d, 2000, 'CONFIRMED', 'p-treasurer');
    count('c4', 'sys-main', d, 99999, 'VOIDED');
    const r = (await get('p-pastor', '/api/central/collections')).body;
    expect(r.totals).toEqual({ all: 17000, toConfirm: 1, toHandOver: 1 });
    expect(r.months.at(-1)).toMatchObject({ total: 17000, count: 3 });
    expect(r.ministries.find((m: any) => m.systemId === 'sys-choir')).toMatchObject({ total: 15000, toConfirm: 1, toHandOver: 1 });
  });
  it('lists recent past services with no count, and not the ones that have one', async () => {
    const past = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    fake.__db.musicMonth.push({ servicesJson: JSON.stringify([{ date: past(3), kind: 'SS1' }, { date: past(3), kind: 'SS2' }, { date: past(10), kind: 'TUESDAY' }, { date: past(10), kind: 'FRIDAY' }, { date: past(-5), kind: 'SS1' }]) });
    count('c1', 'sys-main', new Date(`${past(10)}T00:00:00Z`), 1000);
    const r = (await get('p-pastor', '/api/central/collections')).body;
    expect(r.missing).toEqual([{ date: past(3), kinds: ['SS1', 'SS2'] }]);
  });
  it('is closed to people without Central access', async () => {
    expect((await get('p-member', '/api/central/collections')).status).toBe(403);
  });
});
