import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../api/frontDoorApi';
import { phaseOf, planActions, planErrorKey, sortPlans, stepIndex } from './plans';

const flags = { canSubmit: false, canWithdraw: false, canReopen: false, canStart: false, canClose: false };

describe('plan helpers', () => {
  it('puts the six steps in two phases', () => {
    expect(['DRAFT', 'PENDING_APPROVAL', 'SETUP'].map((s) => phaseOf(s as never))).toEqual(['planning', 'planning', 'planning']);
    expect(['RUNNING', 'CLOSING', 'ENDED'].map((s) => phaseOf(s as never))).toEqual(['execution', 'execution', 'execution']);
    expect(phaseOf('CANCELLED')).toBe('cancelled');
    expect(stepIndex('CLOSING')).toBe(4);
  });
  it('offers only the next steps a person may take', () => {
    expect(planActions(flags)).toEqual([]);
    expect(planActions({ ...flags, canSubmit: true })).toEqual(['submit']);
    expect(planActions({ ...flags, canStart: true, canReopen: true })).toEqual(['start', 'reopen']);
    expect(planActions({ ...flags, canClose: true })).toEqual(['close']);
  });
  it('sorts open plans by step, then closed ones', () => {
    const p = (id: string, status: string) => ({ id, title: id, status }) as PlanItem;
    expect(sortPlans([p('e', 'ENDED'), p('r', 'RUNNING'), p('d', 'DRAFT'), p('c', 'CANCELLED')]).map((x) => x.id)).toEqual(['d', 'r', 'e', 'c']);
  });
  it('maps error codes to messages', () => {
    expect(planErrorKey('CHECKLIST_OPEN')).toBe('door.plan.err.checklistOpen');
    expect(planErrorKey('??')).toBe('door.people.actionFailed');
  });
});
