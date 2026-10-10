import { SHARED_BLOCKS, type AccessLetter, type SharedBlock } from '../../server/src/shared/vocabulary';
import type { Capabilities, OwnBlock } from '../api/frontDoorApi';
import { CHURCH_SYSTEM } from './portalHome';

export type MenuItem = { block: SharedBlock; letters: AccessLetter[] };

/** The letters a person holds in one block of one system (empty when none, or the system is not theirs). */
export function lettersFor(
  caps: Capabilities | null,
  systemId: string,
  block: SharedBlock,
): AccessLetter[] {
  const sys = caps?.systems.find((s) => s.id === systemId);
  return sys?.blocks[block] ?? [];
}

/**
 * The system menu, built only from what the server said the person may do:
 * the blocks they hold at least one letter in, in the server's order.
 * The server checks again on every call, so this only decides what to show.
 */
export function buildMenu(caps: Capabilities | null, systemId: string): MenuItem[] {
  if (!caps) return [];
  const order = caps.blockOrder?.length ? caps.blockOrder : [...SHARED_BLOCKS];
  return order
    .map((block) => ({ block, letters: lettersFor(caps, systemId, block) }))
    .filter((item) => item.letters.length > 0);
}

export function isSharedBlock(value: string | undefined): value is SharedBlock {
  return !!value && (SHARED_BLOCKS as readonly string[]).includes(value);
}

/** Where a person lands when they open a system: its home, or the first block they hold. */
export function firstBlock(menu: MenuItem[]): SharedBlock | null {
  return menu.find((m) => m.block === 'home')?.block ?? menu[0]?.block ?? null;
}

/** Blocks that get a place on the Portal bar. Money is deliberately left to each system's own menu. */
export const PORTAL_BLOCKS = ['work', 'people', 'schedule', 'reports'] as const satisfies readonly SharedBlock[];
export type PortalBlock = (typeof PORTAL_BLOCKS)[number];

export type PortalNavItem =
  | { key: 'systems' }
  | { key: PortalBlock }
  | { key: 'notifications' }
  | { key: 'announcements' };

export function isPortalBlock(value: string | undefined): value is PortalBlock {
  return !!value && (PORTAL_BLOCKS as readonly string[]).includes(value);
}

/**
 * The Portal bar: Systems first, then each shared block the person holds a letter in
 * in at least one system (Work, People, Schedule, Reports), then Notifications and Announcements.
 * Built only from the server's capabilities, so it never offers a block the person lacks.
 */
export function buildPortalNav(caps: Capabilities | null): PortalNavItem[] {
  const items: PortalNavItem[] = [{ key: 'systems' }];
  if (caps) {
    for (const block of PORTAL_BLOCKS) {
      if (caps.systems.some((s) => (s.blocks[block] ?? []).length > 0)) items.push({ key: block });
    }
  }
  items.push({ key: 'notifications' }, { key: 'announcements' });
  return items;
}

/** The systems in which the person holds access to a block, with their letters. */
export function systemsWithBlock(
  caps: Capabilities | null,
  portal: Array<{ id: string }>,
  block: SharedBlock,
): Array<{ systemId: string; letters: AccessLetter[] }> {
  if (!caps) return [];
  const mine = new Set(portal.map((s) => s.id));
  return caps.systems
    .filter((s) => mine.has(s.id) && (s.blocks[block] ?? []).length > 0)
    .map((s) => ({ systemId: s.id, letters: s.blocks[block] }));
}

export type OwnMenuItem = { block: OwnBlock; letters: AccessLetter[]; variant?: string };

/** A system's own blocks after the six shared ones (Governance, and Settings in Central Administration), from the server's answer. */
export function buildOwnMenu(caps: Capabilities | null, systemId: string): OwnMenuItem[] {
  const own = caps?.systems.find((s) => s.id === systemId)?.own ?? [];
  return own.filter((o) => o.letters.length > 0).map((o) => ({ block: o.key, letters: o.letters, variant: o.variant }));
}

/**
 * Modules: the sidebar entries of a system (or of the Portal, which is the church-wide level).
 * Each module holds the places that belong together; its places become the sub-blocks on the top bar.
 * A module only exists for a person who can open at least one of its places, and a place only exists
 * for a person who can open it, so what they may not use is not drawn at all.
 */
export const MODULE_IDS = [
  'home', 'notifications', 'announcements', 'units', 'people', 'work', 'schedule', 'ministry', 'money', 'reports', 'governance', 'settings',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** A place in a module. `label` (a system's name) replaces the translated `labelKey`; `external` opens in a new tab. */
export type NavPlace = { key: string; to: string; labelKey: string; end: boolean; label?: string; external?: boolean };
export type NavModule = { id: ModuleId; labelKey: string; to: string; places: NavPlace[] };

const MODULE_LABEL: Record<ModuleId, string> = {
  home: 'door.block.home', notifications: 'door.portal.nav.notifications', announcements: 'door.portal.nav.announcements', units: 'door.people.tab.units',
  people: 'door.block.people', work: 'door.block.work', schedule: 'door.block.schedule', ministry: 'door.module.ministry', money: 'door.block.money',
  reports: 'door.block.reports', governance: 'door.own.governance', settings: 'door.own.settings',
};

/** Music and Protocol plan their month on their own pages (the month plan, the teams), so the general Schedule page is not shown there. */
export const hasOwnSchedule = (systemId: string): boolean => systemId === 'sys-music' || systemId === 'sys-protocol';

/** The Access page (who holds which office, the rules, lending) is for the church's Administrators only. */
export const isAdministrator = (caps: Capabilities | null): boolean => !!caps?.offices?.some((o) => o.code === 'ADMINISTRATOR');

/** Central Administration: the leadership system. It is where the church's organisation (Units) lives. */
export const isCentralSystem = (systemId: string) => systemId === CHURCH_SYSTEM;

/** Sidebar modules with their top-bar places, built only from what the server said the person may open. */
export function buildModules(caps: Capabilities | null, systemId: string): NavModule[] {
  const base = `/s/${systemId}`;
  const central = isCentralSystem(systemId);
  const admin = isAdministrator(caps);
  const shared = new Set(buildMenu(caps, systemId).map((m) => m.block as string));
  const own = new Map(buildOwnMenu(caps, systemId).map((o) => [o.block as string, o]));
  const ownPlace = (key: string): NavPlace | null => {
    const o = own.get(key);
    return o ? { key, to: `${base}/${key}`, labelKey: key === 'choirs' && systemId !== 'sys-music' ? 'door.own.choirsOwn' : `door.own.${key}${o.variant ? `.${o.variant}` : ''}`, end: false } : null;
  };
  const place = (key: string, path: string, labelKey: string, end = false): NavPlace => ({ key, to: path ? `${base}/${path}` : base, labelKey, end });
  const some = (list: Array<NavPlace | null>) => list.filter((x): x is NavPlace => x !== null);

  const spec: Record<ModuleId, NavPlace[]> = {
    home: shared.has('home') ? [place('home', '', 'door.block.home', true)] : [],
    notifications: [place('notifications', `notifications?system=${encodeURIComponent(systemId)}`, MODULE_LABEL.notifications, true)],
    announcements: [place('announcements', 'announcements', MODULE_LABEL.announcements, true)],
    units: central && shared.has('people') ? [place('units', 'people/units', 'door.people.tab.units')] : [],
    people: shared.has('people')
      ? [
          place('directory', 'people', 'door.people.tab.directory'),
          ...(!central && own.has('organisation') ? [place('organisation', 'people/units', 'door.people.tab.units')] : []),
          place('appointments', 'people/appointments', 'door.people.tab.appointments'),
          ...(admin ? [place('access', 'people/access', 'door.people.tab.access'), place('admin', 'people/admin', 'door.people.tab.admin')] : []),
          ...some(['groups', 'couples', 'contacts', 'visits', 'moves'].map(ownPlace)),
        ]
      : some(['groups', 'couples', 'contacts', 'visits', 'moves'].map(ownPlace)),
    work: shared.has('work')
      ? [
          place('tasks', 'work', 'door.work.tasks'),
          place('programs', 'programs', 'door.plans.PROGRAM'),
          place('events', 'events', 'door.plans.EVENT'),
          place('projects', 'projects', 'door.plans.PROJECT'),
        ]
      : [],
    schedule: [
      ...(shared.has('schedule') && !hasOwnSchedule(systemId) ? [place('schedule', 'schedule', 'door.block.schedule')] : []),
      ...some(['monthplan', 'teams', 'mine', 'watches', 'pulpit'].map(ownPlace)),
    ],
    ministry: some(['choirs', 'rehearsals', 'repertoire', 'oversight', 'sponsorship', 'roster'].map(ownPlace)),
    // The money screens in the order of the design; My contribution is for every member of the system.
    money: [
      ...(shared.has('money')
        ? [
            place('plan', 'money/plan', 'door.money.plan'),
            place('budget', 'money/budget', 'door.money.budget'),
            place('income', 'money/income', 'door.money.income'),
            place('expense', 'money/expense', 'door.money.expense'),
            place('contributions', 'money/contributions', 'door.money.contributions'),
            place('donations', 'money/donations', 'door.money.donations'),
            place('moneyreports', 'money/reports', 'door.money.reports'),
          ]
        : []),
      place('mine', 'money/mine', 'door.money.mine'),
    ],
    reports: [...(shared.has('reports') ? [place('reports', 'reports', 'door.block.reports')] : []), ...some(['deaconreports'].map(ownPlace))],
    governance: own.has('governance')
      ? [
          ...some(['central'].map(ownPlace)),
          place('meetings', 'governance', 'door.gov.tab.meetings'),
          place('decisions', 'governance/decisions', 'door.gov.tab.decisions'),
          ...(central ? [place('collections', 'governance/collections', 'door.gov.tab.collections')] : []),
          place('letters', 'governance/letters', 'door.gov.tab.letters'),
        ]
      : [],
    // Every system has its own Settings; Central Administration also keeps the church-wide ones.
    settings: [...some(['settings'].map(ownPlace)), place('preferences', 'preferences', central ? 'door.sset.mine' : 'door.own.settings')],
  };
  return MODULE_IDS.map((id) => ({ id, labelKey: MODULE_LABEL[id], to: spec[id][0]?.to ?? '', places: spec[id] })).filter((m) => m.places.length > 0);
}

/** Pages that belong to a module without being a menu entry of their own, by the first part of their address. */
const EXTRA_PAGES: Record<string, ModuleId> = { 'deleted-work': 'work', collections: 'governance', 'money/contributions': 'money' };

/** The spreadsheet import page (`/s/<system>/import/<what>`) sits in the module of what it imports. */
const IMPORT_MODULE: Record<string, ModuleId> = {
  tasks: 'work', plans: 'work', groupMembers: 'people', choirMembers: 'ministry', protocolRoster: 'ministry', songs: 'ministry',
  moneyEntries: 'money', budgetLines: 'money', planItems: 'money', donations: 'money', scheduleSlots: 'schedule',
};

const pathOf = (to: string) => to.split('?')[0]!;
const isUnder = (path: string, to: string, end: boolean) => path === to || (!end && path.startsWith(`${to}/`));

/** The module and place that hold the page being shown. The most specific place wins, so one tab is lit at a time. */
export function resolveActive(modules: NavModule[], pathname: string): { module: NavModule; place: NavPlace | null } | null {
  let best: { module: NavModule; place: NavPlace } | null = null;
  for (const m of modules) {
    for (const p of m.places) {
      const to = pathOf(p.to);
      if (isUnder(pathname, to, p.end) && (!best || to.length > pathOf(best.place.to).length)) best = { module: m, place: p };
    }
  }
  if (best) return best;
  const parts = pathname.split('/');
  const id = parts[3] === 'import' ? IMPORT_MODULE[parts[4] ?? ''] : (EXTRA_PAGES[`${parts[3] ?? ''}/${parts[4] ?? ''}`] ?? EXTRA_PAGES[parts[3] ?? '']);
  const m = id ? modules.find((x) => x.id === id) : undefined;
  return m ? { module: m, place: null } : null;
}

/** Whether the person may even see this page: it must belong to one of their modules. */
export function canSeePath(modules: NavModule[], pathname: string): boolean {
  return resolveActive(modules, pathname) !== null;
}

/**
 * The Portal's own sidebar, before any system: Home (the systems), Notifications and Announcements
 * from every system, then Work, People, Schedule and Reports for each block the person holds in at
 * least one system. Built only from the server's capabilities.
 */
export function buildPortalModules(caps: Capabilities | null, portal: Array<{ id: string; shortName: string }> = []): NavModule[] {
  const one = (id: ModuleId, path: string, labelKey: string, end: boolean): NavModule => ({
    id, labelKey, to: path, places: [{ key: id, to: path, labelKey, end }],
  });
  const mods: NavModule[] = [
    one('home', '/portal', 'door.portal.nav.systems', true),
    one('notifications', '/portal/notifications', MODULE_LABEL.notifications, false),
    one('announcements', '/portal/announcements', MODULE_LABEL.announcements, false),
  ];
  for (const nav of buildPortalNav(caps)) {
    if (nav.key === 'work') {
      mods.push({
        id: 'work', labelKey: MODULE_LABEL.work, to: '/portal/work',
        places: [
          { key: 'tasks', to: '/portal/work', labelKey: 'door.work.tasks', end: true },
          { key: 'plans', to: '/portal/work/plans', labelKey: 'door.portal.work.plans', end: false },
        ],
      });
    } else if (nav.key === 'people' || nav.key === 'schedule' || nav.key === 'reports') {
      // Overview first, then each system where the person holds the block (opens in its own tab).
      const where = systemsWithBlock(caps, portal, nav.key).map(({ systemId }): NavPlace => ({
        key: `sys-${systemId}`, to: `/s/${systemId}/${nav.key}`, labelKey: MODULE_LABEL[nav.key],
        label: portal.find((s) => s.id === systemId)?.shortName ?? systemId, end: false, external: true,
      }));
      mods.push({
        id: nav.key, labelKey: MODULE_LABEL[nav.key], to: `/portal/${nav.key}`,
        places: [{ key: nav.key, to: `/portal/${nav.key}`, labelKey: 'door.portal.nav.overview', end: true }, ...where],
      });
    }
  }
  return mods;
}
