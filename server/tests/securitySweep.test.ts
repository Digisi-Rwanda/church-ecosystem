import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

/**
 * Security sweep: every route the API mounts is called as someone with no place in the church and as a
 * plain member. Anyone without a sign-in gets 401 everywhere except the public doors. Nobody outside a
 * system may read anything of it, and a plain member may not change anything outside their own record.
 */
const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;

interface RouteDef { method: 'get' | 'post' | 'put' | 'patch' | 'delete'; path: string }

/** Every route, read from the source: the mount path in app.ts plus each router.<verb>('/path') in its file. */
function routes(): RouteDef[] {
  const src = path.resolve(__dirname, '../src');
  const appSrc = fs.readFileSync(path.join(src, 'app.ts'), 'utf8');
  const imports = new Map<string, string>();
  for (const m of appSrc.matchAll(/import \{ (\w+) \} from '\.\/routes\/([\w]+)\.js'/g)) imports.set(m[1]!, m[2]!);
  const out: RouteDef[] = [];
  for (const m of appSrc.matchAll(/app\.use\('(\/api[^']*)',\s*(\w+)\)/g)) {
    const file = imports.get(m[2]!);
    if (!file) continue;
    const text = fs.readFileSync(path.join(src, 'routes', `${file}.ts`), 'utf8');
    for (const r of text.matchAll(/\w+Router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const sub = r[2] === '/' ? '' : r[2]!;
      out.push({ method: r[1] as RouteDef['method'], path: (m[1]! + sub).replace(/:\w+/g, 'x') });
    }
  }
  return out;
}

// Doors that are public or about the caller's own sign-in.
const PUBLIC = [/^\/api\/health/, /^\/api\/auth\//, /^\/api\/sso\/redeem/, /^\/api\/sso\/handoff/];
const isPublic = (p: string) => PUBLIC.some((re) => re.test(p));

beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  for (const k of Object.keys(fake.__db)) fake.__db[k] ??= [];
  const { createApp } = await import('../src/app');
  app = createApp();
});

describe('security sweep', () => {
  const all = routes();
  it('finds the routes', () => {
    expect(all.length).toBeGreaterThan(150);
  });
  it('without a sign-in every protected route says 401', async () => {
    const bad: string[] = [];
    for (const r of all.filter((x) => !isPublic(x.path))) {
      const res = await request(app)[r.method](r.path).send({});
      if (res.status !== 401) bad.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`);
    }
    expect(bad).toEqual([]);
  });
  it('a person with no place in the church changes nothing', async () => {
    const bad: string[] = [];
    for (const r of all.filter((x) => x.method !== 'get' && !isPublic(x.path))) {
      const res = await request(app)[r.method](r.path).set(bearer('p-outsider')).send({});
      if (res.status >= 200 && res.status < 300) bad.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`);
    }
    expect(bad).toEqual([]);
  });
  it('nothing of a system leaks to someone who is not in it', async () => {
    // A private Deacon record in every table that carries a system, every text field marked.
    const M = 'SECRET-DEACON';
    const now = new Date();
    const row = (i: number) => ({
      id: `leak-${i}`, systemId: 'sys-deacon', orgUnitId: 'ou-deacon', unitId: 'ou-deacon', groupId: 'leak-0', title: M, name: M, note: M, notes: M, summary: M, body: M,
      description: M, subject: M, reason: M, place: M, venue: M, label: M, fullName: M, contextLabel: M, category: 'OFFERING', kind: 'OFFERING', type: 'OFFERING',
      status: 'ACTIVE', visibility: 'SYSTEM', amount: 1000, total: 1000, createdAt: now, updatedAt: now, startDate: now, endDate: null, heldOn: now, recordedAt: now,
      dueDate: now, date: now, startsAt: now, endsAt: now, personId: 'p-youth-leader', createdById: 'p-youth-leader', recordedById: 'p-youth-leader', presentJson: '[]',
      dataJson: JSON.stringify({ note: M }), detailsJson: JSON.stringify({ note: M }), moneyJson: JSON.stringify({ note: M }), bodyJson: JSON.stringify({ note: M }),
    });
    const tables = ['workTask', 'program', 'programActivity', 'churchEvent', 'churchProject', 'meeting', 'decision', 'letter', 'moneyAccount', 'moneyEntry', 'offeringCount',
      'report', 'reportSchedule', 'unitGroup', 'groupMember', 'groupSession', 'couplePair', 'visitLog', 'prayerWatch', 'evangelismContact', 'contactFollowUp', 'workPlan',
      'workPlanNote', 'moneyBudget', 'moneyPlanItem', 'moneyContributionList', 'moneyDonation', 'announcement', 'notification', 'systemSetting', 'scheduleSlot', 'musicChoir',
      'choirRehearsal', 'choirSong', 'choirSponsor', 'protocolRoster', 'protocolPlan', 'protocolServiceReport', 'personRecord', 'missionShare', 'assignment'];
    tables.forEach((t, i) => { fake.__db[t] ??= []; fake.__db[t].push({ ...row(i), personId: t === 'assignment' || t === 'personRecord' ? 'p-youth-leader' : 'p-youth-leader' }); });
    fake.__db.orgUnit ??= [];
    fake.__db.orgUnit.push({ id: 'ou-deacon', name: 'Deacon unit', code: 'KAC-DEA', kind: 'MINISTRY', type: 'MINISTRY', parentId: null, systemId: 'sys-deacon' });
    const leaks: string[] = [];
    for (const who of ['p-outsider', 'p-member', 'p-youth-member', 'p-choir-leader']) {
      for (const r of all.filter((x) => x.method === 'get' && !isPublic(x.path))) {
        for (const q of ['', '?systemId=sys-deacon', '?systemId=sys-deacon&unitId=ou-deacon&orgUnitId=ou-deacon&year=2026&month=2026-10']) {
          const res = await request(app).get(r.path + q).set(bearer(who));
          if (JSON.stringify(res.body ?? {}).includes(M)) leaks.push(`${who} GET ${r.path}${q}`);
        }
      }
    }
    expect([...new Set(leaks)]).toEqual([]);
    // Control: the seed is real, so the Church Leader, who may read every system, does see it somewhere.
    const seen = new Set<string>();
    for (const r of all.filter((x) => x.method === 'get' && !isPublic(x.path))) {
      const res = await request(app).get(`${r.path}?systemId=sys-deacon`).set(bearer('p-pastor'));
      if (JSON.stringify(res.body ?? {}).includes(M)) seen.add(r.path);
    }
    console.log('LEADER SEES: ' + [...seen].join(' '));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});
