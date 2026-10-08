import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { canPostTo, canWithdraw, isOpen, reaches, targetSystem, type AnnouncementRow } from '../src/announcements/rules';
import type { AccessData } from '../src/capabilities/engine';

const NOW = new Date('2026-10-06T12:00:00Z');
const pos = (id: string, personId: string, office: string, systemId: string, extra: object = {}) => ({
  id, personId, office, systemId, orgUnitId: null as string | null, status: 'ACTIVE', startDate: '2020-01-01', endDate: null as string | null, ...extra,
});
const mem = (personId: string, systemId: string) => ({ id: `m-${personId}-${systemId}`, personId, systemId, type: 'MINISTRY_MEMBER', status: 'ACTIVE', startDate: '2020-01-01', endDate: null as string | null });
const data: AccessData = {
  positions: [
    pos('a', 'lead', 'CHURCH_LEADER', 'sys-main'),
    pos('b', 'sec', 'CHURCH_SECRETARY', 'sys-main'),
    pos('c', 'cat', 'CATECHIST', 'sys-main'),
    pos('d', 'pres', 'PRESIDENT', 'sys-choir'),
    pos('e', 'csec', 'SECRETARY', 'sys-choir'),
    pos('f', 'vp', 'VICE_PRESIDENT', 'sys-choir'),
    pos('g', 'treas', 'TREASURER', 'sys-youth'),
  ],
  memberships: [mem('lead', 'sys-main'), mem('sec', 'sys-main'), mem('pres', 'sys-main'), mem('mc', 'sys-main'), mem('mc', 'sys-choir'), mem('my', 'sys-main'), mem('my', 'sys-youth')],
  delegations: [],
};
const row = (extra: Partial<AnnouncementRow> = {}): AnnouncementRow => ({
  id: 'x', title: 'Hello', body: 'Body', audienceKind: 'WHOLE_CHURCH', systemId: 'sys-main', authorId: 'lead', status: 'PUBLISHED', publishedAt: '2026-10-01T08:00:00Z', ...extra,
});

describe('who may post', () => {
  it('only the Church Leader and the Church Secretary post to the whole church', () => {
    const all = { kind: 'WHOLE_CHURCH' as const };
    expect(canPostTo('lead', all, data, NOW)).toBe(true);
    expect(canPostTo('sec', all, data, NOW)).toBe(true);
    for (const who of ['cat', 'pres', 'csec', 'vp', 'treas', 'mc', 'nobody']) expect(canPostTo(who, all, data, NOW), who).toBe(false);
  });
  it('a president and a secretary post to their own system, not another', () => {
    const choir = { kind: 'SYSTEM' as const, systemId: 'sys-choir' };
    const youth = { kind: 'SYSTEM' as const, systemId: 'sys-youth' };
    expect(canPostTo('pres', choir, data, NOW)).toBe(true);
    expect(canPostTo('csec', choir, data, NOW)).toBe(true);
    expect(canPostTo('pres', youth, data, NOW)).toBe(false);
    expect(canPostTo('vp', choir, data, NOW)).toBe(false);
    expect(canPostTo('treas', { kind: 'SYSTEM', systemId: 'sys-youth' }, data, NOW)).toBe(false);
  });
  it('the Church Leader posts to any system; the Church Secretary only to Central', () => {
    expect(canPostTo('lead', { kind: 'SYSTEM', systemId: 'sys-youth' }, data, NOW)).toBe(true);
    expect(canPostTo('sec', { kind: 'SYSTEM', systemId: 'sys-choir' }, data, NOW)).toBe(false);
    expect(canPostTo('sec', { kind: 'SYSTEM', systemId: 'sys-main' }, data, NOW)).toBe(true);
  });
  it('an office audience is decided in the main church', () => {
    expect(targetSystem({ kind: 'OFFICE' })).toBe('sys-main');
    expect(canPostTo('lead', { kind: 'OFFICE', office: 'TREASURER' }, data, NOW)).toBe(true);
    expect(canPostTo('pres', { kind: 'OFFICE', office: 'TREASURER' }, data, NOW)).toBe(false);
  });
  it('a lent Send letter lets the borrower post, until the lending ends', () => {
    const lent: AccessData = {
      ...data,
      delegations: [{ id: 'd1', positionId: 'e', fromPersonId: 'csec', toPersonId: 'mc', lettersJson: JSON.stringify({ GOVERNANCE: ['S'], COMMUNICATION: ['W'] }), status: 'ACTIVE', startDate: '2026-10-01', endDate: '2026-10-20' } as any],
    };
    expect(canPostTo('mc', { kind: 'SYSTEM', systemId: 'sys-choir' }, lent, NOW)).toBe(true);
    expect(canPostTo('mc', { kind: 'SYSTEM', systemId: 'sys-choir' }, lent, new Date('2026-10-25T00:00:00Z'))).toBe(false);
  });
});

describe('who sees a post', () => {
  it('the whole church reaches members and office holders, not outsiders', () => {
    const a = row();
    for (const who of ['lead', 'mc', 'pres', 'my']) expect(reaches(a, who, data, NOW), who).toBe(true);
    expect(reaches(a, 'stranger', data, NOW)).toBe(false);
  });
  it('a system post reaches its members and office holders, and the Church Leader, not another system', () => {
    const a = row({ audienceKind: 'SYSTEM', audienceSystemId: 'sys-choir', systemId: 'sys-choir', authorId: 'pres' });
    expect(reaches(a, 'mc', data, NOW)).toBe(true);
    expect(reaches(a, 'vp', data, NOW)).toBe(true);
    expect(reaches(a, 'lead', data, NOW)).toBe(true);
    expect(reaches(a, 'my', data, NOW)).toBe(false);
  });
  it('an office post reaches live holders of that office only', () => {
    const a = row({ audienceKind: 'OFFICE', audienceOffice: 'TREASURER' });
    expect(reaches(a, 'treas', data, NOW)).toBe(true);
    expect(reaches(a, 'pres', data, NOW)).toBe(false);
    const ended: AccessData = { ...data, positions: data.positions.map((p) => (p.id === 'g' ? { ...p, status: 'ENDED' } : p)) };
    expect(reaches(a, 'treas', ended, NOW)).toBe(false);
  });
  it('the author always sees their own post', () => {
    expect(reaches(row({ audienceKind: 'OFFICE', audienceOffice: 'TREASURER', authorId: 'pres' }), 'pres', data, NOW)).toBe(true);
  });
});

describe('open and withdrawn', () => {
  it('shows through the whole last day, then stops', () => {
    const a = row({ expiresAt: '2026-10-06T00:00:00.000Z' });
    expect(isOpen(a, new Date('2026-10-06T23:30:00Z'))).toBe(true);
    expect(isOpen(a, new Date('2026-10-07T00:00:01Z'))).toBe(false);
    expect(isOpen(row(), new Date('2030-01-01T00:00:00Z'))).toBe(true);
  });
  it('is hidden when withdrawn', () => {
    expect(isOpen(row({ status: 'WITHDRAWN' }), NOW)).toBe(false);
  });
  it('the author or anyone who may post to the audience takes it down; nobody else', () => {
    const a = row({ authorId: 'pres', audienceKind: 'SYSTEM', audienceSystemId: 'sys-choir', systemId: 'sys-choir' });
    expect(canWithdraw(a, 'pres', data, NOW)).toBe(true);
    expect(canWithdraw(a, 'csec', data, NOW)).toBe(true);
    expect(canWithdraw(a, 'lead', data, NOW)).toBe(true);
    expect(canWithdraw(a, 'mc', data, NOW)).toBe(false);
    expect(canWithdraw({ ...a, status: 'WITHDRAWN' }, 'pres', data, NOW)).toBe(false);
  });
});

/* ───────────── the routes ───────────── */

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const all = { kind: 'WHOLE_CHURCH' };
const choir = { kind: 'SYSTEM', systemId: 'sys-choir' };

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'notification', 'notificationRead', 'preference', 'announcement']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.shortName = s.id.replace('sys-', '');
    s.kind = s.id === 'sys-main' ? 'MAIN' : s.id === 'sys-finance' ? 'SHARED' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.person.push({ id: 'p-secretary', fullName: 'Church Secretary', status: 'ACTIVE' });
  db.position.push({ id: 'pos-sec', personId: 'p-secretary', systemId: 'sys-main', title: 'Church Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('posting', () => {
  it('needs sign-in and a complete post', async () => {
    expect((await request(app).post('/api/announcements').send({})).status).toBe(401);
    expect((await post('p-pastor', '/api/announcements', { title: 'Hi', body: 'x', audience: all })).status).toBe(400);
    expect((await post('p-pastor', '/api/announcements', { title: 'Sunday service', body: '', audience: all })).status).toBe(400);
    expect((await post('p-pastor', '/api/announcements', { title: 'Sunday service', body: 'x', audience: { kind: 'SYSTEM' } })).body.code).toBe('BAD_AUDIENCE');
    expect((await post('p-pastor', '/api/announcements', { title: 'Sunday service', body: 'x', audience: { kind: 'SYSTEM', systemId: 'sys-zzz' } })).status).toBe(404);
    expect((await post('p-pastor', '/api/announcements', { title: 'Sunday service', body: 'x', audience: { kind: 'OFFICE', office: 'KING' } })).body.code).toBe('BAD_AUDIENCE');
  });
  it('a team leader cannot post to the whole church', async () => {
    const r = await post('p-choir-leader', '/api/announcements', { title: 'Everyone come', body: 'Please', audience: all });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CANNOT_SEND_TO_AUDIENCE');
    expect(fake.__db.announcement).toHaveLength(0);
  });
  it('the Church Leader posts to the whole church and it is audited', async () => {
    const r = await post('p-pastor', '/api/announcements', { title: 'Sunday service', body: 'At 9am', audience: all });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(fake.__db.announcement[0]).toMatchObject({ title: 'Sunday service', audienceKind: 'WHOLE_CHURCH', systemId: 'sys-main', authorId: 'p-pastor', status: 'PUBLISHED' });
    expect(fake.__db.auditEvent.find((e: any) => e.action === 'ANNOUNCEMENT_POSTED')).toMatchObject({ actorId: 'p-pastor' });
  });
  it('the Church Secretary posts church-wide; a choir president posts to the choir only', async () => {
    expect((await post('p-secretary', '/api/announcements', { title: 'Notice', body: 'Read it', audience: all })).status).toBe(201);
    expect((await post('p-choir-leader', '/api/announcements', { title: 'Rehearsal', body: 'Friday', audience: choir })).status).toBe(201);
    expect((await post('p-choir-leader', '/api/announcements', { title: 'Rehearsal', body: 'Friday', audience: { kind: 'SYSTEM', systemId: 'sys-youth' } })).status).toBe(403);
  });
  it('a last day in the past is refused', async () => {
    const r = await post('p-pastor', '/api/announcements', { title: 'Old news', body: 'x', audience: all, expiresAt: '2020-01-01' });
    expect(r.body.code).toBe('BAD_DATES');
  });
});

describe('options for the form', () => {
  it('offers only what the server will accept', async () => {
    const lead = (await get('p-pastor', '/api/announcements/options')).body;
    expect(lead.wholeChurch).toBe(true);
    expect(lead.offices).toContain('TREASURER');
    expect(lead.systems.map((s: any) => s.id)).toContain('sys-youth');
    expect(lead.systems.map((s: any) => s.id)).not.toContain('sys-finance');
    const choirLead = (await get('p-choir-leader', '/api/announcements/options')).body;
    expect(choirLead.wholeChurch).toBe(false);
    expect(choirLead.offices).toEqual([]);
    expect(choirLead.systems.map((s: any) => s.id)).toEqual(['sys-choir']);
    const member = (await get('p-member', '/api/announcements/options')).body;
    expect(member.wholeChurch).toBe(false);
    expect(member.systems).toEqual([]);
  });
});

describe('reading', () => {
  beforeEach(async () => {
    await post('p-pastor', '/api/announcements', { title: 'Sunday service', body: 'At 9am', audience: all });
    await post('p-choir-leader', '/api/announcements', { title: 'Rehearsal', body: 'Friday', audience: choir });
    await post('p-pastor', '/api/announcements', { title: 'Treasurers meet', body: 'Monday', audience: { kind: 'OFFICE', office: 'TREASURER' } });
    fake.__db.announcement.forEach((a: any, i: number) => (a.publishedAt = new Date(Date.now() - (3 - i) * 60000)));
  });
  const titles = (r: any) => r.body.items.map((i: any) => i.title);
  it('each person sees what reaches them, newest first', async () => {
    expect(titles(await get('p-member', '/api/announcements'))).toEqual(['Sunday service']);
    expect(titles(await get('p-choir-member', '/api/announcements'))).toEqual(['Rehearsal', 'Sunday service']);
    expect(titles(await get('p-youth-member', '/api/announcements'))).toEqual(['Sunday service']);
    expect(titles(await get('p-choir-leader', '/api/announcements'))).toEqual(['Rehearsal', 'Sunday service']);
    expect(titles(await get('p-pastor', '/api/announcements'))).toEqual(['Treasurers meet', 'Rehearsal', 'Sunday service']);
  });
  it('an outsider with no place in the church sees nothing', async () => {
    expect((await get('p-outsider', '/api/announcements')).body.items).toEqual([]);
  });
  it('a treasurer sees the office post', async () => {
    fake.__db.position.find((p: any) => p.id === 'pos-treas').office = 'TREASURER';
    expect(titles(await get('p-treasurer', '/api/announcements'))).toContain('Treasurers meet');
  });
  it('unread counts and the latest show on the summary, and reading clears them', async () => {
    const s = await get('p-choir-member', '/api/announcements/summary');
    expect(s.body.unread).toBe(2);
    expect(s.body.latest.map((i: any) => i.title)).toEqual(['Rehearsal', 'Sunday service']);
    const id = s.body.latest[0].id;
    expect((await post('p-choir-member', '/api/announcements/read', { ids: [id] })).body.marked).toBe(1);
    expect((await get('p-choir-member', '/api/announcements/summary')).body.unread).toBe(1);
    expect((await post('p-choir-member', '/api/announcements/read', { all: true })).body.marked).toBe(1);
    expect((await get('p-choir-member', '/api/announcements/summary')).body.unread).toBe(0);
    expect((await post('p-choir-member', '/api/announcements/read', {})).status).toBe(400);
  });
  it('you cannot mark what you cannot see, and your own posts start read', async () => {
    const hidden = fake.__db.announcement.find((a: any) => a.title === 'Treasurers meet').id;
    expect((await post('p-member', '/api/announcements/read', { ids: [hidden] })).body.marked).toBe(0);
    expect(fake.__db.notificationRead).toHaveLength(0);
    const mine = (await get('p-pastor', '/api/announcements')).body.items;
    expect(mine.every((i: any) => i.read === true || i.mine === false)).toBe(true);
    expect(mine.find((i: any) => i.title === 'Rehearsal').read).toBe(false);
  });
  it('expired posts drop away', async () => {
    fake.__db.announcement.find((a: any) => a.title === 'Sunday service').expiresAt = new Date('2020-01-01T00:00:00Z');
    expect(titles(await get('p-member', '/api/announcements'))).toEqual([]);
  });
});

describe('taking a post down', () => {
  let id: string;
  beforeEach(async () => {
    const r = await post('p-choir-leader', '/api/announcements', { title: 'Rehearsal', body: 'Friday', audience: choir });
    id = r.body.announcement.id;
  });
  it('needs a reason and the right to', async () => {
    expect((await post('p-choir-leader', `/api/announcements/${id}/withdraw`, {})).status).toBe(400);
    expect((await post('p-choir-member', `/api/announcements/${id}/withdraw`, { reason: 'mistake' })).body.code).toBe('NOT_ALLOWED');
    expect((await post('p-choir-leader', '/api/announcements/zzz/withdraw', { reason: 'mistake' })).status).toBe(404);
  });
  it('the author or the Church Leader takes it down, once, and it is audited', async () => {
    const r = await post('p-pastor', `/api/announcements/${id}/withdraw`, { reason: 'Wrong day' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(fake.__db.announcement[0]).toMatchObject({ status: 'WITHDRAWN', withdrawnById: 'p-pastor', withdrawnReason: 'Wrong day' });
    expect((await get('p-choir-member', '/api/announcements')).body.items).toEqual([]);
    expect((await post('p-choir-leader', `/api/announcements/${id}/withdraw`, { reason: 'again' })).body.code).toBe('ALREADY_WITHDRAWN');
    expect(fake.__db.auditEvent.find((e: any) => e.action === 'ANNOUNCEMENT_WITHDRAWN')).toMatchObject({ actorId: 'p-pastor' });
  });
  it('tells each reader whether they may take it down', async () => {
    const lead = (await get('p-choir-leader', '/api/announcements')).body.items[0];
    expect(lead).toMatchObject({ mine: true, canWithdraw: true });
    const member = (await get('p-choir-member', '/api/announcements')).body.items[0];
    expect(member).toMatchObject({ mine: false, canWithdraw: false });
  });
});
