import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

/**
 * Write attacks. Each case is a real, valid request that would change something private or grant power.
 * The Church Leader's attempt is the control: it must be accepted by the body check and the access check
 * (never 400/401/403), so a refusal for the others can only be about access. Then four people who have no
 * business doing it try the same request: a stranger, a plain member, the Youth president (a president,
 * but of another system) and the Choir president. None may succeed, and nothing may change in the database.
 */
const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;

interface Case { by?: string; name: string; method: 'post' | 'put' | 'patch' | 'delete'; path: string; body: object; tables: string[] }

const NOW = new Date('2026-10-01T10:00:00Z');
const cases: Case[] = [
  { name: 'make yourself a member of Deacon', method: 'post', path: '/api/participation/memberships', body: { personId: 'p-member', systemId: 'sys-deacon' }, tables: ['membership'] },
  { name: 'appoint yourself Church Leader', method: 'post', path: '/api/participation/positions', body: { personId: 'p-member', title: 'Church Leader', systemId: 'sys-main', systemRole: 'CHURCH_LEADER' }, tables: ['position'] },
  { name: 'appoint yourself president of Deacon', method: 'post', path: '/api/participation/positions', body: { personId: 'p-member', title: 'President', systemId: 'sys-deacon', office: 'PRESIDENT' }, tables: ['position'] },
  { by: 'p-adm', name: 'appoint through the Access desk', method: 'post', path: '/api/access/appointments', body: { personId: 'p-member', orgUnitId: 'ou-deacon', office: 'PRESIDENT' }, tables: ['position'] },
  { name: 'borrow the Church Leader’s letters', method: 'post', path: '/api/access/delegations', body: { positionId: 'pos-pastor', toPersonId: 'p-member', letters: { PEOPLE: ['R', 'W'] }, endDate: '2026-12-01' }, tables: ['delegation'] },
  { name: 'give yourself an assignment into Deacon', method: 'post', path: '/api/assignments', body: { personId: 'p-member', title: 'Helper', contextType: 'PROJECT', contextId: 'x', contextLabel: 'x', systemId: 'sys-deacon' }, tables: ['assignment'] },
  { name: 'mint a login handoff for Deacon', method: 'post', path: '/api/sso/issue', body: { systemId: 'sys-deacon' }, tables: ['ssoHandoffToken'] },
  { name: 'rename the church', method: 'put', path: '/api/settings/church.profile', body: { value: { name: 'Hacked church', shortName: 'Hack', address: '', phone: '', email: '' } }, tables: ['setting'] },
  { name: 'change the move rules', method: 'put', path: '/api/settings/moves.rules', body: { value: { childMaxAge: 5, youthMaxAge: 20, elderlyFromAge: 50, adultTrigger: 'AGE' } }, tables: ['setting'] },
  { name: 'announce to the whole church', method: 'post', path: '/api/announcements', body: { title: 'Fake notice', body: 'Send money to me', audience: { kind: 'WHOLE_CHURCH' } }, tables: ['announcement'] },
  { name: 'call a Deacon meeting', method: 'post', path: '/api/governance/meetings', body: { orgUnitId: 'ou-deacon', typeCode: 'UNIT', title: 'Secret meeting', scheduledAt: '2026-11-01T10:00:00Z' }, tables: ['meeting'] },
  { name: 'draft a letter for Deacon', method: 'post', path: '/api/letters', body: { orgUnitId: 'ou-deacon', typeCode: 'INVITATION', subject: 'Forged letter', body: 'Forged body', recipientName: 'Someone' }, tables: ['letter'] },
  { by: 'p-deacon-treas', name: 'open a Deacon money account', method: 'post', path: '/api/money/accounts', body: { unitId: 'ou-deacon', name: 'Slush fund' }, tables: ['moneyAccount'] },
  { by: 'p-deacon-pres', name: 'record an offering count for Deacon', method: 'post', path: '/api/collections', body: { unitId: 'ou-deacon', kind: 'OFFERING', label: 'Sunday', serviceOn: '2026-09-27', amount: 1000, counterIds: ['p-youth-member', 'p-choir-member'] }, tables: ['offeringCount'] },
  { name: 'create Deacon work', method: 'post', path: '/api/work', body: { unitId: 'ou-deacon', title: 'Fake task', ownerId: 'p-youth-leader', helperIds: [], visibility: 'UNIT' }, tables: ['workTask'] },
  { name: 'confirm a move out of Youth', method: 'post', path: '/api/moves/confirm', body: { personId: 'p-youth-member', fromSystemId: 'sys-youth', toSystemId: 'sys-men' }, tables: ['membership'] },
  { by: 'p-deacon-pres', name: 'change Deacon’s own settings', method: 'put', path: '/api/system-settings/sys-deacon/details', body: { displayName: 'Hacked', meetingDay: 'Never', place: 'Nowhere', contactLine: 'none' }, tables: ['systemSetting'] },
];

const snapshot = (tables: string[]) => JSON.stringify(tables.map((t) => fake.__db[t] ?? []));

beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  for (const k of ['orgUnit', 'delegation', 'setting', 'announcement', 'meeting', 'letter', 'moneyAccount', 'offeringCount', 'workTask', 'ssoHandoffToken', 'systemSetting', 'assignment', 'auditEvent', 'notification', 'notificationRead']) fake.__db[k] ??= [];
  fake.__db.account ??= [];
  for (const id of ['p-pastor', 'p-member', 'p-outsider', 'p-youth-leader', 'p-choir-leader']) fake.__db.account.push({ id: `acc-${id}`, personId: id, username: id, person: { id, fullName: id } });
  fake.__db.orgUnit.push(
    { id: 'ou-church', name: 'ADEPR Kacyiru', code: 'KAC', kind: 'CENTRAL', type: 'ORGANISATION', parentId: null, systemId: 'sys-main' },
    { id: 'ou-deacon', name: 'Deacon', code: 'KAC-DEA', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-deacon' },
    { id: 'ou-youth', name: 'Youth', code: 'KAC-YOU', kind: 'MINISTRY', type: 'MINISTRY', parentId: 'ou-church', systemId: 'sys-youth' },
  );
  for (const s of fake.__db.churchSystem) { s.code = s.id.replace('sys-', '').toUpperCase(); s.name = s.id; s.shortName = s.id; s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY'; }
  const act = (id: string) => fake.__db.person.push({ id, fullName: id, status: 'ACTIVE' });
  ['p-adm', 'p-deacon-pres', 'p-deacon-treas'].forEach(act);
  const pos = (id: string, personId: string, extra: object) => fake.__db.position.push({ id, personId, title: id, status: 'ACTIVE', startDate: new Date('2024-01-01'), grantsAllSystems: false, ...extra });
  pos('pos-adm', 'p-adm', { systemId: 'sys-main', systemAdmin: true });
  pos('pos-dpres', 'p-deacon-pres', { systemId: 'sys-deacon', orgUnitId: 'ou-deacon', ministryOffice: 'PRESIDENT' });
  pos('pos-dtreas', 'p-deacon-treas', { systemId: 'sys-deacon', orgUnitId: 'ou-deacon', ministryOffice: 'TREASURER' });
  fake.__db.person.find((p: any) => p.id === 'p-youth-member').dateOfBirth = '1985-01-01';
  fake.__db.person.find((p: any) => p.id === 'p-youth-member').gender = 'Male';
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

describe('write attacks', () => {
  for (const c of cases) {
    it(`control: the Church Leader\u2019s request to ${c.name} is well formed`, async () => {
      const res = await request(app)[c.method](c.path).set(bearer(c.by ?? 'p-pastor')).send(c.body);
      expect([400, 401, 403], `${res.status} ${JSON.stringify(res.body)}`).not.toContain(res.status);
    });
    it(`nobody without the right may ${c.name}`, async () => {
      const before = snapshot(c.tables);
      const wrong: string[] = [];
      for (const who of ['p-outsider', 'p-member', 'p-youth-leader', 'p-choir-leader']) {
        // The Youth president moving their own people is allowed, so that one case skips them.
        if (c.name === 'confirm a move out of Youth' && who === 'p-youth-leader') continue;
        const res = await request(app)[c.method](c.path).set(bearer(who)).send(c.body);
        if (res.status >= 200 && res.status < 300) wrong.push(`${who} got ${res.status}`);
      }
      expect(wrong).toEqual([]);
      expect(snapshot(c.tables)).toBe(before);
    });
  }
});
