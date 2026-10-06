import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../api/frontDoorApi';
import { buildMenu, firstBlock, isSharedBlock, lettersFor } from './menu';

const none: Capabilities['systems'][number]['blocks'] = {
  home: [],
  people: [],
  work: [],
  schedule: [],
  money: [],
  reports: [],
};

const caps: Capabilities = {
  personId: 'p1',
  offices: [],
  blockOrder: ['home', 'people', 'work', 'schedule', 'money', 'reports'],
  systems: [
    { id: 'sys-main', blocks: { ...none, home: ['R'] } },
    { id: 'sys-choir', blocks: { ...none, home: ['R'], people: ['R', 'W'], work: ['R', 'W', 'A'] } },
  ],
};

describe('menu from capabilities', () => {
  it('shows only the blocks the person holds a letter in, in the server order', () => {
    expect(buildMenu(caps, 'sys-choir').map((m) => m.block)).toEqual(['home', 'people', 'work']);
    expect(buildMenu(caps, 'sys-main').map((m) => m.block)).toEqual(['home']);
  });
  it('shows nothing for a system the person may not enter', () => {
    expect(buildMenu(caps, 'sys-deacon')).toEqual([]);
    expect(lettersFor(caps, 'sys-deacon', 'work')).toEqual([]);
  });
  it('shows nothing before the capabilities have loaded', () => {
    expect(buildMenu(null, 'sys-main')).toEqual([]);
  });
  it('carries the letters through so a block can say what the person may do', () => {
    expect(lettersFor(caps, 'sys-choir', 'work')).toEqual(['R', 'W', 'A']);
  });
  it('lands on home when it exists, otherwise on the first block held', () => {
    expect(firstBlock(buildMenu(caps, 'sys-choir'))).toBe('home');
    expect(firstBlock([{ block: 'work', letters: ['R'] }])).toBe('work');
    expect(firstBlock([])).toBeNull();
  });
  it('knows which words are blocks', () => {
    expect(isSharedBlock('money')).toBe(true);
    expect(isSharedBlock('people-tables')).toBe(false);
    expect(isSharedBlock(undefined)).toBe(false);
  });
});
