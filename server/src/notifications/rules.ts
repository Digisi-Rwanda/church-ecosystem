/**
 * The pure rules of Notifications (slice 1.4): who a notice is for, what is waiting on
 * the Church Leader, how unread counts add up. No database in here, so each rule is
 * testable alone.
 */
import type { Holding, PositionRec } from '../capabilities/engine.js';
import { computeVacancies, countLiveAdministrators, type UnitRec } from '../lib/appointments.js';
import { MIN_ADMINISTRATORS, OFFICE_TITLE } from '../shared/accessMatrix.js';
import type { NotificationKind } from '../shared/vocabulary.js';

export const MAIN = 'sys-main';
export const INFO_DAYS = 90;
const MAX_VACANCY_ITEMS = 8;

export interface Notice {
  /** Read-state key: the notification id, or attn:… / vac:… for live items. */
  key: string;
  kind: NotificationKind;
  source: 'STORED' | 'ATTENTION' | 'APPOINTMENTS';
  title: string;
  body: string | null;
  href: string | null;
  systemId: string;
  createdAt: string;
  important: boolean;
  read: boolean;
  /** Lower is more urgent; stored notices sort by date instead. */
  rank: number;
}

export interface StoredRow {
  id: string;
  kind: string;
  toPersonId?: string | null;
  toOffice?: string | null;
  toSystemId?: string | null;
  systemId?: string | null;
  title: string;
  body?: string | null;
  href?: string | null;
  important?: boolean | null;
  createdAt: Date | string;
}

/** Is this stored notice addressed to the person, directly or through an office they hold? */
export function addressedTo(n: Pick<StoredRow, 'toPersonId' | 'toOffice' | 'toSystemId'>, personId: string, holdings: Holding[]): boolean {
  if (n.toPersonId) return n.toPersonId === personId;
  if (!n.toOffice) return false;
  return holdings.some(
    (h) => h.via === 'OFFICE' && h.office === n.toOffice && (!n.toSystemId || h.scope === 'CHURCH' || h.systemId === n.toSystemId),
  );
}

/** Seats and conflicts the Church Leader (or an Administrator, for the Leader's own seat) has to act on. */
export function waitingFromAppointments(
  holdings: Holding[],
  units: UnitRec[],
  positions: PositionRec[],
  now: Date,
): Array<Pick<Notice, 'key' | 'title' | 'body' | 'href' | 'rank'>> {
  const isLeader = holdings.some((h) => h.via === 'OFFICE' && h.office === 'CHURCH_LEADER');
  const isAdmin = holdings.some((h) => h.via === 'OFFICE' && h.office === 'ADMINISTRATOR');
  if (!isLeader && !isAdmin) return [];
  const href = `/s/${MAIN}/people/appointments`;
  const out: Array<Pick<Notice, 'key' | 'title' | 'body' | 'href' | 'rank'>> = [];
  const { vacancies, conflicts } = computeVacancies(units, positions, now);
  for (const v of vacancies) {
    if (v.reason !== 'EMPTY') continue;
    // Only the Leader fills ordinary seats; only an Administrator fills the Leader's own.
    if (v.office === 'CHURCH_LEADER' ? !isAdmin : !isLeader) continue;
    out.push({
      key: `vac:${v.unitId}:${v.office}`,
      title: `${v.unitName} needs a ${OFFICE_TITLE[v.office]}`,
      body: 'This seat is empty. Appoint someone.',
      href,
      rank: v.office === 'CHURCH_LEADER' ? 8 : 50,
    });
  }
  if (isLeader) {
    for (const c of conflicts) {
      out.push({
        key: `vac-conflict:${c.unitId}:${c.office}`,
        title: `Two people hold ${OFFICE_TITLE[c.office]} in ${c.unitName}`,
        body: 'Only one may. End one appointment.',
        href,
        rank: 45,
      });
    }
    const admins = countLiveAdministrators(positions, now);
    if (admins < MIN_ADMINISTRATORS) {
      out.push({
        key: 'vac-admins',
        title: `The church has ${admins} Administrators and needs ${MIN_ADMINISTRATORS}`,
        body: 'Appoint another Administrator in Media.',
        href,
        rank: 40,
      });
    }
  }
  return out.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title)).slice(0, MAX_VACANCY_ITEMS);
}

export interface Counts {
  waiting: { total: number; unread: number };
  info: { total: number; unread: number };
  unread: number;
  bySystem: Record<string, number>;
}

export function countNotices(items: Notice[]): Counts {
  const c: Counts = { waiting: { total: 0, unread: 0 }, info: { total: 0, unread: 0 }, unread: 0, bySystem: {} };
  for (const n of items) {
    const bucket = n.kind === 'WAITING_FOR_ME' ? c.waiting : c.info;
    bucket.total++;
    if (!n.read) {
      bucket.unread++;
      c.unread++;
      c.bySystem[n.systemId] = (c.bySystem[n.systemId] ?? 0) + 1;
    }
  }
  return c;
}
