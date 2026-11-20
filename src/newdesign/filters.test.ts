import { createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { FieldSchema, FilterSchema } from '../api/frontDoorApi';
import { blankValue, checkDraft, draftFrom, newDraftCondition, retarget, shapeOf, withField, withOp } from './filterDraft';
import { sentenceOf, type FilterLabels } from './filterLabels';
import {
  asSort, buildSearchBody, checkValue, cleanCondition, clearConditions, conditionCount, emptyState, fieldOf, pageSizes, quickValue, removeCondition, removeFromGroup, removeGroup,
  requestKey, withArchived, withConditions, withPage, withQuery, withQuick, withSize, withSort, type FilterState,
} from './filterModel';
import { parseConditionText, parseFilterState, serializeFilterState } from './filterUrl';
import { criteriaToConditions, legacyViewQuery } from './peopleViews';

const EDU = ['NONE', 'PRIMARY', 'SECONDARY_O', 'SECONDARY_A', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER'];
const OPS = {
  text: ['contains', 'equals', 'startsWith'], choice: ['is', 'isNot', 'isAny', 'isNone'], ordinal: ['is', 'isAny', 'isNone', 'atLeast', 'atMost'],
  number: ['equals', 'atLeast', 'atMost', 'between'], date: ['on', 'before', 'after', 'between', 'withinLast', 'withinNext'], boolean: ['isYes', 'isNo'],
  multi: ['includesAny', 'includesNone'], records: ['anyMatch', 'noneMatch'],
};
const f = (key: string, type: FieldSchema['type'], extra: Partial<FieldSchema> = {}): FieldSchema => ({ key, type, operators: OPS[type], sortable: false, ...extra });
/** What the server publishes for someone allowed to see everything (mirrors GET /api/people/filter-schema). */
const OPEN_FIELDS: FieldSchema[] = [
  f('name', 'text', { sortable: true }), f('memberCode', 'text', { sortable: true }), f('status', 'choice', { choices: ['ACTIVE', 'INACTIVE', 'VISITOR'], sortable: true }),
  f('unit', 'multi', { unitValued: true }),
];
const FULL: FilterSchema = {
  fields: [
    ...OPEN_FIELDS,
    f('gender', 'choice', { choices: ['MALE', 'FEMALE'] }), f('age', 'number', { min: 0, max: 120, sortable: true }), f('baptised', 'boolean'),
    f('baptismDate', 'date', { sortable: true }), f('baptismYears', 'number', { min: 0, max: 100 }),
    f('employment', 'records', { parts: [{ key: 'status', kind: 'choices', choices: ['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT'] }, { key: 'sector', kind: 'choices', choices: ['FINANCE', 'HEALTH'] }, { key: 'field', kind: 'text' }, { key: 'yearsAtLeast', kind: 'number', min: 0, max: 80 }] }),
    f('education', 'records', { parts: [{ key: 'levelAtLeast', kind: 'choice', choices: EDU.filter((e) => e !== 'OTHER') }, { key: 'levelIn', kind: 'choices', choices: EDU }, { key: 'field', kind: 'text' }] }),
    f('childCount', 'number', { min: 0, max: 30 }), f('marital', 'choice', { choices: ['SINGLE', 'MARRIED', 'WIDOWED'] }),
    f('calling', 'records', { parts: [{ key: 'name', kind: 'text' }, { key: 'unitId', kind: 'unit' }] }),
    f('grade', 'ordinal', { choices: ['LOW', 'MID', 'HIGH'], comparable: ['LOW', 'MID', 'HIGH'] }),
  ],
  sortable: ['name', 'memberCode', 'status', 'age', 'baptismDate'],
  limits: { conditions: 12, groups: 4, listValues: 20, stringLength: 80, pageSize: 100, defaultPageSize: 50 },
  units: [{ id: 'ou-elim', name: 'Elim' }, { id: 'ou-hope', name: 'Hope' }],
  defaultSort: { field: 'name', dir: 'asc' },
};
/** A viewer who may only use the open fields: the server leaves the rest out of the schema altogether. */
const LIMITED: FilterSchema = { ...FULL, fields: OPEN_FIELDS, sortable: ['name', 'memberCode', 'status'] };
const field = (k: string, s: FilterSchema = FULL) => fieldOf(s, k)!;
const defaults = { size: 50 };
const round = (s: FilterState, schema = FULL) => parseFilterState(serializeFilterState(s, defaults), schema);

describe('checking a condition value', () => {
  it('numbers: whole, in range, ordered pairs', () => {
    expect(checkValue(FULL, field('age'), 'atLeast', '30')).toEqual({ ok: true, value: 30 });
    expect(checkValue(FULL, field('age'), 'atLeast', '')).toMatchObject({ ok: false, problem: { code: 'required' } });
    expect(checkValue(FULL, field('age'), 'atLeast', '3.5')).toMatchObject({ ok: false, problem: { code: 'whole' } });
    expect(checkValue(FULL, field('age'), 'atLeast', '500')).toMatchObject({ ok: false, problem: { code: 'range', min: 0, max: 120 } });
    expect(checkValue(FULL, field('age'), 'between', { from: '20', to: '30' })).toEqual({ ok: true, value: [20, 30] });
    expect(checkValue(FULL, field('age'), 'between', [20, 30])).toEqual({ ok: true, value: [20, 30] });
    expect(checkValue(FULL, field('age'), 'between', { from: '40', to: '30' })).toMatchObject({ ok: false, problem: { code: 'order' } });
  });
  it('dates, durations, text and lists', () => {
    expect(checkValue(FULL, field('baptismDate'), 'on', '2020-02-29')).toEqual({ ok: true, value: '2020-02-29' });
    expect(checkValue(FULL, field('baptismDate'), 'on', '2021-02-29')).toMatchObject({ ok: false, problem: { code: 'date' } });
    expect(checkValue(FULL, field('baptismDate'), 'withinLast', { amount: '6', unit: 'months' })).toEqual({ ok: true, value: { amount: 6, unit: 'months' } });
    expect(checkValue(FULL, field('baptismDate'), 'withinLast', { amount: '6', unit: 'weeks' })).toMatchObject({ ok: false });
    expect(checkValue(FULL, field('name'), 'contains', '  Eric ')).toEqual({ ok: true, value: 'Eric' });
    expect(checkValue(FULL, field('name'), 'contains', 'x'.repeat(81))).toMatchObject({ ok: false, problem: { code: 'long', max: 80 } });
    expect(checkValue(FULL, field('status'), 'isAny', ['ACTIVE', 'ACTIVE', 'VISITOR'])).toEqual({ ok: true, value: ['ACTIVE', 'VISITOR'] });
    expect(checkValue(FULL, field('status'), 'isAny', [])).toMatchObject({ ok: false, problem: { code: 'required' } });
    expect(checkValue(FULL, field('status'), 'is', 'GONE')).toMatchObject({ ok: false, problem: { code: 'choice' } });
    expect(checkValue(FULL, field('unit'), 'includesAny', ['ou-elim'])).toEqual({ ok: true, value: ['ou-elim'] });
    expect(checkValue(FULL, field('unit'), 'includesAny', ['ou-elsewhere'])).toMatchObject({ ok: false, problem: { code: 'choice' } });
    expect(checkValue(FULL, field('baptised'), 'isYes', undefined)).toEqual({ ok: true, value: undefined });
    expect(checkValue(FULL, field('name'), 'regex', 'x')).toMatchObject({ ok: false });
  });
  it('records conditions keep only the parts filled in, all for one record', () => {
    expect(checkValue(FULL, field('employment'), 'anyMatch', { status: [], sector: ['FINANCE'], field: '', yearsAtLeast: '5' })).toEqual({ ok: true, value: { sector: ['FINANCE'], yearsAtLeast: 5 } });
    expect(checkValue(FULL, field('education'), 'anyMatch', { levelAtLeast: 'BACHELOR', field: ' law ' })).toEqual({ ok: true, value: { levelAtLeast: 'BACHELOR', field: 'law' } });
    expect(checkValue(FULL, field('education'), 'anyMatch', {})).toMatchObject({ ok: false, problem: { code: 'part' } });
    expect(checkValue(FULL, field('education'), 'anyMatch', { levelAtLeast: 'OTHER' })).toMatchObject({ ok: false, problem: { code: 'choice' } });
    expect(checkValue(FULL, field('education'), 'anyMatch', { sneaky: 'x' })).toMatchObject({ ok: false, problem: { code: 'part' } });
    expect(checkValue(FULL, field('calling'), 'anyMatch', { name: 'Bassist', unitId: 'ou-elim' })).toEqual({ ok: true, value: { name: 'Bassist', unitId: 'ou-elim' } });
    expect(checkValue(FULL, field('calling'), 'anyMatch', { unitId: 'ou-other' })).toMatchObject({ ok: false });
  });
  it('a condition from outside must name an offered field and operator', () => {
    expect(cleanCondition(FULL, { field: 'age', op: 'atLeast', value: 30 })).toEqual({ field: 'age', op: 'atLeast', value: 30 });
    expect(cleanCondition(FULL, { field: 'baptised', op: 'isYes' })).toEqual({ field: 'baptised', op: 'isYes' });
    expect(cleanCondition(FULL, { field: 'password', op: 'is', value: 'x' })).toBeNull();
    expect(cleanCondition(FULL, { field: 'age', op: 'matches', value: 1 })).toBeNull();
    expect(cleanCondition(FULL, { field: 'age', op: 'atLeast', value: '30; DROP TABLE' })).toBeNull();
    expect(cleanCondition(FULL, 'age')).toBeNull();
  });
});

describe('permission-dependent schema', () => {
  it('only the fields the server offers can be used; the rest are refused when read back', () => {
    expect(cleanCondition(LIMITED, { field: 'name', op: 'contains', value: 'a' })).not.toBeNull();
    for (const c of [{ field: 'age', op: 'atLeast', value: 30 }, { field: 'education', op: 'anyMatch', value: { field: 'law' } }, { field: 'marital', op: 'is', value: 'MARRIED' }]) {
      expect(cleanCondition(LIMITED, c)).toBeNull();
    }
    const sp = new URLSearchParams('c=age:atLeast:30&c=status:is:"ACTIVE"&sort=age:desc');
    const { state, dropped } = parseFilterState(sp, LIMITED);
    expect(state.all).toEqual([{ field: 'status', op: 'is', value: 'ACTIVE' }]);
    expect(state.sort).toBeNull();
    expect(dropped).toBe(2);
  });
  it('the form offers exactly the schema fields', () => {
    expect(LIMITED.fields.map((x) => x.key)).toEqual(['name', 'memberCode', 'status', 'unit']);
    expect(newDraftCondition(LIMITED.fields[0]!).field).toBe('name');
  });
});

describe('the request sent to the server', () => {
  it('names only what is set, and groups only when they have conditions', () => {
    expect(buildSearchBody(emptyState(50), 'sys-main')).toEqual({ systemId: 'sys-main', page: { limit: 50, offset: 0 } });
    const s: FilterState = {
      q: ' Eric ', archived: true, all: [{ field: 'age', op: 'atLeast', value: 30 }], groups: [[{ field: 'gender', op: 'is', value: 'MALE' }, { field: 'gender', op: 'is', value: 'FEMALE' }], []],
      sort: { field: 'age', dir: 'desc' }, page: 3, size: 25,
    };
    expect(buildSearchBody(s, '')).toEqual({
      q: 'Eric', archived: true,
      match: { all: [{ field: 'age', op: 'atLeast', value: 30 }], anyGroups: [{ any: [{ field: 'gender', op: 'is', value: 'MALE' }, { field: 'gender', op: 'is', value: 'FEMALE' }] }] },
      sort: { field: 'age', dir: 'desc' }, page: { limit: 25, offset: 50 },
    });
  });
  it('asks for the same thing in the same words whatever the key order', () => {
    expect(requestKey({ a: 1, b: { y: 2, x: 1 } })).toBe(requestKey({ b: { x: 1, y: 2 }, a: 1 }));
    expect(requestKey({ a: [2, 1] })).not.toBe(requestKey({ a: [1, 2] }));
  });
  it('counts and sizes stay within the server limits', () => {
    expect(pageSizes(FULL.limits)).toEqual([25, 50, 100]);
    expect(pageSizes({ ...FULL.limits, pageSize: 50 })).toEqual([25, 50]);
    expect(conditionCount({ all: [{ field: 'a', op: 'b' }], groups: [[{ field: 'a', op: 'b' }, { field: 'a', op: 'b' }]] })).toBe(3);
    expect(asSort(FULL, 'name', 'asc')).toBeNull();
    expect(asSort(FULL, 'name', 'desc')).toEqual({ field: 'name', dir: 'desc' });
  });
});

describe('changing the filters', () => {
  const base: FilterState = { ...emptyState(50), page: 4, all: [{ field: 'age', op: 'atLeast', value: 30 }, { field: 'status', op: 'is', value: 'ACTIVE' }], groups: [[{ field: 'gender', op: 'is', value: 'MALE' }, { field: 'marital', op: 'is', value: 'MARRIED' }]] };
  it('every change that alters the list returns to page one; paging itself does not', () => {
    for (const next of [withQuery(base, 'a'), withArchived(base, true), withSort(base, { field: 'age', dir: 'asc' }), withSize(base, 25), withConditions(base, [], []), clearConditions(base), removeCondition(base, 0), removeGroup(base, 0), removeFromGroup(base, 0, 0)]) {
      expect(next.page).toBe(1);
    }
    expect(withPage(base, 6).page).toBe(6);
    expect(withPage(base, 0).page).toBe(1);
  });
  it('removes one chip without touching the rest', () => {
    expect(removeCondition(base, 0).all).toEqual([base.all[1]]);
    expect(removeCondition(base, 0).groups).toEqual(base.groups);
    expect(removeFromGroup(base, 0, 0).groups).toEqual([[base.groups[0]![1]]]);
    expect(removeFromGroup(removeFromGroup(base, 0, 0), 0, 0).groups).toEqual([]);
    expect(removeGroup(base, 0).groups).toEqual([]);
    expect(removeGroup(base, 0).all).toEqual(base.all);
    expect(clearConditions(base).all).toEqual([]);
  });
  it('the quick status list sets and clears one status condition', () => {
    expect(quickValue(base, 'status')).toBe('ACTIVE');
    expect(withQuick(base, 'status', 'VISITOR').all.filter((c) => c.field === 'status')).toEqual([{ field: 'status', op: 'is', value: 'VISITOR' }]);
    expect(withQuick(base, 'status', '').all.some((c) => c.field === 'status')).toBe(false);
    expect(quickValue({ ...base, all: [{ field: 'status', op: 'isAny', value: ['ACTIVE', 'VISITOR'] }] }, 'status')).toBe('');
  });
});

describe('state kept in the address', () => {
  const full: FilterState = {
    q: 'Eric', archived: true, page: 3, size: 25, sort: { field: 'age', dir: 'desc' },
    all: [
      { field: 'age', op: 'between', value: [30, 50] }, { field: 'baptised', op: 'isYes' }, { field: 'unit', op: 'includesAny', value: ['ou-elim', 'ou-hope'] },
      { field: 'employment', op: 'anyMatch', value: { sector: ['FINANCE'], yearsAtLeast: 5 } },
    ],
    groups: [[{ field: 'gender', op: 'is', value: 'MALE' }, { field: 'marital', op: 'isAny', value: ['MARRIED', 'WIDOWED'] }], [{ field: 'baptismDate', op: 'withinLast', value: { amount: 2, unit: 'years' } }]],
  };
  it('writes the same address for the same state, leaving defaults out', () => {
    expect(serializeFilterState(emptyState(50), defaults).toString()).toBe('');
    const a = serializeFilterState(full, defaults).toString();
    expect(a).toBe(serializeFilterState({ ...full }, defaults).toString());
    expect(a.startsWith('q=Eric&archived=1&c=')).toBe(true);
    expect(a).toContain('g1=gender%3Ais%3A%22MALE%22');
    expect(a.endsWith('&sort=age%3Adesc&size=25&page=3')).toBe(true);
    expect(serializeFilterState({ ...emptyState(50), sort: null, page: 1 }, defaults).toString()).toBe('');
  });
  it('reads back exactly what was written, ANDs and ORs in place', () => {
    const { state, dropped } = round(full);
    expect(dropped).toBe(0);
    expect(state).toEqual(full);
    expect(serializeFilterState(state, defaults).toString()).toBe(serializeFilterState(full, defaults).toString());
  });
  it('an address with nothing in it is the plain list', () => {
    expect(parseFilterState(new URLSearchParams(''), FULL)).toEqual({ state: emptyState(50), dropped: 0 });
  });
  it('malformed parts are left out and counted; the rest still works', () => {
    const sp = new URLSearchParams([
      ['c', 'age:atLeast:30'], ['c', 'age:atLeast:{broken'], ['c', 'nonsense'], ['c', 'age:atLeast:"x"'], ['c', 'status:is:"ACTIVE"'],
      ['g1', 'gender:is:"MALE"'], ['g1', 'secret:is:1'], ['g2', 'secret:is:1'], ['sort', 'age:sideways'], ['size', '7'], ['page', '-2'], ['archived', 'yes'],
    ]);
    const { state, dropped } = parseFilterState(sp, FULL);
    expect(state.all).toEqual([{ field: 'age', op: 'atLeast', value: 30 }, { field: 'status', op: 'is', value: 'ACTIVE' }]);
    expect(state.groups).toEqual([[{ field: 'gender', op: 'is', value: 'MALE' }]]);
    expect(state.sort).toBeNull();
    expect(state.size).toBe(50);
    expect(state.page).toBe(1);
    expect(state.archived).toBe(false);
    expect(dropped).toBe(9);
  });
  it('honours the limits and never throws on rubbish', () => {
    const many = new URLSearchParams();
    for (let i = 0; i < 15; i++) many.append('c', `age:atLeast:${i}`);
    expect(parseFilterState(many, FULL).state.all).toHaveLength(12);
    expect(parseFilterState(many, FULL).dropped).toBe(3);
    const groups = new URLSearchParams();
    for (let i = 1; i <= 6; i++) groups.append(`g${i}`, 'gender:is:"MALE"');
    expect(parseFilterState(groups, FULL).state.groups).toHaveLength(4);
    for (const junk of ['c=%E0%A4%A', 'c=::::', 'q=' + 'x'.repeat(500), 'page=999999999', 'g0=age:atLeast:1', 'c=__proto__:is:"x"', 'sort=__proto__:asc']) {
      expect(() => parseFilterState(new URLSearchParams(junk), FULL)).not.toThrow();
    }
    expect(parseFilterState(new URLSearchParams('q=' + 'x'.repeat(500)), FULL).state.q).toHaveLength(80);
    expect(parseFilterState(new URLSearchParams('page=999999999'), FULL).state.page).toBe(1);
    expect(parseFilterState(new URLSearchParams('sort=name:asc'), FULL).state.sort).toBeNull();
  });
  it('carries no more than the question: no ids of people, no personal details', () => {
    const text = decodeURIComponent(serializeFilterState(full, defaults).toString());
    expect(text).not.toMatch(/p-|@|\b07\d{8}\b/);
    expect(parseConditionText('age:atLeast:30')).toEqual({ field: 'age', op: 'atLeast', value: 30 });
    expect(parseConditionText('baptised:isYes')).toEqual({ field: 'baptised', op: 'isYes' });
    expect(parseConditionText('a b:is:1')).toBeNull();
  });
  it('back and forward bring back the same views (memory history)', async () => {
    const steps: FilterState[] = [
      emptyState(50),
      { ...emptyState(50), all: [{ field: 'age', op: 'atLeast', value: 30 }] },
      { ...emptyState(50), all: [{ field: 'age', op: 'atLeast', value: 30 }], groups: [[{ field: 'gender', op: 'is', value: 'MALE' }]], sort: { field: 'age', dir: 'desc' } },
      { ...emptyState(50), all: [{ field: 'age', op: 'atLeast', value: 30 }], groups: [[{ field: 'gender', op: 'is', value: 'MALE' }]], sort: { field: 'age', dir: 'desc' }, page: 2 },
    ];
    const url = (s: FilterState) => `/people?${serializeFilterState(s, defaults)}`;
    const router = createMemoryRouter([{ path: '/people', element: null }], { initialEntries: [url(steps[0]!)] });
    const seen = () => parseFilterState(new URLSearchParams(router.state.location.search), FULL).state;
    for (const s of steps.slice(1)) await router.navigate(url(s));
    expect(seen()).toEqual(steps[3]);
    await router.navigate(-1);
    expect(seen()).toEqual(steps[2]);
    await router.navigate(-2);
    expect(seen()).toEqual(steps[0]);
    await router.navigate(1);
    expect(seen()).toEqual(steps[1]);
    // a replaced entry (the typed search) does not add a step
    await router.navigate(url({ ...steps[1]!, q: 'ab' }), { replace: true });
    await router.navigate(-1);
    expect(seen()).toEqual(steps[0]);
  });
});

describe('the form draft', () => {
  it('starts each operator with the right empty value and keeps what fits when it changes', () => {
    expect(blankValue(field('age'), 'between')).toEqual({ from: '', to: '' });
    expect(blankValue(field('status'), 'isAny')).toEqual([]);
    expect(blankValue(field('baptismDate'), 'withinLast')).toEqual({ amount: '', unit: 'days' });
    expect(shapeOf(field('baptised'), 'isYes')).toBe('none');
    expect(retarget(field('status'), 'is', 'isAny', 'ACTIVE')).toEqual(['ACTIVE']);
    expect(retarget(field('status'), 'isAny', 'is', ['ACTIVE', 'VISITOR'])).toBe('ACTIVE');
    expect(retarget(field('age'), 'atLeast', 'atMost', '30')).toBe('30');
    expect(retarget(field('age'), 'atLeast', 'between', '30')).toEqual({ from: '', to: '' });
    const dc = withOp({ ...newDraftCondition(field('status')), value: 'ACTIVE' }, field('status'), 'isAny');
    expect(dc.value).toEqual(['ACTIVE']);
    expect(withField(dc, field('age'))).toMatchObject({ field: 'age', op: 'equals', value: '' });
  });
  it('says what is wrong with each row and applies nothing until all are right', () => {
    const ok = { ...newDraftCondition(field('age')), op: 'atLeast', value: '30' };
    const noValue = { ...newDraftCondition(field('name')), value: '' };
    const wrongOrder = { ...newDraftCondition(field('age')), op: 'between', value: { from: '9', to: '3' } };
    const r = checkDraft(FULL, { all: [ok, noValue], groups: [[wrongOrder]] });
    expect(r.ok).toBe(false);
    expect(r.problems[noValue.key]).toMatchObject({ code: 'required' });
    expect(r.problems[wrongOrder.key]).toMatchObject({ code: 'order' });
    expect(r.all).toEqual([{ field: 'age', op: 'atLeast', value: 30 }]); // the valid row is kept while others are fixed
    expect(checkDraft(FULL, { all: [ok], groups: [] })).toMatchObject({ ok: true, all: [{ field: 'age', op: 'atLeast', value: 30 }], groups: [] });
  });
  it('refuses more than the server allows', () => {
    const rows = Array.from({ length: 13 }, () => ({ ...newDraftCondition(field('age')), op: 'atLeast', value: '1' }));
    expect(checkDraft(FULL, { all: rows, groups: [] }).tooMany).toBe('conditions');
    const g = [{ ...newDraftCondition(field('age')), op: 'atLeast', value: '1' }];
    expect(checkDraft(FULL, { all: [], groups: [g, g, g, g, g] }).tooMany).toBe('groups');
  });
  it('shows an applied condition back in the form, then applies it unchanged', () => {
    const conds = [{ field: 'employment', op: 'anyMatch', value: { sector: ['FINANCE'], yearsAtLeast: 5 } }, { field: 'age', op: 'between', value: [30, 40] }, { field: 'baptismDate', op: 'withinNext', value: { amount: 3, unit: 'months' } }];
    const draft = draftFrom(FULL, conds, [[{ field: 'gender', op: 'is', value: 'MALE' }]]);
    expect(draft.all[1]!.value).toEqual({ from: '30', to: '40' });
    expect(draft.all[0]!.value).toEqual({ sector: ['FINANCE'], yearsAtLeast: '5' });
    const back = checkDraft(FULL, draft);
    expect(back.ok).toBe(true);
    expect(back.all).toEqual(conds);
    expect(back.groups).toEqual([[{ field: 'gender', op: 'is', value: 'MALE' }]]);
  });
});

describe('readable chips', () => {
  const labels = (): FilterLabels => ({
    t: ((key: string, p: Record<string, string | number> = {}) => {
      const tpl: Record<string, string> = { 'door.pf.chip': '{field} {op} {value}', 'door.pf.chip.bool': '{field}: {op}', 'door.pf.range': '{a} and {b}' };
      return (tpl[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(p[k]));
    }) as FilterLabels['t'],
    field: (k) => ({ age: 'Age', unit: 'Unit', baptised: 'Baptised', education: 'Education', baptismDate: 'Baptism date', name: 'Name' }[k] ?? k),
    op: (_f, o) => ({ atLeast: 'is at least', between: 'is between', includesAny: 'includes any of', isYes: 'Yes', anyMatch: 'has one where', contains: 'contains', withinLast: 'was within the last' }[o] ?? o),
    part: (_f, p) => ({ levelAtLeast: 'Level at least', field: 'Field of study contains' }[p] ?? p),
    choice: (v) => ({ BACHELOR: 'Bachelor’s Degree' }[v] ?? v), unit: (id) => ({ 'ou-elim': 'Elim', 'ou-hope': 'Hope' }[id] ?? id), day: (d) => d, sentence: () => '',
  });
  const tn = (key: string, n: number) => `${n} ${key.endsWith('years') ? 'years' : 'x'}`;
  it('says each condition in a line', () => {
    const l = labels();
    expect(sentenceOf(field('age'), { field: 'age', op: 'atLeast', value: 30 }, l, tn)).toBe('Age is at least 30');
    expect(sentenceOf(field('age'), { field: 'age', op: 'between', value: [30, 40] }, l, tn)).toBe('Age is between 30 and 40');
    expect(sentenceOf(field('baptised'), { field: 'baptised', op: 'isYes' }, l, tn)).toBe('Baptised: Yes');
    expect(sentenceOf(field('unit'), { field: 'unit', op: 'includesAny', value: ['ou-elim', 'ou-hope'] }, l, tn)).toBe('Unit includes any of Elim, Hope');
    expect(sentenceOf(field('name'), { field: 'name', op: 'contains', value: 'Eric' }, l, tn)).toBe('Name contains “Eric”');
    expect(sentenceOf(field('education'), { field: 'education', op: 'anyMatch', value: { levelAtLeast: 'BACHELOR', field: 'law' } }, l, tn)).toBe('Education has one where Level at least: Bachelor’s Degree; Field of study contains: law');
    expect(sentenceOf(field('baptismDate'), { field: 'baptismDate', op: 'withinLast', value: { amount: 2, unit: 'years' } }, l, tn)).toBe('Baptism date was within the last 2 years');
  });
});

describe('views kept from the first version', () => {
  it('turns the old criteria into grouped-search conditions, keeping one work record and one study record', () => {
    expect(criteriaToConditions({ unitIds: ['ou-elim'], gender: 'MALE', ageMin: 30, ageMax: 50, baptismYearsMin: 10, sector: ['FINANCE'], employedYearsMin: 5, educationMin: 'BACHELOR', educationField: 'law', childrenMin: 2, marital: ['MARRIED'], callingName: 'Bass' })).toEqual([
      { field: 'unit', op: 'includesAny', value: ['ou-elim'] }, { field: 'gender', op: 'is', value: 'MALE' }, { field: 'age', op: 'between', value: [30, 50] },
      { field: 'baptismYears', op: 'atLeast', value: 10 }, { field: 'employment', op: 'anyMatch', value: { sector: ['FINANCE'], yearsAtLeast: 5 } },
      { field: 'education', op: 'anyMatch', value: { levelAtLeast: 'BACHELOR', field: 'law' } }, { field: 'childCount', op: 'atLeast', value: 2 },
      { field: 'marital', op: 'is', value: 'MARRIED' }, { field: 'calling', op: 'anyMatch', value: { name: 'Bass' } },
    ]);
  });
  it('an old view becomes the address it stands for, and what no longer applies is left out when it is opened', () => {
    const q = legacyViewQuery({ name: 'Men', q: 'Eric', status: 'ACTIVE', archived: false, filters: [{ kind: 'gender', values: { gender: 'MALE' } }, { kind: 'age', values: { min: '30' } }, { kind: 'nope', values: {} }] });
    const { state, dropped } = parseFilterState(new URLSearchParams(q), FULL);
    expect(state.q).toBe('Eric');
    expect(state.all).toEqual([{ field: 'status', op: 'is', value: 'ACTIVE' }, { field: 'gender', op: 'is', value: 'MALE' }, { field: 'age', op: 'atLeast', value: 30 }]);
    expect(dropped).toBe(0);
    expect(parseFilterState(new URLSearchParams(q), LIMITED).state.all).toEqual([{ field: 'status', op: 'is', value: 'ACTIVE' }]);
  });
});
