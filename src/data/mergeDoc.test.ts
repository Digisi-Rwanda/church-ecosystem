import { describe, expect, it } from 'vitest';
import { merge3 } from './mergeDoc';

describe('merge3', () => {
  const base = {
    drafts: [
      { id: 'a', label: 'A', status: 'DRAFT' },
      { id: 'b', label: 'B', status: 'DRAFT' },
    ],
    note: 'x',
  };

  it('keeps edits to different rows from both sides', () => {
    const local = { ...base, drafts: [{ ...base.drafts[0], label: 'A2' }, base.drafts[1]] };
    const remote = { ...base, drafts: [base.drafts[0], { ...base.drafts[1], status: 'CONFIRMED' }] };
    const r = merge3(base, local, remote);
    expect(r.conflicts).toBe(0);
    expect(r.value).toEqual({
      drafts: [
        { id: 'a', label: 'A2', status: 'DRAFT' },
        { id: 'b', label: 'B', status: 'CONFIRMED' },
      ],
      note: 'x',
    });
  });

  it('merges different fields of the same row', () => {
    const local = { ...base, drafts: [{ ...base.drafts[0], label: 'A2' }, base.drafts[1]] };
    const remote = { ...base, drafts: [{ ...base.drafts[0], status: 'CONFIRMED' }, base.drafts[1]] };
    const r = merge3(base, local, remote);
    expect(r.conflicts).toBe(0);
    expect((r.value as typeof base).drafts[0]).toEqual({ id: 'a', label: 'A2', status: 'CONFIRMED' });
  });

  it('keeps rows added on both sides', () => {
    const local = { ...base, drafts: [...base.drafts, { id: 'c', label: 'C', status: 'DRAFT' }] };
    const remote = { ...base, drafts: [...base.drafts, { id: 'd', label: 'D', status: 'DRAFT' }] };
    const r = merge3(base, local, remote);
    expect(r.conflicts).toBe(0);
    expect((r.value as typeof base).drafts.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('honours a delete when the other side did not touch the row', () => {
    const local = { ...base, drafts: [base.drafts[0]] };
    const remote = { ...base, note: 'y' };
    const r = merge3(base, local, remote);
    expect(r.conflicts).toBe(0);
    expect(r.value).toEqual({ drafts: [base.drafts[0]], note: 'y' });
  });

  it('counts a conflict and lets the server win when both edit the same value', () => {
    const local = { ...base, drafts: [{ ...base.drafts[0], label: 'mine' }, base.drafts[1]] };
    const remote = { ...base, drafts: [{ ...base.drafts[0], label: 'theirs' }, base.drafts[1]] };
    const r = merge3(base, local, remote);
    expect(r.conflicts).toBe(1);
    expect((r.value as typeof base).drafts[0].label).toBe('theirs');
  });

  it('keeps an edited row when the other side deleted it, and flags it', () => {
    const local = { ...base, drafts: [{ ...base.drafts[0], label: 'edited' }, base.drafts[1]] };
    const remote = { ...base, drafts: [base.drafts[1]] };
    const r = merge3(base, local, remote);
    expect(r.conflicts).toBe(1);
    expect((r.value as typeof base).drafts.map((x) => x.label)).toContain('edited');
  });
});
