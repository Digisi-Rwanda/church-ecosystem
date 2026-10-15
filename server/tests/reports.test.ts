import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { buildSnapshot, inPeriod, periodOk, scheduleStatus, type Sources } from '../src/reports/builders';

const src = (o: Partial<Sources> = {}): Sources => ({
  unitId: 'u', systemId: 's', names: new Map([['a', 'Alice'], ['b', 'Bob']]), meetings: [], decisions: [], accounts: [], entries: [], budgetLines: [], counts: [], memberships: [], positions: [], plans: [], personRecords: [], programs: [],
  activePeople: new Set(['a', 'b']), ...o,
});
const val = (s: ReturnType<typeof buildSnapshot>, k: string) => s.summary.find((x) => x.key === k)?.value;

describe('report builders', () => {
  it('periods', () => {
    expect(periodOk('2026-10')).toBe(true);
    expect(periodOk('2026')).toBe(true);
    expect(periodOk('2026-13')).toBe(false);
    expect(inPeriod('2026-10-31T23:30:00Z', '2026-11')).toBe(true);
  });
  it('money: opening, income, approved spending, closing; pending apart; no offering counts anywhere', () => {
    const s = buildSnapshot('MONEY', '2026-10', 'Choir', src({
      accounts: [{ id: 'x', orgUnitId: 'u', name: 'Fund' }],
      entries: [
        { accountId: 'x', orgUnitId: 'u', kind: 'INCOME', amount: 1000, occurredOn: '2026-09-15T00:00:00Z', category: 'DONATION', status: 'RECORDED' },
        { accountId: 'x', orgUnitId: 'u', kind: 'INCOME', amount: 500, occurredOn: '2026-10-02T00:00:00Z', category: 'DONATION', status: 'RECORDED' },
        { accountId: 'x', orgUnitId: 'u', kind: 'SPENDING', amount: 200, occurredOn: '2026-10-03T00:00:00Z', category: 'SUPPLIES', status: 'APPROVED' },
        { accountId: 'x', orgUnitId: 'u', kind: 'SPENDING', amount: 300, occurredOn: '2026-10-04T00:00:00Z', category: 'AID', status: 'PENDING_APPROVAL' },
        { accountId: 'x', orgUnitId: 'u', kind: 'INCOME', amount: 99, occurredOn: '2026-10-05T00:00:00Z', category: 'OTHER', status: 'VOIDED' },
      ],
      counts: [{ orgUnitId: 'u', serviceOn: '2026-10-04T00:00:00Z', label: 'x', kind: 'OFFERING', amount: 85000, status: 'CONFIRMED' }],
    }));
    expect(s.tables[0].rows[0]).toEqual(['Fund', 1000, 500, 200, 1300, 300]);
    expect(val(s, 'closing')).toBe(1300);
    expect(JSON.stringify(s)).not.toContain('85000');
  });
  it('money: the budget table sets the year’s plan against this period and the year so far, only when a budget exists', () => {
    const entries = [
      { accountId: 'x', orgUnitId: 'u', systemId: 's', kind: 'SPENDING', amount: 200, occurredOn: '2026-10-03T00:00:00Z', category: 'SUPPLIES', status: 'APPROVED' },
      { accountId: 'x', orgUnitId: 'u', systemId: 's', kind: 'SPENDING', amount: 100, occurredOn: '2026-03-03T00:00:00Z', category: 'SUPPLIES', status: 'APPROVED' },
      { accountId: 'x', orgUnitId: 'u', systemId: 's', kind: 'SPENDING', amount: 50, occurredOn: '2026-11-03T00:00:00Z', category: 'SUPPLIES', status: 'APPROVED' },
      { accountId: 'x', orgUnitId: 'u', systemId: 'other', kind: 'SPENDING', amount: 999, occurredOn: '2026-10-03T00:00:00Z', category: 'SUPPLIES', status: 'APPROVED' },
    ];
    const none = buildSnapshot('MONEY', '2026-10', 'Choir', src({ accounts: [{ id: 'x', orgUnitId: 'u', name: 'Fund' }], entries }));
    expect(none.tables.map((x) => x.key)).toEqual(['accounts', 'entries']);
    const withBudget = buildSnapshot('MONEY', '2026-10', 'Choir', src({
      accounts: [{ id: 'x', orgUnitId: 'u', name: 'Fund' }], entries,
      budgetLines: [{ systemId: 's', year: 2026, kind: 'SPENDING', category: 'SUPPLIES', planned: 1000 }, { systemId: 's', year: 2025, kind: 'SPENDING', category: 'AID', planned: 5 }],
    }));
    const t = withBudget.tables.find((x) => x.key === 'budget')!;
    expect(t.rows).toEqual([['SPENDING', 'SUPPLIES', 200, 300, 1000, -700]]);
  });
  it('collections: only confirmed counts add up, voided ones vanish, money never appears', () => {
    const s = buildSnapshot('COLLECTIONS', '2026-10', 'Choir', src({
      counts: [
        { orgUnitId: 'u', serviceOn: '2026-10-04T00:00:00Z', label: 'A', kind: 'OFFERING', amount: 100, status: 'CONFIRMED', handedToId: 'a' },
        { orgUnitId: 'u', serviceOn: '2026-10-11T00:00:00Z', label: 'B', kind: 'OFFERING', amount: 50, status: 'RECORDED' },
        { orgUnitId: 'u', serviceOn: '2026-10-18T00:00:00Z', label: 'C', kind: 'OFFERING', amount: 70, status: 'VOIDED' },
      ],
      entries: [{ accountId: 'x', orgUnitId: 'u', kind: 'INCOME', amount: 7777, occurredOn: '2026-10-04T00:00:00Z', category: 'OFFERING', status: 'RECORDED' }],
    }));
    expect(val(s, 'confirmed')).toBe(100);
    expect(val(s, 'unconfirmed')).toBe(1);
    expect(JSON.stringify(s)).not.toContain('7777');
  });
  it('attendance: rate per person over held meetings', () => {
    const s = buildSnapshot('ATTENDANCE', '2026-10', 'Choir', src({
      meetings: [
        { orgUnitId: 'u', title: 'M1', scheduledAt: '2026-10-02T10:00:00Z', status: 'HELD', attendeesJson: '["a","b"]' },
        { orgUnitId: 'u', title: 'M2', scheduledAt: '2026-10-09T10:00:00Z', status: 'HELD', attendeesJson: '["a"]' },
        { orgUnitId: 'u', title: 'M3', scheduledAt: '2026-10-16T10:00:00Z', status: 'PLANNED', attendeesJson: '[]' },
      ],
    }));
    expect(val(s, 'held')).toBe(2);
    expect(s.tables[1].rows).toEqual([['Alice', 2, 100], ['Bob', 1, 50]]);
  });
  it('people list: active members only, with their roles', () => {
    const s = buildSnapshot('PEOPLE_LIST', '2026-10', 'Choir', src({
      memberships: [
        { personId: 'a', orgUnitId: 'u', type: 'CHOIR_MEMBER', status: 'ACTIVE', startDate: '2020-01-01T00:00:00Z' },
        { personId: 'b', orgUnitId: 'u', type: 'CHOIR_MEMBER', status: 'ENDED', startDate: '2020-01-01T00:00:00Z' },
        { personId: 'z', orgUnitId: 'u', type: 'CHOIR_MEMBER', status: 'ACTIVE', startDate: '2020-01-01T00:00:00Z' },
      ],
      positions: [{ personId: 'a', orgUnitId: 'u', title: 'Treasurer', status: 'ACTIVE' }],
    }));
    expect(s.tables[0].rows).toEqual([['Alice', 'Treasurer', '2020-01-01']]);
  });
  it('baptisms and marriages: by the date on the record, with cohort and spouse', () => {
    const rec = (personId: string, section: string, d: object, programId?: string) => ({ personId, section, dataJson: JSON.stringify(d), status: 'CURRENT', programId });
    const base = {
      programs: [{ id: 'pg', name: 'Class 2026' }],
      personRecords: [
        rec('a', 'BAPTISM', { date: '2026-10-04', place: 'Kacyiru' }, 'pg'),
        rec('b', 'BAPTISM', { date: '2026-09-27' }),
        rec('a', 'MARRIAGE', { date: '2026-10-10', spousePersonId: 'b', place: 'Church' }),
        { ...rec('b', 'BAPTISM', { date: '2026-10-05' }), status: 'VOIDED' },
      ],
    };
    const b = buildSnapshot('BAPTISMS', '2026-10', 'Church', src(base));
    expect(val(b, 'baptised')).toBe(1);
    expect(b.tables[0].rows[0]).toEqual(['Alice', '2026-10-04', 'Kacyiru', '', 'Class 2026']);
    const m = buildSnapshot('MARRIAGES', '2026-10', 'Church', src(base));
    expect(m.tables[0].rows[0]).toEqual(['Alice', 'Bob', '2026-10-10', 'Church', '']);
    expect(val(buildSnapshot('BAPTISMS', '2026', 'Church', src(base)), 'baptised')).toBe(2);
  });
  it('schedule: last month is due on the day of this month', () => {
    expect(scheduleStatus(10, false, new Date('2026-10-05T10:00:00Z'))).toEqual({ periodKey: '2026-09', dueOn: '2026-10-10', state: 'DUE' });
    expect(scheduleStatus(10, false, new Date('2026-10-11T10:00:00Z')).state).toBe('LATE');
    expect(scheduleStatus(10, true, new Date('2026-10-11T10:00:00Z')).state).toBe('RECEIVED');
    expect(scheduleStatus(5, false, new Date('2027-01-06T10:00:00Z')).periodKey).toBe('2026-12');
  });
});

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));
let app: import('express').Express;
const get = (as: string, path: string) => request(app).get(path).set(bearer(as));
const post = (as: string, path: string, body: object = {}) => request(app).post(path).set(bearer(as)).send(body);
const del = (as: string, path: string) => request(app).delete(path).set(bearer(as));

beforeEach(async () => {
  fake.__reset();
  const db = fake.__db;
  seedWorld(db);
  for (const k of ['orgUnit', 'delegation', 'auditEvent', 'setting', 'notification', 'notificationRead', 'preference', 'meeting', 'decision', 'moneyAccount', 'moneyEntry', 'offeringCount', 'workPlan', 'report', 'reportSchedule', 'personRecord', 'program']) db[k] ??= [];
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
  db.membership.find((m: any) => m.id === 'mem-cm').orgUnitId = 'ou-choir';
  db.person.push({ id: 'p-vp', fullName: 'Choir VP', status: 'ACTIVE' });
  db.position.push({ id: 'pos-vp', personId: 'p-vp', systemId: 'sys-choir', orgUnitId: 'ou-choir', title: 'Vice President', office: 'VICE_PRESIDENT', status: 'ACTIVE', startDate: new Date('2022-01-01') });
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

const compose = (as = 'p-vp', o: object = {}) => post(as, '/api/reports', { unitId: 'ou-choir', kind: 'MEETINGS', periodKey: '2026-10', ...o });

describe('person 360 reports', () => {
  it('only the church system, and marriage only for the church leader', async () => {
    fake.__db.position.push({ id: 'pos-sec', personId: 'p-sec', systemId: 'sys-main', orgUnitId: 'ou-church', title: 'Church Secretary', office: 'CHURCH_SECRETARY', status: 'ACTIVE', startDate: new Date('2022-01-01') });
    fake.__db.person.push({ id: 'p-sec', fullName: 'Secretary', status: 'ACTIVE' });
    expect((await compose('p-pastor', { unitId: 'ou-church', kind: 'MARRIAGES' })).status).toBe(201);
    expect((await compose('p-sec', { unitId: 'ou-church', kind: 'MARRIAGES' })).status).toBe(403);
    expect((await compose('p-sec', { unitId: 'ou-church', kind: 'BAPTISMS' })).status).toBe(201);
    expect((await compose('p-vp', { kind: 'BAPTISMS' })).status).toBe(403);
  });
});

describe('reports routes', () => {
  it('a vice president composes a draft; only the president publishes; then it is frozen', async () => {
    const r = await compose();
    expect(r.status).toBe(201);
    expect((await post('p-vp', `/api/reports/${r.body.id}/publish`)).status).toBe(403);
    expect((await post('p-choir-leader', `/api/reports/${r.body.id}/publish`)).status).toBe(200);
    expect((await post('p-vp', `/api/reports/${r.body.id}/refresh`)).status).toBe(409);
    expect((await del('p-vp', `/api/reports/${r.body.id}`)).status).toBe(409);
    expect(fake.__db.notification.some((n: any) => n.toPersonId === 'p-vp')).toBe(true);
    expect((await get('p-vp', `/api/reports/${r.body.id}`)).body.report.status).toBe('PUBLISHED');
  });
  it('one report per unit, kind and period; bad periods are refused', async () => {
    expect((await compose()).status).toBe(201);
    expect((await compose()).body.code).toBe('ALREADY_EXISTS');
    expect((await compose('p-vp', { periodKey: '2026-13' })).status).toBe(400);
  });
  it('members cannot compose or read; drafts are hidden from readers who cannot write', async () => {
    expect((await compose('p-choir-member')).status).toBe(403);
    expect((await get('p-choir-member', '/api/reports?systemId=sys-choir')).status).toBe(404);
    const r = await compose();
    const list = await get('p-vp', '/api/reports?systemId=sys-choir');
    expect(list.body.reports.length).toBe(1);
    expect((await get('p-choir-member', `/api/reports/${r.body.id}`)).status).toBe(404);
  });
  it('a money report needs the money letter on the composer', async () => {
    expect((await compose('p-vp', { kind: 'MONEY' })).status).toBe(201);
    const opts = await get('p-vp', '/api/reports/options');
    expect(opts.body.units[0].kinds).toContain('MONEY');
  });
  it('yearly budget and action plan compose from the live plans, and cannot be put on the monthly schedule', async () => {
    const y = await compose('p-vp', { kind: 'YEARLY_BUDGET', periodKey: '2026' });
    expect(y.status).toBe(201);
    const snap = (await get('p-vp', `/api/reports/${y.body.id}`)).body.report?.snapshot ?? (await get('p-vp', `/api/reports/${y.body.id}`)).body.snapshot;
    expect(snap?.kind ?? 'YEARLY_BUDGET').toBe('YEARLY_BUDGET');
    expect((await compose('p-vp', { kind: 'ACTION_PLAN', periodKey: '2026' })).status).toBe(201);
    expect((await post('p-choir-leader', '/api/reports/schedules', { unitId: 'ou-choir', kind: 'YEARLY_BUDGET', dueDay: 5 })).status).toBe(400);
  });

  it('a draft can be discarded and then composed again', async () => {
    const r = await compose();
    expect((await del('p-vp', `/api/reports/${r.body.id}`)).status).toBe(200);
    expect((await compose()).status).toBe(201);
  });
  it('schedules: the president sets them, a missing report turns late and reminds once; publishing marks it received', async () => {
    const s = await post('p-choir-leader', '/api/reports/schedules', { unitId: 'ou-choir', kind: 'MEETINGS', dueDay: 1 });
    expect(s.status).toBe(201);
    expect((await post('p-vp', '/api/reports/schedules', { unitId: 'ou-choir', kind: 'MONEY', dueDay: 5 })).status).toBe(403);
    expect((await post('p-choir-leader', '/api/reports/schedules', { unitId: 'ou-choir', kind: 'MEETINGS', dueDay: 3 })).body.code).toBe('ALREADY_EXISTS');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    try {
      const a = await get('p-vp', '/api/reports/schedules?systemId=sys-choir');
      expect(a.body.schedules[0].state).toBe('LATE');
      expect(a.body.schedules[0].periodKey).toBe('2026-09');
      await get('p-vp', '/api/reports/schedules?systemId=sys-choir');
      expect(fake.__db.notification.filter((n: any) => n.toPersonId === 'p-vp' && String(n.title).startsWith('Report late')).length).toBe(1);
      const r = await compose('p-vp', { periodKey: '2026-09' });
      await post('p-choir-leader', `/api/reports/${r.body.id}/publish`);
      expect((await get('p-vp', '/api/reports/schedules?systemId=sys-choir')).body.schedules[0].state).toBe('RECEIVED');
    } finally {
      vi.useRealTimers();
    }
    expect((await del('p-choir-leader', `/api/reports/schedules/${s.body.id}`)).status).toBe(200);
    expect((await get('p-vp', '/api/reports/schedules?systemId=sys-choir')).body.schedules.length).toBe(0);
  });
});

describe('choosing the parts of a report', () => {
  it('keeps only the chosen parts and remembers the choice', async () => {
    const { buildSnapshot, SECTIONS } = await import('../src/reports/builders');
    const empty = { ...src({}) };
    const all = buildSnapshot('MEETINGS', '2026-10', 'Choir', empty);
    expect(all.tables.map((t) => t.key)).toEqual(['meetings', 'decisions']);
    const some = buildSnapshot('MEETINGS', '2026-10', 'Choir', empty, ['decisions']);
    expect(some.tables.map((t) => t.key)).toEqual(['decisions']);
    expect(some.summary).toEqual([]);
    expect(some.sections).toEqual(['decisions']);
    const figures = buildSnapshot('MEETINGS', '2026-10', 'Choir', empty, ['summary']);
    expect(figures.tables).toEqual([]);
    expect(figures.summary.length).toBeGreaterThan(0);
    expect(buildSnapshot('MEETINGS', '2026-10', 'Choir', empty, ['nonsense']).tables.length).toBe(2);
    expect(SECTIONS.MONEY).toContain('entries');
  });
});

describe('amendments in the money report', () => {
  it('lists the approved amendments of the period, monthly and yearly', async () => {
    const { buildSnapshot } = await import('../src/reports/builders');
    const base = src({});
    const s = {
      ...base,
      unitId: 'u1', systemId: 'sys-x', names: new Map([['p1', 'Vice President']]),
      plans: [{ id: 'pl1', orgUnitId: 'u1', title: 'Harvest', status: 'RUNNING', leaderPersonId: 'p1' }],
      amendments: [
        { planId: 'pl1', systemId: 'sys-x', kind: 'INCREASE', scope: 'MONEY', status: 'APPROVED', oldTotal: 100, newTotal: 150, justification: 'Bigger hall', requestedById: 'p1', decidedAt: '2026-10-05T10:00:00Z' },
        { planId: 'pl1', systemId: 'sys-x', kind: 'CHANGE', scope: 'GENERAL', status: 'REJECTED', oldTotal: 100, newTotal: 100, justification: 'No', requestedById: 'p1', decidedAt: '2026-10-06T10:00:00Z' },
        { planId: 'pl1', systemId: 'sys-x', kind: 'TRANSFER', scope: 'MONEY', status: 'APPROVED', oldTotal: 150, newTotal: 150, justification: 'Later', requestedById: 'p1', decidedAt: '2026-11-02T10:00:00Z' },
      ],
    } as never;
    const month = buildSnapshot('MONEY', '2026-10', 'Choir', s).tables.find((t) => t.key === 'amendments')!;
    expect(month.rows).toHaveLength(1);
    expect(month.rows[0]).toEqual(['2026-10-05', 'Harvest', 'MONEY', 'INCREASE', 100, 150, 'Vice President', 'Bigger hall']);
    expect(buildSnapshot('MONEY', '2026', 'Choir', s).tables.find((t) => t.key === 'amendments')!.rows).toHaveLength(2);
  });
});

describe('yearly budget and action plan', () => {
  const acts = [
    { id: 'a1', orgUnitId: 'u', title: 'Harvest concert', planType: 'EVENT', status: 'ENDED', startsOn: '2026-03-08T07:00:00Z', leaderPersonId: 'a', planned: 100000, spent: 80000 },
    { id: 'a2', orgUnitId: 'u', title: 'Discipleship', planType: 'PROGRAM', status: 'RUNNING', startsOn: '2026-01-10T07:00:00Z', leaderPersonId: 'b', planned: 600000, spent: 150000 },
    { id: 'a3', orgUnitId: 'u', title: 'Old', planType: 'EVENT', status: 'CANCELLED', startsOn: '2026-04-01T07:00:00Z', leaderPersonId: 'a', planned: 5, spent: 0 },
    { id: 'a4', orgUnitId: 'other', title: 'Not mine', planType: 'EVENT', status: 'RUNNING', startsOn: '2026-05-01T07:00:00Z', leaderPersonId: 'a', planned: 9, spent: 0 },
  ];
  const s = src({
    activities: acts, funds: { secured: 900000, spent: 230000, reserved: 400000, available: 270000 },
    budgetLines: [{ systemId: 's', year: 2026, kind: 'INCOME', category: 'DONATION', planned: 1000000 }, { systemId: 's', year: 2026, kind: 'SPENDING', category: 'EVENT', planned: 5 }],
    entries: [{ accountId: 'x', orgUnitId: 'u', kind: 'SPENDING', amount: 80000, occurredOn: '2026-03-09T10:00:00Z', category: 'EVENT', status: 'APPROVED', planId: 'a1' } as never],
  });
  it('yearly budget: forecast is the only typed figure; the rest comes from the plans and the money now', () => {
    const b = buildSnapshot('YEARLY_BUDGET', '2026', 'Choir', s);
    expect(b.summary.map((x) => [x.key, x.value])).toEqual([['forecast', 1000000], ['planned', 700000], ['spent', 230000], ['availableNow', 270000], ['unreservedForecast', 300000], ['amended', 0]]);
    expect(b.tables.find((t) => t.key === 'activities')!.rows.map((r) => r[0])).toEqual(['Discipleship', 'Harvest concert']);
    expect(b.tables.find((t) => t.key === 'byType')!.rows).toEqual([['PROGRAM', 1, 600000, 150000], ['EVENT', 1, 100000, 80000]]);
    const months = b.tables.find((t) => t.key === 'months')!.rows;
    expect(months[2]).toEqual(['2026-03', 100000, 80000]);
    expect(buildSnapshot('YEARLY_BUDGET', '2026-03', 'Choir', s).tables.some((t) => t.key === 'months')).toBe(false);
  });
  it('action plan: the unit’s activities for the year, by month', () => {
    const a = buildSnapshot('ACTION_PLAN', '2026', 'Choir', s);
    expect(a.summary.map((x) => [x.key, x.value])).toEqual([['activities', 2], ['running', 1], ['ended', 1], ['planned', 700000]]);
    expect(a.tables.find((t) => t.key === 'activities')!.rows[0]).toEqual(['Discipleship', 'PROGRAM', '2026-01-10', 'Bob', 'RUNNING', 600000]);
    expect(a.tables.find((t) => t.key === 'byMonth')!.rows.filter((r) => r[1] === 1).map((r) => r[0])).toEqual(['2026-01', '2026-03']);
  });
});
