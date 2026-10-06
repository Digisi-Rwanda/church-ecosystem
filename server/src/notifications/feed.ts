/**
 * What a person sees in Notifications (slice 1.4).
 *
 * Two sources feed one list:
 *  - stored notices, addressed to the person or to an office they hold (For information,
 *    and anything a later slice stores as Waiting for me);
 *  - things waiting for the person, worked out live from the attention feed and from
 *    empty seats the Church Leader must fill. These resolve by themselves when the
 *    work is done, so they are never stored.
 * Read state is stored per person, so it shows on a second device.
 */
import { prisma } from '../lib/prisma.js';
import { buildAttentionFeed } from '../attention/buildFeed.js';
import { liveHoldings, type AccessData, type DelegationRec, type MembershipRec, type PositionRec } from '../capabilities/engine.js';
import type { UnitRec } from '../lib/appointments.js';
import { INFO_DAYS, MAIN, addressedTo, waitingFromAppointments, type Notice, type StoredRow } from './rules.js';

export { MAIN, countNotices, addressedTo, waitingFromAppointments, type Counts, type Notice } from './rules.js';

export async function loadAccessData(personId?: string): Promise<{ data: AccessData; units: UnitRec[] }> {
  const [positions, memberships, delegations, units] = await Promise.all([
    prisma.position.findMany(),
    prisma.membership.findMany(),
    prisma.delegation.findMany(personId ? { where: { toPersonId: personId } } : undefined),
    prisma.orgUnit.findMany(),
  ]);
  const unitSystem: Record<string, string | null> = {};
  for (const u of units as UnitRec[]) unitSystem[u.id] = u.systemId ?? null;
  return {
    data: {
      positions: positions as PositionRec[],
      memberships: memberships as MembershipRec[],
      delegations: delegations as DelegationRec[],
      unitSystem,
    },
    units: units as UnitRec[],
  };
}

export async function mutedSystemsOf(personId: string): Promise<string[]> {
  const pref = (await prisma.preference.findFirst({ where: { personId } })) as { mutedSystemsJson?: string } | null;
  try {
    const v = JSON.parse(pref?.mutedSystemsJson ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Everything the person should see, newest and most urgent first, with read state. */
export async function loadNotices(personId: string, now = new Date()): Promise<Notice[]> {
  const { data, units } = await loadAccessData(personId);
  const holdings = liveHoldings(personId, data, now);
  const since = new Date(now.getTime() - INFO_DAYS * 24 * 3600 * 1000);
  const [stored, reads, muted, attention] = await Promise.all([
    prisma.notification.findMany({ where: { createdAt: { gte: since } } }) as Promise<StoredRow[]>,
    prisma.notificationRead.findMany({ where: { personId } }) as Promise<Array<{ key: string }>>,
    mutedSystemsOf(personId),
    buildAttentionFeed(personId).catch(() => []),
  ]);
  const read = new Set(reads.map((r) => r.key));
  const items: Notice[] = [];

  for (const n of stored) {
    if (!addressedTo(n, personId, holdings)) continue;
    const kind = n.kind === 'WAITING_FOR_ME' ? 'WAITING_FOR_ME' : 'FOR_INFORMATION';
    const systemId = n.systemId ?? MAIN;
    if (kind === 'FOR_INFORMATION' && !n.important && muted.includes(systemId)) continue;
    items.push({
      key: n.id,
      kind,
      source: 'STORED',
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
      systemId,
      createdAt: new Date(n.createdAt).toISOString(),
      important: !!n.important,
      read: read.has(n.id),
      rank: kind === 'WAITING_FOR_ME' ? 60 : 100,
    });
  }
  for (const a of attention) {
    items.push({
      key: `attn:${a.id}`,
      kind: 'WAITING_FOR_ME',
      source: 'ATTENTION',
      title: a.title,
      body: a.reason,
      // The old app's addresses do not exist in the new design yet; the work screens link them later.
      href: null,
      systemId: MAIN,
      createdAt: a.createdAt ?? now.toISOString(),
      important: true,
      read: read.has(`attn:${a.id}`),
      rank: a.rank,
    });
  }
  for (const w of waitingFromAppointments(holdings, units, data.positions, now)) {
    items.push({
      ...w,
      kind: 'WAITING_FOR_ME',
      source: 'APPOINTMENTS',
      systemId: MAIN,
      createdAt: now.toISOString(),
      important: true,
      read: read.has(w.key),
    });
  }
  return items.sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));
}

