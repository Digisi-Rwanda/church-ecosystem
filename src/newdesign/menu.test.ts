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
  const sys = (id: string, blocks: object, own: unknown[] = []) => ({ id, blocks: { ...none, ...blocks }, own });
  const mk = (...systems: unknown[]) => ({ blockOrder: ['home', 'people', 'work', 'schedule', 'money', 'reports'], systems }) as unknown as Capabilities;

  it('groups what the person can open and drops the rest completely', async () => {
    const { buildModules, canSeePath } = await import('./menu');
    const caps = mk(sys('sys-a', { home: ['R'], work: ['R'], schedule: ['R'] }, [{ key: 'roster', letters: ['R'] }, { key: 'groups', letters: [] }]));
    const mods = buildModules(caps, 'sys-a');
    expect(mods.map((m) => m.id)).toEqual(['home', 'notifications', 'announcements', 'work', 'schedule', 'ministry', 'money', 'settings']);
    expect(mods.find((m) => m.id === 'work')!.places.map((p) => p.key)).toEqual(['tasks', 'programs', 'events', 'projects']);
    expect(mods.flatMap((m) => m.places.map((p) => p.key))).not.toContain('groups');
    expect(canSeePath(mods, '/s/sys-a/money')).toBe(false);
    expect(canSeePath(mods, '/s/sys-a/groups')).toBe(false);
    expect(canSeePath(mods, '/s/sys-a/programs')).toBe(true);
    expect(canSeePath(mods, '/s/sys-a/work/plans/p1')).toBe(true);
    expect(canSeePath(mods, '/s/sys-a/deleted-work')).toBe(true);
    expect(canSeePath(mods, '/s/sys-a/notifications')).toBe(true);
  });

  it('shows the most specific place as the active one', async () => {
    const { buildModules, resolveActive } = await import('./menu');
    const caps = mk(sys('sys-a', { home: ['R'], people: ['R'] }, [{ key: 'governance', letters: ['R'] }]));
    const mods = buildModules(caps, 'sys-a');
    expect(resolveActive(mods, '/s/sys-a/people')?.place?.key).toBe('directory');
    expect(resolveActive(mods, '/s/sys-a/people/appointments')?.place?.key).toBe('appointments');
    expect(resolveActive(mods, '/s/sys-a/people/p-1')?.place?.key).toBe('directory');
    expect(resolveActive(mods, '/s/sys-a/governance/letters/l1')?.place?.key).toBe('letters');
    expect(resolveActive(mods, '/s/sys-a/collections')?.module.id).toBe('governance');
  });

  it('the Portal (church-wide level) has Units on the sidebar, other systems do not', async () => {
    const { buildModules } = await import('./menu');
    const caps = mk(sys('sys-main', { home: ['R'], people: ['R'], work: ['R'] }, [{ key: 'settings', letters: ['R'] }]), sys('sys-a', { people: ['R'] }));
    const portal = buildModules(caps, 'sys-main').map((m) => m.id);
    expect(portal).toEqual(['home', 'notifications', 'announcements', 'units', 'people', 'work', 'money', 'settings']);
    expect(buildModules(caps, 'sys-main').find((m) => m.id === 'people')!.places.map((p) => p.key)).toEqual(['directory', 'appointments']);
    const admin = { ...caps, offices: [{ id: 'o1', systemId: 'sys-media', title: 'Administrator', code: 'ADMINISTRATOR' as const }] };
    expect(buildModules(admin, 'sys-main').find((m) => m.id === 'people')!.places.map((p) => p.key)).toEqual(['directory', 'appointments', 'access', 'admin']);
    const other = buildModules(caps, 'sys-a');
    expect(other.some((m) => m.id === 'units')).toBe(false);
    expect(other.find((m) => m.id === 'people')!.places.map((p) => p.key)).not.toContain('organisation');
    const music = mk(sys('sys-music', { people: ['R'] }, [{ key: 'organisation', letters: ['R'] }]));
    expect(buildModules(music, 'sys-music').find((m) => m.id === 'people')!.places.map((p) => p.key)).toContain('organisation');
  });

  it('keeps notifications and announcements even with no letters at all', async () => {
    const { buildModules } = await import('./menu');
    expect(buildModules(null, 'sys-a').map((m) => m.id)).toEqual(['notifications', 'announcements', 'money', 'settings']);
  });
});

describe('buildPortalModules', () => {
  it('has Home, Notifications and Announcements, then the shared blocks held in any system', async () => {
    const { buildPortalModules } = await import('./menu');
    const caps = {
      blockOrder: ['home', 'people', 'work', 'schedule', 'money', 'reports'],
      systems: [
        { id: 'sys-a', blocks: { ...none, work: ['R'] }, own: [] },
        { id: 'sys-b', blocks: { ...none, reports: ['R'] }, own: [] },
      ],
    } as unknown as Capabilities;
    expect(buildPortalModules(caps).map((m) => m.id)).toEqual(['home', 'notifications', 'announcements', 'work', 'reports']);
    expect(buildPortalModules(null).map((m) => m.id)).toEqual(['home', 'notifications', 'announcements']);
  });
  it('every system has its own Settings, and Central Administration keeps the church-wide ones beside it', async () => {
    const { buildModules } = await import('./menu');
    const none = { home: [], people: [], work: [], schedule: [], money: [], reports: [] };
    const sys = (id: string, blocks: object, own: unknown[] = []) => ({ id, blocks: { ...none, ...blocks }, own });
    const mk = (...systems: unknown[]) => ({ blockOrder: ['home', 'people', 'work', 'schedule', 'money', 'reports'], systems }) as unknown as Capabilities;
    const plain = buildModules(mk(sys('sys-a', { people: ['R'] })), 'sys-a').find((m) => m.id === 'settings');
    expect(plain?.places.map((p) => p.to)).toEqual(['/s/sys-a/preferences']);
    const central = buildModules(mk(sys('sys-main', { people: ['R'] }, [{ key: 'settings', letters: ['R'] }])), 'sys-main').find((m) => m.id === 'settings');
    expect(central?.places.map((p) => p.to)).toEqual(['/s/sys-main/settings', '/s/sys-main/preferences']);
  });
  it('Money: five screens for those who hold money letters, and My contribution for every member', async () => {
    const { buildModules, resolveActive } = await import('./menu');
    const none = { home: [], people: [], work: [], schedule: [], money: [], reports: [] };
    const mk = (blocks: object) => ({ blockOrder: ['home', 'people', 'work', 'schedule', 'money', 'reports'], systems: [{ id: 'sys-a', blocks: { ...none, ...blocks }, own: [] }] }) as unknown as Capabilities;
    const keys = (caps: Capabilities) => buildModules(caps, 'sys-a').find((m) => m.id === 'money')!.places.map((p) => p.key);
    expect(keys(mk({ money: ['R'] }))).toEqual(['plan', 'budget', 'accounting', 'contributions', 'moneyreports', 'mine']);
    expect(keys(mk({ people: ['R'] }))).toEqual(['mine']);
    const mods = buildModules(mk({ money: ['R'] }), 'sys-a');
    expect(resolveActive(mods, '/s/sys-a/money')?.place?.key).toBe('accounting');
    expect(resolveActive(mods, '/s/sys-a/money/budget')?.place?.key).toBe('budget');
    // a team leader without money letters may still open the contribution lists, under Money
    const lead = buildModules(mk({ people: ['R'] }), 'sys-a');
    expect(resolveActive(lead, '/s/sys-a/money/contributions')).toMatchObject({ module: { id: 'money' }, place: null });
  });
  it('Collections is a Governance sub-block of Central Administration only', async () => {
    const { buildModules } = await import('./menu');
    const none = { home: [], people: [], work: [], schedule: [], money: [], reports: [] };
    const sys = (id: string) => ({ id, blocks: { ...none }, own: [{ key: 'governance', letters: ['R'] }] });
    const caps = { blockOrder: [], systems: [sys('sys-main'), sys('sys-youth')] } as unknown as Capabilities;
    const keys = (id: string) => buildModules(caps, id).find((m) => m.id === 'governance')!.places.map((p) => p.key);
    expect(keys('sys-main')).toEqual(['meetings', 'decisions', 'collections', 'letters']);
    expect(keys('sys-youth')).toEqual(['meetings', 'decisions', 'letters']);
  });
});
