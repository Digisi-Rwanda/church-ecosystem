import { SHARED_BLOCKS, type AccessLetter, type SharedBlock } from '../../server/src/shared/vocabulary';
import type { Capabilities, OwnBlock } from '../api/frontDoorApi';

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

export type OwnMenuItem = { block: OwnBlock; letters: AccessLetter[] };

/** A system's own blocks after the six shared ones (Governance, and Settings in Central Administration), from the server's answer. */
export function buildOwnMenu(caps: Capabilities | null, systemId: string): OwnMenuItem[] {
  const own = caps?.systems.find((s) => s.id === systemId)?.own ?? [];
  return own.filter((o) => o.letters.length > 0).map((o) => ({ block: o.key, letters: o.letters }));
}
