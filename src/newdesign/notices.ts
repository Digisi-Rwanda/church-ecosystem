import type { NoticeItem } from '../api/frontDoorApi';

/** A link is followed only when it stays inside the app. Anything else is shown as plain text. */
export function safeHref(href: string | null | undefined): string | null {
  return href && href.startsWith('/') && !href.startsWith('//') ? href : null;
}

/** "today", "yesterday", or the date, from an ISO timestamp. */
export function dayLabel(iso: string, now: Date = new Date()): { kind: 'today' | 'yesterday' | 'date'; date: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { kind: 'date', date: '' };
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86400000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (days === 0) return { kind: 'today', date };
  if (days === 1) return { kind: 'yesterday', date };
  return { kind: 'date', date };
}

/** The keys of the unread items in a list. */
export const unreadKeys = (items: NoticeItem[]): string[] => items.filter((i) => !i.read).map((i) => i.key);

/** The same list with one item's read state changed, so the screen answers at once. */
export function withRead(items: NoticeItem[], keys: string[], read: boolean): NoticeItem[] {
  const set = new Set(keys);
  return items.map((i) => (set.has(i.key) ? { ...i, read } : i));
}

/** A badge number: nothing at zero, and 99+ beyond. */
export const badge = (n: number): string => (n <= 0 ? '' : n > 99 ? '99+' : String(n));
