import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../api/frontDoorApi';
import { dueToInput, inputToDue, sortWork, workActions, workErrorKey } from './work';

const w = (o: Partial<WorkItem>): WorkItem => ({ id: 'a', title: 'A', status: 'TODO', dueDate: null, canMove: true, canManage: false, ...o }) as WorkItem;

describe('work helpers', () => {
  it('offers only the steps a person may take', () => {
    expect(workActions(w({ status: 'TODO' }))).toEqual(['start', 'done', 'cancel']);
    expect(workActions(w({ status: 'IN_PROGRESS' }))).toEqual(['done', 'back', 'cancel']);
    expect(workActions(w({ status: 'DONE' }))).toEqual([]);
    expect(workActions(w({ status: 'DONE', canManage: true }))).toEqual(['reopen']);
    expect(workActions(w({ status: 'TODO', canMove: false }))).toEqual([]);
  });
  it('sorts open work by due date, undated last, closed work after', () => {
    const list = [
      w({ id: '1', title: 'Closed', status: 'DONE', dueDate: '2026-01-01T00:00:00Z' }),
      w({ id: '2', title: 'Undated' }),
      w({ id: '3', title: 'Later', dueDate: '2026-12-01T00:00:00Z' }),
      w({ id: '4', title: 'Sooner', dueDate: '2026-11-01T00:00:00Z' }),
    ];
    expect(sortWork(list).map((x) => x.id)).toEqual(['4', '3', '2', '1']);
  });
  it('reads due days in church time both ways', () => {
    expect(inputToDue('2026-11-05')).toBe('2026-11-05T21:59:00.000Z');
    expect(dueToInput('2026-11-05T21:59:00.000Z')).toBe('2026-11-05');
    expect(inputToDue('')).toBeNull();
  });
  it('maps error codes to messages', () => {
    expect(workErrorKey('DONE_LOCKED')).toBe('door.work.err.doneLocked');
    expect(workErrorKey('??')).toBe('door.people.actionFailed');
  });
});
