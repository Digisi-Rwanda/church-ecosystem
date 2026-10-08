import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { notify } from '../src/lib/notify';
import { addressedTo, countNotices, waitingFromAppointments, type Notice } from '../src/notifications/rules';
import type { Holding } from '../src/capabilities/engine';

/* ───────────── pure parts ───────────── */

const holding = (office: Holding['office'], systemId: string | null, scope: Holding['scope'] = 'UNIT'): Holding => ({
  positionId: 'p', office, systemId, orgUnitId: null, scope, via: 'OFFICE', letters: {},
});

describe('who a stored notice is for', () => {
  it('a person address is for that person only', () => {
    expect(addressedTo({ toPersonId: 'a' }, 'a', [])).toBe(true);
    expect(addressedTo({ toPersonId: 'a' }, 'b', [])).toBe(false);
  });
  it('an office address is for every live holder, narrowed by system for unit offices', () => {
    const choirPres = [holding('PRESIDENT', 'sys-choir')];
    expect(addressedTo({ toOffice: 'PRESIDENT' }, 'x', choirPres)).toBe(true);
    expect(addressedTo({ toOffice: 'PRESIDENT', toSystemId: 'sys-choir' }, 'x', choirPres)).toBe(true);
    expect(addressedTo({ toOffice: 'PRESIDENT', toSystemId: 'sys-youth' }, 'x', choirPres)).toBe(false);
    expect(addressedTo({ toOffice: 'TREASURER' }, 'x', choirPres)).toBe(false);
    expect(addressedTo({ toOffice: 'CATECHIST', toSystemId: 'sys-youth' }, 'x', [holding('CATECHIST', 'sys-main', 'CHURCH')])).toBe(true);
  });
  it('a lent holding does not receive what is addressed to the office', () => {
    expect(addressedTo({ toOffice: 'PRESIDENT' }, 'x', [{ ...holding('PRESIDENT', 'sys-choir'), via: 'DELEGATION' }])).toBe(false);
  });
  it('an address to nobody is for nobody', () => {
    expect(addressedTo({}, 'a', [holding('PRESIDENT', 'sys-choir')])).toBe(false);
  });
});

describe('writing notices', () => {
  const make = () => {
    const rows: any[] = [];
    return {
      rows,
      db: {
        notification: {
          findFirst: async ({ where }: any) => rows.find((r) => Object.entries(where).every(([k, v]) => (r[k] ?? null) === v)) ?? null,
          create: async ({ data }: any) => { rows.push(data); return data; },
        },
      },
    };
  };
  it('needs exactly one address', async () => {
    const { db, rows } = make();
    expect(await notify(db, { kind: 'FOR_INFORMATION', title: 't' })).toBe(false);
    expect(await notify(db, { kind: 'FOR_INFORMATION', title: 't', toPersonId: 'a', toOffice: 'PRESIDENT' })).toBe(false);
    expect(rows).toHaveLength(0);
  });
  it('never writes the same source twice to the same address', async () => {
    const { db, rows } = make();
    const n = { kind: 'FOR_INFORMATION', title: 't', toPersonId: 'a', sourceKey: 'k1' } as const;
    expect(await notify(db, n)).toBe(true);
    expect(await notify(db, n)).toBe(false);
    expect(await notify(db, { ...n, toPersonId: 'b' })).toBe(true);
    expect(rows).toHaveLength(2);
  });
  it('trims very long text', async () => {
    const { db, rows } = make();
    await notify(db, { kind: 'FOR_INFORMATION', title: 'x'.repeat(500), body: 'y'.repeat(5000), toPersonId: 'a' });
    expect(rows[0].title).toHaveLength(200);
    expect(rows[0].body).toHaveLength(1000);
  });
});

describe('counting', () => {
  const n = (kind: Notice['kind'], systemId: string, read: boolean): Notice => ({
    key: Math.random().toString(), kind, source: 'STORED', title: 't', body: null, href: null, systemId,
    createdAt: '2026-01-01T00:00:00Z', important: false, read, rank: 1,
  });
  it('counts unread per tab and per system', () => {
    const c = countNotices([n('WAITING_FOR_ME', 'sys-main', false), n('FOR_INFORMATION', 'sys-main', false), n('FOR_INFORMATION', 'sys-youth', false), n('FOR_INFORMATION', 'sys-youth', true)]);
    expect(c.waiting).toEqual({ total: 1, unread: 1 });
    expect(c.info).toEqual({ total: 3, unread: 2 });
    expect(c.unread).toBe(3);
    expect(c.bySystem).toEqual({ 'sys-main': 2, 'sys-youth': 1 });
  });
});

describe('seats waiting to be filled', () => {
  const NOW = new Date('2026-10-06T12:00:00Z');
  const units = [
    { id: 'ou-church', name: 'Church', kind: 'CENTRAL', systemId: 'sys-main' },
    { id: 'ou-choir', name: 'Choir', kind: 'MINISTRY', systemId: 'sys-choir' },
  ];
  const pos = (id: string, personId: string, office: string, systemId: string, orgUnitId: string) => ({ id, personId, office, systemId, orgUnitId, status: 'ACTIVE', startDate: '2020-01-01', endDate: null });
  const positions = [pos('a', 'lead', 'CHURCH_LEADER', 'sys-main', 'ou-church'), pos('b', 'cat', 'CATECHIST', 'sys-main', 'ou-church'), pos('c', 'sec', 'CHURCH_SECRETARY', 'sys-main', 'ou-church'), pos('d', 'p', 'PRESIDENT', 'sys-choir', 'ou-choir')];
  it('tells an Administrator about empty seats, the Church Leader seat and too few Administrators', () => {
    const w = waitingFromAppointments([holding('ADMINISTRATOR', 'sys-media', 'CHURCH')], units as any, positions as any, NOW);
    expect(w.map((x) => x.key)).toEqual(['vac-admins', 'vac:ou-choir:SECRETARY', 'vac:ou-choir:TREASURER']);
    expect(w[1].title).toBe('Choir needs a Secretary');
    const without = positions.filter((p) => p.office !== 'CHURCH_LEADER');
    const w2 = waitingFromAppointments([holding('ADMINISTRATOR', 'sys-media', 'CHURCH')], units as any, without as any, NOW);
    expect(w2.map((x) => x.key)).toContain('vac:ou-church:CHURCH_LEADER');
  });
  it('tells the Church Leader nothing: only Administrators assign offices', () => {
    expect(waitingFromAppointments([holding('CHURCH_LEADER', 'sys-main', 'CHURCH')], units as any, positions as any, NOW)).toEqual([]);
  });
  it('tells nobody else', () => {
    expect(waitingFromAppointments([holding('PRESIDENT', 'sys-choir')], units as any, positions as any, NOW)).toEqual([]);
    expect(waitingFromAppointments([], units as any, positions as any, NOW)).toEqual([]);
  });
  it('flags two holders of a sole office to an Administrator', () => {
    const dup = [...positions, pos('e', 'q', 'PRESIDENT', 'sys-choir', 'ou-choir')];
    const w = waitingFromAppointments([holding('ADMINISTRATOR', 'sys-media', 'CHURCH')], units as any, dup as any, NOW);
    expect(w.some((x) => x.key === 'vac-conflict:ou-choir:PRESIDENT')).toBe(true);
  });
});

/* ───────────── the routes ───────────── */

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object) => request(app).post(path).set(bearer(as)).send(body);

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'notification', 'notificationRead', 'preference', 'workTask']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.kind = s.id === 'sys-main' ? 'MAIN' : s.id === 'sys-finance' ? 'SHARED' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.orgUnit.push(
    { id: 'ou-church', name: 'ADEPR Kacyiru', code: 'KAC', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-choir', name: 'Choir', code: 'KAC-CHO', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-choir' },
    { id: 'ou-youth', name: 'Youth', code: 'KAC-YOU', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
  );
  db.person.push({ id: 'p-new', fullName: 'New Person', status: 'ACTIVE' });
  db.person.push({ id: 'p-admin1', fullName: 'Admin One', status: 'ACTIVE' });
  db.position.push({ id: 'pos-ad1', personId: 'p-admin1', systemId: 'sys-main', orgUnitId: 'ou-church', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: new Date('2024-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const addNotice = (extra: object = {}) => {
  const row = { id: `n-${fake.__db.notification.length + 1}`, kind: 'FOR_INFORMATION', toPersonId: 'p-member', title: 'Hello', systemId: 'sys-main', important: false, createdAt: new Date(), ...extra };
  fake.__db.notification.push(row);
  return row;
};

describe('GET /api/notifications', () => {
  it('needs sign-in', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await request(app).get('/api/notifications/summary')).status).toBe(401);
  });
  it('shows only my own notices, split into the two tabs, with counts', async () => {
    addNotice({ title: 'For me' });
    addNotice({ title: 'For someone else', toPersonId: 'p-pastor' });
    addNotice({ kind: 'WAITING_FOR_ME', title: 'Please act' });
    const r = await get('p-member', '/api/notifications');
    expect(r.body.items.map((i: any) => i.title).sort()).toEqual(['For me', 'Please act']);
    expect(r.body.counts).toMatchObject({ waiting: { total: 1, unread: 1 }, info: { total: 1, unread: 1 }, unread: 2 });
    expect((await get('p-member', '/api/notifications?tab=info')).body.items.map((i: any) => i.title)).toEqual(['For me']);
    expect((await get('p-member', '/api/notifications?tab=waiting')).body.items.map((i: any) => i.title)).toEqual(['Please act']);
  });
  it('hides information older than ninety days', async () => {
    addNotice({ title: 'Old', createdAt: new Date(Date.now() - 100 * 86400000) });
    addNotice({ title: 'Recent' });
    expect((await get('p-member', '/api/notifications')).body.items.map((i: any) => i.title)).toEqual(['Recent']);
  });
  it('an office address reaches every live holder of the office in that system, and nobody else', async () => {
    addNotice({ toPersonId: null, toOffice: 'PRESIDENT', toSystemId: 'sys-choir', title: 'Choir presidents' });
    expect((await get('p-choir-leader', '/api/notifications')).body.items.map((i: any) => i.title)).toEqual(['Choir presidents']);
    expect((await get('p-youth-leader', '/api/notifications')).body.items).toEqual([]);
    expect((await get('p-member', '/api/notifications')).body.items).toEqual([]);
    fake.__db.position.find((p: any) => p.id === 'pos-choir').status = 'ENDED';
    expect((await get('p-choir-leader', '/api/notifications')).body.items).toEqual([]);
  });
});

describe('read state', () => {
  it('is kept on the server, so a second device sees it, and can be undone', async () => {
    const n = addNotice();
    expect((await post('p-member', '/api/notifications/read', { keys: [n.id] })).body.marked).toBe(1);
    const again = await get('p-member', '/api/notifications');
    expect(again.body.items[0].read).toBe(true);
    expect(again.body.counts.unread).toBe(0);
    expect((await post('p-member', '/api/notifications/read', { keys: [n.id] })).body.marked).toBe(0);
    expect((await post('p-member', '/api/notifications/unread', { keys: [n.id] })).body.marked).toBe(1);
    expect((await get('p-member', '/api/notifications')).body.counts.unread).toBe(1);
  });
  it('one person can never mark, or undo, another person’s notices', async () => {
    const n = addNotice({ toPersonId: 'p-pastor' });
    expect((await post('p-member', '/api/notifications/read', { keys: [n.id] })).body.marked).toBe(0);
    expect(fake.__db.notificationRead).toHaveLength(0);
    await post('p-pastor', '/api/notifications/read', { keys: [n.id] });
    await post('p-member', '/api/notifications/unread', { keys: [n.id] });
    expect((await get('p-pastor', '/api/notifications')).body.items.find((i: any) => i.key === n.id).read).toBe(true);
  });
  it('can mark everything in a tab or system at once, and refuses an empty request', async () => {
    addNotice(); addNotice({ systemId: 'sys-youth' }); addNotice({ kind: 'WAITING_FOR_ME' });
    expect((await post('p-member', '/api/notifications/read', {})).status).toBe(400);
    expect((await post('p-member', '/api/notifications/read', { all: true, tab: 'info', system: 'sys-main' })).body.marked).toBe(1);
    expect((await post('p-member', '/api/notifications/read', { all: true })).body.marked).toBe(2);
    expect((await get('p-member', '/api/notifications')).body.counts.unread).toBe(0);
  });
  it('ignores keys that are not the person’s notices', async () => {
    expect((await post('p-member', '/api/notifications/read', { keys: ['made-up'] })).body.marked).toBe(0);
    expect(fake.__db.notificationRead).toHaveLength(0);
  });
});

describe('things waiting for me', () => {
  it('open tasks appear as Waiting for me, and leave by themselves when the task is done', async () => {
    fake.__db.workTask.push({ id: 't1', title: 'Send the report', ownerPersonId: 'p-member', status: 'TODO', startDate: new Date('2026-01-01'), dueDate: new Date('2020-01-01') });
    const r = await get('p-member', '/api/notifications?tab=waiting');
    expect(r.body.items).toEqual([expect.objectContaining({ key: 'attn:task-t1', title: 'Send the report', important: true })]);
    await post('p-member', '/api/notifications/read', { keys: ['attn:task-t1'] });
    expect((await get('p-member', '/api/notifications?tab=waiting')).body.items[0].read).toBe(true);
    fake.__db.workTask[0].status = 'DONE';
    expect((await get('p-member', '/api/notifications?tab=waiting')).body.items).toEqual([]);
  });
  it('an Administrator is told about empty seats; the Church Leader and an ordinary member are not', async () => {
    expect((await get('p-pastor', '/api/notifications?tab=waiting')).body.items.map((i: any) => i.title)).not.toContain('Choir needs a Secretary');
    const lead = await get('p-admin1', '/api/notifications?tab=waiting');
    const titles = lead.body.items.map((i: any) => i.title);
    expect(titles).toContain('Choir needs a Secretary');
    expect(titles.some((t: string) => /Administrators/.test(t))).toBe(true);
    expect((await get('p-member', '/api/notifications?tab=waiting')).body.items).toEqual([]);
  });
  it('a filled seat stops waiting', async () => {
    const before = (await get('p-admin1', '/api/notifications?tab=waiting')).body.items.map((i: any) => i.title);
    expect(before).toContain('Youth needs a Secretary');
    await post('p-admin1', '/api/access/appointments', { personId: 'p-new', orgUnitId: 'ou-youth', office: 'SECRETARY' });
    const after = (await get('p-admin1', '/api/notifications?tab=waiting')).body.items.map((i: any) => i.title);
    expect(after).not.toContain('Youth needs a Secretary');
  });
});

describe('summary and the Portal badge', () => {
  it('gives counts per system and the most urgent things for the Urgent tile', async () => {
    addNotice({ systemId: 'sys-youth', toPersonId: 'p-pastor' });
    const r = await get('p-pastor', '/api/notifications/summary');
    expect(r.body.counts.bySystem['sys-youth']).toBe(1);
    expect(r.body.urgent.length).toBeLessThanOrEqual(5);
    expect(r.body.urgent.every((u: any) => u.kind === 'WAITING_FOR_ME')).toBe(true);
    expect((await get('p-pastor', '/api/notifications/summary?system=sys-youth')).body.urgent).toEqual([]);
  });
  it('the Portal shows the unread count on each system card', async () => {
    addNotice({ systemId: 'sys-choir', toPersonId: 'p-choir-leader' });
    addNotice({ systemId: 'sys-choir', toPersonId: 'p-choir-leader' });
    const r = await get('p-choir-leader', '/api/portal');
    expect(r.body.systems.find((s: any) => s.id === 'sys-choir').unreadCount).toBe(2);
    await post('p-choir-leader', '/api/notifications/read', { all: true });
    expect((await get('p-choir-leader', '/api/portal')).body.systems.find((s: any) => s.id === 'sys-choir').unreadCount).toBe(0);
  });
});

describe('preferences', () => {
  it('start empty, and are kept on the server', async () => {
    expect((await get('p-member', '/api/me/preferences')).body).toMatchObject({ language: null, theme: null, mutedSystems: [], languages: ['en', 'rw', 'fr'] });
    const put = await request(app).put('/api/me/preferences').set(bearer('p-member')).send({ language: 'rw', theme: 'dark', mutedSystems: ['sys-youth'] });
    expect(put.body).toEqual({ language: 'rw', theme: 'dark', mutedSystems: ['sys-youth'], digestChannel: 'OFF' });
    expect((await get('p-member', '/api/me/preferences')).body).toMatchObject({ language: 'rw', theme: 'dark', mutedSystems: ['sys-youth'] });
    expect((await get('p-pastor', '/api/me/preferences')).body.language).toBeNull();
  });
  it('refuse a language or a system that does not exist', async () => {
    expect((await request(app).put('/api/me/preferences').set(bearer('p-member')).send({ language: 'de' })).status).toBe(400);
    const r = await request(app).put('/api/me/preferences').set(bearer('p-member')).send({ mutedSystems: ['sys-nope'] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('UNKNOWN_SYSTEM');
  });
  it('muting a system hides its ordinary information, never important notices or things waiting', async () => {
    addNotice({ systemId: 'sys-youth', title: 'Youth news' });
    addNotice({ systemId: 'sys-youth', title: 'Youth important', important: true });
    addNotice({ systemId: 'sys-youth', kind: 'WAITING_FOR_ME', title: 'Youth waiting' });
    await request(app).put('/api/me/preferences').set(bearer('p-member')).send({ mutedSystems: ['sys-youth'] });
    const titles = (await get('p-member', '/api/notifications')).body.items.map((i: any) => i.title).sort();
    expect(titles).toEqual(['Youth important', 'Youth waiting']);
  });
  it('can be cleared again', async () => {
    await request(app).put('/api/me/preferences').set(bearer('p-member')).send({ mutedSystems: ['sys-youth'] });
    const r = await request(app).put('/api/me/preferences').set(bearer('p-member')).send({ mutedSystems: [], language: null });
    expect(r.body).toEqual({ language: null, theme: null, mutedSystems: [], digestChannel: 'OFF' });
  });
});

describe('notices the server writes itself', () => {
  it('appointing, ending and lending each tell the person, once, as important information', async () => {
    const a = await post('p-admin1', '/api/access/appointments', { personId: 'p-new', orgUnitId: 'ou-youth', office: 'SECRETARY' });
    expect(a.status).toBe(201);
    let mine = (await get('p-new', '/api/notifications?tab=info')).body.items;
    expect(mine).toEqual([expect.objectContaining({ title: 'You are now Secretary of Youth', important: true, read: false })]);
    await post('p-admin1', `/api/access/appointments/${a.body.appointment.id}/end`, { reason: 'moved away' });
    mine = (await get('p-new', '/api/notifications?tab=info')).body.items;
    expect(mine.map((i: any) => i.title)).toContain('You are no longer Secretary');
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await post('p-choir-leader', '/api/access/delegations', { positionId: 'pos-choir', toPersonId: 'p-new', letters: { MISSION: ['W'] }, endDate: soon });
    mine = (await get('p-new', '/api/notifications?tab=info')).body.items;
    expect(mine.map((i: any) => i.title)).toContain('President has lent you some letters');
    await post('p-choir-leader', `/api/access/delegations/${fake.__db.delegation[0].id}/revoke`, {});
    expect((await get('p-new', '/api/notifications?tab=info')).body.items.map((i: any) => i.title)).toContain('Letters lent to you have been taken back');
  });
  it('a muted system never hides these, because they are important', async () => {
    await request(app).put('/api/me/preferences').set(bearer('p-new')).send({ mutedSystems: ['sys-youth'] });
    await post('p-admin1', '/api/access/appointments', { personId: 'p-new', orgUnitId: 'ou-youth', office: 'SECRETARY' });
    expect((await get('p-new', '/api/notifications?tab=info')).body.items).toHaveLength(1);
  });
});
