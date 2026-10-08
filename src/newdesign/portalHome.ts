import type { PortalSystem } from '../api/frontDoorApi';

/** Central Administration (today's main church system): the leadership system. */
export const CHURCH_SYSTEM = 'sys-main';

export type SystemKind = 'central' | 'organisation' | 'ministry';

/** The three kinds of the new design: Central Administration, organisations, and ministries. */
const ORGANISATIONS = new Set(['sys-choir', 'sys-protocol', 'sys-media']);
export function kindOfSystem(id: string): SystemKind {
  if (id === CHURCH_SYSTEM) return 'central';
  return ORGANISATIONS.has(id) ? 'organisation' : 'ministry';
}

/** Systems that are never opened on their own (Finance becomes a module inside every system). */
const NEVER_OPENED = new Set(['sys-finance']);

/**
 * Where signing in lands: a person with exactly one system goes straight into it; everyone else
 * (two or more, or none) lands on the Portal.
 */
export function landingPath(portal: PortalSystem[]): string | null {
  const open = portal.filter((s) => !NEVER_OPENED.has(s.id));
  return open.length === 1 ? `/s/${open[0]!.id}` : null;
}

/** The cards of the Portal, grouped by kind in the order Central Administration, organisations, ministries. */
export function groupByKind(portal: PortalSystem[]): Array<{ kind: SystemKind; systems: PortalSystem[] }> {
  const open = portal.filter((s) => !NEVER_OPENED.has(s.id));
  return (['central', 'organisation', 'ministry'] as const)
    .map((kind) => ({ kind, systems: open.filter((s) => kindOfSystem(s.id) === kind) }))
    .filter((g) => g.systems.length > 0);
}

/** Systems whose name, short name or role match what was typed (every word must match). Empty text keeps all. */
export function filterSystems(systems: PortalSystem[], text: string): PortalSystem[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return systems;
  return systems.filter((s) => {
    const hay = `${s.shortName} ${s.name} ${s.role}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The pinned systems first (in the order pinned), the rest after, none repeated or invented. */
export function pinnedFirst(systems: PortalSystem[], pinned: string[]): { pinned: PortalSystem[]; rest: PortalSystem[] } {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const first = pinned.map((id) => byId.get(id)).filter((s): s is PortalSystem => !!s);
  const set = new Set(first.map((s) => s.id));
  return { pinned: first, rest: systems.filter((s) => !set.has(s.id)) };
}

/** What waits for the person in each system: open tasks assigned to them, and how many of those are overdue. */
export function waitingBySystem(tasks: Array<{ systemId: string; overdue?: boolean }>): Map<string, { open: number; overdue: number }> {
  const out = new Map<string, { open: number; overdue: number }>();
  for (const w of tasks) {
    const cur = out.get(w.systemId) ?? { open: 0, overdue: 0 };
    cur.open += 1;
    if (w.overdue) cur.overdue += 1;
    out.set(w.systemId, cur);
  }
  return out;
}

const PIN_KEY = 'moriah.pinnedSystems';
/** Pins are a per-browser convenience, so storage failures are ignored. */
export function readPins(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function writePins(ids: string[]): void {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
