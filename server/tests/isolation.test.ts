import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';

/**
 * Firm walls between systems. Every system keeps private records; a person who works in one system (as a
 * president, a treasurer, a member or an Administrator in Media) must not be able to read any of them
 * through any route, by list or by id, and must not be able to change them. Central Administration is the
 * one place that oversees every system, so it is the control that must still see them.
 */
const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
let srv: import('node:http').Server;

interface RouteDef { method: 'get' | 'post' | 'put' | 'patch' | 'delete'; path: string }

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
      out.push({ method: r[1] as RouteDef['method'], path: m[1]! + sub });
    }
  }
  return out;
}
const PUBLIC = [/^\/api\/health/, /^\/api\/auth\//, /^\/api\/sso\/redeem/, /^\/api\/sso\/handoff/];
const isPublic = (p: string) => PUBLIC.some((re) => re.test(p));

const PRIVATE_SYSTEMS = ['sys-deacon', 'sys-women', 'sys-couples', 'sys-youth', 'sys-choir'];
const mark = (s: string) => `SECRET-${s}`;
const TABLES = ['workTask', 'program', 'programActivity', 'churchEvent', 'churchProject', 'meeting', 'decision', 'letter', 'moneyAccount', 'moneyEntry', 'offeringCount',
  'report', 'reportSchedule', 'unitGroup', 'groupMember', 'groupSession', 'couplePair', 'visitLog', 'prayerWatch', 'workPlan',
  'workPlanNote', 'moneyBudget', 'moneyPlanItem', 'moneyContributionList', 'moneyDonation', 'announcement', 'notification', 'systemSetting', 'scheduleSlot',
  'missionShare', 'assignment', 'contributionClaim', 'monthPlan', 'moneyBudgetLine', 'contributionList', 'donation'];

function seedPrivate(s: string) {
  const M = mark(s);
  const now = new Date();
  const unit = `ou-${s}`;
  fake.__db.orgUnit ??= [];
  fake.__db.orgUnit.push({ id: unit, name: `${M} unit`, code: `K-${s}`, kind: 'MINISTRY', type: 'MINISTRY', parentId: null, systemId: s });
  TABLES.forEach((t) => {
    fake.__db[t] ??= [];
    fake.__db[t].push({
      id: `leak-${s}`, systemId: s, ownerSystemId: s, orgUnitId: unit, unitId: unit, groupId: `leak-${s}`, title: M, name: M, note: M, notes: M, summary: M, body: M,
      description: M, subject: M, reason: M, place: M, venue: M, label: M, fullName: M, contextLabel: M, donorName: M, category: 'OFFERING', kind: 'OFFERING', type: 'OFFERING',
      status: 'ACTIVE', visibility: 'SYSTEM', amount: 1000, total: 1000, createdAt: now, updatedAt: now, startDate: now, endDate: null, heldOn: now, recordedAt: now,
      dueDate: now, date: now, startsAt: now, endsAt: now, occurredOn: now, serviceOn: now, month: '2026-10', year: 2026, personId: 'p-member', createdById: 'p-member', recordedById: 'p-member',
      presentJson: '[]', dataJson: JSON.stringify({ note: M }), detailsJson: JSON.stringify({ note: M }), moneyJson: JSON.stringify({ note: M }), bodyJson: JSON.stringify({ note: M }),
      snapshotJson: JSON.stringify({ note: M }), slotsJson: '[]',
    });
  });
}

function seedPeople() {
  const p = (id: string) => ({ id, fullName: id, status: 'ACTIVE', email: `${id}@x.org`, phone: '0780000001' });
  fake.__db.person.push(p('p-pastor-2'), p('p-ctreas'), p('p-csec'), p('p-catechist'), p('p-admin'), p('p-women-treas'), p('p-deacon-pres'));
  const mem = (id: string, sys: string) => ({ id: `mem-${id}-${sys}`, personId: id, systemId: sys, type: 'MINISTRY_MEMBER', label: 'Member', status: 'ACTIVE', startDate: new Date('2021-01-01') });
  fake.__db.membership.push(
    { id: 'm-a', personId: 'p-admin', systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'Church member', status: 'ACTIVE', startDate: new Date('2020-01-01') },
    mem('p-admin', 'sys-media'), mem('p-women-treas', 'sys-women'), mem('p-deacon-pres', 'sys-deacon'),
  );
  const pos = (id: string, personId: string, systemId: string, office: string) => ({ id, personId, systemId, office, title: office, status: 'ACTIVE', startDate: new Date('2021-01-01') });
  fake.__db.position.push(
    pos('pos-admin', 'p-admin', 'sys-media', 'ADMINISTRATOR'),
    pos('pos-wt', 'p-women-treas', 'sys-women', 'TREASURER'),
    pos('pos-dp', 'p-deacon-pres', 'sys-deacon', 'PRESIDENT'),
    pos('pos-pa2', 'p-pastor-2', 'sys-main', 'PASTOR'),
    pos('pos-ct', 'p-ctreas', 'sys-main', 'CHURCH_TREASURER'),
    pos('pos-cs', 'p-csec', 'sys-main', 'CHURCH_SECRETARY'),
    pos('pos-ca', 'p-catechist', 'sys-main', 'CATECHIST'),
    pos('pos-yp', 'p-youth-leader', 'sys-youth', 'PRESIDENT'),
  );
}

beforeEach(async () => {
  fake.__reset();
  seedWorld(fake.__db);
  for (const k of ['orgUnit', 'position', 'membership', 'person']) fake.__db[k] ??= [];
  seedPeople();
  PRIVATE_SYSTEMS.forEach(seedPrivate);
  for (const k of Object.keys(fake.__db)) fake.__db[k] ??= [];
  const { createApp } = await import('../src/app');
  app = createApp();
  srv?.close();
  srv = app.listen(0);
});

afterAll(() => { srv?.close(); });

/** Each person, the system they work in, and the systems whose secrets they must never see. */
const WHO: Array<{ who: string; home: string }> = [
  { who: 'p-youth-leader', home: 'sys-youth' },
  { who: 'p-women-treas', home: 'sys-women' },
  { who: 'p-deacon-pres', home: 'sys-deacon' },
  { who: 'p-admin', home: 'sys-media' },
  { who: 'p-pastor-2', home: 'sys-main' },
  { who: 'p-ctreas', home: 'sys-main' },
  { who: 'p-csec', home: 'sys-main' },
  { who: 'p-catechist', home: 'sys-main' },
  { who: 'p-youth-member', home: 'sys-youth' },
];

describe('firm walls between systems', () => {
  const all = routes().filter((r) => !isPublic(r.path));
  const urls = (r: RouteDef): string[] => {
    if (!r.path.includes(':')) return [r.path];
    // Every private record id of every table stands in for each path parameter, one table at a time.
    const out: string[] = [];
    for (const s of PRIVATE_SYSTEMS) out.push(r.path.replace(/:\w+/g, `leak-${s}`));
    return out;
  };

  it('nobody reads another system\'s records, by list or by id', async () => {
    const leaks: string[] = [];
    for (const { who, home } of WHO) {
      const foreign = PRIVATE_SYSTEMS.filter((s) => s !== home);
      for (const r of all.filter((x) => x.method === 'get')) {
        for (const u of urls(r)) {
          for (const q of ['', ...foreign.map((s) => `?systemId=${s}&unitId=ou-${s}&orgUnitId=ou-${s}&year=2026&month=2026-10`)]) {
            const res = await request(srv).get(u + q).set(bearer(who));
            const text = JSON.stringify(res.body ?? {});
            for (const s of foreign) if (text.includes(mark(s))) leaks.push(`${who} (${home}) GET ${u.replace(/leak-[a-z]+/,"ID")} shows ${s}`);
          }
        }
      }
    }
    expect([...new Set(leaks)].slice(0, 300)).toEqual([]);
  }, 600_000);

  it('nobody changes another system\'s records', async () => {
    const before = JSON.stringify(fake.__db);
    const changed: string[] = [];
    const body = { reason: 'x', note: 'x', status: 'APPROVED', amount: 1, title: 'x', name: 'x', body: 'x', systemId: 'sys-deacon', personId: 'p-member', ownerId: 'p-member', year: 2026, month: '2026-10' };
    for (const { who, home } of WHO) {
      for (const r of all.filter((x) => x.method !== 'get')) {
        for (const u of urls(r)) {
          const target = /leak-(sys-[a-z]+)/.exec(u)?.[0].slice(5);
          // Your own system's records may change; only a foreign record's id matters here. An Administrator may
          // restore a deleted item (recovery is theirs), nothing else.
          if (target === home || (who === 'p-admin' && /\/restore$/.test(u))) continue;
          const snap = JSON.stringify(fake.__db);
          const res = await request(srv)[r.method](u).set(bearer(who)).send({ ...body, systemId: PRIVATE_SYSTEMS.find((s) => s !== home) });
          if (JSON.stringify(fake.__db) !== snap) {
            // Only the person's own home system may change; anything else is a breach.
            const touched = PRIVATE_SYSTEMS.filter((s) => s !== home).some((s) => JSON.stringify(fake.__db).split(mark(s)).length !== snap.split(mark(s)).length);
            const rowsChanged = (JSON.parse(JSON.stringify(fake.__db)) as Record<string, any[]>);
            void rowsChanged;
            if (touched || res.status < 300) changed.push(`${who} (${home}) ${r.method.toUpperCase()} ${u} -> ${res.status}`);
          }
        }
      }
    }
    void before;
    expect([...new Set(changed)].slice(0, 300)).toEqual([]);
  }, 900_000);

  it('control: the Church Leader still reaches other systems', async () => {
    const seen = new Set<string>();
    for (const r of all.filter((x) => x.method === 'get' && !x.path.includes(':'))) {
      const res = await request(srv).get(`${r.path}?systemId=sys-deacon`).set(bearer('p-pastor'));
      if (JSON.stringify(res.body ?? {}).includes(mark('sys-deacon'))) seen.add(r.path);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});
