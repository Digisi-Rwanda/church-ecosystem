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

export type PortalNavItem = { key: 'systems' } | { key: 'notifications' } | { key: 'announcements' };

/**
 * The Portal bar is only Home (the systems), Notifications and Announcements. Work, People, Schedule, Reports and Money
 * live inside each system, so the Portal never offers them.
 */
export function buildPortalNav(_caps?: Capabilities | null): PortalNavItem[] {
  return [{ key: 'systems' }, { key: 'notifications' }, { key: 'announcements' }];
}

export type OwnMenuItem = { block: OwnBlock; letters: AccessLetter[]; variant?: string };

/** A system's own blocks after the six shared ones (Governance, and Settings in Central Administration), from the server's answer. */
export function buildOwnMenu(caps: Capabilities | null, systemId: string): OwnMenuItem[] {
  const own = caps?.systems.find((s) => s.id === systemId)?.own ?? [];
  // The Pulpit is not offered for now: it is left out of every menu and tile.
  return own.filter((o) => o.letters.length > 0 && o.key !== 'pulpit' && o.key !== 'central').map((o) => ({ block: o.key, letters: o.letters, variant: o.variant }));
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
    ministry: some(['choirs', 'rehearsals', 'repertoire', 'sponsorship', 'roster'].map(ownPlace)),
    // Funds (with its Contributions tab), Budget and Accounting. The contribution lists are a tab of Funds, not a menu item.
    money: [
      ...(shared.has('money')
        ? [
            place('plan', 'money/plan', 'door.money.plan'),
            place('budget', 'money/budget', 'door.money.budget'),
            place('funds', 'money/funds', 'door.money.funds'),
            place('accounting', 'money', 'door.money.accounting', true),
          ]
        : []),
      // My contribution is a member's own view of what they gave; it sits in Management and needs no money letter.
      place('mine', 'money/mine', 'door.money.mine'),
    ],
    // The year overview of the money is a report, so it sits in Reports (it still needs the Money letter to open).
    reports: [
      ...(shared.has('reports') ? [place('reports', 'reports', 'door.block.reports')] : []),
      ...some(['deaconreports'].map(ownPlace)),
    ],
    governance: own.has('governance')
      ? [
          place('meetings', 'governance', 'door.gov.tab.meetings'),
          place('decisions', 'governance/decisions', 'door.gov.tab.decisions'),
          ...(central && own.has('collections') ? [place('collections', 'governance/collections', 'door.gov.tab.collections')] : []),
        ]
      : [],
    // Every system has its own Settings; Central Administration also keeps the church-wide ones.
    settings: [...some(['settings'].map(ownPlace)), place('preferences', 'preferences', central ? 'door.sset.mine' : 'door.own.settings')],
  };
  return MODULE_IDS.map((id) => ({ id, labelKey: MODULE_LABEL[id], to: spec[id][0]?.to ?? '', places: spec[id] })).filter((m) => m.places.length > 0);
}

/** Pages that belong to a module without being a menu entry of their own, by the first part of their address. */
const EXTRA_PAGES: Record<string, ModuleId[]> = { 'deleted-work': ['work'], collections: ['governance'], 'money/contributions': ['money', 'home'] };

/** The spreadsheet import page (`/s/<system>/import/<what>`) sits in the module of what it imports. */
const IMPORT_MODULE: Record<string, ModuleId> = {
  tasks: 'work', plans: 'work', groupMembers: 'people', choirMembers: 'ministry', protocolRoster: 'ministry', songs: 'ministry',
  moneyEntries: 'money', budgetLines: 'money', planItems: 'money', donations: 'money', scheduleSlots: 'schedule',
};

const pathOf = (to: string) => to.split('?')[0]!;
const isUnder = (path: string, to: string, end: boolean) => path === to || (!end && path.startsWith(`${to}/`));

/** The module and place that hold the page being shown. The most specific place wins, so one tab is lit at a time. */
/** A plan page whose kind is not known yet (loading, or it did not load) names this, so no tab is lit rather than the wrong one. */
export const PLACE_UNKNOWN = 'unknown';

export function resolveActive(modules: NavModule[], pathname: string, hint?: string | null): { module: NavModule; place: NavPlace | null } | null {
  let best: { module: NavModule; place: NavPlace } | null = null;
  for (const m of modules) {
    for (const p of m.places) {
      const to = pathOf(p.to);
      if (isUnder(pathname, to, p.end) && (!best || to.length > pathOf(best.place.to).length)) best = { module: m, place: p };
    }
  }
  if (best && hint) {
    // A plan page: the page names its own place (programs, events or projects) when it is under the same module.
    if (/\/work\/plans\//.test(pathname)) {
      if (hint === PLACE_UNKNOWN) return { module: best.module, place: null };
      const named = best.module.places.find((x) => x.key === hint);
      if (named) return { module: best.module, place: named };
    }
  }
  if (best) return best;
  const parts = pathname.split('/');
  const ids = parts[3] === 'import' ? [IMPORT_MODULE[parts[4] ?? '']].filter((x): x is ModuleId => !!x) : (EXTRA_PAGES[`${parts[3] ?? ''}/${parts[4] ?? ''}`] ?? EXTRA_PAGES[parts[3] ?? ''] ?? []);
  const m = ids.map((id) => modules.find((x) => x.id === id)).find((x) => !!x);
  return m ? { module: m, place: null } : null;
}

/** Whether the person may even see this page: it must belong to one of their modules. */
export function canSeePath(modules: NavModule[], pathname: string): boolean {
  return resolveActive(modules, pathname) !== null;
}

/** The Portal's own sidebar, before any system: Home (the systems), Notifications and Announcements, and nothing else. */
export function buildPortalModules(_caps?: Capabilities | null, _portal: Array<{ id: string; shortName: string }> = []): NavModule[] {
  const one = (id: ModuleId, path: string, labelKey: string, end: boolean): NavModule => ({
    id, labelKey, to: path, places: [{ key: id, to: path, labelKey, end }],
  });
  return [
    one('home', '/portal', 'door.portal.nav.systems', true),
    one('notifications', '/portal/notifications', MODULE_LABEL.notifications, false),
    one('announcements', '/portal/announcements', MODULE_LABEL.announcements, false),
  ];
}
