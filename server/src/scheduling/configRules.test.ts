/**
 * Rule API tests. They drive `saveConfigChange` (the single write path every /config/rules route calls) against
 * an in-memory stand-in for Prisma, so no database is needed.
 * TODO(confirm): if the repo already has a shared `fakePrisma`, swap `fake` below for it; only the delegates
 * named in `MODELS` are used.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  audits: [] as any[],
  lock: { held: true, holder: null as null | { personId: string; name: string | null; since: string; expiresAt: string } },
}));

vi.mock('../lib/prisma.js', () => {
  const match = (row: any, where: any = {}) => Object.entries(where).every(([k, v]) => v === undefined || (typeof v === 'object' && v !== null ? true : row[k] === v));
  const delegate = (name: string) => ({
    findMany: async ({ where }: any = {}) => h.tables[name].filter((r) => match(r, where)).map((r) => ({ ...r })),
    create: async ({ data }: any) => { h.tables[name].push({ ...data }); return data; },
    update: async ({ where, data }: any) => { Object.assign(h.tables[name].find((r) => r.id === where.id), data); },
    delete: async ({ where }: any) => { h.tables[name].splice(h.tables[name].findIndex((r) => r.id === where.id), 1); },
    updateMany: async () => ({ count: 1 }),
  });
  const models = ['schedulingService', 'choirCategory', 'categoryServicePolicy', 'choirCategoryLink', 'musicFixedAssignment', 'musicChoir', 'musicChoirUnavailability', 'configEditLock'];
  const prisma: any = Object.fromEntries(models.map((m) => [m, delegate(m)]));
  prisma.auditEvent = { create: async ({ data }: any) => { h.audits.push(data); } };
  prisma.$transaction = async (fn: any) => {
    const snapshot = JSON.stringify(h.tables), auditCount = h.audits.length;
    try { return await fn(prisma); } catch (error) {
      h.tables = JSON.parse(snapshot, (_k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) ? new Date(v) : v));
      h.audits.length = auditCount; throw error;
    }
  };
  return { prisma };
});
vi.mock('../notifications/feed.js', () => ({ loadAccessData: async () => ({ data: {} }) }));
vi.mock('./rules.js', () => ({ canWriteConfig: () => true, canReadConfig: () => true }));
vi.mock('./editLock.js', () => ({ LOCK_TTL_MS: 900_000, checkEditLock: async () => h.lock }));
vi.mock('../music/engine.js', () => ({ buildMusicCalendar: () => [] }));

import { ConfigError, readRuleModel, saveConfigChange, type ConfigOp } from './saveConfigChange.js';

const NOW = new Date('2026-01-01T00:00:00Z');
const stamp = { createdByPersonId: 'p-admin', createdAt: NOW, systemId: 'sys-music' };
const service = (id: string, code: string, name: string, weekday: number, order: number) => ({
  ...stamp, id, code, name, kind: 'SERVICE', weekday, time: null, recurrence: 'WEEKLY', selectedDatesJson: '[]', active: true,
  musicRequired: true, protocolRequired: true, maxChoirs: 3, targetTeamSize: 10, displayOrder: order,
});
const category = (id: string, code: string, name: string, active = true) => ({ ...stamp, id, code, name, description: '', active });
const policy = (id: string, categoryId: string, serviceId: string) => ({
  ...stamp, id, categoryId, serviceId, active: true, eligible: false, frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS',
  frequencyKind: 'TARGET', frequencyPeriod: null, planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
});
const link = (id: string, choirId: string, categoryId: string) => ({ ...stamp, id, choirId, categoryId, active: true, eligibleOverrideJson: '{}', frequencyOverrideJson: '{}' });

function seed(opts: { primaryActive?: boolean } = {}) {
  h.audits.length = 0;
  h.lock.held = true; h.lock.holder = null;
  h.tables = {
    schedulingService: [service('s1', 'SS1', 'Sunday 1st', 0, 1), service('s2', 'SS2', 'Sunday 2nd', 0, 2)],
    choirCategory: [category('worship', 'WORSHIP', 'Worship'), category('primary', 'PRIMARY', 'Primary', opts.primaryActive ?? true)],
    choirCategoryLink: [link('l1', 'w1', 'worship'), link('l2', 'w2', 'worship'), link('l3', 'p1', 'primary'), link('l4', 'p2', 'primary'), link('l5', 'p3', 'primary')],
    categoryServicePolicy: [policy('pw1', 'worship', 's1'), policy('pw2', 'worship', 's2'), policy('pp1', 'primary', 's1'), policy('pp2', 'primary', 's2')],
    musicFixedAssignment: [],
    musicChoir: ['w1', 'w2', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id.toUpperCase(), active: true })),
    musicChoirUnavailability: [],
    configEditLock: [],
  };
}
const save = (...ops: ConfigOp[]) => saveConfigChange('sys-music', 'p-admin', { ops });
const refused = async (promise: Promise<unknown>) => { try { await promise; } catch (e) { if (e instanceof ConfigError) return e; throw e; } throw new Error('expected a refusal'); };
const fixedRows = () => h.tables.musicFixedAssignment.map((f) => `${f.choirId}@${f.categoryServicePolicyId}`).sort();

beforeEach(() => seed());

describe('POST /config/rules runs the full validator', () => {
  it('an inactive category is refused with 422 and the specific error', async () => {
    seed({ primaryActive: false });
    const error = await refused(save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION' } }));
    expect(error.status).toBe(422);
    expect(error.body.errors).toEqual(['Primary is not active, so it cannot have rules. Activate the category first.']);
    expect(h.audits).toHaveLength(0);
  });

  it('a rule the generator would reject gets the same 422 error list the table edit gets', async () => {
    // Primary has 3 linked choirs; asking for at least 4 per Sunday cannot be met.
    const viaRule = await refused(save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION', minCount: 4, maxCount: 4 } }));
    seed();
    const viaTable = await refused(save({ op: 'policy.update', id: 'pp1', patch: { eligible: true, planningMode: 'ROTATION', minCount: 4, maxCount: 4 } }));
    expect(viaRule.status).toBe(422);
    expect(viaRule.body.errors).toEqual(viaTable.body.errors);
    expect(viaRule.body.errors).toContain('The minimum for SS1 is greater than the number of eligible linked choirs.');
  });
});

describe('round trips', () => {
  const fixedRule = (choirId: string, scope: string[]): ConfigOp => ({ op: 'musicRule.create', data: { scope, target: { kind: 'choir', choirId }, arrangement: 'FIXED' } });

  it('a policy with 2 fixed choirs is 2 choir rules sharing sharedPolicyId; PATCH touches only that choir', async () => {
    await save(fixedRule('w1', ['s1']));
    await save(fixedRule('w2', ['s1']));
    let { rules } = await readRuleModel();
    const choirRules = rules.filter((r) => r.target.kind === 'choir');
    expect(choirRules).toHaveLength(2);
    expect(choirRules[0]!.sharedPolicyId).toBe(choirRules[1]!.sharedPolicyId);
    expect(rules.filter((r) => r.target.kind === 'category')).toHaveLength(0); // FIXED policy: choir rules only
    expect(fixedRows()).toEqual(['w1@pw1', 'w2@pw1']);

    const w1Row = h.tables.musicFixedAssignment.find((f) => f.choirId === 'w1')!;
    const w2 = choirRules.find((r) => r.target.kind === 'choir' && r.target.choirId === 'w2')!;
    await save({ op: 'musicRule.update', id: w2.id, patch: { scope: ['s1', 's2'] } });

    expect(fixedRows()).toEqual(['w1@pw1', 'w2@pw1', 'w2@pw2']);
    expect(h.tables.musicFixedAssignment.find((f) => f.choirId === 'w1')).toEqual(w1Row); // w1's row is the same row
    ({ rules } = await readRuleModel());
    const after = rules.filter((r) => r.target.kind === 'choir');
    expect(after.find((r) => r.target.kind === 'choir' && r.target.choirId === 'w1')!.scope).toEqual(['s1']);
    expect(after.find((r) => r.target.kind === 'choir' && r.target.choirId === 'w2')!.scope).toEqual(['s1', 's2']);
  });

  it('deleting the last fixed choir returns the policy to "no rule"', async () => {
    await save(fixedRule('w1', ['s1']));
    const [rule] = (await readRuleModel()).rules;
    await save({ op: 'musicRule.delete', id: rule!.id });
    expect(fixedRows()).toEqual([]);
    expect((await readRuleModel()).rules).toEqual([]);
    const row = h.tables.categoryServicePolicy.find((p) => p.id === 'pw1')!;
    expect(row).toMatchObject({ eligible: false, planningMode: 'ROTATION' });
  });

  it('a category rule with 2 exceptions comes back intact, and one rule covers both services', async () => {
    const exceptions = [
      { choirId: 'p1', eligible: false },
      { choirId: 'p2', frequency: { target: 1 } },
    ];
    await save({ op: 'musicRule.create', data: {
      scope: ['s1', 's2'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION',
      minCount: 0, maxCount: 1, frequency: { kind: 'MINIMUM', target: 2, period: 'MONTH', counting: 'ASSIGNMENTS' }, exceptions,
    } });
    const { rules } = await readRuleModel();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      scope: ['s1', 's2'], arrangement: 'ROTATION', minCount: 0, maxCount: 1,
      frequency: { kind: 'MINIMUM', target: 2, period: 'MONTH', counting: 'ASSIGNMENTS' },
    });
    expect(rules[0]!.exceptions).toEqual(exceptions);
    // and the engine still reads the old tables
    expect(JSON.parse(h.tables.choirCategoryLink.find((l) => l.id === 'l3')!.eligibleOverrideJson)).toEqual({ SS1: false, SS2: false });
  });

  it('implied default policies are not shown as rules', async () => {
    expect((await readRuleModel()).rules).toEqual([]);
  });
});

describe('guards', () => {
  it('a save without the edit lock is 409 LOCKED, writes nothing and audits nothing', async () => {
    h.lock.held = false;
    h.lock.holder = { personId: 'p-other', name: 'Alice', since: NOW.toISOString(), expiresAt: NOW.toISOString() };
    const before = JSON.stringify(h.tables);
    const error = await refused(save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION' } }));
    expect(error.status).toBe(409);
    expect(error.body).toMatchObject({ error: 'LOCKED', code: 'LOCKED' });
    expect((error.body.holder as { name: string }).name).toBe('Alice');
    expect(JSON.stringify(h.tables)).toBe(before);
    expect(h.audits).toHaveLength(0);
  });

  it('DELETE also needs the lock', async () => {
    await save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'MANUAL' } });
    const [rule] = (await readRuleModel()).rules;
    h.lock.held = false;
    const error = await refused(save({ op: 'musicRule.delete', id: rule!.id }));
    expect(error.status).toBe(409);
  });

  it('a choir moves category and drops its exceptions; a fixed choir cannot move', async () => {
    await save({ op: 'choir.setCategory', choirId: 'p3', categoryId: 'worship' });
    expect(h.tables.choirCategoryLink.find((l) => l.choirId === 'p3')!.categoryId).toBe('worship');
    await save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'choir', choirId: 'w1' }, arrangement: 'FIXED' } });
    const error = await refused(save({ op: 'choir.setCategory', choirId: 'w1', categoryId: 'primary' }));
    expect(error.status).toBe(409);
    expect(error.body.code).toBe('CHOIR_HAS_FIXED_RULES');
  });

  it('audit entries are the existing table-level actions', async () => {
    await save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION' } });
    expect(h.audits.map((a) => a.action)).toEqual(['POLICY_UPDATED']);
    expect(h.audits[0]).toMatchObject({ resource: 'SCHEDULING', systemId: 'sys-music' });
  });
});
