import type { AnnouncementItem, AnnouncementOptions, Audience, AudienceKind } from '../api/frontDoorApi';
import { ApiError } from '../api/client';

/** The refusal code the server gave, if any. */
export const errorCode = (e: unknown): string | undefined =>
  e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;

const ERROR_KEYS: Record<string, string> = {
  CANNOT_SEND_TO_AUDIENCE: 'door.announce.err.notAllowed',
  NOT_ALLOWED: 'door.announce.err.notAllowed',
  BAD_AUDIENCE: 'door.announce.err.badAudience',
  BAD_DATES: 'door.announce.err.badDates',
  ALREADY_WITHDRAWN: 'door.announce.err.alreadyDown',
};
export const announceErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

/** The audiences the person may post to, in the order the form lists them. */
export function audienceKinds(o: AnnouncementOptions | undefined): AudienceKind[] {
  if (!o) return [];
  const out: AudienceKind[] = [];
  if (o.wholeChurch) out.push('WHOLE_CHURCH');
  if (o.systems.length > 0) out.push('SYSTEM');
  if (o.wholeChurch && o.offices.length > 0) out.push('OFFICE');
  return out;
}

export const canCompose = (o: AnnouncementOptions | undefined): boolean => audienceKinds(o).length > 0;

/** The audience the server expects, or null while the choice is not complete. */
export function buildAudience(kind: AudienceKind | '', systemId: string, office: string): Audience | null {
  if (kind === 'WHOLE_CHURCH') return { kind };
  if (kind === 'SYSTEM') return systemId ? { kind, systemId } : null;
  if (kind === 'OFFICE') return office ? { kind, office: office as Audience['office'] } : null;
  return null;
}

/** Whether the form can be sent: a real title, a message, and a complete audience. */
export const formReady = (title: string, body: string, audience: Audience | null): boolean =>
  title.trim().length >= 3 && body.trim().length > 0 && audience !== null;

/** The same list with some announcements marked read, so the screen answers at once. */
export function markedRead(items: AnnouncementItem[], ids: string[]): AnnouncementItem[] {
  const set = new Set(ids);
  return items.map((i) => (set.has(i.id) ? { ...i, read: true } : i));
}

export const unreadIds = (items: AnnouncementItem[]): string[] => items.filter((i) => !i.read).map((i) => i.id);

/** "2026-10-31" from an ISO timestamp (the day the post stops showing). */
export const dayOf = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

export type PeriodFilter = 'any' | 'today' | 'week' | 'month';
export const PERIODS: PeriodFilter[] = ['any', 'today', 'week', 'month'];

/** Was this moment within the period, counted back from now? Without a date it is kept. */
export function inPeriod(iso: string | null | undefined, period: PeriodFilter, now: Date = new Date()): boolean {
  if (period === 'any' || !iso) return true;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return true;
  const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
  return now.getTime() - at <= days * 24 * 3600 * 1000;
}

export type AnnounceFilters = { status: 'all' | 'unread' | 'mine'; audience: '' | AudienceKind; period: PeriodFilter };

/** The announcements that pass the chosen status, audience and period. */
export function filterAnnouncements(items: AnnouncementItem[], f: AnnounceFilters, now: Date = new Date()): AnnouncementItem[] {
  return items.filter((a) => (f.status === 'all' || (f.status === 'unread' ? !a.read : a.mine)) && (!f.audience || a.audience.kind === f.audience) && inPeriod(a.publishedAt, f.period, now));
}
