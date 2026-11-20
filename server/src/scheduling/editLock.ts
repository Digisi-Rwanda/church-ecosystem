/**
 * Server-side edit lock for scheduling configuration.
 *
 * WHY THIS EXISTS: configuration edits affect ALL future schedule generation, and there is no draft to
 * isolate them any more. Two people saving at once would silently overwrite each other's intent and could
 * leave the live rules in a state neither of them validated. So edits are SERIALIZED: one holder per system
 * at a time. The lock is advisory for readers (anyone with read access can still look) and mandatory for
 * writers (`saveConfigChange` refuses a write unless the caller holds a live lock).
 *
 * Lifecycle: acquired on entering the config page, released on save-and-leave or leaving, expires after
 * LOCK_TTL_MS without activity (refreshed by every successful save and by the page's heartbeat).
 * One row per system (`ConfigEditLock`, systemId is the primary key). No foreign key to Person, so a deleted
 * person can never wedge a system.
 *
 * Single-tab assumption: the holder is a person, not a browser tab. The same person in two tabs shares one
 * lock, and the first tab to close releases it for both. The 15-minute expiry is the backstop.
 */

import { prisma } from '../lib/prisma.js';

export const LOCK_TTL_MS = 15 * 60 * 1000;

export interface LockHolder { personId: string; name: string | null; since: string; expiresAt: string }

export type AcquireResult =
  | { ok: true; lock: { systemId: string; expiresAt: string } }
  | { ok: false; holder: LockHolder };

async function holderOf(row: { holderPersonId: string; acquiredAt: Date; expiresAt: Date }): Promise<LockHolder> {
  const person = await prisma.person.findUnique({ where: { id: row.holderPersonId }, select: { fullName: true } }).catch(() => null);
  return {
    personId: row.holderPersonId,
    name: (person as { fullName?: string } | null)?.fullName ?? null,
    since: row.acquiredAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Take the lock. Succeeds when nobody holds it, the caller already holds it, or the holder's lock expired. */
export async function acquireEditLock(systemId: string, personId: string, now = new Date()): Promise<AcquireResult> {
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  // Atomic takeover: only matches a row the caller owns or one that has already expired.
  const taken = await prisma.configEditLock.updateMany({
    where: { systemId, OR: [{ holderPersonId: personId }, { expiresAt: { lte: now } }] },
    data: { holderPersonId: personId, acquiredAt: now, refreshedAt: now, expiresAt },
  });
  if (taken.count === 1) return { ok: true, lock: { systemId, expiresAt: expiresAt.toISOString() } };

  const current = await prisma.configEditLock.findUnique({ where: { systemId } });
  if (!current) {
    try {
      await prisma.configEditLock.create({ data: { systemId, holderPersonId: personId, acquiredAt: now, refreshedAt: now, expiresAt } });
      return { ok: true, lock: { systemId, expiresAt: expiresAt.toISOString() } };
    } catch (error) {
      // Lost a race on the primary key: someone else created the row between our read and write.
      if (!(error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002')) throw error;
      const winner = await prisma.configEditLock.findUnique({ where: { systemId } });
      if (!winner) throw error;
      return winner.holderPersonId === personId ? { ok: true, lock: { systemId, expiresAt: winner.expiresAt.toISOString() } } : { ok: false, holder: await holderOf(winner) };
    }
  }
  return { ok: false, holder: await holderOf(current) };
}

/** Push the expiry out. Fails (false) when the caller no longer holds a live lock. */
export async function refreshEditLock(systemId: string, personId: string, now = new Date()): Promise<boolean> {
  const done = await prisma.configEditLock.updateMany({
    where: { systemId, holderPersonId: personId, expiresAt: { gt: now } },
    data: { refreshedAt: now, expiresAt: new Date(now.getTime() + LOCK_TTL_MS) },
  });
  return done.count === 1;
}

/** Release the lock. Only the holder can; anyone else's call is a no-op that reports false. */
export async function releaseEditLock(systemId: string, personId: string): Promise<boolean> {
  const done = await prisma.configEditLock.deleteMany({ where: { systemId, holderPersonId: personId } });
  return done.count === 1;
}

/**
 * Does `personId` hold a live lock? When not, `holder` is whoever blocks them (null when nobody holds one,
 * or the previous holder's lock has expired).
 */
export async function checkEditLock(systemId: string, personId: string, now = new Date()): Promise<{ held: boolean; holder: LockHolder | null }> {
  const row = await prisma.configEditLock.findUnique({ where: { systemId } });
  if (!row || row.expiresAt <= now) return { held: false, holder: null };
  if (row.holderPersonId === personId) return { held: true, holder: null };
  return { held: false, holder: await holderOf(row) };
}
