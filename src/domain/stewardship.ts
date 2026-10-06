/**
 * Delivery spine for Programs & Projects: delivery checklist, close-out, health
 * and blockers. Money is NOT kept here: all money lives in Money (Module 5).
 */

export type DeliveryItemKind = 'ACTIVITY' | 'EVENT';

export type DeliveryItemTier = 'REQUIRED' | 'PLANNED' | 'POSSIBLE';

export type DeliveryItemStatus = 'TODO' | 'DONE' | 'WAIVED' | 'CANCELLED';

export interface MissionDeliveryItem {
  id: string;
  kind: DeliveryItemKind;
  tier: DeliveryItemTier;
  title: string;
  status: DeliveryItemStatus;
  eventId?: string;
  activityId?: string;
  ownerPersonId?: string;
  dueDate?: string;
  waiveNote?: string;
  waivedByPersonId?: string;
  waivedAt?: string;
}

export interface MissionCloseout {
  closedAt: string;
  closedByPersonId: string;
  workSummary: string;
  narrative?: string;
  /** Required when force-closing past open delivery / tasks. */
  forceReason?: string;
  /** Frozen people count at close (archive / impact forever). */
  participantsServedSnapshot?: number;
}

export type MissionHealthSnapshot = {
  date: string; // YYYY-MM-DD
  score: number;
  tone: string;
  label: string;
  parts?: {
    schedule: number;
    delivery: number;
    people: number;
  };
};

/** Shared delivery fields hung on Program / ChurchProject. */
export interface MissionStewardship {
  deliveryItems?: MissionDeliveryItem[];
  closeout?: MissionCloseout;
  /** Daily health snapshots (optional; last ~30 kept). */
  healthSnapshots?: MissionHealthSnapshot[];
  /** W4 delivery blockers / risks. */
  blockers?: import('./deliveryRisk').MissionBlocker[];
}

/** Upsert today's health into the record; keep last 30 days. */
export function upsertHealthSnapshot(
  s: MissionStewardship,
  snap: MissionHealthSnapshot,
  keep = 30,
): MissionStewardship {
  const rest = (s.healthSnapshots ?? []).filter((h) => h.date !== snap.date);
  const healthSnapshots = [...rest, snap]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-keep);
  return { ...s, healthSnapshots };
}

export function requiredDeliveryOpen(s?: MissionStewardship): MissionDeliveryItem[] {
  return (s?.deliveryItems ?? []).filter(
    (d) => d.tier === 'REQUIRED' && d.status === 'TODO',
  );
}

export function deliveryReadyToClose(s?: MissionStewardship): boolean {
  return requiredDeliveryOpen(s).length === 0;
}
