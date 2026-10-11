import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../api/frontDoorApi';
import { actionKey, needsApproval, phaseOf, planActions, planErrorKey, sortPlans, stagesOf, stateTone, stepIndex } from './plans';

const flags = { canSubmit: false, canWithdraw: false, canReopen: false, canStart: false, canClose: false, canPause: false, canResume: false, canRenew: false };

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
  it('offers pause, resume and renew', () => {
    expect(planActions({ ...flags, canPause: true })).toContain('pause');
    expect(planActions({ ...flags, canResume: true })).toContain('resume');
    expect(planActions({ ...flags, canRenew: true })).toContain('renew');
  });
  it('needs the Church Leader for every kind of activity', () => {
    expect(needsApproval('EVENT', false)).toBe(true);
    expect(needsApproval('EVENT', true)).toBe(true);
    expect(needsApproval('PROJECT', false)).toBe(true);
    expect(needsApproval('PROGRAM', false)).toBe(true);
  });
  it('words the states and the new errors', () => {
    expect(stateTone('WAITING')).toBe('warn');
    expect(stateTone('DONE')).toBe('success');
    expect(stateTone('CANCELLED')).toBe('danger');
    expect(planErrorKey('BAD_REPEAT')).toBe('door.when.err.repeat');
    expect(planErrorKey('BAD_TIME')).toBe('door.when.err.time');
    expect(planErrorKey('DATE_REQUIRED')).toBe('door.when.err.date');
  });
  it('has stages per type', () => {
    expect(stagesOf('EVENT', 'DRAFT').length).toBe(6);
    expect(stagesOf('PROJECT', 'DRAFT').length).toBe(7);
    expect(stagesOf('PROGRAM', 'DRAFT').length).toBe(8);
    expect(typeof actionKey('submit', 'EVENT', false)).toBe('string');
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
