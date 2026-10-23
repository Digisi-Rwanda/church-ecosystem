/**
 * Benchmark of the People search: 5,000 people and 12,000 current records, five-condition and seven-condition searches.
 * Skipped unless BENCH=1:   BENCH=1 npx vitest run tests/peopleSearch.bench.test.ts
 *
 * What it measures: the whole route (HTTP in process, access checks, loading, filtering, paging, JSON) against the
 * in-memory stand-in for Prisma, and the filter engine alone. It does NOT measure PostgreSQL: the stand-in has no
 * network and no disk, so database time is not in these numbers (see the report for what that adds).
 */
import os from 'node:os';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { bearer, seedWorld } from './world';
import { runSearch, kigaliDay } from '../src/filters/index';
import { PEOPLE_FIELDS, rowFromData, type PersonRow } from '../src/people/fields';

const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js', () => ({ prisma: fake }));

const N = 5000, RECORDS = 12000;
let seed = 20261020;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const unitRows = [{ id: 'ou-church', name: 'Church', parentId: null, systemId: 'sys-main' }];
for (let m = 1; m <= 4; m++) {
  unitRows.push({ id: `ou-m${m}`, name: `Ministry ${m}`, parentId: 'ou-church', systemId: 'sys-main' });
  for (let s = 1; s <= 4; s++) unitRows.push({ id: `ou-m${m}s${s}`, name: `Ministry ${m} team ${s}`, parentId: `ou-m${m}`, systemId: 'sys-main' });
}
const leafUnits = unitRows.filter((u) => u.id.includes('s')).map((u) => u.id);
const SECTORS = ['FINANCE', 'EDUCATION', 'HEALTH', 'AGRICULTURE', 'TECHNOLOGY', 'BUSINESS'] as const;
const LEVELS = ['PRIMARY', 'SECONDARY_A', 'ASSOCIATE', 'BACHELOR', 'MASTER'] as const;

interface Rec { personId: string; section: string; data: Record<string, unknown> }
const people: Array<{ id: string; fullName: string; gender: string; dateOfBirth: string; status: string; memberCode: string }> = [];
const records: Rec[] = [];
const memberships: Array<{ personId: string; orgUnitId: string }> = [];
const idOf = (i: number) => `b-${String(i).padStart(5, '0')}`;

function build() {
  for (let i = 0; i < N; i++) {
    people.push({ id: idOf(i), fullName: `Person ${i} ${pick(['Uwase', 'Habimana', 'Mukamana', 'Niyonzima', 'Ishimwe'])}`, gender: rnd() < 0.5 ? 'MALE' : 'FEMALE', dateOfBirth: day(1950 + Math.floor(rnd() * 58), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)), status: rnd() < 0.9 ? 'ACTIVE' : 'INACTIVE', memberCode: `K-${i}` });
    memberships.push({ personId: idOf(i), orgUnitId: pick(leafUnits) });
    if (rnd() < 0.2) memberships.push({ personId: idOf(i), orgUnitId: pick(leafUnits) });
  }
  const add = (i: number, section: string, data: Record<string, unknown>) => records.push({ personId: idOf(i), section, data });
  for (let i = 0; i < 3000; i++) add(i, 'BAPTISM', { date: day(1995 + Math.floor(rnd() * 31), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)) });
  for (let i = 0; i < 2500; i++) { const status = pick(['EMPLOYED', 'EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED']); add(i * 2 % N, 'EMPLOYMENT', { status, sector: pick(SECTORS), since: day(2000 + Math.floor(rnd() * 26), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)) }); }
  for (let i = 0; i < 2500; i++) add((i * 3) % N, 'EDUCATION', { level: pick(LEVELS), field: pick(['Law', 'Finance', 'Education', 'Medicine']) });
  for (let i = 0; i < 3500; i++) add(Math.floor(rnd() * 1500), 'FAMILY', { relation: 'CHILD', name: `Child ${i}` });
  for (let i = 0; i < 500; i++) add(Math.floor(rnd() * N), 'CALLING', { name: pick(['Singer', 'Usher', 'Treasurer']), orgUnitId: pick(leafUnits) });
}
build();

const c = (field: string, op: string, value?: unknown) => ({ field, op, ...(value === undefined ? {} : { value }) });
const FIVE = { match: { all: [c('gender', 'is', 'MALE'), c('unit', 'includesAny', ['ou-m1']), c('baptismYears', 'atLeast', 10), c('education', 'anyMatch', { levelAtLeast: 'BACHELOR' }), c('childCount', 'atLeast', 2)] } };
const SEVEN = { match: {
  all: [c('gender', 'is', 'MALE'), c('baptismYears', 'atLeast', 5), c('education', 'anyMatch', { levelAtLeast: 'ASSOCIATE' }), c('employment', 'anyMatch', { yearsAtLeast: 3 })],
  anyGroups: [{ any: [c('unit', 'includesAny', ['ou-m1']), c('unit', 'includesAny', ['ou-m2'])] }, { any: [c('employment', 'anyMatch', { sector: ['FINANCE'] }), c('employment', 'anyMatch', { sector: ['HEALTH'] })] }],
}, sort: { field: 'age', dir: 'asc' }, page: { limit: 100 } };
const WIDE = { match: { all: [c('name', 'contains', 'Person 1')] }, sort: { field: 'age', dir: 'desc' } };
const NONE = {};

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { min: s[0]!, median: s[Math.floor(s.length / 2)]!, p95: s[Math.ceil(s.length * 0.95) - 1]!, max: s[s.length - 1]! };
};
const ms = (n: number) => `${n.toFixed(1)} ms`;

describe.skipIf(!process.env.BENCH)('People search benchmark (5,000 people, 12,000 records)', () => {
  let app: import('express').Express;
  beforeAll(async () => {
    seedWorld(fake.__db);
    const db = fake.__db;
    for (const k of ['orgUnit', 'delegation', 'setting', 'notification', 'notificationRead', 'preference', 'auditEvent', 'personRecord']) db[k] ??= [];
    for (const s of db.churchSystem) { s.code = s.id; s.name = s.id; s.shortName = s.id; s.kind = s.id === 'sys-main' ? 'MAIN' : 'MINISTRY'; s.basePath = `/${s.id}`; }
    db.orgUnit.push(...unitRows.map((u) => ({ ...u, code: u.id, kind: 'MINISTRY', type: 'MINISTRY' })));
    db.person.push(...people.map((p) => ({ ...p, archivedAt: null })));
    db.membership.push(...memberships.map((m, i) => ({ id: `bm-${i}`, ...m, systemId: 'sys-main', type: 'MINISTRY_MEMBER', status: 'ACTIVE', startDate: new Date('2020-01-01') })));
    db.personRecord.push(...records.map((r, i) => ({ id: `br-${i}`, personId: r.personId, section: r.section, dataJson: JSON.stringify(r.data), status: 'CURRENT', recordedById: 'p-pastor', recordedAt: new Date() })));
    const { createApp } = await import('../src/app.js');
    app = createApp();
  }, 120_000);

  it('fixture has the advertised size', () => {
    expect(fake.__db.person.length).toBeGreaterThanOrEqual(N);
    expect(fake.__db.personRecord.length).toBe(RECORDS);
  });

  /**
   * Every timed run goes through the whole route (HTTP, access checks, the person and record reads, filtering, the
   * page read, JSON). The database calls are counted per run, so a run that skipped the reads would fail here
   * instead of looking fast. `sections` are the record sections the search must read for every person.
   */
  const runs = async (name: string, body: object, expectTotal?: (total: number) => void, sections: string[] = []) => {
    const personRead = vi.spyOn(fake.person, 'findMany');
    const recordRead = vi.spyOn(fake.personRecord, 'findMany');
    const send = () => request(app).post('/api/people/search').set(bearer('p-pastor')).send(body);
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200); // warm-up
    const wanted = records.filter((r) => sections.includes(r.section)).length;
    const times: number[] = [];
    let last: any;
    let first: number | undefined;
    for (let i = 0; i < 20; i++) {
      personRead.mockClear(); recordRead.mockClear();
      const t = performance.now();
      last = await send();
      times.push(performance.now() - t);
      expect(last.status).toBe(200);
      first ??= last.body.total;
      expect(last.body.total).toBe(first); // every run answers the same
      const scan = (await personRead.mock.results[0]!.value as unknown[]).length; // the scan of everyone in scope
      expect(scan).toBeGreaterThanOrEqual(N);
      expect(personRead).toHaveBeenCalledTimes(last.body.people.length ? 2 : 1); // the scan, then only the page read in full
      if (last.body.people.length) expect((await personRead.mock.results[1]!.value as unknown[]).length).toBe(last.body.people.length);
      if (sections.length) expect((await recordRead.mock.results[0]!.value as unknown[]).length).toBe(wanted); // the record read for the filter
      else expect(recordRead.mock.calls.every((c) => (c[0] as any).where.personId)).toBe(true); // no filter on records: only the page's own
    }
    personRead.mockRestore(); recordRead.mockRestore();
    expectTotal?.(last.body.total);
    const s = stats(times);
    console.log(`BENCH[stand-in] route  | ${name.padEnd(34)} | total ${String(last.body.total).padStart(4)} | person rows ${N}+ and ${wanted} records read per run | min ${ms(s.min)} | median ${ms(s.median)} | p95 ${ms(s.p95)} | max ${ms(s.max)}`);
    return s;
  };

  it('five-condition search, end to end', async () => {
    // Independent count, computed straight from the fixture without the registry.
    const today = kigaliDay(new Date());
    const yrs = (d: string) => { let y = Number(today.slice(0, 4)) - Number(d.slice(0, 4)); if (today.slice(5) < d.slice(5)) y--; return y; };
    const inM1 = (u: string) => u.startsWith('ou-m1');
    const rank = (l: string) => ({ PRIMARY: 1, SECONDARY_A: 3, ASSOCIATE: 4, BACHELOR: 5, MASTER: 6 } as Record<string, number>)[l]!;
    const expected = people.filter((p) => {
      if (p.gender !== 'MALE') return false;
      if (!memberships.some((m) => m.personId === p.id && inM1(m.orgUnitId))) return false;
      const bap = records.find((r) => r.personId === p.id && r.section === 'BAPTISM');
      if (!bap || yrs(bap.data.date as string) < 10) return false;
      const edu = records.filter((r) => r.personId === p.id && r.section === 'EDUCATION').map((r) => rank(r.data.level as string));
      if (!edu.length || Math.max(...edu) < 5) return false;
      return records.filter((r) => r.personId === p.id && r.section === 'FAMILY').length >= 2;
    }).length;
    const s = await runs('5 conditions (AND)', FIVE, (t) => expect(t).toBe(expected), ['BAPTISM', 'EDUCATION', 'FAMILY']);
    expect(expected).toBeGreaterThan(0);
    expect(s.median).toBeGreaterThan(0);
  });
  it('seven conditions with two OR groups, sorted', async () => {
    const today = kigaliDay(new Date());
    const yrs = (d: string) => { let y = Number(today.slice(0, 4)) - Number(d.slice(0, 4)); if (today.slice(5) < d.slice(5)) y--; return y; };
    const rank = (l: string) => ({ PRIMARY: 1, SECONDARY_A: 3, ASSOCIATE: 4, BACHELOR: 5, MASTER: 6 } as Record<string, number>)[l]!;
    const expected = people.filter((p) => {
      if (p.gender !== 'MALE') return false;
      const mine = (s: string) => records.filter((r) => r.personId === p.id && r.section === s).map((r) => r.data);
      const bap = mine('BAPTISM')[0];
      if (!bap || yrs(bap.date as string) < 5) return false;
      const edu = mine('EDUCATION').map((d) => rank(d.level as string));
      if (!edu.length || Math.max(...edu) < 4) return false;
      const work = mine('EMPLOYMENT').filter((d) => d.status === 'EMPLOYED' || d.status === 'SELF_EMPLOYED').map((d) => yrs(d.since as string));
      if (!work.length || Math.max(...work) < 3) return false;
      if (!memberships.some((m) => m.personId === p.id && (m.orgUnitId.startsWith('ou-m1') || m.orgUnitId.startsWith('ou-m2')))) return false;
      return mine('EMPLOYMENT').some((d) => d.sector === 'FINANCE' || d.sector === 'HEALTH');
    }).length;
    await runs('7 conditions + 2 OR groups + sort', SEVEN, (t) => expect(t).toBe(expected), ['BAPTISM', 'EDUCATION', 'EMPLOYMENT']);
    expect(expected).toBeGreaterThan(0);
  });
  it('wide text search with sort', async () => { await runs('name contains + sort by age', WIDE); });
  it('no filter at all (page of 50)', async () => { await runs('no conditions', NONE, (t) => expect(t).toBeGreaterThanOrEqual(N)); });

  it('filter engine alone, on rows already in memory', async () => {
    const { unitTree } = await import('../src/people/search.js');
    const t0 = performance.now();
    const byPerson = new Map<string, Rec[]>();
    for (const r of records) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
    const unitsBy = new Map<string, string[]>();
    for (const m of memberships) unitsBy.set(m.personId, [...(unitsBy.get(m.personId) ?? []), m.orgUnitId]);
    const full: PersonRow[] = people.map((p) => rowFromData({ ...p, unitIds: unitsBy.get(p.id) ?? [] }, (byPerson.get(p.id) ?? []).map((r) => ({ section: r.section as never, data: r.data }))));
    const build = performance.now() - t0;
    const below = unitTree(unitRows);
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t = performance.now();
      runSearch({ registry: PEOPLE_FIELDS, viewer: { identity: true, read: ['EMPLOYMENT', 'EDUCATION', 'CALLING', 'FAMILY', 'BAPTISM', 'MARRIAGE'] }, ctx: { today: kigaliDay(new Date()), below, person: () => undefined }, rows: full, unitScope: null, match: FIVE.match, page: { limit: 50, offset: 0 } });
      times.push(performance.now() - t);
    }
    const s = stats(times);
    console.log(`BENCH[stand-in] engine | 5 conditions over ${full.length} rows       | median ${ms(s.median)} | p95 ${ms(s.p95)} | max ${ms(s.max)} (row objects built in ${ms(build)})`);
    expect(s.median).toBeLessThan(5000);
  });

  it('data volume the route reads from the database for the five-condition search', () => {
    const sections = new Set(['BAPTISM', 'EDUCATION', 'FAMILY']);
    const slim = JSON.stringify(people.map((p) => ({ id: p.id, fullName: p.fullName, memberCode: p.memberCode, status: p.status, gender: p.gender, dateOfBirth: p.dateOfBirth })));
    const recs = JSON.stringify(records.filter((r) => sections.has(r.section)).map((r) => ({ personId: r.personId, section: r.section, dataJson: JSON.stringify(r.data) })));
    console.log(`BENCH[stand-in] data   | person rows ${(slim.length / 1024).toFixed(0)} KiB + record rows ${(recs.length / 1024).toFixed(0)} KiB (${records.filter((r) => sections.has(r.section)).length} records) per search`);
  });

  it('environment', () => {
    console.log('BENCH NOTE | STAND-IN RESULTS: in-memory database, no PostgreSQL, no network. NOT production latency; the 800 ms target is not demonstrated by this run (see docs/people-filtering.md for the staging procedure).');
    console.log(`BENCH env    | node ${process.version} | ${os.cpus()[0]?.model} x${os.cpus().length} | ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM | ${os.platform()} ${os.release()}`);
  });
});
