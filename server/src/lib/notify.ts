/**
 * Writing notifications (slice 1.4). One function every part of the server uses, so
 * every notice has the same shape and the same duplicate guard.
 */
import type { NotificationKind } from '../shared/vocabulary.js';

export interface NotifyInput {
  kind: NotificationKind;
  /** A person, or an office (every live holder of it), never both. */
  toPersonId?: string | null;
  toOffice?: string | null;
  /** Narrows an office address to the holders in one system. */
  toSystemId?: string | null;
  systemId?: string | null;
  title: string;
  body?: string | null;
  href?: string | null;
  /** The same sourceKey never notifies the same address twice. */
  sourceKey?: string | null;
  /** Important notices ignore a person's muted systems. */
  important?: boolean;
}

export interface NotifyDb {
  notification: {
    findFirst(args: any): Promise<unknown>;
    create(args: any): Promise<unknown>;
  };
}

/** Returns true when a notice was written, false when it was a duplicate or badly addressed. */
export async function notify(db: NotifyDb, input: NotifyInput): Promise<boolean> {
  const person = input.toPersonId ?? null;
  const office = input.toOffice ?? null;
  if ((person === null) === (office === null)) return false; // exactly one address
  if (input.sourceKey) {
    const dup = await db.notification.findFirst({
      where: { sourceKey: input.sourceKey, toPersonId: person, toOffice: office },
    });
    if (dup) return false;
  }
  await db.notification.create({
    data: {
      kind: input.kind,
      toPersonId: person,
      toOffice: office,
      toSystemId: input.toSystemId ?? null,
      systemId: input.systemId ?? null,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      href: input.href ?? null,
      sourceKey: input.sourceKey ?? null,
      important: input.important ?? false,
    },
  });
  return true;
}

/** Notifying must never break the action that caused it. */
export async function notifySafely(db: NotifyDb, input: NotifyInput): Promise<void> {
  try {
    await notify(db, input);
  } catch (err) {
    console.warn('notification skipped:', err instanceof Error ? err.message : err);
  }
}
