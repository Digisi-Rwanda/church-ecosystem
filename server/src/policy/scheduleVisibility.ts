/**
 * Who may READ which parts of the shared Music / Protocol documents.
 *
 * The documents are loaded and saved whole by the browser, so hiding a part on
 * read must not turn into deleting it on save. Two functions work as a pair:
 *
 *   filterForReader   what a given person receives from GET;
 *   restoreHidden     on PUT, puts back whatever that person could not see,
 *                     so the next save never wipes someone else's data.
 *
 * Rules
 *   Music     drafts                  Music managers only (unpublished work);
 *             confirmed months, log   Music managers and Protocol participants
 *                                     (Protocol builds from them and follows the log);
 *             published, units        everyone signed in;
 *             notifs                  the person they are addressed to.
 *   Protocol  notifications           the person they are addressed to;
 *             contributions           the giver, the Coordinator, the
 *                                     President / Vice President, the Treasurer.
 *             everything else         every Protocol participant, who needs the
 *                                     whole roster and plan to plan their own duty.
 *
 * Mode SCHEDULE_READ_FILTER: off (default) | on. Turn it on for a real launch,
 * where every person signs in with their own account. The demo role logins are
 * bare accounts with no grants, so with the filter on they would not see each
 * other's Music drafts.
 */
import type { GuardActor } from './scheduleGuard.js';

type Doc = Record<string, unknown>;
type Row = Record<string, unknown>;

export function readFilterEnabled(): boolean {
  return (process.env.SCHEDULE_READ_FILTER ?? 'off').toLowerCase() === 'on';
}

const isObj = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

const hasSystem = (a: GuardActor, systemId: string) =>
  a.grants.some((g) => g.systemId === systemId);
const musicManager = (a: GuardActor) =>
  a.grants.some((g) => g.systemId === 'sys-music' && g.action === 'MANAGE');
const office = (a: GuardActor) =>
  a.positions.find(
    (p) => p.personId === a.personId && p.systemId === 'sys-protocol' && p.status === 'ACTIVE',
  )?.protocolOffice ?? null;
const protocolStaff = (a: GuardActor) => {
  const o = office(a);
  return (
    o === 'COORDINATOR' ||
    o === 'PRESIDENT' ||
    o === 'VP' ||
    o === 'TREASURER' ||
    a.grants.some(
      (g) => g.systemId === 'sys-protocol' && g.resource === 'PROTOCOL_SCHEDULE' && g.action === 'MANAGE',
    )
  );
};

type RowRule = (row: Row, a: GuardActor) => boolean;
const own: RowRule = (r, a) => r.personId === a.personId;

const MUSIC_ROW_RULES: Record<string, RowRule> = { notifs: own };
const PROTOCOL_ROW_RULES: Record<string, RowRule> = {
  protocolNotifications: own,
  protocolContributions: (r, a) => own(r, a) || protocolStaff(a),
};

/** Whole parts of the Music document hidden from this person. */
function hiddenMusicParts(a: GuardActor): string[] {
  const hide: string[] = [];
  if (!musicManager(a)) hide.push('drafts');
  // Confirmed months and the change log: Protocol plans from them and watches them.
  if (!musicManager(a) && !hasSystem(a, 'sys-protocol')) hide.push('confirmed', 'log');
  return hide;
}

export function filterForReader(
  key: 'music' | 'protocol',
  data: unknown,
  actor: GuardActor,
): unknown {
  if (!isObj(data)) return data;
  const out: Doc = { ...data };
  if (key === 'music') {
    const m = data.musicSchedule;
    if (!isObj(m)) return data;
    const ms: Doc = { ...m };
    for (const part of hiddenMusicParts(actor)) if (part in ms) ms[part] = [];
    for (const [name, rule] of Object.entries(MUSIC_ROW_RULES)) {
      if (name in ms) ms[name] = rows(ms[name]).filter((r) => rule(r, actor));
    }
    out.musicSchedule = ms;
    return out;
  }
  for (const [name, rule] of Object.entries(PROTOCOL_ROW_RULES)) {
    if (name in out) out[name] = rows(out[name]).filter((r) => rule(r, actor));
  }
  return out;
}

/** Re-attach what this person was never shown, then keep their own changes. */
function restoreRows(current: Row[], incoming: Row[], visible: RowRule, a: GuardActor): Row[] {
  const curById = new Map<string, Row>();
  for (const r of current) if (typeof r.id === 'string') curById.set(r.id, r);
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const r of incoming) {
    const id = typeof r.id === 'string' ? r.id : null;
    const existing = id ? curById.get(id) : undefined;
    // A row they could not see stays as it was: they cannot edit it blind.
    out.push(existing && !visible(existing, a) ? existing : r);
    if (id) seen.add(id);
  }
  for (const r of current) {
    const id = typeof r.id === 'string' ? r.id : null;
    if (!visible(r, a) && (!id || !seen.has(id))) out.push(r);
  }
  return out;
}

export function restoreHidden(
  key: 'music' | 'protocol',
  current: unknown,
  incoming: unknown,
  actor: GuardActor,
): unknown {
  if (!isObj(incoming) || !isObj(current)) return incoming;
  const out: Doc = { ...incoming };
  if (key === 'music') {
    const cm = current.musicSchedule;
    const im = incoming.musicSchedule;
    if (!isObj(cm) || !isObj(im)) return incoming;
    const ms: Doc = { ...im };
    for (const part of hiddenMusicParts(actor)) if (part in cm) ms[part] = cm[part];
    for (const [name, rule] of Object.entries(MUSIC_ROW_RULES)) {
      if (name in cm || name in ms) ms[name] = restoreRows(rows(cm[name]), rows(ms[name]), rule, actor);
    }
    out.musicSchedule = ms;
    return out;
  }
  for (const [name, rule] of Object.entries(PROTOCOL_ROW_RULES)) {
    if (name in current || name in out) {
      out[name] = restoreRows(rows(current[name]), rows(out[name]), rule, actor);
    }
  }
  return out;
}
