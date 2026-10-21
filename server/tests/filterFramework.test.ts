import { describe, expect, it } from 'vitest';
import { FilterError, MatchSchema, PageSchema, SortSchema, kigaliDay, shiftDay, yearsBetween, isDay, schemaFor } from '../src/filters/index';
import { PEOPLE_FIELDS, childCount } from '../src/people/fields';
import { runSearch, type Registry } from '../src/filters/index';
import { EVERYTHING, NOW, all, ctxFor, ids, row, search } from './peopleHarness';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { if (e instanceof FilterError) return `${e.status} ${e.code}`; throw e; } return 'ok'; };
const R = (extra: Parameters<typeof row>[0]) => row(extra);

describe('request shape and limits', () => {
  const c = { field: 'name', op: 'contains', value: 'a' };
  const parse = (m: unknown) => MatchSchema.safeParse(m).success;
  it('accepts all + groups, and refuses nesting, extra keys and excess size', () => {
    expect(parse({})).toBe(true);
    expect(parse({ all: [c], anyGroups: [{ any: [c, c] }] })).toBe(true);
    expect(parse({ all: Array(12).fill(c) })).toBe(true);
    expect(parse({ all: Array(13).fill(c) })).toBe(false);
    expect(parse({ all: Array(6).fill(c), anyGroups: [{ any: Array(7).fill(c) }] })).toBe(false); // 13 in total
    expect(parse({ anyGroups: Array(4).fill({ any: [c] }) })).toBe(true);
    expect(parse({ anyGroups: Array(5).fill({ any: [c] }) })).toBe(false);
    expect(parse({ anyGroups: [{ any: [] }] })).toBe(false);
    expect(parse({ anyGroups: [{ any: [{ any: [c] }] }] })).toBe(false); // no nesting
    expect(parse({ anyGroups: [{ any: [c], anyGroups: [] }] })).toBe(false);
    expect(parse({ all: [{ ...c, extra: 1 }] })).toBe(false);
    expect(parse({ all: [{ ...c, value: 'x'.repeat(81) }] })).toBe(false);
    expect(parse({ all: [{ ...c, value: Array(21).fill('a') }] })).toBe(false);
    expect(parse({ all: [{ ...c, value: Array(20).fill('a') }] })).toBe(true);
    expect(parse({ all: [{ ...c, field: 'f'.repeat(41) }] })).toBe(false);
    expect(parse({ all: [{ ...c, value: { a: 1, b: 2, c: 3, d: 4, e: 5 } }] })).toBe(false);
    expect(parse({ all: [{ ...c, value: [[1]] }] })).toBe(false);
    expect(parse({ all: [{ ...c, value: null }] })).toBe(false);
    expect(parse({ all: 'x' })).toBe(false);
    expect(parse({ anyGroups: { any: [c] } })).toBe(false);
  });
  it('page: default 50, at most 100, offsets from 0', () => {
    expect(PageSchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(PageSchema.safeParse({ limit: 100 }).success).toBe(true);
    for (const bad of [{ limit: 101 }, { limit: 0 }, { limit: 1.5 }, { offset: -1 }, { offset: 100_001 }, { limit: '5' }, { size: 5 }]) expect(PageSchema.safeParse(bad).success).toBe(false);
  });
  it('sort: a direction and a field name only', () => {
    expect(SortSchema.safeParse({ field: 'age', dir: 'desc' }).success).toBe(true);
    for (const bad of [{ field: 'age', dir: 'up' }, { field: 'age' }, { dir: 'asc' }, { field: 'age', dir: 'asc', x: 1 }]) expect(SortSchema.safeParse(bad).success).toBe(false);
  });
});

describe('condition validation against the registry', () => {
  const rows = [R({ id: 'a' })];
  const run = (c: { field: string; op: string; value?: unknown }, o = {}) => code(() => search(rows, all(c), o));
  it('unknown fields, operators and values are refused as 400, naming nothing', () => {
    for (const field of ['secret', 'fullName', 'id', '__proto__', 'constructor', 'name; DROP TABLE Person', 'person.email', 'archivedAt', 'password']) {
      expect(run({ field, op: 'contains', value: 'a' })).toBe('400 BAD_INPUT');
    }
    expect(run({ field: 'name', op: 'regex', value: 'a' })).toBe('400 BAD_INPUT');
    expect(run({ field: 'name', op: 'atLeast', value: 3 })).toBe('400 BAD_INPUT'); // not an operator of a text field
    expect(run({ field: 'name', op: 'contains', value: 3 })).toBe('400 BAD_INPUT');
    expect(run({ field: 'name', op: 'contains', value: '' })).toBe('400 BAD_INPUT');
    expect(run({ field: 'name', op: 'contains' })).toBe('400 BAD_INPUT');
    expect(run({ field: 'status', op: 'is', value: 'DELETED' })).toBe('400 BAD_INPUT');
    expect(run({ field: 'status', op: 'isAny', value: [] })).toBe('400 BAD_INPUT');
    expect(run({ field: 'status', op: 'isAny', value: 'ACTIVE' })).toBe('400 BAD_INPUT');
    expect(run({ field: 'childCount', op: 'atLeast', value: -1 })).toBe('400 BAD_INPUT');
    expect(run({ field: 'childCount', op: 'atLeast', value: 1.5 })).toBe('400 BAD_INPUT');
    expect(run({ field: 'childCount', op: 'atLeast', value: 31 })).toBe('400 BAD_INPUT');
    expect(run({ field: 'childCount', op: 'between', value: [3, 1] })).toBe('400 BAD_INPUT');
    expect(run({ field: 'childCount', op: 'between', value: [1] })).toBe('400 BAD_INPUT');
    expect(run({ field: 'baptismDate', op: 'on', value: '2025-02-30' })).toBe('400 BAD_INPUT');
    expect(run({ field: 'baptismDate', op: 'on', value: '10/20/2025' })).toBe('400 BAD_INPUT');
    expect(run({ field: 'baptismDate', op: 'withinLast', value: { amount: 0, unit: 'days' } })).toBe('400 BAD_INPUT');
    expect(run({ field: 'baptismDate', op: 'withinLast', value: { amount: 5, unit: 'weeks' } })).toBe('400 BAD_INPUT');
    expect(run({ field: 'baptised', op: 'isYes', value: true })).toBe('400 BAD_INPUT');
    expect(run({ field: 'education', op: 'anyMatch', value: { levelAtLeast: 'OTHER' } })).toBe('400 BAD_INPUT'); // unranked
    expect(run({ field: 'education', op: 'anyMatch', value: {} })).toBe('400 BAD_INPUT');
    expect(run({ field: 'employment', op: 'anyMatch', value: {} })).toBe('400 BAD_INPUT');
    expect(run({ field: 'employment', op: 'anyMatch', value: { sector: ['MAGIC'] } })).toBe('400 BAD_INPUT');
    expect(run({ field: 'employment', op: 'anyMatch', value: { yearsAtLeast: -1 } })).toBe('400 BAD_INPUT');
    expect(run({ field: 'employment', op: 'anyMatch', value: { sector: 'FINANCE' } })).toBe('400 BAD_INPUT'); // a list is needed
    expect(run({ field: 'calling', op: 'anyMatch', value: {} })).toBe('400 BAD_INPUT');
    expect(run({ field: 'calling', op: 'anyMatch', value: { name: 'x', admin: true } })).toBe('400 BAD_INPUT');
    expect(run({ field: 'calling', op: 'anyMatch', value: { name: '' } })).toBe('400 BAD_INPUT');
  });
  it('valid requests of every type are accepted, and zero is a valid number', () => {
    expect(run({ field: 'childCount', op: 'equals', value: 0 })).toBe('ok');
    expect(run({ field: 'baptised', op: 'isYes' })).toBe('ok');
    expect(run({ field: 'baptismDate', op: 'withinLast', value: { amount: 3, unit: 'months' } })).toBe('ok');
    expect(run({ field: 'education', op: 'anyMatch', value: { levelAtLeast: 'BACHELOR', field: 'law' } })).toBe('ok');
    expect(run({ field: 'employment', op: 'noneMatch', value: { sector: ['FINANCE'], yearsAtLeast: 5 } })).toBe('ok');
    expect(run({ field: 'calling', op: 'anyMatch', value: { name: 'drum' } })).toBe('ok');
  });
  it('a field the viewer may not use is 403 naming only what they sent, and is judged before its value', () => {
    const noIdentity = { viewer: { identity: false, read: ['BAPTISM', 'EMPLOYMENT', 'EDUCATION', 'CALLING', 'FAMILY'] as never } };
    expect(run({ field: 'gender', op: 'is', value: 'MALE' }, noIdentity)).toBe('403 FIELD_NOT_ALLOWED');
    expect(run({ field: 'gender', op: 'is', value: 'not even valid' }, noIdentity)).toBe('403 FIELD_NOT_ALLOWED'); // value never probed
    expect(run({ field: 'marital', op: 'is', value: 'MARRIED' }, noIdentity)).toBe('403 FIELD_NOT_ALLOWED');
    try { search(rows, all({ field: 'age', op: 'atLeast', value: 1 }, { field: 'gender', op: 'is', value: 'MALE' }, { field: 'name', op: 'contains', value: 'a' }), noIdentity); } catch (e) {
      expect((e as FilterError).fields).toEqual(['age', 'gender']);
    }
    const nothing = { viewer: { identity: false, read: [] } };
    const cases: Array<[string, string, unknown]> = [
      ['baptised', 'isYes', undefined], ['baptismYears', 'atLeast', 1], ['employment', 'anyMatch', { sector: ['FINANCE'] }], ['education', 'anyMatch', { levelAtLeast: 'BACHELOR' }],
      ['childCount', 'atLeast', 1], ['hasSpouseRecorded', 'isYes', undefined], ['calling', 'anyMatch', { name: 'x' }],
    ];
    for (const [field, op, value] of cases) expect(run({ field, op, value }, nothing), field).toBe('403 FIELD_NOT_ALLOWED');
    expect(run({ field: 'name', op: 'contains', value: 'a' }, nothing)).toBe('ok');
    expect(run({ field: 'status', op: 'is', value: 'ACTIVE' }, nothing)).toBe('ok');
  });
  it('a field inside an OR group is checked like any other', () => {
    expect(code(() => search(rows, { anyGroups: [{ any: [{ field: 'name', op: 'contains', value: 'a' }, { field: 'gender', op: 'is', value: 'MALE' }] }] }, { viewer: { identity: false, read: [] } }))).toBe('403 FIELD_NOT_ALLOWED');
  });
  it('sorting needs the same permission as filtering (order alone would reveal the hidden value)', () => {
    const v = { viewer: { identity: false, read: [] as never } };
    expect(code(() => search(rows, undefined, { ...v, sort: { field: 'age', dir: 'asc' } }))).toBe('403 FIELD_NOT_ALLOWED');
    expect(code(() => search(rows, undefined, { ...v, sort: { field: 'baptismDate', dir: 'asc' } }))).toBe('403 FIELD_NOT_ALLOWED');
    expect(code(() => search(rows, undefined, { ...v, sort: { field: 'name', dir: 'desc' } }))).toBe('ok');
    expect(code(() => search(rows, undefined, { sort: { field: 'childCount', dir: 'asc' } }))).toBe('400 BAD_INPUT'); // not sortable
    expect(code(() => search(rows, undefined, { sort: { field: 'password', dir: 'asc' } }))).toBe('400 BAD_INPUT');
  });
  it('units named in a condition must be inside the viewer unit scope, in every field that names one', () => {
    const scope = { unitScope: new Set(['ou-music']) };
    expect(run({ field: 'unit', op: 'includesAny', value: ['ou-music'] }, scope)).toBe('ok');
    expect(run({ field: 'unit', op: 'includesAny', value: ['ou-music', 'ou-youth'] }, scope)).toBe('403 UNIT_NOT_ALLOWED');
    expect(run({ field: 'unit', op: 'includesNone', value: ['ou-youth'] }, scope)).toBe('403 UNIT_NOT_ALLOWED'); // "not in Youth" would reveal Youth too
    expect(run({ field: 'unit', op: 'includesAny', value: ['ou-ghost'] }, scope)).toBe('403 UNIT_NOT_ALLOWED'); // a missing unit is indistinguishable from a hidden one
    expect(run({ field: 'calling', op: 'anyMatch', value: { unitId: 'ou-youth' } }, scope)).toBe('403 UNIT_NOT_ALLOWED');
    expect(run({ field: 'calling', op: 'noneMatch', value: { name: 'x', unitId: 'ou-youth' } }, scope)).toBe('403 UNIT_NOT_ALLOWED');
    expect(code(() => search(rows, { anyGroups: [{ any: [{ field: 'unit', op: 'includesAny', value: ['ou-youth'] }] }] }, scope))).toBe('403 UNIT_NOT_ALLOWED');
    expect(run({ field: 'unit', op: 'includesAny', value: ['ou-anything'] }, { unitScope: null })).toBe('ok'); // Central sees every unit
  });
});

describe('operators and missing values', () => {
  const a = R({ id: 'a', fullName: 'Aaron Bizimana', memberCode: 'K-001', status: 'ACTIVE' });
  const b = R({ id: 'b', fullName: 'Bella Uwase', memberCode: null, status: 'INACTIVE' });
  it('text: contains, equals and starts with ignore case; a missing value never matches', () => {
    expect(ids([a, b], all({ field: 'name', op: 'contains', value: 'BIZI' }))).toEqual(['a']);
    expect(ids([a, b], all({ field: 'name', op: 'equals', value: 'bella uwase' }))).toEqual(['b']);
    expect(ids([a, b], all({ field: 'name', op: 'startsWith', value: 'aar' }))).toEqual(['a']);
    expect(ids([a, b], all({ field: 'name', op: 'startsWith', value: 'zim' }))).toEqual([]);
    expect(ids([a, b], all({ field: 'memberCode', op: 'contains', value: 'k-' }))).toEqual(['a']); // b has no code
    expect(ids([a, b], all({ field: 'memberCode', op: 'equals', value: 'null' }))).toEqual([]);
  });
  it('choice and ordinal types (generic framework, synthetic registry): "is not" and "none of" include missing values', () => {
    interface T { id: string; kind?: string; grades?: string[] }
    const reg: Registry<T, { today: string }, true> = [
      { key: 'kind', type: 'choice', choices: ['A', 'B'], allowed: () => true, read: (r) => r.kind },
      { key: 'grade', type: 'ordinal', choices: ['LOW', 'MID', 'HIGH', 'OTHER'], rank: { LOW: 1, MID: 2, HIGH: 3 }, allowed: () => true, read: (r) => r.grades },
    ];
    const rows: T[] = [{ id: 'a', kind: 'A', grades: ['LOW'] }, { id: 'b', kind: 'B', grades: ['LOW', 'HIGH'] }, { id: 'n' }, { id: 'o', kind: 'A', grades: ['OTHER'] }];
    const q = (c: { field: string; op: string; value?: unknown }) => runSearch({ registry: reg, viewer: true, ctx: { today: '2026-10-20' }, rows, unitScope: null, match: { all: [c] }, page: { limit: 100, offset: 0 } }).items.map((r) => r.id);
    expect(q({ field: 'kind', op: 'is', value: 'A' })).toEqual(['a', 'o']);
    expect(q({ field: 'kind', op: 'isNot', value: 'A' })).toEqual(['b', 'n']);
    expect(q({ field: 'kind', op: 'isAny', value: ['A', 'B'] })).toEqual(['a', 'b', 'o']);
    expect(q({ field: 'kind', op: 'isNone', value: ['A', 'B'] })).toEqual(['n']);
    expect(q({ field: 'grade', op: 'atLeast', value: 'HIGH' })).toEqual(['b']); // highest recorded; unranked and missing never
    expect(q({ field: 'grade', op: 'atMost', value: 'LOW' })).toEqual(['a']);
    expect(q({ field: 'grade', op: 'is', value: 'OTHER' })).toEqual(['o']);
    expect(q({ field: 'grade', op: 'isNone', value: ['LOW'] })).toEqual(['n', 'o']);
  });
  it('status is a choice every person has', () => {
    expect(ids([a, b], all({ field: 'status', op: 'isNot', value: 'ACTIVE' }))).toEqual(['b']);
  });
  it('numbers: zero is a real value; a missing value never matches at least, at most, between or equals', () => {
    const dob = (id: string, d: string | null) => R({ id, dateOfBirth: d });
    const rows = [dob('x', '1990-01-01'), dob('y', null)];
    expect(ids(rows, all({ field: 'age', op: 'atMost', value: 100 }))).toEqual(['x']);
    expect(ids(rows, all({ field: 'age', op: 'atLeast', value: 0 }))).toEqual(['x']);
    expect(ids(rows, all({ field: 'age', op: 'between', value: [0, 120] }))).toEqual(['x']);
    expect(ids(rows, all({ field: 'age', op: 'equals', value: 0 }))).toEqual([]);
    expect(ids([dob('baby', '2026-09-01')], all({ field: 'age', op: 'equals', value: 0 }))).toEqual(['baby']);
    const fam = R({ id: 'k', records: [{ section: 'FAMILY', data: { relation: 'CHILD', name: 'A' } }] });
    const bare = R({ id: 'z' });
    expect(ids([fam, bare], all({ field: 'childCount', op: 'equals', value: 0 }))).toEqual(['z']); // none recorded is a real zero
    expect(ids([fam, bare], all({ field: 'childCount', op: 'atMost', value: 0 }))).toEqual(['z']);
    expect(ids([fam, bare], all({ field: 'childCount', op: 'between', value: [1, 3] }))).toEqual(['k']);
  });
  it('dates: on / before / after / between are inclusive and a missing date never matches', () => {
    const bp = (id: string, date?: string) => R({ id, records: date ? [{ section: 'BAPTISM' as const, data: { date } }] : [] });
    const rows = [bp('old', '2000-05-01'), bp('mid', '2015-06-15'), bp('new', '2024-01-01'), bp('none')];
    expect(ids(rows, all({ field: 'baptismDate', op: 'on', value: '2015-06-15' }))).toEqual(['mid']);
    expect(ids(rows, all({ field: 'baptismDate', op: 'before', value: '2015-06-15' }))).toEqual(['old']);
    expect(ids(rows, all({ field: 'baptismDate', op: 'after', value: '2015-06-15' }))).toEqual(['new']);
    expect(ids(rows, all({ field: 'baptismDate', op: 'between', value: ['2000-05-01', '2015-06-15'] }))).toEqual(['old', 'mid']);
    expect(ids(rows, all({ field: 'baptismDate', op: 'withinLast', value: { amount: 3, unit: 'years' } }))).toEqual(['new']);
  });
  it('a baptism date in the future is not a baptism yet', () => {
    const f = R({ id: 'fut', records: [{ section: 'BAPTISM', data: { date: '2026-12-01' } }] });
    expect(ids([f], all({ field: 'baptised', op: 'isYes' }))).toEqual([]);
    expect(ids([f], all({ field: 'baptised', op: 'isNo' }))).toEqual(['fut']);
    expect(ids([f], all({ field: 'baptismYears', op: 'atLeast', value: 0 }))).toEqual([]);
    const soon = R({ id: 'soon', records: [{ section: 'BAPTISM', data: { date: '2026-12-01' } }] });
    expect(ids([soon], all({ field: 'baptismDate', op: 'withinNext', value: { amount: 2, unit: 'months' } }))).toEqual(['soon']);
    expect(ids([soon], all({ field: 'baptismDate', op: 'withinNext', value: { amount: 1, unit: 'months' } }))).toEqual([]);
  });
  it('yes/no: a missing record counts as no', () => {
    const yes = R({ id: 'y', records: [{ section: 'BAPTISM', data: { date: '2010-01-01' } }, { section: 'FAMILY', data: { relation: 'SPOUSE', name: 'Ann' } }] });
    const no = R({ id: 'n' });
    expect(ids([yes, no], all({ field: 'baptised', op: 'isYes' }))).toEqual(['y']);
    expect(ids([yes, no], all({ field: 'baptised', op: 'isNo' }))).toEqual(['n']);
    expect(ids([yes, no], all({ field: 'hasSpouseRecorded', op: 'isYes' }))).toEqual(['y']);
    expect(ids([yes, no], all({ field: 'hasSpouseRecorded', op: 'isNo' }))).toEqual(['n']);
  });
  it('units: includes any / none, with the units below; someone in no unit is "in none of" them', () => {
    const inSub = R({ id: 'sub', unitIds: ['ou-sub'] });
    const inOther = R({ id: 'oth', unitIds: ['ou-other'] });
    const nowhere = R({ id: 'nil' });
    const three = R({ id: 'three', unitIds: ['ou-sub', 'ou-top', 'ou-other'] });
    const rows = [inSub, inOther, nowhere, three];
    const o = { units: { 'ou-top': ['ou-sub'] } };
    expect(ids(rows, all({ field: 'unit', op: 'includesAny', value: ['ou-top'] }), o)).toEqual(['sub', 'three']);
    expect(ids(rows, all({ field: 'unit', op: 'includesNone', value: ['ou-top'] }), o)).toEqual(['oth', 'nil']);
    expect(ids(rows, all({ field: 'unit', op: 'includesAny', value: ['ou-top', 'ou-other'] }), o)).toEqual(['sub', 'oth', 'three']);
  });
});

describe('AND, grouped OR and no duplicates', () => {
  const sector = (x: string) => ({ field: 'employment', op: 'anyMatch', value: { sector: [x] } });
  const m = R({ id: 'm', gender: 'MALE', status: 'ACTIVE', unitIds: ['ou-elim'], records: [{ section: 'EMPLOYMENT', data: { status: 'EMPLOYED', sector: 'FINANCE' } }] });
  const f = R({ id: 'f', gender: 'FEMALE', status: 'ACTIVE', unitIds: ['ou-elim', 'ou-youth'], records: [{ section: 'EMPLOYMENT', data: { status: 'EMPLOYED', sector: 'HEALTH' } }] });
  const v = R({ id: 'v', gender: 'MALE', status: 'VISITOR', unitIds: [], records: [] });
  const rows = [m, f, v];
  it('an empty request lists everyone the caller gave us; AND narrows', () => {
    expect(ids(rows, undefined)).toEqual(['m', 'f', 'v']);
    expect(ids(rows, {})).toEqual(['m', 'f', 'v']);
    expect(ids(rows, all({ field: 'gender', op: 'is', value: 'MALE' }, { field: 'status', op: 'is', value: 'ACTIVE' }))).toEqual(['m']);
  });
  it('one OR group: any of its conditions', () => {
    const g = { any: [sector('FINANCE'), sector('HEALTH')] };
    expect(ids(rows, { anyGroups: [g] })).toEqual(['m', 'f']);
  });
  it('groups are combined with AND, and with `all`', () => {
    const g1 = { any: [sector('FINANCE'), sector('HEALTH')] };
    const g2 = { any: [{ field: 'gender', op: 'is', value: 'FEMALE' }, { field: 'status', op: 'is', value: 'VISITOR' }] };
    expect(ids(rows, { anyGroups: [g1, g2] })).toEqual(['f']);
    expect(ids(rows, { all: [{ field: 'unit', op: 'includesAny', value: ['ou-youth'] }], anyGroups: [g1] })).toEqual(['f']);
    expect(ids(rows, { all: [{ field: 'gender', op: 'is', value: 'MALE' }], anyGroups: [g2] })).toEqual(['v']);
  });
  it('a person with several units, callings or children is listed once', () => {
    const many = R({ id: 'many', unitIds: ['ou-a', 'ou-b', 'ou-c'], records: [
      { section: 'CALLING', data: { name: 'Singer', orgUnitId: 'ou-a' } }, { section: 'CALLING', data: { name: 'Singer', orgUnitId: 'ou-b' } },
      { section: 'FAMILY', data: { relation: 'CHILD', name: 'A' } }, { section: 'FAMILY', data: { relation: 'CHILD', name: 'B' } },
    ] });
    const o = { units: { 'ou-top': ['ou-a', 'ou-b', 'ou-c'] } };
    const r = search([many], { all: [{ field: 'unit', op: 'includesAny', value: ['ou-a', 'ou-b', 'ou-top'] }, { field: 'calling', op: 'anyMatch', value: { name: 'singer', unitId: 'ou-top' } }, { field: 'childCount', op: 'atLeast', value: 1 }] }, o);
    expect(r.total).toBe(1);
    expect(r.items.map((x) => x.id)).toEqual(['many']);
  });
});

describe('callings, children, employment', () => {
  const o = { units: { 'ou-top': ['ou-a', 'ou-b'] } };
  const callings = R({ id: 'c', records: [{ section: 'CALLING', data: { name: 'Drummer', orgUnitId: 'ou-a' } }, { section: 'CALLING', data: { name: 'Singer', orgUnitId: 'ou-b' } }] });
  it('role and unit in ONE condition must hold for the same calling', () => {
    expect(ids([callings], all({ field: 'calling', op: 'anyMatch', value: { name: 'drummer', unitId: 'ou-a' } }), o)).toEqual(['c']);
    expect(ids([callings], all({ field: 'calling', op: 'anyMatch', value: { name: 'drummer', unitId: 'ou-b' } }), o)).toEqual([]); // drummer is in a, not b
    expect(ids([callings], all({ field: 'calling', op: 'anyMatch', value: { name: 'singer', unitId: 'ou-top' } }), o)).toEqual(['c']);
  });
  it('role and unit in SEPARATE conditions may be held by different callings', () => {
    const m = all({ field: 'calling', op: 'anyMatch', value: { name: 'drummer' } }, { field: 'calling', op: 'anyMatch', value: { unitId: 'ou-b' } });
    expect(ids([callings], m, o)).toEqual(['c']);
  });
  it('"no such calling" is true of people with none', () => {
    expect(ids([callings, R({ id: 'z' })], all({ field: 'calling', op: 'noneMatch', value: { name: 'drummer' } }), o)).toEqual(['z']);
  });
  const kids = (...recs: Array<Record<string, unknown>>) => R({ id: 'p', records: recs.map((data) => ({ section: 'FAMILY' as const, data: { relation: 'CHILD', ...data } })) });
  it('children are counted distinctly, from the family records alone', () => {
    // The same member linked twice; the same name AND birth date written twice (case, spacing, accents ignored).
    expect(childCount(kids({ relatedPersonId: 'p-eric' }, { relatedPersonId: 'p-eric' }))).toBe(1);
    expect(childCount(kids({ name: 'Ann', dateOfBirth: '2010-01-01' }, { name: ' ANN ', dateOfBirth: '2010-01-01' }))).toBe(1);
    expect(childCount(kids({ name: 'Éric  Mugisha', dateOfBirth: '2015-03-02' }, { name: 'eric mugisha', dateOfBirth: '2015-03-02' }))).toBe(1);
    // A child linked by ID that also carries name and birth date, and the same child written by name and birth date.
    expect(childCount(kids({ relatedPersonId: 'p-eric', name: 'Eric Mugisha', dateOfBirth: '2015-03-02' }, { name: 'Eric Mugisha', dateOfBirth: '2015-03-02' }))).toBe(1);
    expect(childCount(kids({ relatedPersonId: 'p-eric', name: 'Eric Mugisha', dateOfBirth: '2015-03-02' }, { relatedPersonId: 'p-eric' }, { name: 'eric mugisha', dateOfBirth: '2015-03-02' }))).toBe(1);
    // Distinct children with the same name: different birth dates.
    expect(childCount(kids({ name: 'Ann', dateOfBirth: '2010-01-01' }, { name: 'Ann', dateOfBirth: '2012-02-02' }))).toBe(2);
    expect(childCount(kids({ relatedPersonId: 'p-1', name: 'Ann', dateOfBirth: '2010-01-01' }, { relatedPersonId: 'p-2', name: 'Ann', dateOfBirth: '2012-02-02' }))).toBe(2);
    // Missing birth dates: a name alone is weak evidence, so it is never merged with anything.
    expect(childCount(kids({ name: 'Ann' }, { name: 'Ann' }))).toBe(2);
    expect(childCount(kids({ name: 'Ann' }, { name: 'Ann', dateOfBirth: '2010-01-01' }))).toBe(2);
    expect(childCount(kids({ relatedPersonId: 'p-eric' }, { name: 'Eric Mugisha' }))).toBe(2);
    expect(childCount(kids({ relatedPersonId: 'p-eric', name: 'Eric Mugisha' }, { name: 'Eric Mugisha', dateOfBirth: '2015-03-02' }))).toBe(2);
    // Conflicting identifiers: two different members share one name and birth date, so a bare record is nobody's duplicate.
    const clash = [{ relatedPersonId: 'p-1', name: 'Ann', dateOfBirth: '2010-01-01' }, { relatedPersonId: 'p-2', name: 'Ann', dateOfBirth: '2010-01-01' }];
    expect(childCount(kids(...clash))).toBe(2);
    expect(childCount(kids(...clash, { name: 'Ann', dateOfBirth: '2010-01-01' }))).toBe(3);
    // Other relations and records naming nobody never count; every distinct child does.
    expect(childCount(kids({ note: 'nobody named' }))).toBe(0);
    expect(childCount(kids({ name: 'A' }, { name: 'B' }, { name: 'C' }))).toBe(3);
    expect(childCount(R({ id: 'p', records: [{ section: 'FAMILY', data: { relation: 'SPOUSE', name: 'Ann' } }, { section: 'FAMILY', data: { relation: 'PARENT', name: 'Pa' } }] }))).toBe(0);
    expect(childCount(R({ id: 'p' }))).toBe(0);
  });
  it('the count does not depend on the order of the records', () => {
    const recs = [{ relatedPersonId: 'p-1', name: 'Ann', dateOfBirth: '2010-01-01' }, { name: 'Ann', dateOfBirth: '2010-01-01' }, { name: 'Bob' }, { relatedPersonId: 'p-2' }, { name: 'Bob' }];
    const base = childCount(kids(...recs));
    expect(base).toBe(4);
    for (let i = 0; i < 12; i++) expect(childCount(kids(...[...recs].sort(() => Math.random() - 0.5)))).toBe(base);
  });
  it('a linked child the viewer cannot see changes nothing: only the family records are read', () => {
    // The count comes from the FAMILY records alone, so the linked member (in scope or not) has no way to influence it.
    const mine = kids({ relatedPersonId: 'p-hidden' }, { name: 'Hidden Person', dateOfBirth: '1990-01-01' });
    expect(childCount(mine)).toBe(2); // not merged by guessing that p-hidden is called "Hidden Person"
    expect(ids([mine], all({ field: 'childCount', op: 'equals', value: 2 }))).toEqual(['p']);
    expect(ids([mine], all({ field: 'childCount', op: 'equals', value: 1 }))).toEqual([]);
  });
  it('work: status, sector, field and years are tested on the SAME job', () => {
    const job = (id: string, ...data: Array<Record<string, unknown>>) => R({ id, records: data.map((d) => ({ section: 'EMPLOYMENT' as const, data: d })) });
    const finance5 = (op = 'anyMatch') => all({ field: 'employment', op, value: { sector: ['FINANCE'], yearsAtLeast: 5 } });
    const split = job('split', { status: 'EMPLOYED', sector: 'FINANCE', since: '2024-10-20' }, { status: 'EMPLOYED', sector: 'HEALTH', since: '2020-10-20' }); // Finance for 2 years, another job for 6
    const same = job('same', { status: 'EMPLOYED', sector: 'FINANCE', since: '2020-10-20' }, { status: 'EMPLOYED', sector: 'HEALTH', since: '2024-10-20' });
    const self = job('self', { status: 'SELF_EMPLOYED', sector: 'FINANCE', since: '2021-10-21' });
    const exact = job('exact', { status: 'EMPLOYED', sector: 'FINANCE', since: '2021-10-20' }); // exactly 5 years today
    expect(ids([split, same, exact, self], finance5())).toEqual(['same', 'exact']);
    expect(ids([split, same, exact, self], finance5('noneMatch'))).toEqual(['split', 'self']);
    // Each part alone still finds the person (any job), and separate conditions are separate questions.
    expect(ids([split], all({ field: 'employment', op: 'anyMatch', value: { sector: ['FINANCE'] } }))).toEqual(['split']);
    expect(ids([split], all({ field: 'employment', op: 'anyMatch', value: { yearsAtLeast: 5 } }))).toEqual(['split']);
    expect(ids([split], all({ field: 'employment', op: 'anyMatch', value: { sector: ['FINANCE'] } }, { field: 'employment', op: 'anyMatch', value: { yearsAtLeast: 5 } }))).toEqual(['split']);
    // Years count only employed or self-employed work that has begun, from its own start date.
    const y = (d: Record<string, unknown>) => ids([job('x', d)], all({ field: 'employment', op: 'anyMatch', value: { yearsAtLeast: 0 } })).length === 1;
    expect(y({ status: 'EMPLOYED', since: '2026-10-20' })).toBe(true); // a real zero
    expect(y({ status: 'STUDENT', since: '2010-01-01' })).toBe(false);
    expect(y({ status: 'UNEMPLOYED', since: '2010-01-01' })).toBe(false);
    expect(y({ status: 'RETIRED', since: '2010-01-01' })).toBe(false);
    expect(y({ status: 'EMPLOYED' })).toBe(false); // no start date: unknown, not zero
    expect(y({ status: 'EMPLOYED', since: '2027-01-01' })).toBe(false); // not begun
    // Status and field are on the same job too.
    const mixed = job('m', { status: 'STUDENT', field: 'Medicine' }, { status: 'EMPLOYED', field: 'Accounting' });
    expect(ids([mixed], all({ field: 'employment', op: 'anyMatch', value: { status: ['EMPLOYED'], field: 'medic' } }))).toEqual([]);
    expect(ids([mixed], all({ field: 'employment', op: 'anyMatch', value: { status: ['STUDENT'], field: 'medic' } }))).toEqual(['m']);
    expect(ids([R({ id: 'none' })], finance5('noneMatch'))).toEqual(['none']);
  });
  it('education: level and field are tested on the SAME record', () => {
    const edu = (id: string, ...data: Array<Record<string, unknown>>) => R({ id, records: data.map((d) => ({ section: 'EDUCATION' as const, data: d })) });
    const lawDegree = all({ field: 'education', op: 'anyMatch', value: { levelAtLeast: 'BACHELOR', field: 'law' } });
    // The highest qualification (Master, Finance) and the Law record (Secondary) are different records.
    const apart = edu('apart', { level: 'MASTER', field: 'Finance' }, { level: 'SECONDARY_A', field: 'Law' });
    const together = edu('together', { level: 'BACHELOR', field: 'Civil Law' }, { level: 'SECONDARY_A', field: 'Science' });
    const higher = edu('higher', { level: 'MASTER', field: 'International Law' });
    const old = edu('old', { level: 'UNIVERSITY', field: 'Law' }); // an older level name counts as Bachelor
    expect(ids([apart, together, higher, old], lawDegree)).toEqual(['together', 'higher', 'old']);
    expect(ids([apart, together, higher, old], all({ field: 'education', op: 'noneMatch', value: { levelAtLeast: 'BACHELOR', field: 'law' } }))).toEqual(['apart']);
    // Level alone looks at every record: the highest counts. Field alone looks at every record too.
    expect(ids([apart], all({ field: 'education', op: 'anyMatch', value: { levelAtLeast: 'MASTER' } }))).toEqual(['apart']);
    expect(ids([apart], all({ field: 'education', op: 'anyMatch', value: { field: 'law' } }))).toEqual(['apart']);
    const rows = [edu('sec', { level: 'SECONDARY_A' }), edu('ba', { level: 'BACHELOR' }), edu('uni', { level: 'UNIVERSITY' }), edu('oth', { level: 'OTHER' }), R({ id: 'none' })];
    expect(ids(rows, all({ field: 'education', op: 'anyMatch', value: { levelAtLeast: 'BACHELOR' } }))).toEqual(['ba', 'uni']); // unranked and missing never satisfy "at least"
    expect(ids(rows, all({ field: 'education', op: 'anyMatch', value: { levelIn: ['BACHELOR'] } }))).toEqual(['ba', 'uni']);
    expect(ids(rows, all({ field: 'education', op: 'anyMatch', value: { levelIn: ['OTHER'] } }))).toEqual(['oth']);
    expect(ids(rows, all({ field: 'education', op: 'noneMatch', value: { levelAtLeast: 'BACHELOR' } }))).toEqual(['sec', 'oth', 'none']);
  });
});

describe('church time (Africa/Kigali) and anniversaries', () => {
  it('Kigali is UTC+2: the day changes at 22:00 UTC', () => {
    expect(kigaliDay(new Date('2026-10-19T21:59:59Z'))).toBe('2026-10-19');
    expect(kigaliDay(new Date('2026-10-19T22:00:00Z'))).toBe('2026-10-20');
    expect(kigaliDay(new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-01');
  });
  it('a birthday counts from the first minute of the day in Kigali', () => {
    const p = row({ id: 'b', dateOfBirth: '2000-10-20' });
    const age = (iso: string) => search([p], all({ field: 'age', op: 'atLeast', value: 26 }), { now: new Date(iso) }).total;
    expect(age('2026-10-19T21:59:00Z')).toBe(0); // 23:59 on 19 October in Kigali: still 25
    expect(age('2026-10-19T22:00:00Z')).toBe(1); // 00:00 on 20 October in Kigali: 26
    expect(age('2026-10-20T10:00:00Z')).toBe(1);
  });
  it('years across month ends, leap years and the year boundary', () => {
    expect(yearsBetween('2000-02-29', '2027-02-28')).toBe(26);
    expect(yearsBetween('2000-02-29', '2027-03-01')).toBe(27);
    expect(yearsBetween('2000-02-29', '2028-02-28')).toBe(27);
    expect(yearsBetween('2000-02-29', '2028-02-29')).toBe(28);
    expect(yearsBetween('2000-12-31', '2026-12-30')).toBe(25);
    expect(yearsBetween('2000-12-31', '2026-12-31')).toBe(26);
    expect(yearsBetween('2000-01-01', '2026-01-01')).toBe(26);
    expect(yearsBetween('2026-10-20', '2026-10-20')).toBe(0);
    expect(yearsBetween('2026-10-21', '2026-10-20')).toBeNull(); // not yet
    expect(yearsBetween('not a date', '2026-10-20')).toBeNull();
    expect(yearsBetween(null, '2026-10-20')).toBeNull();
    expect(yearsBetween('2000-02-30', '2026-10-20')).toBeNull();
  });
  it('baptism years and age follow the same Kigali day, including the leap-day rule', () => {
    const bap = (date: string) => row({ id: 'p', dateOfBirth: date, records: [{ section: 'BAPTISM', data: { date } }] });
    const at = (iso: string, field: 'baptismYears' | 'age', years: number) => search([bap('2016-02-29')], all({ field, op: 'equals', value: years }), { now: new Date(iso) }).total;
    for (const field of ['baptismYears', 'age'] as const) {
      expect(at('2026-02-27T12:00:00Z', field, 9)).toBe(1);
      expect(at('2026-02-28T12:00:00Z', field, 9)).toBe(1); // 28 February: the anniversary has not come
      expect(at('2026-02-28T21:59:00Z', field, 9)).toBe(1); // 23:59 on 28 February in Kigali
      expect(at('2026-02-28T22:00:00Z', field, 10)).toBe(1); // 00:00 on 1 March in Kigali: it has
      expect(at('2028-02-28T12:00:00Z', field, 11)).toBe(1); // leap year: 29 February itself is the anniversary
      expect(at('2028-02-29T12:00:00Z', field, 12)).toBe(1);
    }
    // 21 October date: the 10th anniversary starts at 00:00 on 21 October in Kigali, which is 22:00 UTC on the 20th.
    const day = (iso: string, field: 'baptismYears' | 'age') => search([bap('2016-10-21')], all({ field, op: 'atLeast', value: 10 }), { now: new Date(iso) }).total;
    for (const field of ['baptismYears', 'age'] as const) {
      expect(day('2026-10-20T21:59:59Z', field)).toBe(0);
      expect(day('2026-10-20T22:00:00Z', field)).toBe(1);
    }
  });
  it('baptised exactly ten years ago counts as ten years', () => {
    const p = row({ id: 'p', records: [{ section: 'BAPTISM', data: { date: '2016-10-20' } }] });
    const q = row({ id: 'q', records: [{ section: 'BAPTISM', data: { date: '2016-10-21' } }] });
    expect(ids([p, q], all({ field: 'baptismYears', op: 'atLeast', value: 10 }))).toEqual(['p']);
    expect(ids([p, q], all({ field: 'baptismYears', op: 'equals', value: 9 }))).toEqual(['q']);
  });
  it('shifting days, months and years keeps month ends inside the month', () => {
    expect(shiftDay('2026-03-31', -1, 'months')).toBe('2026-02-28');
    expect(shiftDay('2024-03-31', -1, 'months')).toBe('2024-02-29');
    expect(shiftDay('2024-02-29', 1, 'years')).toBe('2025-02-28');
    expect(shiftDay('2026-01-31', 1, 'months')).toBe('2026-02-28');
    expect(shiftDay('2026-12-15', 2, 'months')).toBe('2027-02-15');
    expect(shiftDay('2026-01-15', -2, 'months')).toBe('2025-11-15');
    expect(shiftDay('2026-03-01', -1, 'days')).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1, 'days')).toBe('2027-01-01');
  });
  it('"within the last N" uses the Kigali day', () => {
    const p = row({ id: 'p', records: [{ section: 'BAPTISM', data: { date: '2026-10-13' } }] });
    const within = (iso: string) => search([p], all({ field: 'baptismDate', op: 'withinLast', value: { amount: 7, unit: 'days' } }), { now: new Date(iso) }).total;
    expect(within('2026-10-20T10:00:00Z')).toBe(1); // exactly seven days back is inside
    expect(within('2026-10-20T22:00:00Z')).toBe(0); // it is already 21 October in Kigali
  });
  it('real calendar days only', () => {
    expect(isDay('2024-02-29')).toBe(true);
    expect(isDay('2025-02-29')).toBe(false);
    expect(isDay('2025-13-01')).toBe(false);
    expect(isDay('2025-1-1')).toBe(false);
    expect(isDay(20250101)).toBe(false);
  });
});

describe('sorting and paging', () => {
  const people = Array.from({ length: 250 }, (_, i) => row({ id: `p${String(i).padStart(3, '0')}`, fullName: 'Same Name', dateOfBirth: i % 5 === 0 ? null : `${1950 + (i % 40)}-06-15` }));
  it('pages through everyone exactly once with an exact total, and says whether there is more', () => {
    const seen: string[] = [];
    for (let offset = 0; offset < 300; offset += 100) {
      const r = search(people, undefined, { limit: 100, offset });
      expect(r.total).toBe(250);
      expect(r.page.hasMore).toBe(offset + 100 < 250);
      seen.push(...r.items.map((x) => x.id));
    }
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    expect(search(people, undefined, { limit: 100, offset: 900 })).toMatchObject({ total: 250, items: [], page: { hasMore: false } });
  });
  it('sorts by a field with missing values last in both directions, ties kept in name-then-id order', () => {
    const asc = search(people, undefined, { sort: { field: 'age', dir: 'asc' }, limit: 100 }).items;
    const desc = search(people, undefined, { sort: { field: 'age', dir: 'desc' }, limit: 100 }).items;
    const age = (r: { dateOfBirth: string | null }) => (r.dateOfBirth ? yearsBetween(r.dateOfBirth, kigaliDay(NOW)) : null);
    expect(age(asc[0]!)! <= age(asc[1]!)!).toBe(true);
    expect(age(desc[0]!)! >= age(desc[1]!)!).toBe(true);
    const full = (dir: 'asc' | 'desc') => [0, 100, 200].flatMap((offset) => search(people, undefined, { sort: { field: 'age', dir }, limit: 100, offset }).items);
    for (const dir of ['asc', 'desc'] as const) {
      const all = full(dir);
      expect(new Set(all.map((r) => r.id)).size).toBe(250);
      const nulls = all.map(age).map((a, i) => (a === null ? i : -1)).filter((i) => i >= 0);
      expect(nulls[0]).toBe(200); // the 50 people with no birth date come last
      for (let i = 1; i < 200; i++) {
        const [x, y] = [age(all[i - 1]!)!, age(all[i]!)!];
        expect(dir === 'asc' ? x <= y : x >= y).toBe(true);
        if (x === y) expect(all[i - 1]!.id < all[i]!.id).toBe(true); // equal keys: id order
      }
    }
  });
  it('the name sort is the order the rows arrive in (the database decides it)', () => {
    const arrived = [row({ id: '2', fullName: 'Zed' }), row({ id: '1', fullName: 'Amy' })];
    expect(search(arrived, undefined, { sort: { field: 'name', dir: 'asc' } }).items.map((r) => r.id)).toEqual(['2', '1']);
  });
  it('the quick search narrows before counting', () => {
    expect(search([row({ id: 'a', fullName: 'Amy' }), row({ id: 'b', fullName: 'Bob' })], undefined, { q: 'am' })).toMatchObject({ total: 1 });
  });
});

describe('schema offered to a viewer', () => {
  it('lists only fields the viewer may use, with their operators', () => {
    const keys = (v: Parameters<typeof schemaFor>[1]) => schemaFor(PEOPLE_FIELDS, v).fields.map((f) => f.key);
    expect(keys({ identity: false, read: [] })).toEqual(['name', 'memberCode', 'status', 'unit']);
    expect(keys(EVERYTHING)).toEqual(expect.arrayContaining(['gender', 'age', 'marital', 'childCount', 'calling', 'education', 'employment', 'baptismYears']));
    for (const gone of ['educationLevel', 'educationField', 'employmentStatus', 'employmentSector', 'employmentField', 'employedYears']) expect(keys(EVERYTHING)).not.toContain(gone);
    expect(keys({ identity: false, read: ['EMPLOYMENT', 'BAPTISM'] })).toEqual(['name', 'memberCode', 'status', 'unit', 'baptised', 'baptismDate', 'baptismYears', 'employment']);
    const s = schemaFor(PEOPLE_FIELDS, EVERYTHING);
    expect(s.fields.find((f) => f.key === 'education')).toMatchObject({ type: 'records', operators: ['anyMatch', 'noneMatch'], parts: [{ key: 'levelAtLeast', kind: 'choice', choices: ['NONE', 'PRIMARY', 'SECONDARY_O', 'SECONDARY_A', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE'] }, { key: 'levelIn', kind: 'choices' }, { key: 'field', kind: 'text' }] });
    expect(s.fields.find((f) => f.key === 'employment')?.parts?.map((p) => p.key)).toEqual(['status', 'sector', 'field', 'yearsAtLeast']);
    expect(s.fields.find((f) => f.key === 'childCount')).toMatchObject({ type: 'number', min: 0, max: 30, operators: ['equals', 'atLeast', 'atMost', 'between'] });
    expect(s.sortable).toEqual(['name', 'memberCode', 'status', 'age', 'baptismDate']);
    expect(schemaFor(PEOPLE_FIELDS, { identity: false, read: [] }).sortable).toEqual(['name', 'memberCode', 'status']);
  });
});
