/**
 * Role rules for the shared Music / Protocol documents, checked on the server.
 *
 * The documents are saved whole, so the guard compares the saved version with
 * the new one, finds which rows changed, and checks that the person saving may
 * make those kinds of change. It is declarative: one rule per collection.
 *
 *   Music     drafts / confirmed / published / units / log → a Music MANAGE grant
 *   Protocol  month plans: publish / send back          → President or VP
 *             month plans: build / submit for review    → Coordinator (or reviewer)
 *             services, team slots                      → Coordinator (or reviewer)
 *             member actions (absence, swaps, offers…)  → any Protocol participant,
 *                                                         and only their own rows
 *
 * It can only be as accurate as the server's picture of who holds which office
 * (Positions / Memberships). See SCHEDULE_GUARD in routes/scheduleState.ts.
 */
import type { PermissionGrant, Position } from './types.js';

export type GuardActor = {
  personId: string;
  grants: PermissionGrant[];
  positions: Position[];
};
export type GuardViolation = { collection: string; rowId?: string; message: string };

type Doc = Record<string, unknown>;
type Row = Record<string, unknown>;

const isRows = (v: unknown): v is Row[] => Array.isArray(v);
const rowId = (r: Row, i: number) => (typeof r.id === 'string' ? r.id : `#${i}`);
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Rows added, removed or changed between two lists. */
export function diffRows(before: unknown, after: unknown) {
  const b = new Map<string, Row>();
  const a = new Map<string, Row>();
  (isRows(before) ? before : []).forEach((r, i) => b.set(rowId(r, i), r));
  (isRows(after) ? after : []).forEach((r, i) => a.set(rowId(r, i), r));
  const out: { id: string; before?: Row; after?: Row }[] = [];
  for (const [id, r] of a) {
    const o = b.get(id);
    if (!o || !eq(o, r)) out.push({ id, before: o, after: r });
  }
  for (const [id, r] of b) if (!a.has(id)) out.push({ id, before: r });
  return out;
}

const can = (g: PermissionGrant[], systemId: string, action: string, resource?: string) =>
  g.some(
    (x) =>
      x.systemId === systemId &&
      x.action === action &&
      (!resource || x.resource === resource),
  );

const protocolOffice = (a: GuardActor) =>
  a.positions.find(
    (p) => p.personId === a.personId && p.systemId === 'sys-protocol' && p.status === 'ACTIVE',
  )?.protocolOffice ?? null;

const isReviewer = (a: GuardActor) => {
  const o = protocolOffice(a);
  return o === 'PRESIDENT' || o === 'VP';
};
const isCoordinator = (a: GuardActor) =>
  protocolOffice(a) === 'COORDINATOR' ||
  can(a.grants, 'sys-protocol', 'MANAGE', 'PROTOCOL_SCHEDULE');
const isParticipant = (a: GuardActor) =>
  a.grants.some((g) => g.systemId === 'sys-protocol');

/** Collections only the Coordinator (or a reviewer) may change. */
const BUILD_COLLECTIONS = ['protocolServices', 'protocolTeamSlots'];
/** Collections members act in; each person may only touch their own rows. */
const MEMBER_COLLECTIONS = [
  'protocolAttendance',
  'protocolAbsenceRequests',
  'protocolFillInOffers',
  'protocolSwapProposals',
  'protocolContributions',
];
/** Bookkeeping any participant's actions write to. */
const OPEN_COLLECTIONS = [
  'protocolNotifications',
  'protocolActivity',
  'protocolHistory',
  'protocolServiceReports',
];
const OWNER_FIELDS = ['personId', 'requestedBy', 'requesterPersonId', 'offeredBy', 'proposerPersonId'];

export function checkScheduleChange(
  key: 'music' | 'protocol',
  before: unknown,
  after: unknown,
  actor: GuardActor,
): GuardViolation[] {
  const b = (before && typeof before === 'object' ? before : {}) as Doc;
  const a = (after && typeof after === 'object' ? after : {}) as Doc;
  const out: GuardViolation[] = [];

  if (key === 'music') {
    const m = (a.musicSchedule ?? {}) as Doc;
    const o = (b.musicSchedule ?? {}) as Doc;
    const mayManage = can(actor.grants, 'sys-music', 'MANAGE');
    for (const part of ['drafts', 'confirmed', 'published', 'units', 'log']) {
      if (eq(o[part], m[part])) continue;
      if (!mayManage) {
        out.push({
          collection: `musicSchedule.${part}`,
          message: `Changing Music ${part} needs Music management rights.`,
        });
      }
    }
    return out;
  }

  const reviewer = isReviewer(actor);
  const coordinator = isCoordinator(actor);

  for (const ch of diffRows(b.protocolMonthPlans, a.protocolMonthPlans)) {
    const from = ch.before?.status;
    const to = ch.after?.status;
    const statusChanged = from !== to;
    const needsReviewer =
      statusChanged && (to === 'PUBLISHED' || (from === 'REVIEW' && to === 'DRAFT') || from === 'PUBLISHED');
    if (needsReviewer && !reviewer) {
      out.push({
        collection: 'protocolMonthPlans',
        rowId: ch.id,
        message: 'Only the Protocol President or Vice President may publish or send back a month.',
      });
    } else if (!needsReviewer && !coordinator && !reviewer) {
      out.push({
        collection: 'protocolMonthPlans',
        rowId: ch.id,
        message: 'Only the Protocol Coordinator builds a month plan.',
      });
    }
  }

  for (const name of BUILD_COLLECTIONS) {
    const changed = diffRows(b[name], a[name]);
    if (changed.length && !coordinator && !reviewer) {
      out.push({
        collection: name,
        rowId: changed[0].id,
        message: 'Only the Protocol Coordinator changes services and team slots.',
      });
    }
  }

  for (const name of MEMBER_COLLECTIONS) {
    for (const ch of diffRows(b[name], a[name])) {
      if (!isParticipant(actor)) {
        out.push({ collection: name, rowId: ch.id, message: 'Not a Protocol participant.' });
        continue;
      }
      if (coordinator || reviewer) continue;
      const rows = [ch.before, ch.after].filter(Boolean) as Row[];
      const owner = rows
        .map((r) => OWNER_FIELDS.map((f) => r[f]).find((v) => typeof v === 'string'))
        .find(Boolean);
      if (owner && owner !== actor.personId) {
        out.push({
          collection: name,
          rowId: ch.id,
          message: 'You may only change your own entries.',
        });
      }
    }
  }

  for (const name of OPEN_COLLECTIONS) {
    if (diffRows(b[name], a[name]).length && !isParticipant(actor)) {
      out.push({ collection: name, message: 'Not a Protocol participant.' });
    }
  }
  return out;
}
