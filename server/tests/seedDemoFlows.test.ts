import { beforeEach, describe, expect, it } from 'vitest';
import { createFakePrisma } from './fakePrisma';
import { seedDemoFlows } from '../prisma/seedDemoFlows';

const fake = createFakePrisma();
const db = fake.__db;

beforeEach(() => {
  fake.__reset();
  for (const k of ['person', 'orgUnit', 'membership', 'position', 'musicChoir', 'musicChoirMember', 'protocolRoster', 'moneyAccount', 'moneyBudget', 'moneyBudgetLine', 'moneyEntry', 'moneyPlanItem', 'workPlan', 'workPlanCheck', 'workPlanNote', 'reportSchedule', 'unitGroup', 'groupSession']) db[k] ??= [];
  for (const id of ['p-youth-leader', 'p-youth-treas', 'p-youth-sec', 'p-music-leader', 'p-music-treas', 'p-music-sec', 'p-women-leader', 'p-women-treas', 'p-women-sec', 'p-a', 'p-b', 'p-proto-boss']) db.person.push({ id, fullName: id, status: 'ACTIVE' });
  db.orgUnit.push({ id: 'ou-choir-ijwi', name: "Ijwi ry' umwami Yesu" }, { id: 'ou-choir-elim', name: 'Elim' }, { id: 'ou-choir-hope', name: 'Hope' });
  db.membership.push(
    { id: 'm1', personId: 'p-a', type: 'CHOIR_MEMBER', orgUnitId: 'ou-choir-elim', status: 'ACTIVE' },
    { id: 'm2', personId: 'p-b', type: 'PROTOCOL_MEMBER', orgUnitId: 'ou-protocol', status: 'ACTIVE' },
  );
  db.position.push({ personId: 'p-proto-boss', title: 'Protocol President', orgUnitId: 'ou-protocol' });
});

describe('demo flows seed', () => {
  it('adds choirs, members, the protocol roster and a full money-and-work year', async () => {
    const r = await seedDemoFlows(fake as never);
    expect(r.scheduling.choirs).toBe(7);
    expect(db.musicChoir.map((c: { role: string }) => c.role).sort()).toEqual(['CHILDREN', 'PRIMARY', 'PRIMARY', 'PRIMARY', 'SECONDARY', 'SECONDARY', 'SECONDARY']);
    expect(db.musicChoirMember).toHaveLength(1);
    expect(db.protocolRoster.map((p: { personId: string; office: string }) => [p.personId, p.office]).sort()).toEqual([['p-b', 'MEMBER'], ['p-proto-boss', 'PRESIDENT']]);
    expect(r.money.ministries).toBe(3);
    expect(db.workPlan).toHaveLength(15);
    expect(new Set(db.workPlan.filter((p: { systemId: string }) => p.systemId === 'sys-youth').map((p: { status: string }) => p.status))).toEqual(new Set(['RUNNING', 'SETUP', 'ENDED', 'PENDING_APPROVAL', 'DRAFT']));
    expect(db.moneyEntry.some((e: { status: string }) => e.status === 'PENDING_APPROVAL')).toBe(true);
    expect(db.moneyEntry.some((e: { planId: string | null }) => !!e.planId)).toBe(true);
    expect(db.moneyPlanItem.every((i: { planId: string | null }) => i.planId === null || db.workPlan.some((p: { id: string }) => p.id === i.planId))).toBe(true);
    expect(db.moneyEntry.every((e: { category: string }) => !['TITHE', 'OFFERING'].includes(e.category))).toBe(true);
  });
  it('changes nothing when run again, and leaves a choir the church already has', async () => {
    db.musicChoir.push({ id: 'mine', name: 'Elim', role: 'PRIMARY', active: true });
    await seedDemoFlows(fake as never);
    const counts = Object.fromEntries(Object.keys(db).map((k) => [k, db[k].length]));
    await seedDemoFlows(fake as never);
    expect(Object.fromEntries(Object.keys(db).map((k) => [k, db[k].length]))).toEqual(counts);
    expect(db.musicChoir.filter((c: { name: string }) => c.name === 'Elim')).toHaveLength(1);
  });
});
