import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { DEFAULTS, DEFAULT_LETTER_TYPES, DEFAULT_MEETING_TYPES, SETTING_KEYS, check, resolve } from '../src/settings/catalog';

describe('the seven settings', () => {
  it('there are exactly seven, each with a default', () => {
    expect(SETTING_KEYS).toHaveLength(7);
    for (const k of SETTING_KEYS) expect(DEFAULTS[k]).toBeDefined();
    expect(DEFAULT_LETTER_TYPES).toHaveLength(6);
    expect(DEFAULT_MEETING_TYPES.map((t) => t.code)).toContain('BOARD');
  });
  it('a type list needs 2-24 character codes, names, no duplicates, and at least one entry', () => {
    expect(check('letters.types', [{ code: 'a', name: 'x' }]).ok).toBe(false);
    expect(check('letters.types', [{ code: 'OK_1', name: 'x' }]).ok).toBe(false);
    expect(check('letters.types', [{ code: 'OK_1', name: 'Fine' }, { code: 'OK_1', name: 'Again' }]).ok).toBe(false);
    expect(check('letters.types', []).ok).toBe(false);
    const good = check('letters.types', [{ code: 'ok_1', name: ' Fine ' }]);
    expect(good).toEqual({ ok: true, value: [{ code: 'OK_1', name: 'Fine' }] });
    expect(check('letters.types', Array.from({ length: 31 }, (_, i) => ({ code: `C${i}X`, name: 'Name' }))).ok).toBe(false);
  });
  it('days must be whole numbers inside their range', () => {
    expect(check('access.termReminderDays', 30).ok).toBe(true);
    expect(check('access.termReminderDays', 13).ok).toBe(false);
    expect(check('access.termReminderDays', 181).ok).toBe(false);
    expect(check('access.termReminderDays', 30.5).ok).toBe(false);
    expect(check('access.delegationMaxDays', 6).ok).toBe(false);
    expect(check('access.delegationMaxDays', '30').ok).toBe(false);
    expect(check('access.delegationMaxDays', 180).ok).toBe(true);
  });
  it('language is one of the three; the profile needs a name and a real e-mail address', () => {
    expect(check('church.language', 'rw').ok).toBe(true);
    expect(check('church.language', 'de').ok).toBe(false);
    const base = { name: 'ADEPR Kacyiru', shortName: 'Kacyiru', address: '', phone: '', email: '' };
    expect(check('church.profile', base).ok).toBe(true);
    expect(check('church.profile', { ...base, name: 'A' }).ok).toBe(false);
    expect(check('church.profile', { ...base, email: 'nope' }).ok).toBe(false);
    expect(check('church.profile', { ...base, email: 'office@kacyiru.rw' }).ok).toBe(true);
  });
  it('stored values lie over defaults, and a stored value that no longer passes is ignored', () => {
    const v = resolve([
      { key: 'access.termReminderDays', valueJson: '30' },
      { key: 'access.delegationMaxDays', valueJson: '999' },
      { key: 'church.language', valueJson: 'not json' },
      { key: 'unknown.key', valueJson: '1' },
    ]);
    expect(v['access.termReminderDays']).toBe(30);
    expect(v['access.delegationMaxDays']).toBe(90);
    expect(v['church.language']).toBe('en');
    expect(DEFAULTS['access.termReminderDays']).toBe(60);
  });
});

/* ───────────── the routes ───────────── */

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const put = (as: string, key: string, value: unknown) => request(app).put(`/api/settings/${key}`).set(bearer(as)).send({ value });

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead']) db[k] ??= [];
  for (const s of db.churchSystem) {
    s.code = s.id.replace('sys-', '').toUpperCase();
    s.name = s.id;
    s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY';
    s.basePath = `/${s.id}`;
  }
  db.person.push({ id: 'p-cat', fullName: 'Catechist', status: 'ACTIVE' }, { id: 'p-sec', fullName: 'Church Secretary', status: 'ACTIVE' }, { id: 'p-adm', fullName: 'Admin', status: 'ACTIVE' });
  db.position.push(
    { id: 'pos-cat', personId: 'p-cat', systemId: 'sys-main', title: 'Catechist', office: 'CATECHIST', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-sec', personId: 'p-sec', systemId: 'sys-main', title: 'Church Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') },
    { id: 'pos-adm', personId: 'p-adm', systemId: 'sys-media', title: 'Administrator', office: 'ADMINISTRATOR', systemAdmin: true, status: 'ACTIVE', startDate: new Date('2022-01-01') },
  );
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('reading', () => {
  it('needs sign-in; only Central Administration reads all six, and only three offices may change', async () => {
    expect((await request(app).get('/api/settings')).status).toBe(401);
    expect((await get('p-member', '/api/settings')).status).toBe(403);
    expect((await get('p-choir-leader', '/api/settings')).status).toBe(403);
    for (const who of ['p-pastor', 'p-cat', 'p-sec']) expect((await get(who, '/api/settings')).body.canChange, who).toBe(true);
    const adm = await get('p-adm', '/api/settings');
    expect(adm.status).toBe(200);
    expect(adm.body.canChange).toBe(false);
  });
  it('lists the six with their defaults', async () => {
    const r = await get('p-pastor', '/api/settings');
    expect(r.body.settings.map((s: any) => s.key)).toEqual([...SETTING_KEYS]);
    expect(r.body.settings.every((s: any) => s.isDefault)).toBe(true);
    expect(r.body.settings.find((s: any) => s.key === 'letters.types').value).toHaveLength(6);
  });
  it('everyone signed in reads the public lists', async () => {
    const r = await get('p-member', '/api/settings/public');
    expect(r.status).toBe(200);
    expect(r.body.letterTypes).toHaveLength(6);
    expect(r.body.meetingTypes.map((t: any) => t.code)).toContain('BOARD');
    expect(r.body.churchName).toBe('ADEPR Kacyiru');
  });
});

describe('changing', () => {
  it('the Church Leader, Catechist and Church Secretary change a setting; it is audited with before and after', async () => {
    const r = await put('p-cat', 'access.termReminderDays', 30);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.changed).toBe(true);
    const row = fake.__db.setting.find((s: any) => s.key === 'access.termReminderDays');
    expect(JSON.parse(row.valueJson)).toBe(30);
    expect(row.updatedById).toBe('p-cat');
    const ev = fake.__db.auditEvent.find((e: any) => e.action === 'SETTING_CHANGED');
    expect(ev).toMatchObject({ actorId: 'p-cat', resource: 'SETTING' });
    expect(JSON.parse(ev.metaJson)).toEqual({ key: 'access.termReminderDays', before: 60, after: 30 });
    const list = await get('p-pastor', '/api/settings');
    const s = list.body.settings.find((x: any) => x.key === 'access.termReminderDays');
    expect(s).toMatchObject({ value: 30, isDefault: false, updatedByName: 'Catechist' });
  });
  it('nobody else can, including Administrators and a unit president', async () => {
    for (const who of ['p-adm', 'p-choir-leader', 'p-member', 'p-treasurer']) {
      const r = await put(who, 'access.termReminderDays', 30);
      expect(r.status, who).toBe(403);
    }
    expect(fake.__db.setting).toHaveLength(0);
  });
  it('refuses unknown settings and values that fail the check, and writes nothing', async () => {
    expect((await put('p-pastor', 'nope', 1)).status).toBe(404);
    const bad = await put('p-pastor', 'access.delegationMaxDays', 1000);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('BAD_VALUE');
    expect(fake.__db.setting).toHaveLength(0);
    expect(fake.__db.auditEvent).toHaveLength(0);
  });
  it('saving the same value changes nothing and is not audited', async () => {
    const r = await put('p-pastor', 'access.termReminderDays', 60);
    expect(r.body.changed).toBe(false);
    expect(fake.__db.setting).toHaveLength(0);
    expect(fake.__db.auditEvent).toHaveLength(0);
  });
  it('a letter-type list is changed whole and shows to everyone', async () => {
    const list = [...DEFAULT_LETTER_TYPES, { code: 'CONDOLENCE', name: 'Condolence' }];
    expect((await put('p-sec', 'letters.types', list)).status).toBe(200);
    expect((await get('p-member', '/api/settings/public')).body.letterTypes).toHaveLength(7);
  });
  it('reset puts a setting back to its default, audited once', async () => {
    await put('p-pastor', 'church.language', 'rw');
    expect((await get('p-member', '/api/settings/public')).body.defaultLanguage).toBe('rw');
    expect((await request(app).delete('/api/settings/church.language').set(bearer('p-member'))).status).toBe(403);
    const r = await request(app).delete('/api/settings/church.language').set(bearer('p-pastor'));
    expect(r.body.changed).toBe(true);
    expect((await get('p-member', '/api/settings/public')).body.defaultLanguage).toBe('en');
    expect((await request(app).delete('/api/settings/church.language').set(bearer('p-pastor'))).body.changed).toBe(false);
    expect(fake.__db.auditEvent.map((e: any) => e.action)).toEqual(['SETTING_CHANGED', 'SETTING_RESET']);
  });
});

describe('settings reach the rules they name', () => {
  it('the delegation limit follows the setting', async () => {
    fake.__db.person.push({ id: 'p-new', fullName: 'New', status: 'ACTIVE' });
    const day = 24 * 3600 * 1000;
    const lend = (days: number) =>
      request(app).post('/api/access/delegations').set(bearer('p-pastor')).send({
        positionId: 'pos-pastor', toPersonId: 'p-new', letters: { MISSION: ['W'] },
        endDate: new Date(Date.now() + days * day).toISOString().slice(0, 10),
      });
    expect((await lend(40)).status).toBe(201);
    await put('p-pastor', 'access.delegationMaxDays', 30);
    const r = await lend(40);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('DELEGATION_TOO_LONG');
    expect((await get('p-pastor', '/api/access/matrix')).body.limits.delegationMaxDays).toBe(30);
  });
});
