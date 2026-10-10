/**
 * Announcements (slice 1.5): who may post to an audience and who sees a post.
 * Pure: no database in here, so every rule is tested on its own.
 *
 * Posting needs the Send letter (S in Governance) and Write in Communication in the system
 * the audience belongs to. A president or secretary holds those only in their own system, so
 * a team leader can never post to the whole church; the Church Leader and the Church
 * Secretary hold them everywhere. Seeing a post follows the letters too: a system's
 * announcement reaches everyone who holds any Communication letter in that system.
 */
import { lettersInSystem, liveHoldings, type AccessData } from '../capabilities/engine.js';
import type { OfficeCode } from '../shared/vocabulary.js';

export const MAIN = 'sys-main';
export const AUDIENCE_KINDS = ['WHOLE_CHURCH', 'SYSTEM', 'OFFICE'] as const;
export type AudienceKind = (typeof AUDIENCE_KINDS)[number];

export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audienceKind: string;
  audienceSystemId?: string | null;
  audienceOffice?: string | null;
  systemId: string;
  authorId: string;
  status: string;
  publishedAt: Date | string;
  expiresAt?: Date | string | null;
  withdrawnAt?: Date | string | null;
  withdrawnReason?: string | null;
  editedAt?: Date | string | null;
}

export interface Audience {
  kind: AudienceKind;
  systemId?: string | null;
  office?: string | null;
}

/** The system whose letters decide who may post to this audience. */
export const targetSystem = (a: { kind: string; systemId?: string | null }): string =>
  a.kind === 'SYSTEM' && a.systemId ? a.systemId : MAIN;

/** Posting needs Send (Governance) and Write (Communication) in the target system. */
export function canSendIn(personId: string, systemId: string, data: AccessData, now = new Date()): boolean {
  const l = lettersInSystem(personId, systemId, data, now);
  return l.GOVERNANCE.includes('S') && l.COMMUNICATION.includes('W');
}

export const canPostTo = (personId: string, a: Audience, data: AccessData, now = new Date()): boolean =>
  canSendIn(personId, targetSystem(a), data, now);

const day = 24 * 3600 * 1000;
const time = (v: Date | string | null | undefined): number | null => {
  if (!v) return null;
  const n = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(n) ? null : n;
};

/** Published, started, and not past its last day (an end date means the whole day). */
export function isOpen(a: AnnouncementRow, now = new Date()): boolean {
  if (a.status !== 'PUBLISHED') return false;
  const start = time(a.publishedAt);
  if (start !== null && start > now.getTime()) return false;
  const end = time(a.expiresAt);
  // The expiry is a calendar day: the post stays up through the end of it (UTC).
  if (end !== null && Math.floor(end / day) * day + day - 1 < now.getTime()) return false;
  return true;
}

/** Does this announcement reach this person? The author always sees their own. */
export function reaches(a: AnnouncementRow, personId: string, data: AccessData, now = new Date()): boolean {
  if (a.authorId === personId) return true;
  // The whole church means everyone who has a place in the main church (members and office holders).
  if (a.audienceKind === 'WHOLE_CHURCH') return lettersInSystem(personId, MAIN, data, now).COMMUNICATION.length > 0;
  if (a.audienceKind === 'SYSTEM') {
    if (!a.audienceSystemId) return false;
    return lettersInSystem(personId, a.audienceSystemId, data, now).COMMUNICATION.length > 0;
  }
  if (a.audienceKind === 'OFFICE') {
    return liveHoldings(personId, data, now).some((h) => h.via === 'OFFICE' && h.office === (a.audienceOffice as OfficeCode));
  }
  return false;
}

/** Who may take a post down: its author, or anyone who may post to the same audience. */
export function canWithdraw(a: AnnouncementRow, personId: string, data: AccessData, now = new Date()): boolean {
  if (a.status !== 'PUBLISHED') return false;
  return a.authorId === personId || canSendIn(personId, a.systemId, data, now);
}

/** The key a person's read mark is stored under (the notification read table is shared). */
export const readKey = (id: string) => `ann:${id}`;
