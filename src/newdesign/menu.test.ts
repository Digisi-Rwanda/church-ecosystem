import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../api/frontDoorApi';
import { buildMenu, buildPortalNav, firstBlock, isPortalBlock, isSharedBlock, lettersFor, systemsWithBlock } from './menu';

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

describe('Portal bar', () => {
  it('always has Systems first, Announcements last and Notifications before it', () => {
    const keys = buildPortalNav(caps).map((i) => i.key);
    expect(keys[0]).toBe('systems');
    expect(keys[keys.length - 1]).toBe('announcements');
    expect(buildPortalNav(null).map((i) => i.key)).toEqual(['systems', 'notifications', 'announcements']);
  });
  it('offers a block only when the person holds a letter in it somewhere', () => {
    expect(buildPortalNav(caps).map((i) => i.key)).toEqual(['systems', 'work', 'people', 'notifications', 'announcements']);
  });
  it('never puts Money or Home on the Portal bar', () => {
    const rich: Capabilities = { ...caps, systems: [{ id: 'sys-x', blocks: { home: ['R'], people: ['R'], work: ['R'], schedule: ['R'], money: ['V'], reports: ['R'] } }] };
    const keys = buildPortalNav(rich).map((i) => i.key);
    expect(keys).toEqual(['systems', 'work', 'people', 'schedule', 'reports', 'notifications', 'announcements']);
    expect(isPortalBlock('money')).toBe(false);
    expect(isPortalBlock('work')).toBe(true);
  });
  it('lists only the systems the person may enter that hold the block', () => {
    const portal = [{ id: 'sys-main' }, { id: 'sys-choir' }];
    expect(systemsWithBlock(caps, portal, 'work')).toEqual([{ systemId: 'sys-choir', letters: ['R', 'W', 'A'] }]);
    expect(systemsWithBlock(caps, [{ id: 'sys-main' }], 'work')).toEqual([]);
    expect(systemsWithBlock(null, portal, 'work')).toEqual([]);
  });
});

describe('buildModules', () => {
  const caps = {
    blockOrder: ['home', 'people', 'work', 'schedule', 'money', 'reports'],
    systems: [
      {
        id: 'sys-a',
        blocks: { ...none, home: ['R'], work: ['R'], schedule: ['R'] },
        own: [
          { key: 'roster', letters: ['R'] },
          { key: 'groups', letters: [] },
        ],
      },
    ],
  } as unknown as Capabilities;

  it('groups what the person can open and drops the rest completely', async () => {
    const { buildModules, canSeeBlock, activeModule } = await import('./menu');
    const mods = buildModules(caps, 'sys-a');
    expect(mods.map((m) => m.id)).toEqual(['home', 'serve']);
    expect(mods[1]!.places.map((p) => p.block)).toEqual(['work', 'schedule', 'roster']);
    expect(mods.flatMap((m) => m.places.map((p) => p.block))).not.toContain('groups');
    expect(canSeeBlock(mods, 'money')).toBe(false);
    expect(canSeeBlock(mods, 'groups')).toBe(false);
    expect(canSeeBlock(mods, 'deleted-work')).toBe(true);
    expect(activeModule(mods, 'roster')?.id).toBe('serve');
  });

  it('is empty without capabilities', async () => {
    const { buildModules } = await import('./menu');
    expect(buildModules(null, 'sys-a')).toEqual([]);
  });
});
