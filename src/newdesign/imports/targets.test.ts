import { describe, expect, it } from 'vitest';
import { checkAll, mapHeaders, parseCsv, toRecords } from './engine';
import { TARGETS, isTargetKey, groupMembersTarget, moneyEntriesTarget, planItemsTarget, protocolRosterTarget, tasksTarget } from './targets';

const people = [
  { id: 'p1', fullName: 'Aline Mukamana', memberCode: 'M-00001', phone: '0788111222' },
  { id: 'p2', fullName: 'Sam Habimana', memberCode: 'M-00002' },
];

function run<R, C>(target: { fields: any; judge: (v: Record<string, string>, c: C) => any; same: (r: R) => string }, csv: string, ctx: C) { // oxlint-disable-line no-explicit-any
  const table = parseCsv(csv);
  const recs = toRecords(table, mapHeaders(table[0]!, target.fields));
  return checkAll(recs, (v) => target.judge(v, ctx), target.same as (r: unknown) => string);
}

describe('import targets', () => {
  it('knows every target by key', () => {
    expect(Object.keys(TARGETS)).toHaveLength(11);
    expect(isTargetKey('tasks')).toBe(true);
    expect(isTargetKey('nope')).toBe(false);
  });

  it('plan activities: a category is required and must be a spending line of that year’s budget', () => {
    const ctx = { categories: ['SUPPLIES', 'AID'], existing: new Set<string>(), lines: new Map([[2026, ['SUPPLIES']]]) };
    const out = run(planItemsTarget, 'Title,Estimated cost,Category,Year\nChairs,5000,SUPPLIES,2026\nNo line,100,,2026\nWrong line,100,AID,2026\nNo budget year,100,SUPPLIES,2027', ctx);
    expect(out.map((r) => r.state)).toEqual(['OK', 'ERROR', 'ERROR', 'ERROR']);
    expect(out[1]!.issue).toMatchObject({ code: 'required', field: 'Category' });
    expect(out[2]!.issue).toMatchObject({ code: 'badChoice', field: 'Category' });
    expect(out[0]!.row).toMatchObject({ category: 'SUPPLIES' });
  });

  it('tasks: resolves the owner, needs a unit when there are several, skips what exists, explains the rest', () => {
    const ctx = { people, units: [{ id: 'u1', name: 'Youth' }, { id: 'u2', name: 'Choir' }], existing: new Set(['u1|old task']) };
    const out = run(tasksTarget, 'Title,Owner,Due date,Unit\nNew task,M-00001,2026-11-15,Youth\nOld task,Aline Mukamana,,Youth\nNo unit,M-00001,,\nBad date,M-00001,31/02/2026,Youth\nGhost,Nobody,,Youth', ctx);
    expect(out.map((r) => r.state)).toEqual(['OK', 'DUPLICATE', 'ERROR', 'ERROR', 'ERROR']);
    expect(out[2]!.issue).toMatchObject({ code: 'required', field: 'Unit' });
    expect(out[3]!.issue).toMatchObject({ code: 'badDate' });
    expect(out[4]!.issue).toMatchObject({ code: 'notFound', field: 'Owner' });
    expect(out[0]!.row).toMatchObject({ unitId: 'u1', ownerId: 'p1', dueDate: '2026-11-15' });
  });

  it('money entries: only known accounts and categories, whole francs, and a repeat is skipped', () => {
    const ctx = { accounts: [{ id: 'a1', name: 'Main account' }], categories: ['OFFERING', 'RENT'], existing: new Set(['a1|income|5000|2026-10-04|offering']) };
    const out = run(moneyEntriesTarget, 'Account,Kind,Amount,Date,Category\nMain account,income,"12,500",04/10/2026,offering\nMain account,income,5000,2026-10-04,OFFERING\nMain account,spending,12.5,2026-10-04,RENT\nOther,income,100,2026-10-04,RENT\nMain account,gift,100,2026-10-04,RENT\nMain account,income,100,2026-10-04,TAXES', ctx);
    expect(out.map((r) => r.state)).toEqual(['OK', 'DUPLICATE', 'ERROR', 'ERROR', 'ERROR', 'ERROR']);
    expect(out[0]!.row).toMatchObject({ amount: 12500, occurredOn: '2026-10-04', category: 'OFFERING' });
    expect(out.slice(2).map((r) => r.issue?.code)).toEqual(['badNumber', 'notFound', 'badChoice', 'badChoice']);
  });

  it('group members: matches the group and the person, skips people already in it', () => {
    const ctx = { people, containers: [{ id: 'g1', name: 'Sunday school 1' }], members: new Map([['g1', new Set(['p2'])]]) };
    const out = run(groupMembersTarget, 'Group,Person\nSunday school 1,M-00001\nSunday school 1,Sam Habimana\nSunday school 9,M-00001\nSunday school 1,M-00001', ctx);
    expect(out.map((r) => r.state)).toEqual(['OK', 'DUPLICATE', 'ERROR', 'DUPLICATE']);
  });

  it('Protocol roster: office and days have defaults and accept local words', () => {
    const ctx = { people, onRoster: new Set<string>() };
    const out = run(protocolRosterTarget, 'Person,Office,Serves on\nM-00001,,\nM-00002,secrétaire,mardi\nM-00001,king,both', ctx);
    expect(out[0]!.row).toMatchObject({ office: 'MEMBER', serveDays: 'BOTH' });
    expect(out[1]!.row).toMatchObject({ office: 'SECRETARY', serveDays: 'TUESDAY' });
    expect(out[2]!.issue).toMatchObject({ code: 'badChoice', field: 'Office' });
  });
});
